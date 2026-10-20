use crate::{
    media::Media,
    service::{ApiError, App},
};
use anyhow::{Context, Result, ensure};
use axum::{
    Json,
    body::Body,
    extract::{Query, State},
    response::Response,
};
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{path::Path, sync::Arc};
use tokio::io::AsyncWriteExt;
use tokio_util::io::ReaderStream;

const MAX_UPLOAD: u64 = 2 * 1024 * 1024 * 1024;
static ENCODERS: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(2);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Options {
    bitrate: Option<u32>,
    quality: Option<String>,
}

impl Options {
    fn bitrate(&self) -> Result<u32> {
        let default = match self.quality.as_deref().unwrap_or("high") {
            "draft" | "low" => 96_000,
            "medium" => 128_000,
            "high" | "very_high" => 192_000,
            _ => anyhow::bail!("invalid audio quality"),
        };
        let bitrate = self.bitrate.unwrap_or(default);
        ensure!(
            (8_000..=1_024_000).contains(&bitrate),
            "invalid AAC bitrate"
        );
        Ok(bitrate)
    }
}

pub async fn capabilities() -> Json<Value> {
    Json(json!({"inputAudio":"pcm_f32le","outputAudio":"aac","video":"copy","maxBytes":MAX_UPLOAD}))
}

fn validate_input(probe: &Value) -> Result<()> {
    let streams = probe["streams"]
        .as_array()
        .context("missing export streams")?;
    ensure!(
        streams.len() == 2,
        "export must contain one video and one PCM audio track"
    );
    ensure!(
        streams
            .iter()
            .filter(|s| s["codec_type"] == "video")
            .count()
            == 1,
        "missing export video"
    );
    let audio = streams
        .iter()
        .find(|s| s["codec_type"] == "audio")
        .context("missing export audio")?;
    ensure!(
        audio["codec_name"] == "pcm_f32le",
        "export audio must be lossless float PCM"
    );
    Ok(())
}

fn encode(media: &Media, input: &Path, output: &Path, bitrate: u32) -> Result<()> {
    validate_input(&media.probe(input)?)?;
    // FFmpeg writes the AAC encoder's priming as an MP4 edit list. Keeping PCM
    // until this step avoids browser AAC output that omits its encoder delay.
    let args = vec![
        "-v".into(),
        "error".into(),
        "-nostdin".into(),
        "-y".into(),
        "-i".into(),
        input.to_string_lossy().into_owned(),
        "-map".into(),
        "0:v:0".into(),
        "-map".into(),
        "0:a:0".into(),
        "-c:v".into(),
        "copy".into(),
        "-c:a".into(),
        "aac".into(),
        "-b:a".into(),
        bitrate.to_string(),
        "-movflags".into(),
        "+faststart".into(),
        output.to_string_lossy().into_owned(),
    ];
    media.run(&media.ffmpeg, &args, 1800)?;
    Ok(())
}

pub async fn finalize(
    State(app): State<Arc<App>>,
    Query(options): Query<Options>,
    body: Body,
) -> Result<Response, ApiError> {
    let bitrate = options.bitrate()?;
    let permit = ENCODERS.acquire().await?;
    let root = app.config.data_dir.join("export-audio");
    tokio::fs::create_dir_all(&root).await?;
    let dir = tempfile::tempdir_in(root)?;
    let input = dir.path().join("input.mov");
    let output = dir.path().join("output.mp4");
    let mut file = tokio::fs::File::create(&input).await?;
    let mut stream = body.into_data_stream();
    let mut size = 0_u64;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        size += chunk.len() as u64;
        if size > MAX_UPLOAD {
            return Err(anyhow::anyhow!("PCM export exceeds 2 GiB upload limit").into());
        }
        file.write_all(&chunk).await?;
    }
    file.flush().await?;
    drop(file);
    let (dir, output, permit) = tokio::task::spawn_blocking(move || {
        encode(&app.media, &input, &output, bitrate)?;
        Ok::<_, anyhow::Error>((dir, output, permit))
    })
    .await??;
    drop(permit);
    let file = tokio::fs::File::open(output).await?;
    let length = file.metadata().await?.len();
    // The temporary directory remains alive until the response completes or is
    // disconnected; cancellation during encoding leaves it with the worker.
    let stream = futures_util::stream::unfold(
        (ReaderStream::new(file), dir),
        |(mut reader, dir)| async move { reader.next().await.map(|chunk| (chunk, (reader, dir))) },
    );
    Ok(Response::builder()
        .header("content-type", "video/mp4")
        .header("content-length", length.to_string())
        .body(Body::from_stream(stream))?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_lossless_intermediates_are_accepted() {
        let probe = |codec| json!({"streams":[{"codec_type":"video"},{"codec_type":"audio","codec_name":codec}]});
        assert!(validate_input(&probe("pcm_f32le")).is_ok());
        assert!(validate_input(&probe("aac")).is_err());
        assert!(
            validate_input(&json!({"streams":[{"codec_type":"audio","codec_name":"pcm_f32le"}]}))
                .is_err()
        );
    }

    #[test]
    fn bitrate_is_bounded_and_quality_is_validated() {
        assert_eq!(
            Options {
                bitrate: None,
                quality: Some("high".into())
            }
            .bitrate()
            .unwrap(),
            192_000
        );
        assert_eq!(
            Options {
                bitrate: Some(192_000),
                quality: None
            }
            .bitrate()
            .unwrap(),
            192_000
        );
        assert!(
            Options {
                bitrate: Some(0),
                quality: None
            }
            .bitrate()
            .is_err()
        );
        assert!(
            Options {
                bitrate: None,
                quality: Some("unknown".into())
            }
            .bitrate()
            .is_err()
        );
    }

    #[test]
    #[ignore = "requires ffmpeg and ffprobe (FFMPEG_BIN / FFPROBE_BIN)"]
    fn native_aac_preserves_sample_alignment_and_video_frames() {
        let dir = tempfile::tempdir().unwrap();
        let media = Media {
            root: dir.path().into(),
            ffmpeg: std::env::var("FFMPEG_BIN").unwrap_or("ffmpeg".into()),
            ffprobe: std::env::var("FFPROBE_BIN").unwrap_or("ffprobe".into()),
        };
        let input = dir.path().join("input.mov");
        let output = dir.path().join("output.mp4");
        let args = [
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=64x64:rate=30:duration=1",
            "-f",
            "lavfi",
            "-i",
            "aevalsrc=0.2*sin(2*PI*(400*t+600*t*t)):s=44100:d=1",
            "-c:v",
            "libx264",
            "-c:a",
            "pcm_f32le",
        ]
        .map(str::to_string)
        .into_iter()
        .chain([input.to_string_lossy().into_owned()])
        .collect::<Vec<_>>();
        media.run(&media.ffmpeg, &args, 30).unwrap();
        encode(&media, &input, &output, 192_000).unwrap();
        assert!(encode(&media, &output, &dir.path().join("double.mp4"), 192_000).is_err());
        let pcm = |file: &Path, name: &str| {
            let target = dir.path().join(name);
            let args = vec![
                "-v".into(),
                "error".into(),
                "-i".into(),
                file.to_string_lossy().into_owned(),
                "-map".into(),
                "0:a:0".into(),
                "-f".into(),
                "f32le".into(),
                target.to_string_lossy().into_owned(),
            ];
            media.run(&media.ffmpeg, &args, 30).unwrap();
            std::fs::read(target)
                .unwrap()
                .chunks_exact(4)
                .map(|c| f32::from_le_bytes(c.try_into().unwrap()) as f64)
                .collect::<Vec<_>>()
        };
        let original = pcm(&input, "original.pcm");
        let encoded = pcm(&output, "encoded.pcm");
        assert!(encoded.len() >= original.len());
        // Correlation around zero detects the former 2112-sample delay. Compare
        // beginning/end windows separately so trimming speech cannot pass.
        for (start, end) in [(3000, 41000), (100, 2000), (42000, 44000)] {
            let score = |lag: isize| {
                let (mut ab, mut aa, mut bb) = (0.0, 0.0, 0.0);
                for i in (start..end).step_by(3) {
                    let (a, b) = (original[i], encoded[(i as isize + lag) as usize]);
                    ab += a * b;
                    aa += a * a;
                    bb += b * b;
                }
                ab / (aa * bb).sqrt()
            };
            assert!(score(0) > 0.98, "AAC lost boundary audio");
            if start == 3000 {
                let best = (-2500..=2500)
                    .max_by(|a, b| score(*a).total_cmp(&score(*b)))
                    .unwrap();
                assert_eq!(best, 0, "AAC introduced sample delay");
            }
        }
        let frames = |file: &Path| {
            media
                .run(
                    &media.ffmpeg,
                    &vec![
                        "-v".into(),
                        "error".into(),
                        "-i".into(),
                        file.to_string_lossy().into_owned(),
                        "-map".into(),
                        "0:v:0".into(),
                        "-f".into(),
                        "framemd5".into(),
                        "-".into(),
                    ],
                    30,
                )
                .unwrap()
                .lines()
                .filter(|line| !line.starts_with('#'))
                .map(str::to_string)
                .collect::<Vec<_>>()
        };
        assert_eq!(frames(&input), frames(&output));
    }
}
