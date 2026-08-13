use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum InterchangeTarget {
    FinalCutPro,
    JianyingDesktop,
    GenericNle,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum IssueSeverity {
    Info,
    Degraded,
    Omitted,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    InvalidProject,
    InvalidOptions,
    RevisionConflict,
    MissingMedia,
    UnsupportedTimeline,
    SerializationFailed,
}

#[derive(Debug, Error)]
#[error("{message}")]
pub struct InterchangeError {
    pub code: ErrorCode,
    pub message: String,
}

impl InterchangeError {
    pub(crate) fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSource {
    pub project_id: String,
    pub project_name: String,
    pub revision: u64,
    pub scene_id: String,
    pub scene_name: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterReport {
    pub format: String,
    pub version: String,
    pub target: InterchangeTarget,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterchangeIssue {
    pub code: String,
    pub severity: IssueSeverity,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub element_id: Option<String>,
}

impl InterchangeIssue {
    pub(crate) fn new(
        code: impl Into<String>,
        severity: IssueSeverity,
        message: impl Into<String>,
    ) -> Self {
        Self {
            code: code.into(),
            severity,
            message: message.into(),
            track_id: None,
            element_id: None,
        }
    }

    pub(crate) fn on_track(mut self, track_id: &str) -> Self {
        self.track_id = Some(track_id.to_owned());
        self
    }

    pub(crate) fn on_element(mut self, element_id: &str) -> Self {
        self.element_id = Some(element_id.to_owned());
        self
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelinkAsset {
    pub id: String,
    pub name: String,
    pub path: String,
    pub uri: String,
    pub exists: bool,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
pub struct RelinkReport {
    pub assets: Vec<RelinkAsset>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterchangeReport {
    pub schema: String,
    pub source: ExportSource,
    pub adapter: AdapterReport,
    pub issues: Vec<InterchangeIssue>,
    pub relink: RelinkReport,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InterchangeExport {
    pub document: String,
    pub report: InterchangeReport,
}
