use super::{model::*, rhythm::PlacedElement};
use anyhow::{Context, Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Composition {
    /// Static application transforms, applied outside the existing visual groups.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub rigid_transforms: Vec<super::rigid_transform::RigidTransform>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub accumulating_lists: Vec<AccumulatingList>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub lifecycles: Vec<ElementLifecycle>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub state_relations: Vec<StateRelation>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub arrangements: Vec<GroupArrangement>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layout_policy: Option<LayoutPolicy>,
    #[serde(default)]
    pub groups: Vec<ElementGroup>,
    #[serde(default)]
    pub treatments: Vec<Treatment>,
    #[serde(default)]
    pub applications: Vec<TreatmentApplication>,
    #[serde(default)]
    pub transitions: Vec<ElementTransition>,
    #[serde(default)]
    pub transition_effects: Vec<TransitionEffect>,
    #[serde(default)]
    pub spatial_relations: Vec<SpatialRelation>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub reading_replicas: Vec<ReadingReplica>,
    #[serde(default)]
    pub scheduling: Vec<ScheduleRule>,
    #[serde(default)]
    pub resource_requirements: Vec<ResourceRequirement>,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadingReplica {
    pub element_id: String,
    pub primary_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AccumulatingList {
    pub items: Vec<ListEntry>,
    pub end_event_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ListEntry {
    pub element_id: String,
    pub start_event_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ElementLifecycle {
    pub element_id: String,
    pub start_event_id: String,
    pub end_event_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StateRelation {
    pub source_element_id: String,
    pub target_element_id: String,
    pub opacity: f64,
    pub duration_seconds: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LayoutPolicy {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event_kind: Option<super::events::EventKind>,
    pub intent_match_weight: f64,
    pub repetition_penalty: f64,
    pub min_hold_seconds: f64,
    pub base_scores: std::collections::BTreeMap<String, f64>,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ElementGroup {
    pub id: String,
    pub element_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub composite: bool,
    /// Restart group effects for each non-overlapping active interval.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub separate_instances: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GroupArrangement {
    pub group_id: String,
    pub region: Rect,
    pub columns: usize,
    pub gap: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", content = "id", rename_all = "snake_case")]
pub enum Target {
    Element(String),
    Group(String),
    Layout(String),
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Treatment {
    pub id: String,
    pub operation: TreatmentOperation,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum TreatmentOperation {
    CanvasClip {
        region: Rect,
    },
    /// Fill the aligned semantic keyword inside sentence/keyword text.
    TextHighlight {
        color: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        stroke: Option<TextStroke>,
        #[serde(default, skip_serializing_if = "TextHighlightMode::is_keyword")]
        mode: TextHighlightMode,
    },
    Blur {
        intensity: f64,
    },
    ColorGrade {
        exposure: f64,
        contrast: f64,
        saturation: f64,
        temperature: f64,
    },
    Motion {
        channels: Vec<Motion>,
        #[serde(
            default,
            rename = "motionTiming",
            skip_serializing_if = "Option::is_none"
        )]
        motion_timing: Option<MotionTiming>,
        #[serde(
            default,
            rename = "repeatSeconds",
            skip_serializing_if = "Option::is_none"
        )]
        repeat_seconds: Option<f64>,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TextStroke {
    pub color: String,
    pub width: f64,
}
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum TextHighlightMode {
    #[default]
    Keyword,
    ActiveWord,
}
impl TextHighlightMode {
    fn is_keyword(&self) -> bool {
        matches!(self, Self::Keyword)
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TreatmentApplication {
    pub treatment_id: String,
    pub target: Target,
    pub enabled: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ElementTransition {
    pub id: String,
    pub from_element_id: String,
    pub to_element_id: String,
    pub effect_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TransitionEffect {
    pub id: String,
    pub effect: PairEffect,
    pub duration_seconds: f64,
    #[serde(default)]
    pub outgoing_fade: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum PairEffect {
    Dissolve,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum SpatialPlacement {
    Overlay,
    Above,
    Below,
    Left,
    Right,
}
impl SpatialPlacement {
    /// Normalized parent/child anchors and the direction of positive gap.
    /// Coordinates stay in the reference box's local axes, before any motion.
    pub fn anchors(&self) -> ([f64; 2], [f64; 2], [f64; 2]) {
        match self {
            Self::Overlay => ([0.5, 0.5], [0.5, 0.5], [0., 0.]),
            Self::Above => ([0.5, 0.], [0.5, 1.], [0., -1.]),
            Self::Below => ([0.5, 1.], [0.5, 0.], [0., 1.]),
            Self::Left => ([0., 0.5], [1., 0.5], [-1., 0.]),
            Self::Right => ([1., 0.5], [0., 0.5], [1., 0.]),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpatialRelation {
    #[serde(default, skip_serializing_if = "SpatialBounds::is_layout")]
    pub reference_bounds: SpatialBounds,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub follow_motion: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_binding: Option<TextSizeBinding>,
    pub element_id: String,
    pub relative_to: String,
    pub placement: SpatialPlacement,
    pub gap: f64,
    pub offset_x: f64,
    pub offset_y: f64,
}
/// Size the child's base geometry from the parent's measured text_box, before
/// independent child motion. Enabled parent background padding is already in
/// text_box; this padding is additional clearance on each side of the axis.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TextSizeBinding {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<TextSizeAxis>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<TextSizeAxis>,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TextSizeAxis {
    /// Target dimension = measured dimension * factor + 2 * padding * canvas axis.
    #[schemars(range(max = 20.0), extend("exclusiveMinimum" = 0.0))]
    pub factor: f64,
    /// Per-side clearance normalized to canvas width/height, respectively.
    #[schemars(range(min = 0.0, max = 1.0))]
    pub padding: f64,
}
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum SpatialBounds {
    #[default]
    Layout,
    TextBox,
}
impl SpatialBounds {
    fn is_layout(&self) -> bool {
        *self == Self::Layout
    }
}
pub fn relative_region(child: &Rect, parent: &Rect, relation: &SpatialRelation) -> Result<Rect> {
    let mut region = child.clone();
    let (parent_anchor, child_anchor, gap_axis) = relation.placement.anchors();
    region.x = parent.x + parent.width * parent_anchor[0] - child.width * child_anchor[0]
        + relation.gap * gap_axis[0]
        + relation.offset_x;
    region.y = parent.y + parent.height * parent_anchor[1] - child.height * child_anchor[1]
        + relation.gap * gap_axis[1]
        + relation.offset_y;
    if relation.reference_bounds == SpatialBounds::TextBox {
        region.validate_extent()?;
    } else {
        region.validate()?;
    }
    Ok(region)
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum SoundEventKind {
    Speech,
    Beat,
    Onset,
    Pause,
    EnergyPeak,
    Section,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScheduleRule {
    pub element_id: String,
    pub event_kind: super::events::EventKind,
    /// Hold through pauses until the next event of this kind, before selection filters.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub end_at_next_event: bool,
    pub min_confidence: f64,
    pub min_strength: f64,
    pub cooldown_seconds: f64,
    pub max_occurrences: usize,
    pub strength_weight: f64,
    pub confidence_weight: f64,
    pub repetition_penalty: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResourceRequirement {
    pub slot_id: String,
    pub required: bool,
    pub min_duration_seconds: f64,
    pub min_width: u32,
    pub min_height: u32,
    pub min_aspect_ratio: f64,
    pub max_aspect_ratio: f64,
    pub allow_crop: bool,
    pub required_tags: Vec<String>,
    pub fallback_slot_ids: Vec<String>,
}
impl Composition {
    pub fn is_empty(&self) -> bool {
        self.rigid_transforms.is_empty()
            && self.accumulating_lists.is_empty()
            && self.lifecycles.is_empty()
            && self.state_relations.is_empty()
            && self.layout_policy.is_none()
            && self.arrangements.is_empty()
            && self.groups.is_empty()
            && self.treatments.is_empty()
            && self.applications.is_empty()
            && self.transitions.is_empty()
            && self.transition_effects.is_empty()
            && self.spatial_relations.is_empty()
            && self.reading_replicas.is_empty()
            && self.scheduling.is_empty()
            && self.resource_requirements.is_empty()
    }
    pub fn members<'a>(&'a self, target: &'a Target) -> Vec<&'a str> {
        match target {
            Target::Element(id) => vec![id],
            Target::Group(id) => self
                .groups
                .iter()
                .find(|g| &g.id == id)
                .map(|g| g.element_ids.iter().map(String::as_str).collect())
                .unwrap_or_default(),
            Target::Layout(_) => vec![],
        }
    }
    pub fn validate(&self, t: &Template) -> Result<()> {
        super::rigid_transform::validate(t)?;
        let mut replicas = HashSet::new();
        for relation in &self.reading_replicas {
            let replica = t
                .elements
                .iter()
                .find(|e| e.id == relation.element_id)
                .context("unknown reading replica")?;
            let primary = t
                .elements
                .iter()
                .find(|e| e.id == relation.primary_id)
                .context("unknown reading primary")?;
            ensure!(
                replicas.insert(&relation.element_id) && replica.id != primary.id,
                "duplicate or self reading replica"
            );
            ensure!(
                replica.features.representation == Representation::Text
                    && primary.features.representation == Representation::Text,
                "reading relation requires text endpoints"
            );
            ensure!(
                replica.features.role == Some(Role::Decoration)
                    && primary.features.role != Some(Role::Decoration),
                "reading replica must be decoration and primary must not be decoration"
            );
            ensure!(
                !self
                    .reading_replicas
                    .iter()
                    .any(|r| r.element_id == relation.primary_id),
                "reading replica primary cannot itself be a replica"
            );
            ensure!(
                replica.binding == primary.binding
                    && (replica.binding != Binding::Literal || replica.literal == primary.literal),
                "reading replica content bindings must match"
            );
        }
        let mut lifecycle_ids = HashSet::new();
        for list in &self.accumulating_lists {
            ensure!(
                !list.items.is_empty() && !list.end_event_id.is_empty(),
                "empty accumulating list"
            );
            for item in &list.items {
                ensure!(
                    lifecycle_ids.insert(&item.element_id)
                        && !item.start_event_id.is_empty()
                        && t.elements.iter().any(|e| e.id == item.element_id
                            && e.features.representation == Representation::Text),
                    "invalid or conflicting list item"
                );
            }
        }
        for r in &self.lifecycles {
            ensure!(
                lifecycle_ids.insert(&r.element_id)
                    && t.elements.iter().any(|e| e.id == r.element_id
                        && e.features.representation != Representation::Audio)
                    && !r.start_event_id.is_empty()
                    && !r.end_event_id.is_empty(),
                "invalid lifecycle reference"
            );
        }
        let mut state_targets = HashSet::new();
        for r in &self.state_relations {
            ensure!(
                r.source_element_id != r.target_element_id
                    && state_targets.insert(&r.target_element_id)
                    && [&r.source_element_id, &r.target_element_id]
                        .iter()
                        .all(|id| t
                            .elements
                            .iter()
                            .any(|e| &e.id == *id
                                && e.features.representation != Representation::Audio))
                    && (0.0..=1.0).contains(&r.opacity)
                    && (0.001..=10.0).contains(&r.duration_seconds),
                "invalid state relation"
            );
            let mut seen = HashSet::new();
            let mut id = r.target_element_id.as_str();
            while let Some(next) = self
                .state_relations
                .iter()
                .find(|v| v.target_element_id == id)
            {
                ensure!(seen.insert(id), "cyclic state relation");
                id = &next.source_element_id;
            }
        }
        if let Some(p) = &self.layout_policy {
            ensure!(
                [
                    p.intent_match_weight,
                    p.repetition_penalty,
                    p.min_hold_seconds
                ]
                .iter()
                .all(|v| v.is_finite() && *v >= 0. && *v <= 3600.),
                "invalid layout policy"
            );
            ensure!(
                p.base_scores
                    .iter()
                    .all(|(id, score)| t.layouts.iter().any(|l| &l.id == id)
                        && score.is_finite()
                        && score.abs() <= 100.),
                "invalid layout score"
            );
        }
        let visual = |id: &str| {
            t.elements.iter().any(|e| {
                e.id == id
                    && e.features.representation != Representation::Audio
                    && super::compiler::supported_representation(&e.features.representation)
            })
        };
        let unique = |ids: Vec<&str>| -> Result<()> {
            let mut seen = HashSet::new();
            ensure!(
                ids.len() <= 1000 && ids.into_iter().all(|id| valid_id(id) && seen.insert(id)),
                "invalid or duplicate composition ID"
            );
            Ok(())
        };
        unique(self.groups.iter().map(|g| g.id.as_str()).collect())?;
        unique(self.treatments.iter().map(|g| g.id.as_str()).collect())?;
        unique(self.transitions.iter().map(|g| g.id.as_str()).collect())?;
        unique(
            self.transition_effects
                .iter()
                .map(|g| g.id.as_str())
                .collect(),
        )?;
        for e in &self.transition_effects {
            ensure!(
                (0.001..=2.).contains(&e.duration_seconds),
                "invalid transition duration"
            );
        }
        unique(
            self.spatial_relations
                .iter()
                .map(|g| g.element_id.as_str())
                .collect(),
        )?;
        unique(
            self.scheduling
                .iter()
                .map(|g| g.element_id.as_str())
                .collect(),
        )?;
        unique(
            self.resource_requirements
                .iter()
                .map(|g| g.slot_id.as_str())
                .collect(),
        )?;
        for g in &self.groups {
            ensure!(
                !t.elements.iter().any(|e| e.id == g.id),
                "group and element IDs must be distinct"
            );
            ensure!(
                !g.element_ids.is_empty() && g.element_ids.iter().all(|id| visual(id)),
                "group requires visual elements"
            );
            unique(g.element_ids.iter().map(String::as_str).collect())?;
        }
        let mut grouped = HashSet::new();
        for g in self.groups.iter().filter(|g| g.composite) {
            ensure!(
                g.element_ids.iter().all(|id| grouped.insert(id)),
                "element cannot belong to two composite groups"
            );
        }
        unique(
            self.arrangements
                .iter()
                .map(|a| a.group_id.as_str())
                .collect(),
        )?;
        let mut arranged = HashSet::new();
        for a in &self.arrangements {
            a.region.validate()?;
            let g = self
                .groups
                .iter()
                .find(|g| g.id == a.group_id)
                .context("unknown arrangement group")?;
            ensure!(
                a.columns > 0 && a.columns <= g.element_ids.len() && (0.0..=1.).contains(&a.gap),
                "invalid grid arrangement"
            );
            ensure!(
                g.element_ids.iter().all(|id| arranged.insert(id)
                    && !self.spatial_relations.iter().any(|r| &r.element_id == id)),
                "arrangement and attachment cannot both own a region"
            );
        }
        for treatment in &self.treatments {
            match &treatment.operation {
                TreatmentOperation::CanvasClip { region } => region.validate()?,
                TreatmentOperation::TextHighlight { color, stroke, .. } => {
                    if let Some(s) = stroke {
                        ensure!(
                            s.color.len() == 7
                                && s.color.starts_with('#')
                                && s.color[1..].bytes().all(|c| c.is_ascii_hexdigit())
                                && (0.0..=30.0).contains(&s.width),
                            "invalid highlight stroke"
                        );
                    }
                    ensure!(
                        color.len() == 7
                            && color.starts_with('#')
                            && color[1..].bytes().all(|c| c.is_ascii_hexdigit()),
                        "text highlight requires an opaque RGB color"
                    );
                }
                TreatmentOperation::Blur { intensity } => {
                    ensure!((0.0..=100.).contains(intensity), "invalid blur")
                }
                TreatmentOperation::ColorGrade {
                    exposure,
                    contrast,
                    saturation,
                    temperature,
                } => ensure!(
                    (-3.0..=3.).contains(exposure)
                        && (-100.0..=100.).contains(contrast)
                        && (-100.0..=200.).contains(saturation)
                        && (-100.0..=100.).contains(temperature),
                    "invalid color grade"
                ),
                TreatmentOperation::Motion {
                    channels,
                    repeat_seconds,
                    motion_timing,
                } => {
                    if let Some(timing) = motion_timing {
                        ensure!(
                            repeat_seconds.is_none(),
                            "fixed phase timing cannot be combined with repeat motion"
                        );
                        super::motion_timing::validate(timing)?;
                    }
                    if let Some(seconds) = repeat_seconds {
                        ensure!(
                            seconds.is_finite() && (0.2..=60.).contains(seconds),
                            "motion repeat period must be 0.2-60 seconds"
                        );
                    }
                    ensure!(
                        !channels.is_empty() && channels.len() <= 8,
                        "invalid motion channels"
                    );
                    let mut properties = HashSet::new();
                    ensure!(
                        !channels
                            .iter()
                            .any(|m| matches!(m.property, MotionProperty::Scale))
                            || !channels.iter().any(|m| matches!(
                                m.property,
                                MotionProperty::ScaleX | MotionProperty::ScaleY
                            )),
                        "uniform and axis scale channels conflict"
                    );
                    for m in channels {
                        if m.property == MotionProperty::StrokeReveal {
                            super::ellipse_arc::validate_motion(m)?;
                        }
                        if m.property == MotionProperty::BackgroundOpacity {
                            ensure!(
                                m.keys.iter().all(|k| (0.0..=1.0).contains(&k.value)),
                                "background opacity motion values must be 0-1"
                            );
                        }
                        ensure!(
                            !matches!(m.property, MotionProperty::Reveal)
                                && properties.insert(format!("{:?}", m.property)),
                            "unsupported or duplicate motion channel"
                        );
                        ensure!((2..=100).contains(&m.keys.len()), "motion key count");
                        if repeat_seconds.is_some() {
                            let first = &m.keys[0];
                            let last = m.keys.last().unwrap();
                            ensure!(
                                first.time == 0.
                                    && last.time == 1.
                                    && (first.value - last.value).abs() < 1e-9,
                                "looping motion must close at matching values at 0 and 1"
                            );
                        }
                        let mut previous = -1.;
                        for k in &m.keys {
                            ensure!(
                                (0.0..=1.).contains(&k.time)
                                    && k.time > previous
                                    && k.value.is_finite(),
                                "invalid motion key"
                            );
                            previous = k.time;
                        }
                    }
                }
            }
        }
        let mut applications = HashSet::new();
        let mut highlighted = HashSet::new();
        for a in &self.applications {
            if let Some(Treatment {
                operation: TreatmentOperation::CanvasClip { .. },
                ..
            }) = self.treatments.iter().find(|v| v.id == a.treatment_id)
            {
                let ids = self.members(&a.target);
                ensure!(
                    !ids.is_empty()
                        && ids.iter().all(|id| visual(id))
                        && !matches!(&a.target, Target::Group(id) if self.groups.iter().any(|g| &g.id == id && g.composite)),
                    "canvas clip requires visual elements or a shared group"
                );
            }
            ensure!(
                self.treatments.iter().any(|e| e.id == a.treatment_id),
                "unknown treatment"
            );
            ensure!(
                applications.insert(format!("{}:{:?}", a.treatment_id, a.target)),
                "duplicate treatment application"
            );
            match &a.target {
                Target::Layout(id) => ensure!(
                    t.layouts.iter().any(|l| &l.id == id),
                    "unknown layout target"
                ),
                _ => {
                    let ids = self.members(&a.target);
                    ensure!(
                        !ids.is_empty() && ids.iter().all(|id| visual(id)),
                        "unknown or nonvisual treatment target"
                    );
                }
            }
            if let TreatmentOperation::Motion { channels, .. } = &self
                .treatments
                .iter()
                .find(|v| v.id == a.treatment_id)
                .unwrap()
                .operation
            {
                if channels
                    .iter()
                    .any(|m| m.property == MotionProperty::StrokeReveal)
                {
                    let Target::Element(id) = &a.target else {
                        anyhow::bail!(
                            "stroke_reveal treatment requires an individual outlined ellipse, not a group or layout"
                        );
                    };
                    let element = t
                        .elements
                        .iter()
                        .find(|element| &element.id == id)
                        .context("unknown stroke_reveal target")?;
                    super::ellipse_arc::validate_target(element, &t.styles)?;
                }
                if channels
                    .iter()
                    .any(|m| m.property == MotionProperty::BackgroundOpacity)
                {
                    let ids = self.members(&a.target);
                    ensure!(
                        !matches!(&a.target, Target::Layout(_))
                            && !matches!(&a.target, Target::Group(id) if self.groups.iter().any(|g| &g.id == id && g.composite))
                            && !ids.is_empty()
                            && ids.iter().all(|id| t.elements.iter().any(|e| &e.id == *id
                                && e.features.representation == Representation::Text
                                && t.styles.iter().any(|s| Some(&s.id) == e.style_id.as_ref()
                                    && s.background.is_some()))),
                        "background opacity motion requires text with an enabled background or a shared text group"
                    );
                }
            }
            if let TreatmentOperation::TextHighlight { mode, .. } = &self
                .treatments
                .iter()
                .find(|v| v.id == a.treatment_id)
                .unwrap()
                .operation
            {
                let ids = self.members(&a.target);
                ensure!(
                    !matches!(&a.target, Target::Layout(_))
                        && !matches!(&a.target, Target::Group(id) if self.groups.iter().any(|g| &g.id == id && g.composite))
                        && !ids.is_empty()
                        && ids.iter().all(|id| t.elements.iter().any(|e| &e.id == *id
                            && e.features.representation == Representation::Text
                            && (e.binding == Binding::Sentence
                                || (*mode == TextHighlightMode::Keyword
                                    && e.binding == Binding::Keyword)))),
                    "text highlight requires sentence/keyword text elements or a shared text group"
                );
                if a.enabled {
                    ensure!(
                        ids.iter().all(|id| highlighted.insert((*id).to_owned())),
                        "multiple highlight treatments target one text element"
                    );
                }
            }
        }
        let mut pairs = HashSet::new();
        for r in &self.transitions {
            ensure!(
                (visual(&r.from_element_id)
                    || self
                        .groups
                        .iter()
                        .any(|g| g.composite && g.id == r.from_element_id))
                    && (visual(&r.to_element_id)
                        || self
                            .groups
                            .iter()
                            .any(|g| g.composite && g.id == r.to_element_id))
                    && self.transition_effects.iter().any(|e| e.id == r.effect_id)
                    && pairs.insert((&r.from_element_id, &r.to_element_id)),
                "invalid element transition"
            );
        }
        for r in &self.spatial_relations {
            if let Some(binding) = &r.size_binding {
                ensure!(
                    r.reference_bounds == SpatialBounds::TextBox && r.follow_motion,
                    "text size binding requires a motion-following text-box attachment"
                );
                ensure!(
                    binding.width.is_some() || binding.height.is_some(),
                    "text size binding requires at least one axis"
                );
                for axis in [&binding.width, &binding.height].into_iter().flatten() {
                    ensure!(
                        axis.factor.is_finite()
                            && axis.factor > 0.
                            && axis.factor <= 20.
                            && (0.0..=1.).contains(&axis.padding),
                        "invalid text size binding axis"
                    );
                }
                ensure!(
                    t.elements.iter().any(|e| e.id == r.element_id
                        && matches!(
                            e.features.representation,
                            Representation::Rectangle
                                | Representation::Ellipse
                                | Representation::Star
                                | Representation::Line
                        )),
                    "text size binding requires a native rectangle, ellipse, star or line child"
                );
                ensure!(
                    !self
                        .spatial_relations
                        .iter()
                        .any(|downstream| downstream.follow_motion
                            && downstream.relative_to == r.element_id),
                    "motion following a size-bound graphic is not supported"
                );
            }
            if r.reference_bounds == SpatialBounds::TextBox {
                ensure!(
                    r.follow_motion,
                    "text-box attachment currently requires motion following"
                );
                ensure!(
                    t.elements.iter().any(|e| e.id == r.relative_to
                        && e.features.representation == Representation::Text),
                    "text-box attachment requires a text parent"
                );
            }
            ensure!(
                visual(&r.element_id)
                    && visual(&r.relative_to)
                    && r.element_id != r.relative_to
                    && (0.0..=1.).contains(&r.gap)
                    && (-1.0..=1.).contains(&r.offset_x)
                    && (-1.0..=1.).contains(&r.offset_y),
                "invalid spatial relation"
            );
            let mut seen = HashSet::new();
            let mut id = r.element_id.as_str();
            while let Some(next) = self.spatial_relations.iter().find(|n| n.element_id == id) {
                ensure!(seen.insert(id), "cyclic spatial relationship");
                id = &next.relative_to;
            }
        }
        for r in &self.scheduling {
            let e = t
                .elements
                .iter()
                .find(|e| e.id == r.element_id)
                .context("unknown scheduled element")?;
            let _ = e;
            ensure!(
                (0.0..=1.).contains(&r.min_confidence)
                    && (0.0..=1.).contains(&r.min_strength)
                    && (0.0..=3600.).contains(&r.cooldown_seconds)
                    && (1..=10000).contains(&r.max_occurrences)
                    && [r.strength_weight, r.confidence_weight, r.repetition_penalty]
                        .iter()
                        .all(|v| v.is_finite() && *v >= 0. && *v <= 100.),
                "invalid scheduling variables"
            );
        }
        for r in &self.resource_requirements {
            let slot = t
                .resource_slots
                .iter()
                .find(|s| s.id == r.slot_id)
                .context("unknown required slot")?;
            ensure!(
                slot.representation.is_visual_asset(),
                "visual requirements require a visual media slot"
            );
            ensure!(
                (0.0..=3600.).contains(&r.min_duration_seconds)
                    && r.min_width <= 32768
                    && r.min_height <= 32768
                    && r.min_aspect_ratio.is_finite()
                    && r.max_aspect_ratio.is_finite()
                    && r.min_aspect_ratio > 0.
                    && r.max_aspect_ratio >= r.min_aspect_ratio,
                "invalid resource constraints"
            );
            unique(r.fallback_slot_ids.iter().map(String::as_str).collect())?;
            ensure!(
                r.fallback_slot_ids.iter().all(|id| id != &r.slot_id
                    && t.resource_slots.iter().any(|s| &s.id == id
                        && (s.representation == slot.representation
                            || slot.representation == Representation::VisualMedia
                                && s.representation.is_visual_asset()))),
                "incompatible fallback slot"
            );
        }
        Ok(())
    }
    pub fn select_layout<'a>(
        &self,
        t: &'a Template,
        intent: &Intent,
        time: f64,
        previous: &[super::rhythm::LayoutInstance],
    ) -> &'a Layout {
        let Some(policy) = &self.layout_policy else {
            return t
                .layouts
                .iter()
                .find(|l| l.intents.contains(intent))
                .unwrap_or(&t.layouts[0]);
        };
        if let Some(last) = previous
            .last()
            .filter(|l| time - l.start < policy.min_hold_seconds)
        {
            return t.layouts.iter().find(|l| l.id == last.layout_id).unwrap();
        }
        let score = |l: &Layout| {
            policy.base_scores.get(&l.id).copied().unwrap_or(0.)
                + if l.intents.contains(intent) {
                    policy.intent_match_weight
                } else {
                    0.
                }
                - policy.repetition_penalty
                    * previous.iter().filter(|p| p.layout_id == l.id).count() as f64
        };
        t.layouts
            .iter()
            .max_by(|a, b| score(a).total_cmp(&score(b)).then_with(|| b.id.cmp(&a.id)))
            .unwrap()
    }
    pub fn resolve_resources(&self, t: &mut Template) -> Result<()> {
        let original = t.clone();
        for r in &self.resource_requirements {
            if t.asset_id(&r.slot_id).is_none()
                && !t
                    .resource_bindings
                    .iter()
                    .any(|b| b.slot_id == r.slot_id && !b.enabled)
            {
                if let Some(asset) = r
                    .fallback_slot_ids
                    .iter()
                    .find_map(|id| original.asset_id(id))
                {
                    t.bind(&r.slot_id, asset);
                }
            }
            ensure!(
                !r.required || t.asset_id(&r.slot_id).is_some(),
                "required resource missing: {}",
                r.slot_id
            );
        }
        Ok(())
    }
    pub fn place(&self, elements: &mut [PlacedElement]) -> Result<()> {
        for a in &self.arrangements {
            let g = self.groups.iter().find(|g| g.id == a.group_id).unwrap();
            let rows = g.element_ids.len().div_ceil(a.columns);
            let width = (a.region.width - a.gap * (a.columns - 1) as f64) / a.columns as f64;
            let height = (a.region.height - a.gap * (rows - 1) as f64) / rows as f64;
            ensure!(
                width > 0. && height > 0.,
                "arrangement spacing leaves no content area"
            );
            for e in elements.iter_mut() {
                if let Some(i) = g.element_ids.iter().position(|id| id == &e.element_id) {
                    e.region = Rect {
                        x: a.region.x + (i % a.columns) as f64 * (width + a.gap),
                        y: a.region.y + (i / a.columns) as f64 * (height + a.gap),
                        width,
                        height,
                    };
                }
            }
        }
        let mut done = HashSet::new();
        for _ in 0..=self.spatial_relations.len() {
            for r in &self.spatial_relations {
                if done.contains(&r.element_id)
                    || self
                        .spatial_relations
                        .iter()
                        .any(|x| x.element_id == r.relative_to && !done.contains(&x.element_id))
                {
                    continue;
                }
                let parents: Vec<_> = elements
                    .iter()
                    .filter(|e| e.element_id == r.relative_to)
                    .map(|e| (e.start, e.end, e.region.clone()))
                    .collect();
                for child in elements.iter_mut().filter(|e| e.element_id == r.element_id) {
                    let candidates: Vec<_> = parents
                        .iter()
                        .filter(|(a, b, _)| *a <= child.start + 1e-6 && *b >= child.end - 1e-6)
                        .collect();
                    ensure!(
                        candidates.len() == 1,
                        "spatial parent must uniquely cover child interval: {}",
                        r.element_id
                    );
                    child.region = relative_region(&child.region, &candidates[0].2, r)?;
                }
                done.insert(&r.element_id);
            }
        }
        Ok(())
    }
    pub fn resource_check(
        &self,
        slot: &str,
        asset: &serde_json::Value,
        crop: bool,
        source_start: f64,
    ) -> Result<()> {
        if let Some(r) = self
            .resource_requirements
            .iter()
            .find(|r| r.slot_id == slot)
        {
            let w = asset["width"].as_f64().unwrap_or(0.);
            let h = asset["height"].as_f64().unwrap_or(0.);
            ensure!(
                w >= r.min_width as f64
                    && h >= r.min_height as f64
                    && (r.min_aspect_ratio..=r.max_aspect_ratio).contains(&(w / h)),
                "resource dimensions violate slot {}",
                slot
            );
            ensure!(!crop || r.allow_crop, "crop is forbidden by slot {}", slot);
            ensure!(
                r.min_duration_seconds == 0.
                    || asset["duration"]
                        .as_f64()
                        .is_some_and(|d| d - source_start >= r.min_duration_seconds),
                "resource duration violates slot {}",
                slot
            );
            ensure!(
                r.required_tags.iter().all(|tag| asset["tags"]
                    .as_array()
                    .is_some_and(|tags| tags.iter().any(|v| v.as_str() == Some(tag)))),
                "resource tags are not evidenced for slot {}",
                slot
            );
        }
        Ok(())
    }
}
