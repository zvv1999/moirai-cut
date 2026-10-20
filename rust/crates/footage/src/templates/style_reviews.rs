//! Revision-bound review of one reproducible saved-style application.
//! A saved combination is a definition too; arbitrary edited applications must
//! first be captured rather than borrowing a source style's review.
use super::{
    dynamic_asset::{self, Application, Definition},
    model::Template,
    reviews,
    search::fingerprint,
};
use crate::store::{self, Store};
use anyhow::{Context, Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
const RECORD: &str = "dynamic_asset_quality_review";

#[derive(Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Submission {
    pub application: Application,
    pub review: reviews::Review,
}

// Browser JSON parse/stringify can round an f64 by a few ULPs. Do not
// quantize authored parameters or ignore fields; accept only machine precision.
fn same_graph(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(a), Value::Number(b)) => {
            if a == b {
                return true;
            }
            if (a.is_u64() || a.is_i64()) && (b.is_u64() || b.is_i64()) {
                return false;
            }
            match (a.as_f64(), b.as_f64()) {
                (Some(a), Some(b)) => {
                    (a - b).abs() <= 4. * f64::EPSILON * a.abs().max(b.abs()).max(1.)
                }
                _ => false,
            }
        }
        (Value::Array(a), Value::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(a, b)| same_graph(a, b))
        }
        (Value::Object(a), Value::Object(b)) => {
            a.len() == b.len()
                && a.iter()
                    .all(|(key, a)| b.get(key).is_some_and(|b| same_graph(a, b)))
        }
        _ => a == b,
    }
}

fn reviewed_template(
    db: &rusqlite::Connection,
    review: &reviews::Review,
) -> Result<(Template, u16)> {
    reviewed_template_with_minimum(db, review, 3)
}

pub(crate) fn reviewed_template_with_minimum(
    db: &rusqlite::Connection,
    review: &reviews::Review,
    minimum_previews: usize,
) -> Result<(Template, u16)> {
    let key = format!("{}-{}", review.batch_id, review.item);
    let output: Value = store::get(db, "template_production_output", &key)?;
    let template: Template = serde_json::from_value(output["template"].clone())?;
    let item: Value = store::get(db, "template_production_item", &key)?;
    let mut published = template.clone();
    published.revision = item["templateRevision"]
        .as_u64()
        .context("missing published template revision")?;
    let total = reviews::validate_with_minimum(review, &published, &item, minimum_previews)?;
    Ok((template, total))
}

fn validate(db: &rusqlite::Connection, submission: &Submission) -> Result<(u16, String, String)> {
    validate_application_with_minimum(db, &submission.application, &submission.review, 3)
}

pub(crate) fn validate_application_with_minimum(
    db: &rusqlite::Connection,
    application: &Application,
    review: &reviews::Review,
    minimum_previews: usize,
) -> Result<(u16, String, String)> {
    let source: Definition = store::get(db, dynamic_asset::RECORD, &application.asset_id)?;
    ensure!(
        source.revision == application.asset_revision,
        "style review requires the current saved revision"
    );
    let mut projected = dynamic_asset::application(&source, application)?;
    let (template, total) = reviewed_template_with_minimum(db, review, minimum_previews)?;
    // Authors may name their production template independently. Revision is
    // assigned by production. No visual, timing or resource field is ignored.
    projected.id = template.id.clone();
    projected.revision = template.revision;
    ensure!(
        same_graph(
            &serde_json::to_value(&projected)?,
            &serde_json::to_value(&template)?
        ),
        "production template differs from the saved style application; capture edited combinations before reviewing"
    );

    Ok((total, fingerprint(&source), fingerprint(&template)))
}

pub fn save(db: &Store, submission: Submission) -> Result<Value> {
    db.transaction(|db| {
        let (total,definition_hash,application_hash)=validate(db,&submission)?;
        let record=json!({"id":format!("style-review-{}",fingerprint(&submission)),"submission":submission,"total":total,
            "definitionHash":definition_hash,"applicationHash":application_hash,
            "meetsInternalThreshold":total>=90&&submission.review.blocking_findings.is_empty(),
            "aestheticQualityVerified":submission.review.aesthetic_quality_verified,
            "scope":"saved_style_revision_and_exact_application","listened":submission.review.listened});
        store::put(db,RECORD,record["id"].as_str().unwrap(),&record)?;
        Ok(record)
    })
}

pub fn list(db: &Store) -> Result<Value> {
    db.transaction(|db| {
        let mut records = store::list::<Value>(db, RECORD)?;
        for record in &mut records {
            let submission: Submission = serde_json::from_value(record["submission"].clone())?;
            record["evidenceCurrent"] = json!(
                reviewed_template(db, &submission.review)
                    .is_ok_and(|(template, _)| record["applicationHash"] == fingerprint(&template))
            );
            record["current"] = json!(validate(db, &submission).is_ok_and(
                |(total, source, application)| record["total"] == total
                    && record["definitionHash"] == source
                    && record["applicationHash"] == application
            ));
        }
        Ok(json!({"reviews":records}))
    })
}

#[cfg(test)]
mod tests {
    use super::super::{
        dynamic_asset::{Create, Save},
        model::{Canvas, Rect},
    };
    use super::*;
    #[test]
    fn json_roundtrip_tolerance_does_not_hide_authored_changes() {
        assert!(same_graph(
            &json!({"region":{"width":0.40640624999999997}}),
            &json!({"region":{"width":0.40640625}})
        ));
        assert!(!same_graph(
            &json!({"width":0.40640625}),
            &json!({"width":0.4064062501})
        ));
        assert!(!same_graph(
            &json!({"text":"original"}),
            &json!({"text":"changed"})
        ));
        assert!(!same_graph(&json!([1, 2]), &json!([2, 1])));
        assert!(!same_graph(
            &json!({"width":1.}),
            &json!({"width":1.,"extra":null})
        ));
        assert!(!same_graph(
            &json!(9007199254740992u64),
            &json!(9007199254740993u64)
        ));
    }
    #[test]
    fn rejects_unrelated_graph_stale_style_and_replaced_preview() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let source = dynamic_asset::create(Create {
            name: "review fixture".into(),
            canvas: Canvas {
                width: 720,
                height: 720,
                fps: 30,
            },
            purpose: None,
        })
        .unwrap();
        let source = dynamic_asset::save(
            &db,
            Save {
                definition: source,
                base_revision: 0,
                idempotency_key: "create".into(),
            },
        )
        .unwrap();
        let application = Application {
            min_display_seconds: None,
            intents: None,
            asset_id: source.id.clone(),
            asset_revision: 1,
            canvas: source.canvas.clone(),
            placement: Rect {
                x: 0.,
                y: 0.,
                width: 1.,
                height: 1.,
            },
            inputs: Default::default(),
            transform: None,
            caption_width: None,
            text_widths: Default::default(),
            video_region: None,
            blurred_background: None,
        };
        let template = dynamic_asset::application(&source, &application).unwrap();
        let criterion = |score| reviews::Criterion {
            score,
            rationale: "fixture evidence".into(),
        };
        let submission = Submission {
            application,
            review: reviews::Review {
                template_id: template.id.clone(),
                template_revision: template.revision,
                batch_id: "batch".into(),
                item: 0,
                reviewer: "test".into(),
                composition: criterion(25),
                motion: criterion(25),
                assets: criterion(20),
                adaptation: criterion(20),
                editability: criterion(10),
                evidence: (0..3)
                    .map(|i| reviews::Evidence {
                        fixture: i,
                        sha256: format!("{i:064x}"),
                    })
                    .collect(),
                inspection: "test fixtures".into(),
                limitations: "not a real visual review".into(),
                blocking_findings: vec!["unreviewed appearance".into()],
                listened: false,
                aesthetic_quality_verified: false,
            },
        };
        let mut item = json!({"templateId":template.id,"templateRevision":template.revision,"status":"published","previews":submission.review.evidence.iter().map(|e|json!({"fixture":e.fixture,"sha256":e.sha256,"decodeVerified":true,"audioQuality":{"validated":true}})).collect::<Vec<_>>()});
        db.put(
            "template_production_output",
            "batch-0",
            &json!({"template":template}),
        )
        .unwrap();
        db.put("template_production_item", "batch-0", &item)
            .unwrap();
        let record = save(&db, submission).unwrap();
        assert_eq!(record["total"], 100);
        assert_eq!(record["meetsInternalThreshold"], false);
        assert_eq!(list(&db).unwrap()["reviews"][0]["current"], true);
        assert_eq!(list(&db).unwrap()["reviews"][0]["evidenceCurrent"], true);
        assert_eq!(
            save(
                &db,
                serde_json::from_value(record["submission"].clone()).unwrap()
            )
            .unwrap(),
            record
        );
        let mut changed = template.clone();
        changed.styles[0].fill = "#FF0000".into();
        db.put(
            "template_production_output",
            "batch-0",
            &json!({"template":changed}),
        )
        .unwrap();
        assert!(
            save(
                &db,
                serde_json::from_value(record["submission"].clone()).unwrap()
            )
            .is_err()
        );
        assert_eq!(list(&db).unwrap()["reviews"][0]["current"], false);
        db.put(
            "template_production_output",
            "batch-0",
            &json!({"template":template}),
        )
        .unwrap();
        item["previews"][0]["sha256"] = json!("f".repeat(64));
        db.put("template_production_item", "batch-0", &item)
            .unwrap();
        assert_eq!(list(&db).unwrap()["reviews"][0]["current"], false);
        assert_eq!(list(&db).unwrap()["reviews"][0]["evidenceCurrent"], false);
        item["previews"][0]["sha256"] = json!(format!("{:064x}", 0));
        db.put("template_production_item", "batch-0", &item)
            .unwrap();
        assert_eq!(list(&db).unwrap()["reviews"][0]["current"], true);
        let mut published: Submission =
            serde_json::from_value(record["submission"].clone()).unwrap();
        item["templateRevision"] = json!(1);
        published.review.template_revision = 1;
        db.put("template_production_item", "batch-0", &item)
            .unwrap();
        assert!(
            save(&db, published).is_ok(),
            "production assigns a new template revision without changing the source graph"
        );
        item["templateRevision"] = json!(template.revision);
        db.put("template_production_item", "batch-0", &item)
            .unwrap();
        let mut source = source;
        source.revision += 1;
        db.put(dynamic_asset::RECORD, &source.id, &source).unwrap();
        assert!(
            save(
                &db,
                serde_json::from_value(record["submission"].clone()).unwrap()
            )
            .is_err()
        );
        let historical = list(&db).unwrap();
        let old = historical["reviews"]
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["id"] == record["id"])
            .unwrap();
        assert_eq!(old["current"], false);
        assert_eq!(old["evidenceCurrent"], true);
    }
}
