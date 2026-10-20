use crate::{
    domain::{Job, now},
    service::App,
    store::{self, Store},
};
use anyhow::{Context, Result, ensure};
use fs2::FileExt;
use serde_json::{Value, json};
use std::{
    fs::{self, OpenOptions},
    path::PathBuf,
    process::{Command, Stdio},
};

pub fn queue(db: &rusqlite::Connection, batch: &str) -> Result<Job> {
    let id = format!("template-render-{batch}");
    if let Ok(mut job) = store::get::<Job>(db, "job", &id) {
        if !["queued", "running"].contains(&job.status.as_str()) {
            job.status = "queued".into();
            job.error = None;
            job.updated_at = now();
            store::put(db, "job", &id, &job)?;
        }
        return Ok(job);
    }
    let mut job = Job::new("template_render", batch, 0);
    job.id = id;
    store::put(db, "job", &job.id, &job)?;
    Ok(job)
}

pub fn enqueue(db: &Store, id: &str) -> Result<Value> {
    db.transaction(|db| {
        let batch: Value = store::get(db, "template_production", id)?;
        ensure!(batch["cancelled"] != true, "resume the paused batch first");
        Ok(json!(queue(db, id)?))
    })
}

pub fn job(db: &rusqlite::Connection, id: &str) -> Result<Option<Job>> {
    Ok(store::list::<Job>(db, "job")?
        .into_iter()
        .find(|j| j.id == format!("template-render-{id}")))
}

pub fn run(app: &App, id: &str) -> Result<()> {
    ensure!(super::model::valid_id(id), "invalid batch ID");
    let directory = super::api::root(app).join("production");
    fs::create_dir_all(&directory)?;
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(directory.join("renderer.lock"))?;
    // The adapter inherits the locked file as stdin. On Unix the open-file lock
    // survives service termination until the existing adapter actually exits.
    lock.lock_exclusive()
        .context("cannot lock template renderer")?;
    let batch = super::production::read(&app.db, id)?;
    if batch["cancelled"] == true || batch["summary"]["published"] == batch["summary"]["total"] {
        return Ok(());
    }
    let repository = std::env::var_os("MOIRAI_TEMPLATE_REPOSITORY")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.."));
    let adapter = repository.join("apps/mcp/src/template-production.mjs");
    ensure!(
        adapter.is_file(),
        "template renderer adapter missing; set MOIRAI_TEMPLATE_REPOSITORY"
    );
    let local_bun = app
        .home
        .join(".local/share/moirai-cut/bin")
        .join(if cfg!(windows) { "bun.exe" } else { "bun" });
    let runtime = std::env::var_os("MOIRAI_JS_RUNTIME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            if local_bun.is_file() {
                local_bun
            } else {
                PathBuf::from("bun")
            }
        });
    let log_path = directory.join(format!("{id}-renderer.log"));
    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)?;
    let status = Command::new(runtime)
        .arg(adapter)
        .arg("--worker-batch")
        .arg(id)
        .current_dir(repository)
        .env("MOIRAI_TEMPLATE_WORKER", "1")
        .stdin(Stdio::from(lock.try_clone()?))
        .stdout(Stdio::from(log.try_clone()?))
        .stderr(Stdio::from(log))
        .status()
        .with_context(|| {
            format!(
                "cannot launch template renderer; log: {}",
                log_path.display()
            )
        })?;
    ensure!(
        status.success(),
        "template renderer failed ({status}); log: {}",
        log_path.display()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn repeated_dispatch_preserves_live_job_and_paused_batch_is_refused() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        db.put("template_production", "batch", &json!({"cancelled":false}))
            .unwrap();
        let first = enqueue(&db, "batch").unwrap();
        assert_eq!(first, enqueue(&db, "batch").unwrap());
        let running = db.claim_kinds(&["template_render"]).unwrap().unwrap();
        assert_eq!(enqueue(&db, "batch").unwrap()["status"], "running");
        assert_eq!(enqueue(&db, "batch").unwrap()["attempt"], 1);
        let mut failed = running;
        failed.status = "failed".into();
        failed.error = Some("encoder failed".into());
        db.put("job", &failed.id, &failed).unwrap();
        let retry = enqueue(&db, "batch").unwrap();
        assert_eq!(retry["status"], "queued");
        assert!(retry["error"].is_null());
        db.put("template_production", "batch", &json!({"cancelled":true}))
            .unwrap();
        assert!(enqueue(&db, "batch").is_err());
        assert!(enqueue(&db, "unknown").is_err());
    }
    #[cfg(unix)]
    #[test]
    fn adapter_inherits_lock_until_process_exit() {
        let dir = tempfile::tempdir().unwrap();
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(dir.path().join("lock"))
            .unwrap();
        file.lock_exclusive().unwrap();
        let mut child = Command::new("sleep")
            .arg("30")
            .stdin(Stdio::from(file.try_clone().unwrap()))
            .spawn()
            .unwrap();
        drop(file);
        let contender = OpenOptions::new()
            .read(true)
            .write(true)
            .open(dir.path().join("lock"))
            .unwrap();
        let held = contender.try_lock_exclusive().is_err();
        child.kill().unwrap();
        child.wait().unwrap();
        assert!(held, "service exit must not release the live adapter lock");
        contender.try_lock_exclusive().unwrap();
    }
}
