from flask import Blueprint

score_bp = Blueprint("score", __name__, url_prefix="/score")

from .create_score import *
from .get_score import *
from .manage_scores import *
