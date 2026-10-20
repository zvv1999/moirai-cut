use super::rhythm::Word;
use anyhow::{Result, ensure};
use pitch_detection::detector::{PitchDetector, mcleod::McLeodDetector};
use serde::{Deserialize, Serialize};
use std::io::{BufReader, Read};

const RATE: usize = 16000;
const WINDOW: usize = 1024;
const HOP: usize = 160;
const MIN_HZ: f64 = 65.;
const MAX_HZ: f64 = 600.;
const CLARITY: f64 = 0.85;
const MIN_RMS_DBFS: f64 = -50.;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub algorithm: String,
    pub window_samples: usize,
    pub hop_samples: usize,
    pub min_hz: f64,
    pub max_hz: f64,
    pub min_periodicity: f64,
    pub min_rms_dbfs: f64,
}

pub fn settings() -> Settings {
    Settings {
        algorithm: "pitch-detection-0.3.0-mcleod".into(),
        window_samples: WINDOW,
        hop_samples: HOP,
        min_hz: MIN_HZ,
        max_hz: MAX_HZ,
        min_periodicity: CLARITY,
        min_rms_dbfs: MIN_RMS_DBFS,
    }
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Measurement {
    pub analyzed_frames: usize,
    pub pitched_frames: usize,
    pub pitched_fraction: f64,
    pub median_hz: Option<f64>,
    pub median_periodicity: Option<f64>,
    pub range_semitones: Option<f64>,
    pub change_semitones: Option<f64>,
}

fn quantile(values: &[f64], q: f64) -> f64 {
    let mut sorted = values.to_vec();
    sorted.sort_by(f64::total_cmp);
    let index = (sorted.len() - 1) as f64 * q;
    let lo = index.floor() as usize;
    let hi = index.ceil() as usize;
    sorted[lo] + (sorted[hi] - sorted[lo]) * index.fract()
}

fn summarize(word: &Word, count: usize, frames: &[(f64, f64, f64)]) -> Measurement {
    let mut result = Measurement {
        analyzed_frames: count,
        pitched_frames: frames.len(),
        pitched_fraction: frames.len() as f64 / count.max(1) as f64,
        ..Measurement::default()
    };
    if frames.len() < 3 {
        return result;
    }
    let frequencies: Vec<_> = frames.iter().map(|f| f.1).collect();
    result.median_hz = Some(quantile(&frequencies, 0.5));
    result.median_periodicity = Some(quantile(
        &frames.iter().map(|f| f.2).collect::<Vec<_>>(),
        0.5,
    ));
    result.range_semitones =
        Some(12. * (quantile(&frequencies, 0.9) / quantile(&frequencies, 0.1)).log2());
    let third = (word.end - word.start) / 3.;
    let first: Vec<_> = frames
        .iter()
        .filter(|f| f.0 < word.start + third)
        .map(|f| f.1)
        .collect();
    let last: Vec<_> = frames
        .iter()
        .filter(|f| f.0 >= word.end - third)
        .map(|f| f.1)
        .collect();
    if first.len() >= 2 && last.len() >= 2 {
        result.change_semitones = Some(12. * (quantile(&last, 0.5) / quantile(&first, 0.5)).log2());
    }
    result
}

fn read_samples(reader: &mut impl Read, output: &mut [f64]) -> Result<bool> {
    for value in output {
        let mut bytes = [0u8; 4];
        if reader.read(&mut bytes[..1])? == 0 {
            return Ok(false);
        }
        reader.read_exact(&mut bytes[1..])?;
        *value = f32::from_le_bytes(bytes) as f64;
        ensure!(value.is_finite(), "non-finite pitch sample");
    }
    Ok(true)
}

/// Full 64 ms windows, assigned by center to existing word intervals; never pad missing audio.
pub fn measure(reader: impl Read, words: &[Word]) -> Result<Vec<Measurement>> {
    if words.is_empty() {
        return Ok(vec![]);
    }
    let mut reader = BufReader::new(reader);
    let mut window = [0f64; WINDOW];
    let mut centered = [0f64; WINDOW];
    let mut detector = McLeodDetector::new(WINDOW, WINDOW / 2);
    let mut output = Vec::with_capacity(words.len());
    let mut frames = vec![];
    let mut count = 0;
    let mut word_index = 0;
    let mut frame_start = 0;
    let mut available = read_samples(&mut reader, &mut window)?;
    while available && word_index < words.len() {
        ensure!(
            frame_start <= RATE * 3601,
            "audio exceeds pitch analysis limit"
        );
        let center = (frame_start + WINDOW / 2) as f64 / RATE as f64;
        while word_index < words.len() && center >= words[word_index].end {
            output.push(summarize(&words[word_index], count, &frames));
            frames.clear();
            count = 0;
            word_index += 1;
        }
        if word_index == words.len() {
            break;
        }
        if center >= words[word_index].start {
            count += 1;
            // Remove DC before estimating periodicity and applying the energy gate.
            let mean = window.iter().sum::<f64>() / WINDOW as f64;
            for (out, value) in centered.iter_mut().zip(window) {
                *out = value - mean;
            }
            let power = WINDOW as f64 * 10f64.powf(MIN_RMS_DBFS / 10.);
            if let Some(pitch) = detector.get_pitch(&centered, RATE, power, CLARITY) {
                if (MIN_HZ..=MAX_HZ).contains(&pitch.frequency)
                    && pitch.clarity.is_finite()
                    && pitch.clarity >= CLARITY
                {
                    frames.push((center, pitch.frequency, pitch.clarity.clamp(0., 1.)));
                }
            }
        }
        window.rotate_left(HOP);
        available = read_samples(&mut reader, &mut window[WINDOW - HOP..])?;
        frame_start += HOP;
    }
    if word_index < words.len() {
        output.push(summarize(&words[word_index], count, &frames));
        output.resize(words.len(), Measurement::default());
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn word(start: f64, end: f64) -> Word {
        Word {
            text: "test".into(),
            start,
            end,
            speaker: None,
            emphasis: 0.,
        }
    }
    fn tone(start_hz: f64, end_hz: f64, amplitude: f64) -> Vec<u8> {
        (0..RATE)
            .flat_map(|i| {
                let t = i as f64 / RATE as f64;
                let phase =
                    std::f64::consts::TAU * (start_hz * t + (end_hz - start_hz) * t * t / 2.);
                ((amplitude * phase.sin()) as f32).to_le_bytes()
            })
            .collect()
    }

    #[test]
    fn measures_known_frequency_and_direction_without_inventing_voicing() {
        let words = [word(0., 1.)];
        let steady = measure(&tone(200., 200., 0.2)[..], &words).unwrap();
        assert!((steady[0].median_hz.unwrap() - 200.).abs() < 1.);
        assert!(steady[0].pitched_fraction > 0.95);
        assert!(steady[0].range_semitones.unwrap() < 0.1);
        for (start, end, sign) in [(180., 300., 1.), (300., 180., -1.)] {
            let result = measure(&tone(start, end, 0.2)[..], &words).unwrap();
            assert!(result[0].change_semitones.unwrap() * sign > 4.);
        }
        for (hz, amplitude) in [(200., 0.), (200., 0.00001), (50., 0.2), (900., 0.2)] {
            let result = measure(&tone(hz, hz, amplitude)[..], &words).unwrap();
            assert_eq!(result[0].pitched_frames, 0);
            assert!(result[0].median_hz.is_none());
            assert!(result[0].change_semitones.is_none());
        }
    }

    #[test]
    fn preserves_word_gaps_and_missing_pitch_support() {
        let result = measure(
            &tone(200., 200., 0.2)[..],
            &[word(0., 0.02), word(0.2, 0.7), word(0.99, 1.)],
        )
        .unwrap();
        assert_eq!(result.len(), 3);
        assert_eq!(result[0].analyzed_frames, 0);
        assert!(result[0].median_hz.is_none());
        assert!((result[1].median_hz.unwrap() - 200.).abs() < 1.);
        assert_eq!(result[2].analyzed_frames, 0);
        assert!(measure(&[0u8; 3][..], &[word(0., 1.)]).is_err());
        let nonfinite = f32::NAN.to_le_bytes();
        assert!(measure(&nonfinite[..], &[word(0., 1.)]).is_err());
    }

    #[test]
    fn dc_and_broadband_noise_have_no_supported_pitch() {
        let dc: Vec<_> = (0..RATE).flat_map(|_| 0.5f32.to_le_bytes()).collect();
        let mut state = 12345u32;
        let noise: Vec<_> = (0..RATE)
            .flat_map(|_| {
                state = state.wrapping_mul(1664525).wrapping_add(1013904223);
                ((state as f64 / u32::MAX as f64 - 0.5) as f32).to_le_bytes()
            })
            .collect();
        for pcm in [dc, noise] {
            let result = measure(&pcm[..], &[word(0., 1.)]).unwrap();
            assert_eq!(result[0].pitched_frames, 0);
            assert!(result[0].median_hz.is_none());
        }
    }
}
