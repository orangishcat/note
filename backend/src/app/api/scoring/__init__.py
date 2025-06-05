from flask import Blueprint

audio = Blueprint("audio", __name__, url_prefix="/audio")

from .audio_processing import *
