import asyncio
import io
import zipfile
from traceback import print_exc

from ..util import *
from appwrite.input_file import InputFile
from appwrite.permission import Permission
from appwrite.services.databases import Databases
from flask import g, session
from loguru import logger

from .run_models import process_models


def split_files(file_data):
    audio_files = []
    score_files = []
    for entry in file_data:
        ext = entry[3].rsplit(".", 1)[-1].lower() if "." in entry[3] else ""
        if ext in audio_file_types:
            audio_files.append(entry)
        else:
            score_files.append(entry)
    return audio_files, score_files


def apply_ref_order(score_files, ref_order):
    order_map = {filename: index for index, filename in enumerate(ref_order)}
    score_files.sort(key=lambda entry: order_map.get(entry[3], float("inf")))


def process_score_files(score_files):
    if not score_files:
        return None, None, None
    if len(score_files) > 1:
        score_bytes = create_zip([(entry[0], entry[3]) for entry in score_files])
        score_filename = f"{session.get('score_doc_id', 'document')}.zip"
        score_mimetype = "application/zip"
    else:
        entry = score_files[0]
        with open(entry[0], "rb") as f:
            score_bytes = f.read()
        score_filename = entry[3]
        score_mimetype = entry[4]
    return score_bytes, score_filename, score_mimetype


def upload_audio_files(audio_files, storage, user):
    audio_file_ids = []
    if not audio_files:
        return audio_file_ids
    entry = audio_files[0]
    with open(entry[0], "rb") as f:
        audio_bytes = f.read()
    result = storage.create_file(
        bucket_id=misc_bucket,
        file_id="unique()",
        file=InputFile.from_bytes(audio_bytes, entry[3], entry[4]),
        permissions=[
            Permission.read(user),
            Permission.write(user),
            Permission.delete(user),
        ],
    )
    audio_file_ids.append(result["$id"])
    return audio_file_ids


def upload_score_file(score_bytes, score_filename, score_mimetype, storage, user):
    if score_bytes is None:
        return None

    logger.info(f"File size: {len(score_bytes) / 1024 / 1024:.2f} MB")
    result = storage.create_file(
        bucket_id=scores_bucket,
        file_id="unique()",
        file=InputFile.from_bytes(score_bytes, score_filename, score_mimetype),
        permissions=[
            Permission.read(user),
            Permission.write(user),
            Permission.delete(user),
        ],
    )
    return result["$id"]


def create_score_document(
    score_file_id, audio_file_ids, mimetype, title, subtitle, user
):
    db = Databases(get_user_client())
    document_data = {
        "user_id": g.account["$id"],
        "name": title,
        "subtitle": subtitle,
        "type": mimetype,
    }
    if score_file_id:
        document_data["file_id"] = score_file_id
    if audio_file_ids:
        document_data["audio_file_id"] = audio_file_ids[0]
    return db.create_document(
        database_id=database,
        collection_id=score_collection,
        document_id="unique()",
        data=document_data,
        permissions=[
            Permission.read(user),
            Permission.write(user),
            Permission.delete(user),
        ],
    )


def create_zip(files):
    """
    Creates a ZIP file containing all files in the given list.
    Each element in files is a tuple: (file_path, original_filename)
    """
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zipf:
        for i, (file_path, original_filename) in enumerate(files):
            with open(file_path, "rb") as f:
                file_data = f.read()
            zipf.writestr(original_filename, file_data)
    zip_buffer.seek(0)
    return zip_buffer.getvalue()


def run_models(score_files, cookie, storage, score_filename, user, audio_files=None):
    """
    This function processes both models, first Transkun then OEMER
    """
    if audio_files is None:
        audio_files = []

    try:
        # Run the async functions using asyncio.run
        asyncio.run(
            process_models(score_files, audio_files, score_filename, storage, user)
        )
    except Exception as ex:
        logger.info("Error running models:", ex)
        print_exc()
    finally:
        # Clean up: remove temporary files and clear the cache.
        for entry in data.get(cookie, []):
            try:
                os.remove(entry[0])
            except Exception as e:
                logger.info(f"Error deleting temporary file {entry[0]}: {e}")
        if cookie in data:
            del data[cookie]
