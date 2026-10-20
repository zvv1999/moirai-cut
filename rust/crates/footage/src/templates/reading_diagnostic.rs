//! Evidence-bound reading dependencies; never grants visual/aesthetic acceptance.
use super::{
    model::Template,
    production_text_measurements::{self, TextMeasurements},
};
use anyhow::{Context, Result, ensure};
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashSet};

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub fixture_id: usize,
    pub output_sha256: String,
    pub viewport_width_px: f64,
    pub min_font_size_px: f64,
    pub max_lines: u64,
    #[serde(default)]
    pub budgets: Vec<Budget>,
}
#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Budget {
    pub element_id: String,
    pub stable_seconds: f64,
    /// Caller-observed scene time; absence leaves timing partial.
    pub stable_start_seconds: Option<f64>,
    pub required_stable_seconds: f64,
}

pub fn diagnose(
    db: &crate::store::Store,
    batch: &str,
    index: usize,
    request: Request,
) -> Result<Value> {
    let item = super::production::item(db, batch, index)?;
    ensure!(
        item["status"] == "published",
        "reading diagnostic requires a published production item"
    );
    let preview = item["previews"]
        .as_array()
        .context("published previews missing")?
        .iter()
        .find(|p| p["fixture"].as_u64() == Some(request.fixture_id as u64))
        .context("unknown published fixture")?;
    ensure!(
        preview["sha256"] == request.output_sha256,
        "reading output SHA mismatch"
    );
    let path = preview["path"].as_str().context("published file missing")?;
    ensure!(
        crate::storage::hash(std::path::Path::new(path))? == request.output_sha256,
        "published file changed"
    );
    let fixture = item["output"]["fixtures"]
        .as_array()
        .context("frozen fixtures missing")?
        .iter()
        .find(|f| f["index"].as_u64() == Some(request.fixture_id as u64))
        .context("frozen fixture missing")?;
    let template: Template = serde_json::from_value(item["output"]["template"].clone())?;
    let evidence: TextMeasurements = serde_json::from_value(preview["textMeasurements"].clone())
        .context("actual text measurements required")?;
    let mut result = assess(&template, fixture, &evidence, &request)?;
    ensure!(
        crate::storage::hash(std::path::Path::new(path))? == request.output_sha256,
        "published file changed during diagnostic"
    );
    result["production"] = json!({"batchId":batch,"itemIndex":index,"fixtureId":request.fixture_id,"outputSha256":request.output_sha256,"requestFingerprint":fixture["requestFingerprint"]});
    Ok(result)
}

fn status(failed: bool, partial: bool) -> &'static str {
    if failed {
        "failed"
    } else if partial {
        "partial"
    } else {
        "passed"
    }
}

fn source_event<'a>(fixture: &'a Value, target: &Value) -> Option<&'a Value> {
    let source = &target["source"];
    let authored = source["templateElementId"].as_str()?;
    let instance = source["templateInstanceId"].as_str()?;
    let plan = &fixture["compilation"]["plan"];
    let matches: Vec<_> = plan["scheduleDecisions"]
        .as_array()?
        .iter()
        .filter(|d| {
            d["selected"] == true
                && d["elementId"] == authored
                && d["eventId"]
                    .as_str()
                    .is_some_and(|e| instance == format!("event-{e}-{authored}"))
        })
        .collect();
    if matches.len() != 1 {
        return None;
    }
    plan["events"].as_array()?.iter().find(|e| {
        e["id"] == matches[0]["eventId"] && e["sourceId"].as_str().is_some_and(|s| !s.is_empty())
    })
}

fn matrix(t: &production_text_measurements::Transform) -> [f64; 4] {
    t.basis.unwrap_or_else(|| {
        let r = t.rotate.to_radians();
        [
            r.cos() * t.scale_x,
            r.sin() * t.scale_x,
            -r.sin() * t.scale_y,
            r.cos() * t.scale_y,
        ]
    })
}
fn multiply(a: [f64; 4], b: [f64; 4]) -> [f64; 4] {
    [
        a[0] * b[0] + a[2] * b[1],
        a[1] * b[0] + a[3] * b[1],
        a[0] * b[2] + a[2] * b[3],
        a[1] * b[2] + a[3] * b[3],
    ]
}
fn effective_font(r: &production_text_measurements::Record) -> f64 {
    let mut m = matrix(&r.transform);
    for g in r.groups.iter().rev() {
        m = multiply(matrix(&g.transform), m);
    }
    let sum = m.iter().map(|v| v * v).sum::<f64>();
    let det = m[0] * m[3] - m[1] * m[2];
    let singular = ((sum - (sum * sum - 4. * det * det).max(0.).sqrt()) / 2.)
        .max(0.)
        .sqrt();
    r.layout.font_size_px * singular
}
fn outside_canvas(r: &production_text_measurements::Record, width: f64, height: f64) -> bool {
    let rect = &r.text_box;
    [
        (rect.left, rect.top),
        (rect.left + rect.width, rect.top),
        (rect.left, rect.top + rect.height),
        (rect.left + rect.width, rect.top + rect.height),
    ]
    .iter()
    .any(|&(mut x, mut y)| {
        for t in std::iter::once(&r.transform).chain(r.groups.iter().rev().map(|g| &g.transform)) {
            let m = matrix(t);
            let nx = m[0] * x + m[2] * y + t.position.x;
            y = m[1] * x + m[3] * y + t.position.y;
            x = nx;
        }
        x < -width / 2. || x > width / 2. || y < -height / 2. || y > height / 2.
    })
}
fn layout_matches(lines: &[String], content: &str) -> bool {
    // Compiled content is compared byte-for-byte between endpoints first. Here
    // accept renderer line wraps with or without an existing word separator.
    let normalize = |s: &str| s.split_whitespace().collect::<Vec<_>>().join(" ");
    normalize(&lines.join(" ")) == normalize(content)
        || normalize(&lines.join("")) == normalize(content)
}

fn assess(
    template: &Template,
    fixture: &Value,
    evidence: &TextMeasurements,
    request: &Request,
) -> Result<Value> {
    template.validate()?;
    ensure!(
        request.output_sha256 == evidence.output_sha256,
        "measurement output SHA mismatch"
    );
    evidence.validate(fixture)?;
    let constant_pose = evidence.has_constant_record_pose();
    let mut evidence_partial_reasons = vec![];
    if !constant_pose {
        evidence_partial_reasons.push("legacy_first_pose_only");
    }
    if evidence.dropped_records > 0 {
        evidence_partial_reasons.push("dropped_records");
    }
    let complete_evidence = evidence_partial_reasons.is_empty();
    ensure!(
        request.viewport_width_px.is_finite()
            && (1. ..=16384.).contains(&request.viewport_width_px)
            && request.min_font_size_px.is_finite()
            && (1. ..=1000.).contains(&request.min_font_size_px)
            && (1..=100).contains(&request.max_lines)
            && request.budgets.len() <= 10000,
        "invalid reading constraints"
    );
    let targets_value = production_text_measurements::reading_targets(fixture)?;
    let targets = targets_value.as_array().unwrap();
    let mut budgets = BTreeMap::new();
    for budget in &request.budgets {
        ensure!(
            budget
                .stable_start_seconds
                .is_none_or(|s| s.is_finite() && s >= 0.)
                && budget.stable_seconds.is_finite()
                && (0. ..=600.).contains(&budget.stable_seconds)
                && budget.required_stable_seconds.is_finite()
                && (0. ..=600.).contains(&budget.required_stable_seconds)
                && budget.required_stable_seconds > 0.,
            "invalid reading budget"
        );
        ensure!(
            targets
                .iter()
                .any(|t| t["source"]["elementId"] == budget.element_id)
                && budgets.insert(budget.element_id.as_str(), budget).is_none(),
            "unknown or duplicate reading budget instance"
        );
    }
    let mut geometry = vec![];
    let mut timing = BTreeMap::new();
    let mut directory = vec![];
    for target in targets {
        let id = target["source"]["elementId"].as_str().unwrap();
        let records: Vec<_> = evidence
            .records
            .iter()
            .filter(|r| r.source.element_id == id)
            .collect();
        let budget = budgets.get(id);
        let start = target["startSeconds"].as_f64().unwrap();
        let end = target["endSeconds"].as_f64().unwrap();
        let available = (end - start).max(0.);
        let window = budget.and_then(|b| b.stable_start_seconds.map(|s| (s, s + b.stable_seconds)));
        let observed: Vec<_> = records
            .iter()
            .filter(|r| {
                window.is_some_and(|(a, b)| {
                    r.last_scene_time / evidence.timebase as f64 >= a
                        && r.scene_time / (evidence.timebase as f64) < b
                })
            })
            .copied()
            .collect();
        let fps = &fixture["compilation"]["document"]["settings"]["fps"];
        let step = (evidence.timebase as f64 * fps["denominator"].as_f64().unwrap()
            / fps["numerator"].as_f64().unwrap())
        .round()
            / evidence.timebase as f64;
        let observed_frames: u64 = observed
            .iter()
            .map(|r| {
                let (a, b) = window.unwrap();
                let lo = (a / step)
                    .ceil()
                    .max((r.scene_time / evidence.timebase as f64 / step).round());
                let hi = (b / step)
                    .ceil()
                    .min((r.last_scene_time / evidence.timebase as f64 / step).round() + 1.);
                (hi - lo).max(0.) as u64
            })
            .sum();
        let expected_frames = window
            .map(|(a, b)| ((b / step).ceil() - (a / step).ceil()).max(0.) as u64)
            .unwrap_or(0);
        let frames_covered = expected_frames > 0 && observed_frames == expected_frames;
        let measured = complete_evidence && frames_covered;
        let measured_min_font = constant_pose
            .then(|| {
                observed
                    .iter()
                    .map(|r| {
                        effective_font(r) * request.viewport_width_px / template.canvas.width as f64
                    })
                    .reduce(f64::min)
            })
            .flatten();
        let max_lines = records.iter().map(|r| r.layout.line_count).max();
        let overflowing = records.iter().any(|r| {
            r.layout.overflow.width || r.layout.overflow.height || r.layout.overflow.lines
        });
        let layout_failed = overflowing || max_lines.is_some_and(|n| n > request.max_lines);
        let font_failed = measured_min_font.is_some_and(|n| n < request.min_font_size_px);
        let boundary_failed = records.iter().any(|r| {
            outside_canvas(
                r,
                template.canvas.width as f64,
                template.canvas.height as f64,
            )
        });
        let failed = layout_failed || font_failed;
        let active_expected_frames = ((end / step).ceil().min(evidence.frames_observed as f64)
            - (start / step).ceil())
        .max(0.) as u64;
        let active_observed_frames: u64 = records.iter().map(|r| r.sample_count).sum();
        let active_measured = complete_evidence
            && active_expected_frames > 0
            && active_observed_frames == active_expected_frames;
        let mut partial_reasons = evidence_partial_reasons.clone();
        if window.is_none() {
            partial_reasons.push("missing_stable_interval");
        } else if !frames_covered {
            partial_reasons.push("incomplete_stable_frames");
        }
        geometry.push(json!({"elementId":id,"status":status(failed,!measured),"recordCount":records.len(),"measuredMinFontSizePx":measured_min_font,"maxLineCount":max_lines,"overflowing":overflowing,"sampledBoundaryStatus":if records.is_empty() {"unverified"} else if boundary_failed {"warning"} else if !constant_pose {"unverified"} else if !active_measured {"partial"} else {"passed"},"partialReasons":partial_reasons,"stableIntervalMeasured":measured,"stableIntervalFramesCovered":frames_covered,"observedStableFrames":observed_frames,"expectedStableFrames":expected_frames,"activeIntervalMeasured":active_measured,"observedActiveFrames":active_observed_frames,"expectedActiveFrames":active_expected_frames}));
        let timing_status = match budget {
            Some(b) if b.stable_seconds < b.required_stable_seconds => "failed",
            Some(_) if window.is_some_and(|(a, b)| a < start - 1e-6 || b > end + 1e-6) => "failed",
            Some(_) if measured && !failed => "passed",
            Some(_) if failed => "failed",
            _ => "partial",
        };
        timing.insert(id, timing_status);
        directory.push(json!({"elementId":id,"templateElementId":target["source"]["templateElementId"],"templateInstanceId":target["source"]["templateInstanceId"],"content":target["content"],"availableSeconds":available,"startSeconds":start,"endSeconds":end,"source":target["source"],"timingStatus":timing_status,"budget":budget.map(|b|json!({"stableSeconds":b.stable_seconds,"stableStartSeconds":b.stable_start_seconds,"requiredStableSeconds":b.required_stable_seconds})),"isReplica":template.composition.reading_replicas.iter().any(|r| target["source"]["templateElementId"] == r.element_id)}));
    }
    let mut pairs = vec![];
    let mut exempt = HashSet::new();
    for relation in &template.composition.reading_replicas {
        for replica in targets
            .iter()
            .filter(|t| t["source"]["templateElementId"] == relation.element_id)
        {
            let id = replica["source"]["elementId"].as_str().unwrap();
            let event = source_event(fixture, replica);
            let candidates: Vec<_> = targets
                .iter()
                .filter(|p| {
                    p["source"]["templateElementId"] == relation.primary_id
                        && event.is_some()
                        && source_event(fixture, p) == event
                        && p["content"] == replica["content"]
                        && p["content"].as_str().is_some_and(|s| !s.is_empty())
                        && p["startSeconds"].as_f64().unwrap()
                            < replica["endSeconds"].as_f64().unwrap()
                        && replica["startSeconds"].as_f64().unwrap()
                            < p["endSeconds"].as_f64().unwrap()
                })
                .collect();
            let primary = (candidates.len() == 1).then(|| candidates[0]);
            let layout_content_matches = |t: &Value| {
                let records: Vec<_> = evidence
                    .records
                    .iter()
                    .filter(|r| t["source"]["elementId"] == r.source.element_id)
                    .collect();
                !records.is_empty()
                    && records.iter().all(|r| {
                        r.layout.secondary.is_none()
                            && layout_matches(&r.layout.lines, t["content"].as_str().unwrap_or(""))
                    })
            };
            let matched = primary
                .is_some_and(|p| layout_content_matches(p) && layout_content_matches(replica));
            let primary_passed = primary.is_some_and(|p| {
                timing.get(p["source"]["elementId"].as_str().unwrap()) == Some(&"passed")
            });
            let exemption = matched && primary_passed;
            if exemption {
                exempt.insert(id);
            }
            pairs.push(json!({"elementId":id,"primaryId":primary.map(|p| &p["source"]["elementId"]),"status":if matched {"passed"} else {"unverified"},"event":event,"independentTimingExempt":exemption,"primaryTimingPassed":primary_passed}));
        }
    }
    // Only dwell is delegated. Replicas retain minimum font, line, overflow and
    // sampled boundary checks over every recorded active frame, including motion.
    for g in &mut geometry {
        if let Some(id) = g["elementId"].as_str().filter(|id| exempt.contains(*id)) {
            let records: Vec<_> = evidence
                .records
                .iter()
                .filter(|r| r.source.element_id == id)
                .collect();
            let font = records
                .iter()
                .map(|r| {
                    effective_font(r) * request.viewport_width_px / template.canvas.width as f64
                })
                .reduce(f64::min);
            let failed = g["overflowing"] == true
                || g["maxLineCount"]
                    .as_u64()
                    .is_some_and(|n| n > request.max_lines)
                || font.is_some_and(|n| n < request.min_font_size_px);
            let mut partial_reasons = evidence_partial_reasons.clone();
            if g["observedActiveFrames"] != g["expectedActiveFrames"]
                || g["expectedActiveFrames"] == 0
            {
                partial_reasons.push("incomplete_active_frames");
            }
            g["partialReasons"] = json!(partial_reasons);
            g["status"] = json!(status(failed, g["activeIntervalMeasured"] != true));
            g["measuredMinFontSizePx"] = json!(font);
            g["fontCheck"] = json!("replica_sampled_frames");
        } else {
            g["fontCheck"] = json!("caller_stable_interval");
        }
    }
    let missing: Vec<_> = timing
        .iter()
        .filter(|(id, s)| !exempt.contains(**id) && **s == "partial")
        .map(|(id, _)| *id)
        .collect();
    let timing_failed = timing
        .iter()
        .any(|(id, s)| !exempt.contains(*id) && *s == "failed");
    let geometry_status = status(
        geometry.iter().any(|g| g["status"] == "failed"),
        geometry.iter().any(|g| g["status"] == "partial"),
    );
    Ok(
        json!({"basis":"frozen_production_measurements","geometryEvidence":{"coverage":evidence.geometry_coverage,"completeRecordPoses":constant_pose,"droppedRecords":evidence.dropped_records,"partialReasons":evidence_partial_reasons,"legacyGeometryStatus":if constant_pose {"not_applicable"} else {"partial_first_observation_only"},"producerAuthenticated":false,"independentlyVerified":false},"status":if targets.is_empty() {"not_requested"} else {"diagnosed"},"primaryInstances":directory.iter().filter(|v|v["isReplica"] == false).collect::<Vec<_>>(),"instances":directory,
        "geometryCheck":{"status":if targets.is_empty() {"not_requested"} else {geometry_status},"records":geometry},
        "timingCheck":{"status":if targets.is_empty() {"not_requested"} else {status(timing_failed,!missing.is_empty())},"missingElementIds":missing,"exemptElementIds":exempt},
        "replicaIdentityCheck":{"status":if pairs.is_empty() {"not_requested"} else if pairs.iter().any(|p|p["status"] != "passed") {"partial"} else {"passed"},"records":pairs},
        "visualCheck":{"status":"unverified","boundaryCheck":"unverified","occlusionCheck":"unverified","competitionCheck":"unverified"},
        "timingEvidence":"caller_supplied","aestheticQualityVerified":false,"listened":false}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::templates::{composition::ReadingReplica, element_edit, model::*};
    fn setup() -> (Template, Value, TextMeasurements, Request) {
        let mut template = element_edit::create(element_edit::Create {
            name: "Reading".into(),
            canvas: Canvas {
                width: 720,
                height: 720,
                fps: 30,
            },
        })
        .unwrap();
        let mut primary = template.elements[0].clone();
        primary.id = "primary".into();
        primary.binding = Binding::Literal;
        primary.literal = Some("Hello world".into());
        let mut replica = primary.clone();
        replica.id = "replica".into();
        replica.features.role = Some(Role::Decoration);
        template.elements = vec![primary, replica];
        template.composition.reading_replicas = vec![ReadingReplica {
            element_id: "replica".into(),
            primary_id: "primary".into(),
        }];
        let element = |id: &str, duration: i64| json!({"id":id,"type":"text","startTime":0,"duration":duration,"params":{"content":"Hello world","template.elementId":id,"template.instanceId":format!("event-e1-{id}"),"text.maxWidth":200,"text.maxHeight":100,"text.maxLines":2}});
        let fixture = json!({"index":0,"requestFingerprint":"test","request":{"sceneId":"scene"},"textMeasurementContractVersion":1,"compilation":{"document":{"metadata":{"duration":240000},"settings":{"fps":{"numerator":30,"denominator":1}},"scenes":[{"id":"scene","tracks":{"main":{"id":"track","elements":[element("primary",120000),element("replica",12000)]},"overlay":[]}}]},"plan":{"scheduleDecisions":[{"eventId":"e1","elementId":"primary","selected":true},{"eventId":"e1","elementId":"replica","selected":true}],"events":[{"id":"e1","sourceId":"word-0","start":0.,"end":1.}]}}});
        let record = |id: &str, count: i64| json!({"source":{"elementId":id,"trackId":"track","groupPath":[],"sceneTimeOffset":0,"templateElementId":id,"templateInstanceId":format!("event-e1-{id}")},"sceneTime":0,"localTime":0,"lastSceneTime":(count-1)*4000,"lastLocalTime":(count-1)*4000,"sampleCount":count,"textBox":{"left":-60,"top":-20,"width":120,"height":40},"transform":{"position":{"x":0,"y":0},"scaleX":1,"scaleY":1,"rotate":0},"groups":[],"layout":{"fontSizePx":32,"fontString":"700 32px Arial","lines":["Hello world"],"lineCount":1,"widthPx":120,"heightPx":40,"limits":{"maxWidthPx":200,"maxHeightPx":100,"maxLines":2},"overflow":{"width":false,"height":false,"lines":false},"fontIdentityVerified":false}});
        let evidence=serde_json::from_value(json!({"version":1,"geometryCoverage":"constant_record_pose_v1","status":"sampled","producer":"production-scene-exporter","timebase":120000,"framesObserved":60,"droppedRecords":0,"outputSha256":"a".repeat(64),"records":[record("primary",30),record("replica",3)]})).unwrap();
        let request=serde_json::from_value(json!({"fixtureId":0,"outputSha256":"a".repeat(64),"viewportWidthPx":720,"minFontSizePx":24,"maxLines":2,"budgets":[{"elementId":"primary","stableStartSeconds":0.2,"stableSeconds":0.6,"requiredStableSeconds":0.5}]})).unwrap();
        (template, fixture, evidence, request)
    }
    #[test]
    fn reading_replica_requires_paired_evidence_and_passing_primary() {
        let (t, f, e, r) = setup();
        let out = assess(&t, &f, &e, &r).unwrap();
        assert_eq!(out["timingCheck"]["status"], "passed");
        assert_eq!(out["geometryCheck"]["status"], "passed");
        assert_eq!(out["timingCheck"]["exemptElementIds"], json!(["replica"]));
        assert_eq!(out["visualCheck"]["status"], "unverified");
        for case in 0..9 {
            let (mut t, mut f, mut e, mut r) = setup();
            match case {
                0 => r.budgets.clear(),
                1 => r.budgets[0].stable_start_seconds = None,
                2 => r.budgets[0].required_stable_seconds = 0.9,
                3 => e.records[0].layout.font_size_px = 18.,
                4 => {
                    f["compilation"]["document"]["scenes"][0]["tracks"]["main"]["elements"][1]["params"]
                        ["content"] = json!("different");
                    e.records[1].layout.lines = vec!["different".into()];
                }
                5 => {
                    f["compilation"]["plan"]["scheduleDecisions"][1]["eventId"] = json!("another");
                }
                6 => {
                    e.records.remove(0);
                }
                7 => t.composition.reading_replicas.clear(),
                _ => {
                    f["compilation"]["plan"]["scheduleDecisions"][1]["eventId"] = json!("e2");
                    f["compilation"]["plan"]["events"]
                        .as_array_mut()
                        .unwrap()
                        .push(json!({"id":"e2","sourceId":"another-word","start":0.,"end":1.}));
                    f["compilation"]["document"]["scenes"][0]["tracks"]["main"]["elements"][1]["params"]
                        ["template.instanceId"] = json!("event-e2-replica");
                    e.records[1].source.template_instance_id = Some("event-e2-replica".into());
                }
            }
            let out = assess(&t, &f, &e, &r).unwrap();
            assert_eq!(
                out["timingCheck"]["exemptElementIds"],
                json!([]),
                "case {case}"
            );
            assert_ne!(out["timingCheck"]["status"], "passed", "case {case}");
        }
    }
    #[test]
    fn reading_budget_cannot_exceed_clipped_interval_or_missing_samples() {
        let (t, f, mut e, mut r) = setup();
        r.budgets[0].stable_start_seconds = Some(0.6);
        assert_eq!(
            assess(&t, &f, &e, &r).unwrap()["timingCheck"]["status"],
            "failed"
        );
        r.budgets[0].stable_start_seconds = Some(0.2);
        e.records[0].last_scene_time = 40000.;
        e.records[0].last_local_time = 40000.;
        e.records[0].sample_count = 11;
        let out = assess(&t, &f, &e, &r).unwrap();
        assert_eq!(out["timingCheck"]["status"], "partial");
        r.output_sha256 = "b".repeat(64);
        assert!(assess(&t, &f, &e, &r).is_err());
    }
    #[test]
    fn reading_geometry_preserves_replica_overflow_and_boundaries() {
        let (t, f, mut e, r) = setup();
        e.records[1].layout.width_px = 220.;
        e.records[1].layout.overflow.width = true;
        e.records[1].transform.position.x = 800.;
        let out = assess(&t, &f, &e, &r).unwrap();
        assert_eq!(out["timingCheck"]["status"], "passed");
        assert_eq!(out["geometryCheck"]["status"], "failed");
        assert_eq!(
            out["geometryCheck"]["records"][1]["sampledBoundaryStatus"],
            "warning"
        );
        let (t, f, mut e, r) = setup();
        e.records[1].layout.font_size_px = 12.;
        let out = assess(&t, &f, &e, &r).unwrap();
        assert_eq!(out["timingCheck"]["status"], "passed");
        assert_eq!(out["geometryCheck"]["status"], "failed");
        assert_eq!(
            out["geometryCheck"]["records"][1]["fontCheck"],
            "replica_sampled_frames"
        );
    }
    #[test]
    fn reading_geometry_uses_stable_samples_and_nested_basis() {
        let (t, f, mut e, r) = setup();
        let mut entry = e.records[0].clone();
        entry.last_scene_time = 20000.;
        entry.last_local_time = 20000.;
        entry.sample_count = 6;
        entry.transform.scale_x = 0.1;
        entry.transform.scale_y = 0.1;
        e.records[0].scene_time = 24000.;
        e.records[0].local_time = 24000.;
        e.records[0].sample_count = 24;
        e.records.push(entry);
        assert_eq!(
            assess(&t, &f, &e, &r).unwrap()["timingCheck"]["status"],
            "passed"
        );
        let mut measured = e.records[0].clone();
        measured.transform.basis = Some([0.5, 0., 0., 0.5]);
        assert!((effective_font(&measured) - 16.).abs() < 1e-8);
        measured.transform.basis = None;
        measured.groups.push(serde_json::from_value(json!({"childTimeOffset":0,"transform":{"position":{"x":0,"y":0},"scaleX":0.5,"scaleY":0.5,"rotate":90}})).unwrap());
        assert!((effective_font(&measured) - 16.).abs() < 1e-8);
    }
    #[test]
    fn reading_legacy_pose_and_dropped_records_never_certify_stable_geometry() {
        for legacy in [true, false] {
            let (t, f, mut e, r) = setup();
            if legacy {
                e.geometry_coverage = None;
            } else {
                // framesObserved and interval counts still appear complete; a
                // collector capacity loss must not disappear behind those counts.
                e.dropped_records = 1;
            }
            let out = assess(&t, &f, &e, &r).unwrap();
            assert_eq!(out["geometryCheck"]["status"], "partial");
            assert_eq!(out["timingCheck"]["status"], "partial");
            assert_eq!(out["timingCheck"]["exemptElementIds"], json!([]));
            assert_eq!(
                out["geometryCheck"]["records"][0]["stableIntervalFramesCovered"],
                true
            );
            assert_eq!(
                out["geometryCheck"]["records"][0]["stableIntervalMeasured"],
                false
            );
            assert_eq!(
                out["geometryEvidence"]["partialReasons"],
                json!([if legacy {
                    "legacy_first_pose_only"
                } else {
                    "dropped_records"
                }])
            );
            assert_eq!(
                out["geometryCheck"]["records"][0]["sampledBoundaryStatus"],
                if legacy { "unverified" } else { "partial" }
            );
            if legacy {
                assert!(out["geometryCheck"]["records"][0]["measuredMinFontSizePx"].is_null());
            }
            // Definite recorded layout failure remains a failure even though
            // unrecorded poses cannot establish a passing geometry result.
            e.records[0].layout.width_px = 220.;
            e.records[0].layout.overflow.width = true;
            assert_eq!(
                assess(&t, &f, &e, &r).unwrap()["geometryCheck"]["status"],
                "failed"
            );
        }
    }
    #[test]
    fn reading_pose_changes_inside_stable_interval_are_checked() {
        let (t, f, mut e, r) = setup();
        let mut shrinking = e.records[0].clone();
        shrinking.scene_time = 72000.;
        shrinking.local_time = 72000.;
        shrinking.sample_count = 12;
        shrinking.transform.scale_x = 0.5;
        shrinking.transform.scale_y = 0.5;
        e.records[0].last_scene_time = 68000.;
        e.records[0].last_local_time = 68000.;
        e.records[0].sample_count = 18;
        e.records.push(shrinking);
        let out = assess(&t, &f, &e, &r).unwrap();
        assert_eq!(
            out["geometryCheck"]["records"][0]["stableIntervalMeasured"],
            true
        );
        assert_eq!(
            out["geometryCheck"]["records"][0]["measuredMinFontSizePx"],
            16.
        );
        assert_eq!(out["geometryCheck"]["status"], "failed");
        assert_eq!(out["timingCheck"]["status"], "failed");
        assert_eq!(out["timingCheck"]["exemptElementIds"], json!([]));
    }
    #[test]
    fn reading_ancestor_pose_changes_are_checked_against_frozen_group_identity() {
        let (t, mut f, mut e, r) = setup();
        let elements =
            f["compilation"]["document"]["scenes"][0]["tracks"]["main"]["elements"].take();
        f["compilation"]["document"]["scenes"][0]["tracks"]["main"]["elements"] = json!([{
            "id":"group","type":"graphic","startTime":0,"duration":120000,"trimStart":0,"params":{},
            "renderGroup":{"timeOrigin":0,"tracks":[{"id":"child-track","elements":elements}]}
        }]);
        for record in &mut e.records {
            record.source.track_id = "child-track".into();
            record.source.group_path = vec!["group".into()];
            record.groups.push(serde_json::from_value(json!({
                "source":{"elementId":"group","trackId":"track","groupPath":[],"sceneTimeOffset":0},
                "transform":{"position":{"x":0,"y":0},"scaleX":1,"scaleY":1,"rotate":0},
                "childTimeOffset":0
            })).unwrap());
        }
        let mut shrinking = e.records[0].clone();
        shrinking.scene_time = 72000.;
        shrinking.local_time = 72000.;
        shrinking.sample_count = 12;
        shrinking.groups[0].transform.scale_x = 0.5;
        shrinking.groups[0].transform.scale_y = 0.5;
        shrinking.groups[0].transform.rotate = 90.;
        e.records[0].last_scene_time = 68000.;
        e.records[0].last_local_time = 68000.;
        e.records[0].sample_count = 18;
        e.records.push(shrinking);
        let out = assess(&t, &f, &e, &r).unwrap();
        assert_eq!(
            out["geometryCheck"]["records"][0]["measuredMinFontSizePx"],
            16.
        );
        assert_eq!(out["geometryCheck"]["status"], "failed");
        assert_eq!(out["timingCheck"]["exemptElementIds"], json!([]));
    }
    #[test]
    fn reading_replica_dwell_exemption_does_not_certify_missing_active_frames() {
        let (t, f, mut e, r) = setup();
        e.records[1].last_scene_time = 4000.;
        e.records[1].last_local_time = 4000.;
        e.records[1].sample_count = 2;
        let out = assess(&t, &f, &e, &r).unwrap();
        assert_eq!(out["timingCheck"]["status"], "passed");
        assert_eq!(out["timingCheck"]["exemptElementIds"], json!(["replica"]));
        assert_eq!(out["geometryCheck"]["status"], "partial");
        let replica = &out["geometryCheck"]["records"][1];
        assert_eq!(replica["activeIntervalMeasured"], false);
        assert_eq!(
            replica["partialReasons"],
            json!(["incomplete_active_frames"])
        );
        assert_eq!(replica["expectedActiveFrames"], 3);
        assert_eq!(replica["observedActiveFrames"], 2);
        assert_eq!(replica["sampledBoundaryStatus"], "partial");
    }
    #[test]
    fn reading_diagnostic_loads_frozen_file_and_rejects_mismatched_identity() {
        let (t, f, mut e, mut r) = setup();
        let path =
            std::env::temp_dir().join(format!("reading-diagnostic-{}", uuid::Uuid::new_v4()));
        std::fs::write(&path, b"frozen test output").unwrap();
        let digest = crate::storage::hash(&path).unwrap();
        e.output_sha256 = digest.clone();
        r.output_sha256 = digest.clone();
        let db = crate::store::Store::open(std::path::Path::new(":memory:")).unwrap();
        db.put("template_production_item","batch-0",&json!({"status":"published","fixtureProjects":[],"previews":[{"fixture":0,"path":path,"sha256":digest,"textMeasurements":e}]})).unwrap();
        db.put(
            "template_production_output",
            "batch-0",
            &json!({"template":t,"fixtures":[f]}),
        )
        .unwrap();
        let result = diagnose(&db, "batch", 0, r).unwrap();
        assert_eq!(result["production"]["outputSha256"], digest);
        let (_, _, _, mut wrong) = setup();
        wrong.output_sha256 = digest.clone();
        wrong.fixture_id = 1;
        assert!(diagnose(&db, "batch", 0, wrong).is_err());
        let (_, _, _, wrong) = setup();
        assert!(diagnose(&db, "batch", 0, wrong).is_err());
        std::fs::write(&path, b"mutated output").unwrap();
        let (_, _, _, mut changed) = setup();
        changed.output_sha256 = digest;
        assert!(diagnose(&db, "batch", 0, changed).is_err());
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn reading_replica_rejects_same_content_from_nonoverlapping_event_or_ambiguous_primary() {
        for ambiguous in [false, true] {
            let (t, mut f, mut e, r) = setup();
            if ambiguous {
                let mut duplicate =
                    f["compilation"]["document"]["scenes"][0]["tracks"]["main"]["elements"][0]
                        .clone();
                duplicate["id"] = json!("primary-copy");
                f["compilation"]["document"]["scenes"][0]["tracks"]["main"]["elements"]
                    .as_array_mut()
                    .unwrap()
                    .push(duplicate);
                let mut record = e.records[0].clone();
                record.source.element_id = "primary-copy".into();
                e.records.push(record);
            } else {
                f["compilation"]["document"]["scenes"][0]["tracks"]["main"]["elements"][1]["startTime"] =
                    json!(120000);
                e.records[1].scene_time += 120000.;
                e.records[1].last_scene_time += 120000.;
            }
            let out = assess(&t, &f, &e, &r).unwrap();
            assert_eq!(out["timingCheck"]["exemptElementIds"], json!([]));
            assert_eq!(out["replicaIdentityCheck"]["status"], "partial");
        }
    }
    #[test]
    fn reading_layout_wraps_keep_word_boundaries() {
        assert!(layout_matches(
            &["Hello".into(), "world".into()],
            "Hello world"
        ));
        assert!(layout_matches(&["中文".into(), "测试".into()], "中文测试"));
        assert!(!layout_matches(&["a bc".into()], "ab c"));
    }
}
