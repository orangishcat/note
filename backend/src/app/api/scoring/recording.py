from flask import request
from appwrite.services.storage import Storage
from google.protobuf.message import DecodeError
from loguru import logger
from ... import Recording
from .. import get_user_client, misc_bucket
from . import scoring_bp


@scoring_bp.route("/process-recording/<rec_id>", methods=["POST"])
def process_recording(rec_id):
    score_id = request.args.get("score")
    if not score_id:
        return {"error": "score id required"}, 400

    client = get_user_client()
    storage = Storage(client)
    rec_bytes = storage.get_file_view(misc_bucket, rec_id)

    recording = Recording()
    try:
        recording.ParseFromString(rec_bytes)
    except DecodeError as exc:  # pragma: no cover - defensively log parse errors
        logger.error("Failed to parse recording %s: %s", rec_id, exc)
        return {"error": "Failed to parse recording"}, 400

    if not recording.computed_edits.size:
        logger.warning(
            "Recording %s missing computed edits; likely legacy format", rec_id
        )
        return {"error": "Recording format unsupported"}, 400

    for idx, note in enumerate(recording.played_notes.notes):
        note.id = idx

    payload = recording.SerializeToString()
    return (
        payload,
        200,
        {"Content-Type": "application/protobuf", "X-Response-Format": "recording"},
    )
