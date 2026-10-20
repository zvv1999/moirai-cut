//! Renderer-supplied text facts, bound to an immutable compiled fixture and file.
//! Producer labels are declarations, not authentication or proof of measurement.
use anyhow::{Context, Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TextMeasurements {
    pub version: u32,
    /// Absent legacy records retain only the first pose while layouts stay equal.
    /// This marker declares that layout, box, leaf pose and ancestor poses are
    /// constant throughout each record's consecutive exported-frame interval.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub geometry_coverage: Option<GeometryCoverage>,
    pub status: String,
    pub producer: String,
    pub timebase: u32,
    pub frames_observed: u64,
    pub dropped_records: u64,
    pub records: Vec<Record>,
    pub output_sha256: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
pub enum GeometryCoverage {
    #[serde(rename = "constant_record_pose_v1")]
    ConstantRecordPoseV1,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Record {
    pub layout: Layout,
    pub source: Source,
    pub scene_time: f64,
    pub local_time: f64,
    pub last_scene_time: f64,
    pub last_local_time: f64,
    pub sample_count: u64,
    pub text_box: Rect,
    pub transform: Transform,
    pub groups: Vec<Group>,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Layout {
    pub font_size_px: f64,
    pub font_string: String,
    pub lines: Vec<String>,
    pub line_count: u64,
    pub width_px: f64,
    pub height_px: f64,
    pub limits: Limits,
    pub overflow: Overflow,
    pub font_identity_verified: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secondary: Option<Secondary>,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Secondary {
    pub font_size_px: f64,
    pub font_string: String,
    pub lines: Vec<String>,
    pub line_count: u64,
    pub width_px: f64,
    pub height_px: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Limits {
    pub max_width_px: f64,
    pub max_height_px: f64,
    pub max_lines: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Overflow {
    pub width: bool,
    pub height: bool,
    pub lines: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Source {
    pub element_id: String,
    pub track_id: String,
    pub group_path: Vec<String>,
    pub scene_time_offset: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub template_element_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub template_instance_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layout_attachment: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_layout_box: Option<Rect>,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Rect {
    pub left: f64,
    pub top: f64,
    pub width: f64,
    pub height: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Transform {
    pub position: Point,
    pub scale_x: f64,
    pub scale_y: f64,
    pub rotate: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub basis: Option<[f64; 4]>,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Group {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<Source>,
    pub transform: Transform,
    pub child_time_offset: f64,
}
#[derive(Clone)]
struct Ancestor {
    source: Source,
    offset: f64,
}
struct Target<'a> {
    source: Source,
    element: &'a Value,
    groups: Vec<Ancestor>,
    start: f64,
    end: f64,
}
fn finite(value: f64) -> bool {
    value.is_finite() && value.abs() <= 1e12
}
fn metric(value: f64) -> bool {
    value.is_finite() && (0.0..=1e7).contains(&value)
}
fn close(a: f64, b: f64) -> bool {
    (a - b).abs() <= 1e-6
}
fn number(value: &Value) -> Result<f64> {
    let n = value
        .as_f64()
        .context("text measurement compiled number missing")?;
    ensure!(finite(n), "invalid compiled measurement number");
    Ok(n)
}
fn string(value: &Value) -> Result<String> {
    let s = value
        .as_str()
        .context("text measurement compiled identity missing")?;
    ensure!(
        !s.is_empty() && s.len() <= 2048,
        "invalid compiled measurement identity"
    );
    Ok(s.into())
}
fn rect(value: &Rect) -> Result<()> {
    ensure!(
        finite(value.left) && finite(value.top) && metric(value.width) && metric(value.height),
        "invalid text measurement box"
    );
    Ok(())
}
fn transform(value: &Transform) -> Result<()> {
    ensure!(
        [
            value.position.x,
            value.position.y,
            value.scale_x,
            value.scale_y,
            value.rotate
        ]
        .into_iter()
        .all(finite)
            && value.basis.is_none_or(|v| v.into_iter().all(finite)),
        "invalid text measurement transform"
    );
    Ok(())
}
fn block(
    font: f64,
    declaration: &str,
    lines: &[String],
    count: u64,
    width: f64,
    height: f64,
) -> Result<()> {
    ensure!(
        metric(font) && font > 0. && metric(width) && metric(height),
        "invalid text measurement metrics"
    );
    ensure!(
        !declaration.trim().is_empty()
            && declaration.len() <= 16384
            && lines.len() <= 2048
            && count == lines.len() as u64,
        "invalid text measurement font declaration or line count"
    );
    Ok(())
}
fn targets<'a>(
    tracks: Vec<&'a Value>,
    offset: f64,
    groups: Vec<Ancestor>,
    start: f64,
    end: f64,
    out: &mut Vec<Target<'a>>,
) -> Result<()> {
    ensure!(
        groups.len() <= 32,
        "text measurement group nesting exceeds limit"
    );
    for track in tracks {
        if track["hidden"] == true {
            continue;
        }
        for element in track["elements"].as_array().into_iter().flatten() {
            if element["hidden"] == true {
                continue;
            }
            let group = element.get("renderGroup").filter(|v| v.is_object());
            if element["type"] != "text" && group.is_none() {
                continue;
            }
            let params = &element["params"];
            let own_start = number(&element["startTime"])?;
            let duration = number(&element["duration"])?;
            let mut source = Source {
                element_id: string(&element["id"])?,
                track_id: string(&track["id"])?,
                group_path: groups.iter().map(|g| g.source.element_id.clone()).collect(),
                scene_time_offset: offset,
                template_element_id: params["template.elementId"].as_str().map(str::to_owned),
                template_instance_id: params["template.instanceId"].as_str().map(str::to_owned),
                layout_attachment: None,
                text_layout_box: None,
            };
            if params["template.attachedTo"]
                .as_str()
                .is_some_and(|v| !v.is_empty())
                && element.get("textAttachment").is_none_or(Value::is_null)
            {
                source.layout_attachment = Some(true);
            }
            if element["type"] == "text" {
                let values = ["Left", "Top", "Width", "Height"]
                    .map(|k| params[format!("template.textLayout{k}")].as_f64());
                if let [Some(left), Some(top), Some(width), Some(height)] = values {
                    if [left, top, width, height].into_iter().all(f64::is_finite)
                        && width > 0.
                        && height > 0.
                    {
                        source.text_layout_box = Some(Rect {
                            left,
                            top,
                            width,
                            height,
                        });
                    }
                }
            }
            let active_start = start.max(offset + own_start);
            let active_end = end.min(offset + own_start + duration);
            if let Some(group) = group {
                let child_offset = own_start
                    - number(&group["timeOrigin"])?
                    - element["trimStart"].as_f64().unwrap_or(0.);
                let mut ancestry = groups.clone();
                ancestry.push(Ancestor {
                    source,
                    offset: child_offset,
                });
                targets(
                    group["tracks"]
                        .as_array()
                        .context("compiled group tracks missing")?
                        .iter()
                        .collect(),
                    offset + child_offset,
                    ancestry,
                    active_start,
                    active_end,
                    out,
                )?;
            } else {
                ensure!(out.len() < 10000, "text measurement target budget exceeded");
                out.push(Target {
                    source,
                    element,
                    groups: groups.clone(),
                    start: active_start,
                    end: active_end,
                });
            }
        }
    }
    Ok(())
}
/// Exact visible text identities and ancestor-clipped intervals from the frozen scene.
pub(crate) fn reading_targets(fixture: &Value) -> Result<Value> {
    let doc = &fixture["compilation"]["document"];
    let scene = doc["scenes"]
        .as_array()
        .context("compiled scenes missing")?
        .iter()
        .find(|s| s["id"] == fixture["request"]["sceneId"])
        .context("compiled scene missing")?;
    let tracks = &scene["tracks"];
    let mut all = vec![&tracks["main"]];
    all.extend(tracks["overlay"].as_array().into_iter().flatten());
    let mut available = vec![];
    targets(
        all,
        0.,
        vec![],
        0.,
        number(&doc["metadata"]["duration"])?,
        &mut available,
    )?;
    Ok(json!(available.iter().map(|t| json!({"source":t.source,"content":t.element["params"]["content"],"startSeconds":t.start / crate::domain::TICKS as f64,"endSeconds":t.end / crate::domain::TICKS as f64})).collect::<Vec<_>>()))
}
fn source_matches(actual: &Source, expected: &Source) -> bool {
    actual.element_id == expected.element_id
        && actual.track_id == expected.track_id
        && actual.group_path == expected.group_path
        && close(actual.scene_time_offset, expected.scene_time_offset)
        && actual.template_element_id == expected.template_element_id
        && actual.template_instance_id == expected.template_instance_id
        && actual.layout_attachment == expected.layout_attachment
        && match (&actual.text_layout_box, &expected.text_layout_box) {
            (None, None) => true,
            (Some(a), Some(b)) => {
                close(a.left, b.left)
                    && close(a.top, b.top)
                    && close(a.width, b.width)
                    && close(a.height, b.height)
            }
            _ => false,
        }
}
impl TextMeasurements {
    pub fn has_constant_record_pose(&self) -> bool {
        self.geometry_coverage == Some(GeometryCoverage::ConstantRecordPoseV1)
    }
    pub fn validate(&self, fixture: &Value) -> Result<()> {
        ensure!(
            fixture["textMeasurementContractVersion"] == 1,
            "fixture predates text measurement identity contract; export remains not_measured"
        );
        if let Some(required) = fixture.get("textMeasurementGeometryCoverage") {
            ensure!(
                required == "constant_record_pose_v1" && self.has_constant_record_pose(),
                "fixture requires constant_record_pose_v1 geometry coverage; legacy measurements cannot certify this export"
            );
        }
        ensure!(
            self.version == 1
                && self.status == "sampled"
                && self.producer == "production-scene-exporter"
                && self.timebase == crate::domain::TICKS as u32,
            "unsupported text measurement envelope"
        );
        ensure!(
            self.output_sha256.len() == 64
                && self
                    .output_sha256
                    .bytes()
                    .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)),
            "invalid text measurement output SHA-256"
        );
        ensure!(
            self.records.len() <= 2048
                && self.frames_observed > 0
                && self.frames_observed <= 2_000_000
                && self.dropped_records <= 20_000_000_000,
            "text measurement budget exceeded"
        );
        // The browser caps retained constant-pose records at 524288 characters;
        // reserve bounded space for the three aggregation fields and JSON floats.
        ensure!(
            serde_json::to_string(self)?.encode_utf16().count() <= 786432,
            "text measurement payload exceeds limit"
        );
        let doc = &fixture["compilation"]["document"];
        let duration = number(&doc["metadata"]["duration"])?;
        let scene = doc["scenes"]
            .as_array()
            .context("compiled scenes missing")?
            .iter()
            .find(|s| s["id"] == fixture["request"]["sceneId"])
            .context("text measurement scene missing")?;
        let fps = &doc["settings"]["fps"];
        let numerator = number(&fps["numerator"])?;
        let denominator = number(&fps["denominator"])?;
        ensure!(
            numerator > 0. && denominator > 0.,
            "invalid measurement frame rate"
        );
        let step = (crate::domain::TICKS as f64 * denominator / numerator).round();
        ensure!(step >= 1. && duration > 0., "invalid measurement duration");
        let frames = (duration / step).floor() as u64;
        ensure!(
            self.frames_observed == frames,
            "text measurement frame count mismatch"
        );
        let tracks = &scene["tracks"];
        let mut all = vec![&tracks["main"]];
        all.extend(tracks["overlay"].as_array().into_iter().flatten());
        let mut available = vec![];
        targets(all, 0., vec![], 0., duration, &mut available)?;
        let mut intervals: BTreeMap<String, Vec<(f64, f64)>> = BTreeMap::new();
        for record in &self.records {
            let target = available
                .iter()
                .find(|t| source_matches(&record.source, &t.source))
                .context("text measurement source does not match compiled fixture")?;
            ensure!(
                serde_json::to_string(&record.layout)?
                    .encode_utf16()
                    .count()
                    <= 32768
                    && serde_json::to_string(&record.source)?
                        .encode_utf16()
                        .count()
                        <= 4096
                    && record.groups.len() <= 32,
                "text measurement record exceeds limit"
            );
            let layout = &record.layout;
            block(
                layout.font_size_px,
                &layout.font_string,
                &layout.lines,
                layout.line_count,
                layout.width_px,
                layout.height_px,
            )?;
            ensure!(
                !layout.font_identity_verified,
                "text measurement cannot verify actual font identity"
            );
            if let Some(s) = &layout.secondary {
                block(
                    s.font_size_px,
                    &s.font_string,
                    &s.lines,
                    s.line_count,
                    s.width_px,
                    s.height_px,
                )?;
            }
            let limits = &layout.limits;
            ensure!(
                [limits.max_width_px, limits.max_height_px, limits.max_lines]
                    .into_iter()
                    .all(metric),
                "invalid text measurement limits"
            );
            let limit = |key: &str| {
                target.element["params"][key]
                    .as_f64()
                    .filter(|v| v.is_finite() && *v > 0.)
                    .unwrap_or(0.)
            };
            ensure!(
                close(limits.max_width_px, limit("text.maxWidth"))
                    && close(limits.max_height_px, limit("text.maxHeight"))
                    && close(limits.max_lines, limit("text.maxLines")),
                "text measurement limits differ from compiled layer"
            );
            ensure!(
                layout.overflow.width
                    == (limits.max_width_px > 0. && layout.width_px > limits.max_width_px + 0.01)
                    && layout.overflow.height
                        == (limits.max_height_px > 0.
                            && layout.height_px > limits.max_height_px + 0.01)
                    && layout.overflow.lines
                        == (limits.max_lines > 0. && layout.line_count as f64 > limits.max_lines),
                "text measurement overflow flags disagree with metrics"
            );
            rect(&record.text_box)?;
            transform(&record.transform)?;
            ensure!(
                record.groups.len() == target.groups.len(),
                "text measurement ancestor count mismatch"
            );
            for (a, b) in record.groups.iter().zip(&target.groups) {
                ensure!(
                    a.source
                        .as_ref()
                        .is_some_and(|s| source_matches(s, &b.source))
                        && close(a.child_time_offset, b.offset),
                    "text measurement ancestor identity or time mismatch"
                );
                transform(&a.transform)?;
            }
            ensure!(
                [
                    record.scene_time,
                    record.local_time,
                    record.last_scene_time,
                    record.last_local_time
                ]
                .into_iter()
                .all(finite),
                "invalid text measurement times"
            );
            ensure!(
                record.scene_time >= target.start
                    && record.last_scene_time >= record.scene_time
                    && record.last_scene_time < target.end
                    && record.last_scene_time < self.frames_observed as f64 * step,
                "text measurement outside active layer interval"
            );
            ensure!(
                close(record.scene_time / step, (record.scene_time / step).round())
                    && close(
                        record.last_scene_time / step,
                        (record.last_scene_time / step).round()
                    ),
                "text measurement time is not an exported frame"
            );
            let local_start =
                target.source.scene_time_offset + number(&target.element["startTime"])?;
            ensure!(
                close(record.local_time, record.scene_time - local_start)
                    && close(record.last_local_time, record.last_scene_time - local_start),
                "text measurement local clock mismatch"
            );
            let count = ((record.last_scene_time - record.scene_time) / step).round() as u64 + 1;
            ensure!(
                record.sample_count == count && count <= self.frames_observed,
                "text measurement sample count mismatch"
            );
            let key = serde_json::to_string(&record.source)?;
            let seen = intervals.entry(key).or_default();
            ensure!(
                seen.iter()
                    .all(|&(a, b)| record.last_scene_time < a || record.scene_time > b),
                "duplicate text measurement interval"
            );
            seen.push((record.scene_time, record.last_scene_time));
        }
        Ok(())
    }
}

pub fn not_measured() -> Value {
    json!({"status":"not_measured"})
}
/// Add explicit legacy state without changing stored rows, revisions or hashes.
pub fn annotate_legacy(entry: &mut Value) {
    if let Some(previews) = entry["previews"].as_array_mut() {
        for p in previews {
            if p.get("textMeasurements").is_none_or(Value::is_null) {
                p["textMeasurements"] = not_measured();
            }
        }
    }
    if let Some(renders) = entry["renders"].as_object_mut() {
        for (_, r) in renders {
            if r.get("textMeasurements").is_none_or(Value::is_null) {
                r["textMeasurements"] = not_measured();
            }
        }
    }
}
pub fn published(render: &Value, fixture: &Value, digest: &str) -> Result<Value> {
    let Some(raw) = render
        .get("textMeasurements")
        .filter(|v| !v.is_null() && v["status"] != "not_measured")
    else {
        return Ok(not_measured());
    };
    ensure!(
        render["status"] == "completed"
            && render["fixture"] == fixture["index"]
            && render["requestFingerprint"] == fixture["requestFingerprint"],
        "text measurement render identity mismatch"
    );
    let evidence: TextMeasurements =
        serde_json::from_value(raw.clone()).context("invalid saved text measurements")?;
    evidence.validate(fixture)?;
    ensure!(
        evidence.output_sha256 == digest,
        "text measurement output SHA-256 differs from published file"
    );
    Ok(serde_json::to_value(evidence)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn pose() -> Value {
        json!({"position":{"x":0,"y":0},"scaleX":1,"scaleY":1,"rotate":0})
    }
    fn fixture() -> Value {
        let text = json!({"id":"text","type":"text","startTime":12000,"duration":120000,"params":{"template.elementId":"caption","template.instanceId":"caption-0","text.maxWidth":200,"text.maxHeight":100,"text.maxLines":2,"template.textLayoutLeft":-100,"template.textLayoutTop":-50,"template.textLayoutWidth":200,"template.textLayoutHeight":100}});
        let group = json!({"id":"group","type":"graphic","startTime":24000,"duration":120000,"trimStart":0,"params":{},"renderGroup":{"timeOrigin":0,"tracks":[{"id":"text-track","elements":[text]}]}});
        let document = json!({"metadata":{"duration":240000},"settings":{"fps":{"numerator":30,"denominator":1}},"scenes":[{"id":"scene","tracks":{"main":{"id":"main","elements":[]},"overlay":[{"id":"outer-track","elements":[group]}]}}]});
        json!({"index":0,"requestFingerprint":"frozen-fixture","request":{"sceneId":"scene"},"compilation":{"document":document},"textMeasurementContractVersion":1})
    }
    fn evidence() -> TextMeasurements {
        serde_json::from_value(json!({"version":1,"status":"sampled","producer":"production-scene-exporter","timebase":120000,"framesObserved":60,"droppedRecords":0,"outputSha256":"a".repeat(64),"records":[{
            "source":{"elementId":"text","trackId":"text-track","groupPath":["group"],"sceneTimeOffset":24000,"templateElementId":"caption","templateInstanceId":"caption-0","textLayoutBox":{"left":-100,"top":-50,"width":200,"height":100}},
            "sceneTime":36000,"localTime":0,"lastSceneTime":40000,"lastLocalTime":4000,"sampleCount":2,
            "textBox":{"left":-40,"top":-20,"width":80,"height":40},"transform":pose(),"groups":[{"source":{"elementId":"group","trackId":"outer-track","groupPath":[],"sceneTimeOffset":0},"transform":pose(),"childTimeOffset":24000}],
            "layout":{"fontSizePx":32,"fontString":"700 32px Arial","lines":["hello"],"lineCount":1,"widthPx":80,"heightPx":40,"limits":{"maxWidthPx":200,"maxHeightPx":100,"maxLines":2},"overflow":{"width":false,"height":false,"lines":false},"fontIdentityVerified":false}
        }]})).unwrap()
    }
    #[test]
    fn geometry_contract_requires_explicit_marker_without_upgrading_legacy_evidence() {
        let legacy = evidence();
        legacy.validate(&fixture()).unwrap();
        assert!(!legacy.has_constant_record_pose());
        assert!(
            serde_json::to_value(&legacy)
                .unwrap()
                .get("geometryCoverage")
                .is_none()
        );
        let mut current_fixture = fixture();
        current_fixture["textMeasurementGeometryCoverage"] = json!("constant_record_pose_v1");
        assert!(
            legacy
                .validate(&current_fixture)
                .unwrap_err()
                .to_string()
                .contains("requires constant_record_pose_v1")
        );
        let mut current = legacy.clone();
        current.geometry_coverage = Some(GeometryCoverage::ConstantRecordPoseV1);
        current.validate(&current_fixture).unwrap();
        let serialized = serde_json::to_value(&current).unwrap();
        assert_eq!(serialized["geometryCoverage"], "constant_record_pose_v1");
        assert!(
            serde_json::from_value::<TextMeasurements>(serialized)
                .unwrap()
                .has_constant_record_pose()
        );
        let render = json!({"status":"completed","fixture":0,"requestFingerprint":"frozen-fixture","textMeasurements":current});
        assert_eq!(
            published(&render, &current_fixture, &"a".repeat(64)).unwrap()["geometryCoverage"],
            "constant_record_pose_v1"
        );
        let old_render = json!({"status":"completed","fixture":0,"requestFingerprint":"frozen-fixture","textMeasurements":legacy});
        assert!(published(&old_render, &current_fixture, &"a".repeat(64)).is_err());
        let mut unsupported = serde_json::to_value(evidence()).unwrap();
        unsupported["geometryCoverage"] = json!("first_pose_is_enough");
        assert!(serde_json::from_value::<TextMeasurements>(unsupported).is_err());
        current_fixture["textMeasurementGeometryCoverage"] = json!("unsupported");
        assert!(current.validate(&current_fixture).is_err());
    }
    #[test]
    fn binds_nested_identity_and_local_clocks_and_rejects_forged_sources() {
        evidence().validate(&fixture()).unwrap();
        for alter in [0, 1, 2, 3, 4, 5] {
            let mut e = evidence();
            let r = &mut e.records[0];
            match alter {
                0 => r.source.element_id = "other".into(),
                1 => r.source.track_id = "other-track".into(),
                2 => r.source.group_path = vec![],
                3 => r.source.template_instance_id = Some("other-instance".into()),
                4 => r.groups[0].child_time_offset = 0.,
                _ => r.source.text_layout_box.as_mut().unwrap().width = 300.,
            }
            assert!(e.validate(&fixture()).is_err(), "alteration {alter}");
        }
        let mut hidden = fixture();
        hidden["compilation"]["document"]["scenes"][0]["tracks"]["overlay"][0]["hidden"] =
            json!(true);
        assert!(evidence().validate(&hidden).is_err());
    }
    #[test]
    fn validates_frame_counts_end_boundaries_and_nonoverlapping_samples() {
        for alter in 0..7 {
            let mut e = evidence();
            let r = &mut e.records[0];
            match alter {
                0 => r.scene_time = 36001.,
                1 => r.local_time = 1.,
                2 => r.last_scene_time = 144000.,
                3 => r.last_local_time = 8000.,
                4 => r.sample_count = 3,
                5 => e.frames_observed = 59,
                _ => e.records.push(e.records[0].clone()),
            }
            assert!(e.validate(&fixture()).is_err(), "alteration {alter}");
        }
        let mut e = evidence();
        let mut next = e.records[0].clone();
        next.scene_time = 44000.;
        next.local_time = 8000.;
        next.last_scene_time = 48000.;
        next.last_local_time = 12000.;
        e.records.push(next);
        e.validate(&fixture()).unwrap();
    }
    #[test]
    fn accepts_overflow_facts_but_rejects_inconsistent_metrics_and_attestation() {
        let mut e = evidence();
        e.records[0].layout.width_px = 201.;
        e.records[0].layout.overflow.width = true;
        e.validate(&fixture()).unwrap();
        e.records[0].layout.overflow.width = false;
        assert!(e.validate(&fixture()).is_err());
        for alter in 0..7 {
            let mut e = evidence();
            let r = &mut e.records[0];
            match alter {
                0 => r.layout.font_size_px = f64::NAN,
                1 => r.layout.line_count = 2,
                2 => r.layout.font_identity_verified = true,
                3 => r.layout.limits.max_width_px = 300.,
                4 => r.text_box.width = -1.,
                5 => r.transform.scale_x = f64::INFINITY,
                _ => r.layout.lines = vec!["x".repeat(32768)],
            }
            assert!(e.validate(&fixture()).is_err(), "alteration {alter}");
        }
        let mut e = evidence();
        e.dropped_records = 2;
        e.records[0].layout.secondary = Some(Secondary {
            font_size_px: 20.,
            font_string: "20px Arial".into(),
            lines: vec!["中文".into()],
            line_count: 1,
            width_px: 40.,
            height_px: 24.,
        });
        e.validate(&fixture()).unwrap();
    }
    #[test]
    fn attachment_matches_real_file_sha_and_legacy_stays_unmeasured() {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join("preview.mp4");
        std::fs::write(&file, b"test-only publication bytes").unwrap();
        let digest = crate::storage::hash(&file).unwrap();
        let mut e = evidence();
        e.output_sha256 = digest.clone();
        let render = json!({"status":"completed","fixture":0,"requestFingerprint":"frozen-fixture","textMeasurements":e});
        let result = published(&render, &fixture(), &digest).unwrap();
        assert_eq!(result["outputSha256"], digest);
        std::fs::write(&file, b"changed bytes").unwrap();
        assert!(published(&render, &fixture(), &crate::storage::hash(&file).unwrap()).is_err());
        assert_eq!(
            published(&Value::Null, &fixture(), &digest).unwrap(),
            not_measured()
        );
        let original = json!({"revision":4,"publishHash":"unchanged","previews":[{"sha256":"legacy"}],"renders":{"0":{"status":"completed"}}});
        let mut projection = original.clone();
        annotate_legacy(&mut projection);
        assert_eq!(
            projection["previews"][0]["textMeasurements"]["status"],
            "not_measured"
        );
        assert_eq!(
            projection["renders"]["0"]["textMeasurements"]["status"],
            "not_measured"
        );
        assert_eq!(projection["revision"], 4);
        assert!(original["previews"][0].get("textMeasurements").is_none());
    }
    #[test]
    fn sampled_empty_graph_is_distinct_from_no_measurement_and_schema_is_strict() {
        let mut no_text = fixture();
        no_text["compilation"]["document"]["scenes"][0]["tracks"]["overlay"] = json!([]);
        let mut e = evidence();
        e.records.clear();
        e.validate(&no_text).unwrap();
        let render = json!({"status":"completed","fixture":0,"requestFingerprint":"frozen-fixture","textMeasurements":e});
        assert_eq!(
            published(&render, &fixture(), &"a".repeat(64)).unwrap()["status"],
            "sampled"
        );
        let mut unknown = serde_json::to_value(evidence()).unwrap();
        unknown["madeUpAttestation"] = json!(true);
        assert!(serde_json::from_value::<TextMeasurements>(unknown).is_err());
        let mut e = evidence();
        e.output_sha256 = "bad".into();
        assert!(e.validate(&fixture()).is_err());
    }
    #[test]
    fn legacy_fixtures_export_without_attaching_measurements_to_unpinned_ids() {
        let mut legacy = fixture();
        legacy
            .as_object_mut()
            .unwrap()
            .remove("textMeasurementContractVersion");
        let error = evidence().validate(&legacy).unwrap_err().to_string();
        assert!(error.contains("predates text measurement identity contract"));
        let render =
            json!({"status":"completed","fixture":0,"requestFingerprint":"frozen-fixture"});
        assert_eq!(
            published(&render, &legacy, &"a".repeat(64)).unwrap(),
            not_measured()
        );
        let mut unsupported = fixture();
        unsupported["textMeasurementContractVersion"] = json!(2);
        assert!(evidence().validate(&unsupported).is_err());
    }
    #[test]
    fn render_update_validation_is_atomic_and_does_not_rewrite_old_checkpoints() {
        use super::super::production::{RenderUpdate, render_update};
        use crate::store::Store;
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let original = json!({"status":"render_ready","revision":2});
        db.put("template_production_item", "batch-0", &original)
            .unwrap();
        db.put(
            "template_production_output",
            "batch-0",
            &json!({"fixtures":[fixture()]}),
        )
        .unwrap();
        let update = || RenderUpdate {
            base_revision: 2,
            fixture: 0,
            request_fingerprint: "frozen-fixture".into(),
            job_id: "export".into(),
            status: "completed".into(),
            path: Some("preview.mp4".into()),
            error: None,
            text_measurements: Some(evidence()),
        };
        let mut bad = update();
        bad.text_measurements.as_mut().unwrap().records[0].local_time = 10.;
        assert!(render_update(&db, "batch", 0, bad).is_err());
        assert_eq!(
            db.get::<Value>("template_production_item", "batch-0")
                .unwrap(),
            original
        );
        let saved = render_update(&db, "batch", 0, update()).unwrap();
        assert_eq!(saved["revision"], 3);
        assert_eq!(
            saved["renders"]["0"]["textMeasurements"]["records"][0]["layout"]["fontSizePx"],
            32.
        );
        assert!(render_update(&db, "batch", 0, update()).is_err());
        assert_eq!(
            db.get::<Value>("template_production_item", "batch-0")
                .unwrap(),
            saved
        );
        let mut legacy = update();
        legacy.base_revision = 3;
        legacy.status = "running".into();
        legacy.path = None;
        legacy.text_measurements = None;
        let value = render_update(&db, "batch", 0, legacy).unwrap();
        assert_eq!(value["renders"]["0"]["textMeasurements"], not_measured());
        let mut forbidden = update();
        forbidden.base_revision = 4;
        forbidden.status = "failed".into();
        assert!(render_update(&db, "batch", 0, forbidden).is_err());
    }
}
