use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::{SystemTime, UNIX_EPOCH};

pub const TICKS: i64 = 120_000;
pub const ROLES: &[&str] = &[
    "hook",
    "pain_point",
    "product_demo",
    "selling_point",
    "proof",
    "comparison",
    "result",
    "usage_scene",
    "cta",
    "transition",
];

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
pub fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub id: String,
    pub name: String,
    pub product: String,
    pub batch: String,
    pub sha256: String,
    pub path: String,
    pub duration_ticks: i64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub color_transfer: String,
    pub rotation: i32,
    pub status: String,
    #[serde(default)]
    pub nas_relative_path: Option<String>,
    pub error: Option<String>,
    pub created_at: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Recipe {
    pub rotation: u16,
    pub crop_mode: String,
    pub crop_x: f64,
    pub crop_y: f64,
    pub color_mode: String,
    pub brightness: f64,
    pub contrast: f64,
    pub saturation: f64,
}
impl Default for Recipe {
    fn default() -> Self {
        Self {
            rotation: 0,
            crop_mode: "preserve".into(),
            crop_x: 0.5,
            crop_y: 0.5,
            color_mode: "auto".into(),
            brightness: 0.0,
            contrast: 1.0,
            saturation: 1.0,
        }
    }
}
impl Recipe {
    pub fn validate(&self) -> Result<()> {
        ensure!([0, 90, 180, 270].contains(&self.rotation), "旋转角度无效");
        ensure!(
            ["preserve", "vertical"].contains(&self.crop_mode.as_str()),
            "裁切模式无效"
        );
        ensure!(
            ["preserve", "auto", "manual"].contains(&self.color_mode.as_str()),
            "调色模式无效"
        );
        for v in [self.crop_x, self.crop_y] {
            ensure!(v.is_finite() && (0.0..=1.0).contains(&v), "裁切位置越界");
        }
        ensure!(
            self.brightness.is_finite() && (-0.12..=0.12).contains(&self.brightness),
            "亮度超出保守调色范围"
        );
        ensure!(
            self.contrast.is_finite() && (0.85..=1.15).contains(&self.contrast),
            "对比度越界"
        );
        ensure!(
            self.saturation.is_finite() && (0.85..=1.15).contains(&self.saturation),
            "饱和度越界"
        );
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Role {
    pub role: String,
    pub reason: String,
    pub confidence: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shot {
    pub id: String,
    pub source_id: String,
    pub revision: u64,
    pub name: String,
    pub start_ticks: i64,
    pub end_ticks: i64,
    pub description: String,
    pub tags: Vec<String>,
    pub roles: Vec<Role>,
    pub unsupported_claims: Vec<String>,
    pub evidence: String,
    pub recipe: Recipe,
    pub status: String,
    pub error: Option<String>,
    pub quality_issues: Vec<String>,
    pub output_path: Option<String>,
    pub output_sha256: Option<String>,
    pub published_path: Option<String>,
    pub analysis_run_id: String,
    pub model_id: String,
    pub input_mode: String,
    pub created_at: u64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShotEdit {
    pub base_revision: u64,
    pub name: String,
    pub start_ticks: i64,
    pub end_ticks: i64,
    pub description: String,
    pub tags: Vec<String>,
    pub roles: Vec<Role>,
    pub unsupported_claims: Vec<String>,
    pub recipe: Recipe,
}
impl ShotEdit {
    pub fn apply(self, shot: &mut Shot, source: &Source) -> Result<()> {
        ensure!(shot.revision == self.base_revision, "revision_conflict");
        ensure!(
            !["rendering", "publishing"].contains(&shot.status.as_str()),
            "片段正在处理"
        );
        validate_range(self.start_ticks, self.end_ticks, source.duration_ticks)?;
        self.recipe.validate()?;
        ensure!(
            !self.name.trim().is_empty()
                && self.name.len() <= 512
                && self.description.len() <= 16000,
            "名称或描述长度无效"
        );
        ensure!(
            self.tags.len() <= 40 && self.tags.iter().all(|s| s.len() <= 300),
            "标签过多或过长"
        );
        ensure!(
            self.unsupported_claims.len() <= 40
                && self.unsupported_claims.iter().all(|s| s.len() <= 1000),
            "限制内容过长"
        );
        validate_roles(&self.roles)?;
        let changed = shot.start_ticks != self.start_ticks
            || shot.end_ticks != self.end_ticks
            || shot.recipe != self.recipe;
        shot.name = self.name.trim().into();
        shot.start_ticks = self.start_ticks;
        shot.end_ticks = self.end_ticks;
        shot.description = self.description;
        shot.tags = self.tags;
        shot.roles = self.roles;
        shot.unsupported_claims = self.unsupported_claims;
        shot.recipe = self.recipe;
        if changed {
            shot.output_path = None;
            shot.output_sha256 = None;
            shot.quality_issues.clear();
        }
        shot.status = if shot.output_path.is_some() {
            "review"
        } else {
            "draft"
        }
        .into();
        shot.published_path = None;
        shot.error = None;
        shot.revision += 1;
        Ok(())
    }
}
pub fn validate_range(start: i64, end: i64, duration: i64) -> Result<()> {
    ensure!(
        start >= 0 && end > start && end <= duration && end - start >= TICKS / 5,
        "片段时间必须位于原片内，且至少 0.2 秒"
    );
    Ok(())
}
pub fn validate_roles(roles: &[Role]) -> Result<()> {
    ensure!(roles.len() <= ROLES.len(), "用途标签过多");
    for role in roles {
        ensure!(
            ROLES.contains(&role.role.as_str())
                && role.confidence.is_finite()
                && (0.0..=1.0).contains(&role.confidence)
                && role.reason.len() <= 2000,
            "用途标签无效"
        );
    }
    Ok(())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub kind: String,
    pub target_id: String,
    pub revision: u64,
    pub status: String,
    pub attempt: u32,
    pub error: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}
impl Job {
    pub fn new(kind: &str, target_id: &str, revision: u64) -> Self {
        Self {
            id: id(),
            kind: kind.into(),
            target_id: target_id.into(),
            revision,
            status: "queued".into(),
            attempt: 0,
            error: None,
            created_at: now(),
            updated_at: now(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Review {
    pub id: String,
    pub shot_id: String,
    pub revision: u64,
    pub action: String,
    pub created_at: u64,
    pub snapshot: Value,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_outside_range_and_non_finite_recipe() {
        assert!(validate_range(0, 3 * TICKS, 2 * TICKS).is_err());
        assert!(validate_range(-1, TICKS, 2 * TICKS).is_err());
        assert!(validate_range(0, 1, TICKS).is_err());
        let recipe = Recipe {
            crop_x: f64::NAN,
            ..Default::default()
        };
        assert!(recipe.validate().is_err());
    }
}
