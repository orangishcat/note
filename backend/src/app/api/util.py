import os
from collections import defaultdict

from appwrite.client import Client
from appwrite.services.account import Account
from flask import request

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
recordings_collection = os.environ.get("RECORDINGS_COLLECTION_ID")


def get_client():
    client = Client()
    client.set_endpoint("https://cloud.appwrite.io/v1")
    client.set_project(os.environ["APPWRITE_PROJECT_ID"])
    return client


def _get_jwt(token: str | None) -> str | None:
    """Extract bearer token from Authorization header."""
    if token and token.startswith("Bearer "):
        return token.split(" ", 1)[1]
    return token


def get_user_client(jwt: str | None = None) -> Client:
    """Return an Appwrite client authorized with the given JWT."""
    if jwt is None:
        jwt = _get_jwt(request.headers.get("X-Appwrite-JWT"))
    client = get_client().set_jwt(jwt)
    return client


def get_user_account(jwt: str | None = None) -> Account:
    return Account(get_user_client(jwt))


names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def pitch_name(midi_pitch: int) -> str:
    octave = midi_pitch // 12 - 1
    name = names[midi_pitch % 12]
    return f"{name}{octave}"
