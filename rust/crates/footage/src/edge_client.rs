use crate::{
    edge::{self, Asset, Claim, Finish, Heartbeat, Packet, Record},
    media::Media,
    model,
    service::{ApiError, App, Config},
    storage,
    store::Store,
};
use anyhow::{Context, Result, ensure};
use axum::{
    Router,
    body::Body,
    extract::{Request, State},
    response::Response,
};
use fs2::FileExt;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    fs,
    io::{Read, Seek, Write},
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tokio::io::AsyncWriteExt;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EdgeConfig {
    pub server_url: String,
    pub server_token_file: PathBuf,
    pub data_dir: PathBuf,
    pub worker_id: String,
    pub port: u16,
    pub ffmpeg: String,
    pub ffprobe: String,
}
struct Client {
    config: EdgeConfig,
    token: String,
    home: PathBuf,
    status: Mutex<Value>,
}
struct TemporaryUpload(PathBuf);
impl Drop for TemporaryUpload {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}
fn server_token(c: &Client) -> Result<String> {
    Ok(fs::read_to_string(&c.config.server_token_file)?
        .trim()
        .into())
}
fn http_client() -> Result<reqwest::blocking::Client> {
    Ok(reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(120))
        .redirect(reqwest::redirect::Policy::none())
        .build()?)
}
fn request(
    c: &Client,
    http: &reqwest::blocking::Client,
    method: reqwest::Method,
    path: &str,
    library: &str,
) -> Result<reqwest::blocking::RequestBuilder> {
    Ok(http
        .request(
            method,
            format!("{}{}", c.config.server_url.trim_end_matches('/'), path),
        )
        .header("x-footage-token", server_token(c)?)
        .header("x-footage-library", library))
}
fn response(response: reqwest::blocking::Response) -> Result<Value> {
    let status = response.status();
    let value: Value = response.json()?;
    ensure!(
        status.is_success(),
        "团队接口 {}: {}",
        status,
        value.get("error").unwrap_or(&Value::Null)
    );
    Ok(value)
}
fn status(c: &Client, stage: &str, job: Option<&str>) {
    if let Ok(mut s) = c.status.lock() {
        *s = json!({"workerId":c.config.worker_id,"stage":stage,"jobId":job,"updatedAt":crate::domain::now()});
    }
}

pub async fn run(config_path: PathBuf) -> Result<()> {
    let config: EdgeConfig = serde_json::from_slice(&fs::read(config_path)?)?;
    let url = reqwest::Url::parse(&config.server_url)?;
    ensure!(
        url.username().is_empty()
            && url.password().is_none()
            && url.query().is_none()
            && url.fragment().is_none(),
        "团队服务 URL 不能包含凭据或查询参数"
    );
    ensure!(
        url.scheme() == "https"
            || (url.scheme() == "http"
                && matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"))),
        "团队连接需要 HTTPS 或本机加密隧道"
    );
    ensure!(
        uuid::Uuid::parse_str(&config.worker_id).is_ok(),
        "Worker ID 必须是 UUID"
    );
    fs::create_dir_all(&config.data_dir)?;
    storage::verify_database_volume(&config.data_dir)?;
    let lock = fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(config.data_dir.join("edge.lock"))?;
    lock.try_lock_exclusive().context("本地 Worker 已启动")?;
    let token_path = config.data_dir.join("service-token");
    if !token_path.exists() {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        options
            .open(&token_path)?
            .write_all(format!("{}{}", crate::domain::id(), crate::domain::id()).as_bytes())?;
    }
    let client = Arc::new(Client {
        token: fs::read_to_string(token_path)?.trim().into(),
        home: PathBuf::from(std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE"))?),
        config,
        status: Mutex::new(json!({"stage":"starting"})),
    });
    let listener =
        tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, client.config.port)).await?;
    let worker = client.clone();
    std::thread::spawn(move || worker_loop(worker));
    println!(
        "Moirai edge gateway: http://127.0.0.1:{}",
        client.config.port
    );
    axum::serve(listener, Router::new().fallback(gateway).with_state(client)).await?;
    drop(lock);
    Ok(())
}
async fn gateway(State(c): State<Arc<Client>>, request: Request) -> Result<Response, ApiError> {
    if request
        .headers()
        .get("x-footage-token")
        .and_then(|h| h.to_str().ok())
        != Some(c.token.as_str())
    {
        return Ok(Response::builder().status(401).body(Body::empty())?);
    }
    let path = request.uri().path().to_owned();
    if let Some((id, operation)) = preview_route(&path) {
        if request.method() != reqwest::Method::POST {
            return Err(anyhow::anyhow!("预览接口需要 POST").into());
        }
        let id = id.to_owned();
        let operation = operation.to_owned();
        let library = request
            .headers()
            .get("x-footage-library")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_owned();
        if library.is_empty() {
            return Err(anyhow::anyhow!("团队预览需要素材库标识").into());
        }
        let bytes = axum::body::to_bytes(request.into_body(), 4 * 1024 * 1024).await?;
        let value = tokio::task::spawn_blocking(move || {
            local_preview(&c, &library, &id, &operation, &bytes)
        })
        .await??;
        return Ok(Response::builder()
            .header("content-type", "application/json")
            .header("x-moirai-preview-compute", "local")
            .body(Body::from(serde_json::to_vec(&value)?))?);
    }
    if path == "/models" {
        let home = c.home.clone();
        let value =
            tokio::task::spawn_blocking(move || model::models(&model::current_endpoint(&home)?))
                .await??;
        return Ok(Response::builder()
            .header("content-type", "application/json")
            .body(Body::from(json!({"models":value}).to_string()))?);
    }
    if path == "/edge/status" {
        let value = c.status.lock().map(|v| v.clone()).unwrap_or(json!({}));
        return Ok(Response::builder()
            .header("content-type", "application/json")
            .body(Body::from(value.to_string()))?);
    }
    let target = format!(
        "{}{}",
        c.config.server_url.trim_end_matches('/'),
        request
            .uri()
            .path_and_query()
            .map(|p| p.as_str())
            .unwrap_or("/")
    );
    let (parts, body) = request.into_parts();
    let http = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()?;
    let mut outgoing = http
        .request(parts.method.clone(), &target)
        .header("x-footage-token", server_token(&c)?);
    for key in ["content-type", "range", "x-footage-library"] {
        if let Some(value) = parts.headers.get(key) {
            outgoing = outgoing.header(key, value);
        }
    }
    if path == "/imports" && parts.method == "POST" {
        let dir = c.config.data_dir.join("objects");
        tokio::fs::create_dir_all(&dir).await?;
        let temp = dir.join(format!("{}.upload", crate::domain::id()));
        let _cleanup = TemporaryUpload(temp.clone());
        let mut file = tokio::fs::File::create(&temp).await?;
        let mut stream = body.into_data_stream();
        let mut size = 0u64;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            size += chunk.len() as u64;
            if size > 20 * 1024 * 1024 * 1024 {
                return Err(anyhow::anyhow!("单文件不能超过 20 GB").into());
            }
            file.write_all(&chunk).await?;
        }
        file.sync_all().await?;
        drop(file);
        let input = temp.clone();
        let sha = tokio::task::spawn_blocking(move || storage::hash(&input)).await??;
        let cached = dir.join(&sha);
        tokio::fs::rename(&temp, &cached).await?;
        outgoing = outgoing
            .header("x-footage-worker", &c.config.worker_id)
            .body(reqwest::Body::wrap_stream(
                tokio_util::io::ReaderStream::new(tokio::fs::File::open(cached).await?),
            ));
    } else {
        outgoing = outgoing.body(reqwest::Body::wrap_stream(body.into_data_stream()));
    }
    let remote = outgoing.send().await?;
    if path == "/state" && remote.status().is_success() {
        let mut value: Value = remote.json().await?;
        let endpoint = model::current_endpoint(&c.home);
        value["runtime"]["endpoint"] = json!(endpoint.as_ref().ok().map(|e| &e.base_url));
        value["runtime"]["endpointError"] = json!(endpoint.err().map(|e| e.to_string()));
        value["runtime"]["computeLocation"] = json!("local");
        value["runtime"]["worker"] = c.status.lock().map(|s| s.clone()).unwrap_or(Value::Null);
        return Ok(Response::builder()
            .header("content-type", "application/json")
            .header("cache-control", "private, no-store")
            .body(Body::from(value.to_string()))?);
    }
    let mut builder = Response::builder().status(remote.status().as_u16());
    for key in [
        "content-type",
        "content-length",
        "content-range",
        "accept-ranges",
    ] {
        if let Some(value) = remote.headers().get(key) {
            builder = builder.header(key, value);
        }
    }
    Ok(builder
        .header("cache-control", "private, no-store")
        .body(Body::from_stream(remote.bytes_stream()))?)
}
fn preview_route(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix("/shots/")?;
    let (id, operation) = rest.split_once('/')?;
    if uuid::Uuid::parse_str(id).is_ok()
        && matches!(
            operation,
            "preview-plan" | "preview-lut" | "preview-exposure"
        )
    {
        Some((id, operation))
    } else {
        None
    }
}

fn local_preview(
    c: &Client,
    library: &str,
    id: &str,
    operation: &str,
    bytes: &[u8],
) -> Result<Value> {
    let http = http_client()?;
    let state = response(request(c, &http, reqwest::Method::GET, "/state", library)?.send()?)?;
    let shot = state["shots"]
        .as_array()
        .context("团队分镜数据无效")?
        .iter()
        .find(|s| s["id"].as_str() == Some(id))
        .context("分镜不存在或已删除")?;
    ensure!(shot["directUpload"] != true, "直接上传分镜不进行画面加工");
    let mut source = state["sources"]
        .as_array()
        .context("团队原片数据无效")?
        .iter()
        .find(|s| s["id"] == shot["sourceId"])
        .context("原片不存在或已删除")?
        .clone();
    source["path"] = json!("");
    let mut source: crate::domain::Source = serde_json::from_value(source)?;
    if operation == "preview-plan" {
        return crate::preview::calculate_plan(&source, serde_json::from_slice(bytes)?);
    }
    let input: crate::preview::RangeInput = serde_json::from_slice(bytes)?;
    crate::domain::validate_range(input.start_ticks, input.end_ticks, source.duration_ticks)?;
    ensure!(
        source.sha256.len() == 64 && source.sha256.bytes().all(|b| b.is_ascii_hexdigit()),
        "原片校验码无效"
    );
    ensure!(uuid::Uuid::parse_str(&source.id).is_ok(), "原片标识无效");
    let root = c.config.data_dir.join("preview");
    let objects = c.config.data_dir.join("objects");
    fs::create_dir_all(&objects)?;
    fs::create_dir_all(&root)?;
    let lock = fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(root.join(format!("{}.lock", source.sha256)))?;
    lock.lock_exclusive()?;
    let cached = objects.join(&source.sha256);
    if !cached.is_file() || storage::hash(&cached)? != source.sha256 {
        let temp = objects.join(format!("{}.preview-{}", source.sha256, crate::domain::id()));
        let _cleanup = TemporaryUpload(temp.clone());
        let remote = request(
            c,
            &http,
            reqwest::Method::GET,
            &format!("/media/source/{}/original", source.id),
            library,
        )?
        .send()?;
        ensure!(
            remote.status().is_success(),
            "下载预览原片失败 {}；请确认团队服务已更新",
            remote.status()
        );
        let mut output = fs::File::create(&temp)?;
        let limit = 20 * 1024 * 1024 * 1024u64;
        let size = std::io::copy(&mut remote.take(limit + 1), &mut output)?;
        output.sync_all()?;
        drop(output);
        ensure!(
            size <= limit && storage::hash(&temp)? == source.sha256,
            "预览原片校验失败"
        );
        if cached.exists() {
            fs::remove_file(&cached)?;
        }
        fs::rename(&temp, &cached)?;
    }
    source.path = cached.to_string_lossy().into_owned();
    let media = Media {
        root,
        ffmpeg: c.config.ffmpeg.clone(),
        ffprobe: c.config.ffprobe.clone(),
    };
    match operation {
        "preview-lut" => serde_json::to_value(
            media
                .adaptive_lut(&source, input.start_ticks, input.end_ticks)
                .context("本机 AI 调色预览失败，请检查当前电脑的调色模型环境")?,
        )
        .map_err(Into::into),
        "preview-exposure" => {
            Ok(json!({"brightness":media.exposure(&source, input.start_ticks, input.end_ticks)?}))
        }
        _ => anyhow::bail!("未知预览操作"),
    }
}

fn worker_loop(c: Arc<Client>) {
    loop {
        let result = (|| -> Result<bool> {
            let http = http_client()?;
            let state = response(request(&c, &http, reqwest::Method::GET, "/state", "")?.send()?)?;
            let library = state["libraryId"].as_str().context("团队素材库未就绪")?;
            let value = response(
                request(&c, &http, reqwest::Method::POST, "/edge/claim", library)?
                    .json(&Claim {
                        worker_id: c.config.worker_id.clone(),
                    })
                    .send()?,
            )?;
            if value.is_null() {
                status(&c, "idle", None);
                return Ok(false);
            }
            let packet: Packet = serde_json::from_value(value)?;
            process(&c, &http, library, packet)?;
            Ok(true)
        })();
        match result {
            Ok(true) => (),
            Ok(false) => std::thread::sleep(Duration::from_secs(2)),
            Err(error) => {
                status(&c, "disconnected_or_failed", None);
                eprintln!("Edge worker: {error:#}");
                std::thread::sleep(Duration::from_secs(5));
            }
        }
    }
}
fn obtain(
    c: &Client,
    http: &reqwest::blocking::Client,
    library: &str,
    packet: &Packet,
    asset: &Asset,
) -> Result<PathBuf> {
    let dir = c.config.data_dir.join("objects");
    fs::create_dir_all(&dir)?;
    let cached = dir.join(&asset.sha256);
    if cached.is_file()
        && fs::metadata(&cached)?.len() == asset.size
        && storage::hash(&cached)? == asset.sha256
    {
        return Ok(cached);
    }
    let temp = dir.join(format!("{}.part", asset.sha256));
    let offset = fs::metadata(&temp).map(|m| m.len()).unwrap_or(0);
    if offset > asset.size {
        fs::remove_file(&temp)?;
    }
    let offset = fs::metadata(&temp).map(|m| m.len()).unwrap_or(0);
    let remote = request(
        c,
        http,
        reqwest::Method::GET,
        &format!(
            "/edge/jobs/{}/files/{}?offset={offset}",
            packet.job.id, asset.sha256
        ),
        library,
    )?
    .header("x-edge-lease", &packet.lease)
    .send()?;
    ensure!(
        remote.status().is_success(),
        "获取原片失败 {}",
        remote.status()
    );
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&temp)?;
    let mut limited = remote.take(asset.size - offset + 1);
    std::io::copy(&mut limited, &mut file)?;
    file.sync_all()?;
    drop(file);
    if fs::metadata(&temp)?.len() != asset.size || storage::hash(&temp)? != asset.sha256 {
        fs::remove_file(&temp)?;
        anyhow::bail!("下载文件校验失败");
    }
    fs::rename(temp, &cached)?;
    Ok(cached)
}
fn upload(
    c: &Client,
    http: &reqwest::blocking::Client,
    library: &str,
    asset: &Asset,
    path: &Path,
) -> Result<()> {
    let value = response(
        request(
            c,
            http,
            reqwest::Method::GET,
            &format!("/edge/blobs/{}", asset.sha256),
            library,
        )?
        .send()?,
    )?;
    let mut offset = value["offset"].as_u64().context("无效上传偏移")?;
    ensure!(offset <= asset.size, "远端缓存大小不匹配");
    let mut file = fs::File::open(path)?;
    file.seek(std::io::SeekFrom::Start(offset))?;
    let mut buffer = vec![0; 4 * 1024 * 1024];
    while offset < asset.size {
        let size = file.read(&mut buffer)?;
        ensure!(size > 0, "本地媒体提前结束");
        let value = response(
            request(
                c,
                http,
                reqwest::Method::PUT,
                &format!("/edge/blobs/{}?offset={offset}", asset.sha256),
                library,
            )?
            .body(buffer[..size].to_vec())
            .send()?,
        )?;
        offset += size as u64;
        ensure!(value["offset"].as_u64() == Some(offset), "上传偏移冲突");
    }
    Ok(())
}
fn wire_relative(path: &Path) -> Result<String> {
    path.components()
        .map(|part| match part {
            std::path::Component::Normal(value) => value
                .to_str()
                .map(str::to_owned)
                .context("媒体路径必须是 UTF-8"),
            _ => anyhow::bail!("媒体路径必须在本地素材目录中"),
        })
        .collect::<Result<Vec<_>>>()
        .map(|parts| parts.join("/"))
}

fn encode_paths(value: &mut Value, root: &Path) -> Result<()> {
    match value {
        Value::String(text) => {
            if let Ok(relative) = Path::new(text).strip_prefix(root) {
                *text = format!("{}/{}", edge::LOGICAL_ROOT, wire_relative(relative)?);
            }
        }
        Value::Array(values) => {
            for value in values {
                encode_paths(value, root)?;
            }
        }
        Value::Object(values) => {
            for value in values.values_mut() {
                encode_paths(value, root)?;
            }
        }
        _ => (),
    }
    Ok(())
}

fn collect(root: &Path, dir: &Path, result: &mut Vec<Asset>) -> Result<()> {
    if !dir.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let ty = entry.file_type()?;
        if ty.is_dir() {
            collect(root, &path, result)?;
        } else if ty.is_file() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if ![
                "preview.mp4",
                "poster.jpg",
                "master.mp4",
                "render.json",
                "color.cube",
            ]
            .contains(&name.as_ref())
            {
                continue;
            }
            result.push(Asset {
                path: wire_relative(path.strip_prefix(root)?)?,
                sha256: storage::hash(&path)?,
                size: fs::metadata(&path)?.len(),
            });
        }
    }
    Ok(())
}
fn process(
    c: &Arc<Client>,
    http: &reqwest::blocking::Client,
    library: &str,
    packet: Packet,
) -> Result<()> {
    let stop = Arc::new(AtomicBool::new(false));
    let lost = Arc::new(AtomicBool::new(false));
    let beat_c = c.clone();
    let beat_stop = stop.clone();
    let beat_lost = lost.clone();
    let beat_packet = packet.clone();
    let beat_library = library.to_owned();
    let heartbeat = std::thread::spawn(move || {
        while !beat_stop.load(Ordering::SeqCst) {
            for _ in 0..15 {
                if beat_stop.load(Ordering::SeqCst) {
                    return;
                }
                std::thread::sleep(Duration::from_secs(1));
            }
            let result = (|| -> Result<()> {
                let http = http_client()?;
                response(
                    request(
                        &beat_c,
                        &http,
                        reqwest::Method::POST,
                        &format!("/edge/jobs/{}/heartbeat", beat_packet.job.id),
                        &beat_library,
                    )?
                    .json(&Heartbeat {
                        lease: beat_packet.lease.clone(),
                    })
                    .send()?,
                )?;
                Ok(())
            })();
            if result.is_err() {
                beat_lost.store(true, Ordering::SeqCst);
                return;
            }
        }
    });
    let result = (|| -> Result<()> {
        status(c, "downloading", Some(&packet.job.id));
        let root = c.config.data_dir.join("work").join(&packet.lease);
        fs::create_dir_all(&root)?;
        for asset in &packet.files {
            let cached = obtain(c, http, library, &packet, asset)?;
            let target = edge::safe_path(&root, &asset.path)?;
            fs::create_dir_all(target.parent().unwrap())?;
            fs::copy(cached, target)?;
        }
        let db = Store::open(&root.join("library.sqlite3"))?;
        let fingerprint = model::current_endpoint(&c.home)
            .ok()
            .map(|e| e.fingerprint());
        for record in &packet.records {
            let mut value = record.value.clone();
            crate::libraries::rebase(&mut value, Path::new(edge::LOGICAL_ROOT), &root);
            if record.kind == "model_config" {
                value["endpointFingerprint"] = json!(fingerprint);
            }
            db.put(&record.kind, &record.id, &value)?;
        }
        let before = db.transaction(edge::rows)?;
        let app = App {
            storage_gate: Mutex::new(()),
            media: Media {
                root: root.clone(),
                ffmpeg: c.config.ffmpeg.clone(),
                ffprobe: c.config.ffprobe.clone(),
            },
            config: Config {
                data_dir: root.clone(),
                nas_root: PathBuf::new(),
                require_smb: false,
                ffmpeg: c.config.ffmpeg.clone(),
                ffprobe: c.config.ffprobe.clone(),
                port: 0,
            },
            db,
            home: c.home.clone(),
            token: String::new(),
        };
        status(c, "computing", Some(&packet.job.id));
        let error = crate::service::execute(&app, &packet.job)
            .err()
            .map(|e| e.to_string());
        let mut records = if error.is_none() {
            app.db
                .transaction(edge::rows)?
                .into_iter()
                .filter(|r| r.kind != "shot_version" && !before.contains(r))
                .collect::<Vec<Record>>()
        } else {
            vec![]
        };
        for r in &mut records {
            encode_paths(&mut r.value, &root)?;
        }
        let mut files = vec![];
        collect(&root, &root.join("sources"), &mut files)?;
        collect(&root, &root.join("shots"), &mut files)?;
        ensure!(
            !lost.load(Ordering::SeqCst),
            "任务租约已失效，结果保留在本地"
        );
        status(c, "uploading", Some(&packet.job.id));
        for asset in &files {
            upload(
                c,
                http,
                library,
                asset,
                &edge::safe_path(&root, &asset.path)?,
            )?;
        }
        let finish = Finish {
            lease: packet.lease.clone(),
            records,
            files,
            error,
        };
        fs::write(root.join("completion.json"), serde_json::to_vec(&finish)?)?;
        ensure!(
            !lost.load(Ordering::SeqCst),
            "任务租约已失效，结果保留在本地"
        );
        let mut acknowledged = false;
        for attempt in 0..3 {
            match request(
                c,
                http,
                reqwest::Method::POST,
                &format!("/edge/jobs/{}/finish", packet.job.id),
                library,
            )?
            .json(&finish)
            .send()
            {
                Ok(remote) if remote.status().is_success() => {
                    response(remote)?;
                    acknowledged = true;
                    break;
                }
                Ok(remote) if remote.status().is_client_error() => {
                    response(remote)?;
                }
                _ => std::thread::sleep(Duration::from_secs(1 << attempt)),
            }
        }
        ensure!(acknowledged, "结果提交未确认，保留本地结果等待重试");
        drop(app);
        fs::remove_dir_all(root)?;
        status(c, "idle", None);
        Ok(())
    })();
    stop.store(true, Ordering::SeqCst);
    let _ = heartbeat.join();
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_paths_use_posix_components_on_the_wire() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path();
        let relative = PathBuf::from("sources").join("source").join("original.mp4");
        let mut record = json!({"path":root.join(&relative),"nested":[{"output":root.join("shots").join("shot").join("r1").join("master.mp4")}],"description":"human text"});
        encode_paths(&mut record, root).unwrap();
        assert_eq!(
            wire_relative(&relative).unwrap(),
            "sources/source/original.mp4"
        );
        assert_eq!(
            record["path"],
            "/__moirai_edge__/sources/source/original.mp4"
        );
        assert_eq!(
            record["nested"][0]["output"],
            "/__moirai_edge__/shots/shot/r1/master.mp4"
        );
        assert_eq!(record["description"], "human text");
        assert!(wire_relative(Path::new("../escape")).is_err());
        crate::libraries::rebase(&mut record, Path::new(edge::LOGICAL_ROOT), root);
        assert_eq!(
            PathBuf::from(record["path"].as_str().unwrap()),
            root.join(relative)
        );
    }
}
