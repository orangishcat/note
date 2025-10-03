use ndarray::{s, Array1, Array2, Axis};
use ndarray_conv::{ConvExt, ConvMode, PaddingMode};
use pyo3::prelude::*;

const MAX_MOVE_SWAP: usize = 5;
const MOVE_SWAP_COST: i64 = 2;
const OP_COST: i64 = 5;
const REDUCED_COST: i64 = 1;

#[pyclass(module = "scoring_native")]
#[derive(Clone)]
pub struct OperationRecord {
    #[pyo3(get)]
    kind: u8,
    #[pyo3(get)]
    s_index: usize,
    #[pyo3(get)]
    t_index: Option<usize>,
    #[pyo3(get)]
    pos: usize,
    #[pyo3(get)]
    t_pos: usize,
}

impl OperationRecord {
    fn new(kind: u8, s_index: usize, t_index: Option<usize>, pos: usize, t_pos: usize) -> Self {
        Self {
            kind,
            s_index,
            t_index,
            pos,
            t_pos,
        }
    }
}

#[pyclass(module = "scoring_native")]
#[derive(Clone)]
pub struct TempoSegmentationParams {
    #[pyo3(get, set)]
    pub min_segment_length: usize,
    #[pyo3(get, set)]
    pub penalty: f32,
    #[pyo3(get, set)]
    pub max_segments: Option<usize>,
    #[pyo3(get, set)]
    pub smoothing_window: usize,
}

impl Default for TempoSegmentationParams {
    fn default() -> Self {
        Self {
            min_segment_length: 8,
            penalty: 3.5,
            max_segments: None,
            smoothing_window: 5,
        }
    }
}

#[pymethods]
impl TempoSegmentationParams {
    #[new]
    #[pyo3(signature = (min_segment_length=None, penalty=None, max_segments=None, smoothing_window=None))]
    fn new(
        min_segment_length: Option<usize>,
        penalty: Option<f32>,
        max_segments: Option<usize>,
        smoothing_window: Option<usize>,
    ) -> Self {
        let defaults = Self::default();
        Self {
            min_segment_length: min_segment_length.unwrap_or(defaults.min_segment_length),
            penalty: penalty.unwrap_or(defaults.penalty),
            max_segments,
            smoothing_window: smoothing_window.unwrap_or(defaults.smoothing_window),
        }
    }
}

fn free_insert(idx: usize, insertion_range: Option<(usize, usize)>) -> bool {
    // if let Some((start, end)) = insertion_range {
    //     idx >= start && idx < end
    // } else {
    false
    // }
}

#[pyfunction]
#[pyo3(
    name = "edit_dist",
    signature = (
        s_pitches,
        t_pitches,
        free_insertion_range=None
    )
)]

pub fn edit_dist_py(
    s_pitches: Vec<i64>,
    t_pitches: Vec<i64>,
    free_insertion_range: Option<(usize, usize)>,
) -> PyResult<(Vec<OperationRecord>, Vec<(usize, usize)>, i64)> {
    let (ops, aligned, total_cost) = edit_dist(&s_pitches, &t_pitches, free_insertion_range);
    Ok((ops, aligned, total_cost))
}

fn edit_dist(
    s_pitches: &[i64],
    t_pitches: &[i64],
    free_insertion_range: Option<(usize, usize)>,
) -> (Vec<OperationRecord>, Vec<(usize, usize)>, i64) {
    let n = s_pitches.len();
    let m = t_pitches.len();

    let insertion_range = free_insertion_range.and_then(|(start, end)| {
        if start >= end {
            None
        } else {
            let start = start.min(m);
            let end = end.min(m);
            if start >= end {
                None
            } else {
                Some((start, end))
            }
        }
    });

    let mut dp = Array2::<i64>::zeros((n + 1, m + 1));

    for j in 1..=m {
        let cost = if free_insert(j - 1, insertion_range) {
            REDUCED_COST
        } else {
            OP_COST
        };
        dp[[0, j]] = dp[[0, j - 1]] + cost;
    }

    for i in 1..=n {
        dp[[i, 0]] = (i as i64) * OP_COST;
        for j in 1..=m {
            let insert_cost = if free_insert(j - 1, insertion_range) {
                REDUCED_COST
            } else {
                OP_COST
            };
            let delete_cost = if j == m { REDUCED_COST } else { OP_COST };
            let mut best = min3(
                dp[[i - 1, j - 1]]
                    + if s_pitches[i - 1] == t_pitches[j - 1] {
                        0
                    } else {
                        OP_COST
                    },
                dp[[i - 1, j]] + delete_cost,
                dp[[i, j - 1]] + insert_cost,
            );

            for k in 1..=MAX_MOVE_SWAP {
                if j + k <= m && s_pitches[i - 1] == t_pitches[j + k - 1] {
                    best = best.min(dp[[i - 1, j + k]] + MOVE_SWAP_COST);
                }
            }

            for k in 1..=MAX_MOVE_SWAP {
                if j >= 1 + k && s_pitches[i - 1] == t_pitches[j - 1 - k] {
                    best = best.min(dp[[i - 1, j - 1 - k]] + MOVE_SWAP_COST);
                }
            }

            for k in 1..=MAX_MOVE_SWAP {
                if i >= 1 + k && j >= 1 + k {
                    if s_pitches[i - 1] == t_pitches[j - 1 - k]
                        && s_pitches[i - 1 - k] == t_pitches[j - 1]
                    {
                        best = best.min(dp[[i - 1 - k, j - 1 - k]] + MOVE_SWAP_COST);
                    }
                }
            }

            dp[[i, j]] = best;
        }
    }

    backtrack(&dp, s_pitches, t_pitches, insertion_range, m)
}

fn backtrack(
    dp: &Array2<i64>,
    s_pitches: &[i64],
    t_pitches: &[i64],
    insertion_range: Option<(usize, usize)>,
    m: usize,
) -> (Vec<OperationRecord>, Vec<(usize, usize)>, i64) {
    if m == 0 {
        return (Vec::new(), Vec::new(), 0);
    }

    let mut aligned_indices: Vec<(usize, usize)> = Vec::new();
    let mut edits: Vec<OperationRecord> = Vec::new();

    let mut i = dp.nrows().checked_sub(1).unwrap_or_default();
    let min_cost = dp[[i, m]];
    let mut j = m;

    while i > 0 && j > 0 {
        let sub_cost = if s_pitches[i - 1] == t_pitches[j - 1] {
            0
        } else {
            OP_COST
        };

        let delete_cost = if j == m { REDUCED_COST } else { OP_COST };
        let insert_cost = if free_insert(j - 1, insertion_range) {
            REDUCED_COST
        } else {
            OP_COST
        };

        if dp[[i, j]] == dp[[i - 1, j - 1]] + sub_cost {
            aligned_indices.push((i - 1, j - 1));
            if sub_cost != 0 {
                edits.push(OperationRecord::new(0, i - 1, Some(j - 1), i - 1, j - 1));
            }
            i -= 1;
            j -= 1;
            continue;
        }

        if dp[[i, j]] == dp[[i - 1, j]] + delete_cost {
            if delete_cost != 0 {
                edits.push(OperationRecord::new(1, i - 1, None, i - 1, j));
            }
            i -= 1;
            continue;
        }

        if dp[[i, j]] == dp[[i, j - 1]] + insert_cost {
            if insert_cost != 0 {
                edits.push(OperationRecord::new(2, i - 1, Some(j - 1), i, j - 1));
            }
            j -= 1;
            continue;
        }

        let mut moved = false;
        for k in 1..=MAX_MOVE_SWAP {
            if j >= 1 + k && dp[[i, j]] == dp[[i - 1, j - 1 - k]] + MOVE_SWAP_COST {
                aligned_indices.push((i - 1, j - 1 - k));
                i -= 1;
                j -= 1 + k;
                moved = true;
                break;
            }
        }
        if moved {
            continue;
        }

        for k in 1..=MAX_MOVE_SWAP {
            if j + k <= m && dp[[i, j]] == dp[[i - 1, j + k]] + MOVE_SWAP_COST {
                aligned_indices.push((i - 1, j + k));
                i -= 1;
                j += k;
                moved = true;
                break;
            }
        }
        if moved {
            continue;
        }

        let mut swapped = false;
        for k in 1..=MAX_MOVE_SWAP {
            if i >= 1 + k
                && j >= 1 + k
                && dp[[i, j]] == dp[[i - 1 - k, j - 1 - k]] + MOVE_SWAP_COST
                && s_pitches[i - 1] == t_pitches[j - 1 - k]
                && s_pitches[i - 1 - k] == t_pitches[j - 1]
            {
                aligned_indices.push((i - 1, j - 1 - k));
                aligned_indices.push((i - 1 - k, j - 1));
                i -= 1 + k;
                j -= 1 + k;
                swapped = true;
                break;
            }
        }
        if swapped {
            continue;
        }

        panic!("Backtrack stuck at dp[{i},{j}]");
    }

    while j > 0 {
        if dp[[i, j]] != dp[[i, j - 1]] {
            edits.push(OperationRecord::new(2, j - 1, Some(j - 1), 0, j - 1));
        }
        j -= 1;
    }

    while i > 0 {
        if dp[[i, j]] != dp[[i - 1, j]] {
            edits.push(OperationRecord::new(1, i - 1, None, i - 1, j));
        }
        i -= 1;
    }

    edits.reverse();
    aligned_indices.reverse();

    (edits, aligned_indices, min_cost)
}

fn min3(a: i64, b: i64, c: i64) -> i64 {
    a.min(b).min(c)
}

#[pyfunction(signature = (actual_times, played_times, aligned, params=None))]
#[pyo3(name = "analyze_tempo")]
pub fn analyze_tempo_py(
    actual_times: Vec<f32>,
    played_times: Vec<f32>,
    aligned: Vec<(usize, usize)>,
    params: Option<TempoSegmentationParams>,
) -> PyResult<(Vec<(usize, usize, f32)>, f32)> {
    let params = params.unwrap_or_default();
    Ok(analyze_tempo(
        &actual_times,
        &played_times,
        &aligned,
        &params,
    ))
}

fn analyze_tempo(
    actual_times: &[f32],
    played_times: &[f32],
    aligned: &[(usize, usize)],
    params: &TempoSegmentationParams,
) -> (Vec<(usize, usize, f32)>, f32) {
    if aligned.is_empty() {
        return (Vec::new(), 0.0);
    }

    let diffs_vec: Vec<f32> = aligned
        .iter()
        .map(|&(a_idx, p_idx)| {
            let a_time = actual_times.get(a_idx).copied().unwrap_or(0.0);
            let p_time = played_times.get(p_idx).copied().unwrap_or(0.0);
            a_time - p_time
        })
        .collect();

    let diffs = Array1::from_vec(diffs_vec);
    let slopes = gradient(&diffs);
    let smoothed_slopes = smooth_slopes(&slopes, params.smoothing_window);

    let segments = segmented_regression(&smoothed_slopes, params);
    let sections = build_sections(&smoothed_slopes, aligned, &segments);

    let slopes_abs = smoothed_slopes.mapv(|v| v.abs());
    let std = if slopes_abs.is_empty() {
        0.0
    } else {
        slopes_abs.std_axis(Axis(0), 0.0).into_scalar()
    };

    (sections, std * 1e4)
}

fn gradient(data: &Array1<f32>) -> Array1<f32> {
    let n = data.len();
    match n {
        0 => Array1::<f32>::zeros(0),
        1 => Array1::from_vec(vec![0.0]),
        _ => {
            let mut grad = Array1::<f32>::zeros(n);
            grad[0] = data[1] - data[0];
            for i in 1..n - 1 {
                grad[i] = (data[i + 1] - data[i - 1]) * 0.5;
            }
            grad[n - 1] = data[n - 1] - data[n - 2];
            grad
        }
    }
}

fn smooth_slopes(slopes: &Array1<f32>, window: usize) -> Array1<f32> {
    if slopes.is_empty() {
        return Array1::<f32>::zeros(0);
    }
    let window = window.max(1).min(slopes.len());
    if window == 1 {
        return slopes.clone();
    }
    let kernel_weights = Array1::from_vec(vec![1.0f32 / window as f32; window]);
    let kernel = kernel_weights.insert_axis(Axis(0));
    let signal = slopes.clone().insert_axis(Axis(0));
    signal
        .conv(&kernel, ConvMode::Same, PaddingMode::Replicate)
        .map(|array| array.row(0).to_owned())
        .unwrap_or_else(|_| slopes.clone())
}

fn segmented_regression(
    slopes: &Array1<f32>,
    params: &TempoSegmentationParams,
) -> Vec<(usize, usize)> {
    let n = slopes.len();
    if n == 0 {
        return Vec::new();
    }

    let min_len = params.min_segment_length.max(1).min(n);
    if n <= min_len {
        return vec![(0, n)];
    }

    let mut prefix_sum = vec![0.0f64; n + 1];
    let mut prefix_sq = vec![0.0f64; n + 1];
    for (i, value) in slopes.iter().enumerate() {
        let val = *value as f64;
        prefix_sum[i + 1] = prefix_sum[i] + val;
        prefix_sq[i + 1] = prefix_sq[i] + val * val;
    }

    let mut dp = vec![f64::INFINITY; n + 1];
    let mut prev: Vec<Option<usize>> = vec![None; n + 1];
    let mut seg_counts: Vec<Option<usize>> = vec![None; n + 1];

    dp[0] = 0.0;
    seg_counts[0] = Some(0);

    for end in min_len..=n {
        for start in (0..=end - min_len).rev() {
            let len = end - start;
            if len < min_len {
                continue;
            }
            let prev_count = match seg_counts[start] {
                Some(value) => value,
                None => continue,
            };
            if let Some(max_segments) = params.max_segments {
                if prev_count + 1 > max_segments {
                    continue;
                }
            }
            let cost = dp[start]
                + segment_cost(&prefix_sum, &prefix_sq, start, end)
                + params.penalty as f64;
            if cost < dp[end] {
                dp[end] = cost;
                prev[end] = Some(start);
                seg_counts[end] = Some(prev_count + 1);
            }
        }
    }

    if prev[n].is_none() {
        return vec![(0, n)];
    }

    let mut segments = Vec::new();
    let mut idx = n;
    while let Some(start) = prev[idx] {
        segments.push((start, idx));
        if start == 0 {
            break;
        }
        idx = start;
        if prev[idx].is_none() && idx != 0 {
            // Fallback: segmentation stalled, bail out with a single segment.
            return vec![(0, n)];
        }
    }
    segments.reverse();
    if segments.is_empty() {
        segments.push((0, n));
    }
    segments
}

fn segment_cost(prefix_sum: &[f64], prefix_sq: &[f64], start: usize, end: usize) -> f64 {
    let len = (end - start) as f64;
    if len <= 0.0 {
        return 0.0;
    }
    let sum = prefix_sum[end] - prefix_sum[start];
    let sum_sq = prefix_sq[end] - prefix_sq[start];
    sum_sq - (sum * sum) / len
}

fn build_sections(
    slopes: &Array1<f32>,
    aligned: &[(usize, usize)],
    segments: &[(usize, usize)],
) -> Vec<(usize, usize, f32)> {
    let mut sections: Vec<(usize, usize, f32)> = Vec::new();
    if slopes.is_empty() || aligned.is_empty() {
        return sections;
    }

    for &(start, end) in segments {
        if end <= start || end > slopes.len() {
            continue;
        }
        let segment_view = slopes.slice(s![start..end]);
        let tempo = segment_view.mean().unwrap_or(0.0);
        let start_idx = aligned
            .get(start)
            .map(|(a_idx, _)| *a_idx)
            .unwrap_or_else(|| aligned[0].0);
        let end_idx = aligned
            .get(end.saturating_sub(1))
            .map(|(a_idx, _)| *a_idx)
            .unwrap_or_else(|| aligned.last().unwrap().0);
        sections.push((start_idx, end_idx, tempo));
    }

    if sections.is_empty() {
        let start_idx = aligned[0].0;
        let end_idx = aligned.last().unwrap().0;
        sections.push((start_idx, end_idx, 0.0));
    }

    sections
}

#[pymodule]
fn scoring_native(_py: Python, m: &Bound<PyModule>) -> PyResult<()> {
    m.add_class::<OperationRecord>()?;
    m.add_class::<TempoSegmentationParams>()?;
    m.add_function(wrap_pyfunction!(edit_dist_py, m)?)?;
    m.add_function(wrap_pyfunction!(analyze_tempo_py, m)?)?;
    Ok(())
}
