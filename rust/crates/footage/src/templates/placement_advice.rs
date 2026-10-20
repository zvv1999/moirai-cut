//! Shared application placement rules. Analysis supplies content protection;
//! this module preserves the design and searches geometry, never template IDs.
use super::{
    dynamic_asset::{self, Application, ApplicationTransform, Definition},
    model::{Rect, Representation, Template},
    placement_policy::{self, Center, EPSILON},
    production_author::Sample,
};
use anyhow::{Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashSet;

#[derive(Clone, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Candidate {
    pub id: String,
    pub center_x: f64,
    pub center_y: f64,
}
#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProtectedRegion {
    pub id: String,
    /// Conservative union of this subject's occupied area over the reviewed span.
    pub region: Rect,
}

/// Reusable constraints, independent of the selected style and source content.
#[derive(Clone, Default, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Policy {
    /// Normalized inset on each canvas edge, additional to envelope padding.
    #[serde(default)]
    pub safe_inset: f64,
    /// Withhold an application until both effect and protection coverage are supplied.
    #[serde(default)]
    pub require_full_coverage: bool,
}
impl Policy {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            self.safe_inset.is_finite() && (0.0..=0.25).contains(&self.safe_inset),
            "invalid placement safe inset"
        );
        Ok(())
    }
}
#[derive(Clone, Copy, Default, Deserialize, Serialize, JsonSchema, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ProtectionCoverage {
    #[default]
    Unverified,
    /// Caller assertion, not automatic subject detection or tracking.
    WholeEffect,
}
#[derive(Clone, Copy, Deserialize, Serialize, JsonSchema, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum EnvelopeCoverage {
    Partial,
    AllRenderedFrames,
}

/// A caller-reported conservative union over every visible leaf of the effect.
/// It includes entry/hold/exit, rotation, attachment movement and decoration.
/// This is not an authenticated or independently measured safety certificate.
#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MotionEnvelope {
    pub application: Application,
    pub sample: Sample,
    /// Output-canvas coordinates before clipping; may extend outside the canvas.
    pub bounds: Rect,
    pub coverage: EnvelopeCoverage,
    pub includes_decorations: bool,
    pub reference: String,
}

/// Explicit caller evidence and reading budget; never estimated from text here.
#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadingTiming {
    pub stable_seconds: f64,
    pub required_stable_seconds: f64,
}
#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadingSample {
    pub id: String,
    pub element_id: String,
    pub line_count: usize,
    pub font_size_px: f64,
    pub overflowing: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timing: Option<ReadingTiming>,
}
#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadingScope {
    pub application: Application,
    pub sample: Sample,
}
#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadingCheck {
    /// Exact measured application and content. Omission keeps legacy diagnostics
    /// readable, but they cannot gate or pass the current application's reading check.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<ReadingScope>,
    pub max_lines: usize,
    pub min_font_size_px: f64,
    pub samples: Vec<ReadingSample>,
}
#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub application: Application,
    /// Optional explicit preference list (max 16). Empty searches obstacle boundaries.
    #[serde(default)]
    pub candidates: Vec<Candidate>,
    pub protected_regions: Vec<ProtectedRegion>,
    #[serde(default)]
    pub protected_regions_coverage: ProtectionCoverage,
    #[serde(default)]
    pub padding: f64,
    #[serde(default)]
    pub policy: Policy,
    /// Complete current content annotations; required for scoped measurement evidence.
    #[serde(default)]
    pub sample: Option<Sample>,
    #[serde(default)]
    pub motion_envelope: Option<MotionEnvelope>,
    #[serde(default)]
    pub reading_check: Option<ReadingCheck>,
}

fn union<'a>(regions: impl Iterator<Item = &'a Rect>) -> Result<Rect> {
    let mut left = f64::INFINITY;
    let mut top = f64::INFINITY;
    let mut right = f64::NEG_INFINITY;
    let mut bottom = f64::NEG_INFINITY;
    for r in regions {
        left = left.min(r.x);
        top = top.min(r.y);
        right = right.max(r.x + r.width);
        bottom = bottom.max(r.y + r.height);
    }
    ensure!(left.is_finite(), "placement requires visual elements");
    Ok(Rect {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
    })
}
fn authored_bounds(template: &Template) -> Result<Rect> {
    let bounds = union(
        template
            .elements
            .iter()
            .filter(|e| e.features.representation != Representation::Audio)
            .map(|e| &e.region),
    )?;
    Ok(super::rigid_transform::application_bounds(
        template, &bounds,
    ))
}
fn current_center(asset: &Definition, input: &Application) -> Result<Center> {
    if let Some(t) = &input.transform {
        return Ok(Center {
            x: t.center_x,
            y: t.center_y,
        });
    }
    // Native application transforms pivot on the pre-width-override union of ALL
    // elements. Preserve that exact origin instead of silently recentring at .5.
    let mut base = input.clone();
    base.caption_width = None;
    base.text_widths.clear();
    let template = dynamic_asset::application(asset, &base)?;
    let bounds = union(template.elements.iter().map(|e| &e.region))?;
    Ok(Center {
        x: bounds.x + bounds.width / 2.,
        y: bounds.y + bounds.height / 2.,
    })
}
fn expand(bounds: &Rect, padding: f64) -> Rect {
    Rect {
        x: bounds.x - padding,
        y: bounds.y - padding,
        width: bounds.width + 2. * padding,
        height: bounds.height + 2. * padding,
    }
}

fn require_evidence_identity(
    name: &str,
    measured_application: &Application,
    measured_sample: &Sample,
    input: &Request,
) -> Result<()> {
    ensure!(
        serde_json::to_value(measured_application)? == serde_json::to_value(&input.application)?,
        "{name} application changed; measure the current application"
    );
    let sample = input
        .sample
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("{name} requires the current sample"))?;
    ensure!(
        serde_json::to_value(measured_sample)? == serde_json::to_value(sample)?,
        "{name} sample changed; measure the current content"
    );
    Ok(())
}

/// Reading samples belong to the supplied application, including its position.
/// Translation proposals may use its gate as a prerequisite, never as evidence
/// that the proposed application was measured against its new background.
fn reading_for_candidate(reading: &Value, unchanged: bool) -> Value {
    let mut result = reading.clone();
    if !unchanged && reading["currentApplicationEvidence"] == true {
        result["sourceStatus"] = reading["status"].clone();
        result["status"] = json!("requires_candidate_measurement");
        result["currentApplicationEvidence"] = json!(false);
        result["requiresCandidateMeasurement"] = json!(true);
        if reading["timingCheck"]["status"] != "not_provided" {
            result["timingCheck"]["sourceStatus"] = reading["timingCheck"]["status"].clone();
            result["timingCheck"]["status"] = json!("requires_candidate_measurement");
        }
    }
    result
}

pub fn capabilities() -> Value {
    json!({"search":"obstacle_boundary_minimum_pixel_displacement","defaultFixedPositions":false,
        "policyFields":["safeInset","requireFullCoverage"],"noSpaceAction":"skip",
        "changes":["application.transform.centerX","application.transform.centerY"],
        "preserves":["styleRevision","scale","rotation","textWidths","timing","motion","sourceFraming"],
        "boundsWithoutEnvelope":"authored_estimate_only","envelopeScope":"whole_effect_swept_union",
        "envelopeIdentity":"exact_application_and_sample","nonTranslatingCompositions":"remeasure_candidate","coverageOrigin":"caller_reported",
        "readingEvidence":{"scope":"optional_exact_application_and_sample","staleScope":"reject","missingScope":{"status":"unscoped","participatesInGate":false},"gateScope":"request_application","movedCandidate":"requires_candidate_measurement","independentlyVerified":false},
        "detectsSubjects":false,"automaticSafetyCertification":false})
}

pub fn advise(asset: &Definition, input: &Request) -> Result<Value> {
    ensure!(
        input.candidates.len() <= 16,
        "placement allows at most 16 candidates"
    );
    ensure!(
        input.protected_regions.len() <= 64,
        "too many protected regions"
    );
    ensure!(
        input.padding.is_finite() && (0.0..=0.25).contains(&input.padding),
        "invalid placement padding"
    );
    input.policy.validate()?;
    let mut ids = HashSet::new();
    for c in &input.candidates {
        ensure!(
            !c.id.trim().is_empty() && c.id.len() <= 80 && ids.insert(&c.id),
            "invalid or duplicate placement candidate id"
        );
        ensure!(
            c.center_x.is_finite()
                && c.center_y.is_finite()
                && (0.0..=1.).contains(&c.center_x)
                && (0.0..=1.).contains(&c.center_y),
            "invalid candidate center"
        );
    }
    ids.clear();
    for r in &input.protected_regions {
        ensure!(
            !r.id.trim().is_empty() && r.id.len() <= 80 && ids.insert(&r.id),
            "invalid or duplicate protected region id"
        );
        r.region.validate()?;
    }
    let original = dynamic_asset::application(asset, &input.application)?;
    let center = current_center(asset, &input.application)?;
    let translation = placement_policy::translation_check(&original);
    let requires_candidate_measurement =
        input.motion_envelope.is_some() && !translation.equivariant;
    let reading = assess_reading(&original, input)?;
    let reading_ok = reading["status"] != "failed";
    let mut full_envelope = false;
    let mut basis = if original.composition.rigid_transforms.is_empty() {
        "authored_visual_regions"
    } else {
        "rotated_authored_visual_regions"
    };
    let bounds = if let Some(e) = &input.motion_envelope {
        require_evidence_identity("motion envelope", &e.application, &e.sample, input)?;
        ensure!(
            !e.reference.trim().is_empty() && e.reference.len() <= 2000,
            "motion envelope requires a bounded evidence reference"
        );
        ensure!(
            [e.bounds.x, e.bounds.y, e.bounds.width, e.bounds.height]
                .iter()
                .all(|v| v.is_finite() && v.abs() <= 32.)
                && e.bounds.width > 0.
                && e.bounds.height > 0.,
            "invalid motion envelope bounds"
        );
        full_envelope = e.coverage == EnvelopeCoverage::AllRenderedFrames && e.includes_decorations;
        basis = "caller_supplied_swept_envelope";
        // A partial measured range can reveal an extra collision, but must never
        // narrow the existing estimate and hide an authored collision.
        if full_envelope {
            e.bounds.clone()
        } else {
            union([&e.bounds, &authored_bounds(&original)?].into_iter())?
        }
    } else {
        authored_bounds(&original)?
    };
    let padded = expand(&bounds, input.padding);
    let safe = Rect {
        x: input.policy.safe_inset,
        y: input.policy.safe_inset,
        width: 1. - 2. * input.policy.safe_inset,
        height: 1. - 2. * input.policy.safe_inset,
    };
    let coverage_complete =
        full_envelope && input.protected_regions_coverage == ProtectionCoverage::WholeEffect;
    let evidence_ok = !input.policy.require_full_coverage || coverage_complete;
    let geometry_status = if full_envelope {
        "caller_envelope"
    } else if input.motion_envelope.is_some() {
        "partial_envelope"
    } else {
        "requires_render_measurement"
    };

    let relative = Rect {
        x: padded.x - center.x,
        y: padded.y - center.y,
        width: padded.width,
        height: padded.height,
    };
    let protected: Vec<_> = input
        .protected_regions
        .iter()
        .map(|r| r.region.clone())
        .collect();
    let mut search = json!({"method":"explicit_preferences","complete":false,"scope":"provided_candidates","evaluatedCenters":input.candidates.len()});
    let defaults;
    let candidates = if input.candidates.is_empty() {
        let solution = placement_policy::solve(
            center,
            &relative,
            &safe,
            &protected,
            input.application.canvas.width as f64,
            input.application.canvas.height as f64,
        )?;
        search = json!({"method":"obstacle_boundary_minimum_pixel_displacement","complete":solution.search_complete,"scope":"translation_geometry","evaluatedCenters":solution.evaluated_centers,"geometryFeasible":solution.feasible});
        let mut found = vec![Candidate {
            id: "current".into(),
            center_x: center.x,
            center_y: center.y,
        }];
        for c in solution.candidates {
            if (c.center.x - center.x).abs() < EPSILON && (c.center.y - center.y).abs() < EPSILON {
                continue;
            }
            found.push(Candidate {
                id: format!("auto-{}", found.len()),
                center_x: c.center.x,
                center_y: c.center.y,
            });
        }
        defaults = found;
        &defaults
    } else {
        &input.candidates
    };
    let mut attempts = vec![];
    let mut selected = None;
    let mut selected_application = None;
    let mut selected_template = None;
    let mut selected_reading = None;
    let mut projection_rejected = false;
    for c in candidates {
        let mut application = input.application.clone();
        // Keep the original shape of an unchanged application, including an omitted transform.
        let unchanged =
            (c.center_x - center.x).abs() < EPSILON && (c.center_y - center.y).abs() < EPSILON;
        if !unchanged {
            application.transform = Some(ApplicationTransform {
                scale: input.application.transform.as_ref().map_or(1., |t| t.scale),
                center_x: c.center_x,
                center_y: c.center_y,
                rotation_degrees: input
                    .application
                    .transform
                    .as_ref()
                    .and_then(|t| t.rotation_degrees),
            });
        }
        match dynamic_asset::application(asset, &application) {
            Err(error) => {
                projection_rejected = true;
                attempts.push(json!({"id":c.id,"eligible":false,"reason":"invalid_application","error":error.to_string()}));
            }
            Ok(template) => {
                let moved = Rect {
                    x: padded.x + c.center_x - center.x,
                    y: padded.y + c.center_y - center.y,
                    width: padded.width,
                    height: padded.height,
                };
                let checked = placement_policy::assess_center(
                    Center {
                        x: c.center_x,
                        y: c.center_y,
                    },
                    &relative,
                    &safe,
                    &protected,
                );
                let outside = checked.outside_safe_area;
                let blockers: Vec<_> = input
                    .protected_regions
                    .iter()
                    .filter(|r| placement_policy::overlaps(&moved, &r.region))
                    .map(|r| &r.id)
                    .collect();
                let envelope_reusable = unchanged || !requires_candidate_measurement;
                let eligible = !outside
                    && blockers.is_empty()
                    && reading_ok
                    && evidence_ok
                    && envelope_reusable;
                let reason = if !envelope_reusable {
                    "candidate_requires_render_measurement"
                } else if outside {
                    "outside_canvas"
                } else if !blockers.is_empty() {
                    "protected_region"
                } else if !reading_ok {
                    "reading_quality"
                } else if !evidence_ok {
                    "evidence_incomplete"
                } else {
                    "clear"
                };
                let distance = ((c.center_x - center.x) * input.application.canvas.width as f64)
                    .hypot((c.center_y - center.y) * input.application.canvas.height as f64);
                let candidate_reading = reading_for_candidate(&reading, unchanged);
                attempts.push(json!({"id":c.id,"centerX":c.center_x,"centerY":c.center_y,"eligible":eligible,"reason":reason,"bounds":moved,"blockers":blockers,"distancePixels":distance,"readingCheck":candidate_reading}));
                if eligible && selected.is_none() {
                    selected = Some(c.id.clone());
                    selected_application = Some(application);
                    selected_template = Some(template);
                    selected_reading = Some(candidate_reading);
                }
            }
        }
    }
    let decision = if selected.is_some() {
        "propose"
    } else if !evidence_ok || requires_candidate_measurement {
        "needs_evidence"
    } else {
        "skip"
    };
    let reading = selected_reading.unwrap_or(reading);
    let reason = if selected.is_some() {
        "placement_proposal"
    } else if !evidence_ok {
        "incomplete_effect_or_protection_coverage"
    } else if requires_candidate_measurement {
        "candidate_geometry_requires_render_measurement"
    } else if !reading_ok {
        "reading_quality"
    } else if projection_rejected {
        "application_constraints"
    } else if input.candidates.is_empty() {
        "no_space_for_checked_bounds"
    } else {
        "no_clear_provided_candidate"
    };
    let mut result = json!({"basis":basis,"decision":decision,"reason":reason,"policy":input.policy,"search":search,
        "geometryCheck":{"status":geometry_status,"placementCertified":false,"coverageComplete":coverage_complete,"translationEquivariant":translation.equivariant,"translationLimitations":translation.reasons,"evidenceOrigin":"caller_reported","requiresRenderedVerification":true},
        "protectionCheck":{"coverage":input.protected_regions_coverage,"automaticallyDetected":false},
        "readingCheck":reading,"selectedId":selected,"application":selected_application,"template":selected_template,"candidates":attempts,
        "fallback":{"action":if decision=="needs_evidence"{"measure_then_retry"}else if decision=="skip"{"skip_or_change_composition"}else{"render_then_verify"},"changesStyle":false,"automaticallyShrinks":false},
        "limitations":["Protection rectangles must cover moving subjects, existing captions, products and other overlays over the whole effect. They are caller annotations, not automatic detection.","Without a complete motion envelope, bounds are authored estimates and omit glyph extent, strokes, shadows, size binding and animation overshoot. A proposal is never a safety certificate.","A supplied envelope must be the unclipped union of all visible effect elements over every rendered entry, hold and exit frame, including decoration. Application and full sample must exactly match. Coverage declarations and references are caller evidence, not independent verification.","Swept unions are conservative and may reject space that a time-varying solver could use. This version moves the whole effect to one stable position; it never follows subjects or changes the template.","Search completeness concerns axis-aligned translation geometry only. A failed restricted candidate list or application projection is not proof that every layout is impossible.","Reading evidence must match the exact application and full sample. Unscoped legacy samples are diagnostics only and do not gate proposals. A scoped failure gates the original application; moved candidates require new reading measurements. Caller measurements do not certify readability or audiovisual quality."]});
    let size_bound: Vec<_> = original
        .composition
        .spatial_relations
        .iter()
        .filter(|r| r.size_binding.is_some())
        .map(|r| &r.element_id)
        .collect();
    if !size_bound.is_empty() {
        result["measuredGeometryCheck"] = json!({"status":if full_envelope{"caller_envelope"}else{"requires_render_measurement"},"reason":"text_size_binding","elementIds":size_bound,"placementCertified":false});
    }
    if !size_bound.is_empty() {
        result["limitations"].as_array_mut().unwrap().push(json!("Size-bound graphics can exceed their authored rectangles after text measurement. Include their actual animated extent in the complete envelope; static clearances remain unverified."));
    }
    Ok(result)
}

fn assess_reading(template: &super::model::Template, input: &Request) -> Result<Value> {
    let Some(check) = input.reading_check.as_ref() else {
        return Ok(
            json!({"status":"not_provided","basis":"caller_supplied_render_measurements","currentApplicationEvidence":false,"participatesInGate":false,"gateScope":"none",
            "timingCheck":{"status":"not_provided","basis":"caller_supplied_stable_reading_budget","providedSamples":0,"reviewedSamples":0,"missingSampleIds":[]}}),
        );
    };
    if let Some(scope) = &check.scope {
        require_evidence_identity("reading scope", &scope.application, &scope.sample, input)?;
    }
    let scoped = check.scope.is_some();
    ensure!(
        (1..=20).contains(&check.max_lines),
        "invalid reading line budget"
    );
    ensure!(
        check.min_font_size_px.is_finite() && (1.0..=1000.0).contains(&check.min_font_size_px),
        "invalid reading font budget"
    );
    ensure!(
        !check.samples.is_empty() && check.samples.len() <= 4096,
        "reading check requires 1 to 4096 samples"
    );
    let text_ids: HashSet<_> = template
        .elements
        .iter()
        .filter(|e| e.features.representation == Representation::Text)
        .map(|e| e.id.as_str())
        .collect();
    let mut ids = HashSet::new();
    let mut covered = HashSet::new();
    let mut findings = vec![];
    let mut timing_count = 0;
    let mut timing_failed = false;
    let mut missing_timing = vec![];
    for sample in &check.samples {
        ensure!(
            !sample.id.trim().is_empty() && sample.id.len() <= 160 && ids.insert(&sample.id),
            "invalid or duplicate reading sample id"
        );
        ensure!(
            text_ids.contains(sample.element_id.as_str()),
            "reading sample references unknown or non-text element"
        );
        ensure!(
            (1..=1000).contains(&sample.line_count)
                && sample.font_size_px.is_finite()
                && sample.font_size_px > 0.0,
            "invalid reading measurement"
        );
        covered.insert(sample.element_id.as_str());
        let mut reasons = vec![];
        if sample.line_count > check.max_lines {
            reasons.push("too_many_lines");
        }
        if sample.font_size_px < check.min_font_size_px {
            reasons.push("font_too_small");
        }
        if sample.overflowing {
            reasons.push("text_overflow");
        }
        if let Some(timing) = &sample.timing {
            ensure!(
                timing.stable_seconds.is_finite()
                    && (0.0..=600.0).contains(&timing.stable_seconds)
                    && timing.required_stable_seconds.is_finite()
                    && timing.required_stable_seconds > 0.0
                    && timing.required_stable_seconds <= 600.0,
                "invalid stable reading time or required duration"
            );
            timing_count += 1;
            if timing.stable_seconds < timing.required_stable_seconds {
                reasons.push("stable_time_too_short");
                timing_failed = true;
            }
        } else {
            missing_timing.push(&sample.id);
        }
        if !reasons.is_empty() {
            findings.push(
                json!({"sampleId":sample.id,"elementId":sample.element_id,"reasons":reasons,"timing":sample.timing}),
            );
        }
    }
    ensure!(
        covered == text_ids,
        "reading check must cover every text element in the application"
    );
    let timing_status = if !scoped && timing_count > 0 {
        "unscoped"
    } else if timing_failed {
        "failed"
    } else if timing_count == 0 {
        "not_provided"
    } else if timing_count < check.samples.len() {
        "partial"
    } else {
        "passed"
    };
    Ok(
        json!({"status":if !scoped{"unscoped"}else if !findings.is_empty(){"failed"}else if timing_status=="partial"{"partial"}else{"passed"},
        "currentApplicationEvidence":scoped,"participatesInGate":scoped,"gateScope":if scoped{"request_application"}else{"none"},"requiresCandidateMeasurement":!scoped,
        "basis":"caller_supplied_render_measurements","reviewedSamples":check.samples.len(),"maxLines":check.max_lines,"minFontSizePx":check.min_font_size_px,"findings":findings,
        "timingCheck":{"status":timing_status,"basis":"caller_supplied_stable_reading_budget","providedSamples":timing_count,"reviewedSamples":check.samples.len(),"missingSampleIds":missing_timing}}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn envelope_request() -> (Definition, Request) {
        let (asset, mut input) = request();
        input.sample = Some(serde_json::from_value(json!({"inputId":"source-a","transcriptRevision":1,"title":"Same style, changing content"})).unwrap());
        input.protected_regions.clear();
        input.motion_envelope = Some(MotionEnvelope {
            application: input.application.clone(),
            sample: input.sample.clone().unwrap(),
            bounds: Rect {
                x: 0.1,
                y: 0.2,
                width: 0.2,
                height: 0.2,
            },
            coverage: EnvelopeCoverage::AllRenderedFrames,
            includes_decorations: true,
            reference: "local-render/all-visible-frames.json".into(),
        });
        (asset, input)
    }
    #[test]
    fn whole_effect_envelope_blocks_an_entrance_that_static_layout_misses() {
        let (asset, mut input) = envelope_request();
        // The static .25-scale design clears this band; a large animated
        // entry/decoration envelope reaches into it at the preferred center.
        input.motion_envelope.as_mut().unwrap().bounds = Rect {
            x: 0.01,
            y: 0.1,
            width: 0.36,
            height: 0.4,
        };
        input.protected_regions.push(ProtectedRegion {
            id: "moving-subject-union".into(),
            region: Rect {
                x: 0.,
                y: 0.,
                width: 0.04,
                height: 1.,
            },
        });
        let before = serde_json::to_value(&asset).unwrap();
        let swept = advise(&asset, &input).unwrap();
        assert_eq!(swept["selectedId"], "right");
        assert_eq!(
            swept["candidates"][0]["blockers"],
            json!(["moving-subject-union"])
        );
        input.motion_envelope = None;
        assert_eq!(advise(&asset, &input).unwrap()["selectedId"], "left");
        assert_eq!(serde_json::to_value(&asset).unwrap(), before);
    }
    #[test]
    fn strict_coverage_requires_full_effect_and_protection_and_never_certifies_pixels() {
        let (asset, mut input) = envelope_request();
        input.policy.require_full_coverage = true;
        let incomplete = advise(&asset, &input).unwrap();
        assert_eq!(incomplete["decision"], "needs_evidence");
        assert!(incomplete["application"].is_null());
        input.protected_regions_coverage = ProtectionCoverage::WholeEffect;
        let supplied = advise(&asset, &input).unwrap();
        assert_eq!(supplied["decision"], "propose");
        assert_eq!(supplied["geometryCheck"]["placementCertified"], false);
        input.motion_envelope.as_mut().unwrap().includes_decorations = false;
        assert_eq!(
            advise(&asset, &input).unwrap()["decision"],
            "needs_evidence"
        );
        input.motion_envelope.as_mut().unwrap().includes_decorations = true;
        input.motion_envelope.as_mut().unwrap().coverage = EnvelopeCoverage::Partial;
        assert_eq!(
            advise(&asset, &input).unwrap()["decision"],
            "needs_evidence"
        );
        input.motion_envelope = None;
        assert_eq!(
            advise(&asset, &input).unwrap()["decision"],
            "needs_evidence"
        );
    }
    #[test]
    fn envelope_identity_rejects_content_transform_and_source_changes() {
        let (asset, mut input) = envelope_request();
        input.sample.as_mut().unwrap().title = "Different content".into();
        assert!(
            advise(&asset, &input)
                .unwrap_err()
                .to_string()
                .contains("sample changed")
        );
        input.sample = Some(input.motion_envelope.as_ref().unwrap().sample.clone());
        input.application.transform.as_mut().unwrap().scale = 0.3;
        assert!(
            advise(&asset, &input)
                .unwrap_err()
                .to_string()
                .contains("application changed")
        );
        input.application = input.motion_envelope.as_ref().unwrap().application.clone();
        input.sample.as_mut().unwrap().input_id = "source-b".into();
        assert!(advise(&asset, &input).is_err());
        input.sample = None;
        assert!(advise(&asset, &input).is_err());
    }
    #[test]
    fn partial_envelope_cannot_hide_an_authored_collision() {
        let (asset, mut input) = envelope_request();
        input.motion_envelope.as_mut().unwrap().coverage = EnvelopeCoverage::Partial;
        input.motion_envelope.as_mut().unwrap().bounds = Rect {
            x: 0.2,
            y: 0.3,
            width: 0.001,
            height: 0.001,
        };
        let projected = dynamic_asset::application(&asset, &input.application).unwrap();
        let static_bounds = authored_bounds(&projected).unwrap();
        input.protected_regions.push(ProtectedRegion {
            id: "known-occupied".into(),
            region: static_bounds,
        });
        let result = advise(&asset, &input).unwrap();
        assert_eq!(result["candidates"][0]["reason"], "protected_region");
        assert_eq!(result["geometryCheck"]["status"], "partial_envelope");
    }
    #[test]
    fn composite_scale_requires_candidate_measurement_instead_of_translating_old_bounds() {
        let (mut asset, mut input) = envelope_request();
        for layer in &mut asset.layers {
            if layer.parent_id.is_none() {
                layer.parent_id = Some("canvas-scale-test".into());
            }
        }
        asset.layers.insert(0,serde_json::from_value(json!({"parentId":null,"content":{"kind":"group","id":"canvas-scale-test","region":{"x":0.,"y":0.,"width":1.,"height":1.},"composite":true}})).unwrap());
        asset.treatments.push(serde_json::from_value(json!({"id":"group-scale","operation":{"kind":"motion","channels":[{"property":"scale","keys":[{"time":0.,"value":1.2,"easing":"linear"},{"time":1.,"value":1.2,"easing":"linear"}]}]}})).unwrap());
        asset.applications.push(serde_json::from_value(json!({"treatmentId":"group-scale","target":{"kind":"group","id":"canvas-scale-test"},"enabled":true})).unwrap());
        input.protected_regions.push(ProtectedRegion {
            id: "subject".into(),
            region: Rect {
                x: 0.,
                y: 0.,
                width: 0.5,
                height: 1.,
            },
        });
        input.protected_regions_coverage = ProtectionCoverage::WholeEffect;
        let result = advise(&asset, &input).unwrap();
        assert_eq!(result["decision"], "needs_evidence");
        assert_eq!(
            result["reason"],
            "candidate_geometry_requires_render_measurement"
        );
        assert_eq!(result["geometryCheck"]["translationEquivariant"], false);
        assert_eq!(
            result["candidates"][1]["reason"],
            "candidate_requires_render_measurement"
        );
        assert!(result["application"].is_null());
        input.protected_regions.clear();
        let original = advise(&asset, &input).unwrap();
        assert_eq!(original["selectedId"], "left");
        assert_eq!(
            original["application"],
            serde_json::to_value(&input.application).unwrap()
        );
    }
    #[test]
    fn default_search_uses_geometry_and_moves_the_whole_effect_without_style_changes() {
        let (asset, mut input) = request();
        input.candidates.clear();
        let original = dynamic_asset::application(&asset, &input.application).unwrap();
        let before = serde_json::to_value(&asset).unwrap();
        let result = advise(&asset, &input).unwrap();
        assert_eq!(
            result["search"]["method"],
            "obstacle_boundary_minimum_pixel_displacement"
        );
        assert_eq!(result["search"]["complete"], true);
        assert!(result["selectedId"].as_str().unwrap().starts_with("auto-"));
        let placed: Template = serde_json::from_value(result["template"].clone()).unwrap();
        let delta_x = placed.elements[0].region.x - original.elements[0].region.x;
        let delta_y = placed.elements[0].region.y - original.elements[0].region.y;
        for (a, b) in original.elements.iter().zip(&placed.elements) {
            assert!((b.region.x - a.region.x - delta_x).abs() < 1e-9);
            assert!((b.region.y - a.region.y - delta_y).abs() < 1e-9);
            assert!((b.region.width - a.region.width).abs() < 1e-9);
            assert!((b.region.height - a.region.height).abs() < 1e-9);
            assert_eq!(
                serde_json::to_value(&a.motions).unwrap(),
                serde_json::to_value(&b.motions).unwrap()
            );
        }
        assert_eq!(
            serde_json::to_value(&original.styles).unwrap(),
            serde_json::to_value(&placed.styles).unwrap()
        );
        assert_eq!(serde_json::to_value(&asset).unwrap(), before);
        input.protected_regions[0].region.width = 1.;
        let blocked = advise(&asset, &input).unwrap();
        assert_eq!(blocked["decision"], "skip");
        assert_eq!(blocked["reason"], "no_space_for_checked_bounds");
        assert!(blocked["application"].is_null());
    }
    #[test]
    fn absent_transform_does_not_recenter_a_clear_application() {
        let (asset, mut input) = request();
        input.application.transform = None;
        input.candidates.clear();
        input.protected_regions.clear();
        input.padding = 0.;
        input.application.placement = Rect {
            x: 0.05,
            y: 0.1,
            width: 0.4,
            height: 0.5,
        };
        let result = advise(&asset, &input).unwrap();
        assert_eq!(result["selectedId"], "current");
        assert_eq!(
            result["application"],
            serde_json::to_value(&input.application).unwrap()
        );
    }
    fn request() -> (Definition, Request) {
        let asset = dynamic_asset::create(serde_json::from_value(json!({"name":"Placement test","canvas":{"width":720,"height":720,"fps":30},"purpose":"decoration"})).unwrap()).unwrap();
        let request:Request = serde_json::from_value(json!({"application":{"assetId":asset.id,"assetRevision":asset.revision,"canvas":{"width":1280,"height":720,"fps":30},"placement":{"x":0,"y":0,"width":1,"height":1},"transform":{"scale":0.25,"centerX":0.2,"centerY":0.3}},"candidates":[{"id":"left","centerX":0.2,"centerY":0.3},{"id":"right","centerX":0.8,"centerY":0.3}],"protectedRegions":[{"id":"background-label","region":{"x":0,"y":0,"width":0.5,"height":1}}],"padding":0.02})).unwrap();
        (asset, request)
    }
    #[test]
    fn placement_rotation_preserves_direction_and_rejects_newly_covered_regions() {
        let (mut asset, mut request) = request();
        for layer in &mut asset.layers {
            if let dynamic_asset::LayerContent::Element { element } = &mut layer.content {
                element.region = Rect {
                    x: 0.2,
                    y: 0.45,
                    width: 0.6,
                    height: 0.1,
                };
            }
        }
        request.candidates = vec![Candidate {
            id: "center".into(),
            center_x: 0.5,
            center_y: 0.5,
        }];
        request.padding = 0.;
        request.protected_regions.clear();
        request.application.transform.as_mut().unwrap().scale = 0.5;
        for (width, height) in [(1280, 720), (720, 1280)] {
            request.application.canvas.width = width;
            request.application.canvas.height = height;
            request
                .application
                .transform
                .as_mut()
                .unwrap()
                .rotation_degrees = None;
            let normal = advise(&asset, &request).unwrap();
            let bounds = &normal["candidates"][0]["bounds"];
            let width_px = bounds["width"].as_f64().unwrap() * width as f64;
            let height_px = bounds["height"].as_f64().unwrap() * height as f64;
            for angle in [90., -90.] {
                request
                    .application
                    .transform
                    .as_mut()
                    .unwrap()
                    .rotation_degrees = Some(angle);
                let rotated = advise(&asset, &request).unwrap();
                assert_eq!(rotated["basis"], "rotated_authored_visual_regions");
                assert_eq!(
                    rotated["application"]["transform"]["rotationDegrees"],
                    angle
                );
                let actual = &rotated["candidates"][0]["bounds"];
                assert!(
                    (actual["width"].as_f64().unwrap() * width as f64 - height_px).abs() < 1e-8
                );
                assert!(
                    (actual["height"].as_f64().unwrap() * height as f64 - width_px).abs() < 1e-8
                );
                let band = Rect {
                    x: 0.495,
                    y: 0.5 - width_px / (2. * height as f64),
                    width: 0.01,
                    height: (width_px - height_px) / (4. * height as f64),
                };
                request.protected_regions = vec![ProtectedRegion {
                    id: "newly-covered".into(),
                    region: band,
                }];
                let blocked = advise(&asset, &request).unwrap();
                assert_eq!(blocked["candidates"][0]["reason"], "protected_region");
                assert!(blocked["application"].is_null());
                request
                    .application
                    .transform
                    .as_mut()
                    .unwrap()
                    .rotation_degrees = None;
                assert_eq!(advise(&asset, &request).unwrap()["selectedId"], "center");
                request.protected_regions.clear();
            }
            request.candidates[0].center_y = 0.06;
            request
                .application
                .transform
                .as_mut()
                .unwrap()
                .rotation_degrees = Some(90.);
            assert_eq!(
                advise(&asset, &request).unwrap()["candidates"][0]["reason"],
                "outside_canvas"
            );
            request
                .application
                .transform
                .as_mut()
                .unwrap()
                .rotation_degrees = None;
            assert_eq!(advise(&asset, &request).unwrap()["selectedId"], "center");
            request.candidates[0].center_y = 0.5;
        }
    }
    #[test]
    fn chooses_first_clear_position_without_changing_effect_size_or_motion() {
        let (asset, mut request) = request();
        let before = serde_json::to_value(&asset).unwrap();
        let original = dynamic_asset::application(&asset, &request.application).unwrap();
        let result = advise(&asset, &request).unwrap();
        assert_eq!(result["selectedId"], "right");
        assert_eq!(
            result["candidates"][0]["blockers"],
            json!(["background-label"])
        );
        let positioned: super::super::model::Template =
            serde_json::from_value(result["template"].clone()).unwrap();
        assert_eq!(
            serde_json::to_value(&positioned.styles).unwrap(),
            serde_json::to_value(&original.styles).unwrap()
        );
        assert_eq!(
            serde_json::to_value(&positioned.layouts).unwrap(),
            serde_json::to_value(&original.layouts).unwrap()
        );
        for (a, b) in original.elements.iter().zip(&positioned.elements) {
            assert!((a.region.width - b.region.width).abs() < 1e-9);
            assert!((a.region.height - b.region.height).abs() < 1e-9);
            assert!((b.region.x - a.region.x - 0.6).abs() < 1e-9);
            assert_eq!(
                serde_json::to_value(&a.motions).unwrap(),
                serde_json::to_value(&b.motions).unwrap()
            );
            assert_eq!(
                serde_json::to_value(&a.timing).unwrap(),
                serde_json::to_value(&b.timing).unwrap()
            );
        }
        request.protected_regions.clear();
        assert_eq!(advise(&asset, &request).unwrap()["selectedId"], "left");
        assert_eq!(serde_json::to_value(&asset).unwrap(), before);
    }
    #[test]
    fn no_clear_candidate_returns_no_template_and_does_not_pick_a_collision() {
        let (asset, mut request) = request();
        request.protected_regions[0].region.width = 1.;
        let result = advise(&asset, &request).unwrap();
        assert!(result["selectedId"].is_null());
        assert!(result["application"].is_null());
        assert!(result["template"].is_null());
    }
    #[test]
    fn invalid_regions_duplicate_candidates_and_stale_revision_are_rejected() {
        let (asset, mut request) = request();
        request.candidates.push(request.candidates[0].clone());
        assert!(advise(&asset, &request).is_err());
        request.candidates.pop();
        request.protected_regions[0].region.width = 2.;
        assert!(advise(&asset, &request).is_err());
        request.protected_regions.clear();
        request.application.asset_revision += 1;
        assert!(advise(&asset, &request).is_err());
    }
    #[test]
    fn padding_can_reject_an_otherwise_valid_edge_candidate() {
        let (asset, mut request) = request();
        request.protected_regions.clear();
        request.padding = 0.25;
        let result = advise(&asset, &request).unwrap();
        assert!(result["selectedId"].is_null());
        assert!(
            result["candidates"]
                .as_array()
                .unwrap()
                .iter()
                .all(|c| c["reason"] == "outside_canvas")
        );
    }
    #[test]
    fn reading_failures_prevent_geometrically_clear_placement_and_report_each_sample() {
        let (_, mut request) = request();
        // The placement test seed starts as a decoration; use the native caption factory.
        let asset = dynamic_asset::create(serde_json::from_value(json!({"name":"Reading test","canvas":{"width":720,"height":720,"fps":30},"purpose":"caption"})).unwrap()).unwrap();
        request.application.asset_id = asset.id.clone();
        request.application.asset_revision = asset.revision;
        request.protected_regions.clear();
        let projected = dynamic_asset::application(&asset, &request.application).unwrap();
        let id = projected
            .elements
            .iter()
            .find(|e| e.features.representation == Representation::Text)
            .unwrap()
            .id
            .clone();
        request.reading_check = Some(serde_json::from_value(json!({"maxLines":3,"minFontSizePx":28,"samples":[{"id":"long-caption","elementId":id,"lineCount":5,"fontSizePx":32,"overflowing":false},{"id":"shrunk-caption","elementId":id,"lineCount":2,"fontSizePx":20,"overflowing":true}]})).unwrap());
        bind_reading_scope(&mut request);
        let result = advise(&asset, &request).unwrap();
        assert!(result["selectedId"].is_null());
        assert!(result["application"].is_null());
        assert!(result["template"].is_null());
        assert_eq!(result["readingCheck"]["status"], "failed");
        assert_eq!(
            result["readingCheck"]["findings"][0]["reasons"],
            json!(["too_many_lines"])
        );
        assert_eq!(
            result["readingCheck"]["findings"][1]["reasons"],
            json!(["font_too_small", "text_overflow"])
        );
        assert!(
            result["candidates"]
                .as_array()
                .unwrap()
                .iter()
                .any(|c| c["reason"] == "reading_quality")
        );
        for s in &mut request.reading_check.as_mut().unwrap().samples {
            s.line_count = 3;
            s.font_size_px = 28.;
            s.overflowing = false;
        }
        let passed = advise(&asset, &request).unwrap();
        assert_eq!(passed["readingCheck"]["status"], "passed");
        assert_eq!(passed["selectedId"], "left");
        request.reading_check.as_mut().unwrap().samples[0].element_id = "missing".into();
        assert!(advise(&asset, &request).is_err());
        request.reading_check = None;
        assert_eq!(
            advise(&asset, &request).unwrap()["readingCheck"]["status"],
            "not_provided"
        );
    }

    fn bind_reading_scope(request: &mut Request) {
        let sample: Sample = serde_json::from_value(json!({
            "inputId":"reading-source","transcriptRevision":1,"title":"Current caption",
            "events":[{"id":"current-keyword","kind":"keyword","start":1.0,"end":2.0,
                "strength":1.0,"confidence":1.0,"sourceId":"reading-source","evidence":"aligned content","text":"Current caption"}]
        })).unwrap();
        request.sample = Some(sample.clone());
        request.reading_check.as_mut().unwrap().scope = Some(ReadingScope {
            application: request.application.clone(),
            sample,
        });
    }

    fn reading_request() -> (Definition, Request) {
        let (_, mut request) = request();
        let asset = dynamic_asset::create(serde_json::from_value(json!({"name":"Timing test","canvas":{"width":720,"height":720,"fps":30},"purpose":"caption"})).unwrap()).unwrap();
        request.application.asset_id = asset.id.clone();
        request.application.asset_revision = asset.revision;
        request.protected_regions.clear();
        let projected = dynamic_asset::application(&asset, &request.application).unwrap();
        let id = &projected
            .elements
            .iter()
            .find(|e| e.features.representation == Representation::Text)
            .unwrap()
            .id;
        request.reading_check = Some(serde_json::from_value(json!({"maxLines":3,"minFontSizePx":28,"samples":[
            {"id":"short","elementId":id,"lineCount":1,"fontSizePx":32,"overflowing":false,"timing":{"stableSeconds":1.2,"requiredStableSeconds":1.2}},
            {"id":"long","elementId":id,"lineCount":3,"fontSizePx":32,"overflowing":false,"timing":{"stableSeconds":2.8,"requiredStableSeconds":2.5}}
        ]})).unwrap());
        bind_reading_scope(&mut request);
        (asset, request)
    }

    #[test]
    fn reading_scope_rejects_changed_text_width_scale_content_and_event_timing() {
        let (asset, request) = reading_request();
        let original = serde_json::to_value(&request).unwrap();
        let text_input_id = &asset.inputs[0].id;
        let mutations = [
            (
                vec!["application", "inputs", text_input_id],
                json!("New caption"),
                "application changed",
            ),
            (
                vec!["application", "captionWidth"],
                json!(0.35),
                "application changed",
            ),
            (
                vec!["application", "transform", "scale"],
                json!(0.3),
                "application changed",
            ),
            (
                vec!["sample", "title"],
                json!("Different content"),
                "sample changed",
            ),
            (
                vec!["sample", "transcriptRevision"],
                json!(2),
                "sample changed",
            ),
        ];
        for (path, value, message) in mutations {
            let mut changed = original.clone();
            let mut target = &mut changed;
            for key in path {
                target = &mut target[key];
            }
            *target = value;
            let changed: Request = serde_json::from_value(changed).unwrap();
            assert!(
                advise(&asset, &changed)
                    .unwrap_err()
                    .to_string()
                    .contains(message)
            );
        }
        let mut changed: Request = serde_json::from_value(original.clone()).unwrap();
        changed.sample.as_mut().unwrap().events[0].end = 2.5;
        assert!(
            advise(&asset, &changed)
                .unwrap_err()
                .to_string()
                .contains("sample changed")
        );
        let mut missing: Request = serde_json::from_value(original).unwrap();
        missing.sample = None;
        assert!(
            advise(&asset, &missing)
                .unwrap_err()
                .to_string()
                .contains("requires the current sample")
        );
    }

    #[test]
    fn unscoped_reading_preserves_legacy_wire_identity_but_cannot_pass_or_gate() {
        let (asset, mut request) = reading_request();
        request.reading_check.as_mut().unwrap().scope = None;
        request.sample = None;
        let legacy = serde_json::to_value(request.reading_check.as_ref().unwrap()).unwrap();
        assert!(legacy.get("scope").is_none());
        let decoded: ReadingCheck = serde_json::from_value(legacy.clone()).unwrap();
        assert_eq!(serde_json::to_value(decoded).unwrap(), legacy);
        for failing in [false, true] {
            let sample = &mut request.reading_check.as_mut().unwrap().samples[0];
            if failing {
                sample.overflowing = true;
                sample.timing.as_mut().unwrap().stable_seconds = 0.;
            }
            let result = advise(&asset, &request).unwrap();
            assert_eq!(result["readingCheck"]["status"], "unscoped");
            assert_eq!(result["readingCheck"]["timingCheck"]["status"], "unscoped");
            assert_eq!(result["readingCheck"]["participatesInGate"], false);
            assert_eq!(result["readingCheck"]["currentApplicationEvidence"], false);
            assert_eq!(result["selectedId"], "left");
            assert_eq!(
                result["readingCheck"]["findings"]
                    .as_array()
                    .unwrap()
                    .is_empty(),
                !failing
            );
        }
    }

    #[test]
    fn moved_candidate_does_not_inherit_original_reading_certification() {
        let (asset, mut request) = reading_request();
        let same = advise(&asset, &request).unwrap();
        assert_eq!(same["readingCheck"]["status"], "passed");
        assert_eq!(same["readingCheck"]["currentApplicationEvidence"], true);
        assert_eq!(same["readingCheck"]["participatesInGate"], true);
        request.protected_regions = vec![ProtectedRegion {
            id: "occupied-left".into(),
            region: Rect {
                x: 0.,
                y: 0.,
                width: 0.5,
                height: 1.,
            },
        }];
        let moved = advise(&asset, &request).unwrap();
        assert_eq!(moved["selectedId"], "right");
        assert_eq!(
            moved["readingCheck"]["status"],
            "requires_candidate_measurement"
        );
        assert_eq!(moved["readingCheck"]["sourceStatus"], "passed");
        assert_eq!(moved["readingCheck"]["currentApplicationEvidence"], false);
        assert_eq!(moved["readingCheck"]["gateScope"], "request_application");
        assert_eq!(
            moved["readingCheck"]["timingCheck"]["status"],
            "requires_candidate_measurement"
        );
        assert_eq!(moved["candidates"][0]["readingCheck"]["status"], "passed");
        assert_eq!(
            moved["candidates"][1]["readingCheck"]["status"],
            "requires_candidate_measurement"
        );
        // Sending that proposed application back with the original measurements
        // must fail, rather than silently relabelling the original scope.
        request.application = serde_json::from_value(moved["application"].clone()).unwrap();
        assert!(
            advise(&asset, &request)
                .unwrap_err()
                .to_string()
                .contains("application changed")
        );
    }

    #[test]
    fn stable_reading_budget_passes_exact_boundaries_without_changing_scheduling() {
        let (asset, request) = reading_request();
        let before = serde_json::to_value(&asset).unwrap();
        let result = advise(&asset, &request).unwrap();
        assert_eq!(result["selectedId"], "left");
        assert_eq!(result["readingCheck"]["status"], "passed");
        assert_eq!(result["readingCheck"]["timingCheck"]["status"], "passed");
        assert_eq!(result["readingCheck"]["timingCheck"]["providedSamples"], 2);
        assert_eq!(
            result["readingCheck"]["timingCheck"]["missingSampleIds"],
            json!([])
        );
        assert_eq!(serde_json::to_value(&asset).unwrap(), before);
        let original = dynamic_asset::application(&asset, &request.application).unwrap();
        assert_eq!(
            result["template"]["visualRhythm"],
            serde_json::to_value(&original.visual_rhythm).unwrap()
        );
        assert_eq!(
            result["template"]["elements"][0]["timing"],
            serde_json::to_value(&original.elements[0].timing).unwrap()
        );
    }

    #[test]
    fn one_short_stable_interval_rejects_every_candidate_without_averaging() {
        let (asset, mut request) = reading_request();
        request.reading_check.as_mut().unwrap().samples[0]
            .timing
            .as_mut()
            .unwrap()
            .stable_seconds = 0.0;
        let result = advise(&asset, &request).unwrap();
        assert_eq!(result["readingCheck"]["status"], "failed");
        assert_eq!(result["readingCheck"]["timingCheck"]["status"], "failed");
        assert_eq!(
            result["readingCheck"]["findings"][0]["reasons"],
            json!(["stable_time_too_short"])
        );
        assert_eq!(
            result["readingCheck"]["findings"][0]["timing"]["stableSeconds"],
            0.0
        );
        assert_eq!(
            result["readingCheck"]["findings"][0]["timing"]["requiredStableSeconds"],
            1.2
        );
        for name in ["selectedId", "application", "template"] {
            assert!(result[name].is_null());
        }
        assert!(
            result["candidates"]
                .as_array()
                .unwrap()
                .iter()
                .all(|c| c["eligible"] == false)
        );
        request.reading_check.as_mut().unwrap().samples[1].timing = None;
        let partial_failure = advise(&asset, &request).unwrap();
        assert_eq!(
            partial_failure["readingCheck"]["timingCheck"]["status"],
            "failed"
        );
        assert_eq!(
            partial_failure["readingCheck"]["timingCheck"]["missingSampleIds"],
            json!(["long"])
        );
    }

    #[test]
    fn optional_and_partial_timing_never_claim_full_time_coverage() {
        let (asset, mut request) = reading_request();
        request.reading_check.as_mut().unwrap().samples[1].timing = None;
        let partial = advise(&asset, &request).unwrap();
        assert_eq!(partial["readingCheck"]["status"], "partial");
        assert_eq!(partial["readingCheck"]["timingCheck"]["status"], "partial");
        assert_eq!(partial["readingCheck"]["timingCheck"]["providedSamples"], 1);
        assert_eq!(partial["readingCheck"]["timingCheck"]["reviewedSamples"], 2);
        assert_eq!(
            partial["readingCheck"]["timingCheck"]["missingSampleIds"],
            json!(["long"])
        );
        assert_eq!(partial["selectedId"], "left");
        request.reading_check.as_mut().unwrap().samples[0].timing = None;
        let legacy = advise(&asset, &request).unwrap();
        assert_eq!(legacy["readingCheck"]["status"], "passed");
        assert_eq!(
            legacy["readingCheck"]["timingCheck"]["status"],
            "not_provided"
        );
        assert_eq!(
            legacy["readingCheck"]["timingCheck"]["missingSampleIds"],
            json!(["short", "long"])
        );
        request.reading_check = None;
        let absent = advise(&asset, &request).unwrap();
        assert_eq!(absent["readingCheck"]["status"], "not_provided");
        assert_eq!(
            absent["readingCheck"]["timingCheck"]["status"],
            "not_provided"
        );
    }

    #[test]
    fn stable_reading_measurements_reject_nonfinite_and_out_of_range_values() {
        let (asset, mut request) = reading_request();
        for value in [-0.1, 600.01, f64::NAN, f64::INFINITY] {
            request.reading_check.as_mut().unwrap().samples[0]
                .timing
                .as_mut()
                .unwrap()
                .stable_seconds = value;
            assert!(
                advise(&asset, &request)
                    .unwrap_err()
                    .to_string()
                    .contains("invalid stable reading")
            );
        }
        request.reading_check.as_mut().unwrap().samples[0]
            .timing
            .as_mut()
            .unwrap()
            .stable_seconds = 600.;
        for value in [0., -0.1, 600.01, f64::NAN, f64::INFINITY] {
            request.reading_check.as_mut().unwrap().samples[0]
                .timing
                .as_mut()
                .unwrap()
                .required_stable_seconds = value;
            assert!(advise(&asset, &request).is_err());
        }
        request.reading_check.as_mut().unwrap().samples[0]
            .timing
            .as_mut()
            .unwrap()
            .required_stable_seconds = 600.;
        assert_eq!(
            advise(&asset, &request).unwrap()["readingCheck"]["timingCheck"]["status"],
            "passed"
        );
    }
}
