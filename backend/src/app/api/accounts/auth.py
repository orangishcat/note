import os
from datetime import datetime, timedelta, timezone
from traceback import print_exc

from flask import jsonify, make_response, request
from loguru import logger

from .. import admin_account, get_user_account
from . import acc


def cookie_settings():
    return {
        "httponly": True,
        "secure": os.environ.get("DEBUG") != "True",
        "samesite": "Lax",
    }


@acc.route("/login", methods=["POST"])
def login():
    email = request.json.get("email")
    password = request.json.get("password")
    if not email or not password:
        return {"error": "email and password are required"}, 400
    try:
        session_data = admin_account.create_email_password_session(email, password)

        # Convert the numeric timestamp to a datetime
        expires_dt = datetime.fromisoformat(session_data["expire"])
        logger.info("Expires:", expires_dt.isoformat())
        user = get_user_account(session_data["secret"]).get()

        # Make a JSON response
        resp = make_response(
            {"user_id": user["$id"], "username": user["name"], "email": user["email"]}
        )
        resp.set_cookie(
            key="appwrite-session",
            value=session_data["secret"],
            expires=expires_dt,
            **cookie_settings(),
        )
        resp.set_cookie(
            key="appwrite-session-id",
            value=session_data["$id"],
            expires=expires_dt,
            **cookie_settings(),
        )
        return resp, 200
    except Exception as e:
        error = str(e)
        if "Password must be between" in error:
            return {"error": "invalid credentials"}, 401
        if "Invalid credentials." in error:
            return {"error": "invalid credentials"}, 401

        print_exc()
        return {"error": error}, 400


@acc.route("/user-data", methods=["GET"])
def check():
    if not (secret := request.cookies.get("appwrite-session")):
        return jsonify(None), 200
    try:
        user = get_user_account(secret).get()
        return {
            "user_id": user["$id"],
            "username": user["name"],
            "email": user["email"],
        }
    except Exception as e:
        print_exc()
        return {"error": str(e) + " (try clearing cookies)"}, 400


@acc.route("/logout", methods=["POST"])
def logout():
    if not (cookie := request.cookies.get("appwrite-session-id")):
        return jsonify(None), 200
    get_user_account().delete_session(cookie)
    resp = make_response({"message": "Logged out successfully"}, 200)

    # Set the cookies to expire in the past to delete them
    expire_time = datetime.now(tz=timezone.utc) - timedelta(seconds=5)
    resp.set_cookie("appwrite-session", "", expires=expire_time, **cookie_settings())
    resp.set_cookie("appwrite-session-id", "", expires=expire_time, **cookie_settings())
    return resp


@acc.route("/reset-password", methods=["POST"])
def reset_password():
    email = request.json.get("email")
    if not email:
        return {"error": "Email is required"}, 400

    try:
        # Use Appwrite's password recovery functionality
        # The URL should point to your frontend's password reset page
        reset_url = (
            os.environ.get("FRONTEND_URL", "https://localhost:3000") + "/reset-password"
        )

        # Create password recovery
        admin_account.create_recovery(email, reset_url)

        return {"message": "Password reset email sent successfully"}, 200
    except Exception as e:
        error = str(e)
        print_exc()

        # Handle specific Appwrite errors
        if "User with the requested ID could not be found" in error:
            return {"error": "No account found with this email address"}, 404
        if "Invalid email" in error:
            return {"error": "Invalid email address"}, 400

        return {"error": "Failed to send reset email. Please try again."}, 500
