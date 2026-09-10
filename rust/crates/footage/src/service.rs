use crate::{
    domain::*,
    media::Media,
    model::{self, AnalysisSettings, ModelSettings},
    storage,
    store::{self, Store},
};
use anyhow::{Context, Result, ensure};
use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, Path as ApiPath, Query, Request, State},
    http::{HeaderMap, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, patch, post},
};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub data_dir: PathBuf,
    #[serde(default)]
    pub nas_root: PathBuf,
    #[serde(default)]
    pub require_smb: bool,
    pub ffmpeg: String,
    pub ffprobe: String,
    pub port: u16,
}
pub struct App {
    pub db: Store,
    pub config: Config,
    pub media: Media,
    pub home: PathBuf,
    pub token: String,
}
type Shared = Arc<App>;
#[derive(Debug)]
pub struct ApiError(pub anyhow::Error);
impl<E: Into<anyhow::Error>> From<E> for ApiError {
    fn from(e: E) -> Self {
        Self(e.into())
    }
}
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let message = self.0.to_string();
        let status = if message == "revision_conflict" {
            StatusCode::CONFLICT
        } else if message.contains("不存在") {
            StatusCode::NOT_FOUND
        } else {
            StatusCode::BAD_REQUEST
        };
        (status, Json(json!({"error":message}))).into_response()
    }
}
type ApiResult<T> = std::result::Result<T, ApiError>;

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SyncSettings {
    pub sync_to_nas: bool,
}
pub fn sync_enabled(db: &rusqlite::Connection) -> bool {
    store::get::<SyncSettings>(db, "settings", "storage")
        .unwrap_or_default()
        .sync_to_nas
}
async fn set_storage(
    State(app): State<Shared>,
    Json(settings): Json<SyncSettings>,
) -> ApiResult<Json<Value>> {
    blocking(move || {
        if settings.sync_to_nas {
            ensure!(
                !app.config.nas_root.as_os_str().is_empty(),
                "请先配置团队 NAS 目录"
            );
        }
        let releases = crate::lineage::releases(&app)?;
        app.db.transaction(|db| {
            store::put(db, "settings", "storage", &settings)?;
            if settings.sync_to_nas {
                for source in store::list::<Source>(db, "source")? {
                    enqueue_sync(db, "sync_source", &source.id, 0)?;
                }
                for release in releases {
                    enqueue_sync(
                        db,
                        "sync_release",
                        release["id"].as_str().context("发布 ID 缺失")?,
                        release["shot"]["revision"].as_u64().unwrap_or(0),
                    )?;
                }
            }
            Ok(())
        })?;
        Ok(Json(json!(settings)))
    })
    .await
}
fn enqueue_sync(db: &rusqlite::Connection, kind: &str, target: &str, revision: u64) -> Result<()> {
    let mut job = Job::new(kind, target, revision);
    job.id = format!("{kind}-{target}");
    if store::get::<Job>(db, "job", &job.id).is_err() {
        store::put(db, "job", &job.id, &job)?;
    }
    Ok(())
}

pub fn router(app: Shared) -> Router {
    Router::new()
        .route("/state", get(state))
        .route("/releases", get(releases))
        .route("/releases/{id}", get(editor_asset))
        .route("/lineage/{id}", get(lineage))
        .route("/models", get(models))
        .route("/settings", post(settings))
        .route("/storage-settings", post(set_storage))
        .route("/imports", post(upload).layer(DefaultBodyLimit::disable()))
        .route("/scan", post(scan))
        .route("/shots/{id}", patch(edit))
        .route("/shots/{id}/action", post(action))
        .route("/sources/{id}/manual", post(manual))
        .route("/jobs/{id}/retry", post(retry))
        .route("/media/{kind}/{id}/{variant}", get(media_file))
        .layer(DefaultBodyLimit::max(1024 * 1024))
        .layer(middleware::from_fn_with_state(app.clone(), authorize))
        .with_state(app)
}
async fn authorize(State(app): State<Shared>, req: Request, next: Next) -> Response {
    if req
        .headers()
        .get("x-footage-token")
        .and_then(|v| v.to_str().ok())
        != Some(app.token.as_str())
    {
        return (StatusCode::UNAUTHORIZED, Json(json!({"error":"未授权"}))).into_response();
    }
    next.run(req).await
}

async fn releases(State(app): State<Shared>) -> ApiResult<Json<Value>> {
    blocking(move || Ok(Json(json!({"releases":crate::lineage::releases(&app)?})))).await
}
async fn editor_asset(
    State(app): State<Shared>,
    ApiPath(id): ApiPath<String>,
) -> ApiResult<Json<Value>> {
    blocking(move || Ok(Json(crate::lineage::editor_asset(&app, &id)?))).await
}
async fn lineage(
    State(app): State<Shared>,
    ApiPath(id): ApiPath<String>,
) -> ApiResult<Json<Value>> {
    blocking(move || Ok(Json(crate::lineage::lineage(&app, &id)?))).await
}
async fn blocking<T: Send + 'static>(
    task: impl FnOnce() -> Result<T> + Send + 'static,
) -> ApiResult<T> {
    Ok(tokio::task::spawn_blocking(task)
        .await
        .context("后台操作中断")??)
}

#[derive(Default, Deserialize)]
struct Search {
    q: Option<String>,
    status: Option<String>,
    role: Option<String>,
}
async fn state(State(app): State<Shared>, Query(search): Query<Search>) -> ApiResult<Json<Value>> {
    blocking(move||{
        let sources=app.db.list::<Source>("source")?;
        let mut shots=app.db.list::<Shot>("shot")?;
        let counts=json!({"sources":sources.len(),"draft":shots.iter().filter(|s|s.status=="draft").count(),"review":shots.iter().filter(|s|s.status=="review").count(),"published":shots.iter().filter(|s|s.status=="published").count()});
        if let Some(status)=search.status.filter(|s|!s.is_empty()){shots.retain(|s|s.status==status);}
        if let Some(role)=search.role.filter(|s|!s.is_empty()){shots.retain(|s|s.roles.iter().any(|r|r.role==role));}
        if let Some(query)=search.q.filter(|s|!s.trim().is_empty()){
            let query=query.to_lowercase();shots.retain(|s|{
                let product=sources.iter().find(|a|a.id==s.source_id).map(|a|a.product.as_str()).unwrap_or("");
                format!("{} {} {} {}",s.name,s.description,s.tags.join(" "),product).to_lowercase().contains(&query)
            });
        }
        let all_jobs=app.db.list::<Job>("job")?;
        let mut jobs=all_jobs.clone();jobs.sort_by_key(|j|std::cmp::Reverse(j.updated_at));jobs.truncate(200);
        let sync_to_nas=app.db.transaction(|db|Ok(sync_enabled(db)))?;
        let nas=if sync_to_nas {storage::verify_root(&app.config.nas_root,app.config.require_smb)}else{Ok(())};
        let endpoint=model::current_endpoint(&app.home);
        let model_settings=app.db.get::<ModelSettings>("settings","model").unwrap_or_default();
        let sources=sources.iter().map(|s|{let mut v=serde_json::to_value(s).unwrap();let obj=v.as_object_mut().unwrap();obj.remove("path");let sync=all_jobs.iter().find(|j|j.kind=="sync_source" && j.target_id==s.id);obj.insert("nasSync".into(),json!(sync.map(|j|j.status.as_str()).unwrap_or(if s.nas_relative_path.is_some(){"succeeded"}else{"local_only"})));v}).collect::<Vec<_>>();
        let shots=shots.iter().map(|s|{let mut v=serde_json::to_value(s).unwrap();let obj=v.as_object_mut().unwrap();obj.insert("hasOutput".into(),json!(s.output_path.is_some()));obj.remove("outputPath");obj.remove("publishedPath");let publish=all_jobs.iter().find(|j|j.kind=="publish" && j.target_id==s.id && j.revision+1==s.revision);let sync=publish.and_then(|p|all_jobs.iter().find(|j|j.kind=="sync_release" && j.target_id==p.id));obj.insert("nasSync".into(),json!(sync.map(|j|j.status.as_str()).unwrap_or("local_only")));v}).collect::<Vec<_>>();
        Ok(Json(json!({"sources":sources,"shots":shots,"jobs":jobs,"counts":counts,"settings":model_settings,
            "runtime":{"syncToNas":sync_to_nas,"localRoot":app.config.data_dir,"nasOnline":sync_to_nas && nas.is_ok(),"nasError":nas.err().map(|e|e.to_string()),"nasRoot":app.config.nas_root,"endpoint":endpoint.as_ref().map(|e|e.base_url.clone()).ok(),"endpointError":endpoint.err().map(|e|e.to_string()),"dailyTarget":100,"outputAspect":"9:16"}})))
    }).await
}
async fn models(State(app): State<Shared>) -> ApiResult<Json<Value>> {
    blocking(move || {
        Ok(Json(
            json!({"models":model::models(&model::current_endpoint(&app.home)?)?}),
        ))
    })
    .await
}
async fn settings(
    State(app): State<Shared>,
    Json(value): Json<ModelSettings>,
) -> ApiResult<Json<Value>> {
    ensure_api(
        !value.model_id.is_empty()
            && value.model_id.len() <= 160
            && ["video", "frames"].contains(&value.input_mode.as_str()),
        "模型配置无效",
    )?;
    app.db.put("settings", "model", &value)?;
    Ok(Json(json!({"ok":true})))
}
fn ensure_api(condition: bool, message: &str) -> ApiResult<()> {
    if condition {
        Ok(())
    } else {
        Err(anyhow::anyhow!("{message}").into())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportQuery {
    filename: String,
    #[serde(default)]
    product: String,
    #[serde(default)]
    batch: String,
}
async fn upload(
    State(app): State<Shared>,
    Query(query): Query<ImportQuery>,
    body: Body,
) -> ApiResult<Json<Value>> {
    ensure_api(
        query.filename.len() <= 500 && query.product.len() <= 1000 && query.batch.len() <= 500,
        "导入字段过长",
    )?;
    let temp = app.config.data_dir.join("uploads").join(id());
    tokio::fs::create_dir_all(temp.parent().unwrap()).await?;
    let result = async {
        let mut file = tokio::fs::File::create(&temp).await?;
        let mut stream = body.into_data_stream();
        let mut size = 0u64;
        while let Some(chunk) = stream.next().await {
            let bytes = chunk?;
            size += bytes.len() as u64;
            anyhow::ensure!(size <= 20 * 1024 * 1024 * 1024, "单文件不能超过 20 GB");
            file.write_all(&bytes).await?;
        }
        file.sync_all().await?;
        anyhow::ensure!(size > 0, "上传文件为空");
        Ok::<(), anyhow::Error>(())
    }
    .await;
    if let Err(e) = result {
        let _ = tokio::fs::remove_file(&temp).await;
        return Err(e.into());
    }
    blocking(move || {
        let result = ingest(&app, &temp, &query.filename, &query.product, &query.batch);
        let _ = fs::remove_file(&temp);
        Ok(Json(result?))
    })
    .await
}
fn ingest(app: &App, input: &Path, name: &str, product: &str, batch: &str) -> Result<Value> {
    let sha = storage::hash(input)?;
    let source_id = id();
    let dir = app.media.source_dir(&source_id);
    let original = dir.join("original");
    let mut source = app.media.source(
        input,
        name.into(),
        product.into(),
        batch.into(),
        sha.clone(),
        source_id,
    )?;
    fs::create_dir_all(&dir)?;
    fs::copy(input, &original)?;
    fs::File::open(&original)?.sync_all()?;
    ensure!(storage::hash(&original)? == sha, "源文件导入期间发生变化");
    source.path = original.to_string_lossy().into();
    app.db.transaction(|db| {
        if let Some(existing) = store::list::<Source>(db, "source")?
            .iter()
            .find(|s| s.sha256 == sha && s.product == product && s.batch == batch)
        {
            let _ = fs::remove_dir_all(&dir);
            return Ok(json!({"sourceId":existing.id,"duplicate":true}));
        }
        let job = Job::new("archive", &source.id, 0);
        store::put(db, "source", &source.id, &source)?;
        enqueue_analysis(db, &job, &app.home)?;
        Ok(json!({"sourceId":source.id,"duplicate":false,"jobId":job.id}))
    })
}
fn enqueue_analysis(db: &rusqlite::Connection, job: &Job, home: &Path) -> Result<()> {
    let settings = store::get::<ModelSettings>(db, "settings", "model").unwrap_or_default();
    let config = AnalysisSettings {
        model: settings,
        endpoint_fingerprint: model::current_endpoint(home).ok().map(|e| e.fingerprint()),
    };
    store::put(db, "model_config", &job.id, &config)?;
    store::put(db, "job", &job.id, job)
}
async fn scan(State(app): State<Shared>) -> ApiResult<Json<Value>> {
    blocking(move || {
        storage::verify_root(&app.config.nas_root, app.config.require_smb)?;
        let inbox = app.config.nas_root.join("inbox");
        let mut results = vec![];
        for entry in fs::read_dir(inbox)?.take(100) {
            let entry = entry?;
            if !entry.file_type()?.is_file() {
                continue;
            }
            let path = entry.path();
            let ext = path
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            if !["mp4", "mov", "m4v", "mkv", "avi", "webm"].contains(&ext.as_str()) {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            let result = ingest(&app, &path, &name, "", "nas-inbox");
            results.push(match result {
                Ok(r) => json!({"name":name,"result":r}),
                Err(e) => json!({"name":name,"error":e.to_string()}),
            });
        }
        Ok(Json(json!({"results":results})))
    })
    .await
}
async fn edit(
    State(app): State<Shared>,
    ApiPath(shot_id): ApiPath<String>,
    Json(edit): Json<ShotEdit>,
) -> ApiResult<Json<Shot>> {
    Ok(Json(app.db.transaction(|db| {
        let mut shot = store::get::<Shot>(db, "shot", &shot_id)?;
        let source = store::get::<Source>(db, "source", &shot.source_id)?;
        edit.apply(&mut shot, &source)?;
        audit(db, &shot, "edit")?;
        store::put(db, "shot", &shot.id, &shot)?;
        Ok(shot)
    })?))
}
fn audit(db: &rusqlite::Connection, shot: &Shot, action: &str) -> Result<()> {
    let review = Review {
        id: id(),
        shot_id: shot.id.clone(),
        revision: shot.revision,
        action: action.into(),
        created_at: now(),
        snapshot: serde_json::to_value(shot)?,
    };
    store::put(db, "review", &review.id, &review)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Action {
    base_revision: u64,
    action: String,
}
async fn action(
    State(app): State<Shared>,
    ApiPath(shot_id): ApiPath<String>,
    Json(action): Json<Action>,
) -> ApiResult<Json<Shot>> {
    Ok(Json(app.db.transaction(|db| {
        let mut shot = store::get::<Shot>(db, "shot", &shot_id)?;
        ensure!(shot.revision == action.base_revision, "revision_conflict");
        ensure!(
            !["rendering", "publishing"].contains(&shot.status.as_str()),
            "片段正在处理"
        );
        let kind = match action.action.as_str() {
            "render" => {
                shot.recipe.validate()?;
                ensure!(shot.status != "published", "修改已发布片段后再加工");
                if shot.status == "review"
                    && shot.output_sha256.is_some()
                    && shot
                        .output_path
                        .as_ref()
                        .is_some_and(|p| Path::new(p).is_file())
                {
                    return Ok(shot);
                }
                shot.output_path = None;
                shot.output_sha256 = None;
                shot.published_path = None;
                shot.status = "rendering".into();
                Some("render")
            }
            "publish" => {
                ensure!(
                    shot.status == "review"
                        && shot.output_path.is_some()
                        && shot.output_sha256.is_some(),
                    "必须先完成加工并审核当前结果"
                );
                shot.status = "publishing".into();
                Some("publish")
            }
            "reject" => {
                shot.status = "rejected".into();
                shot.published_path = None;
                None
            }
            "restore" => {
                ensure!(shot.status == "rejected", "只能恢复已淘汰片段");
                shot.status = if shot.output_path.is_some() {
                    "review"
                } else {
                    "draft"
                }
                .into();
                None
            }
            _ => anyhow::bail!("操作不受支持"),
        };
        shot.revision += 1;
        shot.error = None;
        audit(db, &shot, &action.action)?;
        if let Some(kind) = kind {
            let job = Job::new(kind, &shot.id, shot.revision);
            store::put(db, "job", &job.id, &job)?;
        }
        store::put(db, "shot", &shot.id, &shot)?;
        Ok(shot)
    })?))
}
async fn manual(
    State(app): State<Shared>,
    ApiPath(source_id): ApiPath<String>,
) -> ApiResult<Json<Shot>> {
    ensure_api(
        app.media
            .source_dir(&source_id)
            .join("preview.mp4")
            .is_file(),
        "请先重试原片任务以生成预览",
    )?;
    Ok(Json(app.db.transaction(|db| {
        let source = store::get::<Source>(db, "source", &source_id)?;
        ensure!(
            ["review", "failed"].contains(&source.status.as_str()),
            "请等待原片分析完成"
        );
        let shot = Shot {
            id: id(),
            source_id: source.id,
            revision: 1,
            name: format!("{} 手工分镜", source.name),
            start_ticks: 0,
            end_ticks: source.duration_ticks,
            description: String::new(),
            tags: vec![],
            roles: vec![],
            unsupported_claims: vec![],
            evidence: "人工创建，待核对完整动作".into(),
            recipe: Recipe::default(),
            status: "draft".into(),
            error: None,
            quality_issues: vec![],
            output_path: None,
            output_sha256: None,
            published_path: None,
            analysis_run_id: String::new(),
            model_id: "human".into(),
            input_mode: "manual".into(),
            created_at: now(),
        };
        audit(db, &shot, "manual")?;
        store::put(db, "shot", &shot.id, &shot)?;
        Ok(shot)
    })?))
}
async fn retry(
    State(app): State<Shared>,
    ApiPath(job_id): ApiPath<String>,
) -> ApiResult<Json<Value>> {
    app.db.transaction(|db| {
        let mut job = store::get::<Job>(db, "job", &job_id)?;
        ensure!(job.status == "failed", "只能重试失败任务");
        if ["analyze", "archive"].contains(&job.kind.as_str()) {
            let mut source = store::get::<Source>(db, "source", &job.target_id)?;
            ensure!(source.status == "failed", "原片已有更新任务");
            source.status = "queued".into();
            source.error = None;
            store::put(db, "source", &source.id, &source)?;
            enqueue_analysis(db, &job, &app.home)?;
        } else if !["sync_source", "sync_release"].contains(&job.kind.as_str()) {
            let mut shot = store::get::<Shot>(db, "shot", &job.target_id)?;
            ensure!(
                shot.status == "failed" && shot.revision == job.revision + 1,
                "片段已修改，请重新审核后提交"
            );
            shot.revision += 1;
            job.revision = shot.revision;
            shot.status = if job.kind == "render" {
                "rendering"
            } else {
                "publishing"
            }
            .into();
            shot.error = None;
            store::put(db, "shot", &shot.id, &shot)?;
        }
        job.status = "queued".into();
        job.error = None;
        job.updated_at = now();
        store::put(db, "job", &job.id, &job)
    })?;
    Ok(Json(json!({"ok":true})))
}

pub fn worker(app: Shared) {
    // Separate bounded lanes keep model latency and SMB writes off the render queue.
    for kinds in [
        vec!["render"],
        vec!["archive", "publish"],
        vec!["analyze"],
        vec!["sync_source", "sync_release"],
    ] {
        let app = app.clone();
        std::thread::spawn(move || {
            loop {
                if kinds.contains(&"sync_source")
                    && !app
                        .db
                        .transaction(|db| Ok(sync_enabled(db)))
                        .unwrap_or(false)
                {
                    std::thread::sleep(Duration::from_millis(500));
                    continue;
                }
                match app.db.claim_kinds(&kinds) {
                    Ok(Some(mut job)) => {
                        let result = execute(&app, &job);
                        job.updated_at = now();
                        job.status = if result.is_ok() {
                            "succeeded"
                        } else {
                            "failed"
                        }
                        .into();
                        job.error = result.err().map(|e| e.to_string());
                        let stored = app.db.transaction(|db| {
                            if let Some(error) = &job.error {
                                if ["analyze", "archive"].contains(&job.kind.as_str()) {
                                    let mut src =
                                        store::get::<Source>(db, "source", &job.target_id)?;
                                    src.status = "failed".into();
                                    src.error = Some(error.clone());
                                    store::put(db, "source", &src.id, &src)?;
                                } else if !["sync_source", "sync_release"]
                                    .contains(&job.kind.as_str())
                                {
                                    let mut shot = store::get::<Shot>(db, "shot", &job.target_id)?;
                                    if shot.revision == job.revision {
                                        shot.revision += 1;
                                        shot.status = "failed".into();
                                        shot.error = Some(error.clone());
                                        store::put(db, "shot", &shot.id, &shot)?;
                                    }
                                }
                            }
                            store::put(db, "job", &job.id, &job)
                        });
                        if let Err(e) = stored {
                            eprintln!("任务状态落盘失败: {e}");
                        }
                    }
                    Ok(None) => std::thread::sleep(Duration::from_millis(200)),
                    Err(e) => {
                        eprintln!("任务队列错误: {e}");
                        std::thread::sleep(Duration::from_secs(2));
                    }
                }
            }
        });
    }
}
fn execute(app: &App, job: &Job) -> Result<()> {
    match job.kind.as_str() {
        "archive" => {
            let mut source = app.db.get::<Source>("source", &job.target_id)?;
            if source.nas_relative_path.is_some()
                || app
                    .db
                    .get::<bool>("prepared_source", &source.id)
                    .unwrap_or(false)
            {
                return Ok(());
            }
            source.status = "archiving".into();
            app.db.put("source", &source.id, &source)?;
            app.media.prepare(&source)?;
            source.status = "queued".into();
            source.error = None;
            app.db.transaction(|db| {
                let analysis = Job::new("analyze", &source.id, 0);
                let settings = store::get::<AnalysisSettings>(db, "model_config", &job.id)?;
                store::put(db, "model_config", &analysis.id, &settings)?;
                store::put(db, "job", &analysis.id, &analysis)?;
                store::put(db, "prepared_source", &source.id, &true)?;
                if sync_enabled(db) {
                    enqueue_sync(db, "sync_source", &source.id, 0)?;
                }
                store::put(db, "source", &source.id, &source)
            })
        }
        "analyze" => {
            let mut source = app.db.get::<Source>("source", &job.target_id)?;
            // A process may stop after committing results but before marking its job complete.
            if source.status == "review" {
                return Ok(());
            }
            source.status = "analyzing".into();
            app.db.put("source", &source.id, &source)?;
            app.media.prepare(&source)?;
            let config = app.db.get::<AnalysisSettings>("model_config", &job.id)?;
            let endpoint = model::current_endpoint(&app.home)?;
            ensure!(
                config.endpoint_fingerprint.as_deref() == Some(endpoint.fingerprint().as_str()),
                "模型端点配置已变化，请重试以使用当前配置"
            );
            let shots = model::analyze(&app.media, &source, &endpoint, &config.model)?;
            app.db.transaction(|db| {
                for shot in shots {
                    store::put(db, "shot", &shot.id, &shot)?;
                }
                source.status = "review".into();
                source.error = None;
                store::put(db, "source", &source.id, &source)
            })
        }
        "render" => {
            let mut shot = app.db.get::<Shot>("shot", &job.target_id)?;
            if shot.revision == job.revision + 1 && shot.status == "review" {
                return Ok(());
            }
            ensure!(
                shot.revision == job.revision && shot.status == "rendering",
                "revision_conflict"
            );
            let source = app.db.get::<Source>("source", &shot.source_id)?;
            let frames = app.media.frame_times(&source)?;
            shot.start_ticks = *frames
                .iter()
                .min_by_key(|&&p| p.abs_diff(shot.start_ticks))
                .context("无可用帧")?;
            shot.end_ticks = *frames
                .iter()
                .min_by_key(|&&p| p.abs_diff(shot.end_ticks))
                .context("无可用帧")?;
            validate_range(shot.start_ticks, shot.end_ticks, source.duration_ticks)?;
            let (output, issues) = app.media.render(&shot, &source)?;
            shot.output_sha256 = Some(storage::hash(&output)?);
            shot.output_path = Some(output.to_string_lossy().into());
            shot.quality_issues = issues;
            shot.status = "review".into();
            shot.revision += 1;
            app.db.transaction(|db| {
                let current = store::get::<Shot>(db, "shot", &shot.id)?;
                ensure!(current.revision == job.revision, "revision_conflict");
                store::put(db, "shot", &shot.id, &shot)
            })
        }
        "publish" => {
            let mut shot = app.db.get::<Shot>("shot", &job.target_id)?;
            if shot.revision == job.revision + 1 && shot.status == "published" {
                return Ok(());
            }
            ensure!(
                shot.revision == job.revision && shot.status == "publishing",
                "revision_conflict"
            );
            ensure!(
                !shot.description.trim().is_empty() && !shot.roles.is_empty(),
                "发布前请填写画面描述和至少一个用途标签"
            );
            let source = app.db.get::<Source>("source", &shot.source_id)?;
            let local_root = app.config.data_dir.join("releases");
            fs::create_dir_all(&local_root)?;
            let root = &local_root;
            let required = false;
            let relative = format!("shots/{}/r{}/master.mp4", shot.id, shot.revision);
            let output = Path::new(shot.output_path.as_ref().context("加工文件缺失")?);
            let sha = shot.output_sha256.as_ref().context("加工校验信息缺失")?;
            ensure!(storage::hash(output)? == *sha, "加工文件与审核版本不一致");
            let poster = output.parent().unwrap().join("poster.jpg");
            let poster_relative = format!("shots/{}/r{}/poster.jpg", shot.id, shot.revision);
            let poster_sha = storage::hash(&poster)?;
            // Three independent objects, then the manifest and database publication barrier.
            std::thread::scope(|scope| -> Result<()> {
                let handles = [
                    (relative.as_str(), output, sha.as_str()),
                    (
                        poster_relative.as_str(),
                        poster.as_path(),
                        poster_sha.as_str(),
                    ),
                ]
                .map(|(relative, input, sha)| {
                    scope.spawn(move || {
                        storage::publish_file(root, Path::new(relative), input, sha, required)
                    })
                });
                for handle in handles {
                    handle
                        .join()
                        .map_err(|_| anyhow::anyhow!("归档线程中断"))??;
                }
                Ok(())
            })?;
            let metadata_path = app
                .config
                .data_dir
                .join("publications")
                .join(format!("{}.json", job.id));
            fs::create_dir_all(metadata_path.parent().unwrap())?;
            let mut public_shot = serde_json::to_value(&shot)?;
            let obj = public_shot.as_object_mut().unwrap();
            obj.remove("outputPath");
            obj.insert("status".into(), json!("published"));
            obj.insert("revision".into(), json!(shot.revision + 1));
            obj.insert("publishedPath".into(), json!(relative));
            let reviews=app.db.list::<Review>("review")?.into_iter().filter(|r|r.shot_id==shot.id).map(|r|json!({"id":r.id,"revision":r.revision,"action":r.action,"createdAt":r.created_at})).collect::<Vec<_>>();
            fs::write(
                &metadata_path,
                serde_json::to_vec_pretty(
                    &json!({"schemaVersion":"moirai.footage.v1","storageMode":"local-first","publicationId":job.id,"shot":public_shot,"source":{"id":source.id,"sha256":source.sha256,"product":source.product,"batch":source.batch,"originalName":source.name,"nasRelativePath":source_relative(&source)},"reviews":reviews}),
                )?,
            )?;
            storage::publish_file(
                root,
                Path::new(&format!("metadata/{}/{}.json", shot.id, job.id)),
                &metadata_path,
                &storage::hash(&metadata_path)?,
                required,
            )?;
            shot.published_path = Some(relative);
            shot.status = "published".into();
            shot.revision += 1;
            app.db.transaction(|db| {
                let current = store::get::<Shot>(db, "shot", &shot.id)?;
                ensure!(current.revision == job.revision, "revision_conflict");
                store::put(db, "shot", &shot.id, &shot)?;
                if sync_enabled(db) {
                    enqueue_sync(db, "sync_release", &job.id, shot.revision)?;
                }
                Ok(())
            })
        }
        "sync_source" => {
            let source = app.db.get::<Source>("source", &job.target_id)?;
            sync_source(app, &source)
        }
        "sync_release" => {
            let metadata = app
                .config
                .data_dir
                .join("publications")
                .join(format!("{}.json", job.target_id));
            let manifest: Value = serde_json::from_slice(&fs::read(&metadata)?)?;
            let source = app.db.get::<Source>(
                "source",
                manifest["shot"]["sourceId"]
                    .as_str()
                    .context("发布来源缺失")?,
            )?;
            sync_source(app, &source)?;
            let relative = manifest["shot"]["publishedPath"]
                .as_str()
                .context("发布路径缺失")?;
            let local = app.config.data_dir.join("releases").join(relative);
            let sha = manifest["shot"]["outputSha256"]
                .as_str()
                .context("发布哈希缺失")?;
            storage::publish_file(
                &app.config.nas_root,
                Path::new(relative),
                &local,
                sha,
                app.config.require_smb,
            )?;
            let poster = local.parent().unwrap().join("poster.jpg");
            let poster_relative = Path::new(relative).parent().unwrap().join("poster.jpg");
            storage::publish_file(
                &app.config.nas_root,
                &poster_relative,
                &poster,
                &storage::hash(&poster)?,
                app.config.require_smb,
            )?;
            let meta_relative = format!(
                "metadata/{}/{}.json",
                manifest["shot"]["id"].as_str().context("分镜 ID 缺失")?,
                job.target_id
            );
            storage::publish_file(
                &app.config.nas_root,
                Path::new(&meta_relative),
                &metadata,
                &storage::hash(&metadata)?,
                app.config.require_smb,
            )?;
            Ok(())
        }
        _ => anyhow::bail!("未知任务类型"),
    }
}

fn source_relative(source: &Source) -> String {
    let ext = Path::new(&source.name)
        .extension()
        .and_then(|v| v.to_str())
        .filter(|s| s.len() < 10 && s.chars().all(|c| c.is_ascii_alphanumeric()))
        .unwrap_or("bin");
    format!("sources/{}/original.{ext}", source.id)
}
fn sync_source(app: &App, source: &Source) -> Result<()> {
    storage::publish_file(
        &app.config.nas_root,
        Path::new(&source_relative(source)),
        Path::new(&source.path),
        &source.sha256,
        app.config.require_smb,
    )?;
    Ok(())
}

pub fn byte_range(range: Option<&str>, len: u64) -> Result<(u64, u64, bool)> {
    ensure!(len > 0, "媒体文件为空");
    if let Some(header) = range {
        let part = header.strip_prefix("bytes=").context("无效 Range")?;
        ensure!(!part.contains(','), "不支持多段 Range");
        let (a, b) = part.split_once('-').context("无效 Range")?;
        let (start, end) = if a.is_empty() {
            let count = b.parse::<u64>()?;
            ensure!(count > 0, "无效 Range");
            (len.saturating_sub(count), len - 1)
        } else {
            (
                a.parse::<u64>()?,
                if b.is_empty() {
                    len - 1
                } else {
                    b.parse::<u64>()?.min(len - 1)
                },
            )
        };
        ensure!(start < len && end >= start, "Range 越界");
        Ok((start, end, true))
    } else {
        Ok((0, len - 1, false))
    }
}
async fn media_file(
    State(app): State<Shared>,
    ApiPath((kind, id, variant)): ApiPath<(String, String, String)>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    let path = match kind.as_str() {
        "release" if variant == "master" => crate::lineage::release_path(&app, &id)?,
        "source" => {
            let source = app.db.get::<Source>("source", &id)?;
            match variant.as_str() {
                "preview" => app.media.source_dir(&source.id).join("preview.mp4"),
                "poster" => app.media.source_dir(&source.id).join("poster.jpg"),
                _ => return Err(anyhow::anyhow!("媒体不存在").into()),
            }
        }
        "shot" => {
            let shot = app.db.get::<Shot>("shot", &id)?;
            let path = PathBuf::from(shot.output_path.context("加工媒体不存在")?);
            match variant.as_str() {
                "master" => path,
                "poster" => path.parent().unwrap().join("poster.jpg"),
                _ => return Err(anyhow::anyhow!("媒体不存在").into()),
            }
        }
        _ => return Err(anyhow::anyhow!("媒体不存在").into()),
    };
    let mut file = tokio::fs::File::open(&path)
        .await
        .context("媒体文件不存在")?;
    let len = file.metadata().await?.len();
    let (start, end, partial) = match byte_range(
        headers.get(header::RANGE).and_then(|h| h.to_str().ok()),
        len,
    ) {
        Ok(r) => r,
        Err(_) => {
            return Ok((
                StatusCode::RANGE_NOT_SATISFIABLE,
                [(header::CONTENT_RANGE, format!("bytes */{len}"))],
            )
                .into_response());
        }
    };
    file.seek(std::io::SeekFrom::Start(start)).await?;
    let stream = tokio_util::io::ReaderStream::new(file.take(end - start + 1));
    let mut response = Response::builder()
        .status(if partial { 206 } else { 200 })
        .header(
            header::CONTENT_TYPE,
            if variant == "poster" {
                "image/jpeg"
            } else {
                "video/mp4"
            },
        )
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, (end - start + 1).to_string())
        .header(header::CACHE_CONTROL, "private, no-store");
    if partial {
        response = response.header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{len}"));
    }
    Ok(response.body(Body::from_stream(stream))?)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn local_publish_survives_offline_nas_and_syncs_immutable_metadata_later() {
        let local = tempfile::tempdir().unwrap();
        let nas = tempfile::tempdir().unwrap();
        let blocked = local.path().join("not-a-directory");
        fs::write(&blocked, b"offline").unwrap();
        let output = local.path().join("master.mp4");
        fs::write(&output, b"verified-render").unwrap();
        fs::write(local.path().join("poster.jpg"), b"poster").unwrap();
        let sha = storage::hash(&output).unwrap();
        let source: Source=serde_json::from_value(json!({"id":"source","name":"original.mp4","path":output,"product":"sku","batch":"batch","sha256":sha,"durationTicks":240000,"width":720,"height":1280,"fps":30,"colorTransfer":"bt709","rotation":0,"status":"review","error":null,"createdAt":0})).unwrap();
        let shot: Shot=serde_json::from_value(json!({"id":"shot","sourceId":"source","revision":2,"name":"test","startTicks":0,"endTicks":240000,"description":"approved tags","tags":["detail"],"roles":[{"role":"product_demo","reason":"visible","confidence":0.8}],"unsupportedClaims":["claim"],"evidence":"observed","recipe":crate::domain::Recipe::default(),"status":"publishing","error":null,"qualityIssues":[],"outputPath":output,"outputSha256":sha,"publishedPath":null,"analysisRunId":"analysis","modelId":"model","inputMode":"video","createdAt":0})).unwrap();
        let db = Store::open(&local.path().join("test.sqlite3")).unwrap();
        db.put("source", &source.id, &source).unwrap();
        db.put("shot", &shot.id, &shot).unwrap();
        let mut job = Job::new("publish", &shot.id, shot.revision);
        let app = Arc::new(App {
            db,
            config: Config {
                data_dir: local.path().into(),
                nas_root: blocked,
                require_smb: false,
                ffmpeg: String::new(),
                ffprobe: String::new(),
                port: 0,
            },
            media: Media {
                root: local.path().into(),
                ffmpeg: String::new(),
                ffprobe: String::new(),
            },
            home: local.path().into(),
            token: String::new(),
        });
        execute(&app, &job).unwrap();
        job.status = "succeeded".into();
        app.db.put("job", &job.id, &job).unwrap();
        assert_eq!(
            app.db.get::<Shot>("shot", "shot").unwrap().status,
            "published"
        );
        assert_eq!(app.db.list::<Job>("job").unwrap().len(), 1);
        let local_release = crate::lineage::release_path(&app, &job.id).unwrap();
        assert!(local_release.starts_with(local.path().canonicalize().unwrap()));
        let _ = set_storage(State(app.clone()), Json(SyncSettings { sync_to_nas: true }))
            .await
            .unwrap();
        let sync = app
            .db
            .get::<Job>("job", &format!("sync_release-{}", job.id))
            .unwrap();
        assert!(execute(&app, &sync).is_err());
        assert_eq!(
            app.db.get::<Shot>("shot", "shot").unwrap().status,
            "published"
        );
        let mut changed = app.db.get::<Shot>("shot", "shot").unwrap();
        changed.revision += 1;
        changed.description = "new draft".into();
        changed.status = "draft".into();
        app.db.put("shot", "shot", &changed).unwrap();
        let mut app = Arc::try_unwrap(app).ok().unwrap();
        app.config.nas_root = nas.path().into();
        execute(&app, &sync).unwrap();
        execute(&app, &sync).unwrap();
        let manifest: Value = serde_json::from_slice(
            &fs::read(nas.path().join(format!("metadata/shot/{}.json", job.id))).unwrap(),
        )
        .unwrap();
        assert_eq!(manifest["shot"]["description"], "approved tags");
        assert_eq!(manifest["shot"]["tags"], json!(["detail"]));
        assert_eq!(
            storage::hash(
                &nas.path()
                    .join(manifest["shot"]["publishedPath"].as_str().unwrap())
            )
            .unwrap(),
            sha
        );
    }
    #[test]
    #[ignore = "Requires FOOTAGE_BENCH_DB, FOOTAGE_BENCH_SHOT and FOOTAGE_BENCH_NAS staging directory"]
    fn parallel_publication_commits_manifest_after_verified_files() {
        let live = rusqlite::Connection::open_with_flags(
            std::env::var("FOOTAGE_BENCH_DB").unwrap(),
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .unwrap();
        let mut shot =
            store::get::<Shot>(&live, "shot", &std::env::var("FOOTAGE_BENCH_SHOT").unwrap())
                .unwrap();
        let source = store::get::<Source>(&live, "source", &shot.source_id).unwrap();
        let local = tempfile::tempdir().unwrap();
        let nas = tempfile::tempdir_in(std::env::var("FOOTAGE_BENCH_NAS").unwrap()).unwrap();
        let db = Store::open(&local.path().join("test.sqlite3")).unwrap();
        shot.status = "publishing".into();
        let job = Job::new("publish", &shot.id, shot.revision);
        db.put("source", &source.id, &source).unwrap();
        db.put("shot", &shot.id, &shot).unwrap();
        let app = App {
            db,
            config: Config {
                data_dir: local.path().into(),
                nas_root: nas.path().into(),
                require_smb: true,
                ffmpeg: String::new(),
                ffprobe: String::new(),
                port: 0,
            },
            media: Media {
                root: local.path().into(),
                ffmpeg: String::new(),
                ffprobe: String::new(),
            },
            home: local.path().into(),
            token: String::new(),
        };
        let start = std::time::Instant::now();
        execute(&app, &job).unwrap();
        println!(
            "parallel_publish_with_original_and_manifest_ms={}",
            start.elapsed().as_millis()
        );
        let published = app.db.get::<Shot>("shot", &shot.id).unwrap();
        assert_eq!(published.status, "published");
        let sync = Job::new("sync_release", &job.id, published.revision);
        execute(&app, &sync).unwrap();
        assert!(nas.path().join(published.published_path.unwrap()).is_file());
        assert!(
            nas.path()
                .join(format!("metadata/{}/{}.json", shot.id, job.id))
                .is_file()
        );
    }
    #[test]
    fn ranges_support_seek_and_suffix() {
        assert_eq!(
            byte_range(Some("bytes=20-29"), 100).unwrap(),
            (20, 29, true)
        );
        assert_eq!(byte_range(Some("bytes=-10"), 100).unwrap(), (90, 99, true));
        assert!(byte_range(Some("bytes=100-"), 100).is_err());
        assert!(byte_range(Some("bytes=0-1,4-5"), 100).is_err());
    }
}
