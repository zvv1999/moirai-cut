use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use moirai_footage::{
    domain::{Job, Shot, ShotEdit, Source},
    media::Media,
    service::{App, Config, router},
    store::Store,
};
use serde_json::json;
use std::sync::Arc;
use tower::ServiceExt;

fn source() -> Source {
    serde_json::from_value(json!({
        "id":"source", "name":"product.mp4", "product":"sku-1", "batch":"batch", "sha256":"hash", "path":"original",
        "durationTicks":1200000, "width":1080,"height":1920,"fps":30.0,"colorTransfer":"bt709","rotation":0,
        "status":"review","error":null,"createdAt":0
    })).unwrap()
}
fn shot() -> Shot {
    serde_json::from_value(json!({
        "id":"shot","sourceId":"source","revision":1,"name":"Product detail","startTicks":120000,"endTicks":600000,
        "description":"A close view of the product","tags":["detail"],"roles":[{"role":"product_demo","reason":"Visible product","confidence":0.8}],
        "unsupportedClaims":[],"evidence":"Visible in source frames","recipe":{"rotation":0,"cropMode":"preserve","cropX":0.5,"cropY":0.5,"colorMode":"auto","brightness":0.0,"contrast":1.0,"saturation":1.0},
        "status":"draft","error":null,"qualityIssues":[],"outputPath":null,"outputSha256":null,"publishedPath":null,
        "analysisRunId":"analysis","modelId":"model","inputMode":"video","createdAt":0
    })).unwrap()
}
#[test]
fn recognized_alias_updates_text_and_tags_without_changing_video() {
    let mut shot = shot();
    shot.name = "手持绿色毛绒玩具".into();
    shot.description = "手持绿色毛绒玩具在桌前旋转".into();
    shot.details.subject = "绿色毛绒玩具".into();
    let original = shot.clone();
    let matches = serde_json::from_value(json!([{
        "productId":"p","alias":"屁屁","confidence":0.95,"evidence":"外形一致",
        "mentions":[{"field":"name","text":"绿色毛绒玩具"},{"field":"description","text":"绿色毛绒玩具"},{"field":"subject","text":"绿色毛绒玩具"}]
    }])).unwrap();
    moirai_footage::products::apply_matches(&mut shot, matches).unwrap();
    assert_eq!(shot.name, "手持屁屁");
    assert_eq!(shot.description, "手持屁屁在桌前旋转");
    assert_eq!(shot.details.subject, "屁屁");
    assert!(shot.tags.contains(&"屁屁".into()) && shot.tags.contains(&"detail".into()));
    assert_eq!(shot.recipe, original.recipe);
    assert_eq!(
        (shot.start_ticks, shot.end_ticks),
        (original.start_ticks, original.end_ticks)
    );
}
fn edit(shot: &Shot) -> ShotEdit {
    ShotEdit {
        keep_original_audio: Some(shot.keep_original_audio),
        is_featured: Some(shot.is_featured),
        details: Some(shot.details.clone()),
        has_holiday: Some(shot.has_holiday),
        holiday_tags: Some(shot.holiday_tags.clone()),
        base_revision: shot.revision,
        name: shot.name.clone(),
        start_ticks: shot.start_ticks,
        end_ticks: shot.end_ticks,
        description: shot.description.clone(),
        tags: shot.tags.clone(),
        roles: shot.roles.clone(),
        unsupported_claims: shot.unsupported_claims.clone(),
        recipe: shot.recipe.clone(),
    }
}

#[test]
fn adaptive_color_migration_preserves_published_and_active_work() {
    let mut legacy = shot();
    legacy.status = "published".into();
    legacy.output_path = Some("legacy.mp4".into());
    let mut metadata = edit(&legacy);
    metadata.description = "Metadata only".into();
    metadata.apply(&mut legacy, &source()).unwrap();
    assert_eq!(legacy.recipe.color_mode, "auto");
    assert_eq!(legacy.output_path.as_deref(), Some("legacy.mp4"));
    let mut visual = edit(&legacy);
    visual.recipe.rotation = 90;
    visual.apply(&mut legacy, &source()).unwrap();
    assert_eq!(legacy.recipe.color_mode, "adaptive");
    assert!(legacy.output_path.is_none());
    let db = Store::open(std::path::Path::new(":memory:")).unwrap();
    for (id, status) in [
        ("draft", "draft"),
        ("published", "published"),
        ("active", "rendering"),
    ] {
        let mut value = shot();
        value.id = id.into();
        value.status = status.into();
        db.put("shot", id, &value).unwrap();
    }
    let job = Job::new("render", "active", 1);
    db.put("job", &job.id, &job).unwrap();
    db.transaction(moirai_footage::adaptive_lut::migrate_drafts)
        .unwrap();
    let draft = db.get::<Shot>("shot", "draft").unwrap();
    assert_eq!(draft.recipe.color_mode, "adaptive");
    assert_eq!(draft.revision, 2);
    for id in ["published", "active"] {
        assert_eq!(
            db.get::<Shot>("shot", id).unwrap().recipe.color_mode,
            "auto"
        );
    }
    db.transaction(moirai_footage::adaptive_lut::migrate_drafts)
        .unwrap();
    assert_eq!(db.get::<Shot>("shot", "draft").unwrap().revision, 2);
    assert_eq!(
        db.get::<Shot>("shot_version", "draft-r1")
            .unwrap()
            .recipe
            .color_mode,
        "auto"
    );
}

#[test]
#[ignore = "Requires local Image-Adaptive-3DLUT runtime and native FFmpeg"]
fn adaptive_model_generates_cached_lut_and_exports_video() {
    use moirai_footage::media::strings;
    let dir = tempfile::tempdir().unwrap();
    let media = Media {
        root: dir.path().into(),
        ffmpeg: std::env::var("MOIRAI_FFMPEG").unwrap(),
        ffprobe: std::env::var("MOIRAI_FFPROBE").unwrap(),
    };
    let path = dir.path().join("test.mp4");
    media
        .run(
            &media.ffmpeg,
            &strings(&[
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=320x240:rate=12",
                "-t",
                "2",
                "-pix_fmt",
                "yuv420p",
                path.to_str().unwrap(),
            ]),
            30,
        )
        .unwrap();
    let mut source = source();
    source.path = path.to_string_lossy().into();
    source.width = 320;
    source.height = 240;
    source.duration_ticks = 240000;
    let lut = media.adaptive_lut(&source, 0, 240000).unwrap();
    assert_eq!(lut.values.len(), 33 * 33 * 33 * 3);
    let cached = media.adaptive_lut(&source, 0, 240000).unwrap();
    assert_eq!(lut.values, cached.values);
    assert!(
        lut.values
            .chunks_exact(3)
            .enumerate()
            .any(|(index, rgb)| (rgb[0] - (index % 33) as f32 / 32.0).abs() > 0.02)
    );
    let mut shot = shot();
    shot.start_ticks = 0;
    shot.end_ticks = 240000;
    shot.recipe.color_mode = "adaptive".into();
    let (output, _) = media.render(&shot, &source).unwrap();
    let probe = media.probe(&output).unwrap();
    assert!(
        probe["format"]["duration"]
            .as_str()
            .unwrap()
            .parse::<f64>()
            .unwrap()
            > 1.8
    );
    assert_eq!(
        std::fs::read_to_string(output.parent().unwrap().join("adaptive.cube")).unwrap(),
        lut.cube()
    );
    let shorter = media.adaptive_lut(&source, 0, 120000).unwrap();
    assert_ne!(shorter.values, lut.values);
}

#[tokio::test]
async fn deleting_shot_hides_it_and_blocks_stale_writes_and_pending_sync() {
    let dir = tempfile::tempdir().unwrap();
    let db = Store::open(&dir.path().join("delete.sqlite3")).unwrap();
    let mut item = shot();
    item.roles.clear();
    db.put("source", "source", &source()).unwrap();
    db.put("shot", "shot", &item).unwrap();
    let app = Arc::new(App {
        storage_gate: std::sync::Mutex::new(()),
        db,
        config: Config {
            data_dir: dir.path().into(),
            nas_root: dir.path().into(),
            require_smb: false,
            ffmpeg: "unused".into(),
            ffprobe: "unused".into(),
            port: 0,
        },
        media: Media {
            root: dir.path().into(),
            ffmpeg: "unused".into(),
            ffprobe: "unused".into(),
        },
        home: dir.path().into(),
        token: "test".into(),
    });
    let send = |revision, action: &str| {
        router(app.clone()).oneshot(
            Request::builder()
                .method("POST")
                .uri("/shots/shot/action")
                .header("x-footage-token", "test")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({"baseRevision":revision,"action":action}).to_string(),
                ))
                .unwrap(),
        )
    };
    let mut job = Job::new("publish", "shot", 1);
    app.db.put("job", &job.id, &job).unwrap();
    assert_eq!(
        send(1, "delete").await.unwrap().status(),
        StatusCode::BAD_REQUEST
    );
    job.status = "succeeded".into();
    app.db.put("job", &job.id, &job).unwrap();
    assert_eq!(
        send(99, "delete").await.unwrap().status(),
        StatusCode::CONFLICT
    );
    assert_eq!(send(1, "delete").await.unwrap().status(), StatusCode::OK);
    let mut deleted = app.db.get::<Shot>("shot", "shot").unwrap();
    assert_eq!(deleted.status, "deleted");
    assert!(edit(&deleted).apply(&mut deleted, &source()).is_err());
    assert_eq!(
        send(2, "restore").await.unwrap().status(),
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        app.db
            .get::<Shot>("shot_version", "shot-r1")
            .unwrap()
            .status,
        "draft"
    );
    let response = router(app.clone())
        .oneshot(
            Request::builder()
                .uri("/state")
                .header("x-footage-token", "test")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let state: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(state["shots"], json!([]));
}

#[test]
fn editing_manual_markers_details_and_holidays_preserves_video_and_old_snapshots() {
    let mut original = shot();
    assert!(!original.keep_original_audio && !original.is_featured && !original.has_holiday);
    assert!(original.holiday_tags.is_empty() && original.details.subject.is_empty());
    original.output_path = Some("render.mp4".into());
    original.output_sha256 = Some("hash".into());
    let db = Store::open(std::path::Path::new(":memory:")).unwrap();
    db.put("published", "before", &original).unwrap();
    let mut update = edit(&original);
    update.keep_original_audio = Some(true);
    update.is_featured = Some(true);
    update.has_holiday = Some(true);
    update.holiday_tags = Some(vec!["春节".into(), " 春节 ".into()]);
    update.details.as_mut().unwrap().subject = "红色灯笼".into();
    update.apply(&mut original, &source()).unwrap();
    assert!(original.keep_original_audio && original.is_featured && original.has_holiday);
    assert_eq!(original.holiday_tags, ["春节"]);
    assert_eq!(original.details.subject, "红色灯笼");
    assert_eq!(original.output_path.as_deref(), Some("render.mp4"));
    assert!(!db.get::<Shot>("published", "before").unwrap().is_featured);
    let mut old_client = serde_json::to_value(edit(&original)).unwrap();
    for key in [
        "keepOriginalAudio",
        "isFeatured",
        "details",
        "hasHoliday",
        "holidayTags",
    ] {
        old_client.as_object_mut().unwrap().remove(key);
    }
    serde_json::from_value::<ShotEdit>(old_client)
        .unwrap()
        .apply(&mut original, &source())
        .unwrap();
    assert!(original.keep_original_audio && original.is_featured);
    assert_eq!(original.details.subject, "红色灯笼");
    let mut update = edit(&original);
    update.has_holiday = Some(false);
    update.apply(&mut original, &source()).unwrap();
    assert!(original.holiday_tags.is_empty());
}

#[test]
fn legacy_roles_become_tags_once_without_changing_published_snapshots() {
    let db = Store::open(std::path::Path::new(":memory:")).unwrap();
    let mut original = shot();
    original.tags.push("产品演示".into());
    db.put("shot", "shot", &original).unwrap();
    db.put("published", "release", &original).unwrap();
    let mut job = Job::new("render", "shot", original.revision);
    db.put("job", &job.id, &job).unwrap();
    db.transaction(moirai_footage::tag_settings::migrate_legacy_roles)
        .unwrap();
    assert_eq!(db.get::<Shot>("shot", "shot").unwrap().revision, 1);
    job.status = "succeeded".into();
    db.put("job", &job.id, &job).unwrap();
    db.transaction(moirai_footage::tag_settings::migrate_legacy_roles)
        .unwrap();
    let migrated = db.get::<Shot>("shot", "shot").unwrap();
    assert_eq!(migrated.tags, ["detail", "产品演示"]);
    assert!(migrated.roles.is_empty());
    assert_eq!(migrated.revision, 2);
    db.transaction(moirai_footage::tag_settings::migrate_legacy_roles)
        .unwrap();
    assert_eq!(db.get::<Shot>("shot", "shot").unwrap().revision, 2);
    assert_eq!(
        db.get::<Shot>("published", "release").unwrap().roles.len(),
        1
    );
    assert_eq!(
        db.get::<Shot>("shot_version", "shot-r1")
            .unwrap()
            .roles
            .len(),
        1
    );
}

#[tokio::test]
async fn preview_uses_export_geometry_without_saving_edits_or_jobs() {
    use moirai_footage::media::{filter_graph, frame_geometry};
    let dir = tempfile::tempdir().unwrap();
    let db = Store::open(&dir.path().join("preview.sqlite3")).unwrap();
    db.put("source", "source", &source()).unwrap();
    db.put("shot", "shot", &shot()).unwrap();
    let app = Arc::new(App {
        storage_gate: std::sync::Mutex::new(()),
        db,
        config: Config {
            data_dir: dir.path().into(),
            nas_root: dir.path().into(),
            require_smb: false,
            ffmpeg: "unused".into(),
            ffprobe: "unused".into(),
            port: 0,
        },
        media: Media {
            ffmpeg: "unused".into(),
            ffprobe: "unused".into(),
            root: dir.path().into(),
        },
        home: dir.path().into(),
        token: "test-token".into(),
    });
    let send = |body: serde_json::Value| {
        router(app.clone()).oneshot(
            Request::builder()
                .method("POST")
                .uri("/shots/shot/preview-plan")
                .header("x-footage-token", "test-token")
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
    };
    let mut edited = shot();
    edited.recipe.rotation = 90;
    edited.recipe.crop_mode = "vertical".into();
    let g = frame_geometry(&edited.recipe, &source()).unwrap();
    assert_eq!(
        (
            g.width,
            g.height,
            g.crop_width,
            g.crop_height,
            g.crop_x,
            g.crop_y
        ),
        (1920, 1080, 594, 1056, 662, 12)
    );
    assert!(filter_graph(&edited, &source(), 0.0).contains("transpose=1,crop=594:1056:662:12"));
    for rotation in [0, 90, 180, 270] {
        edited.recipe.rotation = rotation;
        edited.recipe.crop_x = 1.0;
        let g = frame_geometry(&edited.recipe, &source()).unwrap();
        assert!(g.crop_x + g.crop_width <= g.width && g.crop_y + g.crop_height <= g.height);
        assert_eq!(g.crop_x % 2, 0);
        assert_eq!(g.crop_width * 16, g.crop_height * 9);
    }
    for (mode, expected) in [
        ("preserve", (0.0, 1.0, 1.0)),
        ("auto", (0.025, 1.0, 1.0)),
        ("manual", (0.1, 1.1, 0.9)),
    ] {
        edited.recipe.push_in = mode != "preserve";
        edited.recipe.push_in_end_percent = if mode == "manual" { 125.0 } else { 110.0 };
        edited.recipe.color_mode = mode.into();
        edited.recipe.brightness = 0.1;
        edited.recipe.contrast = 1.1;
        edited.recipe.saturation = 0.9;
        let response = send(json!({"startTicks":120000,"endTicks":600000,"recipe":edited.recipe,"autoBrightness":0.025})).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(response.into_body(), 4 * 1024 * 1024)
            .await
            .unwrap();
        let plan: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(plan["zoom"]["durationSeconds"], 4.0);
        assert_eq!(plan["zoom"]["startScale"], 1.0);
        assert_eq!(plan["zoom"]["endScale"], match mode { "manual" => 1.25, "auto" => 1.1, _ => 1.0 });
        assert_eq!(
            (
                plan["brightness"].as_f64().unwrap(),
                plan["contrast"].as_f64().unwrap(),
                plan["saturation"].as_f64().unwrap()
            ),
            expected
        );
    }
    assert_eq!(
        send(json!({"startTicks":600000,"endTicks":120000,"recipe":edited.recipe}))
            .await
            .unwrap()
            .status(),
        StatusCode::BAD_REQUEST
    );
    let large_plan = json!({
        "startTicks":0,"endTicks":600000,"recipe":edited.recipe,
        "baseLut":{"size":33,"values":vec![0.1234567890123456_f64; 33*33*33*3]}
    });
    assert!(large_plan.to_string().len() > 1024 * 1024);
    assert_eq!(send(large_plan).await.unwrap().status(), StatusCode::OK);
    edited.recipe.rotation = 45;
    assert_eq!(
        send(json!({"startTicks":0,"endTicks":600000,"recipe":edited.recipe}))
            .await
            .unwrap()
            .status(),
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        serde_json::to_value(app.db.get::<Shot>("shot", "shot").unwrap()).unwrap(),
        serde_json::to_value(shot()).unwrap()
    );
    assert!(app.db.list::<Job>("job").unwrap().is_empty());
    let mut direct = shot();
    direct.direct_upload = true;
    app.db.put("shot", "shot", &direct).unwrap();
    assert_eq!(
        send(json!({"startTicks":0,"endTicks":600000,"recipe":shot().recipe}))
            .await
            .unwrap()
            .status(),
        StatusCode::BAD_REQUEST
    );
}
#[test]
fn editing_published_metadata_unpublishes_but_keeps_valid_render() {
    let mut shot = shot();
    shot.status = "published".into();
    shot.output_path = Some("render.mp4".into());
    shot.output_sha256 = Some("hash".into());
    shot.published_path = Some("nas/master.mp4".into());
    let mut update = edit(&shot);
    update.description = "Corrected description".into();
    update.apply(&mut shot, &source()).unwrap();
    assert_eq!(shot.status, "review");
    assert!(shot.published_path.is_none());
    assert_eq!(shot.output_path.as_deref(), Some("render.mp4"));
    let mut update = edit(&shot);
    update.recipe.rotation = 90;
    update.apply(&mut shot, &source()).unwrap();
    assert_eq!(shot.status, "draft");
    assert!(shot.output_path.is_none());
    assert!(shot.output_sha256.is_none());
}

#[test]
#[ignore = "Requires MOIRAI_FFMPEG and MOIRAI_FFPROBE native executables"]
fn real_exports_match_preview_geometry_for_every_rotation() {
    use moirai_footage::media::{frame_geometry, strings};
    let dir = tempfile::tempdir().unwrap();
    let media = Media {
        root: dir.path().into(),
        ffmpeg: std::env::var("MOIRAI_FFMPEG").unwrap(),
        ffprobe: std::env::var("MOIRAI_FFPROBE").unwrap(),
    };
    let input = dir.path().join("fixture.mp4");
    media
        .run(
            &media.ffmpeg,
            &strings(&[
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=320x180:rate=10",
                "-t",
                "2",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                &input.to_string_lossy(),
            ]),
            60,
        )
        .unwrap();
    let source = media
        .source(
            &input,
            "fixture".into(),
            String::new(),
            String::new(),
            String::new(),
            "fixture".into(),
        )
        .unwrap();
    for rotation in [0, 90, 180, 270] {
        let mut shot = shot();
        shot.id = format!("rotation-{rotation}");
        shot.start_ticks = 24000;
        shot.end_ticks = 168000;
        shot.recipe.rotation = rotation;
        shot.recipe.crop_mode = "vertical".into();
        shot.recipe.crop_x = 1.0;
        let g = frame_geometry(&shot.recipe, &source).unwrap();
        let (output, _) = media.render(&shot, &source).unwrap();
        let probe = media.probe(&output).unwrap();
        assert_eq!(probe["streams"][0]["width"], g.crop_width);
        assert_eq!(probe["streams"][0]["height"], g.crop_height);
    }
}
#[test]
#[ignore = "Requires MOIRAI_FFMPEG and MOIRAI_FFPROBE native executables"]
fn push_in_export_grows_about_center_without_changing_duration_or_frame_size() {
    use moirai_footage::domain::Recipe;
    use moirai_footage::media::{frame_geometry, strings};
    let dir = tempfile::tempdir().unwrap();
    let media = Media {
        root: dir.path().into(),
        ffmpeg: std::env::var("MOIRAI_FFMPEG").unwrap(),
        ffprobe: std::env::var("MOIRAI_FFPROBE").unwrap(),
    };
    let input = dir.path().join("center.mp4");
    media.run(&media.ffmpeg, &strings(&[
        "-v", "error", "-f", "lavfi", "-i",
        "color=c=black:s=320x180:r=20:d=4,drawbox=x=120:y=60:w=80:h=60:color=white:t=fill",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", &input.to_string_lossy(),
    ]), 60).unwrap();
    let source = media.source(&input, "fixture".into(), String::new(), String::new(), String::new(), "source".into()).unwrap();
    for (rotation, crop, enabled) in [(0, "preserve", false), (0, "preserve", true), (90, "vertical", true)] {
        let mut shot = shot();
        shot.id = format!("push-in-{rotation}-{enabled}");
        shot.start_ticks = 120000;
        shot.end_ticks = 360000;
        let end_percent = if rotation == 90 { 125.0 } else { 110.0 };
        shot.recipe = Recipe { rotation, crop_mode: crop.into(), color_mode: "preserve".into(), push_in: enabled, push_in_end_percent: end_percent, flip_horizontal: true, ..Recipe::default() };
        let g = frame_geometry(&shot.recipe, &source).unwrap();
        let (output, _) = media.render(&shot, &source).unwrap();
        let probe = media.probe(&output).unwrap();
        assert_eq!(probe["streams"][0]["width"], g.crop_width);
        assert_eq!(probe["streams"][0]["height"], g.crop_height);
        let duration: f64 = probe["format"]["duration"].as_str().unwrap().parse().unwrap();
        assert!((duration - 2.0).abs() < 0.1);
        let bounds = |time: &str| {
            let decoded = std::process::Command::new(&media.ffmpeg).args([
                "-v", "error", "-ss", time, "-i", &output.to_string_lossy(),
                "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1",
            ]).output().unwrap();
            assert!(decoded.status.success());
            assert_eq!(decoded.stdout.len(), (g.crop_width * g.crop_height) as usize);
            let mut bounds = (g.crop_width, 0, g.crop_height, 0);
            for (i, pixel) in decoded.stdout.iter().enumerate() {
                if *pixel > 200 {
                    let x = i as u32 % g.crop_width;
                    let y = i as u32 / g.crop_width;
                    bounds = (bounds.0.min(x), bounds.1.max(x), bounds.2.min(y), bounds.3.max(y));
                }
            }
            bounds
        };
        let first = bounds("0");
        let middle = bounds("1");
        let last = bounds("1.95");
        let width = |b: (u32, u32, u32, u32)| (b.1 - b.0 + 1) as f64;
        let expected_width = if rotation == 0 { 80.0 } else { 60.0 };
        assert!((width(first) - expected_width).abs() <= 2.0);
        let growth = if enabled { end_percent / 100.0 - 1.0 } else { 0.0 };
        for (b, scale) in [(middle, 1.0 + growth * 0.5), (last, 1.0 + growth * 0.975)] {
            assert!((width(b) - expected_width * scale).abs() <= 2.0, "bounds={b:?}, scale={scale}");
            assert!(((b.0 + b.1) as f64 / 2.0 - (g.crop_width - 1) as f64 / 2.0).abs() <= 2.0, "rotation={rotation}, enabled={enabled}, bounds={b:?}, first={first:?}, width={}", g.crop_width);
            assert!(((b.2 + b.3) as f64 / 2.0 - (g.crop_height - 1) as f64 / 2.0).abs() <= 2.0, "rotation={rotation}, bounds={b:?}, height={}", g.crop_height);
        }
    }
}

#[test]
fn direct_upload_only_allows_metadata_edits_after_tagging() {
    let mut shot = shot();
    assert!(
        !shot.direct_upload,
        "Old records must remain ordinary shots"
    );
    shot.direct_upload = true;
    shot.start_ticks = 0;
    shot.end_ticks = source().duration_ticks;
    shot.recipe.color_mode = "preserve".into();
    shot.status = "tagging".into();
    assert!(edit(&shot).apply(&mut shot.clone(), &source()).is_err());
    shot.status = "tag_review".into();
    let mut update = edit(&shot);
    update.start_ticks = 120000;
    assert!(update.apply(&mut shot.clone(), &source()).is_err());
    let mut update = edit(&shot);
    update.recipe.color_mode = "auto".into();
    assert!(update.apply(&mut shot.clone(), &source()).is_err());
    shot.status = "published".into();
    shot.output_path = Some("original.mov".into());
    shot.output_sha256 = Some("original-hash".into());
    let mut update = edit(&shot);
    update.description = "Reviewed labels".into();
    update.apply(&mut shot, &source()).unwrap();
    assert_eq!(shot.status, "tag_review");
    assert_eq!(shot.output_sha256.as_deref(), Some("original-hash"));
    assert_eq!(shot.end_ticks, source().duration_ticks);
}

#[test]
fn boundary_edits_preserve_product_identity_and_require_label_review() {
    let mut shot = shot();
    assert!(shot.product_matches.is_empty() && shot.product_tags.is_empty());
    shot.tags.push("Black".into());
    shot.product_tags.push("Black".into());
    shot.product_matches
        .push(moirai_footage::products::ProductMatch {
            product_id: "black".into(),
            alias: "Black".into(),
            confidence: 0.95,
            evidence: "Visible shape".into(),
            mentions: vec![],
        });
    let mut update = edit(&shot);
    update.description = "Updated description".into();
    update.apply(&mut shot, &source()).unwrap();
    assert_eq!(shot.product_tags, vec!["Black"]);
    assert!(!shot.labels_need_review);
    let mut update = edit(&shot);
    update.recipe.rotation = 90;
    update.recipe.flip_horizontal = true;
    update.recipe.brightness = 0.1;
    update.apply(&mut shot, &source()).unwrap();
    assert!(!shot.labels_need_review);
    shot.status = "recognizing".into();
    assert!(edit(&shot).apply(&mut shot.clone(), &source()).is_err());
    shot.status = "draft".into();
    let mut update = edit(&shot);
    update.start_ticks += 120000;
    update.apply(&mut shot, &source()).unwrap();
    assert_eq!(shot.tags, vec!["detail", "Black"]);
    assert_eq!(shot.product_tags, vec!["Black"]);
    assert_eq!(shot.product_matches.len(), 1);
    assert!(shot.labels_need_review);
}

#[test]
fn analysis_suggestions_apply_selected_fields_and_keep_manual_edits() {
    use moirai_footage::label_review::{self, Suggestion};
    let dir = tempfile::tempdir().unwrap();
    let db = Store::open(&dir.path().join("suggestions.sqlite3")).unwrap();
    let mut current = shot();
    current.name = "Manual name".into();
    current.details.subject = "Manual subject".into();
    current.keep_original_audio = true;
    current.is_featured = true;
    current.labels_need_review = true;
    current.output_path = Some("unchanged-video.mp4".into());
    let before = current.clone();
    let mut proposed = current.clone();
    proposed.name = "AI name".into();
    proposed.description = "AI description".into();
    proposed.details.subject = "AI subject".into();
    proposed.tags = vec!["new-tag".into()];
    proposed.analyzed_tags = proposed.tags.clone();
    proposed.has_holiday = true;
    proposed.holiday_tags = vec!["New holiday".into()];
    db.put(
        "analysis_suggestion",
        "shot",
        &Suggestion {
            base_revision: current.revision,
            shot: proposed.clone(),
        },
    )
    .unwrap();
    let public = db
        .transaction(|conn| label_review::public_suggestion(conn, &current))
        .unwrap();
    assert_eq!(public["stale"], false);
    assert_eq!(public["tags"], json!(["new-tag"]));
    db.transaction(|conn| label_review::accept(conn, &mut current, &["tags".into()]))
        .unwrap();
    assert_eq!(current.tags, proposed.tags);
    assert_eq!(current.analyzed_tags, proposed.analyzed_tags);
    assert_eq!(current.name, before.name);
    assert_eq!(current.description, before.description);
    assert_eq!(
        serde_json::to_value(&current.details).unwrap(),
        serde_json::to_value(&before.details).unwrap()
    );
    assert_eq!(current.holiday_tags, before.holiday_tags);
    assert_eq!(current.recipe, before.recipe);
    assert_eq!(current.output_path, before.output_path);
    assert_eq!(
        (current.start_ticks, current.end_ticks),
        (before.start_ticks, before.end_ticks)
    );
    assert!(current.keep_original_audio && current.is_featured && current.labels_need_review);
    assert!(db.get::<Suggestion>("analysis_suggestion", "shot").is_err());
    db.put(
        "analysis_suggestion",
        "shot",
        &Suggestion {
            base_revision: current.revision,
            shot: proposed,
        },
    )
    .unwrap();
    db.transaction(|conn| {
        label_review::accept(conn, &mut current, &["tags".into(), "holidays".into()])
    })
    .unwrap();
    assert!(!current.labels_need_review);
    assert!(current.has_holiday);
    assert_eq!(current.holiday_tags, vec!["New holiday"]);
    let previous_evidence = current.evidence.clone();
    let previous_tags = current.tags.clone();
    let previous_tag_evidence = current.tag_evidence.clone();
    let mut name_only = current.clone();
    name_only.name = "Accepted name only".into();
    name_only.evidence = "Different AI evidence".into();
    name_only.tags = vec!["Unselected AI tag".into()];
    db.put(
        "analysis_suggestion",
        "shot",
        &Suggestion {
            base_revision: current.revision,
            shot: name_only,
        },
    )
    .unwrap();
    db.transaction(|conn| label_review::accept(conn, &mut current, &["name".into()]))
        .unwrap();
    assert_eq!(current.name, "Accepted name only");
    assert_eq!(current.evidence, previous_evidence);
    assert_eq!(current.tags, previous_tags);
    assert_eq!(current.tag_evidence, previous_tag_evidence);
}

#[test]
fn stale_or_invalid_suggestions_preserve_current_result_and_can_be_dismissed() {
    use moirai_footage::label_review::{self, Suggestion};
    let dir = tempfile::tempdir().unwrap();
    let db = Store::open(&dir.path().join("stale-suggestions.sqlite3")).unwrap();
    let mut current = shot();
    let before = serde_json::to_value(&current).unwrap();
    for (base_revision, range_changed, fields) in [
        (0, false, vec!["tags".into()]),
        (1, true, vec!["tags".into()]),
        (1, false, vec![]),
        (1, false, vec!["recipe".into()]),
    ] {
        let mut proposed = current.clone();
        proposed.name = "AI name".into();
        proposed.tags = vec!["AI tag".into()];
        if range_changed {
            proposed.start_ticks += 120000;
        }
        db.put(
            "analysis_suggestion",
            "shot",
            &Suggestion {
                base_revision,
                shot: proposed,
            },
        )
        .unwrap();
        if base_revision != current.revision {
            assert_eq!(
                db.transaction(|conn| label_review::public_suggestion(conn, &current))
                    .unwrap()["stale"],
                true
            );
        }
        assert!(
            db.transaction(|conn| label_review::accept(conn, &mut current, &fields))
                .is_err()
        );
        assert_eq!(serde_json::to_value(&current).unwrap(), before);
        assert!(db.get::<Suggestion>("analysis_suggestion", "shot").is_ok());
    }
    db.transaction(|conn| label_review::dismiss(conn, "shot"))
        .unwrap();
    assert!(
        db.transaction(|conn| label_review::public_suggestion(conn, &current))
            .unwrap()
            .is_null()
    );
    assert_eq!(serde_json::to_value(&current).unwrap(), before);
    db.transaction(|conn| label_review::dismiss(conn, "shot"))
        .unwrap();
}

#[test]
fn accepting_tags_or_holidays_only_replaces_the_selected_category_evidence() {
    use moirai_footage::{
        label_review::{self, Suggestion},
        tag_evidence::TagEvidence,
    };
    let dir = tempfile::tempdir().unwrap();
    let db = Store::open(&dir.path().join("evidence-categories.sqlite3")).unwrap();
    let evidence = |tag: &str| TagEvidence {
        tag: tag.into(),
        reason: format!("Visible {tag}"),
        start_seconds: 1.0,
        end_seconds: 2.0,
        confidence: 0.9,
    };
    for fields in [
        vec!["tags"],
        vec!["holidays"],
        vec!["tags", "holidays"],
        vec!["holidays", "tags"],
    ] {
        let mut current = shot();
        current.tags = vec!["old-tag".into()];
        current.has_holiday = true;
        current.holiday_tags = vec!["old-holiday".into()];
        current.tag_evidence = vec![evidence("old-tag"), evidence("old-holiday")];
        let mut proposed = current.clone();
        proposed.tags = vec!["new-tag".into()];
        proposed.holiday_tags = vec!["new-holiday".into()];
        proposed.tag_evidence = vec![evidence("new-tag"), evidence("new-holiday")];
        db.put(
            "analysis_suggestion",
            "shot",
            &Suggestion {
                base_revision: current.revision,
                shot: proposed,
            },
        )
        .unwrap();
        let selected = fields
            .iter()
            .map(|field| (*field).to_owned())
            .collect::<Vec<_>>();
        db.transaction(|conn| label_review::accept(conn, &mut current, &selected))
            .unwrap();
        let tag = if fields.contains(&"tags") {
            "new-tag"
        } else {
            "old-tag"
        };
        let holiday = if fields.contains(&"holidays") {
            "new-holiday"
        } else {
            "old-holiday"
        };
        assert_eq!(current.tags, vec![tag]);
        assert_eq!(current.holiday_tags, vec![holiday]);
        assert_eq!(current.tag_evidence.len(), 2);
        assert!(current.tag_evidence.contains(&evidence(tag)));
        assert!(current.tag_evidence.contains(&evidence(holiday)));
    }
}

#[test]
fn stale_and_invalid_edits_leave_record_unchanged() {
    let mut shot = shot();
    let before = serde_json::to_value(&shot).unwrap();
    let mut update = edit(&shot);
    update.base_revision = 0;
    assert!(update.apply(&mut shot, &source()).is_err());
    let mut update = edit(&shot);
    update.end_ticks = 2000000;
    assert!(update.apply(&mut shot, &source()).is_err());
    assert_eq!(before, serde_json::to_value(shot).unwrap());
}
#[tokio::test]
async fn review_gates_and_concurrent_submissions_queue_only_once() {
    let dir = tempfile::tempdir().unwrap();
    let db = Store::open(&dir.path().join("library.sqlite3")).unwrap();
    db.put("source", "source", &source()).unwrap();
    db.put("shot", "shot", &shot()).unwrap();
    let config = Config {
        data_dir: dir.path().into(),
        nas_root: dir.path().into(),
        require_smb: false,
        ffmpeg: "unused".into(),
        ffprobe: "unused".into(),
        port: 0,
    };
    let app = Arc::new(App {
        storage_gate: std::sync::Mutex::new(()),
        db,
        media: Media {
            ffmpeg: "unused".into(),
            ffprobe: "unused".into(),
            root: dir.path().into(),
        },
        config,
        home: dir.path().into(),
        token: "test-token".into(),
    });
    let router = router(app.clone());
    let request = |action: &str| {
        Request::builder()
            .method("POST")
            .uri("/shots/shot/action")
            .header("x-footage-token", "test-token")
            .header("content-type", "application/json")
            .body(Body::from(
                json!({"baseRevision":1,"action":action}).to_string(),
            ))
            .unwrap()
    };
    assert_eq!(
        router
            .clone()
            .oneshot(request("publish"))
            .await
            .unwrap()
            .status(),
        StatusCode::BAD_REQUEST
    );
    assert!(app.db.list::<Job>("job").unwrap().is_empty());
    let (a, b) = tokio::join!(
        router.clone().oneshot(request("render")),
        router.clone().oneshot(request("render"))
    );
    let statuses = [a.unwrap().status(), b.unwrap().status()];
    assert!(statuses.contains(&StatusCode::OK));
    assert!(statuses.contains(&StatusCode::CONFLICT));
    assert_eq!(app.db.list::<Job>("job").unwrap().len(), 1);
    let mut ready = app.db.get::<Shot>("shot", "shot").unwrap();
    ready.status = "review".into();
    ready.revision = 3;
    let output = dir.path().join("processed.mp4");
    std::fs::write(&output, b"processed").unwrap();
    ready.output_path = Some(output.to_string_lossy().into());
    ready.output_sha256 = Some("verified-before".into());
    app.db.put("shot", "shot", &ready).unwrap();
    let reuse = Request::builder()
        .method("POST")
        .uri("/shots/shot/action")
        .header("x-footage-token", "test-token")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({"baseRevision":3,"action":"render"}).to_string(),
        ))
        .unwrap();
    assert_eq!(
        router.oneshot(reuse).await.unwrap().status(),
        StatusCode::OK
    );
    assert_eq!(app.db.list::<Job>("job").unwrap().len(), 1);
    assert_eq!(app.db.get::<Shot>("shot", "shot").unwrap().revision, 3);
}

#[tokio::test]
async fn confirming_labels_atomically_saves_and_queues_only_one_pipeline() {
    let dir = tempfile::tempdir().unwrap();
    let db = Store::open(&dir.path().join("confirmation.sqlite3")).unwrap();
    db.put("source", "source", &source()).unwrap();
    db.put("shot", "shot", &shot()).unwrap();
    let app = Arc::new(App {
        storage_gate: std::sync::Mutex::new(()),
        db,
        config: Config {
            data_dir: dir.path().into(),
            nas_root: dir.path().into(),
            require_smb: false,
            ffmpeg: "unused".into(),
            ffprobe: "unused".into(),
            port: 0,
        },
        media: Media {
            root: dir.path().into(),
            ffmpeg: "unused".into(),
            ffprobe: "unused".into(),
        },
        home: dir.path().into(),
        token: "test-token".into(),
    });
    let send = |edit: ShotEdit| {
        router(app.clone()).oneshot(
            Request::builder()
                .method("POST")
                .uri("/shots/shot/confirm")
                .header("x-footage-token", "test-token")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&edit).unwrap()))
                .unwrap(),
        )
    };
    let mut invalid = edit(&shot());
    invalid.description.clear();
    assert_eq!(
        send(invalid).await.unwrap().status(),
        StatusCode::BAD_REQUEST
    );
    assert_eq!(app.db.get::<Shot>("shot", "shot").unwrap().revision, 1);
    assert!(app.db.list::<Job>("job").unwrap().is_empty());
    assert!(
        app.db
            .list::<serde_json::Value>("review")
            .unwrap()
            .is_empty()
    );
    let mut update = edit(&shot());
    update.tags.clear();
    update.roles.clear();
    let (first, second) = tokio::join!(send(update.clone()), send(update));
    let statuses = [first.unwrap().status(), second.unwrap().status()];
    assert!(statuses.contains(&StatusCode::OK) && statuses.contains(&StatusCode::CONFLICT));
    let confirmed = app.db.get::<Shot>("shot", "shot").unwrap();
    assert_eq!(confirmed.status, "rendering");
    assert!(confirmed.tags.is_empty());
    assert!(confirmed.roles.is_empty());
    let jobs = app.db.list::<Job>("job").unwrap();
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0].kind, "render");
    assert!(app.db.get::<bool>("auto_publish", &jobs[0].id).unwrap());
    assert_eq!(
        app.db.list::<serde_json::Value>("review").unwrap()[0]["action"],
        "confirm_labels"
    );
    assert_eq!(
        send(edit(&confirmed)).await.unwrap().status(),
        StatusCode::BAD_REQUEST
    );
    let mut published = confirmed;
    let output = dir.path().join("master.mp4");
    std::fs::write(&output, b"existing rendered output").unwrap();
    published.output_path = Some(output.to_string_lossy().into());
    published.output_sha256 = Some("existing".into());
    published.status = "published".into();
    published.revision += 2;
    app.db.put("shot", "shot", &published).unwrap();
    let mut update = edit(&published);
    update.description = "Updated labels".into();
    assert_eq!(send(update).await.unwrap().status(), StatusCode::OK);
    assert_eq!(
        app.db.get::<Shot>("shot", "shot").unwrap().status,
        "publishing"
    );
    let jobs = app.db.list::<Job>("job").unwrap();
    assert_eq!(jobs.iter().filter(|j| j.kind == "render").count(), 1);
    assert_eq!(jobs.iter().filter(|j| j.kind == "publish").count(), 1);
    published.revision += 2;
    app.db.put("shot", "shot", &published).unwrap();
    let mut update = edit(&published);
    update.recipe.rotation = 90;
    assert_eq!(send(update).await.unwrap().status(), StatusCode::OK);
    let edited = app.db.get::<Shot>("shot", "shot").unwrap();
    assert_eq!(edited.status, "rendering");
    assert!(edited.output_path.is_none());
}
