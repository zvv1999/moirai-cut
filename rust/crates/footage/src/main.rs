use anyhow::{Context, Result};
use fs2::FileExt;
use moirai_footage::{
    media::Media,
    service::{self, App, Config},
    store::Store,
};
use std::{fs, path::PathBuf, sync::Arc};

#[tokio::main]
async fn main() -> Result<()> {
    let home = PathBuf::from(
        std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .context("HOME / USERPROFILE 未设置")?,
    );
    let config_path = std::env::var_os("MOIRAI_FOOTAGE_CONFIG")
        .map(PathBuf::from)
        .unwrap_or(home.join(".moirai-cut/footage-runtime.json"));
    let config: Config = serde_json::from_slice(
        &fs::read(&config_path).with_context(|| format!("请先配置 {}", config_path.display()))?,
    )?;
    fs::create_dir_all(&config.data_dir)?;
    let lock = fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(config.data_dir.join("service.lock"))?;
    lock.try_lock_exclusive()
        .context("已有素材库服务运行，请勿重复启动")?;
    let token_path = config.data_dir.join("service-token");
    let token = if token_path.exists() {
        fs::read_to_string(&token_path)?
    } else {
        let token = format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        use std::io::Write;
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&token_path)?;
        file.write_all(token.as_bytes())?;
        token
    };
    let db = Store::open(&config.data_dir.join("library.sqlite3"))?;
    db.recover()?;
    let media = Media {
        ffmpeg: config.ffmpeg.clone(),
        ffprobe: config.ffprobe.clone(),
        root: config.data_dir.clone(),
    };
    let port = config.port;
    let app = Arc::new(App {
        db,
        config,
        media,
        home,
        token,
    });
    moirai_footage::lineage::cache_legacy_releases(&app)?;
    service::worker(app.clone());
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).await?;
    println!("Moirai footage service: http://127.0.0.1:{port}");
    axum::serve(listener, service::router(app)).await?;
    drop(lock);
    Ok(())
}
