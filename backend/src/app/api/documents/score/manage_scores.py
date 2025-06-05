from app.api.util import *
from appwrite.services.databases import Databases
from appwrite.services.storage import Storage
from flask import g

from . import score_bp


@score_bp.route("/delete/<file_id>", methods=["DELETE"])
def delete(file_id):
    db = Databases(get_user_client())
    storage = Storage(get_user_client())
    doc = db.get_document(database, score_collection, file_id)

    if p := doc.get("preview_id"):
        storage.delete_file(images_bucket, p)
    if p := doc.get("audio_file_id"):
        storage.delete_file(misc_bucket, p)

    storage.delete_file(scores_bucket, doc["file_id"])
    db.delete_document(database, score_collection, file_id)
    return {"success": True}, 200


@score_bp.route("/update/<file_id>", methods=["POST"])
def update(file_id):
    update_data = {k: v for k, v in request.json.items() if k in ["name", "subtitle"]}
    if not update_data:
        return {"error": "No scores provided"}, 400
    Databases(get_user_client()).update_document(
        database, score_collection, file_id, update_data
    )
    return {"success": True}, 200


@score_bp.route("/star/<file_id>", methods=["POST"])
def star(file_id):
    doc = Databases(get_user_client()).get_document(database, score_collection, file_id)
    k = "starred_users"
    if k not in doc:
        doc[k] = []

    if request.json["starred"]:
        doc[k].append(g.account["$id"])
    elif g.account["$id"] in doc[k]:
        doc[k].remove(g.account["$id"])

    Databases(get_user_client()).update_document(
        database, score_collection, file_id, {k: doc[k]}
    )
    return {"success": True}, 200
