from __future__ import annotations

from functools import lru_cache
from io import BytesIO
from tempfile import NamedTemporaryFile
from zipfile import ZipFile

import muspy

from .notes_pb2 import *

ROUND_TO = 0.1


def key(note):
    return round(note.start_time / ROUND_TO) * ROUND_TO, note.pitch


@lru_cache
def extract_mxl_notes(mxl_bytes):
    mxl_stream = BytesIO(mxl_bytes)
    with ZipFile(mxl_stream) as zip_file:
        try:
            xml_bytes = zip_file.read("score.xml")
        except KeyError:
            xml_name = next(
                (name for name in zip_file.namelist() if name.lower().endswith(".xml")),
                None,
            )
            if not xml_name:
                raise ValueError("No MusicXML content found in provided MXL archive")
            xml_bytes = zip_file.read(xml_name)

    with NamedTemporaryFile(suffix=".xml") as tmp_xml:
        tmp_xml.write(xml_bytes)
        tmp_xml.flush()
        music = muspy.read_musicxml(tmp_xml.name)

    notes_info: list[Note] = []
    resolution = max(int(music.resolution), 1)
    for track_idx, track in enumerate(music.tracks):
        for note in track.notes:
            start = note.time / resolution
            duration = note.duration / resolution
            note_msg = Note(
                pitch=int(note.pitch),
                start_time=float(start),
                duration=float(duration),
                track=int(track_idx),
            )
            note_msg.id = len(notes_info)
            notes_info.append(note_msg)

    notes_info.sort(key=key)
    for idx, note_msg in enumerate(notes_info):
        note_msg.id = idx
    return notes_info


def _build_time_converter(music: muspy.Music):
    factor = 60.0 / max(int(music.resolution), 1)
    tempos = sorted(music.tempos, key=lambda tempo: tempo.time)

    segments: list[tuple[int, int | None, float, float]] = []
    position = 0
    elapsed = 0.0
    qpm = 120.0

    for tempo in tempos:
        tempo_time = int(tempo.time)
        if tempo_time > position:
            segments.append((position, tempo_time, elapsed, factor / qpm))
            elapsed += (tempo_time - position) * factor / qpm
            position = tempo_time
        qpm = float(tempo.qpm)

    segments.append((position, None, elapsed, factor / qpm))

    def to_seconds(time_step: int) -> float:
        if time_step < 0:
            raise ValueError("Negative time step provided")
        for start, end, base_seconds, seconds_per_step in segments:
            if end is None or time_step < end:
                return base_seconds + (time_step - start) * seconds_per_step
        start, _, base_seconds, seconds_per_step = segments[-1]
        return base_seconds + (time_step - start) * seconds_per_step

    return to_seconds


def extract_midi_notes(midi_file: str) -> NoteList:
    music = muspy.read_midi(midi_file)
    to_seconds = _build_time_converter(music)

    notes_info = NoteList()

    for track_idx, track in enumerate(music.tracks):
        for note in track.notes:
            note_time = int(note.time)
            note_duration = int(note.duration)
            start = to_seconds(note_time)
            end = to_seconds(note_time + note_duration)
            note_msg = Note(
                pitch=int(note.pitch),
                start_time=float(start),
                duration=float(max(end - start, 0.0)),
                track=int(track_idx),
            )
            note_msg.id = len(notes_info.notes)
            notes_info.notes.append(note_msg)

    notes_info.notes.sort(key=key)
    for idx, n in enumerate(notes_info.notes):
        n.id = idx
    return notes_info


def extract_pb_notes(pb_bytes):
    (note_list := NoteList()).ParseFromString(pb_bytes)
    return note_list
