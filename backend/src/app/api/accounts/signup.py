import os

from appwrite.exception import AppwriteException
from appwrite.id import ID
from flask import request
from loguru import logger

from .. import admin_account
from . import acc

database = os.environ["DATABASE_ID"]
user_storage = os.environ["USERS_COLLECTION_ID"]


@acc.route("/verification-code", methods=["POST"])
def verification_code():
    """
    Sends a verification code to the provided email address.
    """
    admin_account.create_verification("/verify")


@acc.route("/signup", methods=["POST"])
def signup():
    """
    Endpoint to handle user registration.
    Expects JSON scores with 'email', 'password', and optionally 'name'.
    """
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")
    name = data.get("username")

    if not name:
        return {"error": "Username is required."}, 400

    if not email or not password:
        return {"error": "Email and password are required."}, 400

    try:
        # Create a new user account
        user = admin_account.create(
            user_id=ID.unique(), email=email, password=password, name=name
        )
        return {"message": "User registered successfully.", "user_id": user["$id"]}, 201
    except AppwriteException as e:
        logger.error(e.message, e.code)
        return {"error": e.message}, e.code
