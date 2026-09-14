use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::{SystemTime, UNIX_EPOCH};

pub const TICKS: i64 = 120_000;
fn default_push_in_end_percent() -> f64 { 110.0 }
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
    #[serde(default)]
    pub flip_horizontal: bool,
    #[serde(default)]
    pub flip_vertical: bool,
    #[serde(default)]
    pub push_in: bool,
    #[serde(default = "default_push_in_end_percent")]
    pub push_in_end_percent: f64,
    pub crop_mode: String,
    pub crop_x: f64,
    pub crop_y: f64,
    pub color_mode: String,
    pub brightness: f64,
    pub contrast: f64,
    pub saturation: f64,
    #[serde(default)]
    pub exposure: f64,
    #[serde(default)]
    pub temperature: f64,
    #[serde(default)]
    pub tint: f64,
    #[serde(default)]
    pub highlights: f64,
    #[serde(default)]
    pub shadows: f64,
    #[serde(default)]
    pub whites: f64,
    #[serde(default)]
    pub blacks: f64,
    #[serde(default)]
    pub vibrance: f64,
}
impl Default for Recipe {
    fn default() -> Self {
        Self {
            rotation: 0,
            flip_horizontal: false,
            flip_vertical: false,
            push_in: false,
            push_in_end_percent: default_push_in_end_percent(),
            crop_mode: "preserve".into(),
            crop_x: 0.5,
            crop_y: 0.5,
            color_mode: "adaptive".into(),
            brightness: 0.0,
            contrast: 1.0,
            saturation: 1.0,
            exposure: 0.0,
            temperature: 0.0,
            tint: 0.0,
            highlights: 0.0,
            shadows: 0.0,
            whites: 0.0,
            blacks: 0.0,
            vibrance: 0.0,
        }
    }
}
impl Recipe {
    pub fn push_in_end_scale(&self) -> f64 {
        if self.push_in { self.push_in_end_percent / 100.0 } else { 1.0 }
    }
    pub fn validate(&self) -> Result<()> {
        ensure!(self.push_in_end_percent.is_finite() && (100.0..=200.0).contains(&self.push_in_end_percent), "镜头拉近结束比例需在 100% 至 200% 之间");
        ensure!(self.exposure.is_finite() && (-2.0..=2.0).contains(&self.exposure), "曝光越界");
        for value in [self.temperature, self.tint, self.highlights, self.shadows, self.whites, self.blacks, self.vibrance] {
            ensure!(value.is_finite() && (-1.0..=1.0).contains(&value), "调色参数越界");
        }
        ensure!([0, 90, 180, 270].contains(&self.rotation), "旋转角度无效");
        ensure!(
            ["preserve", "vertical"].contains(&self.crop_mode.as_str()),
            "裁切模式无效"
        );
        ensure!(
            ["preserve", "auto", "adaptive", "manual"].contains(&self.color_mode.as_str()),
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
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields, default)]
pub struct ShotDetails {
    pub subject: String,
    pub action: String,
    pub scene: String,
    pub composition: String,
    pub camera: String,
    pub mood: String,
}
impl ShotDetails {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            [
                &self.subject,
                &self.action,
                &self.scene,
                &self.composition,
                &self.camera,
                &self.mood
            ]
            .iter()
            .all(|s| s.len() <= 4000),
            "细节描述过长"
        );
        Ok(())
    }
    pub fn merge(&mut self, other: Self) {
        for (current, next) in [
            (&mut self.subject, other.subject),
            (&mut self.action, other.action),
            (&mut self.scene, other.scene),
            (&mut self.composition, other.composition),
            (&mut self.camera, other.camera),
            (&mut self.mood, other.mood),
        ] {
            if !next.is_empty() && *current != next {
                if !current.is_empty() {
                    current.push('\n');
                }
                current.push_str(&next);
                while current.len() > 4000 {
                    current.pop();
                }
            }
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shot {
    #[serde(default)]
    pub tag_evidence: Vec<crate::tag_evidence::TagEvidence>,
    #[serde(default)]
    pub analyzed_tags: Vec<String>,
    #[serde(default)]
    pub labels_need_review: bool,
    #[serde(default)]
    pub product_recognition_status: String,
    #[serde(default)]
    pub keep_original_audio: bool,
    #[serde(default)]
    pub is_featured: bool,
    #[serde(default)]
    pub details: ShotDetails,
    #[serde(default)]
    pub has_holiday: bool,
    #[serde(default)]
    pub holiday_tags: Vec<String>,
    #[serde(default)]
    pub product_tags: Vec<String>,
    #[serde(default)]
    pub product_matches: Vec<crate::products::ProductMatch>,
    #[serde(default)]
    pub direct_upload: bool,
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

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShotEdit {
    #[serde(default)]
    pub keep_original_audio: Option<bool>,
    #[serde(default)]
    pub is_featured: Option<bool>,
    #[serde(default)]
    pub details: Option<ShotDetails>,
    #[serde(default)]
    pub has_holiday: Option<bool>,
    #[serde(default)]
    pub holiday_tags: Option<Vec<String>>,
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
        ensure!(shot.status != "deleted", "片段已删除");
        ensure!(shot.revision == self.base_revision, "revision_conflict");
        ensure!(
            !["rendering", "publishing", "tagging", "recognizing"].contains(&shot.status.as_str()),
            "片段正在处理"
        );
        validate_range(self.start_ticks, self.end_ticks, source.duration_ticks)?;
        self.recipe.validate()?;
        if shot.direct_upload {
            ensure!(
                self.start_ticks == 0
                    && self.end_ticks == source.duration_ticks
                    && self.recipe == shot.recipe,
                "直接上传的分镜只允许修改标签信息"
            );
        }
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
        if let Some(details) = &self.details {
            details.validate()?;
        }
        if let Some(tags) = &self.holiday_tags {
            ensure!(
                tags.len() <= 30
                    && tags.iter().all(|tag| !tag.trim().is_empty()
                        && tag.chars().count() <= 40
                        && !tag.chars().any(char::is_control)),
                "节日标签过多或过长"
            );
        }
        let range_changed = shot.start_ticks != self.start_ticks || shot.end_ticks != self.end_ticks;
        let changed = range_changed || shot.recipe != self.recipe;
        if range_changed {
            shot.labels_need_review = true;
        }
        shot.name = self.name.trim().into();
        shot.start_ticks = self.start_ticks;
        shot.end_ticks = self.end_ticks;
        shot.description = self.description;
        if let Some(value) = self.keep_original_audio {
            shot.keep_original_audio = value;
        }
        if let Some(value) = self.is_featured {
            shot.is_featured = value;
        }
        if let Some(value) = self.details {
            shot.details = value;
        }
        if let Some(value) = self.has_holiday {
            shot.has_holiday = value;
        }
        if let Some(value) = self.holiday_tags {
            let mut seen = std::collections::HashSet::new();
            shot.holiday_tags = value
                .into_iter()
                .map(|tag| tag.trim().to_string())
                .filter(|tag| seen.insert(tag.to_lowercase()))
                .collect();
        }
        if !shot.has_holiday {
            shot.holiday_tags.clear();
        }
        shot.tags = self.tags;
        shot.product_tags.retain(|t| shot.tags.contains(t));
        shot.product_matches
            .retain(|m| shot.tags.contains(&m.alias));
        shot.roles = self.roles;
        shot.unsupported_claims = self.unsupported_claims;
        shot.recipe = self.recipe;
        if changed && !shot.direct_upload && shot.recipe.color_mode == "auto" {
            shot.recipe.color_mode = "adaptive".into();
        }
        if changed {
            shot.output_path = None;
            shot.output_sha256 = None;
            shot.quality_issues.clear();
        }
        shot.status = if shot.direct_upload {
            "tag_review"
        } else if shot.output_path.is_some() {
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
    fn old_recipes_default_to_no_mirroring_and_mirror_flags_round_trip() {
        let mut old = serde_json::to_value(Recipe::default()).unwrap();
        old.as_object_mut().unwrap().remove("flipHorizontal");
        old.as_object_mut().unwrap().remove("flipVertical");
        old.as_object_mut().unwrap().remove("pushIn");
        old.as_object_mut().unwrap().remove("pushInEndPercent");
        let mut recipe: Recipe = serde_json::from_value(old).unwrap();
        assert!(!recipe.flip_horizontal && !recipe.flip_vertical);
        assert!(!recipe.push_in);
        assert_eq!(recipe.push_in_end_percent, 110.0);
        recipe.push_in = true;
        recipe.push_in_end_percent = 125.0;
        recipe.flip_horizontal = true;
        recipe.flip_vertical = true;
        recipe.rotation = 90;
        recipe.validate().unwrap();
        let restored: Recipe = serde_json::from_value(serde_json::to_value(&recipe).unwrap()).unwrap();
        assert_eq!(recipe, restored);
        assert_eq!(restored.push_in_end_scale(), 1.25);
        for invalid in [99.0, 201.0, f64::NAN, f64::INFINITY] {
            recipe.push_in_end_percent = invalid;
            assert!(recipe.validate().is_err());
        }
    }

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
