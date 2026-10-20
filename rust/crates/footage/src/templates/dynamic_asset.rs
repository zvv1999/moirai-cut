//! Editable asset graphs lower to the existing template compiler vocabulary.
use super::{
    composition::{Target, Treatment, TreatmentApplication},
    model::*,
};
use crate::store::{self, Store};
use anyhow::{Context, Result, ensure};
use rusqlite::OptionalExtension;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashMap, HashSet};

pub const SCHEMA: &str = "moirai.dynamic-asset.v1";
pub const RECORD: &str = "dynamic_asset";

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Create {
    pub name: String,
    pub canvas: Canvas,
    #[serde(default)]
    pub purpose: Option<CreatePurpose>,
}

#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum CreatePurpose {
    DecorativeText,
    Keyword,
    Caption,
    Decoration,
}

pub fn create(input: Create) -> Result<Definition> {
    use super::dynamic_asset_edit::{Edit, Highlight, Operation};
    let template = super::element_edit::create(super::element_edit::Create {
        name: input.name.clone(),
        canvas: input.canvas,
    })?;
    let mut definition = draft(template)?;
    if matches!(input.purpose, Some(CreatePurpose::Decoration)) {
        definition.inputs.clear();
        let width =
            0.3_f64.min(0.3 * definition.canvas.height as f64 / definition.canvas.width as f64);
        let height = width * definition.canvas.width as f64 / definition.canvas.height as f64;
        for layer in &mut definition.layers {
            if let LayerContent::Element { element } = &mut layer.content {
                element.description = "Decoration".into();
                element.literal = Some("Decoration".into());
                element.features.representation = Representation::Rectangle;
                element.features.role = Some(Role::Decoration);
                element.region = Rect {
                    x: (1. - width) / 2.,
                    y: (1. - height) / 2.,
                    width,
                    height,
                };
            }
        }
        for style in &mut definition.styles {
            style.fill = "#32836A".into();
            style.stroke_width = 0.;
        }
    }
    definition.name = input.name;
    definition.provenance = "User-authored reusable effect".into();
    if let Some(purpose) = input.purpose {
        definition.purposes = vec![purpose];
        let layer_id = definition
            .layers
            .iter()
            .find_map(|layer| match &layer.content {
                LayerContent::Element { element } => Some(element.id.clone()),
                _ => None,
            })
            .context("missing initial visual layer")?;
        let binding = match purpose {
            CreatePurpose::DecorativeText | CreatePurpose::Decoration => Binding::Literal,
            CreatePurpose::Keyword => Binding::Keyword,
            CreatePurpose::Caption => Binding::Sentence,
        };
        // Initialize scheduling only for a new style; later content edits preserve it.
        for layer in &mut definition.layers {
            if let LayerContent::Element { element } = &mut layer.content {
                if element.id == layer_id {
                    // A visual purpose is not itself a semantic role. In particular,
                    // decorative text can later serve as a title, label or callout.
                    element.features.role = match purpose {
                        CreatePurpose::Keyword => Some(Role::Emphasis),
                        CreatePurpose::Caption => Some(Role::Subtitle),
                        CreatePurpose::Decoration => Some(Role::Decoration),
                        CreatePurpose::DecorativeText => None,
                    };
                    element.timing.anchor = match binding {
                        Binding::Literal => Anchor::VideoStart,
                        Binding::Sentence => Anchor::CueStart,
                        _ => Anchor::KeywordStart,
                    };
                    if binding != Binding::Literal {
                        element.timing.max_seconds = 600.;
                    }
                }
            }
        }
        let highlight = matches!(purpose, CreatePurpose::Caption).then(|| Highlight {
            mode: super::composition::TextHighlightMode::ActiveWord,
            color: "#FFE064".into(),
            stroke: None,
        });
        if purpose != CreatePurpose::Decoration {
            let value = super::dynamic_asset_edit::edit(Edit {
                definition,
                operation: Operation::TextPresentation {
                    layer_id: layer_id.clone(),
                    binding,
                    highlight,
                },
            })?;
            definition = serde_json::from_value(value["definition"].clone())?;
        }
        let value = super::dynamic_asset_edit::edit(Edit {
            definition,
            operation: Operation::Envelope {
                layer_id,
                entrance: super::element_edit::Entrance::Pop,
                enter_seconds: 0.2,
                exit_seconds: 0.15,
            },
        })?;
        definition = serde_json::from_value(value["definition"].clone())?;
    }
    definition.project(&BTreeMap::new())?;
    Ok(definition)
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preview {
    pub definition: Definition,
    #[serde(default)]
    pub inputs: BTreeMap<String, String>,
    pub duration_seconds: f64,
    #[serde(default)]
    pub example: Option<PreviewExample>,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DetachPreview {
    pub preview: Preview,
    pub layer_id: String,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApplicationPreview {
    pub template: Template,
    pub duration_seconds: f64,
    #[serde(default)]
    pub example: Option<PreviewExample>,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreviewExample {
    /// Synthetic example meaning only; defaults to emphasis, never changes measured inputs.
    #[serde(default)]
    pub intent: Option<Intent>,
    pub text: String,
    #[serde(default)]
    pub keyword: String,
    #[serde(default)]
    pub keyword_occurrence: usize,
    #[serde(default)]
    pub layout_phrases: Vec<super::rhythm::LayoutPhrase>,
}

fn example_content(
    example: PreviewExample,
    duration: f64,
) -> Result<(
    Vec<super::rhythm::Word>,
    Vec<super::rhythm::SemanticUnit>,
    Vec<super::rhythm::WordSpan>,
)> {
    use super::rhythm::{SemanticUnit, Word, WordSpan};
    use unicode_segmentation::UnicodeSegmentation;
    ensure!(
        !example.text.trim().is_empty() && example.text.chars().count() <= 200,
        "preview example requires 1-200 characters"
    );
    let tokens: Vec<_> = example
        .text
        .split_word_bound_indices()
        .filter(|(_, text)| !text.trim().is_empty())
        .collect();
    let keyword = if example.keyword.is_empty() {
        None
    } else {
        let (start, matched) = example
            .text
            .match_indices(&example.keyword)
            .nth(example.keyword_occurrence)
            .context("preview keyword not found in example")?;
        let end = start + matched.len();
        let start_word = tokens
            .iter()
            .position(|(offset, _)| *offset == start)
            .context("preview keyword must start at a word boundary")?;
        let end_word = tokens
            .iter()
            .position(|(offset, text)| offset + text.len() == end)
            .context("preview keyword must end at a word boundary")?
            + 1;
        Some(WordSpan {
            start_word,
            end_word,
        })
    };
    // Deliberately synthetic alignment for style inspection; never persisted as an ASR/TTS receipt.
    let step = duration * 0.8 / tokens.len() as f64;
    let words = tokens
        .iter()
        .enumerate()
        .map(|(index, (_, text))| Word {
            text: (*text).into(),
            start: duration * 0.1 + index as f64 * step,
            end: duration * 0.1 + (index + 1) as f64 * step,
            speaker: None,
            emphasis: 0.,
        })
        .collect();
    Ok((
        words,
        vec![SemanticUnit {
            start_word: 0,
            end_word: tokens.len(),
            intent: example.intent.unwrap_or(Intent::Emphasis),
            keyword,
            rationale: "Synthetic preview example; not measured speech".into(),
        }],
        vec![WordSpan {
            start_word: 0,
            end_word: tokens.len(),
        }],
    ))
}

/// Ephemeral preview document: no project, audio timing or asset definition is persisted.
pub fn preview(input: Preview) -> Result<Value> {
    let template = input.definition.project(&input.inputs)?;
    let regions = editing_regions(&input.definition, &template)?;
    let mut result = preview_application(ApplicationPreview {
        template,
        duration_seconds: input.duration_seconds,
        example: input.example,
    })?;
    result["editingRegions"] = regions;
    Ok(result)
}

pub fn editing_regions(definition: &Definition, template: &Template) -> Result<Value> {
    let mut regions:Vec<Value>=template.elements.iter().map(|element|json!({"id":element.id,"name":element.description,"region":element.region,"z":element.z,"kind":"element"})).collect();
    for layer in &definition.layers {
        if let LayerContent::Group { id, .. } = &layer.content {
            regions.push(json!({"id":id,"name":id,"region":definition.canvas_region(id)?,"z":0,"kind":"group"}));
        }
    }
    Ok(json!(regions))
}

pub fn preview_application(input: ApplicationPreview) -> Result<Value> {
    preview_application_with_media(input, Value::Null)
}

pub fn preview_application_with_media(input: ApplicationPreview, media: Value) -> Result<Value> {
    ensure!(
        input.duration_seconds.is_finite() && (0.1..=30.).contains(&input.duration_seconds),
        "preview duration must be between 0.1 and 30 seconds"
    );
    let template = input.template;
    template.validate()?;
    let canvas = template.canvas.clone();
    let example = input.example.unwrap_or(PreviewExample {
        intent: None,
        text: "让重点表达更清楚".into(),
        keyword: "重点".into(),
        keyword_occurrence: 0,
        layout_phrases: vec![],
    });
    let layout_phrases = example.layout_phrases.clone();
    let (words, semantic_units, caption_spans) = example_content(example, input.duration_seconds)?;
    let example_words = serde_json::to_value(&words)?;
    let keyword_ids: Vec<_> = template
        .elements
        .iter()
        .filter(|e| matches!(e.binding, Binding::Keyword))
        .map(|e| e.id.clone())
        .collect();
    let result = super::compiler::compile(super::compiler::CompileInput {
        input: super::rhythm::PlanInput {
            template,
            words,
            duration_seconds: input.duration_seconds,
            title: String::new(),
            translations: vec![],
            semantic_units,
            caption_spans,
            layout_phrases,
            caption_policy: None,
            events: vec![super::events::TimeEvent {
                id: "preview-example".into(),
                kind: super::events::EventKind::Section,
                start: 0.,
                end: input.duration_seconds,
                strength: 1.,
                confidence: 1.,
                source_id: "effect-preview".into(),
                evidence: "User-selected example duration; not measured speech".into(),
                intent: None,
                text: None,
                caption_index: None,
                semantic_index: None,
            }],
            sound_events: vec![],
            receipt_input: None,
            resource_bindings: vec![],
            quiet_gap_seconds: None,
        },
        document: json!({"version":31,"revision":0,"settings":{"canvasSize":{"width":canvas.width,"height":canvas.height},"fps":{"numerator":canvas.fps,"denominator":1}},
            "scenes":[{"id":"effect-preview","tracks":{"main":{"id":"main","type":"video","elements":[]},"overlay":[],"audio":[]}}]}),
        scene_id: "effect-preview".into(),
        base_revision: 0,
        idempotency_key: "effect-preview".into(),
        start_time_seconds: 0.,
        source: None,
        media,
        visual_bindings: vec![],
    })?;
    Ok(
        json!({"canvas":canvas,"durationSeconds":input.duration_seconds,"previewTimeSeconds":representative_time(&result["document"]["scenes"][0]["tracks"], &keyword_ids, canvas.fps, input.duration_seconds),"tracks":result["document"]["scenes"][0]["tracks"],"warnings":result["warnings"],"exitSampling":result["exitSampling"],"captions":result["plan"]["captions"],"example":{"timingSource":"synthetic_example","words":example_words}}),
    )
}

fn representative_time(tracks: &Value, keyword_ids: &[String], fps: u32, duration: f64) -> f64 {
    fn collect<'a>(
        tracks: &'a Value,
        parents: &[&'a Value],
        output: &mut Vec<(&'a Value, Vec<&'a Value>)>,
    ) {
        for track in tracks
            .as_array()
            .into_iter()
            .flatten()
            .filter(|track| track["hidden"] != true)
        {
            for element in track["elements"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|element| element["hidden"] != true)
            {
                if element["renderGroup"]["tracks"].is_array() {
                    let mut ancestry = parents.to_vec();
                    ancestry.push(element);
                    collect(&element["renderGroup"]["tracks"], &ancestry, output);
                } else if matches!(
                    element["type"].as_str(),
                    Some("text" | "image" | "video" | "graphic" | "sticker")
                ) {
                    output.push((element, parents.to_vec()));
                }
            }
        }
    }
    let mut elements = Vec::new();
    collect(&tracks["overlay"], &[], &mut elements);
    elements.sort_by_key(|(element, _)| {
        (
            if element["type"] == "text" {
                if keyword_ids
                    .iter()
                    .any(|id| element["params"]["template.elementId"] == *id)
                {
                    0
                } else {
                    1
                }
            } else {
                2
            },
            element["startTime"].as_i64().unwrap_or(0),
        )
    });
    for (element, parents) in elements {
        let start = element["startTime"].as_i64().unwrap_or(0);
        let length = element["duration"].as_i64().unwrap_or(0);
        let ticks = crate::domain::TICKS as f64;
        let mut best = (f64::NEG_INFINITY, f64::INFINITY, 0.);
        for frame in 0..(duration * fps as f64).ceil() as u32 {
            let time = frame as f64 / fps as f64;
            let local = (time * ticks).round() as i64 - start;
            if local < 0 || local >= length {
                continue;
            }
            let mut opacity = super::treatments::sample(
                &element["animations"]["opacity"],
                local,
                element["params"]["opacity"].as_f64().unwrap_or(1.),
            );
            for parent in &parents {
                let local =
                    (time * ticks).round() as i64 - parent["startTime"].as_i64().unwrap_or(0);
                if local < 0 || local >= parent["duration"].as_i64().unwrap_or(0) {
                    opacity = 0.;
                    break;
                }
                opacity *= super::treatments::sample(
                    &parent["animations"]["opacity"],
                    local,
                    parent["params"]["opacity"].as_f64().unwrap_or(1.),
                );
            }
            let distance = (local as f64 - length as f64 / 2.).abs();
            if opacity > best.0 + 1e-6 || ((opacity - best.0).abs() <= 1e-6 && distance < best.1) {
                best = (opacity, distance, time);
            }
        }
        if best.0 > 1e-6 {
            return best.2;
        }
    }
    0.
}

/// Capture the editable visual graph of an application, never its sample audio or timeline.
#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Capture {
    pub template: Template,
    pub name: String,
}

pub fn capture(input: Capture) -> Result<Definition> {
    let template = input.template;
    template.validate()?;
    ensure!(
        template.layout_entrances.is_empty() && template.transition_rules.is_empty(),
        "capture cannot discard layout entrances or scene transitions"
    );
    ensure!(
        template.composition.rigid_transforms.is_empty(),
        "capture cannot discard application rotation; save its application history instead"
    );
    let mut unsupported = template.composition.clone();
    unsupported.treatments.clear();
    unsupported.applications.clear();
    unsupported.spatial_relations.clear();
    unsupported.reading_replicas.clear();
    unsupported.groups.retain(|group| !group.composite);
    ensure!(
        serde_json::to_value(unsupported)?
            == serde_json::to_value(super::composition::Composition::default())?,
        "capture requires a reusable style graph; scene scheduling, groups and transitions cannot be discarded"
    );
    let mut purposes = Vec::new();
    let mut inputs = Vec::new();
    for (index, element) in template.elements.iter().enumerate() {
        let purpose = if element.features.representation == Representation::Text {
            match element.binding {
                Binding::Sentence => CreatePurpose::Caption,
                Binding::Keyword => CreatePurpose::Keyword,
                _ => CreatePurpose::DecorativeText,
            }
        } else {
            CreatePurpose::Decoration
        };
        if !purposes.contains(&purpose) {
            purposes.push(purpose);
        }
        if element.features.representation == Representation::Text
            && matches!(
                element.binding,
                Binding::Literal | Binding::Sentence | Binding::Keyword
            )
            && element
                .literal
                .as_ref()
                .is_some_and(|value| !value.trim().is_empty())
        {
            inputs.push(TextInput {
                id: format!("text-{index}"),
                label: element.description.clone(),
                default: element.literal.clone().unwrap_or_else(|| "示例文字".into()),
                max_characters: 2000,
                layer_ids: vec![element.id.clone()],
            });
        }
    }
    let mut captured_layers: Vec<Layer> = template
        .composition
        .groups
        .iter()
        .map(|group| Layer {
            parent_id: None,
            content: LayerContent::Group {
                id: group.id.clone(),
                region: full_frame(),
                composite: true,
                separate_instances: group.separate_instances,
            },
        })
        .collect();
    captured_layers.extend(template.elements.into_iter().map(|element| {
        Layer {
            parent_id: template
                .composition
                .groups
                .iter()
                .find(|group| group.element_ids.contains(&element.id))
                .map(|group| group.id.clone()),
            content: LayerContent::Element { element },
        }
    }));
    let definition = Definition {
        schema_version: SCHEMA.into(),
        id: format!("dynamic-{}", crate::domain::id()),
        revision: 0,
        name: input.name,
        usage_guide: None,
        purposes,
        min_display_seconds: (template.visual_rhythm.min_display_seconds != 0.1)
            .then_some(template.visual_rhythm.min_display_seconds),
        canvas: template.canvas,
        layers: captured_layers,
        styles: template.styles,
        resource_slots: template.resource_slots,
        resource_bindings: template.resource_bindings,
        treatments: template.composition.treatments,
        applications: template.composition.applications,
        spatial_relations: template.composition.spatial_relations,
        reading_replicas: template.composition.reading_replicas,
        inputs,
        provenance: format!(
            "Editable style combination captured from {} at revision {}; sample audio, transcript and source framing are not part of the style.",
            template.id, template.revision
        ),
        evidence: vec![],
    };
    definition.project(&BTreeMap::new())?;
    Ok(definition)
}

pub fn draft(template: Template) -> Result<Definition> {
    template.validate()?;
    let source = template
        .elements
        .iter()
        .find(|e| e.features.representation == Representation::Text)
        .context("template requires a text style")?;
    let mut style = template
        .styles
        .iter()
        .find(|s| Some(&s.id) == source.style_id.as_ref())
        .context("missing text style")?
        .clone();
    style.id = "headline-style".into();
    style.fill = "#FFFFFF".into();
    style.stroke = "#202426".into();
    style.stroke_width = 6.;
    style.font_size = 72.;
    let mut element = source.clone();
    element.id = "headline".into();
    element.description = "主文字".into();
    element.binding = Binding::Literal;
    element.literal = Some("重点来了".into());
    element.style_id = Some(style.id.clone());
    element.resource_id = None;
    element.features.placement = Placement::Fixed;
    element.features.avoid_protected_regions = false;
    element.features.accent = false;
    element.features.outline = false;
    element.features.media_use = None;
    element.intents.clear();
    element.exclusive_group = None;
    element.evidence.clear();
    element.region = Rect {
        x: 0.1,
        y: 0.4,
        width: 0.8,
        height: 0.2,
    };
    element.timing = Timing {
        end_anchor: None,
        anchor: Anchor::VideoStart,
        offset_seconds: 0.,
        min_seconds: 0.1,
        max_seconds: 2.,
    };
    element.motions = vec![Motion {
        property: MotionProperty::Scale,
        keys: vec![
            MotionKey {
                time: 0.,
                value: 0.7,
                easing: Easing::Overshoot,
            },
            MotionKey {
                time: 0.18,
                value: 1.,
                easing: Easing::Linear,
            },
            MotionKey {
                time: 1.,
                value: 1.,
                easing: Easing::Linear,
            },
        ],
    }];
    let asset = Definition {
        schema_version: SCHEMA.into(),
        id: format!("dynamic-{}", crate::domain::id()),
        revision: 0,
        name: "新建花字".into(),
        purposes: vec![],
        usage_guide: None,
        min_display_seconds: None,
        canvas: template.canvas,
        layers: vec![
            Layer {
                parent_id: None,
                content: LayerContent::Group {
                    composite: false,
                    separate_instances: false,
                    id: "root".into(),
                    region: full_frame(),
                },
            },
            Layer {
                parent_id: Some("root".into()),
                content: LayerContent::Element { element },
            },
        ],
        styles: vec![style],
        resource_slots: vec![],
        resource_bindings: vec![],
        treatments: vec![],
        applications: vec![],
        spatial_relations: vec![],
        reading_replicas: vec![],
        inputs: vec![TextInput {
            id: "text".into(),
            label: "主文字".into(),
            default: "重点来了".into(),
            max_characters: 20,
            layer_ids: vec!["headline".into()],
        }],
        provenance: format!(
            "工作台新建；字体样式参考模板 {} r{}。字体授权需单独核验。",
            template.id, template.revision
        ),
        evidence: vec![],
    };
    asset.project(&BTreeMap::new())?;
    Ok(asset)
}

/// Author guidance for an Agent; does not mutate or constrain runtime applications.
#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UsageGuide {
    pub purpose: String,
    pub invariants: String,
    pub adjustments: String,
    pub constraints: String,
    pub fallback: String,
    pub coverage: String,
}
impl UsageGuide {
    fn validate(&self) -> Result<()> {
        for text in [
            &self.purpose,
            &self.invariants,
            &self.adjustments,
            &self.constraints,
            &self.fallback,
            &self.coverage,
        ] {
            ensure!(
                !text.trim().is_empty() && text.chars().count() <= 4000,
                "usage guide sections must contain 1–4000 characters"
            );
        }
        Ok(())
    }
}

/// Reusable visual style with design coordinates and relative motion. Actual
/// input annotations belong to Sample; case adaptation belongs to Application.
#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Definition {
    pub schema_version: String,
    pub id: String,
    pub revision: u64,
    pub name: String,
    /// Discovery metadata; does not determine text binding or runtime timing.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub purposes: Vec<CreatePurpose>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage_guide: Option<UsageGuide>,
    /// Default readability hold for layers without a local minDisplaySeconds.
    /// Preserves the host policy when absent; does not change speech timing.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_display_seconds: Option<f64>,
    pub canvas: Canvas,
    pub layers: Vec<Layer>,
    pub styles: Vec<Style>,
    #[serde(default)]
    pub resource_slots: Vec<ResourceSlot>,
    #[serde(default)]
    pub resource_bindings: Vec<ResourceBinding>,
    #[serde(default)]
    pub treatments: Vec<Treatment>,
    #[serde(default)]
    pub applications: Vec<TreatmentApplication>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub spatial_relations: Vec<super::composition::SpatialRelation>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub reading_replicas: Vec<super::composition::ReadingReplica>,
    #[serde(default)]
    pub inputs: Vec<TextInput>,
    pub provenance: String,
    #[serde(default)]
    pub evidence: Vec<Evidence>,
}

// An element owns its ID/region; a container owns its own ID/region. Neither is duplicated.
#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Layer {
    pub parent_id: Option<String>,
    pub content: LayerContent,
}
#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum LayerContent {
    Group {
        id: String,
        region: Rect,
        /// Composite descendants before applying group-target effects.
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        composite: bool,
        #[serde(
            default,
            rename = "separateInstances",
            skip_serializing_if = "std::ops::Not::not"
        )]
        separate_instances: bool,
    },
    Element {
        element: Element,
    },
}
impl Layer {
    fn id(&self) -> &str {
        match &self.content {
            LayerContent::Group { id, .. } => id,
            LayerContent::Element { element } => &element.id,
        }
    }
    fn region(&self) -> &Rect {
        match &self.content {
            LayerContent::Group { region, .. } => region,
            LayerContent::Element { element } => &element.region,
        }
    }
}

#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TextInput {
    pub id: String,
    pub label: String,
    pub default: String,
    pub max_characters: usize,
    pub layer_ids: Vec<String>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Save {
    pub definition: Definition,
    pub base_revision: u64,
    pub idempotency_key: String,
}
#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Duplicate {
    pub definition: Definition,
    pub name: String,
}

pub fn duplicate(input: Duplicate) -> Result<Definition> {
    input.definition.project(&BTreeMap::new())?;
    let mut definition = input.definition;
    definition.id = format!("dynamic-{}", crate::domain::id());
    definition.revision = 0;
    definition.name = input.name;
    definition.project(&BTreeMap::new())?;
    Ok(definition)
}
#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Insert {
    /// Override the saved default hold (0.1–3 seconds), retaining explicit per-layer values.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_display_seconds: Option<f64>,
    /// Override every inserted layer's intent filter; omitted preserves authored filters, [] means any intent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intents: Option<Vec<Intent>>,
    pub template: Template,
    pub asset_id: String,
    pub asset_revision: u64,
    pub instance_id: String,
    #[serde(default)]
    pub inputs: BTreeMap<String, String>,
    /// Optional destination region: contain the design canvas proportionally inside it.
    /// Omission retains strict canvas compatibility.
    #[serde(default)]
    pub placement: Option<Rect>,
    /// Independent scale/center after proportional adaptation, as in Application.
    #[serde(default)]
    pub transform: Option<ApplicationTransform>,
    /// Sentence width independent of the effect's scale. Requires placement.
    #[serde(default)]
    pub caption_width: Option<f64>,
    /// Per text-layer width in output-canvas fractions (0.1–1), keyed by source element ID.
    /// Applied after caption_width; preserves center, type size, timing and motion.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub text_widths: BTreeMap<String, f64>,
    /// Fully qualified inserted element IDs attached to existing host text elements.
    #[serde(default)]
    pub attachments: Vec<super::composition::SpatialRelation>,
}

/// A revision-pinned use of a style. Projection creates a composition document;
/// it never saves these overrides into the reusable Definition.
#[derive(Clone, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Application {
    /// Override the saved default hold (0.1–3 seconds), retaining explicit per-layer values.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_display_seconds: Option<f64>,
    /// Override every applied layer's intent filter; omitted preserves authored filters, [] means any intent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intents: Option<Vec<Intent>>,
    pub asset_id: String,
    pub asset_revision: u64,
    pub canvas: Canvas,
    pub placement: Rect,
    #[serde(default)]
    pub inputs: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transform: Option<ApplicationTransform>,
    /// Sentence-text width as a fraction of the output canvas; keeps type size and motion.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caption_width: Option<f64>,
    /// Per text-layer width in output-canvas fractions (0.1–1), keyed by source element ID.
    /// Applied after caption_width; preserves center, type size, timing and motion.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub text_widths: BTreeMap<String, f64>,
    /// Source-video framing for this application only; does not transform style layers.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub video_region: Option<Rect>,
    /// Use the existing blurred-fill source layout; foreground contains the source.
    /// Application-only: never changes saved style elements or their scheduling.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blurred_background: Option<bool>,
}

#[derive(Clone, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApplicationTransform {
    /// Scale relative to the contained effect, centered on its element-region bounds.
    pub scale: f64,
    pub center_x: f64,
    pub center_y: f64,
    /// Clockwise static rotation around this application center, in output pixels.
    /// -180..180 degrees. Omitted or zero retains the original projection structure.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotation_degrees: Option<f64>,
}

pub fn application(asset: &Definition, input: &Application) -> Result<Template> {
    ensure!(
        asset.id == input.asset_id && asset.revision == input.asset_revision,
        "effect revision mismatch"
    );
    let mut source = asset.clone();
    if let Some(minimum) = input.min_display_seconds {
        source.min_display_seconds = Some(minimum);
    }
    let mut template = source.project(&input.inputs)?;
    // Validate the requested canvas before dividing by its dimensions.
    template.canvas = input.canvas.clone();
    template.validate()?;
    template.canvas = asset.canvas.clone();
    adapt_projection(&mut template, &input.canvas, &input.placement)?;
    if let Some(transform) = &input.transform {
        ensure!(
            transform.scale.is_finite()
                && (0.1..=4.).contains(&transform.scale)
                && transform.center_x.is_finite()
                && (0.0..=1.).contains(&transform.center_x)
                && transform.center_y.is_finite()
                && (0.0..=1.).contains(&transform.center_y),
            "invalid effect scale or center"
        );
        ensure!(
            transform
                .rotation_degrees
                .is_none_or(|angle| angle.is_finite() && (-180.0..=180.0).contains(&angle)),
            "effect rotation must be between -180 and 180 degrees"
        );
        let left = template
            .elements
            .iter()
            .map(|e| e.region.x)
            .fold(f64::INFINITY, f64::min);
        let top = template
            .elements
            .iter()
            .map(|e| e.region.y)
            .fold(f64::INFINITY, f64::min);
        let right = template
            .elements
            .iter()
            .map(|e| e.region.x + e.region.width)
            .fold(f64::NEG_INFINITY, f64::max);
        let bottom = template
            .elements
            .iter()
            .map(|e| e.region.y + e.region.height)
            .fold(f64::NEG_INFINITY, f64::max);
        let mapping = Rect {
            x: transform.center_x - (left + right) / 2. * transform.scale,
            y: transform.center_y - (top + bottom) / 2. * transform.scale,
            width: transform.scale,
            height: transform.scale,
        };
        transform_projection(&mut template, &input.canvas, &mapping, transform.scale);
    }
    if let Some(width) = input.caption_width {
        ensure!(
            width.is_finite() && (0.1..=1.).contains(&width),
            "caption width must be between 0.1 and 1"
        );
        for element in &mut template.elements {
            if element.binding == Binding::Sentence
                && element.features.representation == Representation::Text
            {
                let center = element.region.x + element.region.width / 2.;
                element.region.x = center - width / 2.;
                element.region.width = width;
            }
        }
    }
    for (id, width) in &input.text_widths {
        ensure!(
            width.is_finite() && (0.1..=1.).contains(width),
            "text width must be between 0.1 and 1: {id}"
        );
        let element = template
            .elements
            .iter_mut()
            .find(|element| &element.id == id)
            .with_context(|| format!("unknown text width layer: {id}"))?;
        ensure!(
            element.features.representation == Representation::Text,
            "text width requires a text layer: {id}"
        );
        let center = element.region.x + element.region.width / 2.;
        element.region.x = center - width / 2.;
        element.region.width = *width;
    }
    if let Some(region) = &input.video_region {
        region.validate()?;
        for layout in &mut template.layouts {
            layout.video_region = region.clone();
        }
    }
    if input.blurred_background == Some(true) {
        for layout in &mut template.layouts {
            layout.mode = LayoutMode::BlurredFill;
        }
    }
    if let Some(intents) = &input.intents {
        for element in &mut template.elements {
            element.intents = intents.clone();
        }
    }
    if let Some(transform) = &input.transform {
        if let Some(angle) = transform.rotation_degrees.filter(|angle| *angle != 0.) {
            template
                .composition
                .rigid_transforms
                .push(super::rigid_transform::RigidTransform {
                    id: "application-rotation".into(),
                    element_ids: template
                        .elements
                        .iter()
                        .map(|element| element.id.clone())
                        .collect(),
                    pivot_x: transform.center_x,
                    pivot_y: transform.center_y,
                    rotation_degrees: angle,
                });
        }
    }
    template.id = format!("effect-trial-{}", super::search::fingerprint(input));
    template.revision = 0;
    template.validate()?;
    Ok(template)
}

fn full_frame() -> Rect {
    Rect {
        x: 0.,
        y: 0.,
        width: 1.,
        height: 1.,
    }
}
fn within(parent: &Rect, child: &Rect) -> Rect {
    Rect {
        x: parent.x + child.x * parent.width,
        y: parent.y + child.y * parent.height,
        width: child.width * parent.width,
        height: child.height * parent.height,
    }
}

impl Definition {
    pub fn canvas_region(&self, layer_id: &str) -> Result<Rect> {
        let layer = self
            .layers
            .iter()
            .find(|layer| layer.id() == layer_id)
            .context("unknown layer")?;
        let mut region = layer.region().clone();
        let mut parent = layer.parent_id.as_deref();
        let mut visited = HashSet::from([layer.id()]);
        while let Some(id) = parent {
            ensure!(visited.insert(id), "layer cycle at {id}");
            ensure!(visited.len() <= 32, "layer depth exceeds 32");
            let ancestor = self
                .layers
                .iter()
                .find(|layer| layer.id() == id)
                .context("unknown parent layer")?;
            ensure!(
                matches!(ancestor.content, LayerContent::Group { .. }),
                "parent must be a group"
            );
            region = within(ancestor.region(), &region);
            parent = ancestor.parent_id.as_deref();
        }
        Ok(region)
    }
    pub fn project(&self, inputs: &BTreeMap<String, String>) -> Result<Template> {
        ensure!(
            self.min_display_seconds
                .is_none_or(valid_min_display_seconds),
            "minimum display duration must be between 0.1 and 3 seconds"
        );
        if let Some(guide) = &self.usage_guide {
            guide.validate()?;
        }
        ensure!(
            self.schema_version == SCHEMA,
            "unsupported dynamic asset schema"
        );
        ensure!(
            valid_id(&self.id) && !self.name.trim().is_empty() && self.name.len() <= 200,
            "invalid dynamic asset identity"
        );
        ensure!(
            !self.provenance.trim().is_empty() && self.provenance.len() <= 4000,
            "asset provenance required"
        );
        ensure!(
            !self.layers.is_empty() && self.layers.len() <= 200,
            "asset requires 1-200 layers"
        );
        let mut layers = HashMap::new();
        for layer in &self.layers {
            ensure!(
                valid_id(layer.id()) && layers.insert(layer.id(), layer).is_none(),
                "duplicate or invalid layer ID"
            );
            layer.region().validate()?;
        }
        let mut elements = Vec::new();
        let used_groups: HashSet<&str> = self
            .layers
            .iter()
            .filter_map(|layer| layer.parent_id.as_deref())
            .collect();
        for layer in &self.layers {
            let region = self.canvas_region(layer.id())?;
            if let LayerContent::Element { element } = &layer.content {
                ensure!(
                    super::compiler::supported_representation(&element.features.representation)
                        && element.features.representation != Representation::Audio,
                    "unsupported dynamic layer representation"
                );
                ensure!(
                    element.features.placement == Placement::Fixed
                        && !element.features.avoid_protected_regions,
                    "dynamic layers require fixed placement; per-layer reflow breaks local coordinates"
                );
                ensure!(
                    element
                        .motions
                        .iter()
                        .all(|m| !matches!(m.property, MotionProperty::Reveal)),
                    "reveal motion is not executable"
                );
                let mut element = element.clone();
                element.min_display_seconds =
                    element.min_display_seconds.or(self.min_display_seconds);
                element.region = region;
                elements.push(element);
            }
        }
        ensure!(
            self.layers
                .iter()
                .all(|l| !matches!(l.content, LayerContent::Group { .. })
                    || used_groups.contains(l.id())),
            "empty group"
        );
        let mut input_ids = HashSet::new();
        let mut bound_layers = HashSet::new();
        for input in &self.inputs {
            ensure!(
                valid_id(&input.id)
                    && input_ids.insert(input.id.as_str())
                    && !input.label.trim().is_empty(),
                "invalid input identity"
            );
            ensure!(
                (1..=2000).contains(&input.max_characters) && !input.layer_ids.is_empty(),
                "invalid text input constraints"
            );
            for value in [
                &input.default,
                inputs.get(&input.id).unwrap_or(&input.default),
            ] {
                ensure!(
                    !value.trim().is_empty() && value.chars().count() <= input.max_characters,
                    "text input {} exceeds constraints",
                    input.id
                );
            }
            for id in &input.layer_ids {
                ensure!(bound_layers.insert(id), "layer has multiple input owners");
                let element = elements
                    .iter_mut()
                    .find(|e| &e.id == id)
                    .context("unknown input layer")?;
                ensure!(
                    element.features.representation == Representation::Text
                        && matches!(
                            element.binding,
                            Binding::Literal | Binding::Sentence | Binding::Keyword
                        ),
                    "text input requires literal, sentence or keyword text layer"
                );
                element.literal = Some(inputs.get(&input.id).unwrap_or(&input.default).clone());
            }
        }
        ensure!(
            inputs.keys().all(|id| input_ids.contains(id.as_str())),
            "unknown text input"
        );
        let descendants = |group_id: &str| -> Vec<String> {
            self.layers
                .iter()
                .filter_map(|layer| {
                    let LayerContent::Element { element } = &layer.content else {
                        return None;
                    };
                    let mut parent = layer.parent_id.as_deref();
                    while let Some(id) = parent {
                        if id == group_id {
                            return Some(element.id.clone());
                        }
                        parent = layers
                            .get(id)
                            .and_then(|ancestor| ancestor.parent_id.as_deref());
                    }
                    None
                })
                .collect()
        };
        let groups: Vec<super::composition::ElementGroup> = self
            .layers
            .iter()
            .filter_map(|layer| {
                if let LayerContent::Group {
                    id,
                    composite: true,
                    separate_instances,
                    ..
                } = &layer.content
                {
                    Some(super::composition::ElementGroup {
                        id: id.clone(),
                        element_ids: descendants(id),
                        composite: true,
                        separate_instances: *separate_instances,
                    })
                } else {
                    None
                }
            })
            .collect();
        // Ordinary containers preserve historical per-leaf semantics. Explicit composite
        // groups retain their target so the compiler creates an isolated controller.
        let mut applications = Vec::new();
        for application in &self.applications {
            // Do not let ordinary-container expansion silently broaden an
            // element-only execution contract into a group effect.
            let has_stroke_reveal = self.treatments.iter()
                .find(|treatment| treatment.id == application.treatment_id)
                .is_some_and(|treatment| matches!(&treatment.operation,
                    super::composition::TreatmentOperation::Motion { channels, .. }
                    if channels.iter().any(|motion| motion.property == MotionProperty::StrokeReveal)));
            ensure!(
                !has_stroke_reveal || matches!(&application.target, Target::Element(_)),
                "stroke_reveal treatment requires an individual outlined ellipse, not a group or layout"
            );
            match &application.target {
                Target::Element(_) => applications.push(application.clone()),
                Target::Group(group_id) if groups.iter().any(|group| &group.id == group_id) => {
                    applications.push(application.clone());
                }
                Target::Group(group_id) => {
                    for id in descendants(group_id) {
                        let mut expanded = application.clone();
                        expanded.target = Target::Element(id);
                        applications.push(expanded);
                    }
                }
                Target::Layout(_) => {
                    anyhow::bail!("dynamic assets do not support layout treatments")
                }
            }
        }
        let mut template = Template {
            schema_version: "moirai.template.v2".into(),
            id: self.id.clone(),
            revision: self.revision,
            name: self.name.clone(),
            description: self.provenance.clone(),
            tags: vec![],
            canvas: self.canvas.clone(),
            elements,
            styles: self.styles.clone(),
            resource_slots: self.resource_slots.clone(),
            resource_bindings: self.resource_bindings.clone(),
            composition: super::composition::Composition {
                groups,
                treatments: self.treatments.clone(),
                applications,
                spatial_relations: self.spatial_relations.clone(),
                reading_replicas: self.reading_replicas.clone(),
                ..Default::default()
            },
            layouts: vec![Layout {
                id: "asset-stage".into(),
                description: "Dynamic asset stage".into(),
                mode: LayoutMode::FullBleed,
                video_region: full_frame(),
                secondary: None,
                caption_region: full_frame(),
                safe_regions: vec![],
                intents: vec![],
                evidence: vec![],
            }],
            layout_entrances: vec![],
            transition_rules: vec![],
            segmentation: SegmentationPolicy::default(),
            visual_rhythm: VisualRhythmPolicy {
                min_display_seconds: 0.1,
                max_accents_per_cue: 20,
            },
            audio_placement: AudioPlacementPolicy {
                effect_cooldown_seconds: 0.2,
            },
            mix: MixPolicy {
                music_gain_db: -20.,
                music_duck_db: -6.,
                effect_gain_db: -12.,
                music_duck_attack_seconds: 0.08,
                music_duck_release_seconds: 0.3,
            },
            evidence: self.evidence.clone(),
        };
        template.validate()?;
        let mut done = HashSet::new();
        for _ in 0..=self.spatial_relations.len() {
            for relation in &self.spatial_relations {
                if done.contains(&relation.element_id)
                    || self.spatial_relations.iter().any(|parent| {
                        parent.element_id == relation.relative_to
                            && !done.contains(&parent.element_id)
                    })
                {
                    continue;
                }
                let parent = template
                    .elements
                    .iter()
                    .find(|element| element.id == relation.relative_to)
                    .context("missing relation parent")?
                    .region
                    .clone();
                let child = template
                    .elements
                    .iter_mut()
                    .find(|element| element.id == relation.element_id)
                    .context("missing relation child")?;
                child.region =
                    super::composition::relative_region(&child.region, &parent, relation)?;
                done.insert(relation.element_id.clone());
            }
        }
        Ok(template)
    }

    pub fn inspect(&self) -> Result<Value> {
        let projection = self.project(&BTreeMap::new())?;
        let fields: Vec<_> = self.inputs.iter().map(|i| json!({
            "binding":i.id,"label":i.label,"domain":"how","control":"text","value":i.default,
            "maxCharacters":i.max_characters,"layerIds":i.layer_ids,"edit":{"operation":"set_input","inputId":i.id}
        })).collect();
        Ok(
            json!({"definition":self,"projection":projection,"companion":{"family":"dynamic-asset","fields":fields},
            "capabilities":{"localCoordinates":true,"elementTreatments":true,"textInputs":true,
                "groupTransforms":true,"isolatedGroupCompositing":true,"temporalAuthority":true,"referenceReconstruction":false,
                "ellipseArc":super::ellipse_arc::capabilities(),"starGeometry":super::star_geometry::capabilities(),
                "rectangleGeometry":super::rectangle_geometry::capabilities()},
            "quality":{"status":"structurally_valid","renderVerified":false}}),
        )
    }
}

pub fn insert(
    template: Template,
    asset: &Definition,
    instance_id: &str,
    inputs: &BTreeMap<String, String>,
    placement: Option<&Rect>,
) -> Result<Value> {
    template.validate()?;
    ensure!(
        valid_id(instance_id) && instance_id.len() <= 40,
        "invalid instance ID"
    );
    ensure!(
        placement.is_some()
            || (template.canvas.width == asset.canvas.width
                && template.canvas.height == asset.canvas.height
                && template.canvas.fps == asset.canvas.fps),
        "dynamic asset canvas must match template; provide placement for proportional adaptation"
    );
    let mut projected = asset.project(inputs)?;
    if let Some(region) = placement {
        adapt_projection(&mut projected, &template.canvas, region)?;
    }
    insert_projected(template, asset, instance_id, inputs, placement, projected)
}

pub fn insert_configured(input: Insert, asset: &Definition) -> Result<Value> {
    let mut source = asset.clone();
    if let Some(minimum) = input.min_display_seconds {
        source.min_display_seconds = Some(minimum);
    }
    let asset = &source;
    ensure!(
        input.asset_id == asset.id && input.asset_revision == asset.revision,
        "effect revision mismatch"
    );
    let host_text: HashSet<String> = input
        .template
        .elements
        .iter()
        .filter(|element| element.features.representation == Representation::Text)
        .map(|element| element.id.clone())
        .collect();
    let mut result = if input.transform.is_none()
        && input.caption_width.is_none()
        && input.text_widths.is_empty()
    {
        insert(
            input.template,
            asset,
            &input.instance_id,
            &input.inputs,
            input.placement.as_ref(),
        )?
    } else {
        let placement = input
            .placement
            .as_ref()
            .context("placement is required for independent effect sizing")?;
        let application_input = Application {
            min_display_seconds: input.min_display_seconds,
            intents: None,
            asset_id: input.asset_id,
            asset_revision: input.asset_revision,
            canvas: input.template.canvas.clone(),
            placement: placement.clone(),
            inputs: input.inputs.clone(),
            transform: input.transform,
            caption_width: input.caption_width,
            text_widths: input.text_widths,
            video_region: None,
            blurred_background: None,
        };
        let projected = application(asset, &application_input)?;
        let mut result = insert_projected(
            input.template,
            asset,
            &input.instance_id,
            &input.inputs,
            Some(placement),
            projected,
        )?;
        result["instance"]["transform"] = serde_json::to_value(application_input.transform)?;
        result["instance"]["captionWidth"] = serde_json::to_value(application_input.caption_width)?;
        if !application_input.text_widths.is_empty() {
            result["instance"]["textWidths"] = serde_json::to_value(application_input.text_widths)?;
        }
        result
    };
    if let Some(minimum) = input.min_display_seconds {
        result["instance"]["minDisplaySeconds"] = json!(minimum);
    }
    if let Some(intents) = &input.intents {
        let mut template: Template = serde_json::from_value(result["template"].clone())?;
        let inserted: HashSet<&str> = result["instance"]["layerMap"]
            .as_object()
            .context("missing layer map")?
            .values()
            .filter_map(Value::as_str)
            .collect();
        for element in &mut template.elements {
            if inserted.contains(element.id.as_str()) {
                element.intents = intents.clone();
            }
        }
        template.validate()?;
        result["template"] = serde_json::to_value(template)?;
        result["instance"]["intents"] = serde_json::to_value(intents)?;
    }
    if !input.attachments.is_empty() {
        let mut template: Template = serde_json::from_value(result["template"].clone())?;
        let inserted: HashSet<&str> = result["instance"]["layerMap"]
            .as_object()
            .context("missing layer map")?
            .values()
            .filter_map(Value::as_str)
            .collect();
        let mut seen = HashSet::new();
        for relation in &input.attachments {
            ensure!(
                inserted.contains(relation.element_id.as_str())
                    && seen.insert(&relation.element_id),
                "attachment must target a unique inserted element"
            );
            ensure!(
                host_text.contains(&relation.relative_to),
                "attachment reference must be existing host text"
            );
            ensure!(
                relation.reference_bounds == super::composition::SpatialBounds::TextBox
                    && relation.follow_motion,
                "cross-style attachment requires measured text bounds and motion following"
            );
            template
                .composition
                .spatial_relations
                .retain(|existing| existing.element_id != relation.element_id);
            template
                .composition
                .spatial_relations
                .push(relation.clone());
        }
        template.validate()?;
        result["template"] = serde_json::to_value(template)?;
        result["instance"]["attachments"] = serde_json::to_value(input.attachments)?;
    }
    Ok(result)
}

fn insert_projected(
    mut template: Template,
    asset: &Definition,
    instance_id: &str,
    inputs: &BTreeMap<String, String>,
    placement: Option<&Rect>,
    projected: Template,
) -> Result<Value> {
    template.validate()?;
    ensure!(
        valid_id(instance_id) && instance_id.len() <= 40,
        "invalid instance ID"
    );
    let prefix = format!("{instance_id}--");
    let qualify = |id: &str| format!("{prefix}{id}");
    let z_base = template
        .elements
        .iter()
        .map(|e| e.z)
        .max()
        .unwrap_or(0)
        .checked_add(1)
        .context("layer limit reached")?;
    let min_z = projected.elements.iter().map(|e| e.z).min().unwrap_or(0);
    let mut mapping = BTreeMap::new();
    for mut e in projected.elements {
        let original = e.id.clone();
        e.id = qualify(&e.id);
        e.style_id = e.style_id.map(|id| qualify(&id));
        e.resource_id = e.resource_id.map(|id| qualify(&id));
        e.exclusive_group = e.exclusive_group.map(|id| qualify(&id));
        e.z =
            e.z.checked_sub(min_z)
                .and_then(|z| z.checked_add(z_base))
                .context("layer limit reached")?;
        mapping.insert(original, e.id.clone());
        template.elements.push(e);
    }
    for mut s in projected.styles {
        s.id = qualify(&s.id);
        template.styles.push(s);
    }
    for mut s in projected.resource_slots {
        s.id = qualify(&s.id);
        template.resource_slots.push(s);
    }
    for mut b in projected.resource_bindings {
        b.slot_id = qualify(&b.slot_id);
        template.resource_bindings.push(b);
    }
    for mut transform in projected.composition.rigid_transforms {
        transform.id = qualify(&transform.id);
        transform.element_ids = transform.element_ids.iter().map(|id| qualify(id)).collect();
        template.composition.rigid_transforms.push(transform);
    }
    for mut group in projected.composition.groups {
        group.id = qualify(&group.id);
        group.element_ids = group.element_ids.iter().map(|id| qualify(id)).collect();
        template.composition.groups.push(group);
    }
    for mut t in projected.composition.treatments {
        t.id = qualify(&t.id);
        template.composition.treatments.push(t);
    }
    for mut a in projected.composition.applications {
        a.treatment_id = qualify(&a.treatment_id);
        let id = match &mut a.target {
            Target::Element(id) | Target::Group(id) => id,
            Target::Layout(_) => unreachable!(),
        };
        *id = qualify(id);
        template.composition.applications.push(a);
    }
    for mut relation in projected.composition.reading_replicas {
        relation.element_id = qualify(&relation.element_id);
        relation.primary_id = qualify(&relation.primary_id);
        template.composition.reading_replicas.push(relation);
    }
    for mut relation in projected.composition.spatial_relations {
        relation.element_id = qualify(&relation.element_id);
        relation.relative_to = qualify(&relation.relative_to);
        template.composition.spatial_relations.push(relation);
    }
    template.validate()?;
    Ok(
        json!({"template":template,"instance":{"id":instance_id,"assetId":asset.id,"assetRevision":asset.revision,"layerMap":mapping,"inputs":inputs,"placement":placement},
        "mode":"editable_snapshot"}),
    )
}

fn adapt_projection(projected: &mut Template, target: &Canvas, placement: &Rect) -> Result<()> {
    placement.validate()?;
    let width = target.width as f64;
    let height = target.height as f64;
    let scale = (placement.width * width / projected.canvas.width as f64)
        .min(placement.height * height / projected.canvas.height as f64);
    let fitted_width = projected.canvas.width as f64 * scale / width;
    let fitted_height = projected.canvas.height as f64 * scale / height;
    let fitted = Rect {
        x: placement.x + (placement.width - fitted_width) / 2.,
        y: placement.y + (placement.height - fitted_height) / 2.,
        width: fitted_width,
        height: fitted_height,
    };
    transform_projection(projected, target, &fitted, scale);
    Ok(())
}

fn transform_projection(projected: &mut Template, target: &Canvas, fitted: &Rect, scale: f64) {
    use super::composition::TreatmentOperation;
    let scale_motion = |channels: &mut Vec<Motion>| {
        for channel in channels {
            if matches!(channel.property, MotionProperty::X | MotionProperty::Y) {
                for key in &mut channel.keys {
                    key.value *= scale;
                }
            }
        }
    };
    for element in &mut projected.elements {
        element.region = within(fitted, &element.region);
        scale_motion(&mut element.motions);
    }
    for relation in &mut projected.composition.spatial_relations {
        if let Some(binding) = &mut relation.size_binding {
            if let Some(axis) = &mut binding.width {
                axis.padding *= fitted.width;
            }
            if let Some(axis) = &mut binding.height {
                axis.padding *= fitted.height;
            }
        }
        relation.offset_x *= fitted.width;
        relation.offset_y *= fitted.height;
        relation.gap *= match relation.placement {
            super::composition::SpatialPlacement::Left
            | super::composition::SpatialPlacement::Right => fitted.width,
            _ => fitted.height,
        };
    }
    // Typography is meaningful only for styles used by text. Graphic-only assets
    // retain dormant font defaults so small icons do not fail font-size validation.
    let text_styles: HashSet<String> = projected
        .elements
        .iter()
        .filter(|element| element.features.representation == Representation::Text)
        .filter_map(|element| element.style_id.clone())
        .collect();
    // Shape strokes are in the renderer's fixed 512px source coordinates. Their
    // geometry already scales them; applying the placement scale again thins
    // small icons quadratically. Text strokes, by contrast, use canvas pixels.
    // Split shared styles so one source style can safely serve both kinds.
    let shared: Vec<_> = projected
        .styles
        .iter()
        .filter(|style| {
            text_styles.contains(&style.id)
                && projected.elements.iter().any(|e| {
                    e.features.representation != Representation::Text
                        && e.style_id.as_ref() == Some(&style.id)
                })
        })
        .cloned()
        .collect();
    for mut style in shared {
        let original = style.id.clone();
        let mut id = format!("{original}--graphic-space");
        while projected.styles.iter().any(|s| s.id == id) {
            id.push_str("-copy");
        }
        style.id = id.clone();
        for e in &mut projected.elements {
            if e.features.representation != Representation::Text
                && e.style_id.as_ref() == Some(&original)
            {
                e.style_id = Some(id.clone());
            }
        }
        projected.styles.push(style);
    }
    for style in &mut projected.styles {
        if text_styles.contains(&style.id) {
            style.font_size *= scale;
        }
        style.letter_spacing *= scale;
        if text_styles.contains(&style.id) {
            style.stroke_width *= scale;
        }
        if let Some(padding) = &mut style.background_padding {
            padding.x *= scale;
            padding.y *= scale;
        }
        if let Some(shadow) = &mut style.shadow {
            shadow.blur *= scale;
            shadow.x *= scale;
            shadow.y *= scale;
        }
        if let Some(grid) = &mut style.grid {
            grid.spacing *= scale;
            grid.width *= scale;
        }
    }
    for treatment in &mut projected.composition.treatments {
        match &mut treatment.operation {
            TreatmentOperation::CanvasClip { region } => *region = within(fitted, region),
            TreatmentOperation::TextHighlight {
                stroke: Some(stroke),
                ..
            } => stroke.width *= scale,
            TreatmentOperation::Motion { channels, .. } => scale_motion(channels),
            // Blur intensity and color controls are dimensionless renderer parameters.
            _ => {}
        }
    }
    projected.canvas = target.clone();
}

fn optional<T: serde::de::DeserializeOwned>(
    db: &rusqlite::Connection,
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
    body.map(|v| serde_json::from_str(&v).map_err(Into::into))
        .transpose()
}

pub fn save(db: &Store, input: Save) -> Result<Definition> {
    input.definition.project(&BTreeMap::new())?;
    ensure!(valid_id(&input.idempotency_key), "invalid idempotency key");
    ensure!(
        input.definition.revision == input.base_revision,
        "definition revision must match baseRevision"
    );
    let hash = super::search::fingerprint(&input);
    db.transaction(|db| {
        if let Some(receipt) =
            optional::<Value>(db, "dynamic_asset_receipt", &input.idempotency_key)?
        {
            ensure!(
                receipt["hash"] == hash,
                "idempotency key reused with different payload"
            );
            return Ok(serde_json::from_value(receipt["definition"].clone())?);
        }
        let existing = optional::<Definition>(db, RECORD, &input.definition.id)?;
        ensure!(
            existing.map(|d| d.revision).unwrap_or(0) == input.base_revision,
            "revision_conflict"
        );
        let mut definition = input.definition;
        definition.revision = input
            .base_revision
            .checked_add(1)
            .context("revision overflow")?;
        store::put(db, RECORD, &definition.id, &definition)?;
        store::put(
            db,
            "dynamic_asset_version",
            &format!("{}-r{}", definition.id, definition.revision),
            &definition,
        )?;
        store::put(
            db,
            "dynamic_asset_receipt",
            &input.idempotency_key,
            &json!({"hash":hash,"definition":definition}),
        )?;
        Ok(definition)
    })
}
