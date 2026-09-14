use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use moirai_footage::{
    domain::{Job, Source},
    location,
    media::Media,
    service::{App, Config, SyncSettings, router, sync_enabled},
    storage,
    store::Store,
};
use serde_json::{Value, json};
use std::{
    fs,
    sync::{Arc, Mutex},
};
use tower::ServiceExt;

async fn post(app: Arc<App>, path: &str, body: Value) -> (StatusCode, Value) {
    let response = router(app)
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(path)
                .header("x-footage-token", "fixture")
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    (
        status,
        serde_json::from_slice(&to_bytes(response.into_body(), 1024 * 1024).await.unwrap())
            .unwrap(),
    )
}

#[tokio::test(flavor = "multi_thread")]
async fn storage_locations_preserve_nas_and_mirror_local_without_nas_jobs() {
    let root = tempfile::tempdir().unwrap();
    let data = root.path().join("app");
    let nas = root.path().join("nas");
    let folder = root.path().join("folder");
    for path in [&data, &nas, &folder] {
        fs::create_dir_all(path).unwrap();
    }
    let app = Arc::new(App {
        storage_gate: Mutex::new(()),
        db: Store::open(&data.join("library.sqlite3")).unwrap(),
        config: Config {
            data_dir: data.clone(),
            nas_root: nas.clone(),
            require_smb: false,
            ffmpeg: "unused".into(),
            ffprobe: "unused".into(),
            port: 0,
        },
        media: Media {
            root: data.clone(),
            ffmpeg: "unused".into(),
            ffprobe: "unused".into(),
        },
        home: root.path().into(),
        token: "fixture".into(),
    });
    assert_eq!(location::current(&app).unwrap().nas_root, nas);
    let original = data.join("original.mp4");
    fs::write(&original, b"original video").unwrap();
    let source:Source=serde_json::from_value(json!({"id":"source","name":"clip.mp4","product":"sku","batch":"batch","sha256":storage::hash(&original).unwrap(),"path":original,"durationTicks":120000,"width":16,"height":16,"fps":24.0,"colorTransfer":"bt709","rotation":0,"status":"review","error":null,"createdAt":0})).unwrap();
    app.db.put("source", "source", &source).unwrap();
    let mut release = Job::new("publish", "shot", 1);
    release.id = "release".into();
    release.status = "succeeded".into();
    app.db.put("job", "release", &release).unwrap();
    let media_dir = data.join("releases/shots/shot/r1");
    fs::create_dir_all(&media_dir).unwrap();
    fs::write(media_dir.join("master.mp4"), b"approved video").unwrap();
    fs::write(media_dir.join("poster.jpg"), b"poster").unwrap();
    fs::create_dir_all(data.join("publications")).unwrap();
    let metadata = json!({"publicationId":"release","shot":{"id":"shot","sourceId":"source","publishedPath":"shots/shot/r1/master.mp4","outputSha256":storage::hash(&media_dir.join("master.mp4")).unwrap(),"tags":["approved"]}});
    fs::write(data.join("publications/release.json"), metadata.to_string()).unwrap();
    app.db
        .put("settings", "storage", &SyncSettings { sync_to_nas: true })
        .unwrap();
    let pending = Job::new("sync_source", "source", 0);
    app.db.put("job", &pending.id, &pending).unwrap();
    for invalid in [
        "relative",
        data.to_str().unwrap(),
        root.path().to_str().unwrap(),
    ] {
        assert_eq!(
            post(
                app.clone(),
                "/storage-location",
                json!({"mode":"folder","path":invalid,"baseRevision":0})
            )
            .await
            .0,
            StatusCode::BAD_REQUEST
        );
    }
    let result = post(
        app.clone(),
        "/storage-location",
        json!({"mode":"folder","path":folder,"baseRevision":0}),
    )
    .await;
    assert_eq!(result.0, StatusCode::OK, "{:?}", result.1);
    assert_eq!(result.1["status"], "succeeded");
    assert!(!app.db.transaction(|db| Ok(sync_enabled(db))).unwrap());
    assert!(
        app.db
            .get::<SyncSettings>("settings", "storage")
            .unwrap()
            .sync_to_nas
    );
    assert_eq!(app.db.list::<Job>("job").unwrap().len(), 2);
    assert_eq!(
        fs::read(folder.join("sources/source/original.mp4")).unwrap(),
        b"original video"
    );
    assert_eq!(
        fs::read(folder.join("shots/shot/r1/master.mp4")).unwrap(),
        b"approved video"
    );
    assert_eq!(
        serde_json::from_slice::<Value>(
            &fs::read(folder.join("metadata/shot/release.json")).unwrap()
        )
        .unwrap(),
        metadata
    );
    assert!(folder.join("inbox").is_dir());
    assert_eq!(
        post(
            app.clone(),
            "/storage-location",
            json!({"mode":"nas","path":nas,"baseRevision":0})
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    let moved = root.path().join("offline-folder");
    fs::rename(&folder, &moved).unwrap();
    location::local_event(&app, Some("source"), None).unwrap();
    assert_eq!(location::summary(&app).unwrap()["status"], "failed");
    assert!(original.is_file());
    fs::rename(&moved, &folder).unwrap();
    location::backfill(&app).unwrap();
    assert_eq!(location::summary(&app).unwrap()["status"], "succeeded");
    let db = Store::open(&data.join("library.sqlite3")).unwrap();
    assert_eq!(
        db.get::<location::Location>("settings", "location")
            .unwrap()
            .folder_root,
        folder.canonicalize().unwrap()
    );
    let result = post(
        app.clone(),
        "/storage-location",
        json!({"mode":"nas","path":nas,"baseRevision":1}),
    )
    .await;
    assert_eq!(result.0, StatusCode::OK, "{:?}", result.1);
    assert!(app.db.transaction(|db| Ok(sync_enabled(db))).unwrap());
    assert_eq!(
        app.db.get::<Job>("job", &pending.id).unwrap().status,
        "queued"
    );
    let changed = root.path().join("different-nas");
    let result = post(
        app.clone(),
        "/storage-location",
        json!({"mode":"nas","path":changed,"baseRevision":2}),
    )
    .await;
    assert_eq!(result.0, StatusCode::OK, "{:?}", result.1);
    assert_eq!(
        app.db.get::<Job>("job", &pending.id).unwrap().status,
        "superseded"
    );
    let jobs = app.db.list::<Job>("job").unwrap();
    assert_eq!(
        jobs.iter()
            .filter(
                |j| ["sync_source", "sync_release"].contains(&j.kind.as_str())
                    && j.status == "queued"
            )
            .count(),
        2
    );
    assert_eq!(
        post(
            app.clone(),
            "/storage-location/check",
            json!({"mode":"nas","path":changed})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        post(
            app.clone(),
            "/storage-location/check",
            json!({"mode":"folder","path":folder})
        )
        .await
        .0,
        StatusCode::OK
    );
}
