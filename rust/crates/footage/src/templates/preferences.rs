use super::{
    execution::{Evaluation, METRIC_VERSION},
    model::valid_id,
    search::fingerprint,
};
use crate::store::{self, Store};
use anyhow::{Context, Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::PathBuf,
};

pub const METRICS: [&str; 6] = [
    "coverage",
    "readability",
    "eventAlignment",
    "continuity",
    "variation",
    "resourceRelevance",
];
#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Feedback {
    pub evaluation_id: String,
    pub preferred_id: u64,
    pub rejected_id: u64,
    pub reason: String,
    pub idempotency_key: String,
    /// Without both rendered artifact paths this is a plan preference, not quality training data.
    #[serde(default)]
    pub rendered_paths: BTreeMap<u64, PathBuf>,
}
#[derive(Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Retract {
    pub id: String,
    pub base_revision: u64,
}
pub fn profile(db: &Store, id: &str) -> Result<Value> {
    ensure!(valid_id(id), "invalid preference profile");
    db.transaction(|db|{
        let found:bool=db.query_row("SELECT EXISTS(SELECT 1 FROM records WHERE kind='template_preference_profile' AND id=?1)",[id],|r|r.get(0))?;
        let mut result: Value = if found { store::get(db,"template_preference_profile",id)? } else {
            json!({"id":id,"revision":0,"active":false,"metricVersion":METRIC_VERSION,"renderedComparisons":0,"distinctInputs":0,"factors":METRICS.into_iter().map(|m|(m,1.)).collect::<BTreeMap<_,_>>()})
        };
        if result["metricVersion"] != METRIC_VERSION {
            result["active"] = json!(false);
            result["calibrationWarning"] = json!("metric_version_changed; historical feedback retained, new comparisons required");
        }
        Ok(result)
    })
}
pub fn apply(input: &mut Evaluation, profile: &Value) {
    if profile["active"] != true || profile["metricVersion"] != METRIC_VERSION {
        return;
    }
    for name in METRICS {
        let original = input.weights.get(name).copied().unwrap_or(1.);
        input.weights.insert(
            name.into(),
            original * profile["factors"][name].as_f64().unwrap_or(1.),
        );
    }
    let max = input.weights.values().copied().fold(0., f64::max);
    if max > 100. {
        for value in input.weights.values_mut() {
            *value *= 100. / max;
        }
    }
}
pub fn remember(db: &Store, input: &Evaluation, result: &mut Value) -> Result<()> {
    let id = crate::domain::id();
    result["evaluationId"] = json!(id);
    result["profileId"] = json!(input.profile_id);
    let candidates:Vec<_>=result["candidates"].as_array().unwrap().iter().map(|c|json!({"id":c["id"],"executable":c["executable"],"metrics":c["metrics"],"requestFingerprint":c["requestFingerprint"]})).collect();
    db.put("template_evaluation",&id,&json!({"id":id,"profileId":input.profile_id,"metricVersion":METRIC_VERSION,"createdAt":crate::domain::now(),"inputIdentity":fingerprint(&json!({"words":input.request.input.words,"events":input.request.input.events,"soundEvents":input.request.input.sound_events,"duration":input.request.input.duration_seconds,"source":input.request.source,"media":input.request.media,"project":input.request.document["metadata"]["id"]})),"candidates":candidates}))
}
fn fit(db: &rusqlite::Connection, profile_id: &str) -> Result<Value> {
    let previous: Option<Value> = store::list::<Value>(db, "template_preference_profile")?
        .into_iter()
        .find(|p| p["id"] == profile_id);
    let mut rows: Vec<_> = store::list::<Value>(db, "template_preference_feedback")?
        .into_iter()
        .filter(|f| {
            f["profileId"] == profile_id
                && f["retracted"] != true
                && f["rendered"] == true
                && f["informative"] == true
                && f["metricVersion"] == METRIC_VERSION
        })
        .collect();
    rows.sort_by(|a, b| a["id"].as_str().cmp(&b["id"].as_str()));
    ensure!(
        rows.len() <= 2000,
        "preference profile training limit exceeded"
    );
    let distinct = rows
        .iter()
        .filter_map(|r| r["inputIdentity"].as_str())
        .collect::<BTreeSet<_>>()
        .len();
    let mut factors = [1.; 6];
    // Regularized pairwise logistic ranking. Positive bounded factors preserve metric direction.
    for _ in 0..120 {
        let mut gradient = [0.; 6];
        for row in &rows {
            let delta: Vec<_> = METRICS
                .iter()
                .map(|m| {
                    row["preferred"]["metrics"][m].as_f64().unwrap_or(0.)
                        - row["rejected"]["metrics"][m].as_f64().unwrap_or(0.)
                })
                .collect();
            let margin: f64 = delta.iter().zip(factors).map(|(d, w)| d * w).sum();
            let error = 1. / (1. + margin.exp());
            for i in 0..6 {
                gradient[i] += error * delta[i];
            }
        }
        for i in 0..6 {
            factors[i] = (factors[i]
                + 0.1 * (gradient[i] / rows.len().max(1) as f64 - 0.2 * (factors[i] - 1.)))
                .clamp(0.25, 4.);
        }
    }
    let revision = previous
        .as_ref()
        .and_then(|p| p["revision"].as_u64())
        .unwrap_or(0)
        + 1;
    let active = rows.len() >= 5 && distinct >= 3;
    let result = json!({"id":profile_id,"revision":revision,"active":active,"renderedComparisons":rows.len(),"distinctInputs":distinct,"model":"pairwise-logistic-v1","metricVersion":METRIC_VERSION,"factors":METRICS.into_iter().zip(factors).collect::<BTreeMap<_,_>>()});
    store::put(db, "template_preference_profile", profile_id, &result)?;
    store::put(
        db,
        "template_preference_version",
        &format!("{profile_id}-r{revision}"),
        &result,
    )?;
    Ok(result)
}
pub fn feedback(db: &Store, input: Feedback) -> Result<Value> {
    ensure!(
        valid_id(&input.idempotency_key) && valid_id(&input.evaluation_id),
        "invalid feedback identity"
    );
    ensure!(
        input.preferred_id != input.rejected_id
            && !input.reason.trim().is_empty()
            && input.reason.len() <= 2000,
        "distinct candidates and a review reason are required"
    );
    let hash = fingerprint(&input);
    // Receipt lookup precedes artifact reads, so replay survives moved review files.
    if let Some(receipt) = db
        .list::<Value>("template_preference_feedback")?
        .into_iter()
        .find(|r| r["id"] == input.idempotency_key)
    {
        ensure!(
            receipt["requestHash"] == hash,
            "feedback idempotency conflict"
        );
        return Ok(
            json!({"feedback":receipt,"profile":profile(db,receipt["profileId"].as_str().unwrap())?}),
        );
    }
    let mut evidence = vec![];
    if !input.rendered_paths.is_empty() {
        ensure!(
            input.rendered_paths.len() == 2
                && input.rendered_paths.contains_key(&input.preferred_id)
                && input.rendered_paths.contains_key(&input.rejected_id),
            "rendered comparison requires an artifact for each candidate"
        );
        for (candidate, path) in &input.rendered_paths {
            let path = path.canonicalize().context("review artifact missing")?;
            let size = std::fs::metadata(&path)?.len();
            ensure!(
                (1..=128 * 1024 * 1024).contains(&size),
                "review artifact must be at most 128 MB"
            );
            let bytes = std::fs::read(&path)?;
            ensure!(
                bytes.starts_with(b"\x89PNG\r\n\x1a\n")
                    || bytes.starts_with(b"\xff\xd8\xff")
                    || bytes.get(4..8) == Some(b"ftyp"),
                "review artifact must be PNG, JPEG or MP4"
            );
            use sha2::{Digest, Sha256};
            evidence.push(json!({"candidateId":candidate,"path":path,"sha256":format!("{:x}",Sha256::digest(&bytes)),"bytes":size}));
        }
    }
    db.transaction(|connection|{
        if let Some(receipt)=store::list::<Value>(connection,"template_preference_feedback")?.into_iter().find(|r|r["id"]==input.idempotency_key){ensure!(receipt["requestHash"]==hash,"feedback idempotency conflict");return Ok(json!({"feedback":receipt,"profile":store::get::<Value>(connection,"template_preference_profile",receipt["profileId"].as_str().unwrap())?}));}
        let evaluation:Value=store::get(connection,"template_evaluation",&input.evaluation_id)?;
        let candidates=evaluation["candidates"].as_array().context("invalid evaluation receipt")?;
        let find=|id|->Result<&Value>{candidates.iter().find(|c|c["id"]==id&&c["executable"]==true).context("feedback candidate was not executable")};
        let preferred=find(input.preferred_id)?;let rejected=find(input.rejected_id)?;
        let informative=preferred["metrics"]!=rejected["metrics"];
        let profile_id=evaluation["profileId"].as_str().context("profile missing")?;
        let pair=[input.preferred_id.min(input.rejected_id),input.preferred_id.max(input.rejected_id)];
        ensure!(!store::list::<Value>(connection,"template_preference_feedback")?.iter().any(|r|r["evaluationId"]==input.evaluation_id&&r["pair"]==json!(pair)&&r["retracted"]!=true),"comparison already recorded; retract it before replacing");
        let record=json!({"id":input.idempotency_key,"requestHash":hash,"revision":1,"evaluationId":input.evaluation_id,"profileId":profile_id,"metricVersion":evaluation["metricVersion"],"inputIdentity":evaluation["inputIdentity"],"preferred":preferred,"rejected":rejected,"pair":pair,"reason":input.reason,"rendered":!evidence.is_empty(),"evidence":evidence,"evidenceProvenance":"reviewer_supplied","informative":informative,"retracted":false});
        store::put(connection,"template_preference_feedback",&input.idempotency_key,&record)?;
        Ok(json!({"feedback":record,"profile":fit(connection,profile_id)?}))
    })
}
pub fn retract(db: &Store, input: Retract) -> Result<Value> {
    db.transaction(|db| {
        let mut record: Value = store::get(db, "template_preference_feedback", &input.id)?;
        ensure!(
            record["revision"] == input.base_revision,
            "revision_conflict"
        );
        record["revision"] = json!(input.base_revision + 1);
        record["retracted"] = json!(true);
        store::put(db, "template_preference_feedback", &input.id, &record)?;
        Ok(json!({"feedback":record,"profile":fit(db,record["profileId"].as_str().unwrap())?}))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn receipt(db: &Store, id: &str, input: &str) {
        db.put("template_evaluation",id,&json!({"id":id,"profileId":"test","metricVersion":METRIC_VERSION,"inputIdentity":input,"candidates":[{"id":0,"executable":true,"metrics":{"coverage":1.,"readability":0.5}},{"id":1,"executable":true,"metrics":{"coverage":0.,"readability":0.5}},{"id":2,"executable":false}]})).unwrap();
    }
    fn review(id: &str) -> Feedback {
        Feedback {
            evaluation_id: id.into(),
            preferred_id: 0,
            rejected_id: 1,
            reason: "fixture comparison".into(),
            idempotency_key: format!("feedback-{id}"),
            rendered_paths: BTreeMap::new(),
        }
    }
    #[test]
    fn historical_metric_profiles_and_feedback_are_retained_but_not_reused() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let old = json!({"id":"test","revision":3,"active":true,"factors":{"readability":4.}});
        db.put("template_preference_profile", "test", &old).unwrap();
        let visible = profile(&db, "test").unwrap();
        assert_eq!(visible["active"], false);
        assert!(visible["calibrationWarning"].is_string());
        assert_eq!(
            db.get::<Value>("template_preference_profile", "test")
                .unwrap(),
            old
        );

        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("frame.png");
        std::fs::write(&path, b"\x89PNG\r\n\x1a\nfixture").unwrap();
        for i in 0..5 {
            let id = format!("old-{i}");
            receipt(&db, &id, &id);
            let mut record: Value = db.get("template_evaluation", &id).unwrap();
            record.as_object_mut().unwrap().remove("metricVersion");
            db.put("template_evaluation", &id, &record).unwrap();
            let mut f = review(&id);
            f.rendered_paths = BTreeMap::from([(0, path.clone()), (1, path.clone())]);
            let result = feedback(&db, f).unwrap();
            assert_eq!(result["profile"]["active"], false);
            assert_eq!(result["profile"]["renderedComparisons"], 0);
        }
        assert_eq!(
            db.list::<Value>("template_preference_feedback")
                .unwrap()
                .len(),
            5
        );
        receipt(&db, "new", "new-input");
        let mut f = review("new");
        f.rendered_paths = BTreeMap::from([(0, path.clone()), (1, path)]);
        let result = feedback(&db, f).unwrap();
        assert_eq!(result["profile"]["renderedComparisons"], 1);
        assert_eq!(result["profile"]["metricVersion"], METRIC_VERSION);
        assert_eq!(result["profile"]["active"], false);
    }
    #[test]
    fn plan_only_feedback_never_activates_and_replay_is_durable() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        for i in 0..6 {
            let id = format!("e{i}");
            receipt(&db, &id, &id);
            let r = feedback(&db, review(&id)).unwrap();
            assert_eq!(r["profile"]["active"], false);
            assert_eq!(r["profile"]["renderedComparisons"], 0);
        }
        let first = feedback(&db, review("e0")).unwrap();
        assert_eq!(first["feedback"]["revision"], 1);
        let mut conflict = review("e0");
        conflict.reason = "changed".into();
        assert!(feedback(&db, conflict).is_err());
        let mut duplicate = review("e0");
        duplicate.idempotency_key = "duplicate".into();
        assert!(feedback(&db, duplicate).is_err());
        let mut invalid = review("e0");
        invalid.idempotency_key = "invalid".into();
        invalid.rejected_id = 2;
        assert!(feedback(&db, invalid).is_err());
    }
    #[test]
    fn rendered_comparisons_train_and_retraction_refits_immutable_versions() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("frame.png");
        std::fs::write(&path, b"\x89PNG\r\n\x1a\nfixture").unwrap();
        for i in 0..5 {
            let id = format!("e{i}");
            receipt(&db, &id, &format!("input-{}", i % 3));
            let mut f = review(&id);
            f.rendered_paths = BTreeMap::from([(0, path.clone()), (1, path.clone())]);
            let r = feedback(&db, f).unwrap();
            assert_eq!(r["profile"]["active"], i == 4);
        }
        let trained = profile(&db, "test").unwrap();
        assert!(trained["factors"]["coverage"].as_f64().unwrap() > 1.);
        assert_eq!(trained["factors"]["readability"], 1.);
        std::fs::remove_file(&path).unwrap();
        let mut replay = review("e0");
        replay.rendered_paths = BTreeMap::from([(0, path.clone()), (1, path)]);
        assert!(feedback(&db, replay).is_ok());
        let out = retract(
            &db,
            Retract {
                id: "feedback-e0".into(),
                base_revision: 1,
            },
        )
        .unwrap();
        assert_eq!(out["profile"]["active"], false);
        assert_eq!(out["profile"]["renderedComparisons"], 4);
        assert!(
            retract(
                &db,
                Retract {
                    id: "feedback-e0".into(),
                    base_revision: 1
                }
            )
            .is_err()
        );
        assert_eq!(
            db.get::<Value>("template_preference_version", "test-r5")
                .unwrap(),
            trained
        );
    }
    #[test]
    fn client_cannot_supply_metrics_and_partial_evidence_is_rejected() {
        let mut value = serde_json::to_value(review("e0")).unwrap();
        value["metrics"] = json!({"coverage":1.});
        assert!(serde_json::from_value::<Feedback>(value).is_err());
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        receipt(&db, "e0", "input");
        let mut f = review("e0");
        f.rendered_paths.insert(0, "missing.png".into());
        assert!(feedback(&db, f).is_err());
        assert!(
            db.list::<Value>("template_preference_feedback")
                .unwrap()
                .is_empty()
        );
    }
}
