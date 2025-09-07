import numpy as np
from loguru import logger
from numba import njit
from numpy._typing import NDArray

from scoring import extract_midi_notes, extract_pb_notes
from timer import timeit
from .notes_pb2 import *

OCTAVE_CHECK_SECS = 0.1

ROUND_TO = 0.1
MAX_MOVE_SWAP = 5
MOVE_SWAP_COST = 1
OP_COST = 5


def key(note):
    return note.page, round(note.start_time / ROUND_TO) * ROUND_TO, note.pitch


@timeit()
def preprocess(s: list[Note], t: list[Note]):
    """Sort notes and extract pitch arrays."""
    s.sort(key=key)
    t.sort(key=key)
    s_pitches = np.fromiter((n.pitch for n in s), dtype=np.int64)
    t_pitches = np.fromiter((n.pitch for n in t), dtype=np.int64)
    s_times = np.fromiter((n.start_time for n in s), dtype=np.float32)
    t_times = np.fromiter((n.start_time for n in t), dtype=np.float32)
    return s_pitches, t_pitches, s_times, t_times


# noinspection PyTypeChecker
@timeit()
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


# noinspection PyTypeChecker
@timeit()
def backtrack(dp, s, t, s_pitches, t_pitches):
    edit_list = ScoringResult()
    aligned_indices = []
    m = t_pitches.shape[0]
    i = int(np.argmin(dp[:, m]))
    j = m
    while i > 0 and j > 0:
        sub_cost = 0 if s_pitches[i - 1] == t_pitches[j - 1] else OP_COST
        if dp[i, j] == dp[i - 1, j - 1] + sub_cost:
            aligned_indices.append((i - 1, j - 1))
            if sub_cost:
                edit_list.edits.append(
                    Edit(
                        operation=EditOperation.SUBSTITUTE,
                        pos=i - 1,
                        s_char=s[i - 1],
                        t_char=t[j - 1],
                        t_pos=j - 1,
                    )
                )
            i -= 1
            j -= 1
            continue

        # 2) deletion
        if dp[i, j] == dp[i - 1, j] + OP_COST:
            edit_list.edits.append(
                Edit(
                    operation=EditOperation.DELETE, pos=i - 1, s_char=s[i - 1], t_pos=j
                )
            )
            i -= 1
            continue

        # 3) insertion
        if dp[i, j] == dp[i, j - 1] + OP_COST:
            edit_list.edits.append(
                Edit(
                    operation=EditOperation.INSERT,
                    pos=i,
                    s_char=s[i - 1],
                    t_char=t[j - 1],
                    t_pos=j - 1,
                )
            )
            j -= 1
            continue

        # 4) move backward (find if note was moved earlier in target)
        moved_backward = False
        for k in range(1, MAX_MOVE_SWAP + 1):
            if j - 1 - k >= 0 and dp[i, j] == dp[i - 1, j - 1 - k] + MOVE_SWAP_COST:
                # Record aligned indices for moved notes
                aligned_indices.append((i - 1, j - 1 - k))
                i -= 1
                j -= 1 + k
                moved_backward = True
                break
        if moved_backward:
            continue

        # 5) move forward (find if note was moved later in target)
        moved_forward = False
        for k in range(1, MAX_MOVE_SWAP + 1):
            if j + k <= m and dp[i, j] == dp[i - 1, j + k] + MOVE_SWAP_COST:
                # Record aligned indices for moved notes
                aligned_indices.append((i - 1, j + k))
                i -= 1
                j += k
                moved_forward = True
                break
        if moved_forward:
            continue

        # 6) swap (no record)
        swapped = False
        for k in range(1, MAX_MOVE_SWAP + 1):
            if (
                i - 1 - k >= 0
                and j - 1 - k >= 0
                and dp[i, j] == dp[i - 1 - k, j - 1 - k] + MOVE_SWAP_COST
                and s_pitches[i - 1] == t_pitches[j - 1 - k]
                and s_pitches[i - 1 - k] == t_pitches[j - 1]
            ):
                # Record aligned indices for swapped notes
                aligned_indices.append((i - 1, j - 1 - k))
                aligned_indices.append((i - 1 - k, j - 1))
                i -= 1 + k
                j -= 1 + k
                swapped = True
                break
        if swapped:
            continue

        # Should never get here
        raise RuntimeError(f"Backtrack stuck at dp[{i},{j}]")

    # leftover insertions at start of t
    while j > 0:
        edit_list.edits.append(
            Edit(
                operation=EditOperation.INSERT,
                pos=0,
                s_char=s[j - 1],
                t_char=t[j - 1],
                t_pos=j - 1,
            )
        )
        j -= 1

    edit_list.edits.reverse()
    aligned_indices.reverse()
    return edit_list, aligned_indices


def adjust_confidence(edit_list: ScoringResult, times, pitches):
    order = np.argsort(times)
    times = times[order]
    pitches = pitches[order]
    for edit in edit_list.edits:
        note = edit.s_char
        note.confidence = 5
        if edit.operation == EditOperation.DELETE:
            start = note.start_time - OCTAVE_CHECK_SECS
            end = note.start_time + OCTAVE_CHECK_SECS
            lo = np.searchsorted(times, start, side="left")
            hi = np.searchsorted(times, end, side="right")
            local = pitches[lo:hi]
            if np.any(local == note.pitch + 12) or np.any(local == note.pitch - 12):
                note.confidence = 3
            elif np.any(local == note.pitch + 4) or np.any(local == note.pitch - 4):
                note.confidence = 4


@timeit()
def postprocess(edit_list: ScoringResult, s_times, s_pitches):
    adjust_confidence(edit_list, s_times, s_pitches)
    return edit_list


def find_ops(
    s: list[Note], t: list[Note]
) -> tuple[ScoringResult, list[tuple[int, int]]]:
    """
    Computes the minimum edit distance (by pitch) from s → t,
    allowing free trimming at start/end of s, and returns a tuple of:
    - ScoringResult: the edit operations
    - list[tuple[int, int]]: aligned indices of notes (s_index, t_index)
    """
    n, m = len(s), len(t)

    if n + m > 10000:
        raise ValueError(f"Too big: {n + m}")

    s_pitches, t_pitches, s_times, t_times = preprocess(s, t)
    dp = compute_dp(s_pitches, t_pitches)
    edit_list, aligned_indices = backtrack(dp, s, t, s_pitches, t_pitches)
    edit_list = postprocess(edit_list, s_times, s_pitches)

    logger.info("Edits: {}", edit_list.edits[:20])
    logger.info("Aligned indices: {}", aligned_indices[:20])
    return edit_list, aligned_indices


def print_wrong_notes(edit_list, limit=99999):
    """
    Prints only the edits that incur cost.
    """
    print("Edit operations:")
    for i, edit in enumerate(edit_list.edits[:limit]):
        op = edit.operation
        if op == EditOperation.SUBSTITUTE:
            print(
                f"Wrong '{edit.s_char}' → '{edit.t_char}' at source pos {edit.pos}, target pos {edit.t_pos}."
            )
        elif op == EditOperation.DELETE:
            print(
                f"Delete '{edit.s_char}' at source pos {edit.pos}, target pos {edit.t_pos}."
            )
        elif op == EditOperation.INSERT:
            print(
                f"Insert '{edit.t_char}' at source pos {edit.pos}, target pos {edit.t_pos}."
            )


# Example usage:
if __name__ == "__main__":
    played = "scores/spider dance played.mid"
    actual = "scores/actual_spider_dance.pb"

    played_notes = extract_midi_notes(played).notes
    with open(actual, "rb") as f:
        actual_notes = extract_pb_notes(f.read()).notes

    edit_list, aligned_indices = find_ops(actual_notes, played_notes)

    print("Lengths:", len(played_notes), len(actual_notes))
    print("Distance:", len(edit_list.edits))
    print("Aligned pairs:", len(aligned_indices))

    print("Notes", played_notes[: (limit := 12)], actual_notes[:limit], sep="\n")
    print_wrong_notes(edit_list, 7)
    print("First few aligned indices:", aligned_indices[:10])
