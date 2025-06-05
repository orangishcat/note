"""
This module provides functionality to combine results from OEMER and TRANSKUN models.
"""

import numpy as np


def sort_note_list(note_list):
    # Sort notes by key = (round(start_time, 1), pitch)
    note_list.notes.sort(key=lambda note: (round(note.start_time, 1), note.pitch))


def compute_edit_distance(a_notes, b_notes):
    n = len(a_notes)
    m = len(b_notes)
    # Create numpy arrays for the keys used in comparison
    a_start = np.array([round(note.start_time, 1) for note in a_notes])
    a_pitch = np.array([note.pitch for note in a_notes])
    b_start = np.array([round(note.start_time, 1) for note in b_notes])
    b_pitch = np.array([note.pitch for note in b_notes])

    # Initialize DP table: dp[i, j] is the edit distance between a_notes[:i] and b_notes[:j]
    dp = np.zeros((n + 1, m + 1), dtype=int)
    dp[0, :] = np.arange(m + 1)
    dp[:, 0] = np.arange(n + 1)

    # Compute DP table row by row.
    # The inner loop is vectorized over the columns of b.
    for i in range(1, n + 1):
        # Compute cost vector: 0 if the key matches, otherwise 1
        cost_vec = np.where(
            (a_start[i - 1] == b_start) & (a_pitch[i - 1] == b_pitch), 0, 1
        )
        # dp[i, 1:] = min(
        #   deletion: dp[i-1, 1:] + 1,
        #   insertion: dp[i, :-1] + 1,
        #   substitution: dp[i-1, :-1] + cost_vec
        # )
        dp[i, 1:] = np.minimum(
            dp[i - 1, 1:] + 1, np.minimum(dp[i, :-1] + 1, dp[i - 1, :-1] + cost_vec)
        )
    return dp, a_start, a_pitch, b_start, b_pitch


def backtrack(dp, a_start, a_pitch, b_start, b_pitch):
    i, j = dp.shape[0] - 1, dp.shape[1] - 1
    aligned_pairs = []
    # Backtrack from dp[n, m] to dp[0, 0]
    while i > 0 and j > 0:
        # Determine substitution cost for matching a[i-1] with b[j-1]
        cost = (
            0
            if (a_start[i - 1] == b_start[j - 1] and a_pitch[i - 1] == b_pitch[j - 1])
            else 1
        )
        if dp[i, j] == dp[i - 1, j - 1] + cost:
            # If it was a match (cost==0) or substitution, record alignment if exact match.
            if cost == 0:
                aligned_pairs.append((i - 1, j - 1))
            i -= 1
            j -= 1
        elif i > 0 and dp[i, j] == dp[i - 1, j] + 1:
            # Deletion in a
            i -= 1
        elif j > 0 and dp[i, j] == dp[i, j - 1] + 1:
            # Insertion in b
            j -= 1
        else:
            # Fallback if none of the above match
            i -= 1
            j -= 1
    aligned_pairs.reverse()  # Reverse to get order from start to finish
    return aligned_pairs


def combine(oemer, transkun) -> bytes:
    """
    Combine results from OEMER note detection model and TRANSKUN transcription model.

    Args:
        oemer: List of notes from OEMER model
        transkun: List of results from TRANSKUN model

    Returns:
        Dict containing combined processed results
    """

    # Sort both note lists by the key (rounded start_time, pitch)
    sort_note_list(oemer)
    sort_note_list(transkun)

    # Compute the edit distance dp array using numpy vectorized operations
    dp, a_start, a_pitch, b_start, b_pitch = compute_edit_distance(
        oemer.notes, transkun.notes
    )

    # Backtrack through the dp array to extract aligned note indices
    aligned_pairs = backtrack(dp, a_start, a_pitch, b_start, b_pitch)

    # For each aligned pair, update the bbox in note from b with that from the corresponding note in a.
    for a_idx, b_idx in aligned_pairs:
        # Replace b's bbox with a's bbox
        transkun[b_idx]["bbox"] = oemer.notes[a_idx].bbox

    return transkun
