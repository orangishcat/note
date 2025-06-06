import json
import mimetypes
import os
import re
import struct
import sys
import tempfile
from functools import lru_cache
from traceback import print_exc

import magic
from appwrite.services.storage import Storage
from appwrite.services.databases import Databases
from appwrite.input_file import InputFile
from appwrite.permission import Permission
from appwrite.role import Role
from beam import Image, endpoint
from flask import Response, request, g
from loguru import logger
from scoring import Note, NoteList, extract_midi_notes
from scoring.edit_distance import find_ops

from .. import get_user_client, misc_bucket, database
from . import audio


@lru_cache(maxsize=16)
def load_notes(notes_id) -> NoteList:
    if os.environ.get("DEBUG") == "True":
        # Check if stored locally for convenience
        if os.path.exists(notes_path := f"audio/{notes_id}.midi"):
            return extract_midi_notes(notes_path)

        if os.path.exists(notes_path := f"scores/{notes_id}.pb"):
            with open(notes_path, "rb") as f:
                notes = NoteList()
                notes.ParseFromString(f.read())
            return notes

        logger.info(
            f"Neither path of {f'audio/{notes_id}.midi'} and {f'scores/{notes_id}.pb'} exists, fetching from Appwrite"
        )

    byte_content = Storage(get_user_client()).get_file_view(misc_bucket, notes_id)
    (notes := NoteList()).ParseFromString(byte_content)
    return notes


@endpoint(
    gpu="T4",
    keep_warm_seconds=100,
    app=os.environ.get("APP_NAME"),
    image=Image(python_packages=["git+https://github.com/orangishcat/transkun"]),
)
def beam_transkun(audio_bytes):
    """Run Transkun on audio bytes and return NoteList."""
    from transkun.predict_return_notes import predict

    return predict(audio_bytes)


def run_transkun(audio_bytes, tmp_path):
    """Run Transkun on audio bytes and return NoteList."""
    if os.environ.get("BEAM_CLOUD") == "True":
        logger.info(f"Using Beam for audio processing")
        return beam_transkun.remote(audio_bytes)
    else:
        import replicate

        logger.info(f"Using Replicate for audio processing")

        # Model version from env
        model_version = os.environ.get("TRANSKUN_VERSION")
        if not model_version:
            raise ValueError("TRANSKUN_VERSION not set in environment")

        return replicate.run(
            model_version, input={"audio": open(tmp_path, "rb")}, use_file_output=False
        )


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
        nl.notes.append(note)
    return nl


@audio.route("/receive", methods=["POST"])
def receive():
    audio_bytes = request.data
    if not audio_bytes:
        return {"error": "No audio scores received"}, 400

    score_id = request.headers.get("X-Score-ID")
    notes_id = request.headers.get("X-Notes-ID")
    if not score_id:
        return {"error": "No score ID provided"}, 400

    try:
        logger.info(f"Processing audio for score ID: {score_id}")

        # Determine test vs. production
        test_type = request.headers.get("X-Test-Type")
        is_test = bool(test_type and test_type != "production")

        # Test file mapping
        test_cfg = {
            "spider_dance_played": {
                "played": "spider dance played",
                "actual": "spiderdance_notes",
            },
            "spider_dance_actual": {
                "played": "spider dance actual",
                "actual": "spiderdance_notes",
            },
        }

        if is_test:
            cfg = test_cfg.get(str(test_type), test_cfg["spider_dance_played"])
            logger.info(f"Using test config: {test_type}")
            played_notes = load_notes(cfg["played"])
            actual_notes = load_notes(cfg["actual"])
        else:
            if not notes_id:
                return {"error": "No notes ID provided"}, 400

            # Auto-detect audio format using libmagic
            mime_type = magic.from_buffer(audio_bytes, mime=True)
            ext = mimetypes.guess_extension(mime_type) or ".bin"
            logger.info(f"Detected MIME type: {mime_type}, using extension: {ext}")

            # Dump incoming bytes to a file
            if os.environ.get("DEBUG") == "True":
                tmp_path = f"debug_info/last_audio{ext}"
                with open(tmp_path, "wb") as f:
                    f.write(audio_bytes)
            else:
                fd, tmp_path = tempfile.mkstemp(suffix=ext)
                with os.fdopen(fd, "wb") as tmp:
                    tmp.write(audio_bytes)

            # Load ground truth NoteList (could be mapped per score_id)
            actual_notes = load_notes(notes_id)

            # Run the model
            output = run_transkun(audio_bytes, tmp_path)

            if os.environ.get("DEBUG") != "True":
                os.unlink(tmp_path)

            # Handle JSON vs. native dict
            rep_out = json.loads(output) if isinstance(output, str) else output
            played_notes = parse_rep_output(rep_out, actual_notes.size)

        # Compute edit operations
        ops, aligned_idx = find_ops(actual_notes.notes, played_notes.notes)
        ops.size.extend(actual_notes.size)

        # Optional debug dump
        if os.environ.get("DEBUG") == "True":

            def _join(m):
                return " ".join(m.group().split())

            with open("debug_info/last_edits.json", "w") as f:
                j = json.dumps(aligned_idx, ensure_ascii=False, indent=4)
                f.write(re.sub(r"(?<=\[)[^\[\]]+(?=])", _join, j))

        # Build response NoteList
        if is_test:
            response_nl = NoteList()
            response_nl.notes.extend(played_notes.notes)
            response_nl.size.extend(actual_notes.size)
        else:
            response_nl = played_notes
            # Save recording notes and create database entry
            storage = Storage(get_user_client())
            db = Databases(get_user_client())
            user_role = Role.user(g.account["$id"])
            notes_id = db.create_document(
                database_id=database,
                collection_id=os.environ["RECORDINGS_COLLECTION_ID"],
                document_id="unique()",
                data={"user_id": g.account["$id"], "score_id": score_id},
                permissions=[
                    Permission.read(user_role),
                    Permission.update(user_role),
                    Permission.delete(user_role),
                ],
            )["$id"]
            file_res = storage.create_file(
                bucket_id=misc_bucket,
                file_id=notes_id,
                file=InputFile.from_bytes(
                    response_nl.SerializeToString(), f"{notes_id}.pb", "application/octet-stream"
                ),
                permissions=[
                    Permission.read(user_role),
                    Permission.update(user_role),
                    Permission.delete(user_role),
                ],
            )
            # update document with file id
            db.update_document(
                database_id=database,
                collection_id=os.environ["RECORDINGS_COLLECTION_ID"],
                document_id=notes_id,
                data={"file_id": file_res["$id"]},
            )

        # Serialize EditList and NoteList with length prefix
        edit_bytes = ops.SerializeToString()
        notes_bytes = response_nl.SerializeToString()
        payload = struct.pack(">I", len(edit_bytes)) + edit_bytes + notes_bytes
        logger.info(f"Serialized payload size: {len(payload)} bytes")

        # Return protobuf binary
        res = Response(payload, mimetype="application/protobuf")
        res.headers.update(
            {
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
                "X-Response-Format": "combined",
            }
        )
        return res

    except Exception as e:
        print_exc()
        err = f"Error processing audio: {e}"
        logger.error(f"ERROR: {err}", file=sys.stderr)
        return {"error": err}, 400
