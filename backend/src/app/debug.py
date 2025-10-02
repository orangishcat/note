"""
For debugging purposes only
"""

from pathlib import Path

from .scoring import *

names = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
]


def pitch_name(midi_pitch: int) -> str:
    octave = midi_pitch // 12 - 1
    name = names[midi_pitch % 12]
    return f"{name}{octave}"


if __name__ == "__main__":
    scores_dir = Path(__file__).parent.parent / "resources" / "scores"
    file = scores_dir / "spider dance.scoredata"

    with open(file, "rb") as f:
        (notes := NoteList()).ParseFromString(f.read())

    print(notes.lines)
