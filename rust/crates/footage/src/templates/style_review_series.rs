//! Independent quality evidence for multiple applications of one saved revision.
//! Each case is an exact reproducible application; series coverage never changes
//! the meaning or minimum evidence of an ordinary single-application review.
use super::{dynamic_asset::Application, reviews, search::fingerprint, style_reviews};
use crate::store::{self, Store};
use anyhow::{Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeSet;

const RECORD: &str = "dynamic_asset_quality_review_series";

#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Case {
    pub application: Application,
    pub review: reviews::Review,
    /// Why this application differs, and which adjustment was made for its input.
    pub rationale: String,
}

#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Submission {
    pub cases: Vec<Case>,
    pub rationale: String,
    /// The cases actually covered, not a claim of arbitrary-input generalization.
    pub coverage: String,
    pub limitations: String,
}

fn validate_text(text: &str) -> Result<()> {
    ensure!(
        !text.trim().is_empty() && text.len() <= 16000,
        "series rationale, coverage, limitations and case rationale are required (1–16000 bytes)"
    );
    Ok(())
}

fn validate(db: &rusqlite::Connection, submission: &Submission) -> Result<Value> {
    ensure!(
        !submission.cases.is_empty() && submission.cases.len() <= 100,
        "review series requires 1–100 application cases"
    );
    for text in [
        &submission.rationale,
        &submission.coverage,
        &submission.limitations,
    ] {
        validate_text(text)?;
    }
    let first = &submission.cases[0].application;
    let mut items = BTreeSet::new();
    let mut hashes = BTreeSet::new();
    let mut results = Vec::with_capacity(submission.cases.len());
    for (index, case) in submission.cases.iter().enumerate() {
        validate_text(&case.rationale)?;
        ensure!(
            case.application.asset_id == first.asset_id
                && case.application.asset_revision == first.asset_revision,
            "review series must use one saved style revision"
        );
        ensure!(
            items.insert((&case.review.batch_id, case.review.item)),
            "duplicate production item in review series"
        );
        let (total, definition_hash, application_hash) =
            style_reviews::validate_application_with_minimum(
                db,
                &case.application,
                &case.review,
                1,
            )?;
        for evidence in &case.review.evidence {
            // A byte-identical video cannot serve as a second adaptation case,
            // even if a different production item happens to reference it.
            ensure!(
                hashes.insert(evidence.sha256.to_ascii_lowercase()),
                "duplicate preview evidence in review series"
            );
        }
        results.push(json!({"index":index,"total":total,
            "definitionHash":definition_hash,"applicationHash":application_hash,
            "evidenceCount":case.review.evidence.len(),
            "meetsInternalThreshold":total>=90&&case.review.blocking_findings.is_empty(),
            "listened":case.review.listened,
            "aestheticQualityVerified":case.review.aesthetic_quality_verified}));
    }
    ensure!(
        hashes.len() >= 3,
        "review series requires at least three distinct preview hashes"
    );
    let total = results
        .iter()
        .map(|result| result["total"].as_u64().unwrap())
        .min()
        .unwrap();
    Ok(json!({
        "total":total,"definitionHash":results[0]["definitionHash"],
        "assetId":first.asset_id,"assetRevision":first.asset_revision,
        "evidenceCount":hashes.len(),"caseCount":results.len(),
        "meetsInternalThreshold":results.iter().all(|result|result["meetsInternalThreshold"]==true),
        "listened":results.iter().all(|result|result["listened"]==true),
        "aestheticQualityVerified":results.iter().all(|result|result["aestheticQualityVerified"]==true),
        "caseResults":results,
        "scope":"saved_style_revision_and_application_series"
    }))
}

pub fn save(db: &Store, submission: Submission) -> Result<Value> {
    db.transaction(|db| {
        let mut record = validate(db, &submission)?;
        let id = format!("style-review-series-{}", fingerprint(&submission));
        record["id"] = json!(id);
        record["submission"] = serde_json::to_value(submission)?;
        store::put(db, RECORD, &id, &record)?;
        Ok(record)
    })
}

pub fn list(db: &Store) -> Result<Value> {
    db.transaction(|db| {
        let mut records = store::list::<Value>(db, RECORD)?;
        for record in &mut records {
            let submission: Submission = serde_json::from_value(record["submission"].clone())?;
            // Recompute against current style and all production evidence before
            // adding live status fields to the otherwise immutable record.
            let current = validate(db, &submission).is_ok_and(|validated| {
                validated
                    .as_object()
                    .unwrap()
                    .iter()
                    .all(|(key, value)| record[key] == *value)
            });
            let mut evidence_current = true;
            for (index, case) in submission.cases.iter().enumerate() {
                let result = &mut record["caseResults"][index];
                let evidence = style_reviews::reviewed_template_with_minimum(db, &case.review, 1)
                    .is_ok_and(|(template, total)| {
                        result["applicationHash"] == fingerprint(&template)
                            && result["total"] == total
                    });
                let case_current = style_reviews::validate_application_with_minimum(
                    db,
                    &case.application,
                    &case.review,
                    1,
                )
                .is_ok_and(|(total, source, application)| {
                    result["total"] == total
                        && result["definitionHash"] == source
                        && result["applicationHash"] == application
                });
                result["evidenceCurrent"] = json!(evidence);
                result["current"] = json!(case_current);
                evidence_current &= evidence;
            }
            record["evidenceCurrent"] = json!(evidence_current);
            record["current"] = json!(current);
        }
        Ok(json!({"reviews":records}))
    })
}

#[cfg(test)]
mod tests;
