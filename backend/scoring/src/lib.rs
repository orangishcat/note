use array2d::Array2D;
use pyo3::prelude::*;

const MAX_MOVE_SWAP: usize = 5;
const MOVE_SWAP_COST: i64 = 1;
const OP_COST: i64 = 5;

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

#[pyfunction]
#[pyo3(name = "compute_edit_distance")]
pub fn compute_edit_distance_py(
    s_pitches: Vec<i64>,
    t_pitches: Vec<i64>,
) -> PyResult<(Vec<OperationRecord>, Vec<(usize, usize)>)> {
    let (ops, aligned) = compute_edit_distance(&s_pitches, &t_pitches);
    Ok((ops, aligned))
}

fn compute_edit_distance(
    s_pitches: &[i64],
    t_pitches: &[i64],
) -> (Vec<OperationRecord>, Vec<(usize, usize)>) {
    let n = s_pitches.len();
    let m = t_pitches.len();
    let mut dp = Array2D::filled_with(0_i64, n + 1, m + 1);

    for j in 1..=m {
        dp[(0, j)] = (j as i64) * OP_COST;
    }

    for i in 1..=n {
        for j in 1..=m {
            let mut best = min3(
                dp[(i - 1, j - 1)]
                    + if s_pitches[i - 1] == t_pitches[j - 1] {
                        0
                    } else {
                        OP_COST
                    },
                dp[(i - 1, j)] + OP_COST,
                dp[(i, j - 1)] + OP_COST,
            );

            for k in 1..=MAX_MOVE_SWAP {
                if j + k <= m && s_pitches[i - 1] == t_pitches[j + k - 1] {
                    best = best.min(dp[(i - 1, j + k)] + MOVE_SWAP_COST);
                }
            }

            for k in 1..=MAX_MOVE_SWAP {
                if j >= 1 + k && s_pitches[i - 1] == t_pitches[j - 1 - k] {
                    best = best.min(dp[(i - 1, j - 1 - k)] + MOVE_SWAP_COST);
                }
            }

            for k in 1..=MAX_MOVE_SWAP {
                if i >= 1 + k && j >= 1 + k {
                    if s_pitches[i - 1] == t_pitches[j - 1 - k]
                        && s_pitches[i - 1 - k] == t_pitches[j - 1]
                    {
                        best = best.min(dp[(i - 1 - k, j - 1 - k)] + MOVE_SWAP_COST);
                    }
                }
            }

            dp[(i, j)] = best;
        }
    }

    backtrack(&dp, s_pitches, t_pitches, n, m)
}

fn backtrack(
    dp: &Array2D<i64>,
    s_pitches: &[i64],
    t_pitches: &[i64],
    n: usize,
    m: usize,
) -> (Vec<OperationRecord>, Vec<(usize, usize)>) {
    if m == 0 {
        return (Vec::new(), Vec::new());
    }

    let mut aligned_indices: Vec<(usize, usize)> = Vec::new();
    let mut edits: Vec<OperationRecord> = Vec::new();

    let mut i = argmin_last_column(dp, n, m);
    let mut j = m;

    while i > 0 && j > 0 {
        let sub_cost = if s_pitches[i - 1] == t_pitches[j - 1] {
            0
        } else {
            OP_COST
        };

        if dp[(i, j)] == dp[(i - 1, j - 1)] + sub_cost {
            aligned_indices.push((i - 1, j - 1));
            if sub_cost != 0 {
                edits.push(OperationRecord::new(0, i - 1, Some(j - 1), i - 1, j - 1));
            }
            i -= 1;
            j -= 1;
            continue;
        }

        if dp[(i, j)] == dp[(i - 1, j)] + OP_COST {
            edits.push(OperationRecord::new(1, i - 1, None, i - 1, j));
            i -= 1;
            continue;
        }

        if dp[(i, j)] == dp[(i, j - 1)] + OP_COST {
            edits.push(OperationRecord::new(2, i - 1, Some(j - 1), i, j - 1));
            j -= 1;
            continue;
        }

        let mut moved = false;
        for k in 1..=MAX_MOVE_SWAP {
            if j >= 1 + k && dp[(i, j)] == dp[(i - 1, j - 1 - k)] + MOVE_SWAP_COST {
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
            if j + k <= m && dp[(i, j)] == dp[(i - 1, j + k)] + MOVE_SWAP_COST {
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
                && dp[(i, j)] == dp[(i - 1 - k, j - 1 - k)] + MOVE_SWAP_COST
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
        edits.push(OperationRecord::new(2, j - 1, Some(j - 1), 0, j - 1));
        j -= 1;
    }

    edits.reverse();
    aligned_indices.reverse();

    (edits, aligned_indices)
}

fn min3(a: i64, b: i64, c: i64) -> i64 {
    a.min(b).min(c)
}

fn argmin_last_column(dp: &Array2D<i64>, n: usize, m: usize) -> usize {
    let mut best_idx = 0usize;
    let mut best_val = dp[(0, m)];
    for i in 1..=n {
        let val = dp[(i, m)];
        if val < best_val {
            best_val = val;
            best_idx = i;
        }
    }
    best_idx
}

#[pyfunction]
#[pyo3(name = "analyze_tempo")]
pub fn analyze_tempo_py(
    actual_times: Vec<f32>,
    played_times: Vec<f32>,
    aligned: Vec<(usize, usize)>,
) -> PyResult<(Vec<(usize, usize, f32)>, f32)> {
    Ok(analyze_tempo(&actual_times, &played_times, &aligned))
}

fn analyze_tempo(
    actual_times: &[f32],
    played_times: &[f32],
    aligned: &[(usize, usize)],
) -> (Vec<(usize, usize, f32)>, f32) {
    if aligned.is_empty() {
        return (Vec::new(), 0.0);
    }

    let mut diffs = Vec::with_capacity(aligned.len());
    for &(a_idx, p_idx) in aligned {
        let a_time = *actual_times.get(a_idx).unwrap_or(&0.0);
        let p_time = *played_times.get(p_idx).unwrap_or(&0.0);
        diffs.push(a_time - p_time);
    }

    let mut slopes = gradient(&diffs);
    let mut window = aligned.len() / 20;
    if window < 3 {
        window = 3;
    }
    let kernel = vec![1.0f32 / window as f32; window];
    slopes = convolve_same(&slopes, &kernel);

    let abs_slopes: Vec<f32> = slopes.iter().map(|v| v.abs()).collect();
    let mean = abs_slopes.iter().sum::<f32>() / abs_slopes.len() as f32;
    let variance = abs_slopes
        .iter()
        .map(|v| {
            let diff = *v - mean;
            diff * diff
        })
        .sum::<f32>()
        / abs_slopes.len() as f32;
    let std = variance.sqrt();
    let thresh = mean + 2.0 * std;

    let mut candidates: Vec<usize> = abs_slopes
        .iter()
        .enumerate()
        .filter_map(|(idx, value)| if *value > thresh { Some(idx) } else { None })
        .collect();
    candidates.sort_unstable();

    let min_sep = usize::max(5, window);
    let mut change_points: Vec<usize> = Vec::new();
    let mut last: isize = -(min_sep as isize);
    for idx in candidates {
        let idx_isize = idx as isize;
        if idx_isize - last >= min_sep as isize {
            change_points.push(idx);
            last = idx_isize;
        }
    }

    let mut sections: Vec<(usize, usize, f32)> = Vec::new();
    let mut start = 0usize;
    for &idx in &change_points {
        if idx <= start || idx >= aligned.len() {
            continue;
        }
        let slice = &slopes[start..idx];
        if slice.is_empty() {
            continue;
        }
        let tempo = slice.iter().copied().sum::<f32>() / slice.len() as f32;
        sections.push((aligned[start].0, aligned[idx].0, tempo));
        start = idx;
    }

    if start < slopes.len() {
        let slice = &slopes[start..];
        if !slice.is_empty() {
            let tempo = slice.iter().copied().sum::<f32>() / slice.len() as f32;
            sections.push((aligned[start].0, aligned.last().unwrap().0, tempo));
        }
    }

    (sections, std * 1e4)
}

fn gradient(data: &[f32]) -> Vec<f32> {
    let n = data.len();
    if n == 0 {
        return Vec::new();
    }
    if n == 1 {
        return vec![0.0];
    }
    let mut grad = vec![0.0f32; n];
    grad[0] = data[1] - data[0];
    for i in 1..n - 1 {
        grad[i] = (data[i + 1] - data[i - 1]) * 0.5;
    }
    grad[n - 1] = data[n - 1] - data[n - 2];
    grad
}

fn convolve_same(signal: &[f32], kernel: &[f32]) -> Vec<f32> {
    if signal.is_empty() {
        return Vec::new();
    }
    let n = signal.len();
    let m = kernel.len();
    let mut output = vec![0.0f32; n];
    let offset = m / 2;
    for i in 0..n {
        let mut acc = 0.0f32;
        for k in 0..m {
            if let Some(index) = i.checked_add(k).and_then(|val| val.checked_sub(offset)) {
                if index < n {
                    acc += signal[index] * kernel[k];
                }
            }
        }
        output[i] = acc;
    }
    output
}

#[pymodule]
fn scoring_native(_py: Python, m: &Bound<PyModule>) -> PyResult<()> {
    m.add_class::<OperationRecord>()?;
    m.add_function(wrap_pyfunction!(compute_edit_distance_py, m)?)?;
    m.add_function(wrap_pyfunction!(analyze_tempo_py, m)?)?;
    Ok(())
}
