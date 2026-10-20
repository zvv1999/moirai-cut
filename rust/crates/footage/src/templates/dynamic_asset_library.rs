use super::dynamic_asset::{Definition, RECORD};
use crate::store::{self, Store};
use anyhow::{Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

const LIBRARY: &str = "dynamic_asset_library";
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub asset_id: String,
    pub revision: u64,
    pub archived: bool,
}
#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Archive {
    pub asset_id: String,
    pub asset_revision: u64,
    pub base_revision: u64,
    pub archived: bool,
}
pub fn list(db: &Store) -> Result<Value> {
    db.transaction(|db| Ok(json!({"assets":store::list::<Definition>(db,RECORD)?,"library":store::list::<Entry>(db,LIBRARY)?})))
}
pub fn archive(db: &Store, input: Archive) -> Result<Entry> {
    db.transaction(|db| {
        let asset: Definition = store::get(db, RECORD, &input.asset_id)?;
        ensure!(
            asset.revision == input.asset_revision,
            "asset revision conflict; reload before changing library state"
        );
        // Missing entries are active at revision zero. Propagate malformed records instead of treating them as missing.
        let previous = store::list::<Entry>(db, LIBRARY)?
            .into_iter()
            .find(|e| e.asset_id == input.asset_id)
            .unwrap_or(Entry {
                asset_id: input.asset_id.clone(),
                revision: 0,
                archived: false,
            });
        ensure!(
            previous.revision == input.base_revision,
            "library revision conflict; reload before changing library state"
        );
        if previous.archived == input.archived {
            return Ok(previous);
        }
        let entry = Entry {
            asset_id: input.asset_id,
            revision: previous.revision + 1,
            archived: input.archived,
        };
        store::put(db, LIBRARY, &entry.asset_id, &entry)?;
        Ok(entry)
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::templates::{
        dynamic_asset::{self, Create, Save},
        model::Canvas,
    };
    #[test]
    fn archive_restore_preserves_definition_and_versions_and_rejects_stale_writes() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let definition = dynamic_asset::create(Create {
            name: "fixture".into(),
            canvas: Canvas {
                width: 720,
                height: 720,
                fps: 30,
            },
            purpose: None,
        })
        .unwrap();
        let saved = dynamic_asset::save(
            &db,
            Save {
                definition,
                base_revision: 0,
                idempotency_key: "create".into(),
            },
        )
        .unwrap();
        let id = saved.id.clone();
        let original = serde_json::to_value(&saved).unwrap();
        let set = |base_revision, asset_revision, archived| {
            archive(
                &db,
                Archive {
                    asset_id: id.clone(),
                    asset_revision,
                    base_revision,
                    archived,
                },
            )
        };
        assert!(set(0, 99, true).is_err());
        assert_eq!(set(0, 1, true).unwrap().revision, 1);
        assert!(set(0, 1, false).is_err());
        assert_eq!(list(&db).unwrap()["library"][0]["archived"], true);
        assert_eq!(set(1, 1, false).unwrap().revision, 2);
        assert_eq!(set(2, 1, false).unwrap().revision, 2);
        assert_eq!(db.get::<Value>(RECORD, &id).unwrap(), original);
        assert_eq!(
            db.get::<Value>("dynamic_asset_version", &format!("{id}-r1"))
                .unwrap(),
            original
        );
    }
}
