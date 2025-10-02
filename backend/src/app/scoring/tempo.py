from __future__ import annotations

from ..timer import timeit
from ._native import load_native
from .notes_pb2 import TempoSection

scoring_native = load_native()


@timeit()
def analyze_tempo(
    actual_times: list[float],
    played_times: list[float],
    aligned: list[tuple[int, int]],
    best_params: scoring_native.TempoSegmentationParams = scoring_native.TempoSegmentationParams(),
) -> tuple[list[TempoSection], float]:
    if not aligned:
        return [], 0.0

    sections_data, unstable = scoring_native.analyze_tempo(
        actual_times, played_times, aligned, best_params
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
