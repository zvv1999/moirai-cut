use crate::{
    domain::{Job, Source, id, now},
    service::{ApiError, App},
    storage, store,
};
use anyhow::{Context, Result, ensure};
use axum::{Json, Router, extract::State, routing::post};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Arc,
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Location {
    pub mode: String,
    pub nas_root: PathBuf,
    pub folder_root: PathBuf,
    pub revision: u64,
    #[serde(default)]
    pub nas_generation: String,
}
pub fn current(app: &App) -> Result<Location> {
    app.db.transaction(|db| {
        Ok(
            store::get(db, "settings", "location").unwrap_or_else(|_| Location {
                mode: "nas".into(),
                nas_root: app.config.nas_root.clone(),
                folder_root: PathBuf::new(),
                revision: 0,
                nas_generation: String::new(),
            }),
        )
    })
}
pub fn folder_mode(db: &rusqlite::Connection) -> bool {
    store::get::<Location>(db, "settings", "location").is_ok_and(|l| l.mode == "folder")
}
pub fn nas_job_id(db: &rusqlite::Connection, kind: &str, target: &str) -> String {
    let generation = store::get::<Location>(db, "settings", "location")
        .map(|l| l.nas_generation)
        .unwrap_or_default();
    if generation.is_empty() {
        format!("{kind}-{target}")
    } else {
        format!("{kind}-{target}-{generation}")
    }
}
pub fn release_jobs(db: &rusqlite::Connection) -> Result<Vec<Job>> {
    Ok(store::list::<Job>(db, "job")?
        .into_iter()
        .filter(|j| {
            j.kind == "publish"
                && (j.status == "succeeded"
                    || store::get::<Value>(
                        db,
                        "shot_version",
                        &format!("{}-r{}", j.target_id, j.revision + 1),
                    )
                    .is_ok_and(|v| v["status"] == "published"))
        })
        .collect())
}
pub fn summary(app: &App) -> Result<Value> {
    let location = current(app)?;
    let mut value = serde_json::to_value(&location)?;
    let state = app
        .db
        .get::<Value>("settings", "folder_sync")
        .unwrap_or(json!({}));
    let online = location.mode == "folder" && verify_folder(&location.folder_root).is_ok();
    value["folderOnline"] = json!(online);
    value["status"] = if state["root"] == json!(location.folder_root) {
        state["status"].clone()
    } else {
        json!("idle")
    };
    value["error"] = if location.mode == "folder" && !online {
        json!("本地文件夹不可用，请重新连接或选择文件夹")
    } else if state["root"] == json!(location.folder_root) {
        state["error"].clone()
    } else {
        Value::Null
    };
    Ok(value)
}
pub fn router() -> Router<Arc<App>> {
    Router::new()
        .route("/storage-location", post(save))
        .route("/storage-location/check", post(check))
        .route("/storage-location/pick", post(pick))
        .route("/storage-location/sync", post(sync))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Change {
    mode: String,
    path: String,
    base_revision: u64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Probe {
    mode: String,
    path: String,
}

fn absolute(path: &str) -> Result<PathBuf> {
    let path = PathBuf::from(path.trim());
    ensure!(
        path.is_absolute() && !path.as_os_str().is_empty(),
        "请填写已挂载目录的绝对路径，不支持 smb:// 地址"
    );
    ensure!(
        !path
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir)),
        "目录不能包含 .."
    );
    Ok(path)
}
pub(crate) fn validate(app: &App, mode: &str, path: &str, probe: bool) -> Result<PathBuf> {
    ensure!(["nas", "folder"].contains(&mode), "存储模式无效");
    let root = absolute(path)?;
    let normalized = if root.exists() {
        root.canonicalize()?
    } else {
        root.clone()
    };
    let data = app.config.data_dir.canonicalize()?;
    ensure!(
        !normalized.starts_with(&data) && !data.starts_with(&normalized),
        "请选择应用数据目录之外的独立素材文件夹"
    );
    if mode == "folder" {
        verify_folder(&normalized)?;
    } else if probe {
        storage::verify_root(&normalized, app.config.require_smb)?;
    }
    if mode == "folder" || probe {
        let test = normalized.join(format!(".moirai-write-check-{}", id()));
        fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&test)
            .context("目录不可写")?;
        fs::remove_file(test)?;
    }
    Ok(normalized)
}
pub fn verify_folder(root: &Path) -> Result<()> {
    ensure!(root.is_dir(), "本地文件夹不可用");
    #[cfg(target_os = "macos")]
    {
        use std::{
            ffi::{CStr, CString},
            os::unix::ffi::OsStrExt,
        };
        let name = CString::new(root.as_os_str().as_bytes())?;
        let mut stat = std::mem::MaybeUninit::<libc::statfs>::uninit();
        ensure!(
            unsafe { libc::statfs(name.as_ptr(), stat.as_mut_ptr()) } == 0,
            "无法检查本地文件夹"
        );
        let stat = unsafe { stat.assume_init() };
        let kind = unsafe { CStr::from_ptr(stat.f_fstypename.as_ptr()) }.to_string_lossy();
        ensure!(
            !["smbfs", "nfs", "webdav"].contains(&kind.as_ref()),
            "该目录是网络共享，请使用 NAS 模式"
        );
    }
    Ok(())
}
async fn check(
    State(app): State<Arc<App>>,
    Json(input): Json<Probe>,
) -> Result<Json<Value>, ApiError> {
    Ok(Json(
        tokio::task::spawn_blocking(move || -> Result<Value> {
            let path = validate(&app, &input.mode, &input.path, true)?;
            Ok(json!({"path":path,"ok":true}))
        })
        .await??,
    ))
}
async fn save(
    State(app): State<Arc<App>>,
    Json(input): Json<Change>,
) -> Result<Json<Value>, ApiError> {
    Ok(Json(
        tokio::task::spawn_blocking(move || -> Result<Value> {
            let _guard = app
                .storage_gate
                .lock()
                .map_err(|_| anyhow::anyhow!("存储配置锁不可用"))?;
            let root = validate(&app, &input.mode, &input.path, false)?;
            let mut location = current(&app)?;
            ensure!(
                location.revision == input.base_revision,
                "revision_conflict"
            );
            let previous_nas = location
                .nas_root
                .canonicalize()
                .unwrap_or_else(|_| location.nas_root.clone());
            let changed_nas = input.mode == "nas" && previous_nas != root;
            if input.mode == "nas" {
                location.nas_root = root;
            } else {
                location.folder_root = root;
            }
            location.mode = input.mode;
            location.revision += 1;
            if changed_nas {
                location.nas_generation = id();
            }
            app.db.transaction(|db| {
                store::put(db, "settings", "location", &location)?;
                if changed_nas {
                    for mut job in store::list::<Job>(db, "job")? {
                        if ["sync_source", "sync_release"].contains(&job.kind.as_str())
                            && ["queued", "failed"].contains(&job.status.as_str())
                        {
                            job.status = "superseded".into();
                            job.updated_at = now();
                            store::put(db, "job", &job.id, &job)?;
                        }
                    }
                }
                if crate::service::sync_enabled(db) {
                    for source in store::list::<Source>(db, "source")? {
                        if source.status == "deleted" { continue; }
                        crate::service::enqueue_sync(db, "sync_source", &source.id, 0)?;
                    }
                    for release in release_jobs(db)? {
                        crate::service::enqueue_sync(
                            db,
                            "sync_release",
                            &release.id,
                            release.revision + 1,
                        )?;
                    }
                }
                Ok(())
            })?;
            if location.mode == "folder" {
                backfill_locked(&app, &location)?;
            }
            summary(&app)
        })
        .await??,
    ))
}
async fn pick(State(app): State<Arc<App>>) -> Result<Json<Value>, ApiError> {
    Ok(Json(
        tokio::task::spawn_blocking(move || -> Result<Value> {
            #[cfg(target_os = "macos")]
            {
                match app.media.run(
                    "/usr/bin/osascript",
                    &[
                        "-e".into(),
                        "POSIX path of (choose folder with prompt \"选择素材库存储文件夹\")".into(),
                    ],
                    120,
                ) {
                    Ok(path) => Ok(json!({"path":path.trim()})),
                    Err(e) if e.to_string().contains("-128") => Ok(json!({"path":null})),
                    Err(e) => Err(e.context("无法打开目录选择器，请直接输入绝对路径")),
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = app;
                anyhow::bail!("当前系统请直接输入文件夹绝对路径")
            }
        })
        .await??,
    ))
}
async fn sync(State(app): State<Arc<App>>) -> Result<Json<Value>, ApiError> {
    Ok(Json(
        tokio::task::spawn_blocking(move || -> Result<Value> {
            backfill(&app)?;
            summary(&app)
        })
        .await??,
    ))
}
fn record(app: &App, root: &Path, result: Result<()>, full: bool) -> Result<()> {
    let previous = app
        .db
        .get::<Value>("settings", "folder_sync")
        .unwrap_or(json!({}));
    let error = result.err().map(|e| format!("本地文件夹同步失败：{e}"));
    let error = if error.is_none() && !full && previous["root"] == json!(root) {
        previous["error"].as_str().map(str::to_owned)
    } else {
        error
    };
    app.db.put("settings","folder_sync",&json!({"root":root,"status":if error.is_some(){"failed"}else{"succeeded"},"error":error,"updatedAt":now()}))
}
fn backfill_locked(app: &App, location: &Location) -> Result<()> {
    app.db.put(
        "settings",
        "folder_sync",
        &json!({"root":location.folder_root,"status":"running","error":null}),
    )?;
    let result = (|| {
        verify_folder(&location.folder_root)?;
        fs::create_dir_all(location.folder_root.join("inbox"))?;
        for source in app.db.list::<Source>("source")? {
            if source.status == "deleted" { continue; }
            copy_source(app, &source, &location.folder_root, false)?;
        }
        for job in app.db.transaction(release_jobs)? {
            copy_release(app, &job.id, &location.folder_root, false)?;
        }
        Ok(())
    })();
    record(app, &location.folder_root, result, true)
}
pub fn backfill(app: &App) -> Result<()> {
    let _guard = app
        .storage_gate
        .lock()
        .map_err(|_| anyhow::anyhow!("存储配置锁不可用"))?;
    let location = current(app)?;
    if location.mode == "folder" {
        backfill_locked(app, &location)?;
    }
    Ok(())
}
pub fn local_event(app: &App, source_id: Option<&str>, release_id: Option<&str>) -> Result<()> {
    let _guard = app
        .storage_gate
        .lock()
        .map_err(|_| anyhow::anyhow!("存储配置锁不可用"))?;
    let location = current(app)?;
    if location.mode != "folder" {
        return Ok(());
    }
    let result = (|| {
        verify_folder(&location.folder_root)?;
        if let Some(id) = source_id {
            copy_source(
                app,
                &app.db.get("source", id)?,
                &location.folder_root,
                false,
            )?;
        }
        if let Some(id) = release_id {
            copy_release(app, id, &location.folder_root, false)?;
        }
        Ok(())
    })();
    record(app, &location.folder_root, result, false)
}
pub fn copy_source(_app: &App, source: &Source, root: &Path, require_smb: bool) -> Result<()> {
    storage::publish_file(
        root,
        Path::new(&crate::service::source_relative(source)),
        Path::new(&source.path),
        &source.sha256,
        require_smb,
    )?;
    Ok(())
}
pub fn copy_release(app: &App, id: &str, root: &Path, require_smb: bool) -> Result<()> {
    let metadata = app
        .config
        .data_dir
        .join("publications")
        .join(format!("{id}.json"));
    let manifest: Value = serde_json::from_slice(&fs::read(&metadata)?)?;
    let source = app.db.get::<Source>(
        "source",
        manifest["shot"]["sourceId"]
            .as_str()
            .context("发布来源缺失")?,
    )?;
    copy_source(app, &source, root, require_smb)?;
    let relative = manifest["shot"]["publishedPath"]
        .as_str()
        .context("发布路径缺失")?;
    let local = app.config.data_dir.join("releases").join(relative);
    storage::publish_file(
        root,
        Path::new(relative),
        &local,
        manifest["shot"]["outputSha256"]
            .as_str()
            .context("发布哈希缺失")?,
        require_smb,
    )?;
    let poster = local.parent().context("发布目录无效")?.join("poster.jpg");
    storage::publish_file(
        root,
        &Path::new(relative)
            .parent()
            .context("发布目录无效")?
            .join("poster.jpg"),
        &poster,
        &storage::hash(&poster)?,
        require_smb,
    )?;
    let relative = format!(
        "metadata/{}/{id}.json",
        manifest["shot"]["id"].as_str().context("分镜 ID 缺失")?
    );
    storage::publish_file(
        root,
        Path::new(&relative),
        &metadata,
        &storage::hash(&metadata)?,
        require_smb,
    )?;
    Ok(())
}
