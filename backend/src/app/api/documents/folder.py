from app.api.util import database, folder_collection, get_user_client, score_collection
from appwrite.permission import Permission
from appwrite.role import Role
from appwrite.services.databases import Databases
from flask import Blueprint, g, request

folder = Blueprint("folder", __name__, url_prefix="/folder")


@folder.route("/list", methods=["GET"])
def list_folder():
    # Get folders from Appwrite
    db = Databases(get_user_client())
    folders = db.list_documents(database, folder_collection)
    return folders["documents"], 200


@folder.route("/create", methods=["POST"])
def create_folder():
    data = request.json
    if not data or "name" not in data:
        return {"error": "Folder name is required"}, 400

    folder_name = data["name"]

    # Create folder document in Appwrite
    db = Databases(get_user_client())
    user = Role.user(user_id := g.account["$id"])

    folder_doc = db.create_document(
        database_id=database,
        collection_id=score_collection,
        document_id="unique()",
        data={
            "name": folder_name,
            "user_id": user_id,
        },
        permissions=[
            Permission.read(user),
            Permission.write(user),
            Permission.delete(user),
        ],
    )

    return {"success": True, "folder": folder_doc["$id"]}, 201
