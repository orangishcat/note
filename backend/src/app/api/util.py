import os
from collections import defaultdict

from appwrite.client import Client
from appwrite.services.account import Account
from flask import request

# Global cache where each session key maps to a list of tuples.
# Each tuple is: (temp_filepath, upload_time, type, original_filename, content_type)
data = defaultdict(list)
score_file_types = ["mxl", "musicxml", "xml", "mxmls", "pdf", "png", "jpg", "jpeg"]
audio_file_types = ["mp4", "mp3", "mov", "wav", "ogg", "avi", "m4a"]
allowed_extensions = score_file_types + audio_file_types

database = os.environ["DATABASE_ID"]
scores_bucket = os.environ["SCORES_BUCKET_ID"]
images_bucket = os.environ["IMAGES_BUCKET_ID"]
misc_bucket = os.environ["FILES_BUCKET_ID"]
score_collection = os.environ["SCORES_COLLECTION_ID"]
folder_collection = os.environ["FOLDERS_COLLECTION_ID"]


def get_client():
    client = Client()
    client.set_endpoint("https://cloud.appwrite.io/v1")
    client.set_project(os.environ["PROJECT_ID"])
    return client


def _validate_secret(secret):
    if secret is None:
        secret = request.cookies.get("appwrite-session")
    return secret


def get_user_client(secret=None) -> Client:
    secret = _validate_secret(secret)
    return get_client().set_session(secret)


def get_user_account(secret=None) -> Account:
    secret = _validate_secret(secret)
    return Account(get_user_client(secret))
