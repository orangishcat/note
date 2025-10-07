from appwrite.exception import AppwriteException
from flask import Blueprint, abort, g
from loguru import logger

from .util import *
from .scoring import scoring_bp
from .scores import score_bp

admin_client = get_client().set_key(os.environ["APPWRITE_API_KEY"])
admin_account = Account(admin_client)

api_bp = Blueprint("api", __name__, url_prefix="/api")
needs_login = Blueprint("needs_login", __name__)
api_bp.register_blueprint(needs_login)


def is_logged_in():
    try:
        g.account = get_user_account().get()
    except Exception as e:
        logger.debug("Not logged in: {}", e)
        g.account = None
    return g.account is not None


@needs_login.before_request
def check_login():
    if not is_logged_in():
        abort(401, "You must be logged in to access this resource")


@api_bp.errorhandler(AppwriteException)
def handle_unauthorized(e):
    if "User (role: guests) missing scope (account)" in str(e):
        return {"error": str(e), "needs_login": True}, 401
    if "with the requested ID could not be found." in str(e):
        return {"error": str(e), "not_found": True}, 404
    raise e


def logged_in():
    def wrapper(func, *args, **kwargs):
        if not is_logged_in():
            return {"error": "You must be logged in to access this resource"}, 401
        return func(*args, **kwargs)

    return wrapper


@api_bp.route("/test", methods=["GET"])
def test():
    return {"message": "Hello World!"}


needs_login.register_blueprint(scoring_bp)
needs_login.register_blueprint(score_bp)
