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
fn edit(shot: &Shot) -> ShotEdit {
    ShotEdit {
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
