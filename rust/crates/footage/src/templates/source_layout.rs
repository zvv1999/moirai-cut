use super::{
    model::*,
    rhythm::{EditPlan, PlacedElement},
    visual_compile,
};
use crate::domain::{TICKS, id};
use anyhow::{Context, Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;

#[derive(Clone, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceRef {
    pub track_id: String,
    pub element_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub focal_point: Option<visual_compile::FocalPoint>,
}

fn ticks(v: f64) -> i64 {
    (v * TICKS as f64).round() as i64
}

fn key(time: i64, value: f64) -> Value {
    json!({"id":id(),"time":time,"value":value,"segmentToNext":"bezier","tangentMode":"flat"})
}

pub struct SourceLayout {
    pub replacements: Vec<Value>,
    pub overlays: Vec<Value>,
    pub audio: Option<Value>,
}

fn transition(
    clip: &mut Value,
    entrance: Option<&LayoutEntrance>,
    duration: i64,
    region_width: f64,
    warnings: &mut Vec<String>,
) {
    let Some(entrance) = entrance else {
        return;
    };
    let time = ticks(entrance.duration_seconds).min(duration / 2);
    if time <= 0 {
        return;
    }
    let x = clip["params"]["transform.positionX"].as_f64().unwrap();
    let scale = clip["params"]["transform.scaleX"].as_f64().unwrap();
    match entrance.effect {
        TransitionKind::Slide => {
            clip["animations"] =
                json!({"transform.positionX":{"keys":[key(0,x+region_width),key(time,x)]}});
        }
        TransitionKind::Zoom => {
            clip["animations"] = json!({"transform.scaleX":{"keys":[key(0,scale*0.9),key(time,scale)]},
                "transform.scaleY":{"keys":[key(0,scale*0.9),key(time,scale)]}});
        }
        TransitionKind::Blur => {
            let effect_id = id();
            clip["effects"] =
                json!([{"id":effect_id,"type":"blur","enabled":true,"params":{"intensity":0}}]);
            if !clip["animations"].is_object() {
                clip["animations"] = json!({});
            }
            clip["animations"][format!("effects.{effect_id}.params.intensity")] =
                json!({"keys":[key(0,85.),key(time,0.)]});
            warnings.push(format!("authored_blur_entrance:{}:85", entrance.layout_id));
        }
        TransitionKind::Wipe => {
            // The sweep intersects the layout crop, including its focal-point offset.
            let center = clip["masks"][0]["params"]["centerX"].as_f64().unwrap_or(0.);
            let width = clip["masks"][0]["params"]["width"].as_f64().unwrap_or(1.);
            let mask_id = id();
            let end = center + width / 2.;
            let mask = json!({"id":mask_id,"type":"split","combineMode":"intersect","params":{
                "centerX":end,"centerY":0,"rotation":180,"feather":0,"inverted":false,
                "strokeColor":"#ffffff","strokeWidth":0,"strokeAlign":"center"}});
            if !clip["masks"].is_array() {
                clip["masks"] = json!([]);
            }
            clip["masks"].as_array_mut().unwrap().push(mask);
            if !clip["animations"].is_object() {
                clip["animations"] = json!({});
            }
            let mut first = key(0, center - width / 2.);
            first["segmentToNext"] = json!("linear");
            clip["animations"][format!("masks.{mask_id}.params.centerX")] =
                json!({"keys":[first,key(time,end)]});
            warnings.push(format!(
                "authored_wipe_entrance:{}:left_to_right",
                entrance.layout_id
            ));
        }
        TransitionKind::Cut => {}
        _ => warnings.push(format!(
            "unsupported_source_transition:{}:{:?}",
            entrance.layout_id, entrance.effect
        )),
    }
}

/// Partition the selected unretimed source at semantic layout changes, retaining measured source time.
pub fn compile(
    source: &Value,
    focus: Option<&visual_compile::FocalPoint>,
    asset: &Value,
    template: &Template,
    plan: &EditPlan,
    offset: f64,
    visuals: &BTreeMap<String, visual_compile::Asset>,
    warnings: &mut Vec<String>,
) -> Result<SourceLayout> {
    ensure!(
        source["type"] == "video",
        "layout source must be a video clip"
    );
    ensure!(source["hidden"] != true, "layout source is hidden");
    ensure!(
        ["audioFadeIn", "audioFadeOut"]
            .iter()
            .all(|key| source["params"][key].as_f64().unwrap_or(0.) == 0.),
        "source has audio fades; resolve the envelope before partitioning layouts"
    );
    for field in [
        "animations",
        "effects",
        "masks",
        "retime",
        "compound",
        "motionTracking",
        "stabilization",
        "transitionIn",
    ] {
        let value = &source[field];
        ensure!(
            value.is_null()
                || value.as_object().is_some_and(|v| v.is_empty())
                || value.as_array().is_some_and(|v| v.is_empty()),
            "source has {field}; resolve existing treatment before applying layouts"
        );
    }
    let start = source["startTime"]
        .as_i64()
        .context("source start time required")?;
    let duration = source["duration"]
        .as_i64()
        .context("source duration required")?;
    ensure!(
        start == ticks(offset) && duration == ticks(plan.duration_seconds),
        "selected clip must exactly cover the requested plan interval"
    );
    let trim = source["trimStart"].as_i64().unwrap_or(0);
    let end_trim = source["trimEnd"].as_i64().unwrap_or(0);
    let media_duration = asset["duration"]
        .as_f64()
        .context("source media duration required")?;
    ensure!(
        media_duration.is_finite()
            && trim >= 0
            && end_trim >= 0
            && trim + duration <= ticks(media_duration) + 1,
        "layout source exceeds media duration"
    );
    let sw = asset["width"].as_f64().context("source width required")?;
    let sh = asset["height"].as_f64().context("source height required")?;
    ensure!(
        sw.is_finite()
            && sh.is_finite()
            && (1.0..=32768.).contains(&sw)
            && (1.0..=32768.).contains(&sh),
        "invalid source dimensions"
    );
    let w = template.canvas.width as f64;
    let h = template.canvas.height as f64;
    let contain = (w / sw).min(h / sh);
    let mut changes: Vec<(i64, &Layout)> = vec![];
    for p in &plan.layouts {
        let layout = template
            .layouts
            .iter()
            .find(|l| l.id == p.layout_id)
            .context("missing layout")?;
        let time = if changes.is_empty() {
            0
        } else {
            ticks(p.start)
        };
        if changes
            .last()
            .is_none_or(|(_, previous)| previous.id != layout.id)
        {
            changes.push((time, layout));
        }
    }
    ensure!(!changes.is_empty(), "no source layouts");
    let mut replacements = vec![];
    let mut overlays = vec![];
    let mut secondary_origins = BTreeMap::new();
    // Layouts partition pictures, not the spoken performance. One audio interval
    // preserves decoder/mixer boundaries and the original processing state.
    let audio = if source["isSourceAudioEnabled"] != false && asset["hasAudio"] != false {
        let mut params = source["params"].clone();
        if !params.is_object() {
            params = json!({});
        }
        params["template.sourceElementId"] = source["id"].clone();
        params["template.instanceId"] = json!("layout-source-audio");
        Some(
            json!({"id":id(),"type":"audio","sourceType":"upload","mediaId":source["mediaId"],
            "name":format!("{} / original audio",source["name"].as_str().unwrap_or("Video")),
            "startTime":start,"duration":duration,"trimStart":trim,"trimEnd":end_trim,
            "params":params}),
        )
    } else {
        None
    };
    for (i, (local_start, layout)) in changes.iter().enumerate() {
        let local_end = changes.get(i + 1).map(|p| p.0).unwrap_or(duration);
        ensure!(
            local_end > *local_start && local_end <= duration,
            "invalid layout interval"
        );
        ensure!(
            !matches!(layout.mode, LayoutMode::Split) || layout.secondary.is_some(),
            "split layout requires a second source binding"
        );
        if let Some(secondary) = &layout.secondary {
            let secondary_asset = visuals
                .get(&secondary.resource_id)
                .context("layout secondary resource must be bound to project media")?;
            let first_start = *secondary_origins
                .entry(secondary.resource_id.clone())
                .or_insert(*local_start);
            let placed = PlacedElement {
                instance_id: format!("layout-{i}-{}-secondary", layout.id),
                element_id: format!("layout-{}-secondary", layout.id),
                features: Features {
                    role: Some(Role::SupportingVisual),
                    representation: Representation::VisualMedia,
                    media_use: Some(MediaUse::Broll),
                    outline: false,
                    accent: false,
                    placement: Placement::Fixed,
                    avoid_protected_regions: false,
                },
                content: String::new(),
                ellipse_arc: None,
                star_geometry: None,
                rectangle_geometry: None,
                keyword_range: None,
                layout_ranges: vec![],
                word_ranges: vec![],
                start: *local_start as f64 / TICKS as f64,
                end: local_end as f64 / TICKS as f64,
                region: secondary.region.clone(),
                style_id: None,
                resource_id: Some(secondary.resource_id.clone()),
                motions: vec![],
                z: 0,
            };
            let mut secondary_clip = visual_compile::compile_at(
                &placed,
                template,
                secondary_asset,
                offset,
                (*local_start - first_start) as f64 / TICKS as f64,
                warnings,
            )?;
            secondary_clip["params"]["template.layoutId"] = json!(layout.id);
            if i > 0 {
                transition(
                    &mut secondary_clip,
                    template
                        .layout_entrances
                        .iter()
                        .find(|e| e.layout_id == layout.id),
                    local_end - local_start,
                    secondary.region.width * w,
                    warnings,
                );
            }
            overlays.push(secondary_clip);
        }
        let mut clip = source.clone();
        clip["id"] = json!(id());
        clip["name"] = json!(format!(
            "{} / {}",
            source["name"].as_str().unwrap_or("Video"),
            layout.id
        ));
        clip["startTime"] = json!(start + local_start);
        clip["duration"] = json!(local_end - local_start);
        clip["trimStart"] = json!(trim + local_start);
        clip["trimEnd"] = json!(end_trim + duration - local_end);
        if !clip["params"].is_object() {
            clip["params"] = json!({});
        }
        clip["isSourceAudioEnabled"] = json!(false);
        clip["params"]["muted"] = json!(true);
        clip["params"]["template.sourceElementId"] = source["id"].clone();
        clip["params"]["template.layoutId"] = json!(layout.id);
        let r = &layout.video_region;
        let mut rw = r.width * w;
        let mut rh = r.height * h;
        if matches!(layout.mode, LayoutMode::CircleInset) {
            rw = rw.min(rh);
            rh = rw;
        }
        let blurred = matches!(layout.mode, LayoutMode::BlurredFill);
        let zoom = if matches!(layout.mode, LayoutMode::PunchIn) {
            1.12
        } else {
            1.
        };
        let source_scale = if blurred {
            (rw / sw).min(rh / sh)
        } else {
            (rw / sw).max(rh / sh) * zoom
        };
        let scale = source_scale / contain;
        let x = (r.x + r.width / 2. - 0.5) * w;
        let y = (r.y + r.height / 2. - 0.5) * h;
        let (dx, dy) =
            visual_compile::focal_shift(focus, sw * source_scale, sh * source_scale, rw, rh)?;
        let (x, y) = (x + dx, y + dy);
        let params = &mut clip["params"];
        params["transform.positionX"] = json!(x);
        params["transform.positionY"] = json!(y);
        params["transform.scaleX"] = json!(scale);
        params["transform.scaleY"] = json!(scale);
        params["transform.rotate"] = json!(0);
        for side in ["left", "right", "top", "bottom"] {
            params[format!("crop.{side}")] = json!(0);
        }
        params["geometry.mirrorX"] = json!(false);
        params["geometry.mirrorY"] = json!(false);
        if !blurred {
            clip["masks"] = json!([{"id":id(),"type":if matches!(layout.mode,LayoutMode::CircleInset) {"ellipse"} else {"rectangle"},
                "params":{"centerX":-dx/(sw*source_scale),"centerY":-dy/(sh*source_scale),"width":rw/(sw*source_scale),"height":rh/(sh*source_scale),
                    "rotation":0,"scale":1,"feather":0,"inverted":false,"strokeColor":"#ffffff","strokeWidth":0,"strokeAlign":"inside"}}]);
        }
        if i > 0 {
            transition(
                &mut clip,
                template
                    .layout_entrances
                    .iter()
                    .find(|e| e.layout_id == layout.id),
                local_end - local_start,
                rw,
                warnings,
            );
        }
        if matches!(layout.mode, LayoutMode::PunchIn) {
            warnings.push(format!("authored_default_punch_in:{}:1.12", layout.id));
        }
        if blurred {
            let mut bg = clip.clone();
            bg["id"] = json!(id());
            bg["name"] = json!(format!("{} / blurred fill", layout.id));
            bg["params"]["transform.scaleX"] = json!((w / sw).max(h / sh) / contain);
            bg["params"]["transform.scaleY"] = bg["params"]["transform.scaleX"].clone();
            bg["params"]["transform.positionX"] = json!(0);
            bg["params"]["transform.positionY"] = json!(0);
            bg.as_object_mut().unwrap().remove("animations");
            bg["effects"] =
                json!([{"id":id(),"type":"blur","enabled":true,"params":{"intensity":85}}]);
            bg["params"]["opacity"] = json!(0.65);
            warnings.push(format!(
                "authored_default_blurred_fill:{}:85:0.65",
                layout.id
            ));
            clip["isSourceAudioEnabled"] = json!(false);
            clip["params"]["muted"] = json!(true);
            overlays.push(clip);
            replacements.push(bg);
        } else {
            replacements.push(clip);
        }
    }
    Ok(SourceLayout {
        replacements,
        overlays,
        audio,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wipe_intersects_focused_crop_and_blur_preserves_source_time() {
        let mut entrance = LayoutEntrance {
            layout_id: "layout-0".into(),
            effect: TransitionKind::Wipe,
            duration_seconds: 1.,
        };
        let clip = json!({"startTime":ticks(2.),"duration":ticks(0.6),"trimStart":ticks(3.),"trimEnd":ticks(1.),
            "params":{"transform.positionX":100,"transform.scaleX":2},
            "masks":[{"id":"crop","type":"ellipse","params":{"centerX":-0.1,"width":0.4}}]});
        let mut warnings = vec![];
        let mut wipe = clip.clone();
        transition(&mut wipe, Some(&entrance), ticks(0.6), 400., &mut warnings);
        assert_eq!(wipe["masks"][0], clip["masks"][0]);
        assert_eq!(wipe["masks"][1]["combineMode"], "intersect");
        let mask_id = wipe["masks"][1]["id"].as_str().unwrap();
        let keys = &wipe["animations"][format!("masks.{mask_id}.params.centerX")]["keys"];
        assert!((keys[0]["value"].as_f64().unwrap() + 0.3).abs() < 1e-9);
        assert_eq!(keys[0]["segmentToNext"], "linear");
        assert_eq!(keys[1]["time"], ticks(0.3));
        assert!((keys[1]["value"].as_f64().unwrap() - 0.1).abs() < 1e-9);
        entrance.effect = TransitionKind::Blur;
        let mut blur = clip.clone();
        transition(&mut blur, Some(&entrance), ticks(0.6), 400., &mut warnings);
        let effect_id = blur["effects"][0]["id"].as_str().unwrap();
        let keys = &blur["animations"][format!("effects.{effect_id}.params.intensity")]["keys"];
        assert_eq!(keys[0]["value"], 85.);
        assert_eq!(keys[1]["value"], 0.);
        assert_eq!(keys[1]["time"], ticks(0.3));
        for transformed in [&wipe, &blur] {
            for field in ["startTime", "duration", "trimStart", "trimEnd", "params"] {
                assert_eq!(transformed[field], clip[field]);
            }
        }
        entrance.duration_seconds = 0.;
        let mut still = clip.clone();
        transition(&mut still, Some(&entrance), ticks(0.6), 400., &mut warnings);
        assert_eq!(still, clip);
    }
}
