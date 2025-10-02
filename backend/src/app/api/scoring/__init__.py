from flask import Blueprint

scoring_bp = Blueprint("score_scoring", __name__, url_prefix="/score")

from . import audio
from . import recording

__all__ = ["scoring_bp"]
