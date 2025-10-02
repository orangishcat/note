import json
import mimetypes
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from functools import lru_cache
from traceback import print_exc
from typing import Optional

import magic
from appwrite.input_file import InputFile
from appwrite.permission import Permission
from appwrite.role import Role
from appwrite.services.databases import Databases
from appwrite.services.storage import Storage
from beam import Image, endpoint
from flask import Response, g, request
from google.protobuf.message import DecodeError

# noinspection PyUnresolvedReferences
from google.protobuf.timestamp_pb2 import Timestamp
from loguru import logger

from scoring import (
    Note,
    NoteList,
    Recording,
    analyze_tempo,
    extract_midi_notes,
)
from scoring.edit_distance import find_ops
from temp import pitch_name
from . import scoring_bp
from .. import get_user_client, misc_bucket, database

test_cfg = {
    "spider_dance_played": {
        "played": "spider dance played.midi",
        "actual": "spider dance.scoredata",
    },
    "spider_dance_actual": {
        "played": "spider dance transkun.notelist",
        "actual": "spider dance.scoredata",
    },
    "spider_dance_trimmed": {
        "played": "spider dance trimmed.midi",
        "actual": "spider dance.scoredata",
    },
}

NOTE_EXTENSION = 15


@lru_cache(maxsize=16)
def load_notes(notes_id) -> NoteList:
    if os.environ.get("DEBUG") == "True":
        if os.path.exists(audio_path := f"audio/{notes_id}"):
            return extract_midi_notes(audio_path)

        if os.path.exists(notes_path := f"scores/{notes_id}"):
            with open(notes_path, "rb") as f:
                notes = NoteList()
                notes.ParseFromString(f.read())
            for idx, n in enumerate(notes.notes):
                n.id = idx
            return notes

        logger.info(
            f"Neither path of {audio_path} and {notes_path} exists, fetching from Appwrite"
        )

    byte_content = Storage(get_user_client()).get_file_view(misc_bucket, notes_id)
    (notes := NoteList()).ParseFromString(byte_content)
    for idx, n in enumerate(notes.notes):
        n.id = idx
    return notes


@endpoint(
    gpu="T4",
    keep_warm_seconds=100,
    app=os.environ.get("APP_NAME"),
    image=Image(python_packages=["git+https://github.com/orangishcat/transkun"]),
)
def beam_transkun(audio_bytes):
    """Run Transkun on audio bytes and return NoteList."""

    # noinspection PyUnresolvedReferences
    from transkun.predict_return_notes import predict

    return predict(audio_bytes)


def run_transkun(audio_bytes):
    """Run Transkun on audio bytes and return NoteList."""
    return beam_transkun.remote(audio_bytes)


def parse_rep_output(replica, page_sizes) -> NoteList:
    """Convert Replicate output dict into a NoteList."""
    nl = NoteList()
    nl.size.extend(page_sizes)
    for ev in replica:
        note = Note(
            pitch=ev["pitch"],
            start_time=ev["start"],
            duration=ev["end"] - ev["start"],
            velocity=ev["velocity"],
            page=0,
            track=0,
        )
        note.id = len(nl.notes)
        nl.notes.append(note)
    return nl


def recv_record(
    score_id: str,
    actual_notes: NoteList,
    played_notes: NoteList,
    focused_page: int,
    *,
    is_test: bool,
    result_file: Optional[str] = None,
) -> Response:
    focused_indices = [
        idx for idx, note in enumerate(actual_notes.notes) if note.page == focused_page
    ]
    logger.debug(f"matching notes length: {len(focused_indices)}")

    window = (
        (
            max(0, focused_indices[0] - NOTE_EXTENSION),
            focused_indices[-1] + NOTE_EXTENSION,
        )
        if focused_indices
        else None
    )

    ops, aligned_idx = find_ops(
        actual_notes.notes,
        played_notes.notes,
        window,
    )
    ops.size.extend(actual_notes.size)

    sections, unstable = analyze_tempo(
        [float(n.start_time) for n in actual_notes.notes],
        [float(n.start_time) for n in played_notes.notes],
        aligned_idx,
    )
    ops.unstable_rate = unstable
    ops.tempo_sections.extend(sections)

    response_notes = NoteList()
    if is_test:
        response_notes.notes.extend(played_notes.notes)
        response_notes.size.extend(actual_notes.size)
    else:
        response_notes.CopyFrom(played_notes)
        if not response_notes.size and actual_notes.size:
            response_notes.size.extend(actual_notes.size)

    for idx, note in enumerate(response_notes.notes):
        note.id = idx

    recording = Recording()
    recording.played_notes.CopyFrom(response_notes)
    recording.computed_edits.CopyFrom(ops)
    created_at = Timestamp()
    created_at.FromDatetime(datetime.now(timezone.utc))
    recording.created_at.CopyFrom(created_at)

    if not is_test:
        client = get_user_client()
        storage = Storage(client)
        db = Databases(client)
        user_role = Role.user(g.account["$id"])
        try:
            file_res = storage.create_file(
                bucket_id=misc_bucket,
                file_id="unique()",
                file=InputFile.from_bytes(
                    recording.SerializeToString(),
                    f"Recording-{score_id}-{datetime.now().isoformat()}.pb",
                    "application/octet-stream",
                ),
                permissions=[
                    Permission.read(user_role),
                    Permission.update(user_role),
                    Permission.delete(user_role),
                ],
            )
            db.create_document(
                database_id=database,
                collection_id=os.environ["RECORDINGS_COLLECTION_ID"],
                document_id="unique()",
                data={
                    "user_id": g.account["$id"],
                    "score_id": score_id,
                    "file_id": file_res["$id"],
                },
                permissions=[
                    Permission.read(user_role),
                    Permission.update(user_role),
                    Permission.delete(user_role),
                ],
            )
        except Exception as e:
            logger.error(f"Failed to save recording: {e}")

    payload = recording.SerializeToString()
    logger.info(f"Serialized recording payload size: {len(payload)} bytes")

    if os.environ.get("DEBUG") == "True":

        def _join(match):
            return " ".join(match.group().split())

        with open("debug_info/last_edits.json", "w") as f:
            dumps = json.dumps(aligned_idx, ensure_ascii=False, indent=4)
            f.write(re.sub(r"(?<=\[)[^\[\]]+(?=])", _join, dumps))

        with open("debug_info/last_pb.pb", "wb") as f:
            f.write(payload)

        if result_file:
            with open(result_file, "wb") as f:
                f.write(payload)

    response = Response(payload, mimetype="application/protobuf")
    response.headers.update(
        {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "X-Response-Format": "recording",
        }
    )
    return response


@scoring_bp.route("/receive-audio", methods=["POST"])
def receive_audio():
    audio_bytes = request.data
    if not audio_bytes:
        return {"error": "No audio scores received"}, 400

    score_id = request.headers.get("X-Score-ID")
    notes_id = request.headers.get("X-Notes-ID")
    if not score_id:
        return {"error": "No score ID provided"}, 400

    try:
        logger.info(f"Processing audio for score ID: {score_id}")

        test_type = request.headers.get("X-Test-Type")
        is_test = bool(test_type and test_type != "production")

        result_file: Optional[str] = None

        if is_test:
            cfg = test_cfg.get(str(test_type), test_cfg["spider_dance_played"])
            logger.info(f"Using test config: {test_type}")
            played_notes = load_notes(cfg["played"])
            actual_notes = load_notes(cfg["actual"])

            if (result_file := cfg.get("recording")) and os.path.exists(result_file):
                logger.info(f"Using cached result")
                with open(result_file, "rb") as f:
                    byte_content = f.read()
                res = Response(byte_content, mimetype="application/protobuf")
                res.headers.update(
                    {
                        "Cache-Control": "no-cache, no-store, must-revalidate",
                        "Pragma": "no-cache",
                        "Expires": "0",
                        "X-Response-Format": "recording",
                    }
                )
                return res
        else:
            if not notes_id:
                return {"error": "No notes ID provided"}, 400

            mime_type = magic.from_buffer(audio_bytes, mime=True)
            ext = mimetypes.guess_extension(mime_type) or ".bin"
            logger.info(f"Detected MIME type: {mime_type}, using extension: {ext}")

            if os.environ.get("DEBUG") == "True":
                tmp_path = f"debug_info/last_audio{ext}"
                with open(tmp_path, "wb") as f:
                    f.write(audio_bytes)
            else:
                fd, tmp_path = tempfile.mkstemp(suffix=ext)
                with os.fdopen(fd, "wb") as tmp:
                    tmp.write(audio_bytes)

            actual_notes = load_notes(notes_id)

            output = run_transkun(audio_bytes)

            if os.environ.get("DEBUG") != "True":
                os.unlink(tmp_path)

            rep_out = json.loads(output) if isinstance(output, str) else output
            played_notes = parse_rep_output(rep_out, actual_notes.size)

        focused_page = int(request.headers.get("X-Focused-Page", 0))
        return recv_record(
            score_id,
            actual_notes,
            played_notes,
            focused_page,
            is_test=is_test,
            result_file=result_file,
        )

    except Exception as e:
        print_exc()
        err = f"Error processing audio: {e}"
        logger.error(f"ERROR: {err}", file=sys.stderr)
        return {"error": err}, 400


@scoring_bp.route("/receive-notes", methods=["POST"])
def receive_notes():
    raw_bytes = request.data
    if not raw_bytes:
        return {"error": "No note list payload received"}, 400

    score_id = request.headers.get("X-Score-ID")
    notes_id = request.headers.get("X-Notes-ID")
    if not score_id:
        return {"error": "No score ID provided"}, 400
    if not notes_id:
        return {"error": "No notes ID provided"}, 400

    note_list = NoteList()
    try:
        note_list.ParseFromString(raw_bytes)
    except DecodeError as exc:
        logger.error(f"Failed to parse provided note list: {exc}")
        return {"error": "Invalid note list payload"}, 400

    logger.debug(f"Note list: {[pitch_name(n.pitch) for n in note_list.notes]}")
    actual_notes = load_notes(notes_id)
    focused_page = int(request.headers.get("X-Focused-Page", 0))
    return recv_record(
        score_id,
        actual_notes,
        note_list,
        focused_page,
        is_test=False,
    )
