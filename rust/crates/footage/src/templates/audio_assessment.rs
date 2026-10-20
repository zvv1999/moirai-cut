use super::{
    api::root,
    audio::{self, Sound},
};
use crate::{
    domain::{Job, now},
    service::App,
    storage, store,
};
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fs};

const MODEL: &str = "MIT/ast-finetuned-audioset-10-10-0.4593";
const REVISION: &str = "f826b80d28226b62986cc218e5cec390b1096902";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Batch {
    sounds: BTreeMap<String, String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelScore {
    label: String,
    score: f64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Assessment {
    pub sound_id: String,
    pub audio_sha256: String,
    pub model_id: String,
    pub model_revision: String,
    pub model_sha256: String,
    pub feature_config_sha256: String,
    pub engine_version: String,
    pub duration_seconds: f64,
    pub speech_score: f64,
    pub music_score: f64,
    pub top_labels: Vec<LabelScore>,
    pub warnings: Vec<String>,
    pub batch_id: String,
    pub created_at: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Inference {
    model_id: String,
    model_revision: String,
    model_sha256: String,
    feature_config_sha256: String,
    engine_version: String,
    labels: Vec<String>,
    records: Vec<Record>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Record {
    sound_id: String,
    audio_sha256: String,
    duration_seconds: f64,
    windows: Vec<Window>,
}
#[derive(Deserialize)]
struct Window {
    start: f64,
    end: f64,
    scores: Vec<f64>,
}

pub fn enqueue(app: &App) -> Result<Job> {
    let mut sounds = BTreeMap::new();
    for sound in app.db.list::<Sound>("template_sound")? {
        if sound.status == "rejected" {
            continue;
        }
        audio::checked_sound_file(app, &sound.id, Some(&sound.audio_sha256))?;
        sounds.insert(sound.id, sound.audio_sha256);
    }
    ensure!(!sounds.is_empty(), "没有可分析的声音");
    let target = format!(
        "assessment-{:x}",
        Sha256::digest(serde_json::to_vec(&(MODEL, REVISION, "v1", &sounds))?)
    );
    app.db.transaction(|db| {
        if let Some(job) = store::list::<Job>(db, "job")?.into_iter().find(|j| {
            j.kind == "template_sound_assessment"
                && j.target_id == target
                && ["queued", "running", "succeeded"].contains(&j.status.as_str())
        }) {
            return Ok(job);
        }
        store::put(db, "template_sound_batch", &target, &Batch { sounds })?;
        let job = Job::new("template_sound_assessment", &target, 0);
        store::put(db, "job", &job.id, &job)?;
        Ok(job)
    })
}

fn summarize(
    record: &Record,
    labels: &[String],
) -> Result<(Vec<LabelScore>, f64, f64, Vec<String>)> {
    ensure!(
        record.duration_seconds.is_finite()
            && record.duration_seconds > 0.
            && !record.windows.is_empty(),
        "invalid assessment duration"
    );
    let mut maxima = vec![0.0_f64; labels.len()];
    let mut covered = 0.;
    for window in &record.windows {
        ensure!(
            window.start.is_finite()
                && window.end.is_finite()
                && window.start >= 0.
                && window.start <= covered + 0.001
                && window.end > window.start
                && window.end <= record.duration_seconds + 0.001
                && window.scores.len() == labels.len(),
            "invalid assessment window"
        );
        covered = covered.max(window.end);
        for (max, score) in maxima.iter_mut().zip(&window.scores) {
            ensure!((0.0..=1.0).contains(score), "invalid assessment score");
            *max = max.max(*score);
        }
    }
    ensure!(
        covered >= record.duration_seconds - 0.001,
        "assessment does not cover full sound"
    );
    let group = |names: &[&str]| {
        labels
            .iter()
            .zip(&maxima)
            .filter(|(label, _)| names.contains(&label.as_str()))
            .map(|(_, score)| *score)
            .fold(0.0_f64, f64::max)
    };
    let speech = group(&[
        "Speech",
        "Singing",
        "Whispering",
        "Humming",
        "Narration, monologue",
        "Conversation",
    ]);
    let music = group(&[
        "Music",
        "Musical instrument",
        "Drum",
        "Drum kit",
        "Percussion",
    ]);
    let mut top: Vec<_> = labels
        .iter()
        .cloned()
        .zip(maxima)
        .map(|(label, score)| LabelScore { label, score })
        .collect();
    top.sort_by(|a, b| b.score.total_cmp(&a.score));
    top.truncate(10);
    let mut warnings = vec![
        "model_scores_are_not_calibrated_probabilities".into(),
        "audition_required".into(),
    ];
    if record.duration_seconds < 2. {
        warnings.push("short_sound_padded_for_model".into());
    }
    if speech >= 0.2 {
        warnings.push("possible_voice_content".into());
    }
    if music >= 0.2 {
        warnings.push("possible_music_content".into());
    }
    Ok((top, speech, music, warnings))
}

pub fn analyze(app: &App, batch_id: &str) -> Result<()> {
    let batch: Batch = app.db.get("template_sound_batch", batch_id)?;
    let dir = root(app).join("assessments").join(batch_id);
    fs::create_dir_all(&dir)?;
    let mut sources = vec![];
    for (id, hash) in &batch.sounds {
        sources.push(
            json!({"id":id,"sha256":hash,"path":audio::checked_sound_file(app,id,Some(hash))?}),
        );
    }
    let manifest = dir.join("manifest.json");
    fs::write(
        &manifest,
        serde_json::to_vec(&json!({"modelId":MODEL,"modelRevision":REVISION,"sounds":sources}))?,
    )?;
    let adapter = dir.join("inference.py");
    fs::write(&adapter, include_str!("classify_sounds.py"))?;
    let output = dir.join("results.json");
    let python = std::env::var_os("MOIRAI_TEMPLATE_PYTHON")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            app.home
                .join(".moirai-cut/template-workbench/audio-env/bin/python")
        });
    ensure!(python.is_file(), "请安装模板音频分析依赖");
    app.media.run(
        &python.to_string_lossy(),
        &[
            adapter.to_string_lossy().into(),
            manifest.to_string_lossy().into(),
            output.to_string_lossy().into(),
        ],
        1800,
    )?;
    let result: Inference = serde_json::from_slice(&fs::read(output)?)?;
    ensure!(
        result.model_id == MODEL && result.model_revision == REVISION && result.labels.len() == 527,
        "unexpected audio classifier"
    );
    ensure!(
        result.records.len() == batch.sounds.len(),
        "incomplete sound batch"
    );
    let mut assessments = BTreeMap::new();
    for record in &result.records {
        ensure!(
            batch.sounds.get(&record.sound_id) == Some(&record.audio_sha256),
            "unexpected sound hash"
        );
        let file = audio::sound_file(app, &record.sound_id)?;
        ensure!(
            storage::hash(&file)? == record.audio_sha256,
            "sound changed during analysis"
        );
        let (top_labels, speech_score, music_score, warnings) = summarize(record, &result.labels)?;
        let assessment = Assessment {
            sound_id: record.sound_id.clone(),
            audio_sha256: record.audio_sha256.clone(),
            model_id: result.model_id.clone(),
            model_revision: result.model_revision.clone(),
            model_sha256: result.model_sha256.clone(),
            feature_config_sha256: result.feature_config_sha256.clone(),
            engine_version: result.engine_version.clone(),
            duration_seconds: record.duration_seconds,
            speech_score,
            music_score,
            top_labels,
            warnings,
            batch_id: batch_id.into(),
            created_at: now(),
        };
        ensure!(
            assessments
                .insert(record.sound_id.clone(), assessment)
                .is_none(),
            "duplicate sound result"
        );
    }
    app.db.transaction(|db| {
        for (id, result) in &assessments {
            store::put(db, "template_sound_assessment", id, result)?;
        }
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn contamination_uses_peak_window_scores_and_rejects_missing_coverage() {
        let labels = vec!["Speech".into(), "Music".into(), "Click".into()];
        let mut r = Record {
            sound_id: "s".into(),
            audio_sha256: "hash".into(),
            duration_seconds: 2.,
            windows: vec![
                Window {
                    start: 0.,
                    end: 1.,
                    scores: vec![0.8, 0.1, 0.2],
                },
                Window {
                    start: 1.,
                    end: 2.,
                    scores: vec![0.1, 0.9, 0.2],
                },
            ],
        };
        let (top, speech, music, warnings) = summarize(&r, &labels).unwrap();
        assert_eq!(speech, 0.8);
        assert_eq!(music, 0.9);
        assert_eq!(top[0].label, "Music");
        assert!(warnings.contains(&"audition_required".into()));
        r.windows.remove(0);
        assert!(summarize(&r, &labels).is_err());
    }
}
