from __future__ import annotations

import numpy as np
from google.protobuf.internal.containers import RepeatedCompositeFieldContainer

from scoring import extract_midi_notes, extract_pb_notes
from timer import timeit
from ._native import load_native
from .notes_pb2 import Edit, EditOperation, Note, ScoringResult

OCTAVE_CHECK_SECS = 0.1
ROUND_TO = 0.1

scoring_native = load_native()


def key(note: Note) -> tuple[int, float, int]:
    return note.page, round(note.start_time / ROUND_TO) * ROUND_TO, note.pitch


@timeit()
def preprocess(
    s: RepeatedCompositeFieldContainer[Note], t: RepeatedCompositeFieldContainer[Note]
):
    """Sort notes and extract pitch/time arrays for native processing."""
    s.sort(key=key)
    t.sort(key=key)
    s_pitches = np.fromiter((n.pitch for n in s), dtype=np.int64)
    t_pitches = np.fromiter((n.pitch for n in t), dtype=np.int64)
    s_times = np.fromiter((n.start_time for n in s), dtype=np.float32)
    t_times = np.fromiter((n.start_time for n in t), dtype=np.float32)
    return s_pitches, t_pitches, s_times, t_times


def _clamp_index(seq_len: int, idx: int) -> int:
    if seq_len == 0:
        raise ValueError("Cannot clamp index for empty sequence")
    if idx < 0:
        return 0
    if idx >= seq_len:
        return seq_len - 1
    return idx


def build_protobuf(
    native_ops,
    s: RepeatedCompositeFieldContainer[Note],
    t: RepeatedCompositeFieldContainer[Note],
) -> ScoringResult:
    edit_list = ScoringResult()
    for record in native_ops:
        kind = int(record.kind)
        if kind == 0:  # substitute
            if record.t_index is None:
                raise ValueError("Substitution missing target index")
            s_idx = _clamp_index(len(s), int(record.s_index))
            t_idx = _clamp_index(len(t), int(record.t_index))
            edit_list.edits.append(
                Edit(
                    operation=EditOperation.SUBSTITUTE,
                    pos=int(record.pos),
                    s_char=s[s_idx],
                    t_char=t[t_idx],
                    t_pos=int(record.t_pos),
                )
            )
        elif kind == 1:  # delete
            s_idx = _clamp_index(len(s), int(record.s_index))
            edit_list.edits.append(
                Edit(
                    operation=EditOperation.DELETE,
                    pos=int(record.pos),
                    s_char=s[s_idx],
                    t_pos=int(record.t_pos),
                )
            )
        elif kind == 2:  # insert
            if record.t_index is None:
                raise ValueError("Insertion missing target index")
            s_idx = _clamp_index(len(s), int(record.s_index))
            t_idx = _clamp_index(len(t), int(record.t_index))
            edit_list.edits.append(
                Edit(
                    operation=EditOperation.INSERT,
                    pos=int(record.pos),
                    s_char=s[s_idx],
                    t_char=t[t_idx],
                    t_pos=int(record.t_pos),
                )
            )
        else:  # pragma: no cover - defensive
            raise ValueError(f"Unknown edit op kind {kind}")
    return edit_list


def adjust_confidence(edit_list: ScoringResult, times, pitches) -> None:
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
def postprocess(edit_list: ScoringResult, s_times, s_pitches) -> ScoringResult:
    adjust_confidence(edit_list, s_times, s_pitches)
    return edit_list


@timeit()
def edit_distance(s_pitches, t_pitches, s_raw, t_raw):
    native_ops, aligned_indices = scoring_native.compute_edit_distance(
        s_pitches.tolist(),
        t_pitches.tolist(),
    )
    return build_protobuf(native_ops, s_raw, t_raw), aligned_indices


def find_ops(
    s: RepeatedCompositeFieldContainer[Note], t: RepeatedCompositeFieldContainer[Note]
) -> tuple[ScoringResult, list[tuple[int, int]]]:
    """Compute edit operations and alignment using the native Rust core."""

    n, m = len(s), len(t)
    if n + m > 10000:
        raise ValueError(f"Too big: {n + m}")

    s_pitches, t_pitches, s_times, _ = preprocess(s, t)
    edit_list, aligned_indices = edit_distance(s_pitches, t_pitches, s, t)
    aligned_pairs = [(int(a), int(b)) for a, b in aligned_indices]
    edit_list = postprocess(edit_list, s_times, s_pitches)

    return edit_list, aligned_pairs


def print_wrong_notes(edit_list: ScoringResult, limit: int = 99999) -> None:
    """Print only the edits that incur cost."""
    print("Edit operations:")
    for edit in edit_list.edits[:limit]:
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


if __name__ == "__main__":  # pragma: no cover - manual sanity usage
    played = "scores/spider dance played.mid"
    actual = "scores/actual_spider_dance.pb"

    played_notes = extract_midi_notes(played).notes
    with open(actual, "rb") as f:
        actual_notes = extract_pb_notes(f.read()).notes

    ops, aligned = find_ops(actual_notes, played_notes)

    print("Lengths:", len(played_notes), len(actual_notes))
    print("Distance:", len(ops.edits))
    print("Aligned pairs:", len(aligned))
    print("Notes", played_notes[:12], actual_notes[:12], sep="\n")
    print_wrong_notes(ops, 7)
    print("First few aligned indices:", aligned[:10])
