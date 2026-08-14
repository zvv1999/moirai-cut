use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use interchange::{
    ErrorCode, FcpxmlExportOptions, FcpxmlVersion, InterchangeTarget, IssueSeverity, export_fcpxml,
};
use quick_xml::Reader;
use serde_json::{Value, json};

const SECOND: i64 = 120_000;
static FIXTURE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

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
    let sequence = FIXTURE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let root = std::env::temp_dir().join(format!(
        "moirai-interchange-{}-{nonce}-{sequence}",
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

    let first = element(
        "main-a",
        "第一段 & A",
        "video",
        Some("main"),
        0,
        4 * SECOND,
        SECOND,
    );
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
    let caption = element("caption-1", "字幕", "text", None, 2 * SECOND, SECOND, 0);
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

fn exported(fixture: &Fixture, options: FcpxmlExportOptions) -> interchange::InterchangeExport {
    export_fcpxml(
        &fixture.project,
        &fixture.media_index,
        &fixture.media_root,
        options,
    )
    .expect("export succeeds")
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
    assert_eq!(
        exported.report.adapter.target,
        InterchangeTarget::JianyingDesktop
    );

    assert!(
        exported
            .document
            .starts_with("<?xml version=\"1.0\" encoding=\"UTF-8\"?>")
    );
    assert!(exported.document.contains("<!DOCTYPE fcpxml>"));
    assert!(exported.document.contains("<fcpxml version=\"1.10\">"));
    assert!(
        exported
            .document
            .contains("<library><event name=\"Moirai Cut\">")
    );
    assert!(exported.document.contains("</event></library>"));
    assert!(exported.document.contains("frameDuration=\"1001/30000s\""));
    assert!(exported.document.contains("name=\"剪映互通 &amp; Demo\""));
    assert!(exported.document.contains("name=\"主素材 &amp; one.mp4\""));
    assert!(exported.document.contains("src=\"file://"));
    assert!(exported.document.contains("main.mp4"));

    // The one-second hole between main clips must survive as an editable gap.
    assert!(
        exported
            .document
            .contains("<gap name=\"Gap\" offset=\"4s\" duration=\"1s\"")
    );
    // The overlay starts at timeline 6s inside a main clip whose timeline/source
    // starts are 5s/10s, so its parent-local FCPXML offset is 11s.
    assert!(
        exported
            .document
            .contains("name=\"叠加.mov\" ref=\"r3\" lane=\"1\" offset=\"11s\"")
    );
    // Audio at timeline 1s is connected to the first clip, which starts at source
    // 1s. Its parent-local offset is therefore 2s, not the absolute 1s.
    assert!(
        exported
            .document
            .contains("name=\"旁白.wav\" ref=\"r4\" lane=\"-1\" offset=\"2s\"")
    );
    assert!(
        exported
            .document
            .contains("<marker start=\"11s\" value=\"检查点\"")
    );

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
        issue.code == "hidden_track_omitted" && issue.track_id.as_deref() == Some("hidden-track")
    }));
    assert_eq!(exported.report.relink.assets.len(), 3);
    assert!(
        exported
            .report
            .relink
            .assets
            .iter()
            .all(|asset| asset.exists)
    );
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

    assert!(
        exported
            .document
            .contains("<gap name=\"Gap\" offset=\"0s\" duration=\"3s\""),
        "{}",
        exported.document
    );
    assert!(
        exported
            .document
            .contains("name=\"叠加.mov\" ref=\"r2\" lane=\"1\" offset=\"1s\"")
    );
}

#[test]
fn rejects_an_explicit_scene_id_that_does_not_exist() {
    let fixture = temp_fixture();
    let mut selected = options(7);
    selected.scene_id = Some("missing-scene".to_owned());

    let error = export_fcpxml(
        &fixture.project,
        &fixture.media_index,
        &fixture.media_root,
        selected,
    )
    .expect_err("an explicit scene selection must never silently fall back");

    assert_eq!(error.code, ErrorCode::InvalidOptions);
    assert!(error.to_string().contains("missing-scene"));
}

#[test]
fn selected_scene_duration_does_not_inherit_the_main_scene_metadata_duration() {
    let mut fixture = temp_fixture();
    fixture.project["metadata"]["duration"] = json!(8 * SECOND);
    fixture.project["scenes"]
        .as_array_mut()
        .unwrap()
        .push(json!({
            "id": "scene-short",
            "name": "短场景",
            "isMain": false,
            "bookmarks": [],
            "tracks": {
                "main": {
                    "id": "short-main",
                    "name": "短主轨",
                    "type": "video",
                    "muted": false,
                    "hidden": false,
                    "elements": [{
                        "id": "short-clip",
                        "name": "短片段",
                        "type": "video",
                        "mediaId": "main",
                        "startTime": 0,
                        "duration": SECOND,
                        "trimStart": 0,
                        "trimEnd": 0,
                        "sourceDuration": 20 * SECOND,
                        "params": {}
                    }]
                },
                "overlay": [],
                "audio": []
            }
        }));
    let mut selected = options(7);
    selected.scene_id = Some("scene-short".to_owned());

    let export = exported(&fixture, selected);

    assert!(
        export
            .document
            .contains("<sequence format=\"r1\" duration=\"1s\"")
    );
    assert!(!export.document.contains("duration=\"8s\""));
}

#[test]
fn preserves_source_audio_separation_and_video_track_mute() {
    let mut separated = temp_fixture();
    separated.project["scenes"][0]["tracks"]["main"]["elements"][0]["isSourceAudioEnabled"] =
        json!(false);
    let separated_export = exported(&separated, options(7));
    assert!(separated_export.document.contains("name=\"主素材 &amp; one.mp4\" ref=\"r2\" offset=\"0s\" start=\"1s\" duration=\"4s\" srcEnable=\"video\""));

    let mut muted = temp_fixture();
    muted.project["scenes"][0]["tracks"]["main"]["muted"] = json!(true);
    let muted_export = exported(&muted, options(7));
    assert!(muted_export.document.contains("srcEnable=\"video\""));
    assert!(muted_export.report.issues.iter().any(|issue| {
        issue.code == "muted_track_audio_omitted" && issue.track_id.as_deref() == Some("main-track")
    }));
}

#[test]
fn audio_elements_reusing_video_media_select_only_the_audio_component() {
    let mut fixture = temp_fixture();
    fixture.project["scenes"][0]["tracks"]["audio"][0]["elements"][0]["mediaId"] = json!("main");

    let export = exported(&fixture, options(7));

    assert!(export.document.contains("lane=\"-1\""));
    assert!(export.document.contains("srcEnable=\"audio\""));
}

#[test]
fn omits_non_solo_audio_capable_tracks_when_any_track_is_soloed() {
    let mut fixture = temp_fixture();
    fixture.project["scenes"][0]["tracks"]["main"]["solo"] = json!(true);

    let export = exported(&fixture, options(7));

    assert!(!export.document.contains("旁白.wav"));
    assert!(export.report.issues.iter().any(|issue| {
        issue.code == "unsoloed_track_audio_omitted"
            && issue.track_id.as_deref() == Some("voice-track")
    }));
}

#[test]
fn default_built_in_media_params_do_not_create_false_loss_issues() {
    let mut fixture = temp_fixture();
    fixture.project["scenes"][0]["tracks"]["main"]["elements"][0]["params"] = json!({
        "transform.positionX": 0,
        "transform.positionY": 0,
        "transform.scaleX": 1,
        "transform.scaleY": 1,
        "transform.rotate": 0,
        "opacity": 1,
        "blendMode": "normal",
        "geometry.mirrorX": false,
        "geometry.mirrorY": false,
        "crop.left": 0,
        "crop.right": 0,
        "crop.top": 0,
        "crop.bottom": 0,
        "geometry.cornerRadius": 0,
        "geometry.shadow.enabled": false,
        "geometry.shadow.color": "#00000080",
        "geometry.shadow.blur": 0,
        "geometry.shadow.offsetX": 0,
        "geometry.shadow.offsetY": 8,
        "geometry.stroke.width": 0,
        "geometry.stroke.color": "#ffffff",
        "volume": 0,
        "audioFadeIn": 0,
        "audioFadeOut": 0,
        "muted": false
    });

    let export = exported(&fixture, options(7));

    assert!(!export.report.issues.iter().any(|issue| {
        issue.code == "static_params_omitted" && issue.element_id.as_deref() == Some("main-a")
    }));

    fixture.project["scenes"][0]["tracks"]["main"]["elements"][0]["params"]["transform.scaleX"] =
        json!(1.25);
    let changed = exported(&fixture, options(7));
    assert!(changed.report.issues.iter().any(|issue| {
        issue.code == "static_params_omitted" && issue.element_id.as_deref() == Some("main-a")
    }));
}

#[test]
fn reports_group_and_link_relationships_that_fcpxml_does_not_preserve() {
    let mut fixture = temp_fixture();
    let element = &mut fixture.project["scenes"][0]["tracks"]["main"]["elements"][0];
    element["groupId"] = json!("edit-group-1");
    element["linkGroupId"] = json!("linked-source-1");

    let export = exported(&fixture, options(7));

    assert!(export.report.issues.iter().any(|issue| {
        issue.code == "group_relation_omitted"
            && issue.severity == IssueSeverity::Degraded
            && issue.element_id.as_deref() == Some("main-a")
    }));
    assert!(export.report.issues.iter().any(|issue| {
        issue.code == "linked_media_relation_omitted"
            && issue.severity == IssueSeverity::Degraded
            && issue.element_id.as_deref() == Some("main-a")
    }));
}

#[test]
fn preserves_overlay_z_order_when_mapping_tracks_to_fcpxml_lanes() {
    let mut fixture = temp_fixture();
    fs::write(fixture.media_root.join("background.mov"), b"fixture").expect("background media");
    fixture.media_index["background"] = json!({
        "id": "background",
        "name": "背景.mov",
        "type": "video",
        "ext": "mov",
        "duration": 3,
        "width": 1280,
        "height": 720,
        "hasAudio": false
    });
    fixture.project["scenes"][0]["tracks"]["overlay"]
        .as_array_mut()
        .expect("overlay tracks")
        .push(json!({
            "id": "background-track",
            "name": "背景轨",
            "type": "video",
            "muted": false,
            "hidden": false,
            "elements": [{
                "id": "background-1",
                "name": "背景",
                "type": "video",
                "mediaId": "background",
                "startTime": 6 * SECOND,
                "duration": SECOND,
                "trimStart": 0,
                "trimEnd": 0,
                "sourceDuration": 3 * SECOND,
                "params": {}
            }]
        }));

    let export = exported(&fixture, options(7));

    assert!(
        export
            .document
            .contains("name=\"叠加.mov\" ref=\"r3\" lane=\"2\"")
    );
    assert!(
        export
            .document
            .contains("name=\"背景.mov\" ref=\"r4\" lane=\"1\"")
    );
}

#[test]
fn reports_muted_audio_elements_as_omitted() {
    let mut fixture = temp_fixture();
    fixture.project["scenes"][0]["tracks"]["audio"][0]["elements"][0]["params"] =
        json!({ "muted": true });

    let export = exported(&fixture, options(7));

    assert!(!export.document.contains("旁白.wav"));
    assert!(export.report.issues.iter().any(|issue| {
        issue.code == "muted_element_audio_omitted"
            && issue.severity == IssueSeverity::Omitted
            && issue.element_id.as_deref() == Some("voice-1")
    }));
}

#[test]
fn does_not_invent_audio_stream_metadata_absent_from_the_media_index() {
    let fixture = temp_fixture();
    let export = exported(&fixture, options(7));

    assert!(!export.document.contains("audioChannels=\"2\""));
    assert!(!export.document.contains("audioRate=\"48000\""));
}

#[test]
fn rejects_compound_clips_instead_of_exporting_the_first_child_as_the_container() {
    let mut fixture = temp_fixture();
    fixture.project["scenes"][0]["tracks"]["main"]["elements"][0]["compound"] = json!({
        "id": "compound-1",
        "children": [{
            "originalTrackId": "main-track",
            "relativeStartTime": 0,
            "element": {
                "id": "child-1",
                "name": "child",
                "type": "video",
                "mediaId": "main",
                "startTime": 0,
                "duration": SECOND,
                "trimStart": 0,
                "trimEnd": 0,
                "sourceDuration": 20 * SECOND,
                "params": {}
            }
        }]
    });

    let error = export_fcpxml(
        &fixture.project,
        &fixture.media_index,
        &fixture.media_root,
        options(7),
    )
    .expect_err("compound clips must fail closed until recursive flattening exists");

    assert_eq!(error.code, ErrorCode::UnsupportedTimeline);
    assert!(error.to_string().contains("compound"));
    assert!(error.to_string().contains("main-a"));
}

#[test]
fn rejects_transitions_instead_of_exporting_the_incoming_clip_at_the_overlap_start() {
    let mut fixture = temp_fixture();
    let incoming = fixture.project["scenes"][0]["tracks"]["main"]["elements"][1].clone();
    fixture.project["scenes"][0]["tracks"]["main"]["elements"]
        .as_array_mut()
        .expect("main elements")
        .remove(1);
    let mut transitioned = incoming;
    transitioned["startTime"] = json!(4 * SECOND + SECOND / 2);
    transitioned["transitionIn"] = json!({
        "id": "transition-1",
        "type": "cross-dissolve",
        "duration": SECOND / 2,
        "from": { "trackId": "main-track", "elementId": "main-a" },
        "originalTrackId": "main-track",
        "originalStartTime": 5 * SECOND,
        "createdOverlayTrack": true
    });
    fixture.project["scenes"][0]["tracks"]["overlay"]
        .as_array_mut()
        .expect("overlay tracks")
        .insert(
            0,
            json!({
                "id": "transition-track",
                "name": "Transition",
                "type": "video",
                "muted": false,
                "hidden": false,
                "elements": [transitioned]
            }),
        );

    let error = export_fcpxml(
        &fixture.project,
        &fixture.media_index,
        &fixture.media_root,
        options(7),
    )
    .expect_err("transition timing must fail closed until it can be restored exactly");

    assert_eq!(error.code, ErrorCode::UnsupportedTimeline);
    assert!(error.to_string().contains("transition"));
    assert!(error.to_string().contains("main-b"));
}

#[test]
fn hidden_content_cannot_block_or_extend_the_exported_timeline() {
    let mut fixture = temp_fixture();
    let hidden = &mut fixture.project["scenes"][0]["tracks"]["overlay"][2]["elements"][0];
    hidden["startTime"] = json!(100 * SECOND);
    hidden["transitionIn"] = json!({
        "id": "hidden-transition",
        "type": "cross-dissolve",
        "duration": SECOND / 2
    });
    hidden["compound"] = json!({
        "id": "hidden-compound",
        "children": []
    });

    let export = exported(&fixture, options(7));

    assert!(
        export
            .document
            .contains("<sequence format=\"r1\" duration=\"8s\"")
    );
    assert!(!export.document.contains("duration=\"101s\""));
    assert!(export.report.issues.iter().any(|issue| {
        issue.code == "hidden_track_omitted"
            && issue.track_id.as_deref() == Some("hidden-track")
    }));
}

#[test]
fn asset_formats_do_not_claim_the_sequence_dimensions_for_source_media() {
    let fixture = temp_fixture();
    let export = exported(&fixture, options(7));

    assert!(
        export
            .document
            .contains("<asset id=\"r3\" name=\"叠加.mov\"")
    );
    assert!(!export.document.contains("<asset id=\"r3\" name=\"叠加.mov\" start=\"0s\" duration=\"3s\" hasVideo=\"1\" hasAudio=\"0\" format=\"r1\""));
    assert!(!export.document.contains("name=\"叠加.mov\" ref=\"r3\" lane=\"2\" offset=\"11s\" start=\"1s\" duration=\"1s\" format=\"r1\""));
}

#[test]
fn never_emits_src_enable_for_a_pure_video_source() {
    let mut fixture = temp_fixture();
    fixture.media_index["main"]["hasAudio"] = json!(false);
    fixture.project["scenes"][0]["tracks"]["main"]["muted"] = json!(true);

    let export = exported(&fixture, options(7));

    assert!(!export.document.contains("srcEnable="));
}

#[test]
fn rejects_source_range_overflow_instead_of_serializing_saturated_time() {
    let mut fixture = temp_fixture();
    fixture.project["scenes"][0]["tracks"]["main"]["elements"][0]["trimStart"] = json!(i64::MAX);

    let error = export_fcpxml(
        &fixture.project,
        &fixture.media_index,
        &fixture.media_root,
        options(7),
    )
    .expect_err("overflowed source ranges must be rejected");

    assert_eq!(error.code, ErrorCode::InvalidProject);
    assert!(error.to_string().contains("overflows"));
}

#[test]
fn rejects_indexed_media_duration_overflow_instead_of_saturating() {
    let mut fixture = temp_fixture();
    fixture.media_index["main"]["duration"] = json!(1e308);

    let error = export_fcpxml(
        &fixture.project,
        &fixture.media_index,
        &fixture.media_root,
        options(7),
    )
    .expect_err("overflowed indexed durations must be rejected");

    assert_eq!(error.code, ErrorCode::InvalidProject);
    assert!(error.to_string().contains("overflows"));
}

#[test]
fn rejects_xml_1_0_forbidden_characters_from_the_shared_serializer() {
    for field in ["project", "asset", "bookmark"] {
        let mut fixture = temp_fixture();
        match field {
            "project" => fixture.project["metadata"]["name"] = json!("bad\u{b}project"),
            "asset" => fixture.media_index["main"]["name"] = json!("bad\u{b}asset.mp4"),
            "bookmark" => {
                fixture.project["scenes"][0]["bookmarks"][0]["note"] = json!("bad\u{fffe}bookmark")
            }
            _ => unreachable!(),
        }

        let error = export_fcpxml(
            &fixture.project,
            &fixture.media_index,
            &fixture.media_root,
            options(7),
        )
        .expect_err("XML 1.0 forbidden code points must fail the whole export");

        assert_eq!(error.code, ErrorCode::SerializationFailed, "{field}");
        assert!(error.to_string().contains("XML 1.0"), "{field}: {error}");
        assert!(error.to_string().contains("U+"), "{field}: {error}");
    }
}

#[allow(dead_code)]
fn assert_file_exists(path: &Path) {
    assert!(path.exists(), "{} should exist", path.display());
}
