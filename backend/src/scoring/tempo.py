import numpy as np
from .notes_pb2 import Note, TempoSection


def analyze_tempo(
    actual: list[Note], played: list[Note], aligned: list[tuple[int, int]]
) -> tuple[list[TempoSection], float]:
    if not aligned:
        return [], 0.0

    diffs = np.fromiter(
        (actual[a].start_time - played[p].start_time for a, p in aligned),
        dtype=np.float32,
    )

    x = np.arange(len(diffs), dtype=np.float32)
    slopes = np.gradient(diffs, x)

    window = max(3, len(slopes) // 20)
    kernel = np.ones(window, dtype=np.float32) / window
    slopes = np.convolve(slopes, kernel, mode="same")

    abs_slopes = np.abs(slopes)
    thresh = abs_slopes.mean() + 2 * abs_slopes.std()

    candidates = np.where(abs_slopes > thresh)[0]
    min_sep = max(5, window)
    change_points: list[int] = []
    last = -min_sep
    for idx in candidates:
        if idx - last >= min_sep:
            change_points.append(idx)
            last = idx

    sections: list[TempoSection] = []
    start = 0
    for idx in change_points:
        tempo = float(np.mean(slopes[start:idx]))
        sections.append(
            TempoSection(
                start_index=aligned[start][0],
                end_index=aligned[idx][0],
                tempo=tempo,
            )
        )
        start = idx

    tempo = float(np.mean(slopes[start:]))
    sections.append(
        TempoSection(
            start_index=aligned[start][0],
            end_index=aligned[-1][0],
            tempo=tempo,
        )
    )
    return sections, float(abs_slopes.std() * 1e4)
