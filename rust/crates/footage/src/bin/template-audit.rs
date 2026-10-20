use anyhow::{Context, Result, ensure};
use moirai_footage::{
    media::{Media, strings},
    service::Config,
};
use serde_json::{Value, json};
use std::{fs, path::PathBuf};

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    ensure!(
        args.len() == 4,
        "usage: template-audit CONFIG CATALOG OUTPUT"
    );
    let config: Config = serde_json::from_slice(&fs::read(&args[1])?)?;
    let catalog_path = PathBuf::from(&args[2]).canonicalize()?;
    let base = catalog_path.parent().context("catalog directory missing")?;
    let catalog: Value = serde_json::from_slice(&fs::read(&catalog_path)?)?;
    let output = PathBuf::from(&args[3]);
    fs::create_dir_all(&output)?;
    let media = Media {
        ffmpeg: config.ffmpeg,
        ffprobe: config.ffprobe,
        root: output.clone(),
    };
    let mut reports = vec![];
    for item in catalog["items"].as_array().context("missing items")? {
        let id = item["id"].as_u64().context("missing ID")?;
        let input = base.join(
            item["preview"]
                .as_str()
                .context("missing downloaded preview")?,
        );
        let dir = output.join(format!("reference-{id:02}"));
        fs::create_dir_all(&dir)?;
        let probe = media.probe(&input)?;
        let duration: f64 = probe["format"]["duration"]
            .as_str()
            .context("duration missing")?
            .parse()?;
        let streams = probe["streams"].as_array().context("streams missing")?;
        let video = streams
            .iter()
            .find(|s| s["codec_type"] == "video")
            .context("video missing")?;
        let audio = streams.iter().find(|s| s["codec_type"] == "audio");
        media.run(
            &media.ffmpeg,
            &strings(&[
                "-v",
                "error",
                "-xerror",
                "-i",
                &input.to_string_lossy(),
                "-f",
                "null",
                "-",
            ]),
            120,
        )?;
        let waveform = dir.join("audio.f32le");
        let mut peak = 0.0_f64;
        let mut energy = 0.0_f64;
        let mut count = 0;
        if audio.is_some() {
            media.run(
                &media.ffmpeg,
                &strings(&[
                    "-y",
                    "-v",
                    "error",
                    "-i",
                    &input.to_string_lossy(),
                    "-vn",
                    "-ac",
                    "2",
                    "-ar",
                    "48000",
                    "-f",
                    "f32le",
                    &waveform.to_string_lossy(),
                ]),
                120,
            )?;
            let bytes = fs::read(&waveform)?;
            for chunk in bytes.chunks_exact(4) {
                let v = f32::from_le_bytes(chunk.try_into().unwrap()) as f64;
                ensure!(v.is_finite(), "invalid audio sample");
                peak = peak.max(v.abs());
                energy += v * v;
                count += 1;
            }
            if peak > 0.0000316228 {
                media.run(
                    &media.ffmpeg,
                    &strings(&[
                        "-y",
                        "-v",
                        "error",
                        "-i",
                        &input.to_string_lossy(),
                        "-vn",
                        "-c:a",
                        "pcm_s24le",
                        &dir.join("mix.wav").to_string_lossy(),
                    ]),
                    120,
                )?;
            }
            fs::remove_file(waveform)?;
        }
        let times: Vec<f64> = (0..12)
            .map(|i| (i as f64 + 0.5) * duration / 12.0)
            .collect();
        let filters = format!(
            "fps={}/{}:start_time={},scale=240:320:force_original_aspect_ratio=decrease,pad=240:320:(ow-iw)/2:(oh-ih)/2:color=0xeeeeee,tile=4x3",
            12, duration, times[0]
        );
        media.run(
            &media.ffmpeg,
            &strings(&[
                "-y",
                "-v",
                "error",
                "-i",
                &input.to_string_lossy(),
                "-vf",
                &filters,
                "-frames:v",
                "1",
                "-update",
                "1",
                &dir.join("sequence.jpg").to_string_lossy(),
            ]),
            120,
        )?;
        fs::copy(&input, dir.join("reference.mp4"))?;
        let report = json!({"id":format!("reference-{id:02}"),"name":item["name"],"sourceUrl":item["previewUrl"],"durationSeconds":duration,"width":video["width"],"height":video["height"],"sequenceTimes":times,"decodeCheck":"passed","audio":{"hasStream":audio.is_some(),"decodedSamples":count,"peak":peak,"rms":if count>0 {(energy/count as f64).sqrt()}else{0.0},"status":if audio.is_none(){"no_audio"}else if peak==0.0{"digital_silence"}else if peak<=0.0000316228{"below_minus_90_dbfs"}else{"needs_separation"},"extractedEffects":0},"visualAnalysisStatus":"pending"});
        fs::write(dir.join("audit.json"), serde_json::to_vec_pretty(&report)?)?;
        println!(
            "{} {} audio={} peak={}",
            id, item["name"], report["audio"]["status"], peak
        );
        reports.push(report);
        fs::write(
            output.join("audit.json"),
            serde_json::to_vec_pretty(
                &json!({"schemaVersion":"moirai.reference-audit.v1","references":reports}),
            )?,
        )?;
    }
    Ok(())
}
