import atexit
import shutil
import tempfile
import uuid
from datetime import datetime, timedelta
from threading import Thread
from time import sleep

from appwrite.role import Role
from appwrite.services.storage import Storage
from flask import Response
from werkzeug.utils import secure_filename

from ...rendering import score_preview
from . import score_bp
from .process_scores import *


TEMP_UPLOAD_FOLDER = tempfile.mkdtemp()


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in allowed_extensions


@score_bp.route("/cancel-upload", methods=["POST"])
def cancel_upload():
    file_name = request.form.get("file_name")
    found = False
    session_files = data.get(request.cookies["appwrite-session"], [])
    for entry in session_files:
        if entry[3] == file_name:
            try:
                os.remove(entry[0])
            except Exception as e:
                logger.error(f"Error deleting temporary file {entry[0]}: {e}")
            session_files.remove(entry)
            found = True
            break
    return {"success": found}


@score_bp.route("/download/<score_id>", methods=["GET"])
def download_score(score_id):
    """Download a music XML file in binary format."""
    try:
        storage = Storage(get_user_client())

        file_bytes = storage.get_file_view(scores_bucket, score_id)

        file_info = storage.get_file(scores_bucket, score_id)
        filename = file_info.get("name", "score.xml")

        if filename.lower().endswith((".mxl", ".zip")):
            try:
                with zipfile.ZipFile(io.BytesIO(file_bytes), "r") as zip_file:
                    xml_files = [f for f in zip_file.namelist() if f.endswith(".xml")]
                    if xml_files:
                        xml_content = zip_file.read(xml_files[0])
                        return Response(
                            xml_content,
                            mimetype="application/xml",
                            headers={
                                "Content-Disposition": f'attachment; filename="{score_id}.xml"',
                                "Cache-Control": "no-cache, no-store, must-revalidate",
                                "Pragma": "no-cache",
                                "Expires": "0",
                            },
                        )
                    else:
                        return {"error": "No XML file found in compressed archive"}, 400
            except zipfile.BadZipFile:
                return {"error": "Invalid compressed file format"}, 400
        else:
            return Response(
                file_bytes,
                mimetype="application/xml",
                headers={
                    "Content-Disposition": f'attachment; filename="{filename}"',
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                },
            )

    except Exception as e:
        logger.error(f"Error downloading score {score_id}: {e}")
        return {"error": "File not found or access denied"}, 404


@score_bp.route("/upload", methods=["POST"])
def upload():
    file = request.files.get("file")
    if not file:
        return {"error": "No file provided"}, 400

    if not allowed_file(file.filename):
        return {"error": "File type not allowed"}, 400

    original_filename = secure_filename(file.filename)

    unique_filename = f"{uuid.uuid4().hex}_{original_filename}"
    temp_filepath = os.path.join(TEMP_UPLOAD_FOLDER, unique_filename)

    file.save(temp_filepath)

    logger.info("Data cache length:", sum(len(arr) for arr in data.values()))

    return {"success": True}, 201


def process_document(
    file_bytes, score_files, filename, doc_id, db: Databases, storage: Storage, user
):
    """
    Process the document to generate a preview image
    """
    if not file_bytes:
        raise Exception("No file provided")

    preview_bytes = file_bytes
    preview_filename = filename
    if len(score_files) > 1:
        with open(score_files[0][0], "rb") as f:
            preview_bytes = f.read()
            preview_filename = score_files[0][3]

    preview_image_bytes, filename = score_preview(preview_bytes, preview_filename)
    result = storage.create_file(
        bucket_id=os.environ["IMAGES_BUCKET"],
        file_id="unique()",
        file=InputFile.from_bytes(preview_image_bytes, filename, "image/png"),
        permissions=[
            Permission.read(user),
            Permission.write(user),
            Permission.delete(user),
        ],
    )

    db.update_document(
        database_id=os.environ["DATABASE_ID"],
        collection_id=os.environ["COLLECTION_ID"],
        document_id=doc_id,
        data={"preview_id": result["$id"]},
    )


@score_bp.route("/confirm-upload", methods=["POST"])
def confirm_upload():
    storage = Storage(get_user_client())
    file_data = data.get(request.cookies["appwrite-session"])

    if not file_data:
        return {"error": "No file provided"}, 400
    if not request.json.get("title"):
        return {"error": "No title provided"}, 400
    if not request.json.get("ref_order"):
        return {"error": "No ref order provided"}, 400

    user = Role.user(g.account["$id"])
    audio_files, score_files = split_files(file_data)

    apply_ref_order(score_files, request.json["ref_order"])

    score_bytes, score_filename, score_mimetype = process_score_files(score_files)
    audio_file_ids = upload_audio_files(audio_files, storage, user)
    score_file_id = upload_score_file(
        score_bytes, score_filename, score_mimetype, storage, user
    )

    ext = score_files[0][3].split(".")[-1]
    db_result = create_score_document(
        score_file_id,
        audio_file_ids,
        "application/musicxml" if ext == "mxl" else f"image/{ext}",
        request.json["title"],
        request.json["subtitle"],
        user,
    )

    Thread(
        name=f"Process {score_filename}",
        target=process_document,
        args=(
            score_bytes,
            score_files,
            score_filename,
            db_result["$id"],
            Databases(get_user_client()),
            storage,
            user,
        ),
        daemon=True,
    ).start()

    Thread(
        name="Process Models",
        target=run_models,
        args=(
            score_files,
            audio_files,
            request.cookies["appwrite-session"],
            storage,
            Databases(get_user_client()),
            db_result["$id"],
            score_filename,
            user,
        ),
        daemon=True,
    ).start()

    return {"success": True}, 201


def cleanup_temp(interval=15 * 60):
    """Periodically clean up temporary files older than 15 minutes."""
    while True:
        current_time = datetime.now()
        for cookie in list(data.keys()):
            new_list = []
            for entry in data[cookie]:
                temp_filepath, file_time, file_type, original_filename, content_type = (
                    entry
                )
                if current_time - file_time > timedelta(minutes=15):
                    try:
                        os.remove(temp_filepath)
                    except Exception as e:
                        logger.error(f"Error deleting file {temp_filepath}: {e}")
                else:
                    new_list.append(entry)
            if new_list:
                data[cookie] = new_list
            else:
                del data[cookie]
        sleep(interval)


ran = False
if not ran:
    ran = True
    cleanup_thread = Thread(target=cleanup_temp, daemon=True)
    cleanup_thread.start()
    atexit.register(lambda: shutil.rmtree(TEMP_UPLOAD_FOLDER))
