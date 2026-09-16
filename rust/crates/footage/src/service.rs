use crate::{
    domain::*,
    location,
    media::Media,
    model::{self, AnalysisSettings, ModelSettings},
    products::{self, Product},
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
    pub storage_gate: std::sync::Mutex<()>,
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
    !location::folder_mode(db)
        && store::get::<SyncSettings>(db, "settings", "storage")
            .unwrap_or_default()
            .sync_to_nas
}
async fn set_storage(
    State(app): State<Shared>,
    Json(settings): Json<SyncSettings>,
) -> ApiResult<Json<Value>> {
    blocking(move || {
        let _guard = app
            .storage_gate
            .lock()
            .map_err(|_| anyhow::anyhow!("存储配置锁不可用"))?;
        if settings.sync_to_nas {
            ensure!(
                !location::current(&app)?.nas_root.as_os_str().is_empty(),
                "请先配置团队 NAS 目录"
            );
        }
        let releases = crate::lineage::releases(&app)?;
        app.db.transaction(|db| {
            store::put(db, "settings", "storage", &settings)?;
            if sync_enabled(db) {
                for source in store::list::<Source>(db, "source")? {
                    if source.status == "deleted" {
                        continue;
                    }
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
pub(crate) fn enqueue_sync(
    db: &rusqlite::Connection,
    kind: &str,
    target: &str,
    revision: u64,
) -> Result<()> {
    let mut job = Job::new(kind, target, revision);
    job.id = location::nas_job_id(db, kind, target);
    if store::get::<Job>(db, "job", &job.id).is_err() {
        store::put(db, "job", &job.id, &job)?;
    }
    Ok(())
}

pub fn router(app: Shared) -> Router {
    Router::new()
        .merge(crate::edge::router())
        .merge(products::router())
        .merge(location::router())
        .merge(crate::tag_settings::router())
        .merge(crate::preview::router())
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
        .route("/shots/{id}/confirm", post(confirm_labels))
        .route("/shots/{id}/action", post(action))
        .route("/sources/{id}/manual", post(manual))
        .route("/sources/{id}/delete", post(delete_source))
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
    tag: Option<String>,
    category: Option<usize>,
}
async fn state(State(app): State<Shared>, Query(search): Query<Search>) -> ApiResult<Json<Value>> {
    blocking(move||{
        app.db.transaction(crate::tag_settings::migrate_legacy_roles)?;
        app.db.transaction(crate::adaptive_lut::migrate_drafts)?;
        let sources=app.db.list::<Source>("source")?.into_iter().filter(|s| s.status != "deleted").collect::<Vec<_>>();
        let mut shots=app.db.list::<Shot>("shot")?;
        shots.retain(|shot| shot.status != "deleted");
        let all_shots = shots.clone();
        let counts=json!({"sources":sources.len(),"pendingConfirm":shots.iter().filter(|s|["draft","review","tag_review"].contains(&s.status.as_str())).count(),"processing":shots.iter().filter(|s|["tagging","recognizing","rendering","publishing"].contains(&s.status.as_str())).count(),"draft":shots.iter().filter(|s|s.status=="draft").count(),"review":shots.iter().filter(|s|s.status=="review").count(),"tagReview":shots.iter().filter(|s|s.status=="tag_review").count(),"published":shots.iter().filter(|s|s.status=="published").count()});
        if let Some(status)=search.status.filter(|s|!s.is_empty()){shots.retain(|s|if status=="pending_confirm" {["draft","review","tag_review"].contains(&s.status.as_str())}else{s.status==status});}
        if let Some(role)=search.role.filter(|s|!s.is_empty()){shots.retain(|s|s.roles.iter().any(|r|r.role==role));}
        if let Some(tag)=search.tag.filter(|s|!s.is_empty()){shots.retain(|s|s.tags.contains(&tag));}
        if let Some(category)=search.category {
            let settings=app.db.transaction(crate::tag_settings::current)?;
            shots.retain(|s|settings.groups.get(category).is_some_and(|group|s.tags.iter().any(|tag|group.contains(tag))));
        }
        if let Some(query)=search.q.filter(|s|!s.trim().is_empty()){
            let query=query.to_lowercase();shots.retain(|s|{
                let product=sources.iter().find(|a|a.id==s.source_id).map(|a|a.product.as_str()).unwrap_or("");
                format!("{} {} {} {}",s.name,s.description,s.tags.join(" "),product).to_lowercase().contains(&query)
            });
        }
        let all_jobs=app.db.list::<Job>("job")?;
        let confirmations=app.db.list::<LabelConfirmation>("label_confirmation")?;
        let mut jobs=all_jobs.clone();jobs.sort_by_key(|j|std::cmp::Reverse(j.updated_at));jobs.truncate(200);
        let sync_to_nas=app.db.transaction(|db|Ok(sync_enabled(db)))?;
        let location=location::current(&app)?;
        let nas=if sync_to_nas {storage::verify_root(&location.nas_root,app.config.require_smb)}else{Ok(())};
        let endpoint=model::current_endpoint(&app.home);
        let model_settings=app.db.get::<ModelSettings>("settings","model").unwrap_or_default();
        let tag_settings=app.db.transaction(crate::tag_settings::current)?;
        let sources=sources.iter().map(|s|{let mut v=serde_json::to_value(s).unwrap();let obj=v.as_object_mut().unwrap();obj.remove("path");obj.insert("previewReady".into(),json!(app.media.source_dir(&s.id).join("preview.mp4").is_file() && app.media.source_dir(&s.id).join("poster.jpg").is_file()));if let Some(shot)=all_shots.iter().find(|shot|shot.source_id==s.id && shot.direct_upload) {obj.insert("directUpload".into(),json!(true));obj.insert("status".into(),json!(shot.status));obj.insert("error".into(),json!(shot.error));}let sync=all_jobs.iter().find(|j|j.kind=="sync_source" && j.target_id==s.id);obj.insert("nasSync".into(),json!(sync.map(|j|j.status.as_str()).unwrap_or(if s.nas_relative_path.is_some(){"succeeded"}else{"local_only"})));v}).collect::<Vec<_>>();
        let shots=shots.iter().map(|s|{let mut v=serde_json::to_value(s).unwrap();let obj=v.as_object_mut().unwrap();obj.insert("labelsConfirmed".into(),json!(confirmations.iter().any(|c|c.shot_id==s.id)||s.status=="published"||all_jobs.iter().any(|j|j.kind=="publish"&&j.target_id==s.id&&j.status=="succeeded")));obj.insert("hasOutput".into(),json!(s.output_path.is_some()));obj.remove("outputPath");obj.remove("publishedPath");let publish=all_jobs.iter().find(|j|j.kind=="publish" && j.target_id==s.id && j.revision+1==s.revision);let sync=publish.and_then(|p|all_jobs.iter().find(|j|j.kind=="sync_release" && j.target_id==p.id));obj.insert("nasSync".into(),json!(sync.map(|j|j.status.as_str()).unwrap_or("local_only")));v}).collect::<Vec<_>>();
        let shots = shots.into_iter().map(|mut shot| {
            if let Some(source_shot) = all_shots.iter().find(|s| Some(s.id.as_str()) == shot["id"].as_str()) {
                shot["analysisSuggestion"] = app.db.transaction(|db| crate::label_review::public_suggestion(db, source_shot)).unwrap_or(Value::Null);
            }
            let reanalysis = all_jobs.iter().filter(|job| job.kind == "reanalyze" && Some(job.target_id.as_str()) == shot["id"].as_str()).map(|job|job.revision).max();
            if let Some(revision) = reanalysis.filter(|_| shot["analysisSuggestion"].is_null()) {
                shot["labelsConfirmed"] = json!(confirmations.iter().any(|c| Some(c.shot_id.as_str()) == shot["id"].as_str() && c.revision > revision));
            }
            let release = all_jobs.iter().filter(|job| job.kind == "publish" && job.status == "succeeded" && Some(job.target_id.as_str()) == shot["id"].as_str()).max_by_key(|job| job.revision);
            shot["publishedRelease"] = release.map(|job| json!({"id":job.id,"revision":job.revision + 1})).unwrap_or(Value::Null);
            shot
        }).collect::<Vec<_>>();
        let sources = sources.into_iter().map(|mut s| {s["hasShot"] = json!(all_shots.iter().any(|shot|Some(shot.source_id.as_str())==s["id"].as_str()));s}).collect::<Vec<_>>();
        Ok(Json(json!({"tagSettings":tag_settings,"storage":location::summary(&app)?,"products":products::summary(&app.db.list::<Product>("product")?),"sources":sources,"shots":shots,"jobs":jobs,"counts":counts,"settings":model_settings,
            "runtime":{"syncToNas":sync_to_nas,"localRoot":app.config.data_dir,"nasOnline":sync_to_nas && nas.is_ok(),"nasError":nas.err().map(|e|e.to_string()),"nasRoot":location.nas_root,"endpoint":endpoint.as_ref().map(|e|e.base_url.clone()).ok(),"endpointError":endpoint.err().map(|e|e.to_string()),"dailyTarget":100,"outputAspect":"9:16"}})))
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
    #[serde(default)]
    direct: bool,
}
async fn upload(
    State(app): State<Shared>,
    Query(query): Query<ImportQuery>,
    headers: HeaderMap,
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
        let result = ingest_mode(
            &app,
            &temp,
            &query.filename,
            &query.product,
            &query.batch,
            query.direct,
        );
        let _ = fs::remove_file(&temp);
        let result = result?;
        if crate::edge::coordinator()
            && result["duplicate"] != true
            && let (Some(source), Some(worker)) = (
                result["sourceId"].as_str(),
                headers
                    .get("x-footage-worker")
                    .and_then(|h| h.to_str().ok()),
            )
            && uuid::Uuid::parse_str(worker).is_ok()
        {
            app.db.put(
                "edge_preferred",
                source,
                &json!({"workerId":worker,"createdAt":now()}),
            )?;
        }
        Ok(Json(result))
    })
    .await
}
fn ingest(app: &App, input: &Path, name: &str, product: &str, batch: &str) -> Result<Value> {
    ingest_mode(app, input, name, product, batch, false)
}
fn duplicate_import(db: &rusqlite::Connection, sha: &str) -> Result<Option<Value>> {
    let sources = store::list::<Source>(db, "source")?;
    let shots = store::list::<Shot>(db, "shot")?;
    if let Some(source) = sources
        .iter()
        .filter(|s| s.sha256 == sha && s.status != "deleted")
        .min_by_key(|s| s.created_at)
    {
        let shot = shots.iter().find(|s| s.source_id == source.id);
        return Ok(Some(
            json!({"sourceId":source.id,"shotId":shot.map(|s| &s.id),"existingName":source.name,"duplicate":true,"message":"该片段已存在，已跳过上传"}),
        ));
    }
    Ok(None)
}
pub(crate) fn ingest_mode(
    app: &App,
    input: &Path,
    name: &str,
    product: &str,
    batch: &str,
    direct: bool,
) -> Result<Value> {
    if direct {
        ensure!(
            ["mp4", "mov", "m4v", "webm", "mkv", "avi"].contains(&media_extension(name).as_str()),
            "分镜支持 MP4、MOV、M4V、WebM、MKV、AVI 视频"
        );
    }
    let sha = storage::hash(input)?;
    if let Some(existing) = app.db.transaction(|db| duplicate_import(db, &sha))? {
        return Ok(existing);
    }
    let source_id = id();
    let dir = app.media.source_dir(&source_id);
    let original = dir.join(if direct {
        format!("original.{}", media_extension(name))
    } else {
        "original".into()
    });
    let mut source = app.media.source(
        input,
        name.into(),
        product.into(),
        batch.into(),
        sha.clone(),
        source_id,
    )?;
    let imported = (|| -> Result<Value> {
        fs::create_dir_all(&dir)?;
        fs::copy(input, &original)?;
        fs::File::open(&original)?.sync_all()?;
        ensure!(storage::hash(&original)? == sha, "源文件导入期间发生变化");
        source.path = original.to_string_lossy().into();
        app.db.transaction(|db| {
            // Recheck under the write transaction: simultaneous uploads must not both insert.
            if let Some(existing) = duplicate_import(db, &sha)? {
                return Ok(existing);
            }
            if direct {
                let shot = Shot {
                    tag_evidence: vec![],
                    analyzed_tags: vec![],
                    labels_need_review: false,
                    product_recognition_status: String::new(),
                    keep_original_audio: false,
                    is_featured: false,
                    details: Default::default(),
                    has_holiday: false,
                    holiday_tags: vec![],
                    product_tags: vec![],
                    product_matches: vec![],
                    direct_upload: true,
                    id: id(),
                    source_id: source.id.clone(),
                    revision: 1,
                    name: Path::new(name)
                        .file_stem()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into(),
                    start_ticks: 0,
                    end_ticks: source.duration_ticks,
                    description: String::new(),
                    tags: vec![],
                    roles: vec![],
                    unsupported_claims: vec![],
                    evidence: String::new(),
                    recipe: Recipe {
                        color_mode: "preserve".into(),
                        ..Default::default()
                    },
                    status: "tagging".into(),
                    error: None,
                    quality_issues: vec![],
                    output_path: Some(source.path.clone()),
                    output_sha256: Some(source.sha256.clone()),
                    published_path: None,
                    analysis_run_id: String::new(),
                    model_id: String::new(),
                    input_mode: String::new(),
                    created_at: now(),
                };
                source.status = "tagging".into();
                let job = Job::new("tag", &shot.id, shot.revision);
                store::put(db, "source", &source.id, &source)?;
                store::put(db, "shot", &shot.id, &shot)?;
                enqueue_analysis(db, &job, &app.home)?;
                return Ok(
                    json!({"sourceId":source.id,"shotId":shot.id,"jobId":job.id,"duplicate":false}),
                );
            }
            let job = Job::new("archive", &source.id, 0);
            store::put(db, "source", &source.id, &source)?;
            enqueue_analysis(db, &job, &app.home)?;
            Ok(json!({"sourceId":source.id,"duplicate":false,"jobId":job.id}))
        })
    })();
    if imported.as_ref().map_or(true, |v| v["duplicate"] == true) {
        let _ = fs::remove_dir_all(&dir);
    }
    let imported = imported?;
    if imported["duplicate"] == true {
        return Ok(imported);
    }
    location::local_event(app, imported["sourceId"].as_str(), None)?;
    Ok(imported)
}
fn enqueue_analysis(db: &rusqlite::Connection, job: &Job, home: &Path) -> Result<()> {
    let settings = store::get::<ModelSettings>(db, "settings", "model").unwrap_or_default();
    let config = AnalysisSettings {
        model: settings,
        endpoint_fingerprint: if crate::edge::coordinator() {
            None
        } else {
            model::current_endpoint(home).ok().map(|e| e.fingerprint())
        },
        tag_settings: Some(crate::tag_settings::current(db)?),
    };
    store::put(db, "model_config", &job.id, &config)?;
    products::snapshot(db, &job.id)?;
    store::put(db, "job", &job.id, job)
}
async fn scan(State(app): State<Shared>) -> ApiResult<Json<Value>> {
    blocking(move || {
        let location = location::current(&app)?;
        let root = if location.mode == "folder" {
            location::verify_folder(&location.folder_root)?;
            location.folder_root
        } else {
            storage::verify_root(&location.nas_root, app.config.require_smb)?;
            location.nas_root
        };
        let inbox = root.join("inbox");
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
            let batch = if location.mode == "folder" {
                "folder-inbox"
            } else {
                "nas-inbox"
            };
            let result = ingest(&app, &path, &name, "", batch);
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

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LabelConfirmation {
    shot_id: String,
    revision: u64,
}

async fn confirm_labels(
    State(app): State<Shared>,
    ApiPath(shot_id): ApiPath<String>,
    Json(edit): Json<ShotEdit>,
) -> ApiResult<Json<Shot>> {
    Ok(Json(app.db.transaction(|db| {
        let mut shot = store::get::<Shot>(db, "shot", &shot_id)?;
        ensure!(shot.status != "rejected", "请先恢复已淘汰分镜");
        let source = store::get::<Source>(db, "source", &shot.source_id)?;
        edit.apply(&mut shot, &source)?;
        ensure!(
            !shot.description.trim().is_empty(),
            "确认打标前请填写画面描述"
        );
        let ready = shot.output_sha256.is_some()
            && shot
                .output_path
                .as_ref()
                .is_some_and(|p| Path::new(p).is_file());
        ensure!(
            !shot.direct_upload || ready,
            "分镜原文件不可用，请重试导入任务"
        );
        let kind = if ready { "publish" } else { "render" };
        shot.labels_need_review = false;
        shot.status = if ready { "publishing" } else { "rendering" }.into();
        let job = Job::new(kind, &shot.id, shot.revision);
        if !ready {
            store::put(db, "auto_publish", &job.id, &true)?;
        }
        audit(db, &shot, "confirm_labels")?;
        store::put(
            db,
            "label_confirmation",
            &shot.id,
            &LabelConfirmation {
                shot_id: shot.id.clone(),
                revision: shot.revision,
            },
        )?;
        store::put(db, "job", &job.id, &job)?;
        store::put(db, "shot", &shot.id, &shot)?;
        Ok(shot)
    })?))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Action {
    base_revision: u64,
    action: String,
    #[serde(default)]
    fields: Vec<String>,
}
async fn action(
    State(app): State<Shared>,
    ApiPath(shot_id): ApiPath<String>,
    Json(action): Json<Action>,
) -> ApiResult<Json<Shot>> {
    Ok(Json(app.db.transaction(|db| {
        let mut shot = store::get::<Shot>(db, "shot", &shot_id)?;
        ensure!(shot.revision == action.base_revision, "revision_conflict");
        ensure!(shot.status != "deleted", "片段已删除");
        ensure!(
            !["rendering", "publishing", "tagging", "recognizing"].contains(&shot.status.as_str()),
            "片段正在处理"
        );
        let kind = match action.action.as_str() {
            "delete" => {
                delete_source_records(db, &shot.source_id)?;
                return store::get(db, "shot", &shot.id);
            }
            "reanalyze" | "reanalyze_replace" => {
                ensure!(shot.status != "rejected", "请先恢复已淘汰分镜");
                let previous_status = if shot.status == "failed" {
                    store::get::<String>(db, "reanalysis_previous_status", &shot.id).unwrap_or_else(
                        |_| {
                            if shot.published_path.is_some() {
                                "published"
                            } else if shot.direct_upload {
                                "tag_review"
                            } else if shot.output_path.is_some() {
                                "review"
                            } else {
                                "draft"
                            }
                            .into()
                        },
                    )
                } else {
                    shot.status.clone()
                };
                store::put(db, "reanalysis_previous_status", &shot.id, &previous_status)?;
                shot.status = "tagging".into();
                Some("reanalyze")
            }
            "accept_analysis" => {
                crate::label_review::accept(db, &mut shot, &action.fields)?;
                None
            }
            "dismiss_analysis" => {
                crate::label_review::dismiss(db, &shot.id)?;
                None
            }
            "recognize_products" => {
                ensure!(shot.status != "rejected", "请先恢复已淘汰分镜");
                ensure!(
                    !store::list::<Product>(db, "product")?.is_empty()
                        || !shot.product_tags.is_empty(),
                    "请先添加商品参考图与代称"
                );
                shot.status = "recognizing".into();
                Some("recognize_products")
            }
            "render" => {
                ensure!(
                    !shot.direct_upload,
                    "直接上传的分镜无需加工，请审核标签后入库"
                );
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
                ensure!(!shot.description.trim().is_empty(), "入库前请填写画面描述");
                ensure!(
                    shot.status
                        == if shot.direct_upload {
                            "tag_review"
                        } else {
                            "review"
                        }
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
                shot.status = if shot.direct_upload {
                    "tag_review"
                } else if shot.output_path.is_some() {
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
            if kind == "reanalyze" {
                store::put(
                    db,
                    "reanalysis_replace",
                    &job.id,
                    &(action.action == "reanalyze_replace"),
                )?;
            }
            if ["recognize_products", "reanalyze"].contains(&kind) {
                enqueue_analysis(db, &job, &app.home)?;
            } else {
                store::put(db, "job", &job.id, &job)?;
            }
        }
        store::put(db, "shot", &shot.id, &shot)?;
        Ok(shot)
    })?))
}
fn delete_source_records(db: &rusqlite::Connection, source_id: &str) -> Result<()> {
    let mut source = store::get::<Source>(db, "source", source_id)?;
    ensure!(source.status != "deleted", "原片已删除");
    let shots: Vec<Shot> = store::list::<Shot>(db, "shot")?
        .into_iter()
        .filter(|s| s.source_id == source_id)
        .collect();
    let mut targets = std::collections::HashSet::from([source_id.to_owned()]);
    targets.extend(shots.iter().map(|s| s.id.clone()));
    let mut jobs = store::list::<Job>(db, "job")?;
    // Publication sync jobs refer to a job ID rather than directly to a shot.
    loop {
        let before = targets.len();
        for job in &jobs {
            if targets.contains(&job.target_id) {
                targets.insert(job.id.clone());
            }
        }
        if targets.len() == before {
            break;
        }
    }
    ensure!(
        !jobs
            .iter()
            .any(|j| targets.contains(&j.target_id) && j.status == "running"),
        "素材正在处理或同步，请任务结束后再删除"
    );
    for job in &mut jobs {
        if targets.contains(&job.target_id) && ["queued", "failed"].contains(&job.status.as_str()) {
            job.status = "cancelled".into();
            job.error = None;
            job.updated_at = now();
            store::put(db, "job", &job.id, job)?;
        }
    }
    for mut shot in shots {
        if shot.status == "deleted" {
            continue;
        }
        shot.status = "deleted".into();
        shot.revision += 1;
        shot.error = None;
        shot.published_path = None;
        audit(db, &shot, "delete")?;
        store::put(db, "shot", &shot.id, &shot)?;
    }
    source.status = "deleted".into();
    source.error = None;
    store::put(db, "source", source_id, &source)
}

async fn delete_source(
    State(app): State<Shared>,
    ApiPath(source_id): ApiPath<String>,
) -> ApiResult<Json<Value>> {
    app.db
        .transaction(|db| delete_source_records(db, &source_id))?;
    Ok(Json(json!({"deleted":true})))
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
        let mut source = store::get::<Source>(db, "source", &source_id)?;
        ensure!(source.status != "deleted", "原片已删除");
        ensure!(
            !store::list::<Shot>(db, "shot")?
                .iter()
                .any(|s| s.source_id == source.id),
            "该原片已有分镜，请在分镜页修改现有片段"
        );
        ensure!(
            ["review", "failed"].contains(&source.status.as_str()),
            "请等待原片分析完成"
        );
        let shot = Shot {
            tag_evidence: vec![],
            analyzed_tags: vec![],
            labels_need_review: false,
            product_recognition_status: String::new(),
            keep_original_audio: false,
            is_featured: false,
            details: Default::default(),
            has_holiday: false,
            holiday_tags: vec![],
            product_tags: vec![],
            product_matches: vec![],
            direct_upload: false,
            id: id(),
            source_id: source.id.clone(),
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
        source.status = "review".into();
        source.error = None;
        store::put(db, "source", &source.id, &source)?;
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
            shot.status = if job.kind == "recognize_products" {
                "recognizing"
            } else if ["tag", "reanalyze"].contains(&job.kind.as_str()) {
                "tagging"
            } else if job.kind == "render" {
                "rendering"
            } else {
                "publishing"
            }
            .into();
            shot.error = None;
            store::put(db, "shot", &shot.id, &shot)?;
            if ["tag", "recognize_products", "reanalyze"].contains(&job.kind.as_str()) {
                enqueue_analysis(db, &job, &app.home)?;
            }
        }
        job.status = "queued".into();
        job.error = None;
        job.updated_at = now();
        store::put(db, "job", &job.id, &job)
    })?;
    Ok(Json(json!({"ok":true})))
}

pub fn worker(app: Shared) {
    worker_until(app, Arc::new(std::sync::atomic::AtomicBool::new(false)));
}

pub fn worker_until(
    app: Shared,
    stopped: Arc<std::sync::atomic::AtomicBool>,
) -> Vec<std::thread::JoinHandle<()>> {
    let initial = app.clone();
    let mut handles = vec![std::thread::spawn(move || {
        if let Err(error) = location::backfill(&initial) {
            eprintln!("本地文件夹同步失败: {error}");
        }
    })];
    // Separate bounded lanes keep model latency and SMB writes off the render queue.
    for kinds in [
        vec!["render"],
        vec!["archive", "publish"],
        vec!["analyze", "tag", "recognize_products", "reanalyze"],
        vec!["sync_source", "sync_release"],
    ] {
        let kinds: Vec<_> = kinds
            .into_iter()
            .filter(|kind| {
                !crate::edge::coordinator() || !crate::edge::COMPUTE_KINDS.contains(kind)
            })
            .collect();
        if kinds.is_empty() {
            continue;
        }
        let app = app.clone();
        let stopped = stopped.clone();
        handles.push(std::thread::spawn(move || {
            loop {
                if stopped.load(std::sync::atomic::Ordering::SeqCst) {
                    break;
                }
                let _storage_guard = if kinds.contains(&"sync_source") {
                    Some(app.storage_gate.lock().unwrap_or_else(|e| e.into_inner()))
                } else {
                    None
                };
                if kinds.contains(&"sync_source")
                    && !app
                        .db
                        .transaction(|db| Ok(sync_enabled(db)))
                        .unwrap_or(false)
                {
                    drop(_storage_guard);
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
                            record_failure(db, &job)?;
                            store::put(db, "job", &job.id, &job)
                        });
                        if let Err(e) = stored {
                            eprintln!("任务状态落盘失败: {e}");
                        }
                    }
                    Ok(None) => {
                        drop(_storage_guard);
                        std::thread::sleep(Duration::from_millis(200));
                    }
                    Err(e) => {
                        drop(_storage_guard);
                        eprintln!("任务队列错误: {e}");
                        std::thread::sleep(Duration::from_secs(2));
                    }
                }
            }
        }));
    }
    handles
}
pub(crate) fn record_failure(db: &rusqlite::Connection, job: &Job) -> Result<()> {
    if let Some(error) = &job.error {
        if ["analyze", "archive"].contains(&job.kind.as_str()) {
            let mut source = store::get::<Source>(db, "source", &job.target_id)?;
            source.status = "failed".into();
            source.error = Some(error.clone());
            store::put(db, "source", &source.id, &source)?;
        } else if !["sync_source", "sync_release"].contains(&job.kind.as_str()) {
            let mut shot = store::get::<Shot>(db, "shot", &job.target_id)?;
            if shot.revision == job.revision {
                shot.revision += 1;
                shot.status = "failed".into();
                shot.error = Some(error.clone());
                store::put(db, "shot", &shot.id, &shot)?;
            }
        }
    }
    Ok(())
}
fn recognize_products(
    app: &App,
    job: &Job,
    source: &Source,
    shot: &mut Shot,
    initial: bool,
) -> Result<()> {
    let products = app.db.transaction(|db| products::for_job(db, &job.id))?;
    if initial {
        shot.analyzed_tags = shot.tags.clone();
        shot.tags
            .retain(|t| !products.iter().any(|p| p.alias == *t));
    }
    if products.is_empty() {
        shot.product_recognition_status = "unconfigured".into();
        return products::apply_matches(shot, vec![]);
    }
    let config = app.db.get::<AnalysisSettings>("model_config", &job.id)?;
    let endpoint = model::current_endpoint(&app.home)?;
    ensure!(
        config.endpoint_fingerprint.as_deref() == Some(endpoint.fingerprint().as_str()),
        "模型端点配置已变化，请重试以使用当前配置"
    );
    let result = products::recognize(
        &app.media,
        source,
        shot,
        &endpoint,
        &config.model,
        &products,
    );
    shot.product_recognition_status = if result.is_err() {
        "failed"
    } else if shot.product_matches.is_empty() {
        "unmatched"
    } else {
        "matched"
    }
    .into();
    result
}

pub fn execute(app: &App, job: &Job) -> Result<()> {
    execute_job(app, job)?;
    if job.kind == "publish" {
        location::local_event(app, None, Some(&job.id))?;
    }
    Ok(())
}
fn execute_job(app: &App, job: &Job) -> Result<()> {
    match job.kind.as_str() {
        "reanalyze" => {
            let previous = app.db.get::<Shot>("shot", &job.target_id)?;
            let replace = app
                .db
                .get::<bool>("reanalysis_replace", &job.id)
                .unwrap_or(true);
            if !replace && previous.revision == job.revision + 1 && previous.status != "tagging" {
                return Ok(());
            }
            if previous.revision == job.revision + 1
                && ["draft", "tag_review"].contains(&previous.status.as_str())
            {
                return Ok(());
            }
            ensure!(
                previous.revision == job.revision && previous.status == "tagging",
                "revision_conflict"
            );
            let source = app.db.get::<Source>("source", &previous.source_id)?;
            app.media.prepare(&source)?;
            let config = app.db.get::<AnalysisSettings>("model_config", &job.id)?;
            let endpoint = model::current_endpoint(&app.home)?;
            ensure!(
                config.endpoint_fingerprint.as_deref() == Some(endpoint.fingerprint().as_str()),
                "模型端点配置已变化，请重试以使用当前配置"
            );
            let mut shot = if !replace {
                let mut proposed = previous.clone();
                proposed.product_tags.clear();
                proposed.product_matches.clear();
                model::tag_range(
                    &app.media,
                    &source,
                    &endpoint,
                    &config.model,
                    config.tag_settings.as_ref(),
                    &mut proposed,
                )?;
                proposed
            } else if previous.direct_upload {
                let mut shot = previous.clone();
                shot.keep_original_audio = false;
                shot.is_featured = false;
                shot.start_ticks = 0;
                shot.end_ticks = source.duration_ticks;
                shot.recipe = Default::default();
                shot.quality_issues.clear();
                shot.output_path = Some(source.path.clone());
                shot.output_sha256 = Some(source.sha256.clone());
                shot.product_tags.clear();
                shot.product_matches.clear();
                model::tag(
                    &app.media,
                    &source,
                    &endpoint,
                    &config.model,
                    config.tag_settings.as_ref(),
                    &mut shot,
                )?;
                shot
            } else {
                model::analyze(
                    &app.media,
                    &source,
                    &endpoint,
                    &config.model,
                    config.tag_settings.as_ref(),
                )?
            };
            shot.id = previous.id.clone();
            shot.keep_original_audio = previous.keep_original_audio;
            shot.is_featured = previous.is_featured;
            shot.created_at = previous.created_at;
            shot.revision = job.revision + 1;
            recognize_products(app, job, &source, &mut shot, true)?;
            shot.status = if shot.direct_upload {
                "tag_review"
            } else {
                "draft"
            }
            .into();
            shot.published_path = None;
            shot.error = None;
            shot.labels_need_review = false;
            app.db.transaction(|db| {
                let mut current = store::get::<Shot>(db, "shot", &shot.id)?;
                ensure!(
                    current.revision == job.revision && current.status == "tagging",
                    "revision_conflict"
                );
                if !replace {
                    current.revision += 1;
                    current.status =
                        store::get::<String>(db, "reanalysis_previous_status", &current.id)
                            .unwrap_or_else(|_| "draft".into());
                    if current.status == "failed" {
                        current.status = if current.direct_upload {
                            "tag_review"
                        } else {
                            "draft"
                        }
                        .into();
                    }
                    current.error = None;
                    store::put(
                        db,
                        "analysis_suggestion",
                        &current.id,
                        &crate::label_review::Suggestion {
                            base_revision: current.revision,
                            shot,
                        },
                    )?;
                    audit(db, &current, "analysis_suggested")?;
                    return store::put(db, "shot", &current.id, &current);
                }
                crate::label_review::dismiss(db, &shot.id)?;
                audit(db, &shot, "reanalyze")?;
                store::put(db, "shot", &shot.id, &shot)
            })
        }
        "recognize_products" => {
            let mut shot = app.db.get::<Shot>("shot", &job.target_id)?;
            if shot.revision == job.revision + 1
                && ["draft", "review", "tag_review"].contains(&shot.status.as_str())
            {
                return Ok(());
            }
            ensure!(
                shot.revision == job.revision && shot.status == "recognizing",
                "revision_conflict"
            );
            let source = app.db.get::<Source>("source", &shot.source_id)?;
            recognize_products(app, job, &source, &mut shot, false)?;
            shot.status = if shot.direct_upload {
                "tag_review"
            } else if shot.output_path.is_some() {
                "review"
            } else {
                "draft"
            }
            .into();
            shot.published_path = None;
            shot.error = None;
            shot.revision += 1;
            app.db.transaction(|db| {
                ensure!(
                    store::get::<Shot>(db, "shot", &shot.id)?.revision == job.revision,
                    "revision_conflict"
                );
                audit(db, &shot, "recognize_products")?;
                store::put(db, "shot", &shot.id, &shot)
            })
        }
        "tag" => {
            let mut shot = app.db.get::<Shot>("shot", &job.target_id)?;
            if shot.revision == job.revision + 1 && shot.status == "tag_review" {
                return Ok(());
            }
            ensure!(
                shot.direct_upload && shot.revision == job.revision && shot.status == "tagging",
                "revision_conflict"
            );
            let source = app.db.get::<Source>("source", &shot.source_id)?;
            app.media.prepare(&source)?;
            app.db.transaction(|db| {
                if sync_enabled(db) {
                    enqueue_sync(db, "sync_source", &source.id, 0)?;
                }
                Ok(())
            })?;
            let config = app.db.get::<AnalysisSettings>("model_config", &job.id)?;
            let endpoint = model::current_endpoint(&app.home)?;
            ensure!(
                config.endpoint_fingerprint.as_deref() == Some(endpoint.fingerprint().as_str()),
                "模型端点配置已变化，请重试以使用当前配置"
            );
            model::tag(
                &app.media,
                &source,
                &endpoint,
                &config.model,
                config.tag_settings.as_ref(),
                &mut shot,
            )?;
            recognize_products(app, job, &source, &mut shot, true)?;
            shot.status = "tag_review".into();
            shot.error = None;
            shot.revision += 1;
            app.db.transaction(|db| {
                let current = store::get::<Shot>(db, "shot", &shot.id)?;
                ensure!(
                    current.revision == job.revision && current.status == "tagging",
                    "revision_conflict"
                );
                store::put(db, "shot", &shot.id, &shot)
            })
        }
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
                let catalog =
                    store::get::<String>(db, "product_config", &job.id).unwrap_or_default();
                store::put(db, "product_config", &analysis.id, &catalog)?;
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
            let mut shot = model::analyze(
                &app.media,
                &source,
                &endpoint,
                &config.model,
                config.tag_settings.as_ref(),
            )?;
            recognize_products(app, job, &source, &mut shot, true)?;
            app.db.transaction(|db| {
                ensure!(
                    !store::list::<Shot>(db, "shot")?
                        .iter()
                        .any(|s| s.source_id == source.id),
                    "该原片已有分镜，请修改现有片段"
                );
                store::put(db, "shot", &shot.id, &shot)?;
                source.status = "review".into();
                source.error = None;
                store::put(db, "source", &source.id, &source)
            })
        }
        "render" => {
            let mut shot = app.db.get::<Shot>("shot", &job.target_id)?;
            let auto_publish = app.db.get::<bool>("auto_publish", &job.id).unwrap_or(false);
            let publish_id = format!("publish-{}", job.id);
            // The next job and rendered shot commit together, including after crash recovery.
            if auto_publish && app.db.get::<Job>("job", &publish_id).is_ok() {
                return Ok(());
            }
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
            shot.status = if auto_publish { "publishing" } else { "review" }.into();
            shot.revision += 1;
            app.db.transaction(|db| {
                let current = store::get::<Shot>(db, "shot", &shot.id)?;
                ensure!(current.revision == job.revision, "revision_conflict");
                if auto_publish {
                    let mut publish = Job::new("publish", &shot.id, shot.revision);
                    publish.id = publish_id;
                    store::put(db, "job", &publish.id, &publish)?;
                }
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
            ensure!(!shot.description.trim().is_empty(), "发布前请填写画面描述");
            let source = app.db.get::<Source>("source", &shot.source_id)?;
            let local_root = app.config.data_dir.join("releases");
            fs::create_dir_all(&local_root)?;
            let root = &local_root;
            let required = false;
            if shot.direct_upload {
                ensure!(
                    shot.start_ticks == 0 && shot.end_ticks == source.duration_ticks,
                    "直接上传分镜必须保留完整时长"
                );
                if !crate::edge::coordinator() {
                    app.media.prepare(&source)?;
                    app.media.verify_original(&source)?;
                } else {
                    ensure!(
                        app.media
                            .source_dir(&source.id)
                            .join("poster.jpg")
                            .is_file(),
                        "请先由本地 Worker 完成媒体准备"
                    );
                }
            }
            let extension = if shot.direct_upload {
                media_extension(&source.name)
            } else {
                "mp4".into()
            };
            let relative = format!("shots/{}/r{}/master.{extension}", shot.id, shot.revision);
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
        "sync_release" => location::copy_release(
            app,
            &job.target_id,
            &location::current(app)?.nas_root,
            app.config.require_smb,
        ),
        _ => anyhow::bail!("未知任务类型"),
    }
}

pub(crate) fn source_relative(source: &Source) -> String {
    let ext = Path::new(&source.name)
        .extension()
        .and_then(|v| v.to_str())
        .filter(|s| s.len() < 10 && s.chars().all(|c| c.is_ascii_alphanumeric()))
        .unwrap_or("bin");
    format!("sources/{}/original.{ext}", source.id)
}
pub fn media_extension(name: &str) -> String {
    Path::new(name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase()
}
pub fn media_mime(path: &Path) -> &'static str {
    match media_extension(&path.to_string_lossy()).as_str() {
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        _ => "video/mp4",
    }
}
fn sync_source(app: &App, source: &Source) -> Result<()> {
    location::copy_source(
        app,
        source,
        &location::current(app)?.nas_root,
        app.config.require_smb,
    )
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
                "original" if source.status != "deleted" => PathBuf::from(&source.path),
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
                media_mime(&path)
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
#[path = "direct_upload_tests.rs"]
mod direct_upload_tests;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn deleting_source_cascades_cancels_queue_and_preserves_history() {
        let root = tempfile::tempdir().unwrap();
        let db = Store::open(&root.path().join("delete.sqlite3")).unwrap();
        let source: Source = serde_json::from_value(json!({"id":"source","name":"clip.mp4","product":"","batch":"","sha256":"same-content","path":"original.mp4","durationTicks":120000,"width":640,"height":480,"fps":25,"colorTransfer":"bt709","rotation":0,"status":"review","createdAt":0})).unwrap();
        db.put("source", "source", &source).unwrap();
        for id in ["shot-a", "shot-b"] {
            let shot: Shot = serde_json::from_value(json!({"id":id,"sourceId":"source","revision":1,"name":"clip","startTicks":0,"endTicks":120000,"description":"","tags":[],"roles":[],"unsupportedClaims":[],"evidence":"","recipe":Recipe::default(),"status":"draft","qualityIssues":[],"analysisRunId":"","modelId":"","inputMode":"video","createdAt":0})).unwrap();
            db.put("shot", id, &shot).unwrap();
            db.put("shot_version", id, &shot).unwrap();
        }
        let mut running = Job::new("publish", "shot-a", 1);
        running.status = "running".into();
        db.put("job", &running.id, &running).unwrap();
        let sync = Job::new("sync_release", &running.id, 1);
        db.put("job", &sync.id, &sync).unwrap();
        assert!(
            db.transaction(|c| delete_source_records(c, "source"))
                .is_err()
        );
        assert_eq!(
            db.get::<Source>("source", "source").unwrap().status,
            "review"
        );
        running.status = "succeeded".into();
        db.put("job", &running.id, &running).unwrap();
        db.transaction(|c| delete_source_records(c, "source"))
            .unwrap();
        assert_eq!(
            db.get::<Source>("source", "source").unwrap().status,
            "deleted"
        );
        assert!(
            db.list::<Shot>("shot")
                .unwrap()
                .iter()
                .all(|s| s.status == "deleted" && s.revision == 2)
        );
        assert_eq!(db.get::<Job>("job", &sync.id).unwrap().status, "cancelled");
        assert_eq!(
            db.get::<Shot>("shot_version", "shot-a").unwrap().status,
            "draft"
        );
        assert!(
            db.transaction(|c| duplicate_import(c, "same-content"))
                .unwrap()
                .is_none()
        );
    }
    #[test]
    fn tag_configuration_is_snapshotted_at_enqueue_and_old_jobs_still_load() {
        let root = tempfile::tempdir().unwrap();
        let db = Store::open(&root.path().join("tags.sqlite3")).unwrap();
        let settings = crate::tag_settings::TagSettings {
            explanations: Default::default(),
            holidays: vec![],
            revision: 1,
            groups: [vec!["提问".into()], vec![], vec![], vec![]],
        };
        db.put("settings", "tags", &settings).unwrap();
        let job = Job::new("tag", "test-shot", 1);
        db.transaction(|db| enqueue_analysis(db, &job, root.path()))
            .unwrap();
        db.put(
            "settings",
            "tags",
            &crate::tag_settings::TagSettings::default(),
        )
        .unwrap();
        assert_eq!(
            db.get::<AnalysisSettings>("model_config", &job.id)
                .unwrap()
                .tag_settings,
            Some(settings)
        );
        let legacy: AnalysisSettings = serde_json::from_value(
            json!({"model":{"modelId":"test","inputMode":"video"},"endpointFingerprint":null}),
        )
        .unwrap();
        assert!(legacy.tag_settings.is_none());
    }
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
            storage_gate: std::sync::Mutex::new(()),
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
            storage_gate: std::sync::Mutex::new(()),
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
