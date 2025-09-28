# Tempo Parameter Fitting Dataset Guide

This guide explains how to prepare recordings for `fit_tempo.ipynb`, which tunes
`TempoSegmentationParams` from reference scores and performances.
It calculates tempo sections where the performer plays at an inconsistent tempo
relative to the reference.

## JSON Schema

Create a UTF-8 JSON file containing an array of recording descriptors:

```json
[
  {
    "title": "My Recording",
    "actual": "scores/spiderdance.scoredata",
    "played": "performances/take1.midi",
    "sections": [
      {
        "end_ind": 120,
        "label": "intro"
      },
      {
        "end_ind": 268,
        "label": "chrous was difficult so I slowed down"
      },
      {
        "end_ind": 410,
        "label": "coda"
      }
    ]
  }
]
```

Field meanings:

| Field      | Description                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `title`    | Human-readable label for the dataset (song, take, or performer).                                                                    |
| `actual`   | Path to the reference score. Use `.scoredata` (protobuf NoteList) or `.midi`.                                                       |
| `played`   | Path to the performed `.midi` file you want to evaluate.                                                                            |
| `sections` | Ordered list of tempo segments. Each object defines the inclusive `end_ind` (0-based reference note index) and a free-form `label`. |

Rules for `sections`:

1. The first segment implicitly starts at index `0`.
2. Each subsequent segment starts at the previous `end_ind + 1`.
3. `end_ind` values must be non-decreasing and cover the entire reference note
   list. The final segment must end at `reference_note_count - 1`.
   In the example above, the first segment covers reference notes `0..120`, so
   the
   second segment begins at index `121`.
4. Labels are arbitrary strings used for bookkeeping and do not affect fitting
   directly.

## Building Reference and Performance Notes

[tempo analysis.ipynb](tempo%20analysis.ipynb) will create a plot for you to
inspect the reference and performance notes.

`note.id` (or the list index) is the value you use when choosing `end_ind`
boundaries. For example, if the intro spans reference indices `0..120`
inclusive, record `{"end_ind": 120, "label": "intro"}`.

## Labeling Workflow

1. Load the reference NoteList and the performed MIDI using the snippet above.
2. Audition the performance and decide where tempo changes occur.
3. Translate those decision points into reference note indices:

- Find the last reference note that belongs in each segment.
- Record that index as `end_ind` (inclusive).

4. Repeat until all reference notes are covered. Keep labels consistent
   across recordings so comparisons are easier.
5. Save the JSON file (for example under
   `backend/resources/data/fit_tempo_dataset.json`).

## Running the Notebook

1. Open `backend/resources/notebooks/fit_tempo.ipynb`.
2. Ensure `DATA_PATH` points to your JSON file.
3. Execute the notebook. It will:

- Load each recording pair.
- Align the performance to the reference using `find_ops`.
- Sweep a grid of `TempoSegmentationParams` values.
- Report aggregate and per-recording precision/recall/F1 scores and export
  the best parameters to `<dataset>.fitted_params.json`.

Tune the grid ranges as needed. For larger corpora you can add more recordings
to
the JSON array—each entry contributes to the aggregate evaluation.
