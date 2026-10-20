use crate::{domain::TICKS, service::App};
use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};
use std::{
    fs,
    io::{BufReader, Read},
    path::Path,
};

fn number(value: &Value) -> Option<f64> {
    value
        .as_f64()
        .or_else(|| value.as_str().and_then(|v| v.parse().ok()))
}

// Match the editor's audio export selection: visibility is independent of mute,
// solo applies across audio/video tracks, and detached video audio is disabled.
pub fn expected_audio(
    document: &Value,
    scene_id: &str,
    media: &Value,
) -> Result<Option<(f64, f64)>> {
    let scene = document["scenes"]
        .as_array()
        .context("missing scenes")?
        .iter()
        .find(|s| s["id"] == scene_id)
        .context("preview scene missing")?;
    let tracks = &scene["tracks"];
    let all: Vec<_> = std::iter::once(&tracks["main"])
        .chain(tracks["overlay"].as_array().into_iter().flatten())
        .chain(tracks["audio"].as_array().into_iter().flatten())
        .collect();
    let capable = |t: &&Value| matches!(t["type"].as_str(), Some("video" | "audio"));
    let solo = all
        .iter()
        .copied()
        .filter(capable)
        .any(|t| t["solo"] == true);
    let mut range: Option<(f64, f64)> = None;
    for track in all.iter().copied().filter(capable) {
        if track["muted"] == true || solo && track["solo"] != true {
            continue;
        }
        for e in track["elements"].as_array().into_iter().flatten() {
            if e["params"]["muted"] == true {
                continue;
            }
            let active = e["type"] == "audio"
                || e["type"] == "video"
                    && e["isSourceAudioEnabled"] != false
                    && e["mediaId"]
                        .as_str()
                        .is_some_and(|id| media[id].is_object() && media[id]["hasAudio"] != false);
            let duration = e["duration"].as_f64().unwrap_or(0.) / TICKS as f64;
            if !active || duration <= 0. {
                continue;
            }
            let start = e["startTime"].as_f64().context("audio start missing")? / TICKS as f64;
            range = Some(range.map_or((start, start + duration), |(a, b)| {
                (a.min(start), b.max(start + duration))
            }));
        }
    }
    Ok(range)
}

pub fn validate_streams(
    probe: &Value,
    duration: f64,
    expected: Option<(f64, f64)>,
) -> Result<Value> {
    let streams = probe["streams"]
        .as_array()
        .context("preview streams missing")?;
    let video = streams
        .iter()
        .find(|s| s["codec_type"] == "video")
        .context("preview has no video")?;
    let video_start = number(&video["start_time"]).unwrap_or(0.);
    let video_duration = number(&video["duration"]).context("preview video duration missing")?;
    ensure!(
        video_start.is_finite()
            && video_duration.is_finite()
            && video_start.abs() <= 0.1
            && (video_start + video_duration - duration).abs() <= 0.25,
        "preview video stream duration mismatch"
    );
    let audio = streams.iter().find(|s| s["codec_type"] == "audio");
    let mut evidence = json!({"validated":true,"required":expected.is_some(),"present":audio.is_some(),"expectedStartSeconds":expected.map(|v|v.0),"expectedEndSeconds":expected.map(|v|v.1)});
    if let Some((first, last)) = expected {
        let stream = audio.context("preview lost required audio track")?;
        let start = number(&stream["start_time"]).unwrap_or(0.);
        let length = number(&stream["duration"]).context("preview audio duration missing")?;
        ensure!(
            start.is_finite()
                && length.is_finite()
                && length > 0.
                && start <= first + 0.15
                && start + length >= last - 0.15,
            "preview audio track is truncated"
        );
        evidence["streamStartSeconds"] = json!(start);
        evidence["streamDurationSeconds"] = json!(length);
    }
    Ok(evidence)
}

pub fn measure_pcm(reader: impl Read) -> Result<Value> {
    let mut reader = BufReader::new(reader);
    let mut bytes = [0u8; 4];
    let mut samples = 0u64;
    let mut near_clip = 0u64;
    let mut sum = 0.;
    let mut peak = 0f64;
    while reader.read(&mut bytes[..1])? != 0 {
        reader.read_exact(&mut bytes[1..])?;
        let sample = f32::from_le_bytes(bytes) as f64;
        ensure!(sample.is_finite(), "invalid rendered audio sample");
        peak = peak.max(sample.abs());
        sum += sample * sample;
        samples += 1;
        if sample.abs() >= 0.999 {
            near_clip += 1;
        }
    }
    ensure!(
        samples > 0 && samples % 2 == 0,
        "empty or incomplete stereo preview audio"
    );
    let rms = (sum / samples as f64).sqrt();
    let mut warnings = vec![];
    if peak < 0.000001 {
        warnings.push("rendered_audio_near_silence");
    }
    if near_clip > 0 {
        warnings.push("rendered_audio_near_full_scale");
    }
    Ok(
        json!({"measurement":"decoded_stereo_pcm_16000hz","durationSeconds":samples as f64/32000.,
        "rmsDbfs":(rms>0.).then(||20.*rms.log10()),"samplePeakDbfs":(peak>0.).then(||20.*peak.log10()),
        "nearFullScaleSampleFraction":near_clip as f64/samples as f64,"warnings":warnings,
        "perceptualQualityVerified":false}),
    )
}

pub fn audit(
    app: &App,
    file: &Path,
    probe: &Value,
    expected_duration: f64,
    fixture: &Value,
) -> Result<Value> {
    let request: super::compiler::CompileInput =
        serde_json::from_value(fixture["request"].clone())?;
    validate_input_audio(
        &request,
        &fixture["compilation"]["document"],
        fixture["allowSilentPreviews"] == true,
    )?;
    let expected = expected_audio(
        &fixture["compilation"]["document"],
        fixture["request"]["sceneId"]
            .as_str()
            .context("fixture scene missing")?,
        &fixture["request"]["media"],
    )?;
    let mut result = validate_streams(probe, expected_duration, expected)?;
    if result["present"] == true {
        let pcm = file.with_file_name(format!("audio-audit-{}.f32", crate::domain::id()));
        let measurement = (|| {
            app.media.run(
                &app.media.ffmpeg,
                &[
                    "-v".into(),
                    "error".into(),
                    "-xerror".into(),
                    "-i".into(),
                    file.to_string_lossy().into(),
                    "-map".into(),
                    "0:a:0".into(),
                    "-vn".into(),
                    "-ac".into(),
                    "2".into(),
                    "-ar".into(),
                    "16000".into(),
                    "-f".into(),
                    "f32le".into(),
                    pcm.to_string_lossy().into(),
                ],
                180,
            )?;
            measure_pcm(fs::File::open(&pcm)?)
        })();
        let _ = fs::remove_file(pcm);
        result["measurement"] = measurement?;
    }
    Ok(result)
}

pub fn validate_input_audio(
    request: &super::compiler::CompileInput,
    document: &Value,
    allow_silent: bool,
) -> Result<()> {
    if !allow_silent && !request.input.words.is_empty() {
        ensure!(
            expected_audio(document, &request.scene_id, &request.media)?.is_some(),
            "speech fixture has no audible timeline source; add narration or explicitly set allowSilentPreviews"
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_missing_truncated_audio_and_short_video_hidden_by_container_duration() {
        let video = json!({"codec_type":"video","duration":"7.0","start_time":"0"});
        assert!(validate_streams(&json!({"streams":[video]}), 7., Some((0., 7.))).is_err());
        assert!(validate_streams(&json!({"streams":[video]}), 7., None).is_ok());
        let audio = json!({"codec_type":"audio","duration":"7.05","start_time":"0"});
        assert!(validate_streams(&json!({"streams":[video,audio]}), 7., Some((0., 7.))).is_ok());
        let short = json!({"codec_type":"audio","duration":"1.0"});
        assert!(validate_streams(&json!({"streams":[video,short]}), 7., Some((0., 7.))).is_err());
        let late = json!({"codec_type":"audio","duration":"7","start_time":"1"});
        assert!(validate_streams(&json!({"streams":[video,late]}), 7., Some((0., 7.))).is_err());
        assert!(validate_streams(&json!({"streams":[{"codec_type":"video","duration":"1"},audio],"format":{"duration":"7"}}),7.,None).is_err());
    }
    #[test]
    fn audio_selection_obeys_mute_solo_and_detached_source_across_overlay_tracks() {
        let mut doc = json!({"scenes":[{"id":"scene","tracks":{"main":{"type":"video","elements":[]},"overlay":[{"type":"video","elements":[{"type":"video","mediaId":"video","startTime":0,"duration":120000,"params":{}}]}],"audio":[{"type":"audio","elements":[{"type":"audio","startTime":240000,"duration":120000,"params":{}}]}]}}]});
        let media = json!({"video":{"hasAudio":true}});
        assert_eq!(
            expected_audio(&doc, "scene", &media).unwrap(),
            Some((0., 3.))
        );
        doc["scenes"][0]["tracks"]["overlay"][0]["elements"][0]["isSourceAudioEnabled"] =
            json!(false);
        assert_eq!(
            expected_audio(&doc, "scene", &media).unwrap(),
            Some((2., 3.))
        );
        doc["scenes"][0]["tracks"]["overlay"][0]["solo"] = json!(true);
        assert_eq!(expected_audio(&doc, "scene", &media).unwrap(), None);
        doc["scenes"][0]["tracks"]["audio"][0]["solo"] = json!(true);
        doc["scenes"][0]["tracks"]["audio"][0]["elements"][0]["params"]["muted"] = json!(true);
        assert_eq!(expected_audio(&doc, "scene", &media).unwrap(), None);
    }
    #[test]
    fn stereo_measurement_preserves_antiphase_energy_and_reports_silence() {
        let pcm = [0.5f32, -0.5, 1., -1.]
            .into_iter()
            .flat_map(f32::to_le_bytes)
            .collect::<Vec<_>>();
        let metrics = measure_pcm(&pcm[..]).unwrap();
        assert_eq!(metrics["samplePeakDbfs"], 0.);
        assert_eq!(metrics["nearFullScaleSampleFraction"], 0.5);
        assert!(metrics["rmsDbfs"].as_f64().unwrap() > -3.);
        let silence = measure_pcm(&[0u8; 8][..]).unwrap();
        assert_eq!(silence["warnings"][0], "rendered_audio_near_silence");
        assert!(measure_pcm(&[0u8; 3][..]).is_err());
    }
}
