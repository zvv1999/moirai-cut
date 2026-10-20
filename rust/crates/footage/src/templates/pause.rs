use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use std::io::{BufReader, Read};

const RATE: usize = 16000;
const WINDOW: usize = 320;
const MIN_WINDOWS: usize = 6;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub window_seconds: f64,
    pub minimum_seconds: f64,
    pub rms_ceiling_dbfs: f64,
    pub peak_ceiling_dbfs: f64,
}

pub fn settings() -> Settings {
    Settings {
        window_seconds: WINDOW as f64 / RATE as f64,
        minimum_seconds: (WINDOW * MIN_WINDOWS) as f64 / RATE as f64,
        rms_ceiling_dbfs: -45.0,
        peak_ceiling_dbfs: -35.0,
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Interval {
    pub start: f64,
    pub end: f64,
}

/// Full 20 ms windows only. A short transient breaks a run; no padding or
/// joining across sound is allowed to manufacture a longer quiet interval.
pub fn measure(reader: impl Read) -> Result<Vec<Interval>> {
    let mut reader = BufReader::new(reader);
    let mut output = vec![];
    let mut bytes = [0u8; 4];
    let mut sample_count = 0;
    let mut sum = 0.0;
    let mut peak = 0.0_f64;
    let mut run_start = None;
    let mut run_end = 0;
    let rms_squared = 10.0_f64.powf(settings().rms_ceiling_dbfs / 10.0);
    let peak_limit = 10.0_f64.powf(settings().peak_ceiling_dbfs / 20.0);
    let finish = |start: &mut Option<usize>, end: usize, output: &mut Vec<Interval>| {
        if let Some(begin) = start.take()
            && end - begin >= WINDOW * MIN_WINDOWS
        {
            output.push(Interval {
                start: begin as f64 / RATE as f64,
                end: end as f64 / RATE as f64,
            });
        }
    };
    while reader.read(&mut bytes[..1])? != 0 {
        reader.read_exact(&mut bytes[1..])?;
        let value = f32::from_le_bytes(bytes) as f64;
        ensure!(value.is_finite(), "non-finite audio sample");
        sum += value * value;
        peak = peak.max(value.abs());
        sample_count += 1;
        ensure!(sample_count <= RATE * 3601, "audio exceeds analysis limit");
        if sample_count % WINDOW == 0 {
            if sum / WINDOW as f64 <= rms_squared && peak <= peak_limit {
                run_start.get_or_insert(sample_count - WINDOW);
                run_end = sample_count;
            } else {
                finish(&mut run_start, run_end, &mut output);
            }
            sum = 0.0;
            peak = 0.0;
        }
    }
    finish(&mut run_start, run_end, &mut output);
    Ok(output)
}

pub fn longest_overlap(intervals: &[Interval], start: f64, end: f64) -> f64 {
    intervals[intervals.partition_point(|interval| interval.end <= start)..]
        .iter()
        .take_while(|interval| interval.start < end)
        .map(|interval| (interval.end.min(end) - interval.start.max(start)).max(0.0))
        .fold(0.0, f64::max)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pcm(values: impl Iterator<Item = f32>) -> Vec<u8> {
        values.flat_map(f32::to_le_bytes).collect()
    }

    #[test]
    fn quiet_runs_are_measured_not_inferred_from_word_gaps() {
        let data = pcm((0..RATE).map(|i| {
            if (3200..9600).contains(&i) {
                0.001
            } else {
                0.2
            }
        }));
        let intervals = measure(&data[..]).unwrap();
        assert_eq!(intervals.len(), 1);
        assert_eq!(intervals[0].start, 0.2);
        assert_eq!(intervals[0].end, 0.6);
        assert!((longest_overlap(&intervals, 0.3, 0.8) - 0.3).abs() < 1e-9);
        assert_eq!(longest_overlap(&intervals, 0.7, 0.9), 0.0);
        let music = pcm((0..RATE).map(|i| 0.1 * (i as f32 * 0.17).sin()));
        assert!(measure(&music[..]).unwrap().is_empty());
    }

    #[test]
    fn transients_short_runs_and_partial_windows_do_not_extend_pauses() {
        let data = pcm((0..WINDOW * 15 + 100).map(|i| if i == WINDOW * 7 { 0.05 } else { 0.0 }));
        let intervals = measure(&data[..]).unwrap();
        assert_eq!(intervals.len(), 2);
        assert_eq!(intervals[0].end, 0.14);
        assert_eq!(intervals[1].start, 0.16);
        assert_eq!(intervals[1].end, 0.3);
        assert!((longest_overlap(&intervals, 0.0, 1.0) - 0.14).abs() < 1e-9);
        assert!(
            measure(&vec![0; (WINDOW * 6 - 1) * 4][..])
                .unwrap()
                .is_empty()
        );
        assert!(measure(&[0; 3][..]).is_err());
        assert!(measure(&f32::NAN.to_le_bytes()[..]).is_err());
    }
}
