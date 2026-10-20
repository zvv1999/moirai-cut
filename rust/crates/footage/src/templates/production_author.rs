use super::{
    compiler::CompileInput,
    events::TimeEvent,
    model::{ResourceBinding, Template, valid_id},
    production,
    rhythm::{self, PlanInput, SemanticUnit, WordSpan},
    search::fingerprint,
    sound_events::SoundEvent,
    source_layout::SourceRef,
    transcription::{self, Input, Transcript},
    visual_compile::FocalPoint,
};
use crate::{
    domain::{TICKS, now},
    service::App,
    storage, store,
};
use anyhow::{Context, Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Design {
    pub template: Template,
    #[serde(default)]
    pub base_revision: u64,
}

#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Sample {
    pub input_id: String,
    /// Pin the reviewed transcript; omit only for inputs driven by explicit sound/time events.
    pub transcript_revision: Option<u64>,
    pub title: String,
    #[serde(default)]
    pub translations: Vec<String>,
    #[serde(default)]
    pub semantic_units: Vec<SemanticUnit>,
    #[serde(default)]
    pub caption_spans: Vec<WordSpan>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub layout_phrases: Vec<super::rhythm::LayoutPhrase>,
    /// Content-specific segmentation and reading thresholds; never saved into the style.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caption_policy: Option<super::model::SegmentationPolicy>,
    #[serde(default)]
    pub events: Vec<TimeEvent>,
    #[serde(default)]
    pub sound_events: Vec<SoundEvent>,
    #[serde(default)]
    pub resource_bindings: Vec<ResourceBinding>,
    /// Per-design overrides take precedence over shared sample bindings.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub design_resource_bindings: BTreeMap<String, Vec<ResourceBinding>>,
    pub focal_point: Option<FocalPoint>,
}

#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub preview_only: bool,
    pub idempotency_key: String,
    pub name: String,
    pub brief: String,
    pub designs: Vec<Design>,
    pub samples: Vec<Sample>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Prepare {
    pub request: Request,
    /// Supplied by the platform's existing empty-project serializer, never an existing project.
    pub document_prototype: Value,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SamplePreview {
    pub template: Template,
    pub sample: Sample,
}

pub fn preview_sample(app: &App, request: SamplePreview) -> Result<Value> {
    request.template.validate()?;
    ensure!(
        !request
            .template
            .elements
            .iter()
            .any(|element| element.features.representation == super::model::Representation::Audio),
        "live preview supports source audio only; use rendered preview for sound treatments"
    );
    let input: Input = app.db.get("template_input", &request.sample.input_id)?;
    let transcript = if request.sample.transcript_revision.is_some() {
        Some(app.db.get::<Transcript>("template_transcript", &input.id)?)
    } else {
        None
    };
    let plan = plan_input(
        &request.sample,
        &input,
        transcript.as_ref(),
        &request.template,
    )?;
    let (mut media, media_sources) = super::assets::preview_media(app, plan.resolved_template()?)?;
    let metadata = source_metadata(app, &input)?;
    media[metadata["id"].as_str().unwrap()] = metadata.clone();
    let prototype = json!({"version":31,"metadata":{},"settings":{},"scenes":[{"tracks":{"main":{"type":"video","elements":[]},"overlay":[],"audio":[]}}]});
    let document = fixture_document(
        &prototype,
        "live-effect",
        "Live effect preview",
        &input,
        metadata["id"].as_str().unwrap(),
        &request.template,
    );
    let source = (input.media_kind == "video").then(|| SourceRef {
        track_id: "live-effect-main".into(),
        element_id: "live-effect-source".into(),
        focal_point: request.sample.focal_point.clone(),
    });
    let result = super::compiler::compile(CompileInput {
        input: plan,
        document,
        scene_id: "live-effect-scene".into(),
        base_revision: 1,
        idempotency_key: "live-effect".into(),
        start_time_seconds: 0.,
        source,
        media,
        visual_bindings: vec![],
    })?;
    Ok(
        json!({"canvas":request.template.canvas,"durationSeconds":input.duration_seconds,
        "tracks":result["document"]["scenes"][0]["tracks"],"warnings":result["warnings"],"exitSampling":result["exitSampling"],"captions":result["plan"]["captions"],"mediaSources":media_sources,
        "timingSource":if transcript.is_some(){"measured_transcript"}else{"explicit_events"},
        "sourceMedia":{"id":metadata["id"],"name":input.name,"type":input.media_kind,"width":metadata["width"],"height":metadata["height"],
            "duration":input.duration_seconds,"sha256":input.sha256,"url":format!("/api/footage/templates/inputs/{}/media/original",input.id)},
        "audioUrl":format!("/api/footage/templates/inputs/{}/media/audio",input.id)}),
    )
}

/// Read-only validation shared by UI content import and agent callers.
#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SampleValidation {
    pub template: Template,
    pub samples: Vec<Sample>,
}

pub fn validate_samples(app: &App, request: SampleValidation) -> Result<Value> {
    let designs = [Design {
        template: request.template,
        base_revision: 0,
    }];
    validate_design_samples(&designs, &request.samples)?;
    let mut plans = Vec::new();
    for sample in &request.samples {
        let input: Input = app.db.get("template_input", &sample.input_id)?;
        let transcript = if sample.transcript_revision.is_some() {
            Some(app.db.get::<Transcript>("template_transcript", &input.id)?)
        } else {
            None
        };
        let plan = rhythm::plan(plan_input(
            sample,
            &input,
            transcript.as_ref(),
            &designs[0].template,
        )?)?;
        plans.push(json!({"inputId": input.id, "plan": plan}));
    }
    Ok(json!({"validated": true, "samples": plans}))
}

fn validate_request(request: &Request) -> Result<()> {
    ensure!(
        valid_id(&request.idempotency_key),
        "invalid authoring idempotency key"
    );
    ensure!(
        !request.name.trim().is_empty() && request.name.len() <= 300 && request.brief.len() <= 8000,
        "invalid authoring brief"
    );
    validate_design_samples(&request.designs, &request.samples)
}

pub(super) fn validate_design_samples(designs: &[Design], samples: &[Sample]) -> Result<()> {
    ensure!(
        (1..=100).contains(&designs.len()) && (1..=8).contains(&samples.len()),
        "authoring requires 1-100 designs and 1-8 samples"
    );
    let mut design_ids = BTreeSet::new();
    for design in designs {
        ensure!(
            design_ids.insert(&design.template.id),
            "duplicate design ID"
        );
        design.template.validate()?;
    }
    let mut sample_ids = BTreeSet::new();
    for sample in samples {
        ensure!(
            valid_id(&sample.input_id) && sample_ids.insert(&sample.input_id),
            "invalid or duplicate sample ID"
        );
        ensure!(sample.title.len() <= 2000, "sample title too long");
        for (design_id, bindings) in &sample.design_resource_bindings {
            let design = designs
                .iter()
                .find(|d| &d.template.id == design_id)
                .context("resource override references unknown design")?;
            let mut slots = BTreeSet::new();
            for binding in bindings {
                ensure!(
                    slots.insert(&binding.slot_id),
                    "duplicate design resource override"
                );
                ensure!(
                    design
                        .template
                        .resource_slots
                        .iter()
                        .any(|slot| slot.id == binding.slot_id),
                    "resource override references unknown slot in design {}: {}",
                    design_id,
                    binding.slot_id
                );
            }
        }
        if sample.transcript_revision.is_none() {
            ensure!(
                !sample.events.is_empty() || !sample.sound_events.is_empty(),
                "sample requires a pinned transcript or explicit sound/time events"
            );
        }
        if let Some(point) = &sample.focal_point {
            super::visual_compile::focal_shift(Some(point), 1., 1., 1., 1.)?;
        }
    }
    Ok(())
}

fn prototype_is_empty(document: &Value) -> Result<()> {
    ensure!(
        document["version"].as_u64().is_some() && document["settings"].is_object(),
        "invalid empty project prototype"
    );
    let scenes = document["scenes"]
        .as_array()
        .context("missing prototype scene")?;
    ensure!(scenes.len() == 1, "prototype must have one empty scene");
    let tracks = &scenes[0]["tracks"];
    for array in [
        &tracks["main"]["elements"],
        &tracks["overlay"],
        &tracks["audio"],
    ] {
        ensure!(
            array.as_array().is_some_and(Vec::is_empty),
            "prototype must be empty"
        );
    }
    Ok(())
}

pub(super) fn plan_input(
    sample: &Sample,
    input: &Input,
    transcript: Option<&Transcript>,
    template: &Template,
) -> Result<PlanInput> {
    let words = if let Some(revision) = sample.transcript_revision {
        let transcript = transcript.context("sample transcription is not ready")?;
        ensure!(
            transcript.revision == revision
                && transcript.input_id == input.id
                && transcript.source_sha256 == input.sha256,
            "sample transcript revision or source changed"
        );
        transcript.words.clone()
    } else {
        vec![]
    };
    let mut resource_bindings = sample.resource_bindings.clone();
    if let Some(overrides) = sample.design_resource_bindings.get(&template.id) {
        resource_bindings
            .retain(|binding| !overrides.iter().any(|item| item.slot_id == binding.slot_id));
        resource_bindings.extend(overrides.iter().cloned());
    }
    Ok(PlanInput {
        template: template.clone(),
        words,
        duration_seconds: input.duration_seconds,
        title: sample.title.clone(),
        translations: sample.translations.clone(),
        semantic_units: sample.semantic_units.clone(),
        caption_spans: sample.caption_spans.clone(),
        layout_phrases: sample.layout_phrases.clone(),
        caption_policy: sample.caption_policy.clone(),
        events: sample.events.clone(),
        sound_events: sample.sound_events.clone(),
        resource_bindings,
        quiet_gap_seconds: None,
        receipt_input: None,
    })
}

fn fixture_document(
    prototype: &Value,
    project_id: &str,
    name: &str,
    input: &Input,
    asset_id: &str,
    template: &Template,
) -> Value {
    let mut document = prototype.clone();
    let scene_id = format!("{project_id}-scene");
    let track_id = format!("{project_id}-main");
    document["metadata"]["id"] = json!(project_id);
    document["metadata"]["name"] = json!(name);
    document["metadata"]["duration"] =
        json!((input.duration_seconds * TICKS as f64).round() as i64);
    document["currentSceneId"] = json!(scene_id);
    document["settings"]["canvasSize"] =
        json!({"width":template.canvas.width,"height":template.canvas.height});
    document["settings"]["fps"] = json!({"numerator":template.canvas.fps,"denominator":1});
    document["revision"] = json!(1);
    let scene = &mut document["scenes"][0];
    scene["id"] = json!(scene_id);
    scene["tracks"]["main"]["id"] = json!(track_id);
    let mut source = json!({"id":format!("{project_id}-source"),"name":input.name,"type":input.media_kind,"mediaId":asset_id,
        "startTime":0,"duration":(input.duration_seconds*TICKS as f64).round() as i64,"trimStart":0,"trimEnd":0,"params":{"volume":0,"muted":false}});
    if input.media_kind == "video" {
        scene["tracks"]["main"]["elements"] = json!([source]);
    } else {
        source["sourceType"] = json!("upload");
        scene["tracks"]["audio"] = json!([{"id":format!("{project_id}-audio"),"name":"Source audio","type":"audio","muted":false,"elements":[source]}]);
    }
    document
}

fn source_metadata(app: &App, input: &Input) -> Result<Value> {
    let (path, _) = transcription::file(app, &input.id, "original")?;
    ensure!(
        storage::hash(&path)? == input.sha256,
        "sample source hash mismatch"
    );
    let mut metadata = json!({"id":format!("sample-{}",input.id),"name":input.name,"type":input.media_kind,
        "ext":"bin","mimeType":"application/octet-stream","size":std::fs::metadata(&path)?.len(),
        "lastModified":input.created_at*1000,"duration":input.duration_seconds,"hasAudio":true,
        "templateInput":{"id":input.id,"sha256":input.sha256}});
    if input.media_kind == "video" {
        let source = app.media.source(
            &path,
            input.name.clone(),
            String::new(),
            String::new(),
            input.sha256.clone(),
            input.id.clone(),
        )?;
        metadata["width"] = json!(source.width);
        metadata["height"] = json!(source.height);
        metadata["fps"] = json!(source.fps);
    }
    Ok(metadata)
}

fn with_batch(app: &App, mut draft: Value) -> Result<Value> {
    let batch_id = production::batch_id(draft["manifest"]["idempotencyKey"].as_str().unwrap());
    draft["batchId"] = json!(batch_id);
    draft["batch"] = if app
        .db
        .list::<Value>("template_production")?
        .iter()
        .any(|b| b["id"] == batch_id)
    {
        production::read(&app.db, &batch_id)?
    } else {
        Value::Null
    };
    Ok(draft)
}

pub fn prepare(app: &App, input: Prepare) -> Result<Value> {
    validate_request(&input.request)?;
    let id = format!(
        "draft-{}",
        &fingerprint(&input.request.idempotency_key)[..32]
    );
    let hash = fingerprint(&input.request);
    let existing = app
        .db
        .list::<Value>("template_production_draft")?
        .into_iter()
        .find(|d| d["id"] == id);
    if let Some(existing) = existing {
        ensure!(
            existing["requestHash"] == hash,
            "authoring idempotency conflict"
        );
        return with_batch(app, existing);
    }
    prototype_is_empty(&input.document_prototype)?;
    let library = app.db.list::<Template>("template")?;
    for design in &input.request.designs {
        let revision = library
            .iter()
            .find(|t| t.id == design.template.id)
            .map_or(0, |t| t.revision);
        ensure!(
            revision == design.base_revision,
            "template revision changed: {}",
            design.template.id
        );
    }
    let mut sources = vec![];
    for sample in &input.request.samples {
        let media: Input = app.db.get("template_input", &sample.input_id)?;
        let transcript = if sample.transcript_revision.is_some() {
            Some(app.db.get::<Transcript>("template_transcript", &media.id)?)
        } else {
            None
        };
        let metadata = source_metadata(app, &media)?;
        sources.push((media, transcript, metadata));
    }
    let mut items = vec![];
    let mut warnings = vec![];
    for (i, design) in input.request.designs.iter().enumerate() {
        let mut fixtures = vec![];
        for (j, sample) in input.request.samples.iter().enumerate() {
            let (media, transcript, metadata) = &sources[j];
            let plan = plan_input(sample, media, transcript.as_ref(), &design.template)?;
            warnings.push(
                json!({"design":i,"sample":j,"warnings":rhythm::plan(plan.clone())?.warnings}),
            );
            let project_id = format!("tpl-preview-{}-{i}-{j}", &id[6..]);
            let document = fixture_document(
                &input.document_prototype,
                &project_id,
                &format!(
                    "Template Production / {} / {}",
                    design.template.name, sample.title
                ),
                media,
                metadata["id"].as_str().unwrap(),
                &design.template,
            );
            let source = (media.media_kind == "video").then(|| SourceRef {
                track_id: document["scenes"][0]["tracks"]["main"]["id"]
                    .as_str()
                    .unwrap()
                    .into(),
                element_id: format!("{project_id}-source"),
                focal_point: sample.focal_point.clone(),
            });
            let mut index = serde_json::Map::new();
            index.insert(metadata["id"].as_str().unwrap().into(), metadata.clone());
            fixtures.push(CompileInput {
                input: plan,
                scene_id: document["currentSceneId"].as_str().unwrap().into(),
                document,
                base_revision: 1,
                idempotency_key: format!("{id}-{i}-{j}"),
                start_time_seconds: 0.,
                source,
                media: Value::Object(index),
                visual_bindings: vec![],
            });
        }
        items.push(production::Item {
            preview_only: input.request.preview_only,
            template: design.template.clone(),
            base_revision: design.base_revision,
            allow_silent_previews: false,
            fixtures,
        });
    }
    let manifest = production::Request {
        idempotency_key: id.clone(),
        name: input.request.name.clone(),
        brief: input.request.brief.clone(),
        items,
    };
    let assets = sources.iter().map(|(source,_,metadata)| json!({"inputId":source.id,"sha256":source.sha256,"metadata":metadata,"mediaPath":format!("/api/footage/templates/inputs/{}/media/original",source.id)})).collect::<Vec<_>>();
    let draft = json!({"id":id,"requestHash":hash,"request":input.request,"manifest":manifest,"assets":assets,"warnings":warnings,"createdAt":now()});
    let saved = app.db.transaction(|db| {
        if let Some(existing) = store::list::<Value>(db, "template_production_draft")?
            .into_iter()
            .find(|d| d["id"] == id)
        {
            ensure!(
                existing["requestHash"] == hash,
                "authoring idempotency conflict"
            );
            return Ok(existing);
        }
        store::put(db, "template_production_draft", &id, &draft)?;
        Ok(draft)
    })?;
    with_batch(app, saved)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup(path: &std::path::Path) -> (App, Request, Value) {
        let app = App {
            db: store::Store::open(&path.join("state.sqlite3")).unwrap(),
            config: crate::service::Config {
                data_dir: path.into(),
                nas_root: Default::default(),
                require_smb: false,
                ffmpeg: String::new(),
                ffprobe: String::new(),
                port: 0,
            },
            media: crate::media::Media {
                root: path.into(),
                ffmpeg: String::new(),
                ffprobe: String::new(),
            },
            home: path.into(),
            token: "test".into(),
        };
        let plan: PlanInput =
            serde_json::from_value(super::super::composition_tests::input()).unwrap();
        let directory = path.join("templates/inputs/input-test");
        std::fs::create_dir_all(&directory).unwrap();
        let original = directory.join("original");
        std::fs::write(&original, b"immutable audio fixture").unwrap();
        let source = Input {
            id: "input-test".into(),
            name: "Measured voice".into(),
            sha256: storage::hash(&original).unwrap(),
            duration_seconds: plan.duration_seconds,
            media_kind: "audio".into(),
            width: None,
            height: None,
            created_at: 1,
        };
        let transcript = Transcript {
            revision: 3,
            corrections: vec![],
            input_id: source.id.clone(),
            source_sha256: source.sha256.clone(),
            engine: "fixture".into(),
            model_sha256: None,
            engine_version: None,
            language: "zh".into(),
            language_probability: 1.,
            raw_words: vec![],
            words: plan.words.clone(),
            text: String::new(),
            segments: vec![],
            warnings: vec![],
            created_at: 1,
        };
        app.db.put("template_input", &source.id, &source).unwrap();
        app.db
            .put("template_transcript", &source.id, &transcript)
            .unwrap();
        let request = Request {
            preview_only: false,
            idempotency_key: "author-test".into(),
            name: "Batch".into(),
            brief: String::new(),
            designs: vec![Design {
                template: plan.template,
                base_revision: 0,
            }],
            samples: vec![Sample {
                input_id: source.id,
                transcript_revision: Some(3),
                title: plan.title,
                translations: plan.translations,
                semantic_units: plan.semantic_units,
                caption_spans: plan.caption_spans,
                layout_phrases: plan.layout_phrases,
                caption_policy: plan.caption_policy,
                events: plan.events,
                sound_events: plan.sound_events,
                resource_bindings: vec![],
                design_resource_bindings: BTreeMap::new(),
                focal_point: None,
            }],
        };
        let prototype = json!({"version":31,"metadata":{"id":"unused","name":"prototype","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"},"settings":{"background":{"type":"color","color":"#000000"}},"scenes":[{"id":"scene","isMain":true,"tracks":{"main":{"id":"main","type":"video","elements":[]},"audio":[],"overlay":[]}}]});
        (app, request, prototype)
    }

    #[test]
    fn content_import_validation_reuses_production_constraints_without_mutation() {
        let dir = tempfile::tempdir().unwrap();
        let (app, request, _) = setup(dir.path());
        let make = |samples| SampleValidation {
            template: request.designs[0].template.clone(),
            samples,
        };
        let before = serde_json::to_value(
            app.db
                .get::<Transcript>("template_transcript", "input-test")
                .unwrap(),
        )
        .unwrap();
        let result = validate_samples(&app, make(request.samples.clone())).unwrap();
        assert_eq!(result["validated"], true);
        assert_eq!(result["samples"][0]["inputId"], "input-test");
        assert!(
            validate_samples(
                &app,
                make(vec![request.samples[0].clone(), request.samples[0].clone()])
            )
            .unwrap_err()
            .to_string()
            .contains("duplicate sample")
        );
        let mut stale = request.samples.clone();
        stale[0].transcript_revision = Some(999);
        assert!(
            validate_samples(&app, make(stale))
                .unwrap_err()
                .to_string()
                .contains("revision or source changed")
        );
        let mut focus = request.samples.clone();
        focus[0].focal_point = Some(FocalPoint { x: 2., y: 0.5 });
        assert!(validate_samples(&app, make(focus)).is_err());
        let mut ranges = request.samples.clone();
        ranges[0].caption_spans = vec![WordSpan {
            start_word: 1,
            end_word: 2,
        }];
        assert!(validate_samples(&app, make(ranges)).is_err());
        let mut bindings = request.samples.clone();
        bindings[0]
            .design_resource_bindings
            .insert("other-design".into(), vec![]);
        assert!(
            validate_samples(&app, make(bindings))
                .unwrap_err()
                .to_string()
                .contains("unknown design")
        );
        assert!(app.db.list::<Value>("job").unwrap().is_empty());
        assert_eq!(
            serde_json::to_value(
                app.db
                    .get::<Transcript>("template_transcript", "input-test")
                    .unwrap()
            )
            .unwrap(),
            before
        );
    }

    #[test]
    fn sample_caption_policy_reaches_native_plan_without_changing_style() {
        let dir = tempfile::tempdir().unwrap();
        let (app, mut request, _) = setup(dir.path());
        let template = &request.designs[0].template;
        let original = serde_json::to_value(template).unwrap();
        assert!(
            serde_json::to_value(&request.samples[0])
                .unwrap()
                .get("captionPolicy")
                .is_none()
        );
        let mut policy = template.segmentation.clone();
        policy.max_characters = 42;
        request.samples[0].caption_policy = Some(policy);
        let source: Input = app.db.get("template_input", "input-test").unwrap();
        let transcript: Transcript = app.db.get("template_transcript", "input-test").unwrap();
        let input = plan_input(&request.samples[0], &source, Some(&transcript), template).unwrap();
        assert_eq!(
            input
                .resolved_template()
                .unwrap()
                .segmentation
                .max_characters,
            42
        );
        assert_eq!(
            serde_json::to_value(&input.words).unwrap(),
            serde_json::to_value(&transcript.words).unwrap()
        );
        assert_eq!(serde_json::to_value(template).unwrap(), original);
        assert!(
            preview_sample(
                &app,
                SamplePreview {
                    template: template.clone(),
                    sample: request.samples[0].clone()
                }
            )
            .is_ok()
        );
        request.samples[0]
            .caption_policy
            .as_mut()
            .unwrap()
            .max_characters = 61;
        assert!(
            preview_sample(
                &app,
                SamplePreview {
                    template: template.clone(),
                    sample: request.samples[0].clone()
                }
            )
            .is_err()
        );
    }

    #[test]
    fn measured_preview_is_ephemeral_and_rejects_stale_transcripts() {
        let dir = tempfile::tempdir().unwrap();
        let (app, request, _) = setup(dir.path());
        let before: Transcript = app.db.get("template_transcript", "input-test").unwrap();
        let output = preview_sample(
            &app,
            SamplePreview {
                template: request.designs[0].template.clone(),
                sample: request.samples[0].clone(),
            },
        )
        .unwrap();
        assert_eq!(output["timingSource"], "measured_transcript");
        let expected = validate_samples(
            &app,
            SampleValidation {
                template: request.designs[0].template.clone(),
                samples: request.samples.clone(),
            },
        )
        .unwrap();
        assert_eq!(
            output["captions"],
            expected["samples"][0]["plan"]["captions"]
        );
        assert_eq!(output["sourceMedia"]["id"], "sample-input-test");
        assert!(!output["tracks"]["overlay"].as_array().unwrap().is_empty());
        assert_eq!(
            output["tracks"]["audio"][0]["elements"][0]["mediaId"],
            "sample-input-test"
        );
        assert!(app.db.list::<Value>("job").unwrap().is_empty());
        assert_eq!(
            serde_json::to_value(
                app.db
                    .get::<Transcript>("template_transcript", "input-test")
                    .unwrap()
            )
            .unwrap(),
            serde_json::to_value(before).unwrap()
        );
        let mut sample = request.samples[0].clone();
        sample.transcript_revision = Some(2);
        assert!(
            preview_sample(
                &app,
                SamplePreview {
                    template: request.designs[0].template.clone(),
                    sample
                }
            )
            .unwrap_err()
            .to_string()
            .contains("revision or source changed")
        );
    }

    #[test]
    fn measured_preview_materializes_visual_bindings_and_rejects_corrupt_blobs() {
        let dir = tempfile::tempdir().unwrap();
        let (app, request, _) = setup(dir.path());
        let blobs = dir.path().join("templates/assets/blobs");
        std::fs::create_dir_all(&blobs).unwrap();
        let file = blobs.join("fixture");
        std::fs::write(&file, b"visual metadata fixture").unwrap();
        let hash = storage::hash(&file).unwrap();
        let path = blobs.join(format!("{hash}.png"));
        std::fs::rename(file, &path).unwrap();
        let asset = super::super::assets::Asset {
            id: "visual-test".into(),
            sha256: hash.clone(),
            source_sha256: hash,
            name: "Icon".into(),
            description: "Fixture".into(),
            tags: vec![],
            provenance: "Unit test".into(),
            kind: super::super::assets::Kind::Image,
            width: 100,
            height: 100,
            duration: None,
            size: 23,
            created_at: 1,
        };
        app.db
            .put("template_visual_asset", &asset.id, &asset)
            .unwrap();
        let (template, _) =
            super::super::element_edit::insert_asset(request.designs[0].template.clone(), &asset)
                .unwrap();
        let output = preview_sample(
            &app,
            SamplePreview {
                template: template.clone(),
                sample: request.samples[0].clone(),
            },
        )
        .unwrap();
        assert_eq!(output["mediaSources"][0]["id"], asset.id);
        assert!(
            output["tracks"]["overlay"]
                .as_array()
                .unwrap()
                .iter()
                .flat_map(|t| t["elements"].as_array().unwrap())
                .any(|e| e["mediaId"] == asset.id)
        );
        std::fs::write(path, b"modified bytes").unwrap();
        assert!(
            preview_sample(
                &app,
                SamplePreview {
                    template,
                    sample: request.samples[0].clone()
                }
            )
            .unwrap_err()
            .to_string()
            .contains("hash mismatch")
        );
    }

    #[test]
    fn design_overrides_are_isolated_and_preserve_legacy_serialization() {
        let dir = tempfile::tempdir().unwrap();
        let (app, mut request, prototype) = setup(dir.path());
        assert!(
            serde_json::to_value(&request.samples[0])
                .unwrap()
                .get("designResourceBindings")
                .is_none()
        );
        let mut second = request.designs[0].clone();
        second.template.id = "second".into();
        request.designs[0].template.resource_slots.push(
            serde_json::from_value(json!({
                "id":"decoration", "representation":"image", "description":"Image", "tags":[]
            }))
            .unwrap(),
        );
        second.template.resource_slots.push(
            serde_json::from_value(json!({
                "id":"decoration", "representation":"video", "description":"Video", "tags":[]
            }))
            .unwrap(),
        );
        let first_id = request.designs[0].template.id.clone();
        request.designs.push(second);
        request.samples[0].design_resource_bindings.insert(
            first_id.clone(),
            vec![ResourceBinding {
                slot_id: "decoration".into(),
                asset_id: "image-asset".into(),
                enabled: true,
            }],
        );
        let draft = prepare(
            &app,
            Prepare {
                request: request.clone(),
                document_prototype: prototype,
            },
        )
        .unwrap();
        let items = &draft["manifest"]["items"];
        assert_eq!(
            items[0]["fixtures"][0]["input"]["resourceBindings"][0]["assetId"],
            "image-asset"
        );
        assert_eq!(
            items[1]["fixtures"][0]["input"]["resourceBindings"],
            json!([])
        );
        request.samples[0].resource_bindings = vec![ResourceBinding {
            slot_id: "decoration".into(),
            asset_id: "shared-asset".into(),
            enabled: true,
        }];
        let source: Input = app.db.get("template_input", "input-test").unwrap();
        let transcript: Transcript = app.db.get("template_transcript", "input-test").unwrap();
        let plan = plan_input(
            &request.samples[0],
            &source,
            Some(&transcript),
            &request.designs[0].template,
        )
        .unwrap();
        assert_eq!(plan.resource_bindings.len(), 1);
        assert_eq!(plan.resource_bindings[0].asset_id, "image-asset");
        let binding = request.samples[0].design_resource_bindings[&first_id][0].clone();
        request.samples[0]
            .design_resource_bindings
            .get_mut(&first_id)
            .unwrap()
            .push(binding);
        assert!(
            validate_request(&request)
                .unwrap_err()
                .to_string()
                .contains("duplicate")
        );
        request.samples[0]
            .design_resource_bindings
            .get_mut(&first_id)
            .unwrap()
            .pop();
        request.samples[0]
            .design_resource_bindings
            .get_mut(&first_id)
            .unwrap()[0]
            .slot_id = "unknown".into();
        assert!(
            validate_request(&request)
                .unwrap_err()
                .to_string()
                .contains("unknown slot")
        );
        request.samples[0]
            .design_resource_bindings
            .insert("absent".into(), vec![]);
        assert!(
            validate_request(&request)
                .unwrap_err()
                .to_string()
                .contains("unknown design")
        );
    }

    #[test]
    fn preparation_pins_words_and_expands_editable_sources_with_durable_replay() {
        let dir = tempfile::tempdir().unwrap();
        let (app, request, prototype) = setup(dir.path());
        let draft = prepare(
            &app,
            Prepare {
                request: request.clone(),
                document_prototype: prototype.clone(),
            },
        )
        .unwrap();
        let manifest: production::Request =
            serde_json::from_value(draft["manifest"].clone()).unwrap();
        let fixture = &manifest.items[0].fixtures[0];
        let transcript: Transcript = app.db.get("template_transcript", "input-test").unwrap();
        assert_eq!(
            serde_json::to_value(&fixture.input.words).unwrap(),
            json!(transcript.words)
        );
        let audio = &fixture.document["scenes"][0]["tracks"]["audio"][0]["elements"][0];
        assert_eq!(audio["sourceType"], "upload");
        assert_eq!(
            audio["duration"],
            (fixture.input.duration_seconds * TICKS as f64).round() as i64
        );
        assert!(fixture.source.is_none());
        let compiled = super::super::compiler::compile(fixture.clone()).unwrap();
        super::super::production_quality::validate_input_audio(
            fixture,
            &compiled["document"],
            false,
        )
        .unwrap();
        let mut changed = transcript;
        changed.revision += 1;
        app.db
            .put("template_transcript", "input-test", &changed)
            .unwrap();
        assert_eq!(
            draft,
            prepare(
                &app,
                Prepare {
                    request: request.clone(),
                    document_prototype: Value::Null
                }
            )
            .unwrap()
        );
        let mut conflict = request.clone();
        conflict.brief = "changed".into();
        assert!(
            prepare(
                &app,
                Prepare {
                    request: conflict,
                    document_prototype: prototype.clone()
                }
            )
            .unwrap_err()
            .to_string()
            .contains("idempotency conflict")
        );
        let batch = production::enqueue(&app.db, manifest).unwrap();
        let replay = prepare(
            &app,
            Prepare {
                request,
                document_prototype: prototype,
            },
        )
        .unwrap();
        assert_eq!(replay["batch"]["id"], batch["id"]);
    }

    #[test]
    fn stale_transcripts_corrupt_sources_and_nonempty_prototypes_are_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let (app, request, prototype) = setup(dir.path());
        let mut stale = request.clone();
        stale.samples[0].transcript_revision = Some(2);
        assert!(
            prepare(
                &app,
                Prepare {
                    request: stale,
                    document_prototype: prototype.clone()
                }
            )
            .unwrap_err()
            .to_string()
            .contains("transcript revision")
        );
        let mut occupied = prototype.clone();
        occupied["scenes"][0]["tracks"]["main"]["elements"] = json!([{"id":"user-edit"}]);
        assert!(
            prepare(
                &app,
                Prepare {
                    request: request.clone(),
                    document_prototype: occupied
                }
            )
            .is_err()
        );
        std::fs::write(
            dir.path().join("templates/inputs/input-test/original"),
            b"changed",
        )
        .unwrap();
        assert!(
            prepare(
                &app,
                Prepare {
                    request,
                    document_prototype: prototype
                }
            )
            .unwrap_err()
            .to_string()
            .contains("source hash")
        );
        assert!(
            app.db
                .list::<Value>("template_production_draft")
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn every_design_gets_an_independent_project_and_video_source_reference() {
        let dir = tempfile::tempdir().unwrap();
        let (app, mut request, prototype) = setup(dir.path());
        let mut second = request.designs[0].clone();
        second.template.id = "second".into();
        request.designs.push(second);
        let draft = prepare(
            &app,
            Prepare {
                request: request.clone(),
                document_prototype: prototype.clone(),
            },
        )
        .unwrap();
        assert_ne!(
            draft["manifest"]["items"][0]["fixtures"][0]["document"]["metadata"]["id"],
            draft["manifest"]["items"][1]["fixtures"][0]["document"]["metadata"]["id"]
        );
        let mut input: Input = app.db.get("template_input", "input-test").unwrap();
        input.media_kind = "video".into();
        let document = fixture_document(
            &prototype,
            "video-project",
            "Template Production / video",
            &input,
            "asset",
            &request.designs[0].template,
        );
        assert_eq!(
            document["scenes"][0]["tracks"]["main"]["elements"][0]["type"],
            "video"
        );
        assert!(
            document["scenes"][0]["tracks"]["audio"]
                .as_array()
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn sound_driven_samples_do_not_require_fabricated_speech() {
        let dir = tempfile::tempdir().unwrap();
        let (app, mut request, prototype) = setup(dir.path());
        let sample = &mut request.samples[0];
        sample.transcript_revision = None;
        sample.semantic_units.clear();
        sample.caption_spans.clear();
        sample.events = serde_json::from_value(json!([{"id":"onset","kind":"onset","start":0.5,"end":0.5,"strength":1.,"confidence":1.,"sourceId":"input-test","evidence":"measured test transient"}])).unwrap();
        let template = &mut request.designs[0].template;
        template.elements[0].binding = super::super::model::Binding::Literal;
        template.elements[0].literal = Some("Pulse".into());
        template.composition.scheduling =
            serde_json::from_value(json!([{"elementId":"caption","eventKind":"onset","minConfidence":0.,"minStrength":0.,"cooldownSeconds":0.,"maxOccurrences":10,"strengthWeight":1.,"confidenceWeight":1.,"repetitionPenalty":0.}])).unwrap();
        let draft = prepare(
            &app,
            Prepare {
                request,
                document_prototype: prototype,
            },
        )
        .unwrap();
        let fixture: CompileInput =
            serde_json::from_value(draft["manifest"]["items"][0]["fixtures"][0].clone()).unwrap();
        assert!(fixture.input.words.is_empty());
        let plan = rhythm::plan(fixture.input.clone()).unwrap();
        assert!(
            plan.elements
                .iter()
                .any(|e| e.content == "Pulse" && e.start == 0.5)
        );
        let compiled = super::super::compiler::compile(fixture).unwrap();
        assert!(compiled["elementCount"].as_u64().unwrap() > 0);
    }
}
