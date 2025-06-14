import numpy as np
import statsmodels.api as sm
from .notes import Note, TempoSection


def analyze_tempo(actual: list[Note], played: list[Note], aligned: list[tuple[int, int]]) -> tuple[list[TempoSection], float]:
    if not aligned:
        return [], 0.0
    diffs = np.array([
        actual[a].start_time - played[p].start_time
        for a, p in aligned
    ], dtype=np.float32)
    x = np.arange(len(diffs))
    frac = min(0.1, 10 / len(diffs))
    y_smooth = sm.nonparametric.lowess(diffs, x, frac=frac, return_sorted=False)
    slopes = np.gradient(y_smooth)
    unstable = float(np.std(slopes))
    threshold = unstable * 2
    sections: list[TempoSection] = []
    start = 0
    for i in range(1, len(slopes)):
        if abs(slopes[i] - slopes[i-1]) > threshold:
            tempo = float(np.mean(slopes[start:i]))
            sections.append(
                TempoSection(
                    start_index=aligned[start][0],
                    end_index=aligned[i][0],
                    tempo=tempo,
                )
            )
            start = i
    tempo = float(np.mean(slopes[start:]))
    sections.append(
        TempoSection(
            start_index=aligned[start][0],
            end_index=aligned[-1][0],
            tempo=tempo,
        )
    )
    return sections, unstable
