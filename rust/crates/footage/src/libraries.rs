use crate::{
    domain::id,
    location,
    media::Media,
    service::{self, ApiError, App},
    store::{self, Store},
};
use anyhow::{Context, Result, ensure};
use axum::{
    Json, Router,
    body::to_bytes,
    extract::{Request, State},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
};
use tokio::sync::RwLock;
use tower::ServiceExt;

const MARKER: &str = ".moirai-library";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Identity {
    version: u32,
    id: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Active {
    id: String,
    root: PathBuf,
    mode: String,
    revision: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Change {
    mode: String,
    path: String,
    base_revision: u64,
}

struct Running {
    app: Arc<App>,
    active: Option<Active>,
    stopped: Arc<AtomicBool>,
    workers: Vec<std::thread::JoinHandle<()>>,
}

pub struct Libraries {
    host: Arc<App>,
    running: RwLock<Running>,
    start_workers: bool,
}

fn write_json(path: &Path, value: &impl Serialize) -> Result<()> {
    let temp = path.with_extension(format!("{}.tmp", id()));
    fs::write(&temp, serde_json::to_vec(value)?)?;
    fs::File::open(&temp)?.sync_all()?;
    fs::rename(&temp, path)?;
    Ok(())
}

fn identity(root: &Path) -> Result<Option<Identity>> {
    ensure!(
        !root.join(MARKER).is_symlink(),
        "素材库标识目录不能是符号链接"
    );
    let path = root.join(MARKER).join("identity.json");
    if !path.exists() {
        return Ok(None);
    }
    let identity: Identity =
        serde_json::from_slice(&fs::read(path)?).context("素材库标识损坏，未切换目录")?;
    ensure!(
        identity.version == 1 && uuid::Uuid::parse_str(&identity.id).is_ok(),
        "素材库版本或标识无效"
    );
    Ok(Some(identity))
}

impl Libraries {
    pub fn open(host: Arc<App>, start_workers: bool) -> Result<Arc<Self>> {
        let active_path = host.config.data_dir.join("active-library.json");
        let active: Option<Active> = if active_path.exists() {
            Some(serde_json::from_slice(&fs::read(active_path)?)?)
        } else {
            None
        };
        let app = if let Some(active) = &active {
            Self::load_app(&host, active)?
        } else {
            host.clone()
        };
        let stopped = Arc::new(AtomicBool::new(false));
        let workers = if start_workers {
            service::worker_until(app.clone(), stopped.clone())
        } else {
            vec![]
        };
        Ok(Arc::new(Self {
            host,
            running: RwLock::new(Running {
                app,
                active,
                stopped,
                workers,
            }),
            start_workers,
        }))
    }

    fn registry(host: &App) -> Result<BTreeMap<String, PathBuf>> {
        let path = host.config.data_dir.join("library-registry.json");
        if path.exists() {
            Ok(serde_json::from_slice(&fs::read(path)?)?)
        } else {
            Ok(BTreeMap::new())
        }
    }

    fn register(host: &App, identity: &Identity, data: &Path) -> Result<()> {
        let mut registry = Self::registry(host)?;
        registry.insert(identity.id.clone(), data.into());
        write_json(
            &host.config.data_dir.join("library-registry.json"),
            &registry,
        )
    }

    fn load_app(host: &App, active: &Active) -> Result<Arc<App>> {
        ensure!(uuid::Uuid::parse_str(&active.id).is_ok(), "素材库标识无效");
        let registered = Self::registry(host)?.get(&active.id).cloned();
        let data =
            registered.unwrap_or_else(|| host.config.data_dir.join("libraries").join(&active.id));
        if !data.join("library.sqlite3").is_file() {
            restore(&active.root, &data)?;
        }
        let mut config = host.config.clone();
        config.data_dir = data.clone();
        let app = Arc::new(App {
            storage_gate: Mutex::new(()),
            db: Store::open(&data.join("library.sqlite3"))?,
            media: Media {
                root: data,
                ffmpeg: config.ffmpeg.clone(),
                ffprobe: config.ffprobe.clone(),
            },
            config,
            home: host.home.clone(),
            token: host.token.clone(),
        });
        app.db.recover()?;
        let mut location = location::current(&app)?;
        location.mode = active.mode.clone();
        if active.mode == "folder" {
            location.folder_root = active.root.clone();
        } else {
            location.nas_root = active.root.clone();
        }
        location.revision = active.revision;
        app.db.put("settings", "location", &location)?;
        Ok(app)
    }

    fn bind_legacy(&self, running: &mut Running) -> Result<()> {
        if running.active.is_some() {
            return Ok(());
        }
        let location = location::current(&running.app)?;
        let root = if location.mode == "folder" {
            location.folder_root
        } else {
            location.nas_root
        };
        if !root.is_dir() {
            let has_content = running.app.db.transaction(|db| {
                Ok(db.query_row(
                    "SELECT EXISTS(SELECT 1 FROM records WHERE kind <> 'settings' OR id <> 'location')",
                    [],
                    |row| row.get::<_, bool>(0),
                )?)
            })?;
            ensure!(
                !has_content,
                "原素材库目录当前不可用；请先重新连接原目录，以便绑定并保留已有素材、标签和任务"
            );
            return Ok(());
        }
        // Existing data belongs only to the previously selected directory.
        let root = root.canonicalize()?;
        let identity = identity(&root)?.unwrap_or(Identity {
            version: 1,
            id: id(),
        });
        if let Some(registered) = Self::registry(&self.host)?.get(&identity.id) {
            ensure!(
                registered == &running.app.config.data_dir,
                "原目录已绑定其他素材库，未覆盖其记录"
            );
        }
        fs::create_dir_all(root.join(MARKER))?;
        Self::register(&self.host, &identity, &running.app.config.data_dir)?;
        write_json(&root.join(MARKER).join("identity.json"), &identity)?;
        running.active = Some(Active {
            id: identity.id,
            root,
            mode: location.mode,
            revision: location.revision,
        });
        write_json(
            &self.host.config.data_dir.join("active-library.json"),
            &running.active,
        )?;
        Ok(())
    }

    fn switch(&self, running: &mut Running, input: Change) -> Result<Value> {
        let previous = location::current(&running.app)?;
        ensure!(
            previous.revision == input.base_revision,
            "revision_conflict"
        );
        let root = location::validate(&self.host, &input.mode, &input.path, true)?;
        self.bind_legacy(running)?;
        if let Some(active) = &running.active {
            if active.root == root && active.mode == input.mode {
                return Ok(json!({"libraryId":active.id,"created":false,"imported":0,"errors":[]}));
            }
            // Offline old volumes never cause local records to be removed.
            if active.root.is_dir() {
                snapshot(&running.app, &active.root)?;
            }
        }
        let existing = identity(&root)?;
        let created = existing.is_none();
        let identity = existing.unwrap_or(Identity {
            version: 1,
            id: id(),
        });
        let active = Active {
            id: identity.id.clone(),
            root: root.clone(),
            mode: input.mode,
            revision: previous.revision + 1,
        };
        let mut videos = vec![];
        if created {
            collect_videos(&root, &mut videos)?;
            let data = self
                .host
                .config
                .data_dir
                .join("libraries")
                .join(&identity.id);
            fs::create_dir_all(&data)?;
            Store::open(&data.join("library.sqlite3"))?;
            Self::register(&self.host, &identity, &data)?;
            fs::create_dir_all(root.join(MARKER))?;
            write_json(&root.join(MARKER).join("identity.json"), &identity)?;
        }
        let app = Self::load_app(&self.host, &active)?;
        Self::register(&self.host, &identity, &app.config.data_dir)?;
        let mut imported = 0;
        let mut duplicates = 0;
        let mut errors = vec![];
        for video in videos {
            let name = video
                .file_name()
                .context("视频文件名无效")?
                .to_string_lossy();
            match service::ingest_mode(&app, &video, &name, "", "目录首次导入", false) {
                Ok(result) if result["duplicate"] == true => duplicates += 1,
                Ok(_) => imported += 1,
                Err(error) => errors.push(json!({"file":video,"error":error.to_string()})),
            }
        }
        snapshot(&app, &root)?;
        write_json(
            &self.host.config.data_dir.join("active-library.json"),
            &active,
        )?;
        running.app = app;
        running.active = Some(active);
        Ok(
            json!({"libraryId":identity.id,"created":created,"imported":imported,"duplicates":duplicates,"errors":errors}),
        )
    }

    pub fn router(self: Arc<Self>) -> Router {
        Router::new().fallback(dispatch).with_state(self)
    }
}

async fn dispatch(State(libraries): State<Arc<Libraries>>, request: Request) -> Response {
    if request
        .headers()
        .get("x-footage-token")
        .and_then(|v| v.to_str().ok())
        != Some(libraries.host.token.as_str())
    {
        return (
            axum::http::StatusCode::UNAUTHORIZED,
            Json(json!({"error":"未授权"})),
        )
            .into_response();
    }
    if request.method() == "POST" && request.uri().path() == "/storage-location" {
        let expected = request
            .headers()
            .get("x-footage-library")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let result = async {
            let body = to_bytes(request.into_body(), 1024 * 1024).await?;
            let input: Change = serde_json::from_slice(&body)?;
            let mut running = tokio::time::timeout(
                std::time::Duration::from_secs(10),
                libraries.running.write(),
            ).await.map_err(|_| anyhow::anyhow!("当前仍有素材请求未结束，请稍后重新打开素材库"))?;
            ensure!(
                expected.as_deref().is_none_or(
                    |id| id == running.active.as_ref().map_or("legacy", |a| a.id.as_str())
                ),
                "素材库已切换，请刷新页面后重试"
            );
            // Drain current work before checkpointing; queued jobs remain with their library.
            running.stopped.store(true, Ordering::SeqCst);
            let workers = std::mem::take(&mut running.workers);
            tokio::task::spawn_blocking(move || {
                for worker in workers {
                    let _ = worker.join();
                }
            })
            .await?;
            let result = tokio::task::block_in_place(|| libraries.switch(&mut running, input));
            running.stopped = Arc::new(AtomicBool::new(false));
            if libraries.start_workers {
                running.workers =
                    service::worker_until(running.app.clone(), running.stopped.clone());
            }
            result
        }
        .await;
        return match result {
            Ok(value) => Json(value).into_response(),
            Err(error) => ApiError(error).into_response(),
        };
    }
    let running = libraries.running.read().await;
    let library_id = running.active.as_ref().map_or("legacy", |a| a.id.as_str()).to_owned();
    if request.method() != "GET"
        && request
            .headers()
            .get("x-footage-library")
            .and_then(|v| v.to_str().ok())
            .is_some_and(|id| id != library_id)
    {
        return ApiError(anyhow::anyhow!("素材库已切换，请刷新页面后重试")).into_response();
    }
    let is_state = request.method() == "GET" && request.uri().path() == "/state";
    let app = running.app.clone();
    // Preview POSTs only compute disposable caches in their captured library.
    let preview_read = request.method() == "POST" && {
        let parts: Vec<_> = request.uri().path().split('/').collect();
        matches!(parts.as_slice(), ["", "shots", id, "preview-plan" | "preview-exposure" | "preview-lut"] if !id.is_empty())
    };
    let _write_guard = if request.method() == "GET" || preview_read {
        drop(running);
        None
    } else {
        Some(running)
    };
    let response = service::router(app).oneshot(request).await;
    match response {
        Ok(response) if is_state && response.status().is_success() => {
            let result = async {
                let bytes = to_bytes(response.into_body(), 64 * 1024 * 1024).await?;
                let mut value: Value = serde_json::from_slice(&bytes)?;
                value["libraryId"] = json!(library_id);
                Ok::<_, anyhow::Error>(Json(value).into_response())
            }
            .await;
            result.unwrap_or_else(|e| ApiError(e).into_response())
        }
        Ok(response) => response,
        Err(error) => match error {},
    }
}

fn collect_videos(root: &Path, result: &mut Vec<PathBuf>) -> Result<()> {
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        let kind = entry.file_type()?;
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() {
            collect_videos(&entry.path(), result)?;
        } else if entry
            .path()
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| {
                ["mp4", "mov", "m4v", "webm", "mkv", "avi"].contains(&e.to_lowercase().as_str())
            })
        {
            result.push(entry.path());
        }
    }
    result.sort();
    Ok(())
}

fn copy_tree(from: &Path, to: &Path) -> Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        ensure!(!kind.is_symlink(), "素材库内部不支持符号链接");
        let target = to.join(entry.file_name());
        if kind.is_dir() {
            copy_tree(&entry.path(), &target)?;
        } else if kind.is_file() {
            if target.is_file()
                && crate::storage::hash(&entry.path())? == crate::storage::hash(&target)?
            {
                continue;
            }
            let temporary = target.with_extension(format!("{}.tmp", id()));
            fs::copy(entry.path(), &temporary)?;
            fs::File::open(&temporary)?.sync_all()?;
            fs::rename(temporary, target)?;
        }
    }
    Ok(())
}

fn snapshot(app: &App, root: &Path) -> Result<()> {
    let dest = root.join(MARKER);
    fs::create_dir_all(dest.join("files"))?;
    // Only library-owned media directories are exported, never credentials or sibling libraries.
    for entry in fs::read_dir(&app.config.data_dir)? {
        let entry = entry?;
        let name = entry.file_name();
        if entry.file_type()?.is_dir()
            && [
                "sources",
                "shots",
                "releases",
                "publications",
                "analysis",
                "uploads",
            ]
            .contains(&name.to_string_lossy().as_ref())
        {
            copy_tree(&entry.path(), &dest.join("files").join(name))?;
        }
    }
    let records: Vec<(String, String, String)> = app.db.transaction(|db| {
        let mut stmt = db.prepare("SELECT kind,id,body FROM records ORDER BY rowid")?;
        Ok(stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()?)
    })?;
    write_json(
        &dest.join("snapshot.json"),
        &json!({"version":1,"dataDir":app.config.data_dir,"records":records}),
    )
}

fn restore(root: &Path, data: &Path) -> Result<()> {
    let staged = data.with_extension(format!("restore-{}", id()));
    fs::create_dir_all(&staged)?;
    let result = restore_into(root, &staged, data).and_then(|()| {
        if data.exists() {
            fs::remove_dir(data).context("素材库缓存目录非空，未覆盖现有文件")?;
        }
        fs::rename(&staged, data)?;
        Ok(())
    });
    if result.is_err() {
        let _ = fs::remove_dir_all(&staged);
    }
    result
}

fn restore_into(root: &Path, staged: &Path, data: &Path) -> Result<()> {
    let snapshot: Value = serde_json::from_slice(
        &fs::read(root.join(MARKER).join("snapshot.json"))
            .context("未找到该素材库的本机索引或目录快照，未切换素材库")?,
    )?;
    ensure!(snapshot["version"] == 1, "素材库快照版本无效");
    let previous = snapshot["dataDir"].as_str().context("素材库快照路径缺失")?;
    let records: Vec<(String, String, String)> =
        serde_json::from_value(snapshot["records"].clone())?;
    copy_tree(&root.join(MARKER).join("files"), staged)?;
    let db = Store::open(&staged.join("library.sqlite3"))?;
    db.transaction(|db| {
        for (kind, id, body) in records {
            let mut body: Value = serde_json::from_str(&body)?;
            rebase(&mut body, Path::new(previous), data);
            store::put(db, &kind, &id, &body)?;
        }
        Ok(())
    })?;
    // Publication manifests also contain local absolute paths.
    let publications = staged.join("publications");
    if publications.is_dir() {
        for entry in fs::read_dir(publications)? {
            let path = entry?.path();
            if path.extension().is_some_and(|e| e == "json") {
                let mut value: Value = serde_json::from_slice(&fs::read(&path)?)?;
                rebase(&mut value, Path::new(previous), data);
                write_json(&path, &value)?;
            }
        }
    }
    Ok(())
}

fn rebase(value: &mut Value, from: &Path, to: &Path) {
    match value {
        Value::String(text) => {
            if let Ok(relative) = Path::new(text).strip_prefix(from) {
                *text = to.join(relative).to_string_lossy().into();
            }
        }
        Value::Array(values) => {
            for value in values {
                rebase(value, from, to);
            }
        }
        Value::Object(values) => {
            for value in values.values_mut() {
                rebase(value, from, to);
            }
        }
        _ => (),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{domain::Job, service::Config};
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };

    #[test]
    fn failed_restore_never_leaves_a_loadable_partial_database() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("library");
        let data = temp.path().join("cache");
        fs::create_dir_all(root.join(MARKER).join("files/sources")).unwrap();
        fs::write(root.join(MARKER).join("files/sources/original"), b"media").unwrap();
        let path = root.join(MARKER).join("snapshot.json");
        write_json(
            &path,
            &json!({"version":1,"dataDir":"/old/cache","records":[["marker","id","invalid json"]]}),
        )
        .unwrap();
        assert!(restore(&root, &data).is_err());
        assert!(!data.exists());
        write_json(&path, &json!({"version":1,"dataDir":"/old/cache","records":[["marker","id",json!({"path":"/old/cache/sources/original"}).to_string()]]})).unwrap();
        restore(&root, &data).unwrap();
        let db = Store::open(&data.join("library.sqlite3")).unwrap();
        assert_eq!(
            db.get::<Value>("marker", "id").unwrap()["path"],
            json!(data.join("sources/original"))
        );
        assert_eq!(fs::read(data.join("sources/original")).unwrap(), b"media");
    }

    fn fixture(root: &Path, folder: &Path) -> Arc<App> {
        let data = root.join("app");
        fs::create_dir_all(&data).unwrap();
        let app = Arc::new(App {
            storage_gate: Mutex::new(()),
            db: Store::open(&data.join("library.sqlite3")).unwrap(),
            config: Config {
                data_dir: data.clone(),
                nas_root: PathBuf::new(),
                require_smb: false,
                ffmpeg: "/opt/homebrew/bin/ffmpeg".into(),
                ffprobe: "/opt/homebrew/bin/ffprobe".into(),
                port: 0,
            },
            media: Media {
                root: data,
                ffmpeg: "/opt/homebrew/bin/ffmpeg".into(),
                ffprobe: "/opt/homebrew/bin/ffprobe".into(),
            },
            home: root.into(),
            token: "test".into(),
        });
        app.db
            .put(
                "settings",
                "location",
                &location::Location {
                    mode: "folder".into(),
                    folder_root: folder.into(),
                    nas_root: PathBuf::new(),
                    revision: 0,
                    nas_generation: String::new(),
                },
            )
            .unwrap();
        app
    }

    async fn change(
        libraries: &Arc<Libraries>,
        root: &Path,
        mode: &str,
        revision: u64,
        expected: Option<&str>,
    ) -> (StatusCode, Value) {
        let mut request = Request::builder()
            .method("POST")
            .uri("/storage-location")
            .header("x-footage-token", "test");
        if let Some(expected) = expected {
            request = request.header("x-footage-library", expected);
        }
        let response = libraries
            .clone()
            .router()
            .oneshot(
                request
                    .body(Body::from(
                        json!({"mode":mode,"path":root,"baseRevision":revision}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status();
        let body = to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
        (status, serde_json::from_slice(&body).unwrap())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn pending_preview_posts_release_switch_lock_but_mutations_keep_it() {
        for endpoint in ["preview-plan", "preview-exposure", "preview-lut", "action"] {
            let temp = tempfile::tempdir().unwrap();
            let old = temp.path().join("old");
            let new = temp.path().join("new");
            fs::create_dir_all(&old).unwrap();
            fs::create_dir_all(&new).unwrap();
            let libraries = Libraries::open(fixture(temp.path(), &old), false).unwrap();
            let body = Body::from_stream(futures_util::stream::pending::<Result<axum::body::Bytes, std::io::Error>>());
            let request = Request::builder().method("POST")
                .uri(format!("/shots/test/{endpoint}"))
                .header("x-footage-token", "test")
                .header("content-type", "application/json")
                .body(body).unwrap();
            let pending = tokio::spawn(libraries.clone().router().oneshot(request));
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            assert!(!pending.is_finished());
            if endpoint == "action" {
                assert!(libraries.running.try_write().is_err());
            } else {
                let result = tokio::time::timeout(std::time::Duration::from_secs(2), change(&libraries, &new, "folder", 0, None)).await;
                assert_eq!(result.unwrap().0, StatusCode::OK);
            }
            pending.abort();
            let _ = pending.await;
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn offline_legacy_library_with_content_must_be_reconnected_before_switching() {
        let temp = tempfile::tempdir().unwrap();
        let old = temp.path().join("offline-old");
        let new = temp.path().join("new");
        fs::create_dir_all(&new).unwrap();
        let host = fixture(temp.path(), &old);
        host.db.put("marker", "history", &"keep me").unwrap();
        let libraries = Libraries::open(host, false).unwrap();

        let result = change(&libraries, &new, "folder", 0, Some("legacy")).await;

        assert_eq!(result.0, StatusCode::BAD_REQUEST, "{}", result.1);
        assert!(result.1["error"].as_str().unwrap().contains("重新连接原目录"));
        assert!(!new.join(MARKER).exists());
        assert!(!temp.path().join("app/active-library.json").exists());
        assert_eq!(
            libraries.running.read().await.app.db.get::<String>("marker", "history").unwrap(),
            "keep me"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn empty_offline_legacy_database_can_select_its_first_library() {
        let temp = tempfile::tempdir().unwrap();
        let old = temp.path().join("offline-old");
        let new = temp.path().join("new");
        fs::create_dir_all(&new).unwrap();
        let libraries = Libraries::open(fixture(temp.path(), &old), false).unwrap();

        let result = change(&libraries, &new, "folder", 0, Some("legacy")).await;

        assert_eq!(result.0, StatusCode::OK, "{}", result.1);
        assert_eq!(
            libraries.running.read().await.active.as_ref().unwrap().root,
            new.canonicalize().unwrap()
        );
    }

    #[cfg(unix)]
    #[tokio::test(flavor = "multi_thread")]
    async fn stalled_media_read_does_not_block_switching_libraries() {
        use std::os::unix::ffi::OsStrExt;
        let temp = tempfile::tempdir().unwrap();
        let old = temp.path().join("old");
        let new = temp.path().join("new");
        fs::create_dir_all(&old).unwrap();
        fs::create_dir_all(&new).unwrap();
        let host = fixture(temp.path(), &old);
        host.db.put("source", "source", &json!({
            "id":"source","name":"fixture.mp4","product":"","batch":"","sha256":"fixture",
            "path":"unused","durationTicks":120000,"width":32,"height":32,"fps":30.0,
            "colorTransfer":"bt709","rotation":0,"status":"review","createdAt":0
        })).unwrap();
        let fifo = host.config.data_dir.join("sources/source/preview.mp4");
        fs::create_dir_all(fifo.parent().unwrap()).unwrap();
        let name = std::ffi::CString::new(fifo.as_os_str().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(name.as_ptr(), 0o600) }, 0);
        let libraries = Libraries::open(host, false).unwrap();
        let request = Request::builder().uri("/media/source/source/preview")
            .header("x-footage-token", "test").body(Body::empty()).unwrap();
        let pending = tokio::spawn(libraries.clone().router().oneshot(request));
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        assert!(!pending.is_finished());
        let result = tokio::time::timeout(std::time::Duration::from_secs(2), change(&libraries, &new, "folder", 0, None)).await;
        // Release the intentionally blocked reader even if the regression reappears.
        tokio::task::spawn_blocking(move || fs::OpenOptions::new().write(true).open(fifo).unwrap()).await.unwrap();
        pending.await.unwrap().unwrap();
        assert_eq!(result.expect("a read must not hold the switch lock").0, StatusCode::OK);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn empty_directories_are_isolated_and_existing_libraries_reload_on_both_modes() {
        let temp = tempfile::tempdir().unwrap();
        let old = temp.path().join("old");
        let new = temp.path().join("new");
        let nas = temp.path().join("nas");
        for dir in [&old, &new, &nas] {
            fs::create_dir_all(dir).unwrap();
        }
        let host = fixture(temp.path(), &old);
        host.db
            .put(
                "settings",
                "tags",
                &json!({"revision":1,"groups":[["旧标签"],[],[],[]]}),
            )
            .unwrap();
        host.db.put("marker", "old", &"old library").unwrap();
        let asset = host.config.data_dir.join("sources/test");
        fs::create_dir_all(&asset).unwrap();
        fs::write(asset.join("original.mp4"), b"old library media").unwrap();
        let libraries = Libraries::open(host.clone(), false).unwrap();
        let first = change(&libraries, &new, "folder", 0, Some("legacy")).await;
        assert_eq!(first.0, StatusCode::OK, "{}", first.1);
        assert_eq!(first.1["created"], true);
        assert_eq!(first.1["imported"], 0);
        assert!(!new.join("sources").exists());
        assert!(
            !new.join(MARKER)
                .join("files/sources/test/original.mp4")
                .exists()
        );
        assert!(
            old.join(MARKER)
                .join("files/sources/test/original.mp4")
                .is_file()
        );
        let new_id = first.1["libraryId"].as_str().unwrap();
        {
            let running = libraries.running.read().await;
            assert!(running.app.db.list::<Value>("marker").unwrap().is_empty());
            assert!(
                crate::tag_settings::current(&running.app.db.0.lock().unwrap())
                    .unwrap()
                    .groups
                    .iter()
                    .all(Vec::is_empty)
            );
            running.app.db.put("marker", "new", &"new library").unwrap();
        }
        assert_eq!(
            change(&libraries, &nas, "nas", 1, Some("legacy")).await.0,
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            change(&libraries, &nas, "nas", 0, Some(new_id)).await.0,
            StatusCode::CONFLICT
        );
        let result = change(&libraries, &nas, "nas", 1, Some(new_id)).await;
        assert_eq!(result.0, StatusCode::OK, "{}", result.1);
        assert!(
            libraries
                .running
                .read()
                .await
                .app
                .db
                .list::<Value>("marker")
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            change(&libraries, &old, "folder", 2, None).await.0,
            StatusCode::OK
        );
        assert_eq!(
            libraries
                .running
                .read()
                .await
                .app
                .db
                .get::<String>("marker", "old")
                .unwrap(),
            "old library"
        );
        assert_eq!(
            change(&libraries, &new, "folder", 3, None).await.0,
            StatusCode::OK
        );
        assert_eq!(
            libraries
                .running
                .read()
                .await
                .app
                .db
                .get::<String>("marker", "new")
                .unwrap(),
            "new library"
        );
        drop(libraries);
        let restarted = Libraries::open(host.clone(), false).unwrap();
        assert_eq!(
            restarted.running.read().await.active.as_ref().unwrap().root,
            new.canonicalize().unwrap()
        );
        assert_eq!(
            restarted
                .running
                .read()
                .await
                .app
                .db
                .get::<String>("marker", "new")
                .unwrap(),
            "new library"
        );
        // A second machine can reconstruct the saved library without the first machine's cache.
        let other = temp.path().join("other-machine");
        fs::create_dir_all(&other).unwrap();
        let other_host = fixture(&other, &nas);
        let restored = Libraries::load_app(
            &other_host,
            &Active {
                id: identity(&old).unwrap().unwrap().id,
                root: old,
                mode: "folder".into(),
                revision: 8,
            },
        )
        .unwrap();
        assert_eq!(
            restored.db.get::<String>("marker", "old").unwrap(),
            "old library"
        );
        assert_eq!(
            fs::read(restored.config.data_dir.join("sources/test/original.mp4")).unwrap(),
            b"old library media"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "requires ffmpeg and ffprobe"]
    async fn plain_directory_imports_videos_once_and_deduplicates_without_running_ai() {
        let temp = tempfile::tempdir().unwrap();
        let old = temp.path().join("old");
        let folder = temp.path().join("videos");
        fs::create_dir_all(&old).unwrap();
        fs::create_dir_all(folder.join("nested")).unwrap();
        let host = fixture(temp.path(), &old);
        let input = folder.join("clip.mp4");
        let status = std::process::Command::new(&host.media.ffmpeg)
            .args([
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=c=red:s=32x32:d=0.3",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
            ])
            .arg(&input)
            .status()
            .unwrap();
        assert!(status.success());
        fs::copy(&input, folder.join("nested/same.mp4")).unwrap();
        fs::write(folder.join("notes.txt"), "keep me").unwrap();
        let libraries = Libraries::open(host, false).unwrap();
        let result = change(&libraries, &folder, "folder", 0, None).await;
        assert_eq!(result.0, StatusCode::OK, "{}", result.1);
        assert_eq!(result.1["imported"], 1);
        assert_eq!(result.1["duplicates"], 1);
        assert_eq!(result.1["errors"], json!([]));
        let running = libraries.running.read().await;
        assert_eq!(running.app.db.list::<Value>("source").unwrap().len(), 1);
        assert!(running.app.db.list::<Value>("shot").unwrap().is_empty());
        let jobs = running.app.db.list::<Job>("job").unwrap();
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].kind, "archive");
        assert_eq!(jobs[0].status, "queued");
        drop(running);
        assert_eq!(
            change(&libraries, &old, "folder", 1, None).await.0,
            StatusCode::OK
        );
        let reopened = change(&libraries, &folder, "folder", 2, None).await;
        assert_eq!(reopened.1["created"], false);
        assert_eq!(reopened.1["imported"], 0);
        assert_eq!(
            libraries
                .running
                .read()
                .await
                .app
                .db
                .list::<Value>("source")
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            fs::read_to_string(folder.join("notes.txt")).unwrap(),
            "keep me"
        );
    }
}
