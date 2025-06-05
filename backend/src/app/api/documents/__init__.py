from .folder import *
from .score import *

documents = Blueprint("documents", __name__)

documents.register_blueprint(folder)
documents.register_blueprint(score_bp)
