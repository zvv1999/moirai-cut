use moirai_footage::media::{Media, strings};

#[test]
#[ignore = "Requires MOIRAI_FFMPEG and MOIRAI_FFPROBE native executables"]
fn model_video_proxies_have_fixed_720p_dimensions() {
    let directory = tempfile::tempdir().unwrap();
    let media = Media {
        ffmpeg: std::env::var("MOIRAI_FFMPEG").expect("MOIRAI_FFMPEG"),
        ffprobe: std::env::var("MOIRAI_FFPROBE").expect("MOIRAI_FFPROBE"),
        root: directory.path().into(),
    };
    for (name, size, rotate, expected) in [
        ("portrait", "1080x1920", false, (720, 1280)),
        ("landscape", "1920x1080", false, (1280, 720)),
        ("square", "640x640", false, (1280, 720)),
        ("small", "180x320", false, (720, 1280)),
        ("rotated", "1920x1080", true, (720, 1280)),
    ] {
        let input = directory.path().join(format!("{name}.mp4"));
        media
            .run(
                &media.ffmpeg,
                &strings(&[
                    "-y",
                    "-v",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    &format!("testsrc2=size={size}:rate=4"),
                    "-t",
                    "0.5",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "ultrafast",
                    &input.to_string_lossy(),
                ]),
                60,
            )
            .unwrap();
        let input = if rotate {
            let rotated = directory.path().join("rotation-tag.mp4");
            media
                .run(
                    &media.ffmpeg,
                    &strings(&[
                        "-y",
                        "-v",
                        "error",
                        "-i",
                        &input.to_string_lossy(),
                        "-c",
                        "copy",
                        "-metadata:s:v:0",
                        "rotate=90",
                        &rotated.to_string_lossy(),
                    ]),
                    60,
                )
                .unwrap();
            rotated
        } else {
            input
        };
        let source = media
            .source(
                &input,
                name.into(),
                String::new(),
                String::new(),
                String::new(),
                name.into(),
            )
            .unwrap();
        assert!(
            media.verify_analysis_proxy(&source, &input).is_err(),
            "arbitrary input dimensions must be rejected: {name}"
        );
        let output = directory.path().join(format!("{name}-720p.mp4"));
        media.analysis_clip(&source, 0.0, 0.5, &output).unwrap();
        let probe = media.probe(&output).unwrap();
        assert_eq!(probe["streams"][0]["width"], expected.0, "{name}");
        assert_eq!(probe["streams"][0]["height"], expected.1, "{name}");
        assert_eq!(probe["streams"][0]["sample_aspect_ratio"], "1:1", "{name}");
        assert_eq!(probe["streams"][0]["pix_fmt"], "yuv420p", "{name}");
    }
}
