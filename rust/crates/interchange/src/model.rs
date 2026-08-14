use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectDocument {
    pub metadata: ProjectMetadata,
    #[serde(default)]
    pub revision: u64,
    pub current_scene_id: String,
    pub settings: ProjectSettings,
    #[serde(default)]
    pub scenes: Vec<Scene>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectMetadata {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectSettings {
    pub fps: FrameRate,
    pub canvas_size: CanvasSize,
}

#[derive(Clone, Copy, Debug, Deserialize)]
pub(crate) struct FrameRate {
    pub numerator: u32,
    pub denominator: u32,
}

#[derive(Clone, Copy, Debug, Deserialize)]
pub(crate) struct CanvasSize {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Scene {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub is_main: bool,
    pub tracks: SceneTracks,
    #[serde(default)]
    pub bookmarks: Vec<Bookmark>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct SceneTracks {
    pub main: Track,
    #[serde(default)]
    pub overlay: Vec<Track>,
    #[serde(default)]
    pub audio: Vec<Track>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct Track {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub hidden: bool,
    #[serde(default)]
    pub muted: bool,
    #[serde(default)]
    pub solo: bool,
    #[serde(default)]
    pub elements: Vec<TimelineElement>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TimelineElement {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub group_id: Option<String>,
    #[serde(default)]
    pub link_group_id: Option<String>,
    #[serde(default)]
    pub media_id: Option<String>,
    #[serde(default)]
    pub source_type: Option<String>,
    #[serde(default)]
    pub source_url: Option<String>,
    pub start_time: i64,
    pub duration: i64,
    #[serde(default)]
    pub trim_start: i64,
    #[serde(default)]
    pub trim_end: i64,
    #[serde(default)]
    pub source_duration: Option<i64>,
    #[serde(default)]
    pub is_source_audio_enabled: Option<bool>,
    #[serde(default)]
    pub hidden: bool,
    #[serde(default)]
    pub transition_in: Option<Value>,
    #[serde(default)]
    pub compound: Option<Value>,
    #[serde(default)]
    pub retime: Option<Value>,
    #[serde(default)]
    pub animations: Option<Value>,
    #[serde(default)]
    pub effects: Vec<Value>,
    #[serde(default)]
    pub masks: Vec<Value>,
    #[serde(default)]
    pub motion_tracking: Option<Value>,
    #[serde(default)]
    pub stabilization: Option<Value>,
    #[serde(default)]
    pub params: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Bookmark {
    pub id: String,
    pub time: i64,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub duration: Option<i64>,
    #[serde(default)]
    pub scope: Option<String>,
    #[serde(default)]
    pub track_id: Option<String>,
    #[serde(default)]
    pub element_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MediaAsset {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub ext: String,
    #[serde(default)]
    pub duration: Option<f64>,
    #[serde(default)]
    pub has_audio: bool,
}

impl TimelineElement {
    pub(crate) fn end(&self) -> Option<i64> {
        self.start_time.checked_add(self.duration)
    }

    pub(crate) fn has_nonempty_value(value: &Option<Value>) -> bool {
        match value {
            None | Some(Value::Null) => false,
            Some(Value::Array(values)) => !values.is_empty(),
            Some(Value::Object(values)) => !values.is_empty(),
            Some(_) => true,
        }
    }

    pub(crate) fn source_audio_enabled(&self) -> bool {
        self.is_source_audio_enabled != Some(false)
    }

    pub(crate) fn audio_muted(&self) -> bool {
        self.params.get("muted").and_then(Value::as_bool) == Some(true)
    }
}
