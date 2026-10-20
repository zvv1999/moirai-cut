use super::{
    api::root,
    model::{SegmentationPolicy, valid_id},
    rhythm::{self, Word},
};
use crate::{
    domain::{Job, id, now},
    service::App,
    storage, store,
};
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Input {
    pub id: String,
    pub name: String,
    pub sha256: String,
    pub duration_seconds: f64,
    pub media_kind: String,
    pub width: Option<u64>,
    pub height: Option<u64>,
    pub created_at: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawWord {
    pub text: String,
    pub start: f64,
    pub end: f64,
    pub probability: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Transcript {
    #[serde(default = "first_revision")]
    pub revision: u64,
    #[serde(default)]
    pub corrections: Vec<Correction>,
    pub input_id: String,
    pub source_sha256: String,
    pub engine: String,
    #[serde(default)]
    pub model_sha256: Option<String>,
    #[serde(default)]
    pub engine_version: Option<String>,
    pub language: String,
    pub language_probability: f64,
    pub raw_words: Vec<RawWord>,
    pub words: Vec<Word>,
    #[serde(default)]
    pub text: String,
    pub segments: Vec<Value>,
    pub warnings: Vec<String>,
    pub created_at: u64,
}
fn first_revision() -> u64 {
    1
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Correction {
    pub index: usize,
    pub from: String,
    pub to: String,
    pub reason: String,
    pub revision: u64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditWord {
    pub index: usize,
    pub text: String,
    pub reason: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Correct {
    pub base_revision: u64,
    pub edits: Vec<EditWord>,
}
pub fn correct(app: &App, id: &str, input: Correct) -> Result<Transcript> {
    ensure!(
        !input.edits.is_empty() && input.edits.len() <= 30000,
        "word corrections required"
    );
    app.db.transaction(|db| {
        let mut transcript: Transcript = store::get(db, "template_transcript", id)?;
        ensure!(
            transcript.revision == input.base_revision,
            "revision_conflict"
        );
        let version = transcript
            .revision
            .checked_add(1)
            .context("revision overflow")?;
        let mut seen = std::collections::HashSet::new();
        store::put(
            db,
            "template_transcript_version",
            &format!("{id}-r{}", transcript.revision),
            &transcript,
        )?;
        for edit in input.edits {
            ensure!(
                edit.index < transcript.words.len() && seen.insert(edit.index),
                "invalid or repeated word index"
            );
            ensure!(
                !edit.text.trim().is_empty()
                    && edit.text.len() <= 500
                    && !edit.reason.trim().is_empty()
                    && edit.reason.len() <= 2000,
                "invalid word correction"
            );
            let word = &mut transcript.words[edit.index];
            transcript.corrections.push(Correction {
                index: edit.index,
                from: word.text.clone(),
                to: edit.text.trim().into(),
                reason: edit.reason,
                revision: version,
            });
            word.text = edit.text.trim().into();
        }
        transcript.revision = version;
        transcript.text = rhythm::text(&transcript.words);
        store::put(db, "template_transcript", id, &transcript)?;
        store::put(
            db,
            "template_transcript_version",
            &format!("{id}-r{version}"),
            &transcript,
        )?;
        Ok(transcript)
    })
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Inference {
    model_sha256: String,
    engine_version: String,
    language: String,
    language_probability: f64,
    words: Vec<RawWord>,
    segments: Vec<Value>,
}

pub fn import(app: &App, path: &Path, name: &str) -> Result<Input> {
    ensure!(
        !name.trim().is_empty() && name.len() <= 500,
        "invalid input name"
    );
    let path = path.canonicalize().context("输入文件不存在")?;
    ensure!(
        path.is_file() && fs::metadata(&path)?.len() <= 2 * 1024 * 1024 * 1024,
        "输入必须是小于 2 GB 的媒体文件"
    );
    let hash = storage::hash(&path)?;
    if let Some(input) = app
        .db
        .list::<Input>("template_input")?
        .into_iter()
        .find(|v| v.sha256 == hash)
    {
        return Ok(input);
    }
    let probe = app.media.probe(&path)?;
    let streams = probe["streams"].as_array().context("媒体轨道缺失")?;
    let video = streams.iter().find(|s| s["codec_type"] == "video");
    ensure!(
        video.is_some() || streams.iter().any(|s| s["codec_type"] == "audio"),
        "输入必须包含视频或音频轨道"
    );
    let duration = probe["format"]["duration"]
        .as_str()
        .context("媒体时长缺失")?
        .parse::<f64>()?;
    ensure!(
        (0.2..=3600.0).contains(&duration),
        "支持 0.2 秒至 60 分钟的视频或音频"
    );
    let input = Input {
        id: format!("input-{}", &hash[..32]),
        name: name.into(),
        sha256: hash,
        duration_seconds: duration,
        media_kind: if video.is_some() { "video" } else { "audio" }.into(),
        width: video.and_then(|v| v["width"].as_u64()),
        height: video.and_then(|v| v["height"].as_u64()),
        created_at: now(),
    };
    let dir = root(app).join("inputs").join(&input.id);
    fs::create_dir_all(&dir)?;
    let temporary = dir.join(format!("{}.upload", id()));
    let result = (|| {
        fs::copy(&path, &temporary)?;
        fs::File::open(&temporary)?.sync_all()?;
        ensure!(
            storage::hash(&temporary)? == input.sha256,
            "导入期间文件发生变化"
        );
        fs::rename(&temporary, dir.join("original"))?;
        app.db.put("template_input", &input.id, &input)?;
        Ok(input)
    })();
    let _ = fs::remove_file(temporary);
    result
}
pub fn file(app: &App, id: &str, variant: &str) -> Result<(PathBuf, &'static str)> {
    ensure!(valid_id(id), "invalid input ID");
    let input: Input = app.db.get("template_input", id)?;
    let (name, mime) = match variant {
        "original" => ("original", "application/octet-stream"),
        "audio" => ("audio.wav", "audio/wav"),
        "preview" if input.media_kind == "video" => ("preview.mp4", "video/mp4"),
        _ => anyhow::bail!("输入媒体不存在"),
    };
    let base = root(app).join("inputs").canonicalize()?;
    let file = base
        .join(id)
        .join(name)
        .canonicalize()
        .context("输入媒体不存在")?;
    ensure!(file.starts_with(base), "invalid input path");
    Ok((file, mime))
}
pub fn enqueue(app: &App, id: &str) -> Result<Job> {
    let _: Input = app.db.get("template_input", id)?;
    let (original, _) = file(app, id, "original")?;
    let probe = app.media.probe(&original)?;
    ensure!(
        probe["streams"]
            .as_array()
            .is_some_and(|streams| streams.iter().any(|s| s["codec_type"] == "audio")),
        "输入没有音轨，无法按声音断句"
    );
    app.db.transaction(|db| {
        if let Some(job) = store::list::<Job>(db, "job")?.into_iter().find(|j| {
            j.kind == "template_transcribe"
                && j.target_id == id
                && ["queued", "running", "succeeded"].contains(&j.status.as_str())
        }) {
            return Ok(job);
        }
        let job = Job::new("template_transcribe", id, 0);
        store::put(db, "job", &job.id, &job)?;
        Ok(job)
    })
}

/// Merge overlapping/zero-length model units; keep original words for inspection.
pub fn aligned_words(raw: &[RawWord], duration: f64) -> Result<(Vec<Word>, Vec<String>)> {
    ensure!(
        duration.is_finite() && duration > 0.0 && duration <= 3600.0,
        "invalid audio duration"
    );
    ensure!(raw.len() <= 30000, "too many transcript words");
    let mut words: Vec<Word> = vec![];
    let mut warnings = vec![];
    let mut prefix = String::new();
    let mut previous_start = 0.0;
    for (i, raw) in raw.iter().enumerate() {
        ensure!(
            !raw.text.trim().is_empty()
                && raw.start.is_finite()
                && raw.end.is_finite()
                && raw.start >= previous_start
                && raw.end >= raw.start
                && raw.end <= duration + 0.25
                && (0.0..=1.0).contains(&raw.probability),
            "invalid model word {i}"
        );
        previous_start = raw.start;
        if raw.probability < 0.5 {
            warnings.push(format!("low_confidence_word:{i}"));
        }
        let end = raw.end.min(duration);
        if raw.end > duration {
            warnings.push(format!("clipped_model_tail:{i}"));
        }
        if let Some(previous) = words.last_mut() {
            if raw.start < previous.end || end <= raw.start {
                previous.text.push_str(&raw.text);
                previous.end = previous.end.max(end);
                warnings.push(format!("merged_model_unit:{i}"));
                continue;
            }
        }
        if end <= raw.start {
            prefix.push_str(&raw.text);
            warnings.push(format!("zero_length_prefix:{i}"));
            continue;
        }
        words.push(Word {
            text: format!("{}{}", std::mem::take(&mut prefix), raw.text),
            start: raw.start,
            end,
            speaker: None,
            emphasis: 0.0,
        });
    }
    for word in &mut words {
        word.text = word.text.trim().into();
    }
    if words.is_empty() {
        warnings.push("no_speech_detected".into());
    } else {
        rhythm::segment(&words, duration, &SegmentationPolicy::default())?;
    }
    Ok((words, warnings))
}

pub fn transcribe(app: &App, id: &str) -> Result<()> {
    let input: Input = app.db.get("template_input", id)?;
    let (source, _) = file(app, id, "original")?;
    ensure!(storage::hash(&source)? == input.sha256, "输入文件已变化");
    let python = std::env::var_os("MOIRAI_TEMPLATE_PYTHON")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            app.home
                .join(".moirai-cut/template-workbench/audio-env/bin/python")
        });
    ensure!(python.is_file(), "请配置本地 Python 转写环境");
    let model = std::env::var("MOIRAI_TEMPLATE_ASR_MODEL").unwrap_or_else(|_| "small".into());
    let dir = root(app).join("inputs").join(id);
    let work = dir.join(format!("work-{}", crate::domain::id()));
    fs::create_dir_all(&work)?;
    let result = (|| {
        let wav = work.join("audio.wav");
        app.media.run(
            &app.media.ffmpeg,
            &vec![
                "-y".into(),
                "-v".into(),
                "error".into(),
                "-i".into(),
                source.to_string_lossy().into(),
                "-map".into(),
                "0:a:0".into(),
                "-ar".into(),
                "16000".into(),
                "-ac".into(),
                "1".into(),
                "-c:a".into(),
                "pcm_s16le".into(),
                wav.to_string_lossy().into(),
            ],
            3600,
        )?;
        let adapter = work.join("transcribe.py");
        fs::write(&adapter, include_str!("transcribe.py"))?;
        let output = work.join("inference.json");
        app.media.run(
            &python.to_string_lossy(),
            &vec![
                adapter.to_string_lossy().into(),
                wav.to_string_lossy().into(),
                output.to_string_lossy().into(),
                model.clone(),
            ],
            7200,
        )?;
        let inference: Inference = serde_json::from_slice(&fs::read(output)?)?;
        ensure!(
            (0.0..=1.0).contains(&inference.language_probability),
            "invalid language confidence"
        );
        let (words, mut warnings) = aligned_words(&inference.words, input.duration_seconds)?;
        warnings.push(
            "ASR word times are model estimates; review wording and timing before rendering."
                .into(),
        );
        let transcript = Transcript {
            revision: 1,
            corrections: vec![],
            input_id: id.into(),
            source_sha256: input.sha256,
            engine: format!("faster-whisper/{model}/int8/beam5/vad"),
            model_sha256: Some(inference.model_sha256),
            engine_version: Some(inference.engine_version),
            language: inference.language,
            language_probability: inference.language_probability,
            raw_words: inference.words,
            text: rhythm::text(&words),
            words,
            segments: inference.segments,
            warnings,
            created_at: now(),
        };
        if input.media_kind == "video" {
            let preview = work.join("preview.mp4");
            app.media.run(&app.media.ffmpeg,&vec!["-y".into(),"-v".into(),"error".into(),"-i".into(),source.to_string_lossy().into(),"-map".into(),"0:v:0".into(),"-map".into(),"0:a:0".into(),"-vf".into(),"scale=640:960:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1".into(),"-c:v".into(),"libx264".into(),"-preset".into(),"ultrafast".into(),"-crf".into(),"25".into(),"-c:a".into(),"aac".into(),"-movflags".into(),"+faststart".into(),preview.to_string_lossy().into()],3600)?;
            fs::rename(preview, dir.join("preview.mp4"))?;
        }
        fs::rename(wav, dir.join("audio.wav"))?;
        app.db.transaction(|db| {
            store::put(
                db,
                "template_transcript_version",
                &format!("{id}-r1"),
                &transcript,
            )?;
            store::put(db, "template_transcript", id, &transcript)
        })
    })();
    let _ = fs::remove_dir_all(work);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    fn raw(text: &str, start: f64, end: f64) -> RawWord {
        RawWord {
            text: text.into(),
            start,
            end,
            probability: 0.9,
        }
    }
    #[test]
    fn merge_keeps_the_measured_interval_and_content() {
        let (words, warnings) = aligned_words(
            &[
                raw("首付", 0.1, 0.4),
                raw("30万", 0.3, 0.8),
                raw("。", 0.8, 0.8),
                raw("但是", 1.2, 1.5),
            ],
            2.0,
        )
        .unwrap();
        assert_eq!(words.len(), 2);
        assert_eq!(words[0].text, "首付30万。");
        assert_eq!((words[0].start, words[0].end), (0.1, 0.8));
        assert_eq!(warnings.len(), 2);
    }
    #[test]
    fn empty_speech_is_not_a_fabricated_transcript() {
        let (words, warnings) = aligned_words(&[], 3.0).unwrap();
        assert!(words.is_empty());
        assert!(warnings.contains(&"no_speech_detected".into()));
        assert!(aligned_words(&[raw("invalid", 2.0, 1.0)], 3.0).is_err());
        assert!(aligned_words(&[raw("invalid", 0.0, 5.0)], 3.0).is_err());
    }
}
