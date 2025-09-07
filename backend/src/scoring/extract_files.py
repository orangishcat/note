from functools import lru_cache
from io import BytesIO
from zipfile import ZipFile

import pretty_midi
from music21 import converter

from .notes_pb2 import *

ROUND_TO = 0.1


def key(note):
    return round(note.start_time / ROUND_TO) * ROUND_TO, note.pitch


@lru_cache
def extract_mxl_notes(mxl_bytes):
    # Load the MXL file into a music21 score
    mxl_bytes = BytesIO(mxl_bytes)
    with ZipFile(mxl_bytes) as zip_file:
        xml_bytes = zip_file.read("score.xml")
    score = converter.parse(xml_bytes)

    notes_info = []
    for note in score.flatten().notes:
        for pitch in note.pitches:
            notes_info.append(
                Note(
                    pitch=pitch.midi,
                    start_time=float(note.offset),
                    duration=note.duration.quarterLength,
                )
            )
    notes_info.sort(key=key)
    for idx, n in enumerate(notes_info):
        n.id = idx
    return notes_info


def extract_midi_notes(midi_file: str) -> NoteList:
    # Load MIDI file
    midi_data = pretty_midi.PrettyMIDI(midi_file)

    # List to store extracted notes
    notes_info = NoteList()

    # Iterate through each instrument track
    for instrument in midi_data.instruments:
        for note in instrument.notes:
            note_info = Note(
                pitch=note.pitch,
                start_time=note.start,
                duration=note.end - note.start,
            )
            note_info.id = len(notes_info.notes)
            notes_info.notes.append(note_info)

    notes_info.notes.sort(key=key)
    for idx, n in enumerate(notes_info.notes):
        n.id = idx
    return notes_info


def extract_pb_notes(pb_bytes):
    (note_list := NoteList()).ParseFromString(pb_bytes)
    return note_list
