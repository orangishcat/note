from flask import Blueprint

scoring_bp = Blueprint("score_scoring", __name__, url_prefix="/score")

from . import audio  # noqa: F401  # register scoring routes
from . import recording  # noqa: F401  # register recording routes

__all__ = ["scoring_bp"]
