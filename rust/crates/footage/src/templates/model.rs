use anyhow::{Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Title,
    Subtitle,
    Translation,
    Emphasis,
    Callout,
    SpeakerLabel,
    Chapter,
    ListItem,
    Metric,
    Annotation,
    Decoration,
    PrimaryVisual,
    SupportingVisual,
    Background,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Representation {
    Text,
    Image,
    Video,
    VisualMedia,
    Audio,
    Rectangle,
    Ellipse,
    Star,
    Line,
    Arrow,
    Particles,
    SubjectContour,
    Spotlight,
}
impl Representation {
    pub fn is_visual_asset(&self) -> bool {
        matches!(self, Self::Image | Self::Video | Self::VisualMedia)
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum MediaUse {
    Icon,
    Sticker,
    Broll,
    SourceVideo,
    SoundEffect,
    Music,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Placement {
    Fixed,
    Caption,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Features {
    pub role: Option<Role>,
    pub representation: Representation,
    pub media_use: Option<MediaUse>,
    pub outline: bool,
    pub accent: bool,
    pub placement: Placement,
    pub avoid_protected_regions: bool,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Intent {
    Neutral,
    Hook,
    Question,
    Contrast,
    List,
    Metric,
    Emphasis,
    Explanation,
    Conclusion,
    CallToAction,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Binding {
    Title,
    Sentence,
    Keyword,
    SemanticNumber,
    Translation,
    Speaker,
    Literal,
    SourceVideo,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Anchor {
    CueStart,
    KeywordStart,
    CueEnd,
    SemanticStart,
    SemanticEnd,
    VideoStart,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum MotionProperty {
    Opacity,
    /// Absolute text-background alpha; does not change glyph opacity.
    BackgroundOpacity,
    Scale,
    ScaleX,
    ScaleY,
    X,
    Y,
    Rotation,
    /// Normalized progress along an outlined ellipse path, independent of opacity.
    StrokeReveal,
    Reveal,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Easing {
    Linear,
    EaseIn,
    EaseOut,
    EaseInOut,
    Overshoot,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum LayoutMode {
    FullBleed,
    PunchIn,
    CircleInset,
    Split,
    PictureInPicture,
    BlurredFill,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum TransitionKind {
    Cut,
    Dissolve,
    Slide,
    Zoom,
    Wipe,
    Blur,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceStatus {
    Observed,
    Inferred,
    Authored,
    Unverified,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Evidence {
    pub reference_id: Option<String>,
    pub start_seconds: Option<f64>,
    pub end_seconds: Option<f64>,
    pub status: EvidenceStatus,
    pub description: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
impl Rect {
    /// A derived measured attachment can lie outside the authored canvas box;
    /// its final position is corrected against renderer-provided text metrics.
    pub fn validate_extent(&self) -> Result<()> {
        ensure!(
            [self.x, self.y, self.width, self.height]
                .iter()
                .all(|v| v.is_finite()),
            "nonfinite layout"
        );
        ensure!(
            self.width > 0.
                && self.height > 0.
                && self.width <= 1.000001
                && self.height <= 1.000001,
            "invalid normalized layout size"
        );
        Ok(())
    }
    pub fn validate(&self) -> Result<()> {
        ensure!(
            [self.x, self.y, self.width, self.height]
                .iter()
                .all(|v| v.is_finite()),
            "nonfinite layout"
        );
        ensure!(
            self.x >= 0.0
                && self.y >= 0.0
                && self.width > 0.0
                && self.height > 0.0
                && self.x + self.width <= 1.000001
                && self.y + self.height <= 1.000001,
            "layout must fit normalized canvas"
        );
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Shadow {
    pub color: String,
    pub opacity: f64,
    pub blur: f64,
    pub x: f64,
    pub y: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Style {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grid: Option<GridPattern>,
    pub id: String,
    pub description: String,
    pub font_family: String,
    /// Font size in design-canvas pixels; not viewport units.
    pub font_size: f64,
    #[schemars(range(min = 100, max = 900))]
    pub weight: u16,
    pub italic: bool,
    #[serde(default)]
    pub letter_spacing: f64,
    #[serde(default)]
    pub text_align: TextAlignment,
    pub fill: String,
    pub stroke: String,
    pub stroke_width: f64,
    pub background: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(range(min = 0.0, max = 1.0))]
    pub background_opacity: Option<f64>,
    /// 0–100% of half the shorter background side, independent of canvas scale.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(range(min = 0.0, max = 100.0))]
    pub background_corner_radius: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_padding: Option<TextBackgroundPadding>,
    pub shadow: Option<Shadow>,
    pub line_height: f64,
    pub max_lines: u8,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GridPattern {
    pub spacing: f64,
    pub width: f64,
    pub color: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TextBackgroundPadding {
    /// Horizontal and vertical inset in design-canvas pixels.
    pub x: f64,
    pub y: f64,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum TextAlignment {
    Left,
    #[default]
    Center,
    Right,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MotionKey {
    pub time: f64,
    pub value: f64,
    pub easing: Easing,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Motion {
    pub property: MotionProperty,
    pub keys: Vec<MotionKey>,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MotionCoverage {
    pub min_exit_frames: u32,
    pub min_post_frames: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MotionTiming {
    /// Optional authored sampling requirement; omission permits an end cut.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub coverage: Option<MotionCoverage>,
    pub enter_end: f64,
    pub exit_start: f64,
    pub enter_seconds: f64,
    pub exit_seconds: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum EndAnchor {
    EventEnd,
    CueEnd,
    SemanticEnd,
    VideoEnd,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Timing {
    /// Optional explicit end boundary, independent of start anchor and content binding.
    /// Omitted retains legacy scheduling; max_seconds still caps the result.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_anchor: Option<EndAnchor>,
    pub anchor: Anchor,
    pub offset_seconds: f64,
    pub max_seconds: f64,
    pub min_seconds: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Element {
    pub id: String,
    pub features: Features,
    /// Optional ellipse geometry; color and line width remain in the shared style.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ellipse_arc: Option<super::ellipse_arc::EllipseArc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub star_geometry: Option<super::star_geometry::StarGeometry>,
    /// Optional rectangle geometry; paint, scheduling and motion remain independent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rectangle_geometry: Option<super::rectangle_geometry::RectangleGeometry>,
    pub description: String,
    pub binding: Binding,
    pub literal: Option<String>,
    pub style_id: Option<String>,
    pub resource_id: Option<String>,
    pub region: Rect,
    pub z: i32,
    pub timing: Timing,
    /// Local readability hold, before existing next-event and explicit end boundaries.
    /// Omitted uses the host visual-rhythm minimum; never changes aligned word times.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_display_seconds: Option<f64>,
    pub motions: Vec<Motion>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub motion_timing: Option<MotionTiming>,
    pub intents: Vec<Intent>,
    pub priority: u8,
    pub exclusive_group: Option<String>,
    pub evidence: Vec<Evidence>,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Layout {
    pub id: String,
    pub description: String,
    pub mode: LayoutMode,
    pub video_region: Rect,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secondary: Option<SecondaryView>,
    pub caption_region: Rect,
    pub safe_regions: Vec<Rect>,
    pub intents: Vec<Intent>,
    pub evidence: Vec<Evidence>,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SecondaryView {
    pub resource_id: String,
    pub region: Rect,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResourceSlot {
    pub id: String,
    pub representation: Representation,
    pub description: String,
    pub tags: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResourceBinding {
    pub slot_id: String,
    pub asset_id: String,
    #[serde(default = "enabled_binding")]
    pub enabled: bool,
}
fn enabled_binding() -> bool {
    true
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LayoutEntrance {
    pub layout_id: String,
    pub effect: TransitionKind,
    pub duration_seconds: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TransitionRule {
    pub id: String,
    pub from_layout_id: String,
    pub to_layout_id: String,
    pub effect: TransitionKind,
    pub duration_seconds: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SegmentationPolicy {
    /// Opt-in reuse of content phrase hints during automatic caption segmentation.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub preserve_layout_phrases: bool,
    pub pause_boundary_seconds: f64,
    pub max_phrase_seconds: f64,
    pub max_characters: usize,
    pub max_characters_per_second: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VisualRhythmPolicy {
    pub min_display_seconds: f64,
    pub max_accents_per_cue: usize,
}
pub fn valid_min_display_seconds(value: f64) -> bool {
    value.is_finite() && (0.1..=3.0).contains(&value)
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AudioPlacementPolicy {
    pub effect_cooldown_seconds: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MixPolicy {
    pub music_gain_db: f64,
    pub music_duck_db: f64,
    #[serde(default = "default_effect_gain")]
    pub effect_gain_db: f64,
    #[serde(default = "default_duck_attack")]
    pub music_duck_attack_seconds: f64,
    #[serde(default = "default_duck_release")]
    pub music_duck_release_seconds: f64,
}
fn default_effect_gain() -> f64 {
    -12.0
}
fn default_duck_attack() -> f64 {
    0.08
}
fn default_duck_release() -> f64 {
    0.3
}
impl Default for SegmentationPolicy {
    fn default() -> Self {
        Self {
            preserve_layout_phrases: false,
            pause_boundary_seconds: 0.32,
            max_phrase_seconds: 3.5,
            max_characters: 16,
            max_characters_per_second: 10.0,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Canvas {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
}
/// Compilable composition document. May contain application-specific orchestration
/// and event IDs; saving this document does not certify a reusable style.
/// Use dynamic_asset::Definition for the reusable visual-style library.
#[derive(Clone, Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Template {
    #[serde(
        default,
        skip_serializing_if = "super::composition::Composition::is_empty"
    )]
    pub composition: super::composition::Composition,
    pub schema_version: String,
    pub id: String,
    pub revision: u64,
    pub name: String,
    pub description: String,
    pub tags: Vec<String>,
    pub canvas: Canvas,
    pub elements: Vec<Element>,
    pub styles: Vec<Style>,
    pub resource_slots: Vec<ResourceSlot>,
    pub resource_bindings: Vec<ResourceBinding>,
    pub layouts: Vec<Layout>,
    pub layout_entrances: Vec<LayoutEntrance>,
    pub transition_rules: Vec<TransitionRule>,
    pub segmentation: SegmentationPolicy,
    pub visual_rhythm: VisualRhythmPolicy,
    pub audio_placement: AudioPlacementPolicy,
    pub mix: MixPolicy,
    pub evidence: Vec<Evidence>,
}
#[derive(Deserialize)]
#[serde(remote = "Template", rename_all = "camelCase", deny_unknown_fields)]
struct TemplateWire {
    #[serde(default)]
    composition: super::composition::Composition,
    schema_version: String,
    id: String,
    revision: u64,
    name: String,
    description: String,
    tags: Vec<String>,
    canvas: Canvas,
    elements: Vec<Element>,
    styles: Vec<Style>,
    resource_slots: Vec<ResourceSlot>,
    resource_bindings: Vec<ResourceBinding>,
    layouts: Vec<Layout>,
    layout_entrances: Vec<LayoutEntrance>,
    transition_rules: Vec<TransitionRule>,
    segmentation: SegmentationPolicy,
    visual_rhythm: VisualRhythmPolicy,
    audio_placement: AudioPlacementPolicy,
    mix: MixPolicy,
    evidence: Vec<Evidence>,
}
impl<'de> Deserialize<'de> for Template {
    fn deserialize<D: serde::Deserializer<'de>>(
        deserializer: D,
    ) -> std::result::Result<Self, D::Error> {
        let value = serde_json::Value::deserialize(deserializer)?;
        let value = super::legacy::template(value).map_err(serde::de::Error::custom)?;
        TemplateWire::deserialize(value).map_err(serde::de::Error::custom)
    }
}
pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 100
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}
fn color(v: &str) -> bool {
    v.len() == 7 && v.starts_with('#') && v[1..].bytes().all(|c| c.is_ascii_hexdigit())
}
fn unique<'a>(ids: impl Iterator<Item = &'a str>) -> Result<HashSet<&'a str>> {
    let mut found = HashSet::new();
    for id in ids {
        ensure!(
            valid_id(id) && found.insert(id),
            "invalid or duplicate ID: {id}"
        );
    }
    Ok(found)
}
impl Template {
    pub fn asset_id(&self, slot_id: &str) -> Option<&str> {
        self.resource_bindings
            .iter()
            .find(|b| b.slot_id == slot_id && b.enabled)
            .map(|b| b.asset_id.as_str())
    }
    pub fn bind(&mut self, slot_id: &str, asset_id: &str) {
        self.resource_bindings.retain(|b| b.slot_id != slot_id);
        self.resource_bindings.push(ResourceBinding {
            slot_id: slot_id.into(),
            asset_id: asset_id.into(),
            enabled: true,
        });
    }
    pub fn validate(&self) -> Result<()> {
        ensure!(
            self.schema_version == "moirai.template.v2",
            "unsupported template schema"
        );
        ensure!(
            valid_id(&self.id) && !self.name.trim().is_empty(),
            "template ID/name required"
        );
        ensure!(
            (240..=4096).contains(&self.canvas.width)
                && (240..=4096).contains(&self.canvas.height)
                && (1..=120).contains(&self.canvas.fps),
            "invalid canvas"
        );
        ensure!(
            !self.elements.is_empty() && self.elements.len() <= 200 && !self.layouts.is_empty(),
            "template needs elements and layouts"
        );
        unique(self.elements.iter().map(|e| e.id.as_str()))?;
        self.composition.validate(self)?;
        let styles = unique(self.styles.iter().map(|s| s.id.as_str()))?;
        let resources = unique(self.resource_slots.iter().map(|s| s.id.as_str()))?;
        let layouts = unique(self.layouts.iter().map(|s| s.id.as_str()))?;
        unique(self.resource_bindings.iter().map(|b| b.slot_id.as_str()))?;
        for binding in &self.resource_bindings {
            ensure!(
                resources.contains(binding.slot_id.as_str()) && valid_id(&binding.asset_id),
                "invalid resource binding"
            );
        }
        unique(self.layout_entrances.iter().map(|e| e.layout_id.as_str()))?;
        for entrance in &self.layout_entrances {
            ensure!(
                layouts.contains(entrance.layout_id.as_str())
                    && (0.0..=2.0).contains(&entrance.duration_seconds),
                "invalid layout entrance"
            );
        }
        unique(self.transition_rules.iter().map(|r| r.id.as_str()))?;
        let mut pairs = HashSet::new();
        for transition in &self.transition_rules {
            ensure!(
                layouts.contains(transition.from_layout_id.as_str())
                    && layouts.contains(transition.to_layout_id.as_str())
                    && transition.from_layout_id != transition.to_layout_id
                    && pairs.insert((&transition.from_layout_id, &transition.to_layout_id))
                    && (0.0..=2.0).contains(&transition.duration_seconds),
                "invalid or duplicate transition relation"
            );
            ensure!(
                matches!(
                    transition.effect,
                    TransitionKind::Cut | TransitionKind::Dissolve
                ),
                "unsupported paired transition"
            );
            ensure!(
                matches!(transition.effect, TransitionKind::Cut)
                    || transition.duration_seconds >= 0.001,
                "dissolve requires a positive duration"
            );
        }
        for s in &self.styles {
            if let Some(opacity) = s.background_opacity {
                ensure!(
                    (0.0..=1.0).contains(&opacity),
                    "invalid text background opacity"
                );
            }
            if let Some(radius) = s.background_corner_radius {
                ensure!(
                    (0.0..=100.0).contains(&radius),
                    "invalid text background corner radius"
                );
            }
            if let Some(padding) = &s.background_padding {
                ensure!(
                    (0.0..=256.0).contains(&padding.x) && (0.0..=256.0).contains(&padding.y),
                    "invalid text background padding"
                );
            }
            if let Some(grid) = &s.grid {
                ensure!(
                    (4.0..=256.0).contains(&grid.spacing)
                        && (0.1..=8.0).contains(&grid.width)
                        && color(&grid.color),
                    "invalid grid pattern"
                );
            }
            ensure!(
                s.letter_spacing.is_finite() && (-100.0..=500.0).contains(&s.letter_spacing),
                "invalid letter spacing"
            );
            ensure!(
                (8.0..=500.0).contains(&s.font_size)
                    && (100..=900).contains(&s.weight)
                    && (0.0..=30.0).contains(&s.stroke_width)
                    && (0.8..=3.0).contains(&s.line_height)
                    && (1..=5).contains(&s.max_lines),
                "invalid style {}",
                s.id
            );
            ensure!(
                color(&s.fill)
                    && color(&s.stroke)
                    && s.background.as_ref().is_none_or(|c| color(c)),
                "invalid style color"
            );
            if let Some(shadow) = &s.shadow {
                ensure!(
                    color(&shadow.color)
                        && (0.0..=1.0).contains(&shadow.opacity)
                        && (0.0..=100.0).contains(&shadow.blur)
                        && shadow.x.is_finite()
                        && shadow.y.is_finite(),
                    "invalid shadow"
                );
            }
        }
        for e in &self.elements {
            if e.style_id
                .as_ref()
                .and_then(|id| self.styles.iter().find(|s| &s.id == id))
                .is_some_and(|s| s.grid.is_some())
            {
                ensure!(
                    e.features.representation == Representation::Rectangle,
                    "grid pattern requires rectangle"
                );
            }
            if self.composition.spatial_relations.iter().any(|r| {
                r.element_id == e.id
                    && r.reference_bounds == super::composition::SpatialBounds::TextBox
            }) {
                e.region.validate_extent()?;
            } else {
                e.region.validate()?;
            }
            ensure!(
                e.style_id
                    .as_ref()
                    .is_none_or(|s| styles.contains(s.as_str())),
                "unknown style in {}",
                e.id
            );
            ensure!(
                e.resource_id
                    .as_ref()
                    .is_none_or(|s| resources.contains(s.as_str())),
                "unknown resource in {}",
                e.id
            );
            if let Some(id) = &e.resource_id {
                let resource = self.resource_slots.iter().find(|r| &r.id == id).unwrap();
                ensure!(
                    resource.representation == e.features.representation
                        || (resource.representation == Representation::VisualMedia
                            && e.features.representation.is_visual_asset())
                        || (e.features.representation == Representation::VisualMedia
                            && resource.representation.is_visual_asset()),
                    "resource representation does not match element {}",
                    e.id
                );
            }
            ensure!(
                !(e.features.representation == Representation::Audio
                    || e.features.representation.is_visual_asset()
                        && e.features.media_use != Some(MediaUse::SourceVideo))
                    || e.resource_id.is_some(),
                "media element requires a resource slot"
            );
            ensure!(
                e.features.representation != Representation::Audio
                    || matches!(
                        e.features.media_use,
                        Some(MediaUse::SoundEffect | MediaUse::Music)
                    ),
                "audio usage required"
            );
            ensure!(
                !matches!(
                    e.features.media_use,
                    Some(MediaUse::SoundEffect | MediaUse::Music)
                ) || e.features.representation == Representation::Audio,
                "audio usage requires audio representation"
            );
            ensure!(
                e.features.representation != Representation::Text || e.style_id.is_some(),
                "text requires a style"
            );
            ensure!(
                e.features.representation != Representation::Audio || e.motions.is_empty(),
                "audio uses gain envelopes, not visual motion channels"
            );
            ensure!(
                !e.features.outline
                    || matches!(
                        e.features.representation,
                        Representation::Text
                            | Representation::Rectangle
                            | Representation::Ellipse
                            | Representation::Star
                            | Representation::Line
                    ),
                "outline requires text or a supported shape"
            );
            ensure!(
                e.min_display_seconds.is_none_or(valid_min_display_seconds),
                "minimum display duration must be between 0.1 and 3 seconds: {}",
                e.id
            );
            ensure!(
                e.timing.offset_seconds.is_finite()
                    && (0.0..=30.0).contains(&e.timing.min_seconds)
                    && e.timing.max_seconds >= e.timing.min_seconds
                    && e.timing.max_seconds <= 600.0,
                "invalid timing in {}",
                e.id
            );
            ensure!(
                e.binding != Binding::Literal
                    || e.literal.as_ref().is_some_and(|s| !s.trim().is_empty()),
                "literal content required"
            );
            super::ellipse_arc::validate_element(e, &self.styles)?;
            super::star_geometry::validate_element(e)?;
            super::rectangle_geometry::validate_element(e)?;
            for motion in &e.motions {
                if motion.property == MotionProperty::BackgroundOpacity {
                    ensure!(
                        e.features.representation == Representation::Text
                            && self
                                .styles
                                .iter()
                                .any(|s| Some(&s.id) == e.style_id.as_ref()
                                    && s.background.is_some()),
                        "background opacity motion requires text with an enabled background"
                    );
                    ensure!(
                        motion.keys.iter().all(|k| (0.0..=1.0).contains(&k.value)),
                        "background opacity motion values must be 0-1"
                    );
                }
                ensure!(
                    !matches!(motion.property, MotionProperty::Scale)
                        || !e.motions.iter().any(|m| matches!(
                            m.property,
                            MotionProperty::ScaleX | MotionProperty::ScaleY
                        )),
                    "uniform and axis scale channels conflict"
                );
                ensure!(
                    motion.keys.len() >= 2 && motion.keys.len() <= 100,
                    "motion needs at least two keys"
                );
                let mut previous = -1.0;
                for k in &motion.keys {
                    ensure!(
                        (0.0..=1.0).contains(&k.time) && k.time > previous && k.value.is_finite(),
                        "motion keys must be ordered normalized times"
                    );
                    previous = k.time;
                }
            }
            if let Some(timing) = &e.motion_timing {
                ensure!(
                    e.features.representation != Representation::Audio,
                    "motion timing requires a visual element"
                );
                super::motion_timing::validate(timing)?;
            }
        }
        for l in &self.layouts {
            l.video_region.validate()?;
            if let Some(secondary) = &l.secondary {
                secondary.region.validate()?;
                ensure!(
                    matches!(l.mode, LayoutMode::Split | LayoutMode::PictureInPicture),
                    "secondary view requires split or picture-in-picture layout"
                );
                ensure!(
                    self.resource_slots.iter().any(
                        |r| r.id == secondary.resource_id && r.representation.is_visual_asset()
                    ),
                    "secondary view requires a visual resource slot"
                );
                if matches!(l.mode, LayoutMode::Split) {
                    let a = &l.video_region;
                    let b = &secondary.region;
                    ensure!(
                        a.x + a.width <= b.x + 1e-9
                            || b.x + b.width <= a.x + 1e-9
                            || a.y + a.height <= b.y + 1e-9
                            || b.y + b.height <= a.y + 1e-9,
                        "split view regions must not overlap"
                    );
                }
            }
            l.caption_region.validate()?;
            for r in &l.safe_regions {
                r.validate()?;
            }
        }
        let r = &self.segmentation;
        ensure!(
            (0.05..=2.0).contains(&r.pause_boundary_seconds)
                && (0.5..=10.0).contains(&r.max_phrase_seconds)
                && (2..=60).contains(&r.max_characters)
                && valid_min_display_seconds(self.visual_rhythm.min_display_seconds)
                && (2.0..=30.0).contains(&r.max_characters_per_second)
                && (0.1..=10.0).contains(&self.audio_placement.effect_cooldown_seconds)
                && self.visual_rhythm.max_accents_per_cue <= 20
                && (-60.0..=0.0).contains(&self.mix.music_gain_db)
                && (-40.0..=0.0).contains(&self.mix.music_duck_db)
                && (-60.0..=0.0).contains(&self.mix.effect_gain_db)
                && (0.01..=1.0).contains(&self.mix.music_duck_attack_seconds)
                && (0.01..=3.0).contains(&self.mix.music_duck_release_seconds),
            "invalid rhythm rules"
        );
        Ok(())
    }
}
