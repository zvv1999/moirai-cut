use super::*;
use crate::{adaptive_lut::AdaptiveLut, domain::Source};
use axum::{Json, body::to_bytes, http::StatusCode, response::IntoResponse};
use std::sync::atomic::AtomicUsize;
use tower::ServiceExt;

const SOURCE_ID: &str = "11111111-1111-4111-8111-111111111111";
const SHOT_ID: &str = "22222222-2222-4222-8222-222222222222";

fn source(bytes: &[u8]) -> Source {
    use sha2::{Digest, Sha256};
    serde_json::from_value(json!({
        "id":SOURCE_ID, "name":"test.mp4", "path":"/nas/private/original.mp4",
        "product":"", "batch":"", "sha256":format!("{:x}", Sha256::digest(bytes)),
        "durationTicks":240000, "width":320, "height":240, "fps":12.0,
        "colorTransfer":"bt709", "rotation":0, "status":"review", "createdAt":0
    }))
    .unwrap()
}

fn metadata(source: &Source) -> Value {
    let mut value = json!({
        "libraryId":"team", "sources":[source],
        "shots":[{"id":SHOT_ID, "sourceId":source.id, "directUpload":false, "status":"draft"}]
    });
    value["sources"][0].as_object_mut().unwrap().remove("path");
    value
}

struct RemoteState {
    metadata: Mutex<Value>,
    bytes: Vec<u8>,
    state_requests: AtomicUsize,
    downloads: AtomicUsize,
    preview_requests: AtomicUsize,
    corrupt: AtomicBool,
}
struct Remote {
    url: String,
    state: Arc<RemoteState>,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for Remote {
    fn drop(&mut self) {
        self.task.abort();
    }
}

async fn remote(bytes: Vec<u8>) -> Remote {
    let state = Arc::new(RemoteState {
        metadata: Mutex::new(metadata(&source(&bytes))),
        bytes,
        state_requests: AtomicUsize::new(0),
        downloads: AtomicUsize::new(0),
        preview_requests: AtomicUsize::new(0),
        corrupt: AtomicBool::new(false),
    });
    async fn handle(State(s): State<Arc<RemoteState>>, req: Request) -> Response {
        if req
            .headers()
            .get("x-footage-token")
            .and_then(|v| v.to_str().ok())
            != Some("coordinator-token")
        {
            return StatusCode::UNAUTHORIZED.into_response();
        }
        let path = req.uri().path();
        if path == "/state" {
            s.state_requests.fetch_add(1, Ordering::SeqCst);
            return Json(s.metadata.lock().unwrap().clone()).into_response();
        }
        if path == format!("/media/source/{SOURCE_ID}/original") {
            assert_eq!(req.headers()["x-footage-library"], "team");
            s.downloads.fetch_add(1, Ordering::SeqCst);
            let bytes = if s.corrupt.load(Ordering::SeqCst) {
                b"incomplete download".to_vec()
            } else {
                s.bytes.clone()
            };
            return bytes.into_response();
        }
        if path.starts_with("/shots/") {
            s.preview_requests.fetch_add(1, Ordering::SeqCst);
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error":"Coordinator has no preview model or media tools"})),
            )
                .into_response();
        }
        StatusCode::NOT_FOUND.into_response()
    }
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let router = Router::new().fallback(handle).with_state(state.clone());
    let task = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    Remote { url, state, task }
}

fn client(root: &Path, remote: &Remote) -> Arc<Client> {
    let token = root.join("team-token");
    fs::write(&token, "coordinator-token").unwrap();
    Arc::new(Client {
        config: EdgeConfig {
            server_url: remote.url.clone(),
            server_token_file: token,
            data_dir: root.join("worker"),
            worker_id: crate::domain::id(),
            port: 0,
            ffmpeg: std::env::var("MOIRAI_FFMPEG").unwrap_or_else(|_| "ffmpeg".into()),
            ffprobe: std::env::var("MOIRAI_FFPROBE").unwrap_or_else(|_| "ffprobe".into()),
        },
        token: "local-token".into(),
        home: root.into(),
        status: Mutex::new(json!({"stage":"idle"})),
    })
}

fn input(operation: &str) -> Value {
    let mut input = json!({"startTicks":0,"endTicks":240000});
    if operation == "preview-plan" {
        input["recipe"] = json!(crate::domain::Recipe::default());
    }
    input
}

async fn preview_request(
    c: Arc<Client>,
    token: &str,
    library: &str,
    operation: &str,
    input: Value,
) -> Response {
    Router::new()
        .fallback(gateway)
        .with_state(c)
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/shots/{SHOT_ID}/{operation}"))
                .header("x-footage-token", token)
                .header("x-footage-library", library)
                .header("content-type", "application/json")
                .body(Body::from(input.to_string()))
                .unwrap(),
        )
        .await
        .unwrap()
}

async fn assert_error(response: Response, error: &str) {
    assert!(response.status().is_client_error(), "{}", response.status());
    let body = to_bytes(response.into_body(), 4096).await.unwrap();
    let value: Value = serde_json::from_slice(&body).unwrap();
    assert!(value["error"].as_str().unwrap().contains(error), "{value}");
}

#[tokio::test]
async fn previews_validate_auth_library_range_and_current_records_before_download() {
    let temp = tempfile::tempdir().unwrap();
    let remote = remote(b"original".to_vec()).await;
    let c = client(temp.path(), &remote);
    let original = remote.state.metadata.lock().unwrap().clone();
    let objects = c.config.data_dir.join("objects");
    fs::create_dir_all(&objects).unwrap();
    fs::write(
        objects.join(source(&remote.state.bytes).sha256),
        &remote.state.bytes,
    )
    .unwrap();

    for operation in ["preview-plan", "preview-exposure", "preview-lut"] {
        *remote.state.metadata.lock().unwrap() = original.clone();
        let requests = remote.state.state_requests.load(Ordering::SeqCst);
        assert_eq!(
            preview_request(c.clone(), "wrong", "team", operation, input(operation))
                .await
                .status(),
            StatusCode::UNAUTHORIZED
        );
        assert_error(
            preview_request(c.clone(), "local-token", "", operation, input(operation)).await,
            "需要素材库标识",
        )
        .await;
        assert_eq!(remote.state.state_requests.load(Ordering::SeqCst), requests);

        for (library, start, end, error) in [
            ("stale", 0, 240000, "素材库已切换"),
            ("team", -1, 240000, "片段时间必须位于原片内"),
            ("team", 0, 360000, "片段时间必须位于原片内"),
        ] {
            let mut input = input(operation);
            input["startTicks"] = json!(start);
            input["endTicks"] = json!(end);
            assert_error(
                preview_request(c.clone(), "local-token", library, operation, input).await,
                error,
            )
            .await;
        }
        for (key, value, error) in [
            ("libraryId", Value::Null, "素材库已切换"),
            ("shots", json!([]), "分镜不存在或已删除"),
            ("sources", json!([]), "原片不存在或已删除"),
        ] {
            let mut changed = original.clone();
            changed[key] = value;
            *remote.state.metadata.lock().unwrap() = changed;
            assert_error(
                preview_request(
                    c.clone(),
                    "local-token",
                    "team",
                    operation,
                    input(operation),
                )
                .await,
                error,
            )
            .await;
        }
        for (key, field, value, error) in [
            ("shots", "directUpload", json!(true), "直接上传分镜"),
            ("shots", "status", json!("deleted"), "分镜不存在或已删除"),
            ("sources", "status", json!("deleted"), "原片不存在或已删除"),
        ] {
            let mut changed = original.clone();
            changed[key][0][field] = value;
            *remote.state.metadata.lock().unwrap() = changed;
            assert_error(
                preview_request(
                    c.clone(),
                    "local-token",
                    "team",
                    operation,
                    input(operation),
                )
                .await,
                error,
            )
            .await;
        }
    }
    assert_eq!(remote.state.downloads.load(Ordering::SeqCst), 0);
    assert_eq!(remote.state.preview_requests.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn preview_plan_stays_local_and_private_without_downloading_original() {
    let temp = tempfile::tempdir().unwrap();
    let remote = remote(b"original".to_vec()).await;
    let c = client(temp.path(), &remote);
    let response = preview_request(
        c.clone(),
        "local-token",
        "team",
        "preview-plan",
        input("preview-plan"),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["x-moirai-preview-compute"], "local");
    assert_eq!(response.headers()["cache-control"], "private, no-store");
    let body = to_bytes(response.into_body(), 4096).await.unwrap();
    let value: Value = serde_json::from_slice(&body).unwrap();
    assert!(value["geometry"].is_object());
    assert!(!c.config.data_dir.exists());
    assert_eq!(remote.state.downloads.load(Ordering::SeqCst), 0);
    assert_eq!(remote.state.preview_requests.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn original_endpoint_requires_auth_supports_ranges_and_rejects_deleted_sources() {
    let temp = tempfile::tempdir().unwrap();
    let bytes = b"original video bytes";
    let mut source = source(bytes);
    source.path = temp
        .path()
        .join("original.mp4")
        .to_string_lossy()
        .into_owned();
    fs::write(&source.path, bytes).unwrap();
    let app = Arc::new(App {
        config: Config {
            data_dir: temp.path().into(),
            nas_root: PathBuf::new(),
            require_smb: false,
            ffmpeg: "ffmpeg".into(),
            ffprobe: "ffprobe".into(),
            port: 0,
        },
        media: Media {
            root: temp.path().into(),
            ffmpeg: "ffmpeg".into(),
            ffprobe: "ffprobe".into(),
        },
        db: Store::open(&temp.path().join("library.sqlite3")).unwrap(),
        home: temp.path().into(),
        token: "test".into(),
        storage_gate: Mutex::new(()),
    });
    app.db.put("source", SOURCE_ID, &source).unwrap();
    let request = |token| {
        Request::builder()
            .uri(format!("/media/source/{SOURCE_ID}/original"))
            .header("x-footage-token", token)
            .header("range", "bytes=2-6")
            .body(Body::empty())
            .unwrap()
    };
    let router = crate::service::router(app.clone());
    assert_eq!(
        router
            .clone()
            .oneshot(request("wrong"))
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    let result = router.clone().oneshot(request("test")).await.unwrap();
    assert_eq!(result.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(
        to_bytes(result.into_body(), 1024).await.unwrap().as_ref(),
        &bytes[2..7]
    );
    source.status = "deleted".into();
    app.db.put("source", SOURCE_ID, &source).unwrap();
    assert_eq!(
        router.oneshot(request("test")).await.unwrap().status(),
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
#[ignore = "Requires local Image-Adaptive-3DLUT runtime and native FFmpeg"]
async fn local_lut_reuses_verified_originals_and_matches_rendering() {
    let temp = tempfile::tempdir().unwrap();
    let media = Media {
        root: temp.path().join("render"),
        ffmpeg: std::env::var("MOIRAI_FFMPEG").unwrap_or_else(|_| "ffmpeg".into()),
        ffprobe: std::env::var("MOIRAI_FFPROBE").unwrap_or_else(|_| "ffprobe".into()),
    };
    let original_path = temp.path().join("synthetic.mp4");
    media
        .run(
            &media.ffmpeg,
            &crate::media::strings(&[
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
                original_path.to_str().unwrap(),
            ]),
            30,
        )
        .unwrap();
    let bytes = fs::read(&original_path).unwrap();
    let mut source = source(&bytes);
    source.path = original_path.to_string_lossy().into_owned();
    let remote = remote(bytes).await;
    let c = client(temp.path(), &remote);
    let request = || {
        preview_request(
            c.clone(),
            "local-token",
            "team",
            "preview-lut",
            input("preview-lut"),
        )
    };
    let (first, second) = tokio::join!(request(), request());
    let mut previous = None;
    for result in [first, second] {
        let status = result.status();
        assert_eq!(result.headers()["cache-control"], "private, no-store");
        let body = to_bytes(result.into_body(), 4 * 1024 * 1024).await.unwrap();
        assert_eq!(status, StatusCode::OK, "{}", String::from_utf8_lossy(&body));
        let lut: AdaptiveLut = serde_json::from_slice(&body).unwrap();
        assert_eq!(lut.size, 33);
        assert_eq!(lut.values.len(), 33 * 33 * 33 * 3);
        assert!(lut.values.iter().all(|v| v.is_finite()));
        if let Some(values) = previous.as_ref() {
            assert_eq!(&lut.values, values);
        }
        previous = Some(lut.values);
    }
    assert_eq!(remote.state.downloads.load(Ordering::SeqCst), 1);
    let expected =
        tokio::task::spawn_blocking(move || media.adaptive_lut(&source, 0, 240000).unwrap())
            .await
            .unwrap();
    assert_eq!(previous.unwrap(), expected.values);

    let objects = c.config.data_dir.join("objects");
    let cached = objects.join(crate::storage::hash(&original_path).unwrap());
    fs::write(&cached, b"damaged cache").unwrap();
    remote.state.corrupt.store(true, Ordering::SeqCst);
    assert_error(request().await, "预览原片校验失败").await;
    assert_eq!(fs::read(&cached).unwrap(), b"damaged cache");
    assert_eq!(fs::read_dir(&objects).unwrap().count(), 1);
    remote.state.corrupt.store(false, Ordering::SeqCst);
    assert_eq!(request().await.status(), StatusCode::OK);
    assert_eq!(fs::read(&cached).unwrap(), remote.state.bytes);
    assert_eq!(remote.state.downloads.load(Ordering::SeqCst), 3);

    remote.state.metadata.lock().unwrap()["libraryId"] = json!("another-library");
    assert_error(request().await, "素材库已切换").await;
    remote.state.metadata.lock().unwrap()["libraryId"] = json!("team");
    remote.state.metadata.lock().unwrap()["shots"] = json!([]);
    assert_error(request().await, "分镜不存在或已删除").await;
    assert_eq!(remote.state.downloads.load(Ordering::SeqCst), 3);
    assert_eq!(remote.state.preview_requests.load(Ordering::SeqCst), 0);
}
