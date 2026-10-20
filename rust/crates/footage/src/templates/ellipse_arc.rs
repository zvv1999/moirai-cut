//! Reusable ellipse geometry and execution eligibility, independent of text and timing.
use super::model::{Easing, Element, Motion, MotionProperty, Representation, Style};
use anyhow::{Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StrokeCap {
    Round,
    #[default]
    Butt,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EllipseArc {
    /// Degrees from the positive x axis, clockwise in screen coordinates.
    #[schemars(range(min = -360.0, max = 360.0))]
    pub start_degrees: f64,
    /// Positive clockwise extent; the renderer multiplies this by strokeReveal.
    #[schemars(range(max = 360.0), extend("exclusiveMinimum" = 0))]
    pub sweep_degrees: f64,
    #[serde(default)]
    pub cap: StrokeCap,
}

impl Default for EllipseArc {
    fn default() -> Self {
        Self {
            start_degrees: 0.,
            sweep_degrees: 360.,
            cap: StrokeCap::Butt,
        }
    }
}

impl EllipseArc {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            self.start_degrees.is_finite() && (-360.0..=360.).contains(&self.start_degrees),
            "ellipse arc startDegrees must be finite and between -360 and 360"
        );
        ensure!(
            self.sweep_degrees.is_finite() && self.sweep_degrees > 0. && self.sweep_degrees <= 360.,
            "ellipse arc sweepDegrees must be finite, greater than 0 and at most 360"
        );
        Ok(())
    }
}

pub(crate) fn validate_target(element: &Element, styles: &[Style]) -> Result<()> {
    ensure!(
        element.features.representation == Representation::Ellipse && element.features.outline,
        "ellipse arc and stroke_reveal require an outlined ellipse; clear the geometry and motion before changing representation: {}",
        element.id
    );
    let width = element
        .style_id
        .as_ref()
        .and_then(|id| styles.iter().find(|style| &style.id == id))
        .map(|style| style.stroke_width)
        .unwrap_or(2.);
    ensure!(
        width.is_finite() && width > 0.,
        "ellipse arc and stroke_reveal require positive stroke width: {}",
        element.id
    );
    Ok(())
}

pub(crate) fn validate_motion(motion: &Motion) -> Result<()> {
    ensure!(
        motion
            .keys
            .iter()
            .all(|key| key.value.is_finite() && (0.0..=1.).contains(&key.value)),
        "stroke_reveal values must be between 0 and 1"
    );
    ensure!(
        motion
            .keys
            .iter()
            .all(|key| !matches!(key.easing, Easing::Overshoot)),
        "stroke_reveal requires non-overshooting easing"
    );
    Ok(())
}

pub(crate) fn validate_element(element: &Element, styles: &[Style]) -> Result<()> {
    if let Some(arc) = &element.ellipse_arc {
        arc.validate()?;
        validate_target(element, styles)?;
    }
    let mut count = 0;
    for motion in &element.motions {
        if motion.property == MotionProperty::StrokeReveal {
            count += 1;
            validate_target(element, styles)?;
            validate_motion(motion)?;
        }
    }
    ensure!(count <= 1, "duplicate stroke_reveal motion channel");
    Ok(())
}

pub fn capabilities() -> Value {
    json!({
        "geometryField":"ellipseArc",
        "representation":"ellipse", "outlineRequired":true, "positiveStrokeWidthRequired":true,
        "startDegrees":{"minimum":-360,"maximum":360,"direction":"clockwise_from_positive_x"},
        "sweepDegrees":{"exclusiveMinimum":0,"maximum":360},
        "caps":["round","butt"], "defaultCap":"butt", "strokeAlignment":"center",
        "motionProperty":"stroke_reveal", "motionRange":[0,1],
        "motionEasings":["linear","ease_in","ease_out","ease_in_out"],
        "nativeParams":["arcStart","arcSweep","strokeCap","strokeReveal"],
        "nativeAnimationPath":"params.strokeReveal", "defaultGeometry":{"startDegrees":0,"sweepDegrees":360,"cap":"butt"},
        "defaultReveal":1, "treatmentTargets":["element"], "motionComposition":"multiply",
        "zeroReveal":"no_stroke_or_cap_dot", "partialPath":"open_no_fill_or_chord",
        "fullCircle":"closed_without_cap_seam", "textSizeBinding":true,
        "strokeScaling":"existing_nonuniform_source_scaling", "bounds":"conservative_full_ellipse",
        "unsupported":["filled_arcs","negative_sweep","multiple_turns","group_or_layout_reveal","inside_or_outside_partial_stroke"],
        "aestheticQualityVerified":false
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::templates::{dynamic_asset as asset, dynamic_asset_edit as edit, model::*};
    use std::collections::BTreeMap;

    fn definition() -> asset::Definition {
        let mut d = asset::create(asset::Create {
            name: "Editable arc".into(),
            canvas: Canvas {
                width: 720,
                height: 720,
                fps: 30,
            },
            purpose: Some(asset::CreatePurpose::Decoration),
        })
        .unwrap();
        d.styles[0].stroke_width = 6.;
        let e = element(&mut d);
        e.features.representation = Representation::Ellipse;
        e.features.outline = true;
        d
    }
    fn element(d: &mut asset::Definition) -> &mut Element {
        d.layers
            .iter_mut()
            .find_map(|layer| match &mut layer.content {
                asset::LayerContent::Element { element } => Some(element),
                _ => None,
            })
            .unwrap()
    }
    fn arc() -> EllipseArc {
        EllipseArc {
            start_degrees: -35.,
            sweep_degrees: 325.,
            cap: StrokeCap::Round,
        }
    }
    fn reveal() -> Motion {
        serde_json::from_value(json!({"property":"stroke_reveal","keys":[
            {"time":0,"value":0,"easing":"ease_out"},
            {"time":0.2,"value":1,"easing":"linear"},
            {"time":1,"value":1,"easing":"linear"}
        ]}))
        .unwrap()
    }
    fn preview(d: asset::Definition) -> Value {
        asset::preview(asset::Preview {
            definition: d,
            inputs: BTreeMap::new(),
            duration_seconds: 2.,
            example: None,
        })
        .unwrap()
    }
    fn graphic(v: &Value) -> &Value {
        v["tracks"]["overlay"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|track| track["elements"].as_array().unwrap())
            .find(|e| e["type"] == "graphic")
            .unwrap()
    }

    #[test]
    fn ellipse_arc_compiles_canonical_native_path_and_independent_fixed_phase() {
        let mut d = definition();
        let e = element(&mut d);
        e.ellipse_arc = Some(arc());
        e.motions.push(reveal());
        e.motion_timing = Some(MotionTiming {
            coverage: None,
            enter_end: 0.2,
            exit_start: 0.8,
            enter_seconds: 0.18,
            exit_seconds: 0.1,
        });
        let baseline_opacity = e
            .motions
            .iter()
            .find(|m| m.property == MotionProperty::Opacity)
            .cloned()
            .unwrap();
        let projected = d.project(&BTreeMap::new()).unwrap();
        assert_eq!(
            projected.elements[0]
                .ellipse_arc
                .as_ref()
                .unwrap()
                .sweep_degrees,
            325.
        );
        assert_eq!(
            serde_json::to_value(&projected.elements[0].motions[0]).unwrap(),
            serde_json::to_value(&baseline_opacity).unwrap()
        );
        let rendered = preview(d);
        let g = graphic(&rendered);
        assert_eq!(g["params"]["arcStart"], -35.);
        assert_eq!(g["params"]["arcSweep"], 325.);
        assert_eq!(g["params"]["strokeCap"], "round");
        assert_eq!(g["params"]["strokeReveal"], 1.);
        assert_eq!(g["params"]["fill"], "#00000000");
        assert!(g["animations"]["strokeReveal"].is_null());
        let keys = &g["animations"]["params.strokeReveal"]["keys"];
        assert_eq!(keys[0]["value"], 0.);
        assert_eq!(keys[1]["time"], (0.18 * crate::domain::TICKS as f64) as i64);
        assert_eq!(keys[1]["value"], 1.);
        assert_eq!(keys[0]["segmentToNext"], "bezier");
        assert!(g["animations"]["opacity"]["keys"].is_array());
        assert!(g["animations"]["transform.scaleX"]["keys"].is_array());
    }

    #[test]
    fn ellipse_arc_absent_keeps_legacy_graph_and_default_reveal_uses_butt() {
        let d = definition();
        let serialized = serde_json::to_value(&d).unwrap();
        assert!(!serialized.to_string().contains("ellipseArc"));
        let rendered = preview(d.clone());
        for key in ["arcStart", "arcSweep", "strokeCap", "strokeReveal"] {
            assert!(graphic(&rendered)["params"][key].is_null());
        }
        let mut changed = d;
        element(&mut changed).motions.push(reveal());
        let rendered = preview(changed);
        assert_eq!(graphic(&rendered)["params"]["arcStart"], 0.);
        assert_eq!(graphic(&rendered)["params"]["arcSweep"], 360.);
        assert_eq!(graphic(&rendered)["params"]["strokeCap"], "butt");
    }

    #[test]
    fn ellipse_arc_rejects_unsupported_geometry_targets_and_motion_values() {
        for sweep in [0., -1., 361., f64::NAN, f64::INFINITY] {
            assert!(
                EllipseArc {
                    sweep_degrees: sweep,
                    ..arc()
                }
                .validate()
                .is_err()
            );
        }
        for start in [-361., 361., f64::NAN] {
            assert!(
                EllipseArc {
                    start_degrees: start,
                    ..arc()
                }
                .validate()
                .is_err()
            );
        }
        for representation in [
            Representation::Rectangle,
            Representation::Text,
            Representation::Line,
        ] {
            let mut d = definition();
            let e = element(&mut d);
            e.ellipse_arc = Some(arc());
            e.features.representation = representation;
            assert!(d.project(&BTreeMap::new()).is_err());
        }
        let mut d = definition();
        element(&mut d).ellipse_arc = Some(arc());
        element(&mut d).features.outline = false;
        assert!(d.project(&BTreeMap::new()).is_err());
        element(&mut d).features.outline = true;
        d.styles[0].stroke_width = 0.;
        assert!(d.project(&BTreeMap::new()).is_err());
        for value in [-0.1, 1.1, f64::NAN] {
            let mut d = definition();
            let mut m = reveal();
            m.keys[0].value = value;
            element(&mut d).motions.push(m);
            assert!(d.project(&BTreeMap::new()).is_err());
        }
        let mut d = definition();
        let mut m = reveal();
        m.keys[0].easing = Easing::Overshoot;
        element(&mut d).motions.push(m);
        assert!(d.project(&BTreeMap::new()).is_err());
        let mut d = definition();
        element(&mut d).motions.extend([reveal(), reveal()]);
        assert!(d.project(&BTreeMap::new()).is_err());
    }

    #[test]
    fn ellipse_arc_treatment_multiplies_progress_and_rejects_group_targets() {
        let mut d = definition();
        let id = element(&mut d).id.clone();
        let mut base = reveal();
        for key in &mut base.keys {
            key.value = 0.8;
        }
        element(&mut d).motions.push(base);
        d.treatments=serde_json::from_value(json!([{"id":"draw","operation":{"kind":"motion","channels":[
            {"property":"stroke_reveal","keys":[{"time":0,"value":0.5,"easing":"linear"},{"time":1,"value":0.5,"easing":"linear"}]}
        ]}}])).unwrap();
        d.applications = serde_json::from_value(
            json!([{"treatmentId":"draw","target":{"kind":"element","id":id},"enabled":true}]),
        )
        .unwrap();
        let rendered = preview(d.clone());
        let g = graphic(&rendered);
        assert!(
            (crate::templates::treatments::sample(
                &g["animations"]["params.strokeReveal"],
                12000,
                1.
            ) - 0.4)
                .abs()
                < 1e-9
        );
        assert!(g["animations"]["opacity"]["keys"].is_array());
        d.applications[0].target = crate::templates::composition::Target::Group("root".into());
        assert!(d.project(&BTreeMap::new()).is_err());
        d.applications[0].target = crate::templates::composition::Target::Element(id);
        element(&mut d)
            .motions
            .retain(|m| m.property != MotionProperty::StrokeReveal);
        let treatment_only = preview(d.clone());
        assert_eq!(graphic(&treatment_only)["params"]["strokeReveal"], 1.);
        assert_eq!(graphic(&treatment_only)["params"]["arcSweep"], 360.);
        assert!(
            (crate::templates::treatments::sample(
                &graphic(&treatment_only)["animations"]["params.strokeReveal"],
                12000,
                1.
            ) - 0.5)
                .abs()
                < 1e-9
        );
        element(&mut d).features.representation = Representation::Rectangle;
        assert!(d.project(&BTreeMap::new()).is_err());
    }

    #[test]
    fn ellipse_arc_atomic_edits_preserve_motion_and_require_explicit_clear() {
        let mut d = definition();
        let id = element(&mut d).id.clone();
        let before = serde_json::to_value(&element(&mut d).motions).unwrap();
        let result = edit::edit(edit::Edit {
            definition: d,
            operation: edit::Operation::EllipseArc {
                layer_id: id.clone(),
                ellipse_arc: Some(arc()),
            },
        })
        .unwrap();
        let mut d: asset::Definition =
            serde_json::from_value(result["definition"].clone()).unwrap();
        assert_eq!(
            serde_json::to_value(&element(&mut d).motions).unwrap(),
            before
        );
        assert!(
            edit::edit(edit::Edit {
                definition: d.clone(),
                operation: edit::Operation::Outline {
                    layer_id: id.clone(),
                    enabled: false
                }
            })
            .is_err()
        );
        let result = edit::edit(edit::Edit {
            definition: d,
            operation: edit::Operation::EllipseArc {
                layer_id: id.clone(),
                ellipse_arc: None,
            },
        })
        .unwrap();
        let d = serde_json::from_value(result["definition"].clone()).unwrap();
        let result = edit::edit(edit::Edit {
            definition: d,
            operation: edit::Operation::Outline {
                layer_id: id,
                enabled: false,
            },
        })
        .unwrap();
        let mut d = serde_json::from_value(result["definition"].clone()).unwrap();
        assert!(!element(&mut d).features.outline);
        assert_eq!(
            serde_json::to_value(&element(&mut d).motions).unwrap(),
            before
        );
    }

    #[test]
    fn ellipse_arc_survives_save_capture_duplicate_and_schema_discovery() {
        let mut d = definition();
        element(&mut d).ellipse_arc = Some(arc());
        element(&mut d).motions.push(reveal());
        let db = crate::store::Store::open(std::path::Path::new(":memory:")).unwrap();
        let saved = asset::save(
            &db,
            asset::Save {
                definition: d,
                base_revision: 0,
                idempotency_key: "arc-save".into(),
            },
        )
        .unwrap();
        let projected = saved.project(&BTreeMap::new()).unwrap();
        let mut captured = asset::capture(asset::Capture {
            template: projected,
            name: "Captured arc".into(),
        })
        .unwrap();
        assert_eq!(
            element(&mut captured)
                .ellipse_arc
                .as_ref()
                .unwrap()
                .sweep_degrees,
            325.
        );
        assert!(
            element(&mut captured)
                .motions
                .iter()
                .any(|m| m.property == MotionProperty::StrokeReveal)
        );
        let mut duplicated = asset::duplicate(asset::Duplicate {
            definition: captured,
            name: "Arc copy".into(),
        })
        .unwrap();
        assert_eq!(
            element(&mut duplicated).ellipse_arc.as_ref().unwrap().cap,
            StrokeCap::Round
        );
        let schema = serde_json::to_value(schemars::schema_for!(asset::Definition)).unwrap();
        assert!(schema["$defs"]["Element"]["properties"]["ellipseArc"].is_object());
        assert_eq!(
            schema["$defs"]["EllipseArc"]["properties"]["sweepDegrees"]["exclusiveMinimum"],
            0
        );
        assert!(
            schema["$defs"]["MotionProperty"]
                .to_string()
                .contains("\"stroke_reveal\"")
        );
        assert_eq!(
            saved.inspect().unwrap()["capabilities"]["ellipseArc"]["nativeAnimationPath"],
            "params.strokeReveal"
        );
    }

    #[test]
    fn ellipse_arc_clear_repairs_pending_width_but_does_not_bypass_final_validation() {
        let mut d = definition();
        let id = element(&mut d).id.clone();
        element(&mut d).ellipse_arc = Some(arc());
        d.styles[0].stroke_width = 0.;
        let clear = |definition| {
            edit::edit(edit::Edit {
                definition,
                operation: edit::Operation::EllipseArc {
                    layer_id: id.clone(),
                    ellipse_arc: None,
                },
            })
        };
        let result = clear(d.clone()).unwrap();
        assert_eq!(result["definition"]["styles"][0]["strokeWidth"], 0.);
        assert!(
            result["definition"]["layers"]
                .to_string()
                .find("ellipseArc")
                .is_none()
        );
        d.styles[0].font_size = -1.;
        assert!(clear(d.clone()).is_err());
        d.styles[0].font_size = 72.;
        element(&mut d).motions.push(reveal());
        assert!(
            clear(d).is_err(),
            "clearing geometry must not silently delete invalid reveal"
        );
        let mut d = definition();
        element(&mut d).ellipse_arc = Some(arc());
        element(&mut d).features.outline = false;
        assert!(
            edit::edit(edit::Edit {
                definition: d,
                operation: edit::Operation::Outline {
                    layer_id: id,
                    enabled: true
                }
            })
            .is_ok()
        );
    }

    #[test]
    fn ellipse_arc_keeps_exact_measured_text_parent_and_independent_motion() {
        let mut d = asset::create(asset::Create {
            name: "Text with arc".into(),
            canvas: Canvas {
                width: 720,
                height: 720,
                fps: 30,
            },
            purpose: Some(asset::CreatePurpose::Keyword),
        })
        .unwrap();
        let parent = element(&mut d).clone();
        let mut ring = parent.clone();
        ring.id = "ring".into();
        ring.features.representation = Representation::Ellipse;
        ring.features.outline = true;
        ring.features.role = Some(Role::Decoration);
        ring.ellipse_arc = Some(arc());
        ring.style_id = Some("ring-style".into());
        ring.z = parent.z - 1;
        ring.motions.push(reveal());
        ring.motions.push(
            serde_json::from_value(json!({"property":"rotation","keys":[
                {"time":0,"value":-3,"easing":"ease_out"},{"time":1,"value":2,"easing":"linear"}
            ]}))
            .unwrap(),
        );
        let mut style = d.styles[0].clone();
        style.id = "ring-style".into();
        style.stroke_width = 8.;
        d.styles.push(style);
        d.layers.push(asset::Layer {
            parent_id: Some("root".into()),
            content: asset::LayerContent::Element { element: ring },
        });
        d.spatial_relations=serde_json::from_value(json!([{
            "elementId":"ring","relativeTo":parent.id,"placement":"overlay","gap":0,"offsetX":0,"offsetY":0,
            "referenceBounds":"text_box","followMotion":true,
            "sizeBinding":{"width":{"factor":1.5,"padding":0.02},"height":{"factor":1.6,"padding":0.02}}
        }])).unwrap();
        let result = preview(d);
        let g = graphic(&result);
        let host = result["tracks"]["overlay"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|track| track["elements"].as_array().unwrap())
            .find(|e| e["type"] == "text")
            .unwrap();
        assert_eq!(g["textAttachment"]["parent"]["elementId"], host["id"]);
        assert_eq!(g["textAttachment"]["sizeBinding"]["width"]["factor"], 1.5);
        assert_eq!(g["textAttachment"]["sizeBinding"]["height"]["factor"], 1.6);
        assert!(g["animations"]["params.strokeReveal"]["keys"].is_array());
        assert!(g["animations"]["transform.rotate"]["keys"].is_array());
        assert!(g["animations"]["transform.scaleX"]["keys"].is_array());
        assert_eq!(g["startTime"], host["startTime"]);
        assert_eq!(g["duration"], host["duration"]);
    }
}
