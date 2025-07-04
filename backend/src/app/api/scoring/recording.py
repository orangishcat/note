from flask import request
from appwrite.services.storage import Storage
from scoring import NoteList
from scoring.edit_distance import find_ops
from .. import get_user_client, misc_bucket
from . import audio

@audio.route('/process-recording/<rec_id>', methods=['POST'])
def process_recording(rec_id):
    score_id = request.args.get('score')
    if not score_id:
        return {'error': 'score id required'}, 400

    client = get_user_client()
    storage = Storage(client)

    # fetch score notes
    notes_bytes = storage.get_file_view(misc_bucket, score_id)
    score_notes = NoteList()
    score_notes.ParseFromString(notes_bytes)
    for idx, n in enumerate(score_notes.notes):
        n.id = idx

    # fetch recording notes
    rec_bytes = storage.get_file_view(misc_bucket, rec_id)
    rec_notes = NoteList()
    rec_notes.ParseFromString(rec_bytes)
    for idx, n in enumerate(rec_notes.notes):
        n.id = idx

    ops, _ = find_ops(score_notes.notes, rec_notes.notes)
    ops.size.extend(score_notes.size)
    return ops.SerializeToString(), 200, {'Content-Type': 'application/octet-stream'}
