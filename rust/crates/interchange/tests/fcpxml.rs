use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use interchange::{
    ErrorCode, FcpxmlExportOptions, FcpxmlVersion, InterchangeTarget, IssueSeverity,
    export_fcpxml,
};
use quick_xml::Reader;
use serde_json::{Value, json};

const SECOND: i64 = 120_000;

struct Fixture {
    root: PathBuf,
    media_root: PathBuf,
    project: Value,
    media_index: Value,
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn temp_fixture() -> Fixture {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let root = std::env::temp_dir().join(format!(
        "moirai-interchange-{}-{nonce}",
        std::process::id()
    ));
    let media_root = root.join("media");
    fs::create_dir_all(&media_root).expect("media directory");
    for file in ["main.mp4", "overlay.mov", "voice.wav", "hidden.mp4"] {
        fs::write(media_root.join(file), b"fixture").expect("fixture media");
    }

    let element = |id: &str,
                   name: &str,
                   kind: &str,
                   media_id: Option<&str>,
                   start: i64,
                   duration: i64,
                   trim_start: i64| {
        let mut value = json!({
            "id": id,
            "name": name,
            "type": kind,
            "startTime": start,
            "duration": duration,
            "trimStart": trim_start,
            "trimEnd": 0,
            "sourceDuration": 20 * SECOND,
            "params": {}
        });
        if let Some(media_id) = media_id {
            value["mediaId"] = json!(media_id);
        }
        value
    };

    let mut first = element(
        "main-a",
        "第一段 & A",
        "video",
        Some("main"),
        0,
        4 * SECOND,
        SECOND,
    );
    first["transitionIn"] = json!({
        "id": "transition-1",
        "type": "cross-dissolve",
        "duration": SECOND / 2,
        "from": { "trackId": "main-track", "elementId": "before" },
        "originalTrackId": "main-track",
        "originalStartTime": 0
    });
    let second = element(
        "main-b",
        "第二段",
        "video",
        Some("main"),
        5 * SECOND,
        3 * SECOND,
        10 * SECOND,
    );
    let overlay = element(
        "overlay-1",
        "画中画",
        "video",
        Some("overlay"),
        6 * SECOND,
        SECOND,
        SECOND,
    );
    let voice = element(
        "voice-1",
        "旁白",
        "audio",
        Some("voice"),
        SECOND,
        2 * SECOND,
        SECOND / 2,
    );
    let caption = element(
        "caption-1",
        "字幕",
        "text",
        None,
        2 * SECOND,
        SECOND,
        0,
    );
    let hidden = element(
        "hidden-1",
        "隐藏素材",
        "video",
        Some("hidden"),
        0,
        SECOND,
        0,
    );

    let project = json!({
        "metadata": {
            "id": "project-xml",
            "name": "剪映互通 & Demo",
            "duration": 8 * SECOND
        },
        "revision": 7,
        "version": 31,
        "currentSceneId": "scene-main",
        "settings": {
            "fps": { "numerator": 30_000, "denominator": 1_001 },
            "canvasSize": { "width": 1_920, "height": 1_080 }
        },
        "scenes": [{
            "id": "scene-main",
            "name": "主场景",
            "isMain": true,
            "bookmarks": [{
                "id": "marker-1",
                "time": 6 * SECOND,
                "name": "检查点",
                "note": "与参考片核对"
            }],
            "tracks": {
                "main": {
                    "id": "main-track",
                    "name": "主轨",
                    "type": "video",
                    "muted": false,
                    "hidden": false,
                    "elements": [first, second]
                },
                "overlay": [{
                    "id": "text-track",
                    "name": "字幕轨",
                    "type": "text",
                    "hidden": false,
                    "elements": [caption]
                }, {
                    "id": "overlay-track",
                    "name": "叠加轨",
                    "type": "video",
                    "muted": false,
                    "hidden": false,
                    "elements": [overlay]
                }, {
                    "id": "hidden-track",
                    "name": "隐藏轨",
                    "type": "video",
                    "muted": false,
                    "hidden": true,
                    "elements": [hidden]
                }],
                "audio": [{
                    "id": "voice-track",
                    "name": "对白",
                    "type": "audio",
                    "muted": false,
                    "elements": [voice]
                }]
            }
        }]
    });
    let media_index = json!({
        "main": {
            "id": "main", "name": "主素材 & one.mp4", "type": "video",
            "ext": "mp4", "duration": 20, "width": 1920, "height": 1080,
            "hasAudio": true
        },
        "overlay": {
            "id": "overlay", "name": "叠加.mov", "type": "video",
            "ext": "mov", "duration": 3, "width": 1280, "height": 720,
            "hasAudio": false
        },
        "voice": {
            "id": "voice", "name": "旁白.wav", "type": "audio",
            "ext": "wav", "duration": 4, "hasAudio": true
        },
        "hidden": {
            "id": "hidden", "name": "隐藏.mp4", "type": "video",
            "ext": "mp4", "duration": 1, "width": 1920, "height": 1080,
            "hasAudio": false
        }
    });

    Fixture {
        root,
        media_root,
        project,
        media_index,
    }
}

fn options(expected_revision: u64) -> FcpxmlExportOptions {
    FcpxmlExportOptions {
        expected_revision: Some(expected_revision),
        scene_id: None,
        version: FcpxmlVersion::V1_10,
        target: InterchangeTarget::JianyingDesktop,
    }
}

#[test]
fn exports_revision_bound_fcpxml_with_connected_tracks_and_loss_report() {
    let fixture = temp_fixture();
    let exported = export_fcpxml(
        &fixture.project,
        &fixture.media_index,
        &fixture.media_root,
        options(7),
    )
    .expect("export succeeds");

    assert_eq!(exported.report.schema, "moirai-cut.interchange-report.v1");
    assert_eq!(exported.report.source.revision, 7);
    assert_eq!(exported.report.source.scene_id, "scene-main");
    assert_eq!(exported.report.adapter.format, "fcpxml");
    assert_eq!(exported.report.adapter.version, "1.10");
    assert_eq!(exported.report.adapter.target, InterchangeTarget::JianyingDesktop);

    assert!(exported.document.starts_with("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));
    assert!(exported.document.contains("<!DOCTYPE fcpxml>"));
    assert!(exported.document.contains("<fcpxml version=\"1.10\">"));
    assert!(exported.document.contains("frameDuration=\"1001/30000s\""));
    assert!(exported.document.contains("name=\"剪映互通 &amp; Demo\""));
    assert!(exported.document.contains("name=\"主素材 &amp; one.mp4\""));
    assert!(exported.document.contains("src=\"file://"));
    assert!(exported.document.contains("main.mp4"));

    // The one-second hole between main clips must survive as an editable gap.
    assert!(exported.document.contains("<gap name=\"Gap\" offset=\"4s\" duration=\"1s\""));
    // The overlay starts at timeline 6s inside a main clip whose timeline/source
    // starts are 5s/10s, so its parent-local FCPXML offset is 11s.
    assert!(exported.document.contains("name=\"叠加.mov\" ref=\"r3\" lane=\"2\" offset=\"11s\""));
    // Audio at timeline 1s is connected to the first clip, which starts at source
    // 1s. Its parent-local offset is therefore 2s, not the absolute 1s.
    assert!(exported.document.contains("name=\"旁白.wav\" ref=\"r4\" lane=\"-1\" offset=\"2s\""));
    assert!(exported.document.contains("<marker start=\"11s\" value=\"检查点\""));

    let mut reader = Reader::from_str(&exported.document);
    loop {
        match reader.read_event() {
            Ok(quick_xml::events::Event::Eof) => break,
            Ok(_) => {}
            Err(error) => panic!("well-formed XML expected: {error}"),
        }
    }

    assert!(exported.report.issues.iter().any(|issue| {
        issue.code == "unsupported_text" && issue.element_id.as_deref() == Some("caption-1")
    }));
    assert!(exported.report.issues.iter().any(|issue| {
        issue.code == "hidden_track_omitted"
            && issue.track_id.as_deref() == Some("hidden-track")
    }));
    assert!(exported.report.issues.iter().any(|issue| {
        issue.code == "transition_flattened" && issue.severity == IssueSeverity::Degraded
    }));
    assert_eq!(exported.report.relink.assets.len(), 3);
    assert!(exported.report.relink.assets.iter().all(|asset| asset.exists));
}

#[test]
fn rejects_stale_revision_before_creating_a_derived_artifact() {
    let fixture = temp_fixture();
    let error = export_fcpxml(
        &fixture.project,
        &fixture.media_index,
        &fixture.media_root,
        options(6),
    )
    .expect_err("stale export must fail");

    assert_eq!(error.code, ErrorCode::RevisionConflict);
    assert!(error.to_string().contains("revision 7"));
}

#[test]
fn rejects_a_referenced_media_file_that_cannot_be_relinked() {
    let fixture = temp_fixture();
    fs::remove_file(fixture.media_root.join("overlay.mov")).expect("remove fixture media");

    let error = export_fcpxml(
        &fixture.project,
        &fixture.media_index,
        &fixture.media_root,
        options(7),
    )
    .expect_err("missing media must fail");

    assert_eq!(error.code, ErrorCode::MissingMedia);
    assert!(error.to_string().contains("overlay"));
}

#[test]
fn uses_a_gap_storyline_when_the_project_has_only_overlay_video() {
    let mut fixture = temp_fixture();
    let scene = &mut fixture.project["scenes"][0];
    scene["tracks"]["main"]["elements"] = json!([]);
    scene["tracks"]["overlay"] = json!([scene["tracks"]["overlay"][1].clone()]);
    scene["tracks"]["overlay"][0]["elements"][0]["startTime"] = json!(SECOND);
    scene["tracks"]["overlay"][0]["elements"][0]["duration"] = json!(2 * SECOND);
    fixture.project["metadata"]["duration"] = json!(3 * SECOND);

    let exported = export_fcpxml(
        &fixture.project,
        &fixture.media_index,
        &fixture.media_root,
        options(7),
    )
    .expect("overlay-only timeline exports");

    assert!(exported.document.contains("<gap name=\"Gap\" offset=\"0s\" duration=\"3s\""));
    assert!(exported.document.contains("name=\"叠加.mov\" ref=\"r2\" lane=\"1\" offset=\"1s\""));
}

#[allow(dead_code)]
fn assert_file_exists(path: &Path) {
    assert!(path.exists(), "{} should exist", path.display());
}
