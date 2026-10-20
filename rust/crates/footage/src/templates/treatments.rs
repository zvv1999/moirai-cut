use super::{composition::*, model::*, rhythm::EditPlan};
use crate::domain::{TICKS, id};
use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};
use std::collections::HashSet;

fn key(time: i64, value: f64) -> Value {
    json!({"id":id(),"time":time,"value":value,"segmentToNext":"linear","tangentMode":"flat"})
}
fn number(v: &Value, key: &str, default: f64) -> f64 {
    v[key].as_f64().unwrap_or(default)
}
fn cubic(a: f64, b: f64, c: f64, d: f64, t: f64) -> f64 {
    let u = 1. - t;
    u * u * u * a + 3. * u * u * t * b + 3. * u * t * t * c + t * t * t * d
}
// Evaluate existing scalar curves before multiplying/adding independent treatments.
pub(crate) fn sample(channel: &Value, time: i64, fallback: f64) -> f64 {
    let Some(keys) = channel["keys"].as_array().filter(|k| !k.is_empty()) else {
        return fallback;
    };
    if time <= keys[0]["time"].as_i64().unwrap_or(0) {
        return number(&keys[0], "value", fallback);
    }
    for pair in keys.windows(2) {
        let a = &pair[0];
        let b = &pair[1];
        let x0 = number(a, "time", 0.);
        let x3 = number(b, "time", 0.);
        if time as f64 > x3 {
            continue;
        }
        let y0 = number(a, "value", fallback);
        let y3 = number(b, "value", fallback);
        if a["segmentToNext"] == "hold" {
            return y0;
        }
        if a["segmentToNext"] != "bezier" {
            return y0 + (y3 - y0) * (time as f64 - x0) / (x3 - x0);
        }
        let x1 = x0 + number(&a["rightHandle"], "dt", (x3 - x0) / 3.);
        let x2 = x3 + number(&b["leftHandle"], "dt", -(x3 - x0) / 3.);
        let y1 = y0 + number(&a["rightHandle"], "dv", 0.);
        let y2 = y3 + number(&b["leftHandle"], "dv", 0.);
        let (mut lo, mut hi) = (0., 1.);
        for _ in 0..40 {
            let m = (lo + hi) / 2.;
            if cubic(x0, x1, x2, x3, m) < time as f64 {
                lo = m;
            } else {
                hi = m;
            }
        }
        return cubic(y0, y1, y2, y3, (lo + hi) / 2.);
    }
    number(keys.last().unwrap(), "value", fallback)
}
fn combine(clip: &mut Value, path: &str, new: &Value, multiply: bool, fps: u32) {
    if !clip["animations"].is_object() {
        clip["animations"] = json!({});
    }
    let old = clip["animations"][path].clone();
    let default = if multiply { 1. } else { 0. };
    let fallback = number(
        &clip["params"],
        path.strip_prefix("params.").unwrap_or(path),
        default,
    );
    let duration = clip["duration"].as_i64().unwrap();
    let step = (TICKS as i64 / fps as i64).max(1);
    let mut times: Vec<i64> = (0..=duration).step_by(step as usize).collect();
    times.push(duration);
    for c in [&old, new] {
        if let Some(keys) = c["keys"].as_array() {
            times.extend(
                keys.iter()
                    .filter_map(|k| k["time"].as_i64())
                    .filter(|t| *t >= 0 && *t <= duration),
            );
        }
    }
    times.sort_unstable();
    times.dedup();
    let keys: Vec<_> = times
        .into_iter()
        .map(|time| {
            let a = sample(&old, time, fallback);
            let b = sample(new, time, default);
            key(time, if multiply { a * b } else { a + b })
        })
        .collect();
    clip["animations"][path] = json!({"keys":keys});
}
pub fn apply(clip: &mut Value, t: &Template) -> Result<()> {
    for a in t.composition.applications.iter().filter(|a| a.enabled) {
        let matches = match &a.target {
            Target::Layout(id) => clip["params"]["template.layoutId"] == *id,
            Target::Group(id)
                if t.composition
                    .groups
                    .iter()
                    .any(|g| g.id == *id && g.composite) =>
            {
                clip["params"]["template.groupId"] == *id
            }
            _ => t
                .composition
                .members(&a.target)
                .iter()
                .any(|id| clip["params"]["template.elementId"] == *id),
        };
        if !matches {
            continue;
        }
        let treatment = t
            .composition
            .treatments
            .iter()
            .find(|f| f.id == a.treatment_id)
            .context("missing treatment")?;
        match &treatment.operation {
            TreatmentOperation::CanvasClip { region } => {
                ensure!(
                    clip["type"] != "audio",
                    "canvas clip requires visual elements"
                );
                clip["params"]["clip.enabled"] = json!(true);
                clip["params"]["clip.x"] = json!(region.x * t.canvas.width as f64);
                clip["params"]["clip.y"] = json!(region.y * t.canvas.height as f64);
                clip["params"]["clip.width"] = json!(region.width * t.canvas.width as f64);
                clip["params"]["clip.height"] = json!(region.height * t.canvas.height as f64);
            }
            TreatmentOperation::TextHighlight {
                color,
                mode,
                stroke,
            } => {
                ensure!(clip["type"] == "text", "text highlight requires text");
                if *mode == TextHighlightMode::ActiveWord {
                    active_word_highlight(clip)?;
                }
                if clip["params"]["text.highlightRange"].is_string() {
                    ensure!(!clip["params"]["content"].as_str().unwrap_or("").chars().any(|c|
                        matches!(c as u32, 0x0590..=0x08ff | 0xfb1d..=0xfdff | 0xfe70..=0xfeff | 0x202a..=0x202e | 0x2066..=0x2069)),
                        "inline text highlight currently requires left-to-right text");
                    clip["params"]["text.highlightEnabled"] = json!(true);
                    clip["params"]["text.highlightColor"] = json!(color);
                    if let Some(stroke) = stroke {
                        clip["params"]["text.highlightStrokeEnabled"] = json!(true);
                        clip["params"]["text.highlightStrokeColor"] = json!(stroke.color);
                        clip["params"]["text.highlightStrokeWidth"] = json!(stroke.width);
                    }
                }
            }
            TreatmentOperation::Blur { intensity } => append_effect(
                clip,
                json!({"id":id(),"type":"blur","enabled":true,"params":{"intensity":intensity}}),
            ),
            TreatmentOperation::ColorGrade {
                exposure,
                contrast,
                saturation,
                temperature,
            } => append_effect(
                clip,
                json!({"id":id(),"type":"color-grade","enabled":true,"params":{"exposure":exposure,"contrast":contrast,"saturation":saturation,"temperature":temperature}}),
            ),
            TreatmentOperation::Motion {
                channels,
                repeat_seconds,
                motion_timing,
            } => {
                super::exit_sampling::annotate(clip, motion_timing.as_ref(), &treatment.id)?;
                let duration = clip["duration"].as_i64().unwrap();
                let period = repeat_seconds.map(|seconds| (seconds * TICKS as f64).round() as i64);
                for source_motion in channels {
                    let resolved;
                    let m = if let Some(timing) = motion_timing {
                        resolved = super::motion_timing::resolve(
                            source_motion,
                            timing,
                            duration as f64 / TICKS as f64,
                        )?;
                        &resolved
                    } else {
                        source_motion
                    };
                    let paths: &[&str] = match m.property {
                        MotionProperty::Opacity => &["opacity"],
                        MotionProperty::BackgroundOpacity => &["background.opacity"],
                        MotionProperty::Scale => &["transform.scaleX", "transform.scaleY"],
                        MotionProperty::ScaleX => &["transform.scaleX"],
                        MotionProperty::ScaleY => &["transform.scaleY"],
                        MotionProperty::X => &["transform.positionX"],
                        MotionProperty::Y => &["transform.positionY"],
                        MotionProperty::Rotation => &["transform.rotate"],
                        MotionProperty::StrokeReveal => &["params.strokeReveal"],
                        MotionProperty::Reveal => unreachable!(),
                    };
                    let mut keys: Vec<_> = m
                        .keys
                        .iter()
                        .map(|k| {
                            key(
                                (k.time * period.unwrap_or(duration) as f64).round() as i64,
                                k.value,
                            )
                        })
                        .collect();
                    for i in 0..keys.len() - 1 {
                        let dt = number(&keys[i + 1], "time", 0.) - number(&keys[i], "time", 0.);
                        let dv = m.keys[i + 1].value - m.keys[i].value;
                        let [x1, y1, x2, y2] = super::compiler::curve(&m.keys[i].easing);
                        if !matches!(m.keys[i].easing, Easing::Linear) {
                            keys[i]["segmentToNext"] = json!("bezier");
                            keys[i]["rightHandle"] = json!({"dt":dt*x1,"dv":dv*y1});
                            keys[i + 1]["leftHandle"] = json!({"dt":dt*(x2-1.),"dv":dv*(y2-1.)});
                        }
                    }
                    if let Some(period) = period {
                        // Bake a closed cycle at export frame times, preserving each cycle's control points.
                        let curve = json!({"keys": keys});
                        let step = (TICKS as i64 / t.canvas.fps as i64).max(1);
                        let mut times: Vec<i64> = (0..=duration).step_by(step as usize).collect();
                        times.push(duration);
                        for start in (0..=duration).step_by(period as usize) {
                            times.extend(
                                m.keys
                                    .iter()
                                    .map(|k| start + (k.time * period as f64).round() as i64)
                                    .filter(|time| *time <= duration),
                            );
                        }
                        times.sort_unstable();
                        times.dedup();
                        keys = times
                            .into_iter()
                            .map(|time| key(time, sample(&curve, time % period, m.keys[0].value)))
                            .collect();
                    }
                    for path in paths {
                        combine(
                            clip,
                            path,
                            &json!({"keys":keys}),
                            matches!(
                                m.property,
                                MotionProperty::Opacity
                                    | MotionProperty::BackgroundOpacity
                                    | MotionProperty::StrokeReveal
                                    | MotionProperty::Scale
                                    | MotionProperty::ScaleX
                                    | MotionProperty::ScaleY
                            ),
                            t.canvas.fps,
                        );
                    }
                }
            }
        }
    }
    Ok(())
}
fn active_word_highlight(clip: &mut Value) -> Result<()> {
    let encoded = clip["params"]["text.wordTimings"]
        .as_str()
        .context("active word highlight requires aligned sentence words")?;
    let data: Value = serde_json::from_str(encoded)?;
    let duration = clip["duration"].as_i64().context("text duration")?;
    let mut keys = std::collections::BTreeMap::from([(0, String::new())]);
    for window in data["windows"].as_array().context("word windows")? {
        let start = window["startTime"]
            .as_i64()
            .context("word start")?
            .clamp(0, duration);
        let end = window["endTime"]
            .as_i64()
            .context("word end")?
            .clamp(0, duration);
        if end <= start {
            continue;
        }
        let range = json!({"content":data["content"],"start":window["start"],"end":window["end"]})
            .to_string();
        keys.insert(start, range);
        keys.insert(end, String::new());
    }
    clip["params"]["text.highlightRange"] = json!("");
    if !clip["animations"].is_object() {
        clip["animations"] = json!({});
    }
    clip["animations"]["text.highlightRange"] = json!({"keys":keys.into_iter().map(|(time,value)|json!({"id":id(),"time":time,"value":value})).collect::<Vec<_>>()});
    Ok(())
}
fn append_effect(clip: &mut Value, effect: Value) {
    if !clip["effects"].is_array() {
        clip["effects"] = json!([]);
    }
    clip["effects"].as_array_mut().unwrap().push(effect);
}

fn incoming(
    clip: &mut Value,
    duration: i64,
    fps: u32,
    transition_id: &str,
    from_id: &str,
) -> Result<()> {
    let start = clip["startTime"].as_i64().context("transition start")?;
    extend_preroll(clip, duration)?;
    combine(
        clip,
        "opacity",
        &json!({"keys":[key(0,0.),key(duration,1.)]}),
        true,
        fps,
    );
    clip["params"]["template.transitionId"] = json!(transition_id);
    clip["params"]["template.transitionFrom"] = json!(from_id);
    clip["params"]["template.transitionBoundary"] = json!(start);
    Ok(())
}
fn extend_preroll(clip: &mut Value, duration: i64) -> Result<()> {
    let start = clip["startTime"].as_i64().context("transition start")?;
    ensure!(
        duration > 0 && start >= duration && clip["duration"].as_i64().unwrap() > duration,
        "transition exceeds adjacent interval"
    );
    if clip["type"] == "video" {
        ensure!(
            clip["isSourceAudioEnabled"] == false,
            "visual transition requires independently preserved source audio"
        );
        let trim = clip["trimStart"].as_i64().unwrap_or(0);
        ensure!(
            trim >= duration,
            "transition requires incoming source preroll; increase sourceStartSeconds or shorten transition"
        );
        clip["trimStart"] = json!(trim - duration);
    }
    let old_duration = clip["duration"].as_i64().unwrap();
    clip["startTime"] = json!(start - duration);
    clip["duration"] = json!(old_duration + duration);
    if let Some(channels) = clip["animations"].as_object_mut() {
        for (path, channel) in channels.iter_mut() {
            if let Some(keys) = channel["keys"].as_array_mut() {
                for k in keys.iter_mut() {
                    k["time"] =
                        json!(k["time"].as_i64().context("invalid animation time")? + duration);
                }
                if path == "text.highlightRange" {
                    keys.insert(0, json!({"id":id(),"time":0,"value":""}));
                }
            }
        }
    }
    if let Some(tracks) = clip
        .get_mut("renderGroup")
        .and_then(|g| g.get_mut("tracks"))
        .and_then(Value::as_array_mut)
    {
        for e in tracks
            .iter_mut()
            .flat_map(|t| t["elements"].as_array_mut().unwrap())
        {
            if e["startTime"].as_i64() == Some(start) {
                extend_preroll(e, duration)?;
            }
        }
        clip["renderGroup"]["timeOrigin"] = json!(start - duration);
    }
    Ok(())
}

/// Cross-dissolves overlap pictures before the boundary; speech and total duration stay fixed.
pub fn transitions(
    tracks: &mut Vec<Value>,
    main: &mut Vec<Value>,
    t: &Template,
    plan: &EditPlan,
    offset: f64,
) -> Result<()> {
    let mut pairs: Vec<(String, String, i64, String, bool)> = vec![];
    let all: Vec<&Value> = main
        .iter()
        .chain(
            tracks
                .iter()
                .flat_map(|t| t["elements"].as_array().unwrap().iter()),
        )
        .collect();
    for pair in &plan.element_transitions {
        let from = all
            .iter()
            .find(|e| e["params"]["template.instanceId"] == pair.from_instance_id)
            .context("transition outgoing instance was not compiled")?;
        let to = all
            .iter()
            .find(|e| e["params"]["template.instanceId"] == pair.to_instance_id)
            .context("transition incoming instance was not compiled")?;
        pairs.push((
            from["id"].as_str().unwrap().into(),
            to["id"].as_str().unwrap().into(),
            ((pair.end - pair.start) * TICKS as f64).round() as i64,
            pair.rule_id.clone(),
            t.composition
                .transition_effects
                .iter()
                .find(|e| e.id == pair.effect_id)
                .unwrap()
                .outgoing_fade,
        ));
    }
    for transition in &plan.transitions {
        if matches!(transition.effect, TransitionKind::Cut) {
            continue;
        }
        let from_layout = plan
            .layouts
            .iter()
            .find(|l| l.instance_id == transition.from_instance_id)
            .unwrap();
        let to_layout = plan
            .layouts
            .iter()
            .find(|l| l.instance_id == transition.to_instance_id)
            .unwrap();
        let boundary = ((offset + to_layout.start) * TICKS as f64).round() as i64;
        let from: Vec<_> = all
            .iter()
            .filter(|e| {
                e["params"]["template.layoutId"] == from_layout.layout_id
                    && e["startTime"].as_i64().unwrap() + e["duration"].as_i64().unwrap()
                        == boundary
            })
            .collect();
        let to: Vec<_> = all
            .iter()
            .filter(|e| {
                e["params"]["template.layoutId"] == to_layout.layout_id
                    && e["startTime"].as_i64().unwrap() == boundary
            })
            .collect();
        ensure!(
            from.len() == 1 && to.len() == 1,
            "layout dissolve requires one visual layer per side; use per-element transitions for multilayer layouts"
        );
        pairs.push((
            from[0]["id"].as_str().unwrap().into(),
            to[0]["id"].as_str().unwrap().into(),
            ((transition.end - transition.start) * TICKS as f64).round() as i64,
            transition.instance_id.clone(),
            false,
        ));
    }
    let mut seen = HashSet::new();
    for (from_id, to_id, duration, transition_id, outgoing_fade) in pairs {
        ensure!(
            seen.insert(to_id.clone()),
            "multiple transitions target one instance"
        );
        let from = main
            .iter_mut()
            .chain(
                tracks
                    .iter_mut()
                    .flat_map(|t| t["elements"].as_array_mut().unwrap()),
            )
            .find(|e| e["id"] == from_id)
            .context("missing outgoing element")?;
        ensure!(
            from["duration"].as_i64().unwrap() > duration,
            "outgoing clip too short for transition"
        );
        if outgoing_fade {
            let end = from["duration"].as_i64().unwrap();
            combine(
                from,
                "opacity",
                &json!({"keys":[key(end-duration,1.),key(end,0.)]}),
                true,
                t.canvas.fps,
            );
            from["params"]["template.transitionOutId"] = json!(transition_id);
        }
        let mut clip;
        let insert_at;
        if let Some(at) = main.iter().position(|e| e["id"] == to_id) {
            clip = main.remove(at);
            insert_at = tracks
                .iter()
                .position(|t| {
                    t["elements"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|e| e["id"] == from_id)
                })
                .unwrap_or(tracks.len());
        } else {
            let lane = tracks
                .iter()
                .position(|t| {
                    t["elements"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|e| e["id"] == to_id)
                })
                .context("missing incoming element")?;
            let elements = tracks[lane]["elements"].as_array_mut().unwrap();
            let at = elements.iter().position(|e| e["id"] == to_id).unwrap();
            clip = elements.remove(at);
            // Incoming is above both sides, while unrelated higher layers remain above it.
            let from_lane = tracks
                .iter()
                .position(|t| {
                    t["elements"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|e| e["id"] == from_id)
                })
                .unwrap_or(lane);
            insert_at = lane.min(from_lane);
        }
        incoming(&mut clip, duration, t.canvas.fps, &transition_id, &from_id)?;
        let kind = match clip["type"].as_str().unwrap() {
            "image" => "video",
            other => other,
        };
        tracks.insert(insert_at,json!({"id":id(),"name":"Transition","type":kind,"hidden":false,"muted":true,"elements":[clip]}));
    }
    tracks.retain(|t| !t["elements"].as_array().unwrap().is_empty());
    Ok(())
}

pub fn capabilities() -> Value {
    let mut result = json!({"contractVersion":super::execution::CONTRACT,"preflight":"/templates/preflight","evaluation":"/templates/evaluate","repair":"/templates/repair","preferences":{"read":"/templates/preferences/{id}","record":"/templates/preferences","retract":"/templates/preferences/retract","activation":{"renderedComparisons":5,"distinctInputs":3},"evidenceProvenance":"reviewer_supplied"},"search":{"maxCandidates":24,"frontierLimit":2048,"globalOptimumGuaranteed":false,"repairsRequireExplicitPolicy":true},"treatments":["blur","color_grade","motion","text_highlight","canvas_clip"],"treatmentTargets":["element","group","layout"],
        "typography":{"letterSpacing":{"unit":"design_canvas_pixels","default":0,"min":-100,"max":500},"textAlign":["left","center","right"],"fontWeights":"integer_100_to_900","fontWeightRange":{"min":100,"max":900,"step":1},"fontWeightRendering":"exact_requested_weight_subject_to_available_font_faces","richStyleSpans":false},
        "motionChannels":["opacity","background_opacity","scale","scale_x","scale_y","x","y","rotation"],
        "motionChannelConflicts":[["scale","scale_x"],["scale","scale_y"]],
        "textHighlight":{"modes":["keyword","active_word"],"selector":"semantic_keyword","activeWordBinding":"sentence","activeWordClock":"aligned_word_discrete_keyframes","pauseBehavior":"base_fill","bindings":["sentence","keyword"],"targets":["text_element","shared_text_group"],"rangeEncoding":"utf16_half_open","direction":"left_to_right","fillOnly":false,"stroke":{"color":"rgb_hex","width":"design_pixels_0_to_30"},"changedContent":"disabled_until_recompiled"},
        "canvasClip":{"targets":["visual_element","shared_visual_group"],"space":"canvas","region":"normalized_rect","textStage":"raster_before_effects","mediaStage":"compositor_mask","animated":false,"treatmentKind":"canvas_clip"},
        "gridPattern":{"styleField":"grid","target":"rectangle","spacing":"source_pixels_4_to_256","lineWidth":"source_pixels_0.1_to_8","color":"rgb_hex","editableGraphic":true},
        "lifecycle":{"fields":["lifecycles","stateRelations","accumulatingLists"],"instancePolicy":"unique_or_fail","trigger":"source_start","output":"editable_timing_and_opacity_keys","opacityConflict":"reject"},
        "production":{"endpoint":"/templates/production","maxItems":100,"maxFixturesPerItem":8,"renderer":"browser_adapter","previewValidation":"decode_dimensions_duration_sha256","aestheticQualityVerified":false},
        "visualAssets":{"endpoint":"/templates/assets","resolve":"/templates/assets/resolve","canonicalFormats":["rgba_png","silent_h264_mp4"],"maxVideoSeconds":120,"projectMaterialization":"mcp_or_cli","provenance":"caller_supplied"},
        "pairEffects":["dissolve"],"pairRepresentations":["text","image","video","rectangle","ellipse","star","line"],
        "soundEvents":["speech","beat","onset","pause","energy_peak","section"],
        "transitionTiming":"incoming_preroll_preserves_boundary_and_audio","videoPrerollRequired":true,
        "events":["video","semantic","caption","keyword","shot","speech","beat","onset","pause","energy_peak","section"],
        "groupSemantics":["shared_selection","isolated_composite"],"layoutDissolveLayersPerSide":1,
        "spatialRelations":["relative_region","follow_motion","group_grid","measured_text_box","text_size_binding"],
        "backgroundOpacityMotion":{"channel":"background_opacity","parameter":"background.opacity","targets":["text_with_background","shared_text_group_with_background"],"elementValues":"absolute_0_to_1","treatmentValues":"multiply_0_to_1","glyphOpacityUnchanged":true},
        "exitSampling":{"field":"motionTiming.coverage","minExitFrames":"integer_0_to_120","minPostFrames":"integer_0_to_120","default":"allow_cut","basis":"predicted_frame_sampling","severity":"warning","pixelDisappearanceVerified":false,"decodedMediaVerified":false},
        "motionComposition":{"opacity":"multiply","background_opacity":"multiply","scale":"multiply","x":"add_pixels","y":"add_pixels","rotation":"add_degrees"},
        "motionLoop":{"periodField":"repeatSeconds","minSeconds":0.2,"maxSeconds":60,"closedEndpointsRequired":true,"execution":"editable_frame_sampled_keyframes"},
        "animatedStickers":{"catalog":"/templates/stickers","insert":"/templates/stickers/insert","components":["image_asset","resource_slot","looping_motion"],"insertion":"returns_unsaved_template_draft"},
        "constraints":["composite groups cannot share members or interleave external z layers","attachment requires a unique covering parent and nonzero initial scale","reveal motion is unsupported","preflight checks exact document, media and sound catalog; recompile after changes"]});
    result["textSizeBinding"] = json!({"field":"spatialRelations[].sizeBinding","renderer":"web_canvas_preview_and_export","referenceBounds":"text_box","followMotionRequired":true,"parent":"exact_text_element_identity","children":["rectangle","ellipse","star","line"],"axes":["width","height"],"minimumAxes":1,"factor":{"exclusiveMin":0,"max":20},"padding":{"min":0,"max":1,"unit":"per_side_normalized_canvas_axis"},"formula":"measured_text_box_axis * factor + 2 * padding * canvas_axis","parentBackgroundPadding":"already_in_measured_text_box","strokeAndShadow":"excluded","childMotion":"multiplied_after_base_geometry_binding","edgePlacement":"resized_animated_child_anchor_preserves_authored_gap","downstreamMotionFollowers":"rejected","legacyAbsent":"unchanged"});
    result["ellipseArc"] = super::ellipse_arc::capabilities();
    result["starGeometry"] = super::star_geometry::capabilities();
    result["rectangleGeometry"] = super::rectangle_geometry::capabilities();
    result["motionChannels"]
        .as_array_mut()
        .unwrap()
        .push(json!("stroke_reveal"));
    result["motionComposition"]["stroke_reveal"] = json!("multiply");
    result
}

#[cfg(test)]
mod active_word_tests {
    use super::*;

    #[test]
    fn loop_motion_repeats_at_fixed_seconds_and_multiplies_existing_scale() {
        let mut template: Template =
            serde_json::from_value(super::super::composition_tests::input()["template"].clone())
                .unwrap();
        template.composition = serde_json::from_value(json!({"treatments":[{"id":"pulse","operation":{"kind":"motion","repeatSeconds":0.8,"channels":[{"property":"scale","keys":[{"time":0,"value":1,"easing":"linear"},{"time":0.5,"value":1.5,"easing":"linear"},{"time":1,"value":1,"easing":"linear"}]}]}}],"applications":[{"treatmentId":"pulse","target":{"kind":"element","id":"caption"},"enabled":true}]})).unwrap();
        template.validate().unwrap();
        let mut clip = json!({"type":"text","duration":(2.3*TICKS as f64) as i64,"params":{"template.elementId":"caption","transform.scaleX":2.,"transform.scaleY":2.}});
        apply(&mut clip, &template).unwrap();
        for (seconds, expected) in [
            (0., 2.),
            (0.4, 3.),
            (0.8, 2.),
            (1.2, 3.),
            (1.6, 2.),
            (2., 3.),
            (2.3, 2.25),
        ] {
            let actual = sample(
                &clip["animations"]["transform.scaleX"],
                (seconds * TICKS as f64).round() as i64,
                0.,
            );
            assert!(
                (actual - expected).abs() < 1e-6,
                "{seconds}: {actual} != {expected}"
            );
        }
        let encoded = serde_json::to_value(&template).unwrap();
        let mut invalid = encoded.clone();
        invalid["composition"]["treatments"][0]["operation"]["repeatSeconds"] = json!(0.);
        assert!(
            serde_json::from_value::<Template>(invalid)
                .unwrap()
                .validate()
                .is_err()
        );
        let mut invalid = encoded;
        invalid["composition"]["treatments"][0]["operation"]["channels"][0]["keys"][2]["value"] =
            json!(2.);
        assert!(
            serde_json::from_value::<Template>(invalid)
                .unwrap()
                .validate()
                .is_err()
        );
    }

    #[test]
    fn active_word_preroll_preserves_absolute_word_times_and_starts_uncolored() {
        let mut clip = json!({"type":"text","startTime":60000,"duration":120000,"params":{},
            "animations":{"text.highlightRange":{"keys":[{"id":"first","time":0,"value":"first"},{"id":"clear","time":48000,"value":""}]}}});
        extend_preroll(&mut clip, 12000).unwrap();
        let keys = clip["animations"]["text.highlightRange"]["keys"]
            .as_array()
            .unwrap();
        assert_eq!(keys[0]["time"], 0);
        assert_eq!(keys[0]["value"], "");
        assert_eq!(
            clip["startTime"].as_i64().unwrap() + keys[1]["time"].as_i64().unwrap(),
            60000
        );
        assert_eq!(
            clip["startTime"].as_i64().unwrap() + keys[2]["time"].as_i64().unwrap(),
            108000
        );
    }
}
