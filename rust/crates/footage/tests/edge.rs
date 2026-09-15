use moirai_footage::{
    domain::{Job, Source},
    edge::{self, Asset, Finish, Packet, Record},
    media::Media,
    service::{App, Config},
    storage,
    store::Store,
};
use serde_json::{Value, json};
use std::{fs, sync::Mutex};

fn fixture(root: &std::path::Path) -> App {
    let app = App {
        config: Config {
            data_dir: root.into(),
            nas_root: Default::default(),
            require_smb: false,
            ffmpeg: "ffmpeg".into(),
            ffprobe: "ffprobe".into(),
            port: 0,
        },
        media: Media {
            root: root.into(),
            ffmpeg: "ffmpeg".into(),
            ffprobe: "ffprobe".into(),
        },
        db: Store::open(&root.join("library.sqlite3")).unwrap(),
        home: root.into(),
        token: "test".into(),
        storage_gate: Mutex::new(()),
    };
    fs::create_dir_all(root.join("sources/source")).unwrap();
    fs::write(root.join("sources/source/original"), b"test input").unwrap();
    let source:Source=serde_json::from_value(json!({"id":"source","name":"test.mp4","product":"","batch":"","path":root.join("sources/source/original"),"sha256":storage::hash(&root.join("sources/source/original")).unwrap(),"durationTicks":1200000,"width":1080,"height":1920,"fps":30.0,"colorTransfer":"bt709","rotation":0,"status":"queued","error":null,"createdAt":0})).unwrap();
    app.db.put("source", "source", &source).unwrap();
    let job = Job::new("archive", "source", 0);
    app.db.put("job", &job.id, &job).unwrap();
    app
}
fn failure(packet: &Packet) -> Finish {
    Finish {
        lease: packet.lease.clone(),
        records: vec![],
        files: vec![],
        error: Some("test failure".into()),
    }
}

#[test]
fn one_worker_claims_and_restart_preserves_live_lease() {
    let dir = tempfile::tempdir().unwrap();
    let app = fixture(dir.path());
    let packet = edge::claim_job(&app, "worker-a").unwrap().unwrap();
    assert!(edge::claim_job(&app, "worker-b").unwrap().is_none());
    app.db.recover().unwrap();
    assert_eq!(
        app.db.get::<Job>("job", &packet.job.id).unwrap().status,
        "running"
    );
    assert!(edge::claim_job(&app, "worker-b").unwrap().is_none());
}
#[test]
fn expired_lease_reassigns_and_rejects_old_results() {
    let dir = tempfile::tempdir().unwrap();
    let app = fixture(dir.path());
    let mut old = edge::claim_job(&app, "worker-a").unwrap().unwrap();
    old.expires_at = 0;
    app.db.put("edge_lease", &old.job.id, &old).unwrap();
    let new = edge::claim_job(&app, "worker-b").unwrap().unwrap();
    assert_ne!(old.lease, new.lease);
    assert!(edge::finish_job(&app, &old.job.id, failure(&old)).is_err());
    edge::finish_job(&app, &new.job.id, failure(&new)).unwrap();
}
#[test]
fn completion_is_idempotent_but_changed_duplicate_is_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let app = fixture(dir.path());
    let packet = edge::claim_job(&app, "worker-a").unwrap().unwrap();
    let input = failure(&packet);
    assert_eq!(
        edge::finish_job(&app, &packet.job.id, input.clone()).unwrap()["duplicate"],
        false
    );
    assert_eq!(
        edge::finish_job(&app, &packet.job.id, input.clone()).unwrap()["duplicate"],
        true
    );
    let mut changed = input;
    changed.error = Some("different".into());
    assert!(edge::finish_job(&app, &packet.job.id, changed).is_err());
}
#[test]
fn concurrent_metadata_edit_rejects_result() {
    let dir = tempfile::tempdir().unwrap();
    let app = fixture(dir.path());
    let packet = edge::claim_job(&app, "worker-a").unwrap().unwrap();
    let mut source: Source = app.db.get("source", "source").unwrap();
    source.name = "human edit".into();
    app.db.put("source", "source", &source).unwrap();
    assert!(edge::finish_job(&app, &packet.job.id, failure(&packet)).is_err());
    assert_eq!(
        app.db.get::<Source>("source", "source").unwrap().name,
        "human edit"
    );
}
#[test]
fn invalid_metadata_never_promotes_uploaded_media() {
    let dir = tempfile::tempdir().unwrap();
    let app = fixture(dir.path());
    let packet = edge::claim_job(&app, "worker-a").unwrap().unwrap();
    let mut source = packet
        .records
        .iter()
        .find(|r| r.kind == "source")
        .unwrap()
        .value
        .clone();
    source["durationTicks"] = json!(1);
    let staged = dir.path().join("staged");
    fs::write(&staged, b"poster").unwrap();
    let hash = storage::hash(&staged).unwrap();
    fs::create_dir(dir.path().join("edge-blobs")).unwrap();
    fs::rename(staged, dir.path().join("edge-blobs").join(&hash)).unwrap();
    let input = Finish {
        lease: packet.lease,
        records: vec![Record {
            kind: "source".into(),
            id: "source".into(),
            value: source,
        }],
        files: vec![Asset {
            path: "sources/source/poster.jpg".into(),
            sha256: hash,
            size: 6,
        }],
        error: None,
    };
    assert!(edge::finish_job(&app, &packet.job.id, input).is_err());
    assert!(!dir.path().join("sources/source/poster.jpg").exists());
    assert_eq!(
        app.db.get::<Job>("job", &packet.job.id).unwrap().status,
        "running"
    );
}
#[test]
fn traversal_and_symlinks_are_rejected() {
    let dir = tempfile::tempdir().unwrap();
    for path in [
        "../escape",
        "/absolute",
        "sources/../../escape",
        "C:\\escape",
        "",
    ] {
        assert!(edge::safe_path(dir.path(), path).is_err());
    }
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink("/tmp", dir.path().join("link")).unwrap();
        assert!(edge::safe_path(dir.path(), "link/file").is_err());
    }
}
#[test]
fn failed_jobs_keep_worker_receipt() {
    let dir = tempfile::tempdir().unwrap();
    let app = fixture(dir.path());
    let packet = edge::claim_job(&app, "worker-a").unwrap().unwrap();
    edge::finish_job(&app, &packet.job.id, failure(&packet)).unwrap();
    let receipts: Vec<Value> = app.db.list("edge_receipt").unwrap();
    assert_eq!(receipts[0]["workerId"], "worker-a");
}
