from flask import Blueprint

acc = Blueprint("accounts", __name__, url_prefix="/account")

from .auth import *
from .signup import *
