use super::{
    api, audio,
    compiler::{self, CompileInput},
    model::{Template, valid_id},
    search::fingerprint,
};
use crate::{
    domain::{Job, now},
    service::App,
    store::{self, Store},
};
use anyhow::{Context, Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeSet;

#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Item {
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub preview_only: bool,
    pub template: Template,
    #[serde(default)]
    pub base_revision: u64,
    /// Explicit opt-in for captions driven by speech timing without audible media.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub allow_silent_previews: bool,
    /// Each fixture carries measured input and a complete isolated preview context.
    pub fixtures: Vec<CompileInput>,
}
#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub idempotency_key: String,
    pub name: String,
    pub brief: String,
    pub items: Vec<Item>,
}

fn item_key(batch: &str, index: usize) -> String {
    format!("{batch}-{index}")
}
fn fixture_projects(item: &Item) -> Value {
    json!(
        item.fixtures
            .iter()
            .enumerate()
            .map(|(index, fixture)| {
                json!({"fixture": index, "projectId": fixture.document["metadata"]["id"]})
            })
            .collect::<Vec<_>>()
    )
}
pub(super) fn batch_id(key: &str) -> String {
    format!("production-{}", &fingerprint(&key)[..32])
}
fn design(template: &Template) -> String {
    let mut value = serde_json::to_value(template).unwrap();
    for key in ["id", "name", "description", "revision", "tags", "evidence"] {
        value.as_object_mut().unwrap().remove(key);
    }
    fingerprint(&value)
}
pub fn enqueue(db: &Store, input: Request) -> Result<Value> {
    ensure!(
        valid_id(&input.idempotency_key),
        "invalid production idempotency key"
    );
    ensure!(
        !input.name.trim().is_empty() && input.name.len() <= 300 && input.brief.len() <= 8000,
        "invalid production brief"
    );
    ensure!(
        (1..=100).contains(&input.items.len()),
        "production requires 1 to 100 templates"
    );
    let mut ids = BTreeSet::new();
    let mut projects = BTreeSet::new();
    for item in &input.items {
        ensure!(
            ids.insert(&item.template.id),
            "duplicate template ID in batch"
        );
        ensure!(
            (1..=8).contains(&item.fixtures.len()),
            "each template requires 1 to 8 preview fixtures"
        );
        ensure!(
            valid_id(&item.template.id),
            "invalid production template ID"
        );
        for fixture in &item.fixtures {
            for scene in fixture.document["scenes"]
                .as_array()
                .context("missing fixture scenes")?
            {
                let tracks = &scene["tracks"];
                let mut all_tracks = vec![&tracks["main"]];
                for kind in ["overlay", "audio"] {
                    if let Some(list) = tracks[kind].as_array() {
                        all_tracks.extend(list);
                    }
                }
                for track in all_tracks {
                    for element in track["elements"].as_array().into_iter().flatten() {
                        ensure!(
                            element["params"].is_object(),
                            "fixture element requires params: {}",
                            element["id"]
                        );
                        if element["type"] == "audio" {
                            ensure!(
                                (element["sourceType"] == "upload"
                                    && element["mediaId"].as_str().is_some_and(|s| !s.is_empty()))
                                    || (element["sourceType"] == "library"
                                        && element["sourceUrl"]
                                            .as_str()
                                            .is_some_and(|s| !s.is_empty())),
                                "fixture audio requires a valid source: {}",
                                element["id"]
                            );
                        }
                    }
                }
            }
            let project = fixture.document["metadata"]["id"]
                .as_str()
                .context("fixture requires an isolated preview project")?;
            ensure!(
                valid_id(project) && projects.insert(project.to_string()),
                "each fixture must use its own preview project"
            );
            ensure!(
                fixture.document["metadata"]["name"]
                    .as_str()
                    .is_some_and(|name| name.starts_with("Template Production /")),
                "fixture project must be explicitly named Template Production /..."
            );
        }
    }
    let hash = fingerprint(&input);
    let id = batch_id(&input.idempotency_key);
    db.transaction(|db|{
        if let Some(existing)=store::list::<Value>(db,"template_production")?.into_iter().find(|b|b["id"]==id) {
            ensure!(existing["requestHash"]==hash,"production idempotency conflict");return Ok(existing);
        }
        let mut designs=BTreeSet::new();
        let mut items=vec![];
        for (index,item) in input.items.iter().enumerate() {
            let duplicate=!designs.insert(design(&item.template));
            let entry=json!({"index":index,"templateId":item.template.id,"name":item.template.name,"status":if duplicate{"rejected"}else{"queued"},"revision":0,"error":if duplicate{Some("duplicate design in batch")}else{None},"fixtureCount":item.fixtures.len(),"fixtureProjects":fixture_projects(item)});
            store::put(db,"template_production_item",&item_key(&id,index),&entry)?;items.push(entry);
        }
        let job=Job::new("template_production",&id,0);
        let batch=json!({"id":id,"name":input.name,"brief":input.brief,"requestHash":hash,"createdAt":now(),"jobId":job.id,"cancelled":false,"count":items.len()});
        store::put(db,"template_production_input",&id,&input)?;
        store::put(db,"template_production",&id,&batch)?;
        store::put(db,"job",&job.id,&job)?;
        super::production_runner::queue(db, &id)?;
        Ok(batch)
    })
}
pub fn read(db: &Store, id: &str) -> Result<Value> {
    db.transaction(|db|{
        let mut batch:Value=store::get(db,"template_production",id)?;
        let count=batch["count"].as_u64().context("invalid batch")? as usize;
        let mut items=(0..count).map(|i|store::get::<Value>(db,"template_production_item",&item_key(id,i))).collect::<Result<Vec<_>>>()?;
        // Older records derive navigation from the immutable request without changing revisions.
        if items.iter().any(|item| item.get("fixtureProjects").is_none()) {
            let source: Request = store::get(db, "template_production_input", id)?;
            for (index, item) in items.iter_mut().enumerate() {
                if item.get("fixtureProjects").is_none() {
                    item["fixtureProjects"] = fixture_projects(source.items.get(index).context("missing production item")?);
                }
            }
        }
        batch["job"]=serde_json::to_value(store::get::<Job>(db,"job",batch["jobId"].as_str().unwrap())?)?;
        batch["renderJob"]=json!(super::production_runner::job(db,id)?);
        batch["summary"]=json!({"total":count,"queued":items.iter().filter(|i|i["status"]=="queued").count(),"compiling":items.iter().filter(|i|i["status"]=="compiling").count(),"renderReady":items.iter().filter(|i|i["status"]=="render_ready").count(),"published":items.iter().filter(|i|i["status"]=="published").count(),"failed":items.iter().filter(|i|i["status"]=="failed"||i["status"]=="rejected").count()});
        for entry in &mut items { super::production_text_measurements::annotate_legacy(entry); }
        batch["items"]=json!(items);Ok(batch)
    })
}

pub fn previews(db: &Store) -> Result<Value> {
    db.transaction(|db| {
        let templates = store::list::<Template>(db, "template")?;
        let mut batches = store::list::<Value>(db, "template_production")?;
        batches.sort_by_key(|batch| std::cmp::Reverse((batch["createdAt"].as_u64().unwrap_or(0), batch["id"].as_str().unwrap_or("").to_owned())));
        let mut found = serde_json::Map::new();
        let mut application_previews = serde_json::Map::new();
        for batch in batches {
            let id = batch["id"].as_str().context("invalid batch ID")?;
            for index in 0..batch["count"].as_u64().unwrap_or(0) as usize {
                let item: Value = store::get(db, "template_production_item", &item_key(id, index))?;
                let Some(template_id) = item["templateId"].as_str() else { continue };
                if item["status"] != "published" || found.contains_key(template_id) { continue; }
                let Some(template) = templates.iter().find(|template| template.id == template_id) else { continue };
                if item["templateRevision"].as_u64() != Some(template.revision) { continue; }
                let preview_only = item["previewOnly"] == true;
                if preview_only {
                    if application_previews.contains_key(template_id) { continue; }
                    // A draft can carry the saved revision while changing its definition.
                    // Only an exact saved definition is evidence for the library entry.
                    let Ok(source) = store::get::<Request>(db, "template_production_input", id) else { continue };
                    let Some(source_item) = source.items.get(index) else { continue };
                    if serde_json::to_value(&source_item.template)? != serde_json::to_value(template)? { continue; }
                }
                let Some(preview) = item["previews"].as_array().and_then(|previews| previews.iter().find(|preview| {
                    preview["decodeVerified"] == true
                        && preview["audioQuality"]["validated"] == true
                        && preview["fixture"].as_u64().is_some()
                        && preview["path"].as_str().is_some_and(|path| {
                            std::fs::metadata(path).is_ok_and(|metadata| metadata.is_file() && metadata.len() > 0)
                        })
                })) else { continue };
                let Some(fixture) = preview["fixture"].as_u64() else { continue };
                let quality_review = super::reviews::for_preview(db, template, id, index, &item)?;
                let aesthetic_quality_verified = quality_review
                    .as_ref()
                    .is_some_and(|review| review["aestheticQualityVerified"] == true
                        || review["review"]["aestheticQualityVerified"] == true);
                let catalog = if preview_only { &mut application_previews } else { &mut found };
                catalog.insert(template_id.to_owned(), json!({
                    "templateId": template_id, "revision": template.revision,
                    "batchId": id, "item": index, "fixture": fixture,
                    "width": template.canvas.width, "height": template.canvas.height,
                    "durationSeconds": preview["durationSeconds"],
                    "mediaUrl": format!("/api/footage/templates/production/{id}/items/{index}/previews/{fixture}"),
                    "captionsUrl": format!("/api/footage/templates/production/{id}/items/{index}/captions/{fixture}"),
                    "qualityReview": quality_review,
                    "aestheticQualityVerified": aesthetic_quality_verified
                }));
            }
        }
        // Ordinary applications fill missing examples without replacing the published
        // examples and their quality reviews with a newer unreviewed application.
        for (template_id, preview) in application_previews {
            found.entry(template_id).or_insert(preview);
        }
        Ok(json!({"previews": found}))
    })
}
pub fn item(db: &Store, id: &str, index: usize) -> Result<Value> {
    let mut item: Value = db.get("template_production_item", &item_key(id, index))?;
    if item.get("fixtureProjects").is_none() {
        let source: Request = db.get("template_production_input", id)?;
        item["fixtureProjects"] =
            fixture_projects(source.items.get(index).context("missing production item")?);
    }
    if item["status"] == "render_ready" || item["status"] == "published" {
        item["output"] = db.get("template_production_output", &item_key(id, index))?;
    }
    super::production_text_measurements::annotate_legacy(&mut item);
    Ok(item)
}

pub fn run(app: &App, id: &str) -> Result<()> {
    run_with(&app.db, id, |request| {
        let sounds = audio::resolve_resources(app, &request.input.resolved_template()?)?;
        compiler::compile_with_audio(request, &sounds)
    })
}
fn run_with(
    db: &Store,
    id: &str,
    mut compile: impl FnMut(CompileInput) -> Result<Value>,
) -> Result<()> {
    let input: Request = db.get("template_production_input", id)?;
    for (index, source) in input.items.iter().enumerate() {
        let key = item_key(id, index);
        let claimed = db.transaction(|db| {
            let batch: Value = store::get(db, "template_production", id)?;
            if batch["cancelled"] == true {
                return Ok(None);
            }
            let mut item: Value = store::get(db, "template_production_item", &key)?;
            if item["status"] != "queued" && item["status"] != "compiling" {
                return Ok(None);
            }
            item["status"] = json!("compiling");
            item["revision"] = json!(item["revision"].as_u64().unwrap() + 1);
            store::put(db, "template_production_item", &key, &item)?;
            Ok(Some(item))
        })?;
        let Some(mut entry) = claimed else {
            continue;
        };
        let mut fixtures = vec![];
        let mut errors = vec![];
        for (n, fixture) in source.fixtures.iter().enumerate() {
            let mut request = fixture.clone();
            request.input.template = source.template.clone();
            request.idempotency_key = format!("{key}-fixture-{n}");
            let request_hash = fingerprint(&request);
            match compile(request.clone()).and_then(|out|{
                ensure!(out["deduplicated"]!=true,"production fixture must be unapplied");
                ensure!(out["elementCount"].as_u64().unwrap_or(0)>0,"template produced no editable elements");
                super::production_quality::validate_input_audio(&request, &out["document"], source.allow_silent_previews)?;
                Ok(out)
            }) {
                Ok(output)=>fixtures.push(json!({"index":n,"requestFingerprint":request_hash,"request":request,"compilation":output,"allowSilentPreviews":source.allow_silent_previews,"textMeasurementContractVersion":1,"textMeasurementGeometryCoverage":"constant_record_pose_v1"})),
                Err(error)=>errors.push(json!({"fixture":n,"message":format!("{error:#}")})),
            }
        }
        entry["status"] = json!(if errors.is_empty() {
            "render_ready"
        } else {
            "failed"
        });
        entry["errors"] = json!(errors);
        entry["revision"] = json!(entry["revision"].as_u64().unwrap() + 1);
        entry["updatedAt"] = json!(now());
        db.transaction(|db|{
            store::put(db,"template_production_output",&key,&json!({"template":source.template,"fixtures":fixtures,"validation":"compiled_only","aestheticQualityVerified":false}))?;
            store::put(db,"template_production_item",&key,&entry)
        })?;
    }
    Ok(())
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Control {
    pub action: String,
}
pub fn control(db: &Store, id: &str, input: Control) -> Result<Value> {
    ensure!(
        ["cancel", "resume", "retry_failed"].contains(&input.action.as_str()),
        "invalid production action"
    );
    db.transaction(|db| {
        let mut batch: Value = store::get(db, "template_production", id)?;
        let mut job: Job = store::get(db, "job", batch["jobId"].as_str().unwrap())?;
        if input.action == "cancel" {
            batch["cancelled"] = json!(true);
        } else {
            ensure!(
                super::production_runner::job(db, id)?.is_none_or(|j| j.status != "running"),
                "wait for current renderer to stop before resuming"
            );
            ensure!(
                job.status != "running",
                "wait for current production job to stop before retrying"
            );
            batch["cancelled"] = json!(false);
            for n in 0..batch["count"].as_u64().unwrap() as usize {
                let key = item_key(id, n);
                let mut entry: Value = store::get(db, "template_production_item", &key)?;
                if entry["status"] == "failed" && input.action == "retry_failed" {
                    entry["status"] = json!("queued");
                    entry["revision"] = json!(entry["revision"].as_u64().unwrap() + 1);
                    store::put(db, "template_production_item", &key, &entry)?;
                }
            }
            job.status = "queued".into();
            job.error = None;
            job.updated_at = now();
            store::put(db, "job", &job.id, &job)?;
            super::production_runner::queue(db, id)?;
        }
        store::put(db, "template_production", id, &batch)
    })?;
    read(db, id)
}

#[derive(Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preview {
    pub fixture: usize,
    pub request_fingerprint: String,
    pub path: std::path::PathBuf,
}
#[derive(Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Publish {
    pub base_revision: u64,
    pub previews: Vec<Preview>,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Audit {
    pub base_revision: u64,
}

pub fn audit_published(app: &App, id: &str, index: usize, input: Audit) -> Result<Value> {
    let key = item_key(id, index);
    let mut entry: Value = app.db.get("template_production_item", &key)?;
    ensure!(
        entry["revision"] == input.base_revision,
        "revision_conflict"
    );
    ensure!(
        entry["status"] == "published",
        "only published previews can be re-audited"
    );
    let output: Value = app.db.get("template_production_output", &key)?;
    let fixtures = output["fixtures"].as_array().context("missing fixtures")?;
    let mut passed = true;
    for preview in entry["previews"]
        .as_array_mut()
        .context("missing published previews")?
    {
        let result = (|| {
            let fixture = fixtures
                .iter()
                .find(|f| f["index"] == preview["fixture"])
                .context("preview fixture missing")?;
            let path =
                std::path::PathBuf::from(preview["path"].as_str().context("preview path missing")?);
            ensure!(
                path.starts_with(api::root(app).join("production")),
                "invalid production preview location"
            );
            ensure!(
                json!(crate::storage::hash(&path)?) == preview["sha256"],
                "published preview changed"
            );
            let probe = app.media.probe(&path)?;
            let expected = fixture["compilation"]["document"]["metadata"]["duration"]
                .as_f64()
                .context("compiled duration missing")?
                / crate::domain::TICKS as f64;
            super::production_quality::audit(app, &path, &probe, expected, fixture)
        })();
        preview["audioQuality"] = match result {
            Ok(value) => value,
            Err(error) => {
                passed = false;
                json!({"validated":false,"error":format!("{error:#}")})
            }
        };
    }
    entry["revision"] = json!(
        input
            .base_revision
            .checked_add(1)
            .context("revision overflow")?
    );
    entry["audioAuditStatus"] = json!(if passed { "passed" } else { "failed" });
    entry["audioAuditedAt"] = json!(now());
    app.db.transaction(|db| {
        let current: Value = store::get(db, "template_production_item", &key)?;
        ensure!(
            current["revision"] == input.base_revision,
            "revision_conflict"
        );
        store::put(
            db,
            "template_production_audio_audit",
            &format!("{key}-r{}", input.base_revision + 1),
            &entry,
        )?;
        store::put(db, "template_production_item", &key, &entry)?;
        Ok(entry)
    })
}

#[derive(Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RenderUpdate {
    pub base_revision: u64,
    pub fixture: usize,
    pub request_fingerprint: String,
    pub job_id: String,
    pub status: String,
    pub path: Option<std::path::PathBuf>,
    pub error: Option<String>,
    /// Optional renderer-declared facts. Validated against the fixture and bound
    /// to the actual MP4 hash at publication; not proof of browser measurement.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_measurements: Option<super::production_text_measurements::TextMeasurements>,
}
pub fn render_update(db: &Store, id: &str, index: usize, input: RenderUpdate) -> Result<Value> {
    ensure!(
        ["running", "completed", "failed"].contains(&input.status.as_str()),
        "invalid render status"
    );
    ensure!(
        !input.job_id.is_empty() && input.job_id.len() <= 200,
        "invalid render job ID"
    );
    ensure!(
        input.status != "completed" || input.path.is_some(),
        "completed render requires a file path"
    );
    ensure!(
        input.text_measurements.is_none() || input.status == "completed",
        "text measurements require a completed render"
    );
    db.transaction(|db| {
        let key = item_key(id, index);
        let mut entry: Value = store::get(db, "template_production_item", &key)?;
        ensure!(
            entry["revision"] == input.base_revision,
            "revision_conflict"
        );
        ensure!(
            entry["status"] == "render_ready",
            "item is not awaiting rendering"
        );
        let output: Value = store::get(db, "template_production_output", &key)?;
        let fixture = output["fixtures"]
            .as_array()
            .unwrap()
            .iter()
            .find(|f| {
                f["index"] == input.fixture && f["requestFingerprint"] == input.request_fingerprint
            })
            .context("unknown render fixture")?;
        if let Some(measurements) = &input.text_measurements {
            measurements.validate(fixture)?;
        }
        if !entry["renders"].is_object() {
            entry["renders"] = json!({});
        }
        entry["renders"][input.fixture.to_string()] = serde_json::to_value(&input)?;
        if input.text_measurements.is_none() {
            entry["renders"][input.fixture.to_string()]["textMeasurements"] =
                super::production_text_measurements::not_measured();
        }
        entry["revision"] = json!(input.base_revision + 1);
        entry["updatedAt"] = json!(now());
        store::put(db, "template_production_item", &key, &entry)?;
        Ok(entry)
    })
}

pub fn publish(app: &App, id: &str, index: usize, input: Publish) -> Result<Value> {
    let key = item_key(id, index);
    let hash = fingerprint(&input);
    let mut entry: Value = app.db.get("template_production_item", &key)?;
    if entry["status"] == "published" {
        ensure!(entry["publishHash"] == hash, "production publish conflict");
        return Ok(entry);
    }
    ensure!(
        entry["revision"] == input.base_revision,
        "revision_conflict"
    );
    ensure!(
        entry["status"] == "render_ready",
        "template is not ready for preview publication"
    );
    let source: Request = app.db.get("template_production_input", id)?;
    let output: Value = app.db.get("template_production_output", &key)?;
    let fixtures = output["fixtures"]
        .as_array()
        .context("missing production output")?;
    ensure!(
        input.previews.len() == fixtures.len(),
        "every fixture requires a rendered preview"
    );
    let mut seen = BTreeSet::new();
    let mut previews = vec![];
    let root = api::root(app).join("production").join(&key);
    std::fs::create_dir_all(&root)?;
    for p in &input.previews {
        ensure!(seen.insert(p.fixture), "duplicate preview fixture");
        let fixture = fixtures
            .iter()
            .find(|f| f["index"] == p.fixture)
            .context("unknown preview fixture")?;
        ensure!(
            fixture["requestFingerprint"] == p.request_fingerprint,
            "preview request fingerprint mismatch"
        );
        let path = p.path.canonicalize().context("preview file missing")?;
        ensure!(
            std::fs::metadata(&path)?.len() <= 512 * 1024 * 1024,
            "preview exceeds 512 MB"
        );
        let digest = crate::storage::hash(&path)?;
        let text_measurements = super::production_text_measurements::published(
            &entry["renders"][p.fixture.to_string()],
            fixture,
            &digest,
        )?;
        let owned = root.join(format!("{}-{digest}.mp4", p.fixture));
        if !owned.exists() {
            std::fs::copy(&path, &owned)?;
        }
        ensure!(
            crate::storage::hash(&owned)? == digest,
            "preview changed during copy"
        );
        let probe = app.media.probe(&owned)?;
        let video = probe["streams"]
            .as_array()
            .and_then(|s| s.iter().find(|s| s["codec_type"] == "video"))
            .context("preview has no video")?;
        let duration = probe["format"]["duration"]
            .as_str()
            .context("preview duration missing")?
            .parse::<f64>()?;
        let expected = fixture["compilation"]["document"]["metadata"]["duration"]
            .as_f64()
            .context("compiled duration missing")?
            / crate::domain::TICKS as f64;
        ensure!(
            duration.is_finite() && (duration - expected).abs() <= 0.25,
            "preview duration mismatch"
        );
        ensure!(
            video["width"] == source.items[index].template.canvas.width
                && video["height"] == source.items[index].template.canvas.height,
            "preview dimensions mismatch"
        );
        app.media.run(
            &app.media.ffmpeg,
            &[
                "-v".into(),
                "error".into(),
                "-xerror".into(),
                "-i".into(),
                owned.to_string_lossy().into(),
                "-map".into(),
                "0:v:0".into(),
                "-map".into(),
                "0:a?".into(),
                "-f".into(),
                "null".into(),
                "-".into(),
            ],
            180,
        )?;
        let audio_quality =
            super::production_quality::audit(app, &owned, &probe, expected, fixture)?;
        let observed_frame_sampling = super::exit_sampling::observe(
            &app.media,
            &owned,
            &fixture["compilation"]["exitSampling"],
            &digest,
        );
        previews.push(json!({"fixture":p.fixture,"requestFingerprint":p.request_fingerprint,"path":owned,"sha256":digest,"durationSeconds":duration,"decodeVerified":true,"audioQuality":audio_quality,"provenance":"renderer_supplied","textMeasurements":text_measurements,"exitSampling":fixture["compilation"]["exitSampling"],"observedFrameSampling":observed_frame_sampling}));
    }
    // Save has its own durable idempotency receipt, allowing recovery after publication interruption.
    let saved = if source.items[index].preview_only {
        json!({"template":{"revision":source.items[index].template.revision}})
    } else {
        api::save_template(
            app,
            api::Save {
                template: source.items[index].template.clone(),
                base_revision: source.items[index].base_revision,
                idempotency_key: format!("{key}-publish"),
            },
        )?
    };
    entry["status"] = json!("published");
    entry["revision"] = json!(input.base_revision + 1);
    entry["publishHash"] = json!(hash);
    entry["previews"] = json!(previews);
    entry["templateRevision"] = saved["template"]["revision"].clone();
    entry["previewOnly"] = json!(source.items[index].preview_only);
    entry["aestheticQualityVerified"] = json!(false);
    app.db.transaction(|db| {
        let current: Value = store::get(db, "template_production_item", &key)?;
        if current["status"] == "published" {
            ensure!(
                current["publishHash"] == hash,
                "production publish conflict"
            );
            return Ok(current);
        }
        ensure!(
            current["revision"] == input.base_revision,
            "revision_conflict"
        );
        store::put(db, "template_production_item", &key, &entry)?;
        Ok(entry)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request() -> Request {
        let mut fixture =
            super::super::composition_tests::request(super::super::composition_tests::input());
        fixture.document["metadata"] =
            json!({"id":"preview-one","name":"Template Production / one"});
        Request {
            idempotency_key: "batch-one".into(),
            name: "Test batch".into(),
            brief: "Distinct editable templates".into(),
            items: vec![Item {
                preview_only: false,
                template: fixture.input.template.clone(),
                base_revision: 0,
                allow_silent_previews: true,
                fixtures: vec![fixture],
            }],
        }
    }
    fn preview_record(path: &std::path::Path, fixture: usize) -> Value {
        json!({"fixture":fixture,"path":path,"durationSeconds":2.,"decodeVerified":true,"audioQuality":{"validated":true}})
    }
    fn published_batch(
        db: &Store,
        input: Request,
        created_at: u64,
        previews: Vec<Value>,
    ) -> String {
        let revision = input.items[0].template.revision;
        let preview_only = input.items[0].preview_only;
        let mut batch = enqueue(db, input).unwrap();
        let id = batch["id"].as_str().unwrap().to_owned();
        batch["createdAt"] = json!(created_at);
        db.put("template_production", &id, &batch).unwrap();
        let key = item_key(&id, 0);
        let mut entry: Value = db.get("template_production_item", &key).unwrap();
        entry["status"] = json!("published");
        entry["templateRevision"] = json!(revision);
        entry["previewOnly"] = json!(preview_only);
        entry["previews"] = json!(previews);
        db.put("template_production_item", &key, &entry).unwrap();
        id
    }
    #[test]
    fn malformed_overlay_fixture_is_rejected() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let mut input = request();
        input.items[0].fixtures[0].document["scenes"][0]["tracks"]["overlay"] = json!([{"type":"video","elements":[{"id":"visual","type":"image","mediaId":"visual"}]}]);
        assert!(
            enqueue(&db, input)
                .unwrap_err()
                .to_string()
                .contains("requires params")
        );
    }
    #[test]
    fn malformed_audio_fixture_is_rejected_before_queueing() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let mut input = request();
        input.items[0].fixtures[0].document["scenes"][0]["tracks"]["audio"] =
            json!([{"elements":[{"id":"voice","type":"audio","mediaId":"voice"}]}]);
        assert!(
            enqueue(&db, input.clone())
                .unwrap_err()
                .to_string()
                .contains("requires params")
        );
        let element = &mut input.items[0].fixtures[0].document["scenes"][0]["tracks"]["audio"][0]["elements"]
            [0];
        element["params"] = json!({"volume":0});
        assert!(
            enqueue(&db, input.clone())
                .unwrap_err()
                .to_string()
                .contains("valid source")
        );
        input.items[0].fixtures[0].document["scenes"][0]["tracks"]["audio"][0]["elements"][0]["sourceType"] =
            json!("upload");
        assert!(enqueue(&db, input).is_ok());
    }
    #[test]
    fn preview_catalog_excludes_stale_unpublished_and_failed_audits() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let file = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(file.path(), b"previously verified media").unwrap();
        let input = request();
        let mut template = input.items[0].template.clone();
        template.revision = 3;
        let batch = enqueue(&db, input).unwrap();
        let id = batch["id"].as_str().unwrap();
        db.put("template", &template.id, &template).unwrap();
        let key = item_key(id, 0);
        let mut entry: Value = db.get("template_production_item", &key).unwrap();
        entry["status"] = json!("published");
        entry["templateRevision"] = json!(2);
        entry["previews"] = json!([preview_record(file.path(), 0)]);
        db.put("template_production_item", &key, &entry).unwrap();
        assert!(
            previews(&db).unwrap()["previews"]
                .as_object()
                .unwrap()
                .is_empty()
        );
        entry["templateRevision"] = json!(3);
        db.put("template_production_item", &key, &entry).unwrap();
        let result = previews(&db).unwrap();
        assert_eq!(result["previews"][&template.id]["revision"], 3);
        entry["previewOnly"] = json!(true);
        db.put("template_production_item", &key, &entry).unwrap();
        assert!(
            previews(&db).unwrap()["previews"]
                .as_object()
                .unwrap()
                .is_empty()
        );
        entry["previewOnly"] = json!(false);
        assert_eq!(
            result["previews"][&template.id]["mediaUrl"],
            format!("/api/footage/templates/production/{id}/items/0/previews/0")
        );
        entry["previews"][0]["audioQuality"]["validated"] = json!(false);
        db.put("template_production_item", &key, &entry).unwrap();
        assert!(
            previews(&db).unwrap()["previews"]
                .as_object()
                .unwrap()
                .is_empty()
        );
        entry["previews"][0]["audioQuality"]["validated"] = json!(true);
        entry["status"] = json!("render_ready");
        db.put("template_production_item", &key, &entry).unwrap();
        assert!(
            previews(&db).unwrap()["previews"]
                .as_object()
                .unwrap()
                .is_empty()
        );
    }
    #[test]
    fn preview_catalog_accepts_saved_applications_but_rejects_unsaved_same_revision_drafts() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let file = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(file.path(), b"previously verified media").unwrap();
        let mut input = request();
        input.items[0].preview_only = true;
        input.items[0].template.revision = 3;
        let saved = input.items[0].template.clone();
        db.put("template", &saved.id, &saved).unwrap();

        let mut draft = input.clone();
        draft.items[0]
            .template
            .description
            .push_str(" unsaved edit");
        published_batch(&db, draft, 1, vec![preview_record(file.path(), 0)]);
        assert!(
            previews(&db).unwrap()["previews"]
                .as_object()
                .unwrap()
                .is_empty()
        );

        input.idempotency_key = "saved-application".into();
        let id = published_batch(&db, input, 2, vec![preview_record(file.path(), 0)]);
        let catalog = previews(&db).unwrap();
        assert_eq!(catalog["previews"][&saved.id]["batchId"], id);
        assert_eq!(catalog["previews"][&saved.id]["revision"], saved.revision);
        assert_eq!(
            db.get::<Template>("template", &saved.id).unwrap().revision,
            saved.revision
        );
    }
    #[test]
    fn preview_catalog_skips_missing_empty_and_nonfile_media_and_falls_back() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let directory = tempfile::tempdir().unwrap();
        let old_file = directory.path().join("old.mp4");
        let new_file = directory.path().join("new.mp4");
        let empty_file = directory.path().join("empty.mp4");
        std::fs::write(&old_file, b"previously verified old media").unwrap();
        std::fs::write(&new_file, b"previously verified new media").unwrap();
        std::fs::write(&empty_file, b"").unwrap();
        let input = request();
        let template = input.items[0].template.clone();
        db.put("template", &template.id, &template).unwrap();
        let older = published_batch(&db, input.clone(), 1, vec![preview_record(&old_file, 0)]);
        let mut newer_input = input;
        newer_input.idempotency_key = "newer-published".into();
        let newer = published_batch(
            &db,
            newer_input,
            2,
            vec![
                preview_record(&directory.path().join("missing.mp4"), 0),
                preview_record(&empty_file, 1),
                preview_record(directory.path(), 2),
                preview_record(&new_file, 3),
            ],
        );
        let catalog = previews(&db).unwrap();
        assert_eq!(catalog["previews"][&template.id]["batchId"], newer);
        assert_eq!(catalog["previews"][&template.id]["fixture"], 3);

        std::fs::remove_file(&new_file).unwrap();
        assert_eq!(
            previews(&db).unwrap()["previews"][&template.id]["batchId"],
            older
        );
        std::fs::remove_file(&old_file).unwrap();
        assert!(
            previews(&db).unwrap()["previews"]
                .as_object()
                .unwrap()
                .is_empty()
        );
    }
    #[test]
    fn preview_catalog_preserves_published_examples_over_newer_applications() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let file = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(file.path(), b"previously verified media").unwrap();
        let input = request();
        let template = input.items[0].template.clone();
        db.put("template", &template.id, &template).unwrap();
        let published =
            published_batch(&db, input.clone(), 1, vec![preview_record(file.path(), 0)]);
        let mut application = input;
        application.idempotency_key = "newer-application".into();
        application.items[0].preview_only = true;
        published_batch(&db, application, 2, vec![preview_record(file.path(), 0)]);
        assert_eq!(
            previews(&db).unwrap()["previews"][&template.id]["batchId"],
            published
        );
    }
    #[test]
    fn preview_links_preserve_fixture_identity_and_read_legacy_records_without_writes() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let mut input = request();
        let mut second = input.items[0].fixtures[0].clone();
        second.document["metadata"]["id"] = json!("preview-second");
        input.items[0].fixtures.push(second);
        let expected = json!([
            {"fixture":0,"projectId":input.items[0].fixtures[0].document["metadata"]["id"]},
            {"fixture":1,"projectId":"preview-second"}
        ]);
        let batch = enqueue(&db, input).unwrap();
        let id = batch["id"].as_str().unwrap();
        assert_eq!(
            read(&db, id).unwrap()["items"][0]["fixtureProjects"],
            expected
        );
        assert_eq!(item(&db, id, 0).unwrap()["fixtureProjects"], expected);

        let key = item_key(id, 0);
        let mut legacy: Value = db.get("template_production_item", &key).unwrap();
        legacy.as_object_mut().unwrap().remove("fixtureProjects");
        db.put("template_production_item", &key, &legacy).unwrap();
        assert_eq!(
            read(&db, id).unwrap()["items"][0]["fixtureProjects"],
            expected
        );
        assert_eq!(item(&db, id, 0).unwrap()["fixtureProjects"], expected);
        assert_eq!(
            db.get::<Value>("template_production_item", &key).unwrap(),
            legacy
        );
    }
    #[test]
    fn batch_replay_and_restart_do_not_duplicate_completed_work() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let input = request();
        let a = enqueue(&db, input.clone()).unwrap();
        assert_eq!(a, enqueue(&db, input.clone()).unwrap());
        let id = a["id"].as_str().unwrap();
        assert_eq!(read(&db, id).unwrap()["renderJob"]["status"], "queued");
        run_with(&db, id, compiler::compile).unwrap();
        assert_eq!(read(&db, id).unwrap()["summary"]["renderReady"], 1);
        run_with(&db, id, |_| panic!("completed item must not be recompiled")).unwrap();
        assert!(db.list::<Template>("template").unwrap().is_empty());
        let mut conflict = input;
        conflict.brief = "different".into();
        assert!(enqueue(&db, conflict).is_err());
    }
    #[test]
    fn duplicate_names_do_not_disguise_identical_designs() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let mut input = request();
        let mut second = input.items[0].clone();
        second.template.id = "renamed".into();
        second.template.name = "Different name".into();
        second.fixtures[0].document["metadata"]["id"] = json!("preview-two");
        input.items.push(second);
        let batch = enqueue(&db, input).unwrap();
        let id = batch["id"].as_str().unwrap();
        run_with(&db, id, compiler::compile).unwrap();
        let out = read(&db, id).unwrap();
        assert_eq!(out["items"][1]["status"], "rejected");
        assert_eq!(out["summary"]["renderReady"], 1);
    }
    #[test]
    fn new_fixtures_pin_measurement_contract_and_legacy_reads_do_not_retrofit_it() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let batch = enqueue(&db, request()).unwrap();
        let id = batch["id"].as_str().unwrap();
        run_with(&db, id, compiler::compile).unwrap();
        let key = item_key(id, 0);
        let current = item(&db, id, 0).unwrap();
        assert_eq!(
            current["output"]["fixtures"][0]["textMeasurementContractVersion"],
            1
        );
        assert_eq!(
            current["output"]["fixtures"][0]["textMeasurementGeometryCoverage"],
            "constant_record_pose_v1"
        );
        let mut legacy: Value = db.get("template_production_output", &key).unwrap();
        legacy["fixtures"][0]
            .as_object_mut()
            .unwrap()
            .remove("textMeasurementContractVersion");
        legacy["fixtures"][0]
            .as_object_mut()
            .unwrap()
            .remove("textMeasurementGeometryCoverage");
        db.put("template_production_output", &key, &legacy).unwrap();
        let reread = item(&db, id, 0).unwrap();
        assert!(
            reread["output"]["fixtures"][0]
                .get("textMeasurementContractVersion")
                .is_none()
        );
        assert!(
            reread["output"]["fixtures"][0]
                .get("textMeasurementGeometryCoverage")
                .is_none()
        );
        assert_eq!(reread["revision"], current["revision"]);
        assert_eq!(
            db.get::<Value>("template_production_output", &key).unwrap(),
            legacy
        );
        let updated = render_update(
            &db,
            id,
            0,
            RenderUpdate {
                base_revision: current["revision"].as_u64().unwrap(),
                fixture: 0,
                request_fingerprint: legacy["fixtures"][0]["requestFingerprint"]
                    .as_str()
                    .unwrap()
                    .into(),
                job_id: "legacy-export".into(),
                status: "completed".into(),
                path: Some("preview.mp4".into()),
                error: None,
                text_measurements: None,
            },
        )
        .unwrap();
        assert_eq!(
            updated["renders"]["0"]["textMeasurements"]["status"],
            "not_measured"
        );
    }
    #[test]
    fn speech_fixtures_require_audio_unless_silent_preview_is_explicit() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let mut input = request();
        input.items[0].allow_silent_previews = false;
        assert!(!input.items[0].fixtures[0].input.words.is_empty());
        let batch = enqueue(&db, input).unwrap();
        let id = batch["id"].as_str().unwrap();
        run_with(&db, id, compiler::compile).unwrap();
        let out = read(&db, id).unwrap();
        assert_eq!(out["summary"]["failed"], 1);
        assert!(
            out["items"][0]["errors"][0]["message"]
                .as_str()
                .unwrap()
                .contains("no audible timeline source")
        );
    }
    #[test]
    fn failed_fixture_is_reported_and_retry_keeps_successful_items() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let mut input = request();
        let mut second = input.items[0].clone();
        second.template.id = "second".into();
        second.template.elements[0].timing.max_seconds = 0.5;
        second.fixtures[0].document["metadata"]["id"] = json!("preview-two");
        input.items.push(second);
        let batch = enqueue(&db, input).unwrap();
        let id = batch["id"].as_str().unwrap();
        run_with(&db, id, |r| {
            if r.input.template.id == "second" {
                anyhow::bail!("fixture unavailable");
            }
            compiler::compile(r)
        })
        .unwrap();
        let out = read(&db, id).unwrap();
        assert_eq!(out["summary"]["failed"], 1);
        assert_eq!(
            out["items"][1]["errors"][0]["message"],
            "fixture unavailable"
        );
        control(
            &db,
            id,
            Control {
                action: "retry_failed".into(),
            },
        )
        .unwrap();
        let mut count = 0;
        run_with(&db, id, |r| {
            count += 1;
            compiler::compile(r)
        })
        .unwrap();
        assert_eq!(count, 1);
        assert_eq!(read(&db, id).unwrap()["summary"]["renderReady"], 2);
    }
    #[test]
    fn cancel_preserves_queue_and_render_updates_require_exact_revision_and_fixture() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let batch = enqueue(&db, request()).unwrap();
        let id = batch["id"].as_str().unwrap();
        control(
            &db,
            id,
            Control {
                action: "cancel".into(),
            },
        )
        .unwrap();
        run_with(&db, id, |_| panic!("cancelled batch")).unwrap();
        assert_eq!(read(&db, id).unwrap()["summary"]["queued"], 1);
        control(
            &db,
            id,
            Control {
                action: "resume".into(),
            },
        )
        .unwrap();
        run_with(&db, id, compiler::compile).unwrap();
        let item = item(&db, id, 0).unwrap();
        let update = || RenderUpdate {
            base_revision: 2,
            fixture: 0,
            request_fingerprint: item["output"]["fixtures"][0]["requestFingerprint"]
                .as_str()
                .unwrap()
                .into(),
            job_id: "export-one".into(),
            status: "running".into(),
            path: None,
            error: None,
            text_measurements: None,
        };
        assert_eq!(render_update(&db, id, 0, update()).unwrap()["revision"], 3);
        assert!(render_update(&db, id, 0, update()).is_err());
    }

    #[test]
    fn pause_cannot_be_undone_while_renderer_is_still_running() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let batch = enqueue(&db, request()).unwrap();
        let id = batch["id"].as_str().unwrap();
        let mut renderer = db.claim_kinds(&["template_render"]).unwrap().unwrap();
        control(
            &db,
            id,
            Control {
                action: "cancel".into(),
            },
        )
        .unwrap();
        for action in ["resume", "retry_failed"] {
            assert!(
                control(
                    &db,
                    id,
                    Control {
                        action: action.into()
                    }
                )
                .is_err()
            );
        }
        assert_eq!(read(&db, id).unwrap()["cancelled"], true);
        renderer.status = "succeeded".into();
        db.put("job", &renderer.id, &renderer).unwrap();
        let resumed = control(
            &db,
            id,
            Control {
                action: "resume".into(),
            },
        )
        .unwrap();
        assert_eq!(resumed["cancelled"], false);
        assert_eq!(resumed["renderJob"]["status"], "queued");
    }
}
