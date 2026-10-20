use super::{api::root, model::valid_id};
use crate::{domain::Job, service::App, storage, store};
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Sound {
    pub id: String,
    pub revision: u64,
    pub name: String,
    pub status: String,
    pub kind: String,
    pub source_id: String,
    pub start_seconds: f64,
    pub end_seconds: f64,
    pub description: String,
    pub tags: Vec<String>,
    pub source_sha256: String,
    pub audio_sha256: String,
    pub algorithm: String,
    pub peak: f64,
    pub rms: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub derivation: Option<Derivation>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Derivation {
    pub parent_sound_id: String,
    pub parent_audio_sha256: String,
    pub start_seconds: f64,
    pub end_seconds: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClipInput {
    pub input_id: Option<String>,
    pub sound_id: Option<String>,
    pub start_seconds: f64,
    pub end_seconds: f64,
    pub name: String,
    pub description: String,
}

pub fn clip_input(app: &App, clip: ClipInput) -> Result<Sound> {
    ensure!(
        clip.input_id.is_some() != clip.sound_id.is_some(),
        "specify exactly one inputId or soundId"
    );
    let (source, source_id, source_sha256, duration, offset, derivation, tags) =
        if let Some(id) = &clip.sound_id {
            let parent: Sound = app.db.get("template_sound", id)?;
            let file = checked_sound_file(app, id, Some(&parent.audio_sha256))?;
            let duration = parent.end_seconds - parent.start_seconds;
            let derivation = Derivation {
                parent_sound_id: parent.id,
                parent_audio_sha256: parent.audio_sha256,
                start_seconds: clip.start_seconds,
                end_seconds: clip.end_seconds,
            };
            (
                file,
                parent.source_id,
                parent.source_sha256,
                duration,
                parent.start_seconds,
                Some(derivation),
                parent.tags,
            )
        } else {
            let id = clip.input_id.as_ref().unwrap();
            let input: super::transcription::Input = app.db.get("template_input", id)?;
            let (file, _) = super::transcription::file(app, id, "original")?;
            ensure!(storage::hash(&file)? == input.sha256, "输入文件已变化");
            (
                file,
                input.id,
                input.sha256,
                input.duration_seconds,
                0.,
                None,
                vec!["local-input".into()],
            )
        };
    ensure!(
        !clip.name.trim().is_empty() && clip.name.len() <= 300 && clip.description.len() <= 4000,
        "invalid sound metadata"
    );
    ensure!(
        clip.start_seconds.is_finite()
            && clip.end_seconds.is_finite()
            && clip.start_seconds >= 0.
            && clip.end_seconds <= duration
            && (0.02..=600.).contains(&(clip.end_seconds - clip.start_seconds)),
        "声音范围须在源文件内，时长为 0.02 至 600 秒"
    );
    let source_hash = derivation
        .as_ref()
        .map(|d| d.parent_audio_sha256.clone())
        .unwrap_or_else(|| source_sha256.clone());
    let algorithm = if derivation.is_some() {
        "derived-trim/pcm-f32le-44100-stereo/v1"
    } else {
        "local-trim/pcm-f32le-44100-stereo/v1"
    };
    let key = if let Some(parent) = &derivation {
        serde_json::to_vec(&(
            algorithm,
            &parent.parent_sound_id,
            &parent.parent_audio_sha256,
            clip.start_seconds,
            clip.end_seconds,
        ))?
    } else {
        serde_json::to_vec(&(
            algorithm,
            &source_sha256,
            clip.start_seconds,
            clip.end_seconds,
        ))?
    };
    let sound_id = format!("sound-{:x}", Sha256::digest(key));
    if let Some(sound) = app
        .db
        .list::<Sound>("template_sound")?
        .into_iter()
        .find(|s| s.id == sound_id)
    {
        checked_sound_file(app, &sound_id, Some(&sound.audio_sha256))?;
        return Ok(sound);
    }
    let sounds = root(app).join("sounds");
    fs::create_dir_all(&sounds)?;
    let work = sounds.join(format!("clip-{}", crate::domain::id()));
    fs::create_dir_all(&work)?;
    let result = (|| {
        let wav = work.join("audio.wav");
        app.media.run(
            &app.media.ffmpeg,
            &[
                "-v".into(),
                "error".into(),
                "-i".into(),
                source.to_string_lossy().into(),
                "-ss".into(),
                clip.start_seconds.to_string(),
                "-t".into(),
                (clip.end_seconds - clip.start_seconds).to_string(),
                "-map".into(),
                "0:a:0".into(),
                "-vn".into(),
                "-ar".into(),
                "44100".into(),
                "-ac".into(),
                "2".into(),
                "-c:a".into(),
                "pcm_f32le".into(),
                wav.to_string_lossy().into(),
            ],
            180,
        )?;
        let pcm = work.join("analysis.f32");
        app.media.run(
            &app.media.ffmpeg,
            &[
                "-v".into(),
                "error".into(),
                "-i".into(),
                wav.to_string_lossy().into(),
                "-ar".into(),
                "16000".into(),
                "-ac".into(),
                "1".into(),
                "-f".into(),
                "f32le".into(),
                pcm.to_string_lossy().into(),
            ],
            180,
        )?;
        let (peak, rms) = metrics(&floats(&fs::read(pcm)?)?);
        let sound = Sound {
            id: sound_id.clone(),
            revision: 1,
            name: clip.name,
            status: "review".into(),
            kind: "candidate".into(),
            source_id,
            source_sha256,
            start_seconds: offset + clip.start_seconds,
            end_seconds: offset + clip.end_seconds,
            description: clip.description,
            tags,
            audio_sha256: storage::hash(&wav)?,
            algorithm: algorithm.into(),
            peak,
            rms,
            derivation,
        };
        ensure!(
            storage::hash(&source)? == source_hash,
            "source audio changed while trimming"
        );
        app.db.transaction(|db| {
            if let Some(existing) = store::list::<Sound>(db, "template_sound")?
                .into_iter()
                .find(|s| s.id == sound_id)
            {
                return Ok(existing);
            }
            fs::rename(&wav, sounds.join(format!("{sound_id}.wav")))?;
            store::put(db, "template_sound", &sound_id, &sound)?;
            store::get(db, "template_sound", &sound_id)
        })
    })();
    let _ = fs::remove_dir_all(work);
    result
}

pub fn reference_file(app: &App, id: &str, variant: &str) -> Result<PathBuf> {
    ensure!(valid_id(id), "invalid reference ID");
    let base = root(app).join("references").canonicalize()?;
    let file = base
        .join(id)
        .join(variant)
        .canonicalize()
        .context("参考文件不存在")?;
    ensure!(file.starts_with(base), "invalid reference path");
    Ok(file)
}

pub fn enqueue(app: &App, id: &str) -> Result<Job> {
    reference_file(app, id, "mix.wav")?;
    app.db.transaction(|db| {
        if let Some(job) = store::list::<Job>(db, "job")?.into_iter().find(|j| {
            j.kind == "template_audio"
                && j.target_id == id
                && ["queued", "running", "succeeded"].contains(&j.status.as_str())
        }) {
            return Ok(job);
        }
        let job = Job::new("template_audio", id, 0);
        store::put(db, "job", &job.id, &job)?;
        Ok(job)
    })
}

fn floats(bytes: &[u8]) -> Result<Vec<f32>> {
    ensure!(bytes.len().is_multiple_of(4), "invalid PCM length");
    let samples: Vec<_> = bytes
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes(b.try_into().unwrap()))
        .collect();
    ensure!(
        !samples.is_empty() && samples.iter().all(|v| v.is_finite()),
        "invalid PCM samples"
    );
    Ok(samples)
}

fn metrics(samples: &[f32]) -> (f64, f64) {
    let peak = samples
        .iter()
        .fold(0.0_f64, |a, b| a.max((*b as f64).abs()));
    let rms = (samples.iter().map(|s| (*s as f64).powi(2)).sum::<f64>()
        / samples.len().max(1) as f64)
        .sqrt();
    (peak, rms)
}

/// Energy changes propose audition ranges only; they cannot distinguish music from SFX.
fn candidates(samples: &[f32], rate: usize) -> Vec<(f64, f64)> {
    let window = rate / 50;
    let energy: Vec<_> = samples.chunks(window).map(|s| metrics(s).1).collect();
    let duration = samples.len() as f64 / rate as f64;
    let mut spans: Vec<(f64, f64)> = vec![];
    for (i, level) in energy.iter().enumerate().skip(5) {
        let baseline = energy[i.saturating_sub(15)..i].iter().sum::<f64>() / i.min(15) as f64;
        let time = i as f64 / 50.0;
        if *level > 0.012
            && *level > baseline.max(0.001) * 2.8
            && spans.last().is_none_or(|(_, end)| time >= *end + 0.3)
        {
            let start = (time - 0.08).max(0.0);
            let mut end = (time + 0.4).min(duration);
            while end < duration
                && end < time + 1.5
                && energy
                    .get((end * 50.0) as usize)
                    .is_some_and(|v| *v > level * 0.15)
            {
                end = (end + 0.02).min(duration);
            }
            spans.push((start, end));
            if spans.len() == 20 {
                break;
            }
        }
    }
    spans
}

pub fn sound_file(app: &App, id: &str) -> Result<PathBuf> {
    ensure!(valid_id(id), "invalid sound ID");
    let _: Sound = app.db.get("template_sound", id)?;
    let base = root(app).join("sounds").canonicalize()?;
    let file = base
        .join(format!("{id}.wav"))
        .canonicalize()
        .context("音频文件不存在")?;
    ensure!(file.starts_with(base), "invalid sound path");
    Ok(file)
}

pub fn validate_resources(app: &App, template: &super::model::Template) -> Result<()> {
    use super::model::{MediaUse, Representation};
    template.validate()?;
    for resource in &template.resource_slots {
        let Some(id) = template.asset_id(&resource.id) else {
            continue;
        };
        if resource.representation != Representation::Audio {
            continue;
        }
        let sound: Sound = app.db.get("template_sound", id)?;
        ensure!(
            sound.status == "approved"
                && template
                    .elements
                    .iter()
                    .filter(|e| e.resource_id.as_deref() == Some(resource.id.as_str()))
                    .all(|e| {
                        sound.kind
                            == if e.features.media_use == Some(MediaUse::Music) {
                                "background_music"
                            } else {
                                "sound_effect"
                            }
                    }),
            "音频资源尚未确认或用途不匹配: {id}"
        );
        ensure!(
            storage::hash(&sound_file(app, id)?)? == sound.audio_sha256,
            "音频文件已变化: {id}"
        );
    }
    Ok(())
}

pub fn resolve_resources(
    app: &App,
    template: &super::model::Template,
) -> Result<std::collections::BTreeMap<String, super::audio_compile::AudioAsset>> {
    validate_resources(app, template)?;
    let mut assets = std::collections::BTreeMap::new();
    for resource in &template.resource_slots {
        if resource.representation != super::model::Representation::Audio {
            continue;
        }
        let Some(id) = template.asset_id(&resource.id) else {
            continue;
        };
        if assets.contains_key(id) {
            continue;
        }
        let sound: Sound = app.db.get("template_sound", id)?;
        let probe = app.media.probe(&sound_file(app, id)?)?;
        ensure!(
            probe["streams"]
                .as_array()
                .is_some_and(|s| s.iter().any(|v| v["codec_type"] == "audio")),
            "sound has no audio stream"
        );
        let duration: f64 = probe["format"]["duration"]
            .as_str()
            .context("sound duration required")?
            .parse()?;
        ensure!(
            duration.is_finite() && duration > 0.,
            "invalid sound duration"
        );
        assets.insert(
            id.to_string(),
            super::audio_compile::AudioAsset {
                sha256: sound.audio_sha256,
                duration_seconds: duration,
            },
        );
    }
    Ok(assets)
}

pub fn checked_sound_file(app: &App, id: &str, expected_hash: Option<&str>) -> Result<PathBuf> {
    let file = sound_file(app, id)?;
    if let Some(expected) = expected_hash {
        ensure!(
            expected.len() == 64 && expected.bytes().all(|b| b.is_ascii_hexdigit()),
            "invalid sound hash"
        );
        ensure!(
            storage::hash(&file)? == expected,
            "声音文件已变化，请重新审核并编排"
        );
    }
    Ok(file)
}

pub fn separate(app: &App, id: &str) -> Result<()> {
    let input = reference_file(app, id, "mix.wav")?;
    let audit: Value = serde_json::from_slice(&fs::read(reference_file(app, id, "audit.json")?)?)?;
    let source_hash = storage::hash(&input)?;
    let python = std::env::var_os("MOIRAI_TEMPLATE_PYTHON")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            app.home
                .join(".moirai-cut/template-workbench/audio-env/bin/python")
        });
    ensure!(
        python.is_file(),
        "请配置 MOIRAI_TEMPLATE_PYTHON 并安装 templates/audio-requirements.txt"
    );
    let work = root(app)
        .join("audio-work")
        .join(format!("{id}-{}", crate::domain::id()));
    fs::create_dir_all(&work)?;
    let result = (|| {
        let source = work.join("input.wav");
        let adapter = work.join("inference.py");
        fs::write(&adapter, include_str!("inference.py"))?;
        let run = |args: Vec<String>| app.media.run(&app.media.ffmpeg, &args, 180);
        run(vec![
            "-y".into(),
            "-v".into(),
            "error".into(),
            "-i".into(),
            input.to_string_lossy().into(),
            "-ar".into(),
            "44100".into(),
            "-ac".into(),
            "2".into(),
            "-c:a".into(),
            "pcm_f32le".into(),
            source.to_string_lossy().into(),
        ])?;
        app.media.run(
            &python.to_string_lossy(),
            &[
                adapter.to_string_lossy().into(),
                source.to_string_lossy().into(),
                work.to_string_lossy().into(),
            ],
            1800,
        )?;
        let sound_root = root(app).join("sounds");
        fs::create_dir_all(&sound_root)?;
        let mut records = vec![];
        for stem in ["vocals", "drums", "bass", "other"] {
            let file = work.join(format!("{stem}.wav"));
            let pcm = work.join(format!("{stem}.f32"));
            run(vec![
                "-y".into(),
                "-v".into(),
                "error".into(),
                "-i".into(),
                file.to_string_lossy().into(),
                "-ar".into(),
                "16000".into(),
                "-ac".into(),
                "1".into(),
                "-f".into(),
                "f32le".into(),
                pcm.to_string_lossy().into(),
            ])?;
            let samples = floats(&fs::read(pcm)?)?;
            let duration = samples.len() as f64 / 16000.0;
            let mut spans = vec![(0.0, duration, "stem".to_string())];
            if ["drums", "other"].contains(&stem) {
                spans.extend(
                    candidates(&samples, 16000)
                        .into_iter()
                        .enumerate()
                        .map(|(n, (s, e))| (s, e, format!("candidate-{n:02}"))),
                );
            }
            for (start, end, suffix) in spans {
                let sound_id = format!("{id}-{stem}-{suffix}");
                if app.db.get::<Sound>("template_sound", &sound_id).is_ok() {
                    continue;
                }
                let output = sound_root.join(format!("{sound_id}.wav"));
                let temporary = work.join(format!("{sound_id}.wav"));
                run(vec![
                    "-y".into(),
                    "-v".into(),
                    "error".into(),
                    "-i".into(),
                    file.to_string_lossy().into(),
                    "-ss".into(),
                    start.to_string(),
                    "-t".into(),
                    (end - start).to_string(),
                    "-c:a".into(),
                    "pcm_f32le".into(),
                    temporary.to_string_lossy().into(),
                ])?;
                let (peak, rms) = metrics(
                    &samples[(start * 16000.0) as usize
                        ..((end * 16000.0).round() as usize).min(samples.len())],
                );
                let hash = storage::hash(&temporary)?;
                fs::rename(temporary, output)?;
                records.push(Sound {
                    id: sound_id, revision: 1, name: format!("{} · {stem} · {suffix}", audit["name"].as_str().unwrap_or(id)),
                    status: "review".into(), kind: if suffix=="stem" {"stem"} else {"candidate"}.into(),
                    source_id: id.into(), start_seconds: start, end_seconds: end,
                    description: "Demucs 音乐分轨结果，可能残留人声或伴奏；瞬态候选不等于独立音效，需试听确认。".into(),
                    tags: vec![stem.into()], source_sha256: source_hash.clone(), audio_sha256: hash,
                    algorithm: "demucs-4.0.1/htdemucs/shifts-1/seed-0".into(), peak, rms, derivation: None,
                });
            }
        }
        app.db.transaction(|db| {
            for record in &records {
                store::put(db, "template_sound", &record.id, record)?;
            }
            Ok(())
        })
    })();
    let _ = fs::remove_dir_all(work);
    result
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Review {
    pub base_revision: u64,
    pub status: String,
    pub kind: String,
    pub name: String,
    pub description: String,
    pub tags: Vec<String>,
}
pub fn review(app: &App, id: &str, input: Review) -> Result<Sound> {
    ensure!(
        ["review", "approved", "rejected"].contains(&input.status.as_str()),
        "invalid review status"
    );
    ensure!(
        ["stem", "candidate", "sound_effect", "background_music"].contains(&input.kind.as_str()),
        "invalid sound kind"
    );
    ensure!(
        input.status != "approved"
            || ["sound_effect", "background_music"].contains(&input.kind.as_str()),
        "确认后请指定音效或背景音乐类型"
    );
    ensure!(
        !input.name.trim().is_empty()
            && input.name.len() <= 300
            && input.description.len() <= 4000
            && input.tags.len() <= 30,
        "invalid sound metadata"
    );
    let path = sound_file(app, id)?;
    let hash = storage::hash(&path)?;
    app.db.transaction(|db| {
        let mut sound: Sound = store::get(db, "template_sound", id)?;
        ensure!(sound.revision == input.base_revision, "revision_conflict");
        ensure!(sound.audio_sha256 == hash, "音频文件已变化，请重新分析");
        sound.revision = sound.revision.checked_add(1).context("revision overflow")?;
        sound.status = input.status;
        sound.kind = input.kind;
        sound.name = input.name;
        sound.description = input.description;
        sound.tags = input.tags;
        store::put(db, "template_sound", id, &sound)?;
        store::put(
            db,
            "template_sound_review",
            &format!("{id}-r{}", sound.revision),
            &sound,
        )?;
        Ok(sound)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn silence_and_steady_tone_do_not_become_effects() {
        assert!(candidates(&vec![0.0; 32000], 16000).is_empty());
        assert!(candidates(&vec![0.1; 32000], 16000).is_empty());
        let mut data = vec![0.0; 32000];
        data[8000..9000].fill(0.3);
        let spans = candidates(&data, 16000);
        assert_eq!(spans.len(), 1);
        assert!(spans[0].0 < 0.5 && spans[0].1 > 0.5625);
    }
    #[test]
    fn rejects_corrupt_pcm() {
        assert!(floats(&[1, 2, 3]).is_err());
        assert!(floats(&f32::NAN.to_le_bytes()).is_err());
    }
}
