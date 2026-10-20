use super::{
    api::root,
    model::SegmentationPolicy,
    pause, pitch,
    rhythm::{self, Word},
    transcription::{self, Input, Transcript},
};
use crate::{service::App, storage, store};
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{BufReader, Read},
};

const RATE: usize = 16000;
const METHOD: &str = "aligned-rms-mcleod-quiet-v4";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub transcript_revision: u64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Measurement {
    pub word_index: usize,
    pub rms_dbfs: f64,
    pub peak_dbfs: f64,
    pub relative_db: f64,
    pub gap_before_seconds: f64,
    pub gap_after_seconds: f64,
    pub prominence: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pitch: Option<pitch::Measurement>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Analysis {
    pub input_id: String,
    pub transcript_revision: u64,
    pub source_sha256: String,
    pub method: String,
    pub sample_rate: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pitch_settings: Option<pitch::Settings>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pause_settings: Option<pause::Settings>,
    #[serde(default)]
    pub quiet_intervals: Vec<pause::Interval>,
    #[serde(default)]
    pub quiet_gap_seconds: Vec<f64>,
    pub measurements: Vec<Measurement>,
    pub candidate_words: Vec<Word>,
    pub warnings: Vec<String>,
}

fn dbfs(amplitude: f64) -> f64 {
    20.0 * amplitude.max(0.000001).log10()
}

// Consume PCM sequentially: hour-long sources do not require hour-long sample arrays.
fn measure(reader: impl Read, words: &[Word], duration: f64) -> Result<Vec<Measurement>> {
    if !words.is_empty() {
        rhythm::segment(words, duration, &SegmentationPolicy::default())?;
    }
    let mut reader = BufReader::new(reader);
    let mut sample_index = 0usize;
    let mut word_index = 0usize;
    let mut sums = vec![(0.0f64, 0.0f64, 0usize); words.len()];
    let mut bytes = [0u8; 4];
    loop {
        let count = reader.read(&mut bytes[..1])?;
        if count == 0 {
            break;
        }
        reader.read_exact(&mut bytes[1..])?;
        let sample = f32::from_le_bytes(bytes) as f64;
        ensure!(sample.is_finite(), "non-finite audio sample");
        while word_index < words.len()
            && sample_index >= (words[word_index].end * RATE as f64).ceil() as usize
        {
            word_index += 1;
        }
        if word_index < words.len()
            && sample_index >= (words[word_index].start * RATE as f64).ceil() as usize
        {
            let sum = &mut sums[word_index];
            sum.0 += sample * sample;
            sum.1 = sum.1.max(sample.abs());
            sum.2 += 1;
        }
        sample_index += 1;
        ensure!(sample_index <= RATE * 3601, "audio exceeds analysis limit");
    }
    if let Some(last) = words.last() {
        ensure!(
            sample_index as f64 / RATE as f64 + 0.02 >= last.end,
            "audio ends before aligned words"
        );
    }
    let levels: Vec<f64> = sums
        .iter()
        .map(|(energy, _, count)| dbfs((energy / (*count).max(1) as f64).sqrt()))
        .collect();
    let mut output = Vec::with_capacity(words.len());
    for (i, word) in words.iter().enumerate() {
        ensure!(sums[i].2 > 0, "aligned word has no audio samples");
        let mut neighbors: Vec<f64> = (i.saturating_sub(4)..(i + 5).min(words.len()))
            .filter(|&j| j != i && levels[j] > -60.0 && words[j].end - words[j].start >= 0.04)
            .map(|j| levels[j])
            .collect();
        neighbors.sort_by(f64::total_cmp);
        let baseline = if neighbors.is_empty() {
            levels[i]
        } else {
            (neighbors[(neighbors.len() - 1) / 2] + neighbors[neighbors.len() / 2]) / 2.0
        };
        let relative_db = levels[i] - baseline;
        let prominence =
            if neighbors.len() >= 2 && levels[i] > -60.0 && word.end - word.start >= 0.04 {
                ((relative_db - 3.0) / 9.0).clamp(0.0, 1.0)
            } else {
                0.0
            };
        output.push(Measurement {
            word_index: i,
            rms_dbfs: levels[i],
            peak_dbfs: dbfs(sums[i].1),
            relative_db,
            gap_before_seconds: word.start - if i == 0 { 0.0 } else { words[i - 1].end },
            gap_after_seconds: if i + 1 == words.len() {
                duration - word.end
            } else {
                words[i + 1].start - word.end
            },
            prominence,
            pitch: None,
        });
    }
    Ok(output)
}

pub fn current(app: &App, transcript: &Transcript) -> Result<Option<Analysis>> {
    Ok(app
        .db
        .list::<Analysis>("template_prosody")?
        .into_iter()
        .find(|a| {
            a.input_id == transcript.input_id
                && a.transcript_revision == transcript.revision
                && a.source_sha256 == transcript.source_sha256
                && a.method == METHOD
        }))
}

pub fn analyze(app: &App, id: &str, request: Request) -> Result<Analysis> {
    let input: Input = app.db.get("template_input", id)?;
    let transcript: Transcript = app.db.get("template_transcript", id)?;
    ensure!(
        transcript.revision == request.transcript_revision,
        "revision_conflict"
    );
    ensure!(
        transcript.source_sha256 == input.sha256,
        "transcript source changed"
    );
    let (source, _) = transcription::file(app, id, "original")?;
    ensure!(storage::hash(&source)? == input.sha256, "输入文件已变化");
    if let Some(existing) = current(app, &transcript)? {
        return Ok(existing);
    }
    let work = root(app)
        .join("inputs")
        .join(id)
        .join(format!("prosody-{}", crate::domain::id()));
    fs::create_dir_all(&work)?;
    let result = (|| {
        let pcm = work.join("audio.f32");
        app.media.run(
            &app.media.ffmpeg,
            &[
                "-v".into(),
                "error".into(),
                "-i".into(),
                source.to_string_lossy().into(),
                "-map".into(),
                "0:a:0".into(),
                "-vn".into(),
                "-ar".into(),
                RATE.to_string(),
                "-ac".into(),
                "1".into(),
                "-f".into(),
                "f32le".into(),
                pcm.to_string_lossy().into(),
            ],
            180,
        )?;
        let mut measurements = measure(
            fs::File::open(&pcm)?,
            &transcript.words,
            input.duration_seconds,
        )?;
        let pitches = pitch::measure(fs::File::open(&pcm)?, &transcript.words)?;
        let quiet_intervals = pause::measure(fs::File::open(&pcm)?)?;
        let quiet_gap_seconds = transcript
            .words
            .windows(2)
            .map(|pair| pause::longest_overlap(&quiet_intervals, pair[0].end, pair[1].start))
            .collect();
        ensure!(
            pitches.len() == measurements.len(),
            "pitch word count mismatch"
        );
        for (measurement, pitch) in measurements.iter_mut().zip(pitches) {
            measurement.pitch = Some(pitch);
        }
        let mut candidate_words = transcript.words.clone();
        for (word, measurement) in candidate_words.iter_mut().zip(&measurements) {
            word.emphasis = word.emphasis.max(measurement.prominence);
        }
        let mut analysis = Analysis {
            input_id: id.into(), transcript_revision: transcript.revision,
            source_sha256: input.sha256.clone(), method: METHOD.into(), sample_rate: RATE,
            pitch_settings: Some(pitch::settings()),
            pause_settings: Some(pause::settings()), quiet_intervals, quiet_gap_seconds,
            measurements, candidate_words,
            warnings: vec![
                "响度突出不等于语义重点；背景音乐、音效和录音处理可能影响测量。".into(),
                "首条音轨转为 16 kHz 单声道；音高按 64 ms 窗口、10 ms 步长测量，窗口中心映射到 ASR 词区间，边界附近可能混入邻词。".into(),
                "音高仅接受 65–600 Hz、周期性至少 0.85 且去直流后高于 -50 dBFS 的帧；不足三帧不提供音高汇总，首尾各不足两帧不提供升降值。有效帧比例不等于语音概率。".into(),
                "中文声调、音乐与多声源可影响音高；音高变化不直接改写重音候选，也不判定疑问、情绪或语义边界。词后间隔来自 ASR，另提供该间隔内实测的最长连续低能量时长。".into(),
                "低能量检测采用完整 20 ms 窗口，RMS 不高于 -45 dBFS、峰值不高于 -35 dBFS，连续至少 120 ms；不合并跨越声音的区间。安静不等于无语音，背景音乐也可能掩盖真实口播停顿。词内停顿不会自动修改 ASR 时间或拆开词。".into(),
                "词边界沿用 ASR 时间估计；低于 -60 dBFS、短于 40 ms 或不足两个邻词的单元不提出重音候选。".into(),
            ],
        };
        let pitched = analysis
            .measurements
            .iter()
            .filter(|m| m.pitch.as_ref().is_some_and(|p| p.median_hz.is_some()))
            .count();
        if !analysis.measurements.is_empty() && pitched * 2 < analysis.measurements.len() {
            analysis.warnings.push(format!(
                "音高可测单元仅 {pitched}/{}，不足以覆盖完整口播；缺失值不代表平调或无语音。",
                analysis.measurements.len()
            ));
        }
        ensure!(storage::hash(&source)? == input.sha256, "输入文件已变化");
        app.db.transaction(|db| {
            let latest: Transcript = store::get(db, "template_transcript", id)?;
            ensure!(latest.revision == transcript.revision, "revision_conflict");
            store::put(db, "template_prosody", id, &analysis)?;
            store::get(db, "template_prosody", id)
        })
    })();
    let _ = fs::remove_dir_all(work);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    fn word(start: f64, end: f64) -> Word {
        Word {
            text: "词".into(),
            start,
            end,
            speaker: None,
            emphasis: 0.0,
        }
    }
    #[test]
    fn measured_loud_word_and_gaps_preserve_timing() {
        let words = vec![word(0.0, 0.2), word(0.3, 0.5), word(0.6, 0.8)];
        let pcm: Vec<u8> = (0..RATE)
            .flat_map(|i| {
                let amplitude: f32 = if (4800..8000).contains(&i) { 0.4 } else { 0.1 };
                (if i % 2 == 0 { amplitude } else { -amplitude }).to_le_bytes()
            })
            .collect();
        let result = measure(&pcm[..], &words, 1.0).unwrap();
        assert!((result[1].relative_db - 12.0412).abs() < 0.001);
        assert_eq!(result[1].prominence, 1.0);
        assert_eq!(result[0].prominence, 0.0);
        assert!((result[1].gap_before_seconds - 0.1).abs() < 1e-8);
        assert!((result[2].gap_after_seconds - 0.2).abs() < 1e-8);
    }
    #[test]
    fn silence_equal_levels_and_short_audio_do_not_create_emphasis() {
        let words = vec![word(0.0, 0.2), word(0.3, 0.5), word(0.6, 0.8)];
        for amplitude in [0.0f32, 0.2] {
            let pcm: Vec<u8> = (0..RATE).flat_map(|_| amplitude.to_le_bytes()).collect();
            let result = measure(&pcm[..], &words, 1.0).unwrap();
            assert!(
                result
                    .iter()
                    .all(|m| m.prominence == 0.0 && m.rms_dbfs.is_finite())
            );
            assert!(measure(&pcm[..400], &words, 1.0).is_err());
        }
        assert!(measure(&[0u8; 3][..], &words, 1.0).is_err());
    }
}
