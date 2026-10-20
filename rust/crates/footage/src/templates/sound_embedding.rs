use super::audio::{self, Sound};
use crate::service::App;
use anyhow::{Result, ensure};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{fs, path::Path};

pub const MODEL: &str = "laion/clap-htsat-unfused";
pub const REVISION: &str = "8fa0f1c6d0433df6e97c127f64b2a1d6c0dcda8a";
const WEIGHTS: &str = "1cd3c601bc4afe0fa87be3de4c13dd2cfadd249fac1e29acf74a9b296c3219bb";

pub struct Match {
    pub score: f64,
    pub warnings: Vec<String>,
    pub evidence: Option<Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Output {
    model_id: String,
    model_revision: String,
    model_sha256: String,
    feature_config_sha256: String,
    tokenizer_sha256: String,
    engine_version: String,
    text_vectors: Vec<TextVector>,
    records: Vec<Record>,
}
#[derive(Deserialize)]
struct TextVector {
    embedding: Vec<f64>,
    truncated: bool,
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
    repeated: bool,
    embedding: Vec<f64>,
}

fn cosine(a: &[f64], b: &[f64]) -> Result<f64> {
    ensure!(
        a.len() == 512 && b.len() == 512 && a.iter().chain(b).all(|x| x.is_finite()),
        "invalid audio embedding"
    );
    let norm = |v: &[f64]| v.iter().map(|x| x * x).sum::<f64>();
    let denominator = (norm(a) * norm(b)).sqrt();
    ensure!(
        denominator.is_finite() && denominator > 0.0,
        "invalid audio embedding norm"
    );
    Ok((a.iter().zip(b).map(|(a, b)| a * b).sum::<f64>() / denominator).clamp(-1.0, 1.0))
}

fn summarize(record: &Record, query: &TextVector) -> Result<Match> {
    ensure!(
        record.duration_seconds.is_finite()
            && record.duration_seconds > 0.0
            && !record.windows.is_empty(),
        "missing audio embedding coverage"
    );
    let mut covered = 0.0_f64;
    let mut best = (-2.0, 0);
    let mut sum = 0.0;
    for (i, window) in record.windows.iter().enumerate() {
        ensure!(
            window.start.is_finite()
                && window.end.is_finite()
                && window.start >= 0.0
                && window.start <= covered + 0.001
                && window.end > window.start
                && window.end <= record.duration_seconds + 0.001
                && window.end - window.start <= 10.001,
            "invalid audio embedding window"
        );
        covered = covered.max(window.end);
        let score = cosine(&query.embedding, &window.embedding)?;
        sum += score;
        if score > best.0 {
            best = (score, i);
        }
    }
    ensure!(
        covered >= record.duration_seconds - 0.001,
        "incomplete audio embedding coverage"
    );
    let window = &record.windows[best.1];
    let mut warnings = vec!["audio_similarity_is_not_quality_or_cleanliness".into()];
    if query.truncated {
        warnings.push("embedding_text_truncated".into());
    }
    if record.windows.iter().any(|w| w.repeated) {
        warnings.push("short_audio_repeated_for_model".into());
    }
    if record.windows.len() > 1 {
        warnings.push("ranking_uses_best_window_not_whole_sound".into());
    }
    Ok(Match {
        score: best.0,
        warnings,
        evidence: Some(json!({
            "bestWindow":{"start":window.start,"end":window.end},
            "meanWindowScore":sum / record.windows.len() as f64,"windowCount":record.windows.len(),
            "sampleRate":48000,"windowSeconds":10,"strideSeconds":5,"padding":"repeatpad"
        })),
    })
}

pub fn rank(app: &App, dir: &Path, query: &str, sounds: &[Sound]) -> Result<(Vec<Match>, Value)> {
    ensure!(
        sounds.len() <= 128
            && sounds
                .iter()
                .map(|s| s.end_seconds - s.start_seconds)
                .sum::<f64>()
                <= 1800.0,
        "audio search is limited to 128 sounds and 30 minutes; narrow the duration filter"
    );
    let mut sources = vec![];
    for sound in sounds {
        sources.push(json!({"id":sound.id,"sha256":sound.audio_sha256,
            "path":audio::checked_sound_file(app,&sound.id,Some(&sound.audio_sha256))?}));
    }
    fs::create_dir_all(dir)?;
    let manifest = dir.join("manifest.json");
    fs::write(
        &manifest,
        serde_json::to_vec(
            &json!({"modelId":MODEL,"modelRevision":REVISION,"queries":[query],"sounds":sources}),
        )?,
    )?;
    let adapter = dir.join("inference.py");
    fs::write(&adapter, include_str!("embed_sounds.py"))?;
    let output = dir.join("embeddings.json");
    let python = std::env::var_os("MOIRAI_TEMPLATE_PYTHON")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            app.home
                .join(".moirai-cut/template-workbench/audio-env/bin/python")
        });
    app.media.run(
        &python.to_string_lossy(),
        &[
            adapter.to_string_lossy().into(),
            manifest.to_string_lossy().into(),
            output.to_string_lossy().into(),
        ],
        1800,
    )?;
    let result: Output = serde_json::from_slice(&fs::read(output)?)?;
    ensure!(
        result.model_id == MODEL
            && result.model_revision == REVISION
            && result.model_sha256 == WEIGHTS
            && result.text_vectors.len() == 1
            && result.records.len() == sounds.len(),
        "unexpected CLAP output"
    );
    let mut matches = vec![];
    for (record, sound) in result.records.iter().zip(sounds) {
        ensure!(
            record.sound_id == sound.id
                && record.audio_sha256 == sound.audio_sha256
                && (record.duration_seconds - (sound.end_seconds - sound.start_seconds)).abs()
                    < 0.02,
            "audio embedding source mismatch"
        );
        matches.push(summarize(record, &result.text_vectors[0])?);
    }
    Ok((
        matches,
        json!({"modelId":MODEL,"modelRevision":REVISION,"modelSha256":result.model_sha256,
        "featureConfigSha256":result.feature_config_sha256,"tokenizerSha256":result.tokenizer_sha256,
        "engineVersion":result.engine_version}),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn local_match_reports_its_window_and_requires_full_coverage() {
        let query = TextVector {
            embedding: vec![1.0; 512],
            truncated: false,
        };
        let mut record = Record {
            sound_id: "s".into(),
            audio_sha256: "h".into(),
            duration_seconds: 12.0,
            windows: vec![
                Window {
                    start: 0.0,
                    end: 10.0,
                    repeated: false,
                    embedding: vec![-1.0; 512],
                },
                Window {
                    start: 5.0,
                    end: 12.0,
                    repeated: true,
                    embedding: vec![1.0; 512],
                },
            ],
        };
        let result = summarize(&record, &query).unwrap();
        assert_eq!(result.score, 1.0);
        assert_eq!(result.evidence.unwrap()["bestWindow"]["start"], 5.0);
        assert!(
            result
                .warnings
                .contains(&"ranking_uses_best_window_not_whole_sound".into())
        );
        record.windows.remove(0);
        assert!(summarize(&record, &query).is_err());
        assert!(cosine(&vec![0.0; 512], &query.embedding).is_err());
        assert!(cosine(&vec![f64::NAN; 512], &query.embedding).is_err());
    }
}
