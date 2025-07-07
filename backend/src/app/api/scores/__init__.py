from flask import Blueprint
from .create_score import *

score_bp = Blueprint("score", __name__, url_prefix="/score")
