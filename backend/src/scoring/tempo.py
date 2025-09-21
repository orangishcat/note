from __future__ import annotations

from ._native import load_native
from .notes_pb2 import Note, TempoSection


scoring_native = load_native()


def analyze_tempo(
    actual: list[Note], played: list[Note], aligned: list[tuple[int, int]]
) -> tuple[list[TempoSection], float]:
    if not aligned:
        return [], 0.0

    actual_times = [note.start_time for note in actual]
    played_times = [note.start_time for note in played]
    sections_data, unstable = scoring_native.analyze_tempo(
        actual_times,
        played_times,
        aligned,
    )

    sections: list[TempoSection] = []
    for start_idx, end_idx, tempo in sections_data:
        sections.append(
            TempoSection(
                start_index=int(start_idx),
                end_index=int(end_idx),
                tempo=float(tempo),
            )
        )

    return sections, float(unstable)
