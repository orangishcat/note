from time import time

import numpy as np
from loguru import logger
from numba import njit
from numpy._typing import NDArray
from scoring import extract_midi_notes, extract_pb_notes

from .notes_patch import *

OCTAVE_CHECK_SECS = 0.1

ROUND_TO = 0.1
MAX_MOVE_SWAP = 5
MOVE_SWAP_COST = 1
OP_COST = 5


def timeit():
    def decorator(func):
        def wrapper(*args, **kwargs):
            start = time()
            result = func(*args, **kwargs)
            logger.info(f"{func.__name__}: {(time() - start) * 1e3:.3f}ms")
            return result
        return wrapper
    return decorator


def key(note):
    return round(note.start_time / ROUND_TO) * ROUND_TO, note.pitch


@timeit()
def preprocess(s: list[Note], t: list[Note]):
    """Sort notes and extract pitch arrays."""
    s.sort(key=key)
    t.sort(key=key)
    s_pitches = np.fromiter((n.pitch for n in s), dtype=np.int64)
    t_pitches = np.fromiter((n.pitch for n in t), dtype=np.int64)
    return s_pitches, t_pitches


# noinspection PyTypeChecker
@njit
def compute_dp(s_pitches, t_pitches):
    n = s_pitches.shape[0]
    m = t_pitches.shape[0]
    # allocate and initialize
    dp: NDArray[int] = np.zeros((n + 1, m + 1), dtype=np.int64)
    dp[0, 1 : m + 1] = np.arange(1, m + 1) * OP_COST

    # main DP loops
    for i in range(1, n + 1):
        # dp[i,0] stays 0: free trim
        for j in range(1, m + 1):
            # Initialize best cost with basic operations (delete, insert, substitute)
            cost_sub = 0 if s_pitches[i - 1] == t_pitches[j - 1] else OP_COST
            best = min(
                dp[i - 1, j - 1] + cost_sub,
                dp[i - 1, j] + OP_COST,
                dp[i, j - 1] + OP_COST,
            )

            # Move operation forward: find if s[i-1] appears later in t
            # This finds notes that were moved later
            for k in range(1, MAX_MOVE_SWAP + 1):
                if j + k <= m:  # Check we don't go beyond array bounds
                    if s_pitches[i - 1] == t_pitches[j + k - 1]:
                        # We found a match for s[i-1] at position j+k-1 in t
                        best = min(best, dp[i - 1, j + k] + MOVE_SWAP_COST)

            # Move operation backward: find if s[i-1] appears earlier in t
            # This finds notes that were moved earlier
            for k in range(1, MAX_MOVE_SWAP + 1):
                if j - 1 - k >= 0:  # Check we don't go beyond array bounds
                    if s_pitches[i - 1] == t_pitches[j - 1 - k]:
                        # We found a match for s[i-1] at position j-1-k in t
                        best = min(best, dp[i - 1, j - 1 - k] + MOVE_SWAP_COST)

            # Swap operation: swap s[i-1] with s[i-1-k] to match t[j-1-k], t[j-1]
            for k in range(1, MAX_MOVE_SWAP + 1):
                if i - 1 - k >= 0 and j - 1 - k >= 0:
                    if (
                        s_pitches[i - 1] == t_pitches[j - 1 - k]
                        and s_pitches[i - 1 - k] == t_pitches[j - 1]
                    ):
                        best = min(best, dp[i - 1 - k, j - 1 - k] + MOVE_SWAP_COST)

            dp[i, j] = best

    return dp


@njit
def backtrack(dp, s_pitches, t_pitches):
    from numba.typed import List

    edits = List()
    aligned_indices = List()
    n, m = s_pitches.shape[0], t_pitches.shape[0]
    i = int(np.argmin(dp[:, m]))
    j = m
    while i > 0 and j > 0:
        sub_cost = 0 if s_pitches[i - 1] == t_pitches[j - 1] else OP_COST
        if dp[i, j] == dp[i - 1, j - 1] + sub_cost:
            aligned_indices.append((i - 1, j - 1))
            if sub_cost:
                edits.append((EditOperation.SUBSTITUTE, i - 1, i - 1, j - 1, j - 1))
            i -= 1
            j -= 1
            continue
        if dp[i, j] == dp[i - 1, j] + OP_COST:
            edits.append((EditOperation.DELETE, i - 1, i - 1, -1, j))
            i -= 1
            continue
        if dp[i, j] == dp[i, j - 1] + OP_COST:
            edits.append((EditOperation.INSERT, i, i - 1, j - 1, j - 1))
            j -= 1
            continue
        moved_backward = False
        for k in range(1, MAX_MOVE_SWAP + 1):
            if j - 1 - k >= 0 and dp[i, j] == dp[i - 1, j - 1 - k] + MOVE_SWAP_COST:
                aligned_indices.append((i - 1, j - 1 - k))
                i -= 1
                j -= 1 + k
                moved_backward = True
                break
        if moved_backward:
            continue
        moved_forward = False
        for k in range(1, MAX_MOVE_SWAP + 1):
            if j + k <= m and dp[i, j] == dp[i - 1, j + k] + MOVE_SWAP_COST:
                aligned_indices.append((i - 1, j + k))
                i -= 1
                j += k
                moved_forward = True
                break
        if moved_forward:
            continue
        swapped = False
        for k in range(1, MAX_MOVE_SWAP + 1):
            if (
                i - 1 - k >= 0
                and j - 1 - k >= 0
                and dp[i, j] == dp[i - 1 - k, j - 1 - k] + MOVE_SWAP_COST
                and s_pitches[i - 1] == t_pitches[j - 1 - k]
                and s_pitches[i - 1 - k] == t_pitches[j - 1]
            ):
                aligned_indices.append((i - 1, j - 1 - k))
                aligned_indices.append((i - 1 - k, j - 1))
                i -= 1 + k
                j -= 1 + k
                swapped = True
                break
        if swapped:
            continue
        raise RuntimeError(f"Backtrack stuck at dp[{i},{j}]")

    while j > 0:
        edits.append((EditOperation.INSERT, 0, -1, j - 1, j - 1))
        j -= 1

    edits.reverse()
    aligned_indices.reverse()
    return edits, aligned_indices


@timeit()
def postprocess(edits, s):
    times = np.fromiter((note.start_time for note in s), dtype=np.float32)
    pitches = np.fromiter((note.pitch for note in s), dtype=np.int16)
    order = np.argsort(times)
    times = times[order]
    pitches = pitches[order]
    filtered = []
    for edit in edits:
        if edit["operation"] == EditOperation.DELETE:
            note = edit["s_char"]
            start = note.start_time - OCTAVE_CHECK_SECS
            end = note.start_time + OCTAVE_CHECK_SECS
            lo = np.searchsorted(times, start, side="left")
            hi = np.searchsorted(times, end, side="right")
            local = pitches[lo:hi]
            if np.any(local == note.pitch + 12) or np.any(local == note.pitch - 12):
                note.confidence = 3
        filtered.append(edit)
    return filtered


def to_proto(edits):
    edit_list = EditList()
    for e in edits:
        edit_list.edits.append(Edit(**e))
    return edit_list


def tuples_to_dicts(edits, s, t):
    result = []
    for op, pos, s_idx, t_idx, t_pos in edits:
        d = {"operation": EditOperation(op), "pos": pos, "t_pos": t_pos}
        if s_idx >= 0:
            d["s_char"] = s[s_idx]
        if t_idx >= 0:
            d["t_char"] = t[t_idx]
        result.append(d)
    return result


# noinspection PyTypeChecker
def find_operations(
    s: list[Note], t: list[Note]
) -> tuple[EditList, list[tuple[int, int]]]:
    """
    Computes the minimum edit distance (by pitch) from s → t,
    allowing free trimming at start/end of s, and returns a tuple of:
    - EditList: the edit operations
    - list[tuple[int, int]]: aligned indices of notes (s_index, t_index)
    Now accelerated with Numba and supports move/swap ops up to 5 positions away.
    """
    n, m = len(s), len(t)

    assert n + m < 10000, "Too big"

    # preprocess
    s_pitches, t_pitches = preprocess(s, t)

    dp = compute_dp(s_pitches, t_pitches)

    edits_raw, aligned_indices = backtrack(dp, s_pitches, t_pitches)
    edits = tuples_to_dicts(edits_raw, s, t)
    edits = postprocess(edits, s)
    edit_list = to_proto(edits)
    return edit_list, aligned_indices


def print_wrong_notes(edit_list, limit=99999):
    """
    Prints only the edits that incur cost.
    """
    logger.info("Edit operations:")
    for i, edit in enumerate(edit_list.edits[:limit]):
        op = edit.operation
        if op == EditOperation.SUBSTITUTE:
            logger.info(
                f"Wrong '{edit.s_char}' → '{edit.t_char}' at source pos {edit.pos}, target pos {edit.t_pos}."
            )
        elif op == EditOperation.DELETE:
            logger.info(
                f"Delete '{edit.s_char}' at source pos {edit.pos}, target pos {edit.t_pos}."
            )
        elif op == EditOperation.INSERT:
            logger.info(
                f"Insert '{edit.t_char}' at source pos {edit.pos}, target pos {edit.t_pos}."
            )


# Example usage:
if __name__ == "__main__":
    played = "scores/spider dance played.mid"
    actual = "scores/actual_spider_dance.pb"

    played_notes = extract_midi_notes(played).notes
    with open(actual, "rb") as f:
        actual_notes = extract_pb_notes(f.read()).notes

    edit_list, aligned_indices = find_operations(actual_notes, played_notes)

    logger.info("Lengths:", len(played_notes), len(actual_notes))
    logger.info("Distance:", len(edit_list.edits))
    logger.info("Aligned pairs:", len(aligned_indices))

    logger.info("Notes", played_notes[: (limit := 12)], actual_notes[:limit], sep="\n")
    print_wrong_notes(edit_list, 7)
    logger.info("First few aligned indices:", aligned_indices[:10])
