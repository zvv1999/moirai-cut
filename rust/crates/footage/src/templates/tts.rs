use super::{
    api::root,
    transcription::{self, Input},
};
use crate::{domain::Job, service::App, storage};
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, sync::Mutex};

const ENGINE: &str = "macos-nsspeech-v1";
static GENERATION: Mutex<()> = Mutex::new(());

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Voice {
    id: String,
    name: String,
    locale: String,
    version: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Voices {
    available: bool,
    engine: &'static str,
    voices: Vec<Voice>,
    reason: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub name: String,
    pub text: String,
    pub voice_id: String,
    pub speaking_rate: u32,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Record {
    pub id: String,
    pub request: Request,
    pub voice: Voice,
    pub engine: String,
    pub engine_version: String,
    pub input: Input,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Generated {
    pub synthesis: Record,
    pub transcription_job: Job,
    pub deduplicated: bool,
}

pub fn voices(app: &App) -> Result<Voices> {
    if !cfg!(target_os = "macos") {
        return Ok(Voices {
            available: false,
            engine: ENGINE,
            voices: vec![],
            reason: Some("本地系统配音当前支持 macOS；其他平台可导入 TTS 音频。".into()),
        });
    }
    let result = app.media.run(
        "/usr/bin/osascript",
        &[
            "-l".into(),
            "JavaScript".into(),
            "-e".into(),
            include_str!("synthesize_speech.js").into(),
            "voices".into(),
        ],
        30,
    )?;
    let mut voices: Vec<Voice> = serde_json::from_str(&result)?;
    voices.sort_by(|a, b| a.locale.cmp(&b.locale).then(a.name.cmp(&b.name)));
    Ok(Voices {
        available: !voices.is_empty(),
        engine: ENGINE,
        voices,
        reason: None,
    })
}

fn validate(request: &Request) -> Result<()> {
    ensure!(
        !request.name.trim().is_empty() && request.name.len() <= 300,
        "配音名称必须为 1–300 字节"
    );
    ensure!(
        !request.text.trim().is_empty()
            && request.text.chars().count() <= 2000
            && !request.text.contains('\0')
            && !request.text.contains("[[")
            && !request.text.contains("]]"),
        "配音原文须为 1–2000 字符的普通文本，不支持系统语音控制标记"
    );
    ensure!(
        (80..=350).contains(&request.speaking_rate),
        "语速须在 80–350 之间"
    );
    Ok(())
}

pub fn generate(app: &App, request: Request) -> Result<Generated> {
    validate(&request)?;
    let _guard = GENERATION
        .lock()
        .map_err(|_| anyhow::anyhow!("speech generation lock failed"))?;
    let catalog = voices(app)?;
    ensure!(catalog.available, "当前系统没有本地配音引擎");
    let voice = catalog
        .voices
        .into_iter()
        .find(|v| v.id == request.voice_id)
        .ok_or_else(|| anyhow::anyhow!("所选音色不可用"))?;
    let engine_version = app
        .media
        .run("/usr/bin/sw_vers", &["-productVersion".into()], 10)?
        .trim()
        .to_owned();
    let id = format!(
        "tts-{:x}",
        Sha256::digest(serde_json::to_vec(&(
            ENGINE,
            &engine_version,
            &voice,
            &request
        ))?)
    );
    if let Some(record) = app
        .db
        .list::<Record>("template_tts")?
        .into_iter()
        .find(|r| r.id == id)
    {
        let file = transcription::file(app, &record.input.id, "original")?.0;
        ensure!(
            storage::hash(&file)? == record.input.sha256,
            "生成音频文件已变化"
        );
        return Ok(Generated {
            transcription_job: transcription::enqueue(app, &record.input.id)?,
            synthesis: record,
            deduplicated: true,
        });
    }
    let work = root(app).join("tts").join(crate::domain::id());
    fs::create_dir_all(&work)?;
    let result = (|| {
        let manifest = work.join("request.json");
        fs::write(&manifest, serde_json::to_vec(&request)?)?;
        let adapter = work.join("synthesize.js");
        fs::write(&adapter, include_str!("synthesize_speech.js"))?;
        let aiff = work.join("speech.aiff");
        app.media.run(
            "/usr/bin/osascript",
            &[
                "-l".into(),
                "JavaScript".into(),
                adapter.to_string_lossy().into(),
                manifest.to_string_lossy().into(),
                aiff.to_string_lossy().into(),
            ],
            180,
        )?;
        let wav = work.join("speech.wav");
        app.media.run(
            &app.media.ffmpeg,
            &[
                "-v".into(),
                "error".into(),
                "-i".into(),
                aiff.to_string_lossy().into(),
                "-map".into(),
                "0:a:0".into(),
                "-ar".into(),
                "44100".into(),
                "-ac".into(),
                "1".into(),
                "-c:a".into(),
                "pcm_s16le".into(),
                wav.to_string_lossy().into(),
            ],
            60,
        )?;
        let input = transcription::import(app, &wav, &request.name)?;
        ensure!(
            storage::hash(&transcription::file(app, &input.id, "original")?.0)? == input.sha256,
            "生成音频文件已变化"
        );
        let record = Record {
            id: id.clone(),
            request,
            voice,
            engine: ENGINE.into(),
            engine_version,
            input,
        };
        app.db.put("template_tts", &id, &record)?;
        Ok(Generated {
            transcription_job: transcription::enqueue(app, &record.input.id)?,
            synthesis: record,
            deduplicated: false,
        })
    })();
    let _ = fs::remove_dir_all(work);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_control_markup_and_invalid_rates_but_accepts_plain_script() {
        let mut r = Request {
            name: "配音".into(),
            text: "先讲案例，再讲方法。".into(),
            voice_id: "voice".into(),
            speaking_rate: 180,
        };
        assert!(validate(&r).is_ok());
        for text in ["", "[[rate 999]]内容", "内容\0", &"字".repeat(2001)] {
            r.text = text.into();
            assert!(validate(&r).is_err());
        }
        r.text = "有效文本".into();
        r.speaking_rate = 79;
        assert!(validate(&r).is_err());
        r.speaking_rate = 351;
        assert!(validate(&r).is_err());
    }
}
