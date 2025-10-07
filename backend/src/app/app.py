import os
import sys

from flask import Flask, send_file
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_socketio import SocketIO

from . import limit

if debug := os.getenv("DEBUG", "True") == "True":
    from dotenv import load_dotenv

    load_dotenv()

from .api import *

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ["SECRET_KEY"]
app.config["JWT_TOKEN_LOCATION"] = ["cookies"]
app.config["JWT_COOKIE_SECURE"] = not debug
app.config["JWT_COOKIE_CSRF_PROTECT"] = True
app.register_blueprint(api_bp)


limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://",
    strategy="fixed-window",
)


@app.after_request
def apply_specific_limits(response):
    return response


@app.route("/static/<file>", methods=["GET"])
def get_static(file):
    return send_file(os.path.join(os.getcwd(), "static", file))


jwt = JWTManager(app)
socketio = SocketIO(app, cors_allowed_origins="*")
limit(limiter)


def main():
    logger.remove()
    logger.add(
        sys.stdout,
        format=(
            "<green>{time:HH:mm:ss}</green> | "
            "<white>{level.name:<5.5}</white>| "
            "<cyan>{function:.12}</cyan>:<yellow>{line:<4}</yellow>\t| "
            "{message}"
        ),
        level="DEBUG" if debug else "INFO",
    )
    logger.info(app.url_map)

    socketio.run(
        app,
        host="127.0.0.1"
        if os.getenv("PRODUCTION") != "True"
        else os.getenv("PROD_HOST"),
        port=5000 if os.getenv("PRODUCTION") != "True" else os.getenv("PORT", 8080),
        debug=debug,
        allow_unsafe_werkzeug=True,
    )


if __name__ == "__main__":
    main()
