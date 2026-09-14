use super::*;
use base64::{Engine, engine::general_purpose::STANDARD};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use tower::ServiceExt;

async fn product_request(app: Arc<App>, path: &str, body: Value) -> (StatusCode, Value) {
    let response = router(app)
        .oneshot(
            axum::http::Request::builder()
                .method("POST")
                .uri(path)
                .header("x-footage-token", "test")
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), 1024 * 1024)
        .await
        .unwrap();
    (status, serde_json::from_slice(&bytes).unwrap())
}

async fn run_job(app: Arc<App>, mut job: Job) -> Job {
    tokio::task::spawn_blocking(move || {
        let result = execute(&app, &job);
        job.error = result.err().map(|e| e.to_string());
        job.status = if job.error.is_some() {
            "failed"
        } else {
            "succeeded"
        }
        .into();
        app.db
            .transaction(|db| {
                record_failure(db, &job)?;
                store::put(db, "job", &job.id, &job)
            })
            .unwrap();
        job
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "Requires MOIRAI_FFMPEG and MOIRAI_FFPROBE native executables"]
async fn upload_paths_preserve_direct_clip_and_select_one_raw_shot() {
    let root = tempfile::tempdir().unwrap();
    let requests = Arc::new(AtomicUsize::new(0));
    let count = requests.clone();
    let fail_recognition = Arc::new(AtomicBool::new(false));
    let should_fail = fail_recognition.clone();
    let reanalyzing = Arc::new(AtomicBool::new(false));
    let expect_latest = reanalyzing.clone();
    let fail_labels = Arc::new(AtomicBool::new(false));
    let should_fail_labels = fail_labels.clone();
    let mock = Router::new().route("/chat/completions", post(move |Json(body): Json<Value>| {
        let count = count.clone();
        let should_fail = should_fail.clone();
        let expect_latest = expect_latest.clone();
        let should_fail_labels = should_fail_labels.clone();
        async move {
            let content = body["messages"][0]["content"].as_array().unwrap();
            let prompt = content[0]["text"].as_str().unwrap();
            if prompt.contains("商品对照识别") {
                if should_fail.swap(false, Ordering::SeqCst) {
                    return Json(json!({"choices":[{"message":{"content":"{\"matches\":[{\"productId\":\"unknown\",\"confidence\":0.99,\"evidence\":\"wrong id\"}]}"}}]}));
                }
                assert!(prompt.contains("参考图中出现商品当成视频出现商品"));
                let references = content.iter().filter_map(|v|v["text"].as_str())
                    .filter_map(|s|s.strip_prefix("参考商品（不是待识别画面）："))
                    .map(|s|serde_json::from_str::<Value>(s).unwrap()).collect::<Vec<_>>();
                assert_eq!(references.len(),3);
                assert!(content.iter().filter(|v|v["type"]=="image_url").count() >= 3);
                let matches = references.iter().map(|p|json!({"productId":p["productId"],"confidence":if p["alias"]=="Uncertain" {0.5} else {0.95},"evidence":"Visible matching shape at 0 seconds"})).collect::<Vec<_>>();
                return Json(json!({"choices":[{"message":{"content":json!({"matches":matches}).to_string()}}]}));
            }
            if prompt.contains("当前观察窗口") {
                assert!(prompt.contains("一条原片只截取一个"));
                assert!(prompt.contains("标签设定"));
                assert_eq!(prompt.contains("new-label"), expect_latest.load(Ordering::SeqCst));
                return Json(json!({"choices":[{"message":{"content":json!({"segment":{"startSeconds":1,"endSeconds":2,"name":"Single raw shot","description":"A complete product action","tags":["product"],"roles":[{"role":"product_demo","reason":"Visible action","confidence":0.9}],"unsupportedClaims":[],"evidence":"Complete action with clear start and end","rotation":0,"cropSafe":false,"cropX":0.5,"cropY":0.5}}).to_string()}}]}));
            }
            if prompt.contains("内部候选") {
                let candidates: Value = serde_json::from_str(content[1]["text"].as_str().unwrap()).unwrap();
                assert_eq!(candidates.as_array().unwrap().len(),2);
                return Json(json!({"choices":[{"message":{"content":"{\"candidateIndex\":1}"}}]}));
            }
            assert!(content[0]["text"].as_str().unwrap().contains("不切分"));
            assert_eq!(content[1]["type"], "video_url");
            let attempt = count.fetch_add(1, Ordering::SeqCst);
            let labels = if attempt == 0 || should_fail_labels.swap(false, Ordering::SeqCst) { json!({"segments":[]}) } else {
                json!({"name":"Tagged full clip","description":format!("Visible scene {attempt}"),"tags":if expect_latest.load(Ordering::SeqCst) {vec!["new-label"]} else {vec!["detail","unconfigured"]},"roles":[{"role":"product_demo","reason":"Visible action","confidence":0.8}],"unsupportedClaims":[],"evidence":"Visible full action"})
            };
            Json(json!({"choices":[{"message":{"content":labels.to_string()}}]}))
        }
    }));
    let mock = mock.layer(DefaultBodyLimit::disable());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async {
        axum::serve(listener, mock).await.unwrap();
    });
    fs::create_dir_all(root.path().join(".moirai-cut")).unwrap();
    fs::write(
        root.path().join(".moirai-cut/footage-endpoint.json"),
        json!({"baseUrl":url,"apiKey":"fixture-only"}).to_string(),
    )
    .unwrap();
    let media = Media {
        root: root.path().into(),
        ffmpeg: std::env::var("MOIRAI_FFMPEG").unwrap(),
        ffprobe: std::env::var("MOIRAI_FFPROBE").unwrap(),
    };
    let input = root.path().join("uploaded.mov");
    media
        .run(
            &media.ffmpeg,
            &crate::media::strings(&[
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=160x90:rate=4",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:sample_rate=8000",
                "-t",
                "31",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-c:a",
                "aac",
                &input.to_string_lossy(),
            ]),
            60,
        )
        .unwrap();
    let nas_root = tempfile::tempdir().unwrap();
    let folder_root = tempfile::tempdir().unwrap();
    let app = Arc::new(App {
        storage_gate: std::sync::Mutex::new(()),
        db: Store::open(&root.path().join("test.sqlite3")).unwrap(),
        config: Config {
            data_dir: root.path().into(),
            nas_root: nas_root.path().into(),
            require_smb: false,
            ffmpeg: media.ffmpeg.clone(),
            ffprobe: media.ffprobe.clone(),
            port: 0,
        },
        media,
        home: root.path().into(),
        token: "test".into(),
    });
    let (status, tags) = product_request(
        app.clone(),
        "/tag-settings",
        json!({"baseRevision":0,"groups":["","","detail、product",""]}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{tags}");
    assert_eq!(tags["groups"][2], json!(["detail", "product"]));
    assert_eq!(
        product_request(
            app.clone(),
            "/tag-settings",
            json!({"baseRevision":0,"groups":["","","",""]})
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    assert_eq!(
        product_request(
            app.clone(),
            "/storage-location",
            json!({"mode":"folder","path":folder_root.path(),"baseRevision":0})
        )
        .await
        .0,
        StatusCode::OK
    );
    let reference = root.path().join("reference.jpg");
    app.media
        .run(
            &app.media.ffmpeg,
            &crate::media::strings(&[
                "-v",
                "error",
                "-i",
                &input.to_string_lossy(),
                "-frames:v",
                "1",
                &reference.to_string_lossy(),
            ]),
            60,
        )
        .unwrap();
    let image = format!(
        "data:image/jpeg;base64,{}",
        STANDARD.encode(fs::read(&reference).unwrap())
    );
    let mut products = vec![];
    for alias in ["Black", "White", "Uncertain"] {
        let (status, p) = product_request(
            app.clone(),
            "/products",
            json!({"alias":alias,"images":[{"dataUrl":image}]}),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{p}");
        products.push(p);
    }
    assert_eq!(
        product_request(
            app.clone(),
            "/products",
            json!({"alias":"Black","images":[{"dataUrl":image}]})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        product_request(
            app.clone(),
            "/products",
            json!({"alias":"Empty","images":[]})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        product_request(
            app.clone(),
            "/products",
            json!({"alias":"Bad","images":[{"dataUrl":"data:image/png;base64,YmFk"}]})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    let imported = ingest_mode(&app, &input, "uploaded.mov", "sku", "batch", true).unwrap();
    let shot_id = imported["shotId"].as_str().unwrap();
    let mut shot = app.db.get::<Shot>("shot", shot_id).unwrap();
    let source = app.db.get::<Source>("source", &shot.source_id).unwrap();
    assert_eq!(
        storage::hash(&folder_root.path().join(source_relative(&source))).unwrap(),
        source.sha256
    );
    assert_eq!(shot.status, "tagging");
    assert_eq!(
        (shot.start_ticks, shot.end_ticks),
        (0, source.duration_ticks)
    );
    assert_eq!(
        ingest_mode(&app, &input, "uploaded.mov", "sku", "batch", true).unwrap()["shotId"],
        shot_id
    );
    assert_eq!(app.db.list::<Shot>("shot").unwrap().len(), 1);
    assert!(
        action(
            State(app.clone()),
            ApiPath(shot_id.into()),
            Json(Action {
                fields: vec![],
                base_revision: shot.revision,
                action: "publish".into()
            })
        )
        .await
        .is_err()
    );
    let job = app
        .db
        .get::<Job>("job", imported["jobId"].as_str().unwrap())
        .unwrap();
    let failed = run_job(app.clone(), job).await;
    assert_eq!(failed.status, "failed");
    assert_eq!(
        app.db.get::<Shot>("shot", shot_id).unwrap().status,
        "failed"
    );
    let _ = retry(State(app.clone()), ApiPath(failed.id.clone()))
        .await
        .unwrap();
    let job = app.db.get::<Job>("job", &failed.id).unwrap();
    let tagged = run_job(app.clone(), job.clone()).await;
    assert_eq!(tagged.status, "succeeded", "{:?}", tagged.error);
    // Recovery after committing labels must not duplicate the shot or call the model again.
    run_job(app.clone(), job).await;
    assert_eq!(requests.load(Ordering::SeqCst), 3);
    shot = app.db.get::<Shot>("shot", shot_id).unwrap();
    assert_eq!(shot.status, "tag_review");
    assert_eq!(
        (shot.start_ticks, shot.end_ticks),
        (0, source.duration_ticks)
    );
    assert_eq!(shot.recipe.color_mode, "preserve");
    assert_eq!(shot.tags.len(), 3);
    assert!(
        shot.tags.contains(&"detail".into())
            && shot.tags.contains(&"Black".into())
            && shot.tags.contains(&"White".into())
    );
    assert_eq!(shot.product_matches.len(), 2);
    assert_eq!(app.db.list::<Shot>("shot").unwrap().len(), 1);
    assert!(
        action(
            State(app.clone()),
            ApiPath(shot_id.into()),
            Json(Action {
                fields: vec![],
                base_revision: shot.revision,
                action: "render".into()
            })
        )
        .await
        .is_err()
    );
    let patched: ShotEdit = serde_json::from_value(json!({"baseRevision":shot.revision,"name":"Reviewed clip","startTicks":0,"endTicks":source.duration_ticks,"description":"Human reviewed","tags":shot.tags,"roles":shot.roles,"unsupportedClaims":[],"recipe":shot.recipe})).unwrap();
    let mut invalid = patched.clone();
    invalid.end_ticks -= TICKS;
    assert!(invalid.apply(&mut shot.clone(), &source).is_err());
    let mut invalid = patched.clone();
    invalid.recipe.rotation = 90;
    assert!(invalid.apply(&mut shot.clone(), &source).is_err());
    let Json(saved) = confirm_labels(State(app.clone()), ApiPath(shot_id.into()), Json(patched))
        .await
        .unwrap();
    assert_eq!(saved.status, "publishing");
    let publish = app
        .db
        .list::<Job>("job")
        .unwrap()
        .into_iter()
        .find(|j| j.kind == "publish")
        .unwrap();
    let published = run_job(app.clone(), publish).await;
    assert_eq!(published.status, "succeeded", "{:?}", published.error);
    assert_eq!(location::summary(&app).unwrap()["status"], "succeeded");
    let local_manifest: Value = serde_json::from_slice(
        &fs::read(
            folder_root
                .path()
                .join(format!("metadata/{shot_id}/{}.json", published.id)),
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(
        storage::hash(
            &folder_root
                .path()
                .join(local_manifest["shot"]["publishedPath"].as_str().unwrap())
        )
        .unwrap(),
        source.sha256
    );
    assert!(
        !app.db
            .list::<Job>("job")
            .unwrap()
            .iter()
            .any(|j| j.kind.starts_with("sync_"))
    );
    let release = crate::lineage::release_path(&app, &published.id).unwrap();
    assert_eq!(release.extension().unwrap(), "mov");
    assert_eq!(
        storage::hash(&release).unwrap(),
        storage::hash(&input).unwrap()
    );
    let asset = crate::lineage::editor_asset(&app, &published.id).unwrap();
    assert_eq!(asset["name"], "Reviewed clip.mov");
    assert_eq!(asset["hasAudio"], true);
    assert_eq!(media_mime(&release), "video/quicktime");
    fs::create_dir_all(&app.config.nas_root).unwrap();
    assert_eq!(
        product_request(
            app.clone(),
            "/storage-location",
            json!({"mode":"nas","path":app.config.nas_root,"baseRevision":1})
        )
        .await
        .0,
        StatusCode::OK
    );
    let _ = set_storage(State(app.clone()), Json(SyncSettings { sync_to_nas: true }))
        .await
        .unwrap();
    let sync = app
        .db
        .get::<Job>("job", &format!("sync_release-{}", published.id))
        .unwrap();
    let synced = run_job(app.clone(), sync).await;
    assert_eq!(synced.status, "succeeded", "{:?}", synced.error);
    let nas = app
        .config
        .nas_root
        .join(asset["footage"]["publishedPath"].as_str().unwrap());
    assert_eq!(storage::hash(&nas).unwrap(), source.sha256);
    let jobs_before = app.db.list::<Job>("job").unwrap().len();
    let directories_before = fs::read_dir(app.media.root.join("sources"))
        .unwrap()
        .count();
    for direct in [true, false] {
        let duplicate = ingest_mode(
            &app,
            &input,
            "renamed.mov",
            "different-product",
            "different-batch",
            direct,
        )
        .unwrap();
        assert_eq!(duplicate["duplicate"], true);
        assert_eq!(duplicate["sourceId"], source.id);
        assert_eq!(duplicate["shotId"], shot_id);
        assert_eq!(duplicate["existingName"], "uploaded.mov");
    }
    assert_eq!(app.db.list::<Job>("job").unwrap().len(), jobs_before);
    assert_eq!(
        fs::read_dir(app.media.root.join("sources"))
            .unwrap()
            .count(),
        directories_before
    );
    // Distinct bytes with the same filename are accepted; concurrent copies create one source.
    let raw_input = root.path().join("raw.mov");
    app.media
        .run(
            &app.media.ffmpeg,
            &crate::media::strings(&[
                "-v",
                "error",
                "-i",
                &input.to_string_lossy(),
                "-c",
                "copy",
                "-metadata",
                "title=distinct raw fixture",
                &raw_input.to_string_lossy(),
            ]),
            60,
        )
        .unwrap();
    let results = std::thread::scope(|scope| {
        let a = scope.spawn(|| ingest(&app, &raw_input, "uploaded.mov", "sku", "batch").unwrap());
        let b = scope
            .spawn(|| ingest(&app, &raw_input, "renamed.mov", "other", "other-batch").unwrap());
        [a.join().unwrap(), b.join().unwrap()]
    });
    assert_eq!(results.iter().filter(|v| v["duplicate"] == true).count(), 1);
    assert_eq!(results[0]["sourceId"], results[1]["sourceId"]);
    let raw = results
        .into_iter()
        .find(|v| v["duplicate"] == false)
        .unwrap();
    assert_eq!(
        product_request(
            app.clone(),
            "/tag-settings",
            json!({"baseRevision":1,"groups":["new-label","","",""]})
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        fs::read_dir(app.media.root.join("sources"))
            .unwrap()
            .count(),
        directories_before + 1
    );
    let (status, updated) = product_request(app.clone(),"/products",json!({"id":products[0]["id"],"baseRevision":1,"alias":"Black renamed","images":[{"id":products[0]["images"][0]["id"]},{"dataUrl":image}]})).await;
    assert_eq!(status, StatusCode::OK, "{updated}");
    assert_eq!(updated["images"].as_array().unwrap().len(), 2);
    assert_eq!(product_request(app.clone(),"/products",json!({"id":products[0]["id"],"baseRevision":1,"alias":"Stale","images":[{"id":products[0]["images"][0]["id"]}]})).await.0,StatusCode::CONFLICT);
    products[0] = updated;
    assert_ne!(raw["sourceId"], imported["sourceId"]);
    assert_eq!(
        app.db
            .get::<Job>("job", raw["jobId"].as_str().unwrap())
            .unwrap()
            .kind,
        "archive"
    );
    let archive = app
        .db
        .get::<Job>("job", raw["jobId"].as_str().unwrap())
        .unwrap();
    assert_eq!(run_job(app.clone(), archive).await.status, "succeeded");
    let analysis = app
        .db
        .list::<Job>("job")
        .unwrap()
        .into_iter()
        .find(|j| j.kind == "analyze")
        .unwrap();
    let analyzed = run_job(app.clone(), analysis.clone()).await;
    assert_eq!(analyzed.status, "succeeded", "{:?}", analyzed.error);
    assert_eq!(run_job(app.clone(), analysis).await.status, "succeeded");
    let raw_shots = app
        .db
        .list::<Shot>("shot")
        .unwrap()
        .into_iter()
        .filter(|s| s.source_id == raw["sourceId"].as_str().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(raw_shots.len(), 1);
    let duplicate =
        ingest_mode(&app, &raw_input, "raw-as-shot.mov", "", "new-batch", true).unwrap();
    assert_eq!(duplicate["duplicate"], true);
    assert_eq!(duplicate["shotId"], raw_shots[0].id);
    assert!(raw_shots[0].tags.contains(&"Black".into()));
    assert!(!raw_shots[0].tags.contains(&"Black renamed".into()));
    let runs = fs::read_dir(app.media.root.join("analysis")).unwrap();
    let mut raw_recognition = false;
    for dir in runs.flatten() {
        let path = dir.path().join("input-0-0.json");
        if path.exists() {
            let input: Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
            if input["shotId"] == raw_shots[0].id {
                assert_eq!(input["startSeconds"], 29.0);
                assert_eq!(input["endSeconds"], 30.0);
                raw_recognition = true;
            }
        }
    }
    assert!(raw_recognition);
    assert_eq!(
        (raw_shots[0].start_ticks, raw_shots[0].end_ticks),
        (29 * TICKS, 30 * TICKS)
    );
    assert!(
        manual(
            State(app.clone()),
            ApiPath(raw["sourceId"].as_str().unwrap().into())
        )
        .await
        .is_err()
    );
    let mut current = app.db.get::<Shot>("shot", shot_id).unwrap();
    fail_recognition.store(true, Ordering::SeqCst);
    app.db
        .put(
            "settings",
            "model",
            &ModelSettings {
                model_id: "fixture".into(),
                input_mode: "frames".into(),
            },
        )
        .unwrap();
    current.tags.push("manual-scene".into());
    app.db.put("shot", shot_id, &current).unwrap();
    let Json(pending) = action(
        State(app.clone()),
        ApiPath(shot_id.into()),
        Json(Action {
            fields: vec![],
            base_revision: current.revision,
            action: "recognize_products".into(),
        }),
    )
    .await
    .unwrap();
    assert_eq!(pending.status, "recognizing");
    assert!(
        action(
            State(app.clone()),
            ApiPath(shot_id.into()),
            Json(Action {
                fields: vec![],
                base_revision: pending.revision,
                action: "publish".into()
            })
        )
        .await
        .is_err()
    );
    let recognition = app
        .db
        .list::<Job>("job")
        .unwrap()
        .into_iter()
        .find(|j| j.kind == "recognize_products")
        .unwrap();
    let result = run_job(app.clone(), recognition.clone()).await;
    assert_eq!(result.status, "failed");
    assert_eq!(
        app.db.get::<Shot>("shot", shot_id).unwrap().tags,
        current.tags
    );
    let _ = retry(State(app.clone()), ApiPath(recognition.id.clone()))
        .await
        .unwrap();
    let recognition = app.db.get::<Job>("job", &recognition.id).unwrap();
    let result = run_job(app.clone(), recognition.clone()).await;
    assert_eq!(result.status, "succeeded", "{:?}", result.error);
    assert_eq!(run_job(app.clone(), recognition).await.status, "succeeded");
    current = app.db.get::<Shot>("shot", shot_id).unwrap();
    assert_eq!(current.status, "tag_review");
    assert!(
        current.tags.contains(&"manual-scene".into()) && current.tags.contains(&"detail".into())
    );
    assert!(
        current.tags.contains(&"Black renamed".into()) && !current.tags.contains(&"Black".into())
    );
    assert_eq!(storage::hash(&release).unwrap(), source.sha256);
    for p in products {
        assert_eq!(
            product_request(
                app.clone(),
                &format!("/products/{}/delete", p["id"].as_str().unwrap()),
                json!({"baseRevision":p["revision"]})
            )
            .await
            .0,
            StatusCode::OK
        );
    }
    assert_eq!(
        app.db.get::<Shot>("shot", shot_id).unwrap().tags,
        current.tags
    );
    let Json(pending) = action(
        State(app.clone()),
        ApiPath(shot_id.into()),
        Json(Action {
            fields: vec![],
            base_revision: current.revision,
            action: "recognize_products".into(),
        }),
    )
    .await
    .unwrap();
    let job = app
        .db
        .list::<Job>("job")
        .unwrap()
        .into_iter()
        .find(|j| j.kind == "recognize_products" && j.revision == pending.revision)
        .unwrap();
    assert_eq!(run_job(app.clone(), job).await.status, "succeeded");
    current = app.db.get::<Shot>("shot", shot_id).unwrap();
    assert_eq!(current.tags, vec!["detail", "manual-scene"]);
    assert!(current.product_matches.is_empty());
    let shot_count = app.db.list::<Shot>("shot").unwrap().len();
    reanalyzing.store(true, Ordering::SeqCst);
    app.db
        .put(
            "settings",
            "model",
            &ModelSettings {
                model_id: "fixture".into(),
                input_mode: "video".into(),
            },
        )
        .unwrap();
    for target in [shot_id, raw_shots[0].id.as_str()] {
        let mut before = app.db.get::<Shot>("shot", target).unwrap();
        before.keep_original_audio = true;
        before.is_featured = true;
        before.tags.push("discard-manual-tag".into());
        app.db.put("shot", target, &before).unwrap();
        let Json(pending) = action(
            State(app.clone()),
            ApiPath(target.into()),
            Json(Action {
                fields: vec![],
                base_revision: before.revision,
                action: "reanalyze_replace".into(),
            }),
        )
        .await
        .unwrap();
        assert_eq!(pending.status, "tagging");
        assert!(
            action(
                State(app.clone()),
                ApiPath(target.into()),
                Json(Action {
                    fields: vec![],
                    base_revision: pending.revision,
                    action: "reanalyze_replace".into(),
                })
            )
            .await
            .is_err()
        );
        let job = app
            .db
            .list::<Job>("job")
            .unwrap()
            .into_iter()
            .find(|j| j.kind == "reanalyze" && j.target_id == target)
            .unwrap();
        let config = app
            .db
            .get::<AnalysisSettings>("model_config", &job.id)
            .unwrap();
        assert!(config.tag_settings.is_some());
        let result = run_job(app.clone(), job.clone()).await;
        assert_eq!(result.status, "succeeded", "{:?}", result.error);
        assert_eq!(run_job(app.clone(), job).await.status, "succeeded");
        let after = app.db.get::<Shot>("shot", target).unwrap();
        assert_eq!(after.id, before.id);
        assert!(after.keep_original_audio && after.is_featured);
        assert_eq!(after.revision, pending.revision + 1);
        assert!(!after.tags.contains(&"discard-manual-tag".into()));
        assert!(!after.tags.contains(&"manual-scene".into()));
        assert!(after.product_tags.is_empty());
        assert!(after.published_path.is_none());
        if after.direct_upload {
            assert_eq!(
                (after.start_ticks, after.end_ticks),
                (0, source.duration_ticks)
            );
            assert_eq!(after.output_sha256.as_ref(), Some(&source.sha256));
            assert_eq!(after.status, "tag_review");
        } else {
            assert!(after.output_path.is_none());
            assert_eq!(after.status, "draft");
        }
    }
    for target in [shot_id, raw_shots[0].id.as_str()] {
        let mut before = app.db.get::<Shot>("shot", target).unwrap();
        before.name = "Human-authored name".into();
        before.description = "Human-authored description".into();
        before.details.subject = "Human-authored subject".into();
        before.tags = vec!["keep-manual-tag".into()];
        before.has_holiday = true;
        before.holiday_tags = vec!["Manual holiday".into()];
        if !before.direct_upload {
            before.start_ticks += TICKS / 4;
            before.end_ticks -= TICKS / 4;
            before.recipe.rotation = 90;
            before.recipe.brightness = 0.1;
            before.labels_need_review = true;
        }
        before.revision += 1;
        app.db.put("shot", target, &before).unwrap();
        let Json(pending) = action(
            State(app.clone()),
            ApiPath(target.into()),
            Json(Action {
                fields: vec![],
                base_revision: before.revision,
                action: "reanalyze".into(),
            }),
        )
        .await
        .unwrap();
        let job = app
            .db
            .list::<Job>("job")
            .unwrap()
            .into_iter()
            .find(|job| {
                job.kind == "reanalyze"
                    && job.target_id == target
                    && job.revision == pending.revision
            })
            .unwrap();
        let result = run_job(app.clone(), job.clone()).await;
        assert_eq!(result.status, "succeeded", "{:?}", result.error);
        assert_eq!(run_job(app.clone(), job).await.status, "succeeded");
        let unchanged = app.db.get::<Shot>("shot", target).unwrap();
        assert_eq!(unchanged.name, before.name);
        assert_eq!(unchanged.description, before.description);
        assert_eq!(
            serde_json::to_value(&unchanged.details).unwrap(),
            serde_json::to_value(&before.details).unwrap()
        );
        assert_eq!(unchanged.tags, before.tags);
        assert_eq!(
            (unchanged.start_ticks, unchanged.end_ticks),
            (before.start_ticks, before.end_ticks)
        );
        assert_eq!(unchanged.recipe, before.recipe);
        let suggestion = app
            .db
            .get::<crate::label_review::Suggestion>("analysis_suggestion", target)
            .unwrap();
        assert_eq!(suggestion.base_revision, unchanged.revision);
        assert_eq!(suggestion.shot.tags, vec!["new-label"]);
        assert_eq!(
            (suggestion.shot.start_ticks, suggestion.shot.end_ticks),
            (before.start_ticks, before.end_ticks)
        );
        let Json(accepted) = action(
            State(app.clone()),
            ApiPath(target.into()),
            Json(Action {
                fields: vec!["tags".into()],
                base_revision: unchanged.revision,
                action: "accept_analysis".into(),
            }),
        )
        .await
        .unwrap();
        assert_eq!(accepted.tags, vec!["new-label"]);
        assert_eq!(accepted.name, before.name);
        assert_eq!(accepted.description, before.description);
        assert_eq!(
            serde_json::to_value(&accepted.details).unwrap(),
            serde_json::to_value(&before.details).unwrap()
        );
        assert_eq!(accepted.recipe, before.recipe);
        assert_eq!(
            (accepted.start_ticks, accepted.end_ticks),
            (before.start_ticks, before.end_ticks)
        );
        assert_eq!(accepted.holiday_tags, before.holiday_tags);
        assert_eq!(accepted.has_holiday, before.has_holiday);
        assert_eq!(accepted.keep_original_audio, before.keep_original_audio);
        assert_eq!(accepted.is_featured, before.is_featured);
        assert_eq!(accepted.labels_need_review, before.labels_need_review);
        assert!(
            app.db
                .get::<crate::label_review::Suggestion>("analysis_suggestion", target)
                .is_err()
        );
    }
    for keep_previous_status in [true, false] {
        let mut before = app.db.get::<Shot>("shot", shot_id).unwrap();
        before.status = "published".into();
        before.published_path = Some("fixture/published/master.mov".into());
        before.revision += 1;
        app.db.put("shot", shot_id, &before).unwrap();
        fail_labels.store(true, Ordering::SeqCst);
        let Json(pending) = action(
            State(app.clone()),
            ApiPath(shot_id.into()),
            Json(Action {
                fields: vec![],
                base_revision: before.revision,
                action: "reanalyze".into(),
            }),
        )
        .await
        .unwrap();
        let failed_job = app
            .db
            .list::<Job>("job")
            .unwrap()
            .into_iter()
            .find(|job| {
                job.kind == "reanalyze"
                    && job.target_id == shot_id
                    && job.revision == pending.revision
            })
            .unwrap();
        assert_eq!(run_job(app.clone(), failed_job).await.status, "failed");
        let failed = app.db.get::<Shot>("shot", shot_id).unwrap();
        assert_eq!(failed.status, "failed");
        assert_eq!(failed.name, before.name);
        assert_eq!(failed.tags, before.tags);
        assert_eq!(failed.published_path, before.published_path);
        if !keep_previous_status {
            app.db
                .transaction(|db| {
                    db.execute(
                        "DELETE FROM records WHERE kind='reanalysis_previous_status' AND id=?1",
                        [shot_id],
                    )?;
                    Ok(())
                })
                .unwrap();
        }
        let Json(pending) = action(
            State(app.clone()),
            ApiPath(shot_id.into()),
            Json(Action {
                fields: vec![],
                base_revision: failed.revision,
                action: "reanalyze".into(),
            }),
        )
        .await
        .unwrap();
        let next_job = app
            .db
            .list::<Job>("job")
            .unwrap()
            .into_iter()
            .find(|job| {
                job.kind == "reanalyze"
                    && job.target_id == shot_id
                    && job.revision == pending.revision
            })
            .unwrap();
        let result = run_job(app.clone(), next_job).await;
        assert_eq!(result.status, "succeeded", "{:?}", result.error);
        let restored = app.db.get::<Shot>("shot", shot_id).unwrap();
        assert_eq!(restored.status, "published");
        assert_eq!(restored.published_path, before.published_path);
        assert_eq!(restored.output_path, before.output_path);
        assert_eq!(restored.name, before.name);
        assert_eq!(restored.tags, before.tags);
        assert!(restored.error.is_none());
        assert_eq!(
            app.db
                .get::<crate::label_review::Suggestion>("analysis_suggestion", shot_id)
                .unwrap()
                .base_revision,
            restored.revision
        );
    }
    assert_eq!(app.db.list::<Shot>("shot").unwrap().len(), shot_count);
    assert_eq!(storage::hash(&release).unwrap(), source.sha256);
    server.abort();
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "Requires MOIRAI_FFMPEG and MOIRAI_FFPROBE native executables"]
async fn one_label_confirmation_publishes_and_resaves_without_second_review() {
    let root = tempfile::tempdir().unwrap();
    let media = Media {
        root: root.path().into(),
        ffmpeg: std::env::var("MOIRAI_FFMPEG").unwrap(),
        ffprobe: std::env::var("MOIRAI_FFPROBE").unwrap(),
    };
    let input = root.path().join("source.mp4");
    media
        .run(
            &media.ffmpeg,
            &crate::media::strings(&[
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
                &input.to_string_lossy(),
            ]),
            60,
        )
        .unwrap();
    let source = media
        .source(
            &input,
            "source.mp4".into(),
            "sku".into(),
            "fixture".into(),
            storage::hash(&input).unwrap(),
            "source".into(),
        )
        .unwrap();
    let db = Store::open(&root.path().join("confirmation.sqlite3")).unwrap();
    db.put("source", "source", &source).unwrap();
    let mut shot:Shot=serde_json::from_value(json!({"id":"shot","sourceId":"source","revision":1,"name":"Confirmed clip","startTicks":12000,"endTicks":216000,"description":"Visible product","tags":["first"],"roles":[{"role":"product_demo","reason":"visible","confidence":1.0}],"unsupportedClaims":[],"evidence":"visible action","recipe":Recipe::default(),"status":"draft","error":null,"qualityIssues":[],"outputPath":null,"outputSha256":null,"publishedPath":null,"analysisRunId":"fixture","modelId":"fixture","inputMode":"manual","createdAt":0})).unwrap();
    shot.recipe.color_mode = "preserve".into();
    db.put("shot", "shot", &shot).unwrap();
    let app = Arc::new(App {
        storage_gate: std::sync::Mutex::new(()),
        db,
        config: Config {
            data_dir: root.path().into(),
            nas_root: root.path().join("offline"),
            require_smb: false,
            ffmpeg: media.ffmpeg.clone(),
            ffprobe: media.ffprobe.clone(),
            port: 0,
        },
        media,
        home: root.path().into(),
        token: "test".into(),
    });
    let edit = |s: &Shot| ShotEdit {
        keep_original_audio: Some(s.keep_original_audio),
        is_featured: Some(s.is_featured),
        details: Some(s.details.clone()),
        has_holiday: Some(s.has_holiday),
        holiday_tags: Some(s.holiday_tags.clone()),
        base_revision: s.revision,
        name: s.name.clone(),
        start_ticks: s.start_ticks,
        end_ticks: s.end_ticks,
        description: s.description.clone(),
        tags: s.tags.clone(),
        roles: s.roles.clone(),
        unsupported_claims: s.unsupported_claims.clone(),
        recipe: s.recipe.clone(),
    };
    let (status, _) = product_request(
        app.clone(),
        "/shots/shot/confirm",
        serde_json::to_value(edit(&shot)).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let render = app
        .db
        .list::<Job>("job")
        .unwrap()
        .into_iter()
        .find(|j| j.kind == "render")
        .unwrap();
    let parked = root.path().join("parked.mp4");
    fs::rename(&input, &parked).unwrap();
    let failed = run_job(app.clone(), render.clone()).await;
    assert_eq!(failed.status, "failed");
    fs::rename(&parked, &input).unwrap();
    let _ = retry(State(app.clone()), ApiPath(failed.id.clone()))
        .await
        .unwrap();
    let retried = app.db.get::<Job>("job", &render.id).unwrap();
    assert!(app.db.get::<bool>("auto_publish", &render.id).unwrap());
    let rendered = run_job(app.clone(), retried).await;
    assert_eq!(rendered.status, "succeeded", "{:?}", rendered.error);
    assert_eq!(
        app.db.get::<Shot>("shot", "shot").unwrap().status,
        "publishing"
    );
    let publication = app
        .db
        .get::<Job>("job", &format!("publish-{}", render.id))
        .unwrap();
    execute(&app, &rendered).unwrap();
    assert_eq!(
        app.db
            .list::<Job>("job")
            .unwrap()
            .iter()
            .filter(|j| j.kind == "publish")
            .count(),
        1
    );
    let published = run_job(app.clone(), publication).await;
    assert_eq!(published.status, "succeeded", "{:?}", published.error);
    let manifest = root
        .path()
        .join("publications")
        .join(format!("{}.json", published.id));
    let original_manifest = fs::read(&manifest).unwrap();
    let original_release = crate::lineage::release_path(&app, &published.id).unwrap();
    let original_hash = storage::hash(&original_release).unwrap();
    assert_eq!(app.db.list::<Review>("review").unwrap().len(), 1);
    shot = app.db.get("shot", "shot").unwrap();
    let output = shot.output_path.clone();
    shot.tags = vec!["second".into()];
    assert_eq!(
        product_request(
            app.clone(),
            "/shots/shot/confirm",
            serde_json::to_value(edit(&shot)).unwrap()
        )
        .await
        .0,
        StatusCode::OK
    );
    let current = app.db.get::<Shot>("shot", "shot").unwrap();
    assert_eq!(current.status, "publishing");
    assert_eq!(current.output_path, output);
    assert_eq!(
        app.db
            .list::<Job>("job")
            .unwrap()
            .iter()
            .filter(|j| j.kind == "render")
            .count(),
        1
    );
    let publish = app
        .db
        .list::<Job>("job")
        .unwrap()
        .into_iter()
        .find(|j| j.kind == "publish" && j.status == "queued")
        .unwrap();
    assert_eq!(run_job(app.clone(), publish).await.status, "succeeded");
    shot = app.db.get("shot", "shot").unwrap();
    shot.recipe.rotation = 90;
    assert_eq!(
        product_request(
            app.clone(),
            "/shots/shot/confirm",
            serde_json::to_value(edit(&shot)).unwrap()
        )
        .await
        .0,
        StatusCode::OK
    );
    let render2 = app
        .db
        .list::<Job>("job")
        .unwrap()
        .into_iter()
        .find(|j| j.kind == "render" && j.status == "queued")
        .unwrap();
    assert_eq!(run_job(app.clone(), render2).await.status, "succeeded");
    let publish2 = app
        .db
        .list::<Job>("job")
        .unwrap()
        .into_iter()
        .find(|j| j.kind == "publish" && j.status == "queued")
        .unwrap();
    assert_eq!(run_job(app.clone(), publish2).await.status, "succeeded");
    execute(&app, &rendered).unwrap();
    assert_eq!(
        app.db.get::<Shot>("shot", "shot").unwrap().status,
        "published"
    );
    assert_eq!(fs::read(manifest).unwrap(), original_manifest);
    assert_eq!(storage::hash(&original_release).unwrap(), original_hash);
    assert_eq!(app.db.list::<Review>("review").unwrap().len(), 3);
    assert_eq!(
        crate::lineage::releases(&app)
            .unwrap()
            .iter()
            .filter(|v| v["current"] == true)
            .count(),
        1
    );
}
