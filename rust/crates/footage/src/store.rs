use crate::domain::Job;
use anyhow::{Context, Result};
use rusqlite::{Connection, params};
use serde::{Serialize, de::DeserializeOwned};
use std::{path::Path, sync::Mutex};

pub struct Store(pub Mutex<Connection>);

impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let db = Connection::open(path)?;
        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
            CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(kind,id));")?;
        Ok(Self(Mutex::new(db)))
    }
    pub fn transaction<T>(&self, action: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        let mut conn = self
            .0
            .lock()
            .map_err(|_| anyhow::anyhow!("数据库锁不可用"))?;
        let tx = conn.transaction()?;
        let result = action(&tx)?;
        tx.commit()?;
        Ok(result)
    }
    pub fn get<T: DeserializeOwned>(&self, kind: &str, id: &str) -> Result<T> {
        self.transaction(|db| get(db, kind, id))
    }
    pub fn list<T: DeserializeOwned>(&self, kind: &str) -> Result<Vec<T>> {
        self.transaction(|db| list(db, kind))
    }
    pub fn put<T: Serialize>(&self, kind: &str, id: &str, value: &T) -> Result<()> {
        self.transaction(|db| put(db, kind, id, value))
    }
    pub fn recover(&self) -> Result<()> {
        self.transaction(|db| {
            for mut job in list::<Job>(db, "job")? {
                if job.status == "running" {
                    job.status = "queued".into();
                    put(db, "job", &job.id, &job)?;
                }
            }
            Ok(())
        })
    }
    pub fn claim(&self) -> Result<Option<Job>> {
        self.claim_kinds(&[])
    }
    pub fn claim_kinds(&self, kinds: &[&str]) -> Result<Option<Job>> {
        self.transaction(|db| {
            let mut jobs = list::<Job>(db, "job")?;
            jobs.sort_by_key(|j| {
                (
                    if j.kind == "publish" { 0 } else { 1 },
                    j.created_at,
                    j.id.clone(),
                )
            });
            if let Some(mut job) = jobs.into_iter().find(|j| {
                j.status == "queued" && (kinds.is_empty() || kinds.contains(&j.kind.as_str()))
            }) {
                job.status = "running".into();
                job.attempt += 1;
                job.updated_at = crate::domain::now();
                put(db, "job", &job.id, &job)?;
                Ok(Some(job))
            } else {
                Ok(None)
            }
        })
    }
}
pub fn get<T: DeserializeOwned>(db: &Connection, kind: &str, id: &str) -> Result<T> {
    let body: String = db
        .query_row(
            "SELECT body FROM records WHERE kind=?1 AND id=?2",
            params![kind, id],
            |r| r.get(0),
        )
        .context("记录不存在")?;
    Ok(serde_json::from_str(&body)?)
}
pub fn list<T: DeserializeOwned>(db: &Connection, kind: &str) -> Result<Vec<T>> {
    let mut stmt = db.prepare("SELECT body FROM records WHERE kind=?1 ORDER BY rowid DESC")?;
    let rows = stmt.query_map([kind], |r| r.get::<_, String>(0))?;
    let mut result = Vec::new();
    for row in rows {
        result.push(serde_json::from_str(&row?)?);
    }
    Ok(result)
}
pub fn put<T: Serialize>(db: &Connection, kind: &str, id: &str, value: &T) -> Result<()> {
    if kind == "shot" {
        // Backfill the previous version before replacing old installations' records.
        if let Ok(previous) = get::<serde_json::Value>(db, kind, id) {
            save_shot_version(db, id, &previous)?;
        }
        save_shot_version(db, id, &serde_json::to_value(value)?)?;
    }
    db.execute("INSERT INTO records(kind,id,body) VALUES(?1,?2,?3) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body", params![kind,id,serde_json::to_string(value)?])?;
    Ok(())
}

fn save_shot_version(db: &Connection, id: &str, value: &serde_json::Value) -> Result<()> {
    let revision = value["revision"].as_u64().context("分镜版本无效")?;
    db.execute(
        "INSERT OR IGNORE INTO records(kind,id,body) VALUES('shot_version',?1,?2)",
        params![format!("{id}-r{revision}"), serde_json::to_string(value)?],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn slow_analysis_does_not_occupy_render_or_archive_lanes() {
        let db = Store::open(Path::new(":memory:")).unwrap();
        for kind in ["analyze", "archive", "render", "publish"] {
            let job = Job::new(kind, kind, 1);
            db.put("job", &job.id, &job).unwrap();
        }
        assert_eq!(
            db.claim_kinds(&["analyze"]).unwrap().unwrap().kind,
            "analyze"
        );
        assert_eq!(db.claim_kinds(&["render"]).unwrap().unwrap().kind, "render");
        assert_eq!(
            db.claim_kinds(&["archive", "publish"])
                .unwrap()
                .unwrap()
                .kind,
            "publish"
        );
        assert!(db.claim_kinds(&["render"]).unwrap().is_none());
        assert_eq!(
            db.claim_kinds(&["archive", "publish"])
                .unwrap()
                .unwrap()
                .kind,
            "archive"
        );
    }
    #[test]
    fn shot_versions_survive_later_edits() {
        let db = Store::open(Path::new(":memory:")).unwrap();
        db.put(
            "shot",
            "a",
            &serde_json::json!({"id":"a","revision":1,"description":"first"}),
        )
        .unwrap();
        db.put(
            "shot",
            "a",
            &serde_json::json!({"id":"a","revision":2,"description":"edited"}),
        )
        .unwrap();
        assert_eq!(
            db.get::<serde_json::Value>("shot_version", "a-r1").unwrap()["description"],
            "first"
        );
        assert_eq!(
            db.get::<serde_json::Value>("shot", "a").unwrap()["description"],
            "edited"
        );
    }
    #[test]
    fn claim_is_exclusive_and_restart_recovers_running_work() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("library.sqlite3");
        let db = Store::open(&path).unwrap();
        let job = Job::new("archive", "source", 0);
        db.put("job", &job.id, &job).unwrap();
        assert_eq!(db.claim().unwrap().unwrap().attempt, 1);
        assert!(db.claim().unwrap().is_none());
        drop(db);
        let db = Store::open(&path).unwrap();
        db.recover().unwrap();
        assert_eq!(db.claim().unwrap().unwrap().attempt, 2);
    }
    #[test]
    fn failed_transaction_does_not_publish_partial_records() {
        let dir = tempfile::tempdir().unwrap();
        let db = Store::open(&dir.path().join("library.sqlite3")).unwrap();
        let result: Result<()> = db.transaction(|conn| {
            put(conn, "test", "one", &"value")?;
            anyhow::bail!("interrupted")
        });
        assert!(result.is_err());
        assert!(db.list::<String>("test").unwrap().is_empty());
    }
}
