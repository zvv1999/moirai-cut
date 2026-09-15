//! Leased execution of existing Rust jobs on trusted team clients.
use crate::{
    domain::{Job, Shot, Source, id, now},
    service::{ApiError, App},
    storage, store,
};
use anyhow::{Context, Result, ensure};
use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, Path as ApiPath, Query, State},
    http::HeaderMap,
    response::Response,
    routing::{get, post, put},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Component, Path, PathBuf},
    sync::Arc,
};
use tokio::io::AsyncSeekExt;

pub const COMPUTE_KINDS: &[&str] = &[
    "archive",
    "analyze",
    "tag",
    "render",
    "recognize_products",
    "reanalyze",
];
pub const LOGICAL_ROOT: &str = "/__moirai_edge__";
const TTL: u64 = 120;
pub fn coordinator() -> bool {
    std::env::var("MOIRAI_FOOTAGE_COORDINATOR").is_ok_and(|v| v == "1")
}
fn check(ok: bool, message: &str) -> Result<()> {
    ensure!(ok, "{message}");
    Ok(())
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Record {
    pub kind: String,
    pub id: String,
    pub value: Value,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Asset {
    pub path: String,
    pub sha256: String,
    pub size: u64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Packet {
    pub job: Job,
    pub worker_id: String,
    pub lease: String,
    pub expires_at: u64,
    pub records: Vec<Record>,
    pub files: Vec<Asset>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Claim {
    pub worker_id: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Finish {
    pub lease: String,
    pub records: Vec<Record>,
    pub files: Vec<Asset>,
    pub error: Option<String>,
}
#[derive(Serialize, Deserialize)]
pub struct Heartbeat {
    pub lease: String,
}

pub fn router() -> Router<Arc<App>> {
    Router::new()
        .route("/edge/claim", post(claim))
        .route("/edge/jobs/{id}/heartbeat", post(heartbeat))
        .route(
            "/edge/jobs/{id}/finish",
            post(finish).layer(DefaultBodyLimit::max(64 * 1024 * 1024)),
        )
        .route("/edge/jobs/{id}/files/{sha}", get(download))
        .route(
            "/edge/blobs/{sha}",
            put(upload)
                .layer(DefaultBodyLimit::max(8 * 1024 * 1024))
                .get(blob_status),
        )
}
fn valid_id(value: &str) -> Result<()> {
    ensure!(
        !value.is_empty()
            && value.len() <= 100
            && value
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-'),
        "无效标识"
    );
    Ok(())
}
fn valid_hash(value: &str) -> Result<()> {
    ensure!(
        value.len() == 64
            && value
                .bytes()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()),
        "无效文件哈希"
    );
    Ok(())
}
pub fn safe_path(root: &Path, relative: &str) -> Result<PathBuf> {
    ensure!(
        !relative.is_empty() && relative.len() < 1000,
        "无效媒体路径"
    );
    let mut path = root.to_path_buf();
    for part in Path::new(relative).components() {
        let Component::Normal(part) = part else {
            anyhow::bail!("媒体路径越界")
        };
        ensure!(
            !part.to_string_lossy().contains(['\\', ':']),
            "无效媒体路径"
        );
        path.push(part);
        ensure!(!path.is_symlink(), "媒体路径不能是符号链接");
    }
    Ok(path)
}
pub fn rows(db: &rusqlite::Connection) -> Result<Vec<Record>> {
    let mut stmt = db.prepare("SELECT kind,id,body FROM records ORDER BY kind,id")?;
    let tuples = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    tuples
        .into_iter()
        .map(|(kind, id, body)| {
            Ok(Record {
                kind,
                id,
                value: serde_json::from_str(&body)?,
            })
        })
        .collect()
}
fn source_for(db: &rusqlite::Connection, job: &Job) -> Result<Source> {
    let source_id = if ["archive", "analyze"].contains(&job.kind.as_str()) {
        job.target_id.clone()
    } else {
        store::get::<Shot>(db, "shot", &job.target_id)?.source_id
    };
    store::get(db, "source", &source_id)
}
fn snapshot(app: &App, db: &rusqlite::Connection, job: Job, worker_id: String) -> Result<Packet> {
    let source = source_for(db, &job)?;
    ensure!(source.status != "deleted", "原片已删除");
    let catalog = store::get::<String>(db, "product_config", &job.id).unwrap_or_default();
    let mut records = rows(db)?
        .into_iter()
        .filter(|r| match r.kind.as_str() {
            "source" => r.id == source.id,
            "shot" => r.value["sourceId"] == source.id,
            "job" | "model_config" | "product_config" | "auto_publish" | "reanalysis_replace" => {
                r.id == job.id
            }
            "reanalysis_previous_status" | "analysis_suggestion" => r.id == job.target_id,
            "product_catalog" => r.id == catalog,
            "prepared_source" => r.id == source.id,
            _ => false,
        })
        .collect::<Vec<_>>();
    let mut files = vec![];
    for path in [
        PathBuf::from(&source.path),
        app.media.source_dir(&source.id).join("preview.mp4"),
        app.media.source_dir(&source.id).join("poster.jpg"),
    ] {
        if !path.is_file() {
            continue;
        }
        let relative = path
            .strip_prefix(&app.config.data_dir)?
            .to_string_lossy()
            .into_owned();
        safe_path(&app.config.data_dir, &relative)?;
        files.push(Asset {
            path: relative,
            sha256: if path == Path::new(&source.path) {
                source.sha256.clone()
            } else {
                storage::hash(&path)?
            },
            size: fs::metadata(path)?.len(),
        });
    }
    for r in &mut records {
        crate::libraries::rebase(&mut r.value, &app.config.data_dir, Path::new(LOGICAL_ROOT));
    }
    Ok(Packet {
        job,
        worker_id,
        lease: id(),
        expires_at: now() + TTL,
        records,
        files,
    })
}
pub fn claim_job(app: &App, worker_id: &str) -> Result<Option<Packet>> {
    valid_id(worker_id)?;
    app.db.transaction(|db| {
        store::put(db, "edge_worker", worker_id, &json!({"lastSeen":now()}))?;
        let mut jobs = store::list::<Job>(db, "job")?;
        jobs.sort_by_key(|j| (j.created_at, j.id.clone()));
        for mut job in jobs {
            if !COMPUTE_KINDS.contains(&job.kind.as_str()) {
                continue;
            }
            let lease = store::get::<Packet>(db, "edge_lease", &job.id).ok();
            if lease.as_ref().is_some_and(|p| p.expires_at > now()) {
                continue;
            }
            if job.status != "queued" && !(job.status == "running" && lease.is_some()) {
                continue;
            }
            let source = source_for(db, &job)?;
            if let Ok(preferred) = store::get::<Value>(db, "edge_preferred", &source.id) {
                let owner = preferred["workerId"].as_str().unwrap_or("");
                let seen = store::get::<Value>(db, "edge_worker", owner)
                    .ok()
                    .and_then(|v| v["lastSeen"].as_u64())
                    .unwrap_or(0);
                if owner != worker_id && seen + 30 > now() && job.created_at + 30 > now() {
                    continue;
                }
            }
            job.status = "running".into();
            job.attempt += 1;
            job.updated_at = now();
            store::put(db, "job", &job.id, &job)?;
            let packet = snapshot(app, db, job, worker_id.into())?;
            store::put(db, "edge_lease", &packet.job.id, &packet)?;
            return Ok(Some(packet));
        }
        Ok(None)
    })
}
async fn claim(
    State(app): State<Arc<App>>,
    Json(input): Json<Claim>,
) -> Result<Json<Option<Packet>>, ApiError> {
    check(coordinator(), "当前服务不是团队协调器")?;
    Ok(Json(
        tokio::task::spawn_blocking(move || claim_job(&app, &input.worker_id)).await??,
    ))
}
fn lease(db: &rusqlite::Connection, job_id: &str, token: &str) -> Result<Packet> {
    let packet = store::get::<Packet>(db, "edge_lease", job_id)?;
    ensure!(
        packet.lease == token && packet.expires_at > now(),
        "revision_conflict"
    );
    ensure!(
        store::get::<Job>(db, "job", job_id)?.status == "running",
        "revision_conflict"
    );
    Ok(packet)
}
async fn heartbeat(
    State(app): State<Arc<App>>,
    ApiPath(job_id): ApiPath<String>,
    Json(input): Json<Heartbeat>,
) -> Result<Json<Value>, ApiError> {
    Ok(Json(app.db.transaction(|db| {
        let mut p = lease(db, &job_id, &input.lease)?;
        p.expires_at = now() + TTL;
        store::put(db, "edge_worker", &p.worker_id, &json!({"lastSeen":now()}))?;
        store::put(db, "edge_lease", &job_id, &p)?;
        Ok(json!({"expiresAt":p.expires_at}))
    })?))
}
fn blob(app: &App, sha: &str) -> Result<PathBuf> {
    valid_hash(sha)?;
    Ok(app.config.data_dir.join("edge-blobs").join(sha))
}
async fn blob_status(
    State(app): State<Arc<App>>,
    ApiPath(sha): ApiPath<String>,
) -> Result<Json<Value>, ApiError> {
    let path = blob(&app, &sha)?;
    Ok(Json(
        json!({"offset":fs::metadata(&path).map(|m|m.len()).unwrap_or(0)}),
    ))
}
#[derive(Deserialize)]
struct Offset {
    #[serde(default)]
    offset: u64,
}
async fn upload(
    State(app): State<Arc<App>>,
    ApiPath(sha): ApiPath<String>,
    Query(input): Query<Offset>,
    body: Body,
) -> Result<Json<Value>, ApiError> {
    let path = blob(&app, &sha)?;
    let bytes = axum::body::to_bytes(body, 8 * 1024 * 1024).await?;
    check(
        input.offset <= 20 * 1024 * 1024 * 1024
            && input.offset + bytes.len() as u64 <= 20 * 1024 * 1024 * 1024,
        "文件过大",
    )?;
    let offset = tokio::task::spawn_blocking(move || -> Result<u64> {
        use std::io::{Read, Seek, Write};
        let _gate = app
            .storage_gate
            .lock()
            .map_err(|_| anyhow::anyhow!("存储锁不可用"))?;
        fs::create_dir_all(path.parent().unwrap())?;
        let mut f = fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(path)?;
        let size = f.metadata()?.len();
        if size > input.offset {
            ensure!(size >= input.offset + bytes.len() as u64, "上传偏移冲突");
            f.seek(std::io::SeekFrom::Start(input.offset))?;
            let mut old = vec![0; bytes.len()];
            f.read_exact(&mut old)?;
            ensure!(old == bytes, "上传偏移冲突");
            return Ok(size);
        }
        ensure!(size == input.offset, "上传偏移冲突");
        f.seek(std::io::SeekFrom::End(0))?;
        f.write_all(&bytes)?;
        f.sync_all()?;
        Ok(size + bytes.len() as u64)
    })
    .await??;
    Ok(Json(json!({"offset":offset})))
}
async fn download(
    State(app): State<Arc<App>>,
    ApiPath((job_id, sha)): ApiPath<(String, String)>,
    headers: HeaderMap,
    Query(input): Query<Offset>,
) -> Result<Response, ApiError> {
    let p = app.db.transaction(|db| {
        lease(
            db,
            &job_id,
            headers
                .get("x-edge-lease")
                .and_then(|v| v.to_str().ok())
                .unwrap_or(""),
        )
    })?;
    let asset = p
        .files
        .iter()
        .find(|f| f.sha256 == sha)
        .context("媒体不存在")?;
    let path = safe_path(&app.config.data_dir, &asset.path)?;
    let mut file = tokio::fs::File::open(path).await?;
    check(
        input.offset <= file.metadata().await?.len() && input.offset <= asset.size,
        "无效下载偏移",
    )?;
    file.seek(std::io::SeekFrom::Start(input.offset)).await?;
    Ok(Response::builder()
        .status(if input.offset > 0 { 206 } else { 200 })
        .header("content-length", (asset.size - input.offset).to_string())
        .body(Body::from_stream(tokio_util::io::ReaderStream::new(file)))?)
}
fn previous<'a>(packet: &'a Packet, kind: &str, id: &str) -> Option<&'a Value> {
    packet
        .records
        .iter()
        .find(|r| r.kind == kind && r.id == id)
        .map(|r| &r.value)
}
fn allowed_record(packet: &Packet, r: &Record, source_id: &str) -> Result<()> {
    valid_id(&r.id)?;
    let job = &packet.job;
    let allowed = match r.kind.as_str() {
        "source" | "prepared_source" => r.id == source_id,
        "shot" => {
            r.value["sourceId"] == source_id && (r.id == job.target_id || job.kind == "analyze")
        }
        "review" => r.value["shotId"] == job.target_id,
        "analysis_suggestion" => r.id == job.target_id && job.kind == "reanalyze",
        "job" => {
            (job.kind == "archive"
                && r.value["kind"] == "analyze"
                && r.value["targetId"] == source_id)
                || (job.kind == "render"
                    && r.id == format!("publish-{}", job.id)
                    && r.value["kind"] == "publish"
                    && r.value["targetId"] == job.target_id)
        }
        "model_config" | "product_config" => {
            job.kind == "archive" && previous(packet, &r.kind, &r.id).is_none()
        }
        _ => false,
    };
    ensure!(allowed, "任务结果超出范围");
    if r.kind == "source" {
        let s: Source = serde_json::from_value(r.value.clone())?;
        ensure!(s.id == source_id, "原片标识不一致");
    }
    if r.kind == "shot" {
        let s: Shot = serde_json::from_value(r.value.clone())?;
        ensure!(s.id == r.id, "分镜标识不一致");
        s.recipe.validate()?;
    }
    Ok(())
}
pub fn finish_job(app: &App, job_id: &str, input: Finish) -> Result<Value> {
    let receipt = format!("{:x}", Sha256::digest(serde_json::to_vec(&input)?));
    let receipt_id = format!("{job_id}-{}", input.lease);
    app.db.transaction(|db| {
        if let Ok(done)=store::get::<Value>(db,"edge_receipt",&receipt_id){
            ensure!(done["lease"]==input.lease && done["digest"]==receipt,"revision_conflict");return Ok(json!({"completed":true,"duplicate":true}));
        }
        let packet=lease(db,job_id,&input.lease)?;
        let source=source_for(db,&packet.job)?;
        // Check the original target, even when computation failed or only created new records.
        for baseline in packet.records.iter().filter(|r|r.kind=="source" || (r.kind=="shot" && r.id==packet.job.target_id)) {
            let mut current:Value=store::get(db,&baseline.kind,&baseline.id)?;
            crate::libraries::rebase(&mut current,&app.config.data_dir,Path::new(LOGICAL_ROOT));
            ensure!(current==baseline.value,"revision_conflict");
        }
        ensure!(input.records.len()<=100 && input.files.len()<=100,"任务结果过大");
        let mut keys=std::collections::HashSet::new();
        for r in &input.records {
            ensure!(keys.insert((&r.kind,&r.id)),"重复任务结果");allowed_record(&packet,r,&source.id)?;
            let current=store::get::<Value>(db,&r.kind,&r.id).ok().map(|mut v|{crate::libraries::rebase(&mut v,&app.config.data_dir,Path::new(LOGICAL_ROOT));v});
            ensure!(current.as_ref()==previous(&packet,&r.kind,&r.id),"revision_conflict");
        }
        let children=input.records.iter().filter(|r|r.kind=="job").collect::<Vec<_>>();
        ensure!(children.len()<=1,"子任务数量无效");
        for r in input.records.iter().filter(|r|["model_config","product_config"].contains(&r.kind.as_str())) {
            ensure!(children.iter().any(|child|child.id==r.id),"配置没有关联子任务");
        }
        for child in &children {
            let job:Job=serde_json::from_value(child.value.clone())?;
            ensure!(job.id==child.id && job.status=="queued" && job.attempt==0,"子任务状态无效");
        }
        let mut result_paths=std::collections::HashMap::new();
        for asset in &input.files {
            let path=safe_path(&app.config.data_dir,&asset.path)?;
            let parts=Path::new(&asset.path).components().map(|p|p.as_os_str().to_string_lossy().into_owned()).collect::<Vec<_>>();
            let allowed=matches!(parts.as_slice(), [kind,sid,file] if kind=="sources" && sid==&source.id && ["preview.mp4","poster.jpg"].contains(&file.as_str())) || matches!(parts.as_slice(),[kind,sid,revision,file] if kind=="shots" && sid==&packet.job.target_id && revision==&format!("r{}",packet.job.revision) && ["master.mp4","poster.jpg","render.json","color.cube"].contains(&file.as_str()));
            ensure!(allowed && result_paths.insert(asset.path.clone(),asset).is_none(),"任务文件超出范围");
            let staged=blob(app,&asset.sha256)?;
            ensure!(fs::metadata(&staged)?.len()==asset.size && storage::hash(&staged)?==asset.sha256,"上传文件校验失败");
            // Existing outputs are immutable, including after a database rollback.
            ensure!(!path.exists() || storage::hash(&path)?==asset.sha256,"已有媒体不能覆盖");
        }
        if input.error.is_none(){
            for r in &input.records {
                let mut value=r.value.clone();crate::libraries::rebase(&mut value,Path::new(LOGICAL_ROOT),&app.config.data_dir);
                if r.kind=="source" {
                    let changed:Source=serde_json::from_value(value.clone())?;
                    ensure!(changed.path==source.path && changed.sha256==source.sha256 && changed.duration_ticks==source.duration_ticks,"原片身份不能修改");
                }
                if r.kind=="shot" {
                    let changed:Shot=serde_json::from_value(value.clone())?;
                    crate::domain::validate_range(changed.start_ticks,changed.end_ticks,source.duration_ticks)?;
                    ensure!(changed.published_path.is_none() || previous(&packet,"shot",&r.id).is_some_and(|v|v["publishedPath"]==r.value["publishedPath"]),"Worker 不能发布素材");
                    if let Some(path)=&changed.output_path {
                        let relative=Path::new(path).strip_prefix(&app.config.data_dir)?;
                        let checked=safe_path(&app.config.data_dir,&relative.to_string_lossy())?;
                        let uploaded=result_paths.get(relative.to_string_lossy().as_ref());
                        ensure!(path==&source.path || uploaded.is_some() || previous(&packet,"shot",&r.id).is_some_and(|v|v["outputPath"]==r.value["outputPath"]),"输出文件未提交");
                        let hash=if let Some(asset)=uploaded {asset.sha256.clone()}else{storage::hash(&checked)?};
                        ensure!(changed.output_sha256.as_deref()==Some(hash.as_str()),"输出哈希不一致");
                    }
                }
                store::put(db,&r.kind,&r.id,&value)?;
            }
        }
        if input.error.is_none() && packet.job.kind=="reanalyze" && store::get::<bool>(db,"reanalysis_replace",job_id).unwrap_or(true) {
            crate::label_review::dismiss(db,&packet.job.target_id)?;
        }
        // Validate all records before exposing any media. Never overwrite an existing file.
        for asset in &input.files {
            let path=safe_path(&app.config.data_dir,&asset.path)?;
            if path.exists(){continue;}
            fs::create_dir_all(path.parent().unwrap())?;
            let temp=path.with_extension(format!("{}.tmp",packet.lease));
            fs::copy(blob(app,&asset.sha256)?,&temp)?;fs::File::open(&temp)?.sync_all()?;fs::rename(temp,path)?;
        }
        let mut job=packet.job;job.status=if input.error.is_some(){"failed"}else{"succeeded"}.into();job.error=input.error.map(|e|e.chars().take(2000).collect());job.updated_at=now();
        crate::service::record_failure(db,&job)?;store::put(db,"job",&job.id,&job)?;
        store::put(db,"edge_receipt",&receipt_id,&json!({"lease":input.lease,"digest":receipt,"workerId":packet.worker_id,"completedAt":now()}))?;
        db.execute("DELETE FROM records WHERE kind='edge_lease' AND id=?1",[job_id])?;
        Ok(json!({"completed":true,"duplicate":false}))
    })
}
async fn finish(
    State(app): State<Arc<App>>,
    ApiPath(job_id): ApiPath<String>,
    Json(input): Json<Finish>,
) -> Result<Json<Value>, ApiError> {
    Ok(Json(
        tokio::task::spawn_blocking(move || finish_job(&app, &job_id, input)).await??,
    ))
}
