//! Immutable, input-bound application checkpoints. Restoring prepares a payload;
//! it never edits a style definition, source media, or a project timeline.
use super::{
    composition::SpatialRelation,
    dynamic_asset::{self, Application, ApplicationTransform, Definition, Insert},
    model::{Intent, Rect, Template, valid_id},
    placement_advice::{Policy, ProtectedRegion},
    production_author::{self, Design, Sample},
    search::fingerprint,
    transcription::{Input, Transcript},
};
use crate::{
    domain::now,
    store::{self, Store},
};
use anyhow::{Context, Result, ensure};
use rusqlite::{Connection, OptionalExtension};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashSet};

const RECORD: &str = "dynamic_asset_application_history";
const HEAD: &str = "dynamic_asset_application_head";
const RECEIPT: &str = "dynamic_asset_application_receipt";
const RESTORE_RECEIPT: &str = "dynamic_asset_application_restore_receipt";

#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Extra {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_display_seconds: Option<f64>,
    pub asset_id: String,
    pub asset_revision: u64,
    pub instance_id: String,
    #[serde(default)]
    pub inputs: BTreeMap<String, String>,
    #[serde(default)]
    pub placement: Option<Rect>,
    #[serde(default)]
    pub transform: Option<ApplicationTransform>,
    #[serde(default)]
    pub caption_width: Option<f64>,
    #[serde(default)]
    pub text_widths: BTreeMap<String, f64>,
    #[serde(default)]
    pub attachments: Vec<SpatialRelation>,
    #[serde(default)]
    pub intents: Option<Vec<Intent>>,
}

#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Evidence {
    /// Descriptive provenance only. Evidence is never an automatic quality approval.
    pub kind: String,
    pub reference: String,
    pub notes: String,
}

/// Background protection annotations belong to one reviewed content context.
/// The primary overlay's transform may change without moving the background
/// only when no extra overlay has attachments. Attached extras can follow it.
/// Source framing, scheduling, text, canvas and all extra overlays remain pinned.
#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProtectionContext {
    pub sample: Sample,
    pub application: Application,
    #[serde(default)]
    pub extras: Vec<Extra>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Save {
    pub idempotency_key: String,
    pub context_id: String,
    pub application: Application,
    #[serde(default)]
    pub extras: Vec<Extra>,
    /// Complete annotations pinned to imported media and transcript revisions.
    /// Empty means a parameters-only checkpoint, not a validated content application.
    #[serde(default)]
    pub samples: Vec<Sample>,
    #[serde(default)]
    pub protected_regions: Vec<ProtectedRegion>,
    /// Omitted legacy annotations remain unbound; never infer a sample from UI state.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub protection_context: Option<ProtectionContext>,
    /// Reusable application rule; separate from observed content geometry.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placement_policy: Option<Policy>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placement_padding: Option<f64>,
    pub reason: String,
    /// Compare-and-swap against the latest saved checkpoint in this context.
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub evidence: Vec<Evidence>,
    /// Opaque UI restoration data; never interpreted by the compiler or quality rules.
    #[serde(default)]
    pub ui_state: Option<Value>,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Restore {
    pub current: Save,
}

#[derive(Default, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Query {
    pub asset_id: Option<String>,
    pub context_id: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InputSnapshot {
    input: Input,
    transcript: Option<Transcript>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Record {
    pub id: String,
    pub created_at: u64,
    pub submission: Save,
    pub changes: Vec<Value>,
    assets: Vec<Definition>,
    input_snapshots: Vec<InputSnapshot>,
    projection_hash: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Head {
    context_id: String,
    record_id: String,
}

fn optional<T: serde::de::DeserializeOwned>(
    db: &Connection,
    kind: &str,
    id: &str,
) -> Result<Option<T>> {
    let body: Option<String> = db
        .query_row(
            "SELECT body FROM records WHERE kind=?1 AND id=?2",
            rusqlite::params![kind, id],
            |r| r.get(0),
        )
        .optional()?;
    body.map(|body| serde_json::from_str(&body).map_err(Into::into))
        .transpose()
}

fn bounded(text: &str, max: usize) -> bool {
    !text.trim().is_empty() && text.chars().count() <= max
}

fn validate_submission(input: &Save) -> Result<()> {
    ensure!(
        valid_id(&input.idempotency_key) && valid_id(&input.context_id),
        "invalid application history key or context ID"
    );
    ensure!(
        input.parent_id.as_ref().is_none_or(|id| valid_id(id)),
        "invalid parent history ID"
    );
    ensure!(
        bounded(&input.reason, 4000),
        "application adjustment reason requires 1-4000 characters"
    );
    ensure!(
        input.extras.len() <= 16
            && input.samples.len() <= 8
            && input.protected_regions.len() <= 64
            && input.evidence.len() <= 64,
        "application history exceeds collection limits"
    );
    ensure!(
        input.ui_state.as_ref().is_none_or(Value::is_object),
        "uiState must be an object"
    );
    ensure!(
        input
            .ui_state
            .as_ref()
            .map_or(0, |state| state.to_string().len())
            <= 256 * 1024,
        "uiState exceeds 256 KiB"
    );
    ensure!(
        serde_json::to_vec(input)?.len() <= 1024 * 1024,
        "application snapshot exceeds 1 MiB"
    );
    if let Some(policy) = &input.placement_policy {
        policy.validate()?;
    }
    ensure!(
        input
            .placement_padding
            .is_none_or(|padding| padding.is_finite() && (0.0..=0.25).contains(&padding)),
        "invalid placement padding"
    );
    let mut regions = HashSet::new();
    for region in &input.protected_regions {
        ensure!(
            bounded(&region.id, 80) && regions.insert(&region.id),
            "invalid or duplicate protected region ID"
        );
        region.region.validate()?;
    }
    if let Some(context) = &input.protection_context {
        let sample = serde_json::to_value(&context.sample)?;
        ensure!(
            input
                .samples
                .iter()
                .any(|candidate| serde_json::to_value(candidate)
                    .is_ok_and(|candidate| candidate == sample)),
            "protection context sample must exactly match a saved sample"
        );
        let mut expected = context.application.clone();
        let mut actual = input.application.clone();
        if input
            .extras
            .iter()
            .all(|extra| extra.attachments.is_empty())
            && context
                .extras
                .iter()
                .all(|extra| extra.attachments.is_empty())
        {
            expected.transform = None;
            actual.transform = None;
        }
        ensure!(
            serde_json::to_value(expected)? == serde_json::to_value(actual)?,
            "protection context application changed; review protection for the current application"
        );
        ensure!(
            serde_json::to_value(&context.extras)? == serde_json::to_value(&input.extras)?,
            "protection context extra overlays changed; review protection for the current composition"
        );
    }
    for evidence in &input.evidence {
        ensure!(
            bounded(&evidence.kind, 80)
                && bounded(&evidence.reference, 2000)
                && bounded(&evidence.notes, 4000),
            "evidence requires bounded kind, reference and notes"
        );
    }
    Ok(())
}

fn asset(db: &Connection, id: &str, revision: u64) -> Result<Definition> {
    ensure!(valid_id(id), "invalid application asset ID");
    let asset: Definition = store::get(db, dynamic_asset::RECORD, id)?;
    ensure!(
        asset.revision == revision,
        "application asset revision changed: {id}; reload before saving or restoring"
    );
    Ok(asset)
}

/// Reuse the real application/insert path; history does not implement a second compiler.
fn project(db: &Connection, input: &Save) -> Result<(Template, Vec<Definition>)> {
    let primary = asset(
        db,
        &input.application.asset_id,
        input.application.asset_revision,
    )?;
    let mut template = dynamic_asset::application(&primary, &input.application)?;
    let mut assets = vec![primary];
    for extra in &input.extras {
        let source = asset(db, &extra.asset_id, extra.asset_revision)?;
        let result = dynamic_asset::insert_configured(
            Insert {
                min_display_seconds: extra.min_display_seconds,
                template,
                asset_id: extra.asset_id.clone(),
                asset_revision: extra.asset_revision,
                instance_id: extra.instance_id.clone(),
                inputs: extra.inputs.clone(),
                placement: extra.placement.clone(),
                transform: extra.transform.clone(),
                caption_width: extra.caption_width,
                text_widths: extra.text_widths.clone(),
                attachments: extra.attachments.clone(),
                intents: extra.intents.clone(),
            },
            &source,
        )?;
        template = serde_json::from_value(result["template"].clone())?;
        assets.push(source);
    }
    Ok((template, assets))
}

fn validate_inputs(
    db: &Connection,
    input: &Save,
    template: &Template,
) -> Result<Vec<InputSnapshot>> {
    if input.samples.is_empty() {
        return Ok(vec![]);
    }
    production_author::validate_design_samples(
        &[Design {
            template: template.clone(),
            base_revision: 0,
        }],
        &input.samples,
    )?;
    let mut snapshots = vec![];
    for sample in &input.samples {
        let source: Input = store::get(db, "template_input", &sample.input_id)?;
        let transcript = if sample.transcript_revision.is_some() {
            Some(store::get::<Transcript>(
                db,
                "template_transcript",
                &sample.input_id,
            )?)
        } else {
            None
        };
        let plan = production_author::plan_input(sample, &source, transcript.as_ref(), template)?;
        super::rhythm::plan(plan)?;
        snapshots.push(InputSnapshot {
            input: source,
            transcript,
        });
    }
    Ok(snapshots)
}

fn changes(before: &Value, after: &Value, path: &str, result: &mut Vec<Value>) {
    if before == after {
        return;
    }
    if let (Some(before), Some(after)) = (before.as_object(), after.as_object()) {
        let keys: std::collections::BTreeSet<_> = before.keys().chain(after.keys()).collect();
        for key in keys {
            let key_path = format!("{path}/{}", key.replace('~', "~0").replace('/', "~1"));
            changes(
                before.get(key).unwrap_or(&Value::Null),
                after.get(key).unwrap_or(&Value::Null),
                &key_path,
                result,
            );
        }
    } else {
        result.push(json!({"path":path,"before":before,"after":after}));
    }
}

fn comparison(input: &Save) -> Value {
    let mut result = json!({"application":input.application,"extras":input.extras,"samples":input.samples,
        "protectedRegions":input.protected_regions,"placementPolicy":input.placement_policy,"placementPadding":input.placement_padding,"uiState":input.ui_state});
    if let Some(context) = &input.protection_context {
        result["protectionContext"] = json!(context);
    }
    result
}

fn save_in(db: &Connection, input: Save) -> Result<Record> {
    validate_submission(&input)?;
    let hash = fingerprint(&input);
    if let Some(receipt) = optional::<Value>(db, RECEIPT, &input.idempotency_key)? {
        ensure!(
            receipt["hash"] == hash,
            "application history idempotency key reused with different payload"
        );
        return store::get(
            db,
            RECORD,
            receipt["recordId"]
                .as_str()
                .context("invalid history receipt")?,
        );
    }
    let head = optional::<Head>(db, HEAD, &input.context_id)?;
    ensure!(
        head.as_ref().map(|h| &h.record_id) == input.parent_id.as_ref(),
        "application history head conflict; reload before saving"
    );
    let parent = input
        .parent_id
        .as_ref()
        .map(|id| store::get::<Record>(db, RECORD, id))
        .transpose()?;
    ensure!(
        parent
            .as_ref()
            .is_none_or(|parent| parent.submission.context_id == input.context_id),
        "parent checkpoint belongs to another context"
    );
    let (template, assets) = project(db, &input)?;
    let input_snapshots = validate_inputs(db, &input, &template)?;
    let mut delta = vec![];
    changes(
        &parent
            .as_ref()
            .map(|parent| comparison(&parent.submission))
            .unwrap_or_else(|| json!({})),
        &comparison(&input),
        "",
        &mut delta,
    );
    let id = format!("application-{}", fingerprint(&input.idempotency_key));
    let record = Record {
        id: id.clone(),
        created_at: now(),
        submission: input,
        changes: delta,
        assets,
        input_snapshots,
        projection_hash: fingerprint(&template),
    };
    ensure!(
        optional::<Record>(db, RECORD, &id)?.is_none(),
        "application history record collision"
    );
    store::put(db, RECORD, &id, &record)?;
    store::put(
        db,
        HEAD,
        &record.submission.context_id,
        &Head {
            context_id: record.submission.context_id.clone(),
            record_id: id.clone(),
        },
    )?;
    store::put(
        db,
        RECEIPT,
        &record.submission.idempotency_key,
        &json!({"hash":hash,"recordId":id}),
    )?;
    Ok(record)
}

fn status(db: &Connection, record: &Record) -> Result<Value> {
    let mut issues = vec![];
    for expected in &record.assets {
        let current = optional::<Definition>(db, dynamic_asset::RECORD, &expected.id)?;
        if !current
            .as_ref()
            .is_some_and(|current| fingerprint(current) == fingerprint(expected))
        {
            issues.push(format!("style_revision_changed:{}", expected.id));
        }
    }
    let assets_current = issues.is_empty();
    let mut inputs_current = true;
    for expected in &record.input_snapshots {
        let current = optional::<Input>(db, "template_input", &expected.input.id)?;
        if !current
            .as_ref()
            .is_some_and(|current| fingerprint(current) == fingerprint(&expected.input))
        {
            inputs_current = false;
            issues.push(format!("input_changed:{}", expected.input.id));
        }
        if let Some(expected_transcript) = &expected.transcript {
            let current = optional::<Transcript>(db, "template_transcript", &expected.input.id)?;
            if !current
                .as_ref()
                .is_some_and(|current| fingerprint(current) == fingerprint(expected_transcript))
            {
                inputs_current = false;
                issues.push(format!("transcript_changed:{}", expected.input.id));
            }
        }
    }
    let projection_current = assets_current
        && project(db, &record.submission)
            .is_ok_and(|(template, _)| fingerprint(&template) == record.projection_hash);
    if assets_current && !projection_current {
        issues.push("projection_changed".into());
    }
    Ok(
        json!({"restorable":assets_current&&inputs_current&&projection_current,"assetsCurrent":assets_current,
        "inputsCurrent":inputs_current,"projectionCurrent":projection_current,"issues":issues,
        "contentScope":if record.submission.samples.is_empty(){"parameters_only"}else{"sample_annotations"},
        "protectionScope":if record.submission.protected_regions.is_empty(){"none"}else if record.submission.protection_context.is_some(){"bound"}else{"unbound"},
        "qualityVerified":false,"sourceFilesVerified":false}),
    )
}

fn response(db: &Connection, record: &Record) -> Result<Value> {
    Ok(json!({"record":record,"status":status(db,record)?}))
}

pub fn save(db: &Store, input: Save) -> Result<Value> {
    db.transaction(|db| {
        let record = save_in(db, input)?;
        response(db, &record)
    })
}

pub fn read(db: &Store, id: &str) -> Result<Value> {
    ensure!(valid_id(id), "invalid history ID");
    db.transaction(|db| response(db, &store::get(db, RECORD, id)?))
}

pub fn list(db: &Store, query: Query) -> Result<Value> {
    ensure!(
        query.asset_id.as_ref().is_none_or(|id| valid_id(id))
            && query.context_id.as_ref().is_none_or(|id| valid_id(id)),
        "invalid history query"
    );
    db.transaction(|db| {
        let records = store::list::<Record>(db, RECORD)?
            .into_iter()
            .filter(|record| {
                query
                    .asset_id
                    .as_ref()
                    .is_none_or(|id| id == &record.submission.application.asset_id)
                    && query
                        .context_id
                        .as_ref()
                        .is_none_or(|id| id == &record.submission.context_id)
            })
            .map(|record| response(db, &record))
            .collect::<Result<Vec<_>>>()?;
        let contexts: HashSet<_> = records
            .iter()
            .filter_map(|record| record["record"]["submission"]["contextId"].as_str())
            .collect();
        let heads: Vec<_> = store::list::<Head>(db, HEAD)?
            .into_iter()
            .filter(|head| contexts.contains(head.context_id.as_str()))
            .collect();
        Ok(json!({"records":records,"heads":heads}))
    })
}

pub fn restore(db: &Store, id: &str, input: Restore) -> Result<Value> {
    ensure!(valid_id(id), "invalid history ID");
    db.transaction(|db| {
        validate_submission(&input.current)?;
        let target: Record = store::get(db,RECORD,id)?;
        ensure!(input.current.context_id==target.submission.context_id,"restore target belongs to another context");
        let target_status=status(db,&target)?;
        ensure!(target_status["restorable"]==true,"history is stale; inspect status and reapply explicitly instead of restoring");
        let (template,_) = project(db,&target.submission)?;
        validate_inputs(db,&target.submission,&template)?;
        let (current_template,_) = project(db,&input.current)?;
        validate_inputs(db,&input.current,&current_template)?;
        let restore_hash=fingerprint(&json!({"targetId":id,"current":input.current}));
        let receipt=optional::<Value>(db,RESTORE_RECEIPT,&input.current.idempotency_key)?;
        let backup=if let Some(receipt)=receipt {
            ensure!(receipt["hash"]==restore_hash,"restore idempotency key reused with different target or payload");
            store::get::<Record>(db,RECORD,receipt["backupId"].as_str().context("invalid restore receipt")?)?
        } else {
            // An ordinary save receipt cannot bypass the context head check during restore.
            ensure!(optional::<Value>(db,RECEIPT,&input.current.idempotency_key)?.is_none(),
                "restore requires a fresh idempotency key; key already used for a checkpoint");
            // Both target and current must validate before this transaction commits any record.
            let backup=save_in(db,input.current)?;
            store::put(db,RESTORE_RECEIPT,&backup.submission.idempotency_key,&json!({"hash":restore_hash,"backupId":backup.id}))?;
            backup
        };
        Ok(json!({"record":target,"status":target_status,"backup":response(db,&backup)?,"template":template,"parentIdForNextSave":backup.id}))
    })
}

#[cfg(test)]
mod tests;
