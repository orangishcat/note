from base64 import b64encode
from functools import lru_cache

from app.api.util import *
from appwrite.services.databases import Databases
from appwrite.services.storage import Storage
from flask import Response, g, send_file, session

from . import score_bp


def get_file_ext(mimetype):
    mimetype_to_extension = {
        "application/zip": ".zip",
        "application/musicxml": ".musicxml",
        "image/png": ".png",
        "image/jpg": ".jpg",
    }

    return mimetype_to_extension.get(mimetype, None)


@score_bp.route("/list", methods=["GET"])
def list_scores():
    documents = Databases(get_user_client()).list_documents(database, score_collection)[
        "documents"
    ]
    return [
        {
            "id": doc["$id"],
            "title": doc["name"],
            "subtitle": doc["subtitle"],
            "preview_id": doc["preview_id"],
            "is_mxl": "musicxml" in doc["mime_type"],
            "upload_date": doc["$createdAt"],
            "starred": g.account["$id"] in doc["starred_users"],
        }
        for doc in documents
    ]


@score_bp.route("/preview/<file_id>", methods=["GET"])
def preview(file_id):
    if file_id == "null":
        return send_file(os.path.join(os.getcwd(), "static/preview.png"))
    data_view = Storage(get_user_client()).get_file_view(images_bucket, file_id)
    response = Response(data_view)
    response.headers["Content-Type"] = "image/png"
    return response


@score_bp.route("/download/<doc_id>", methods=["GET"])
@lru_cache(maxsize=16)
def download(doc_id):
    # Check for debug file first if debug mode is enabled
    if os.environ.get("DEBUG") == "True":
        debug_file = f"scores/{doc_id}"
        if os.path.exists(debug_file):
            with open(debug_file, "rb") as f:
                data = f.read()
            response = Response(data)
            response.headers["Content-Type"] = "application/octet-stream"
            response.headers["Content-Disposition"] = f'attachment; filename="{doc_id}"'
            return response

    # Fall back to original logic
    doc = Databases(get_user_client()).get_document(database, score_collection, doc_id)
    if not doc:
        return Response(status=404)

    file_id = doc["file_id"]
    session["last_file_id"] = file_id
    data_download = Storage(get_user_client()).get_file_download(scores_bucket, file_id)

    response = Response(data_download)
    response.headers["Content-Type"] = doc["mime_type"]
    response.headers["Content-Disposition"] = (
        f'attachment; filename="{doc["name"]}{get_file_ext(doc["mime_type"])}"'
    )
    return response


@score_bp.route("/as-base64/<file_id>", methods=["GET"])
def as_base64(file_id):
    session["last_file_id"] = file_id
    file_view = Storage(get_user_client()).get_file_view(scores_bucket, file_id)
    return b64encode(file_view).decode()


@score_bp.route("/notes/<file_id>", methods=["GET"])
def get_notes(file_id):
    # Check for debug file first if debug mode is enabled
    if os.environ.get("DEBUG") == "True":
        debug_file = f"scores/{file_id}.pb"
        if os.path.exists(debug_file):
            with open(debug_file, "rb") as f:
                bytestr = f.read()
            return Response(bytestr, mimetype="application/protobuf")

    # Fall back to original logic
    bytestr = Storage(get_user_client()).get_file_view(misc_bucket, file_id)
    return Response(bytestr, mimetype="application/protobuf")


@score_bp.route("/data/<file_id>", methods=["GET"])
def file_data(file_id):
    doc = Databases(get_user_client()).get_document(database, score_collection, file_id)
    return {
        "id": doc["$id"],
        "file_id": doc["file_id"],
        "title": doc["name"],
        "subtitle": doc["subtitle"],
        "upload_date": doc["$createdAt"],
        "notes_id": doc.get("notes_id", []),
        "is_mxl": "musicxml" in doc["mime_type"],
        "starred": g.account["$id"] in doc["starred_users"],
    }
