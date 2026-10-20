use anyhow::{Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Semantic roles are independent of renderer primitives and can be extended by versioning the schema.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ElementKind {
    Title,
    Subtitle,
    Translation,
    Emphasis,
    Callout,
    SpeakerLabel,
    Chapter,
    ListItem,
    Metric,
    Icon,
    Sticker,
    Arrow,
    Underline,
    CircleAnnotation,
    Backplate,
    Frame,
    Particle,
    SubjectOutline,
    Spotlight,
    Broll,
    Video,
    Background,
    SoundEffect,
    BackgroundMusic,
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
    Translation,
    Speaker,
    Literal,
    SourceVideo,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Anchor {
    PhraseStart,
    KeywordStart,
    PhraseEnd,
    SectionStart,
    VideoStart,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum MotionProperty {
    Opacity,
    Scale,
    X,
    Y,
    Rotation,
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
    pub id: String,
    pub description: String,
    pub font_family: String,
    /// Font size in design-canvas pixels; not viewport units.
    pub font_size: f64,
    pub weight: u16,
    pub italic: bool,
    pub fill: String,
    pub stroke: String,
    pub stroke_width: f64,
    pub background: Option<String>,
    pub shadow: Option<Shadow>,
    pub line_height: f64,
    pub max_lines: u8,
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
pub struct Timing {
    pub anchor: Anchor,
    pub offset_seconds: f64,
    pub max_seconds: f64,
    pub min_seconds: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Element {
    pub id: String,
    pub kind: ElementKind,
    pub description: String,
    pub binding: Binding,
    pub literal: Option<String>,
    pub style_id: Option<String>,
    pub resource_id: Option<String>,
    pub region: Rect,
    pub z: i32,
    pub timing: Timing,
    pub motions: Vec<Motion>,
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
    pub transition: TransitionKind,
    pub transition_seconds: f64,
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
pub struct Resource {
    pub id: String,
    pub kind: ElementKind,
    pub description: String,
    /// Catalog identity, never an arbitrary filesystem path or remote executable URL.
    pub asset_id: Option<String>,
    pub tags: Vec<String>,
    pub status: EvidenceStatus,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RhythmRules {
    pub pause_boundary_seconds: f64,
    pub max_phrase_seconds: f64,
    pub max_characters: usize,
    pub min_display_seconds: f64,
    pub max_characters_per_second: f64,
    pub effect_cooldown_seconds: f64,
    pub max_accents_per_phrase: usize,
    pub music_gain_db: f64,
    pub music_duck_db: f64,
    #[serde(
        default = "default_effect_gain",
        skip_serializing_if = "is_default_effect_gain"
    )]
    pub effect_gain_db: f64,
    #[serde(
        default = "default_duck_attack",
        skip_serializing_if = "is_default_duck_attack"
    )]
    pub music_duck_attack_seconds: f64,
    #[serde(
        default = "default_duck_release",
        skip_serializing_if = "is_default_duck_release"
    )]
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
// Omitted defaults preserve existing template and application request hashes.
fn is_default_effect_gain(value: &f64) -> bool {
    *value == default_effect_gain()
}
fn is_default_duck_attack(value: &f64) -> bool {
    *value == default_duck_attack()
}
fn is_default_duck_release(value: &f64) -> bool {
    *value == default_duck_release()
}
impl Default for RhythmRules {
    fn default() -> Self {
        Self {
            pause_boundary_seconds: 0.32,
            max_phrase_seconds: 3.5,
            max_characters: 16,
            min_display_seconds: 0.65,
            max_characters_per_second: 10.0,
            effect_cooldown_seconds: 1.2,
            max_accents_per_phrase: 1,
            music_gain_db: -22.0,
            music_duck_db: -10.0,
            effect_gain_db: default_effect_gain(),
            music_duck_attack_seconds: default_duck_attack(),
            music_duck_release_seconds: default_duck_release(),
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
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Template {
    pub schema_version: String,
    pub id: String,
    pub revision: u64,
    pub name: String,
    pub description: String,
    pub tags: Vec<String>,
    pub canvas: Canvas,
    pub elements: Vec<Element>,
    pub styles: Vec<Style>,
    pub resources: Vec<Resource>,
    pub layouts: Vec<Layout>,
    pub rhythm: RhythmRules,
    pub evidence: Vec<Evidence>,
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
    pub fn validate(&self) -> Result<()> {
        ensure!(
            self.schema_version == "moirai.template.v1",
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
        let styles = unique(self.styles.iter().map(|s| s.id.as_str()))?;
        let resources = unique(self.resources.iter().map(|s| s.id.as_str()))?;
        unique(self.layouts.iter().map(|s| s.id.as_str()))?;
        for s in &self.styles {
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
            e.region.validate()?;
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
                let resource = self.resources.iter().find(|r| &r.id == id).unwrap();
                ensure!(
                    resource.kind == e.kind,
                    "resource kind does not match element {}",
                    e.id
                );
            }
            ensure!(
                !matches!(
                    e.kind,
                    ElementKind::SoundEffect | ElementKind::BackgroundMusic
                ) || e.resource_id.is_some(),
                "audio element requires a resource slot"
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
            for motion in &e.motions {
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
                    self.resources
                        .iter()
                        .any(|r| r.id == secondary.resource_id && r.kind == ElementKind::Broll),
                    "secondary view requires a broll resource slot"
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
            ensure!(
                (0.0..=2.0).contains(&l.transition_seconds),
                "invalid transition duration"
            );
        }
        for r in &self.resources {
            ensure!(
                r.asset_id.as_ref().is_none_or(|a| valid_id(a)),
                "invalid asset ID"
            );
        }
        let r = &self.rhythm;
        ensure!(
            (0.05..=2.0).contains(&r.pause_boundary_seconds)
                && (0.5..=10.0).contains(&r.max_phrase_seconds)
                && (2..=60).contains(&r.max_characters)
                && (0.1..=3.0).contains(&r.min_display_seconds)
                && (2.0..=30.0).contains(&r.max_characters_per_second)
                && (0.1..=10.0).contains(&r.effect_cooldown_seconds)
                && r.max_accents_per_phrase <= 3
                && (-60.0..=0.0).contains(&r.music_gain_db)
                && (-40.0..=0.0).contains(&r.music_duck_db)
                && (-60.0..=0.0).contains(&r.effect_gain_db)
                && (0.01..=1.0).contains(&r.music_duck_attack_seconds)
                && (0.01..=3.0).contains(&r.music_duck_release_seconds),
            "invalid rhythm rules"
        );
        Ok(())
    }
}
