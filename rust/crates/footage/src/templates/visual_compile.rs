use super::{compiler, model::*, rhythm::PlacedElement};
use crate::domain::{TICKS, id};
use anyhow::{Context, Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashSet};

#[derive(Clone, Default, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Fit {
    #[default]
    Contain,
    Cover,
}

#[derive(Clone, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct FocalPoint {
    pub x: f64,
    pub y: f64,
}

pub fn focal_shift(
    focus: Option<&FocalPoint>,
    sw: f64,
    sh: f64,
    rw: f64,
    rh: f64,
) -> Result<(f64, f64)> {
    let Some(focus) = focus else {
        return Ok((0., 0.));
    };
    ensure!(
        (0.0..=1.).contains(&focus.x) && (0.0..=1.).contains(&focus.y),
        "focal point must be normalized to [0, 1]"
    );
    let shift = |f: f64, source: f64, region: f64| {
        let overflow = ((source - region) / 2.).max(0.);
        ((0.5 - f) * source).clamp(-overflow, overflow)
    };
    Ok((shift(focus.x, sw, rw), shift(focus.y, sh, rh)))
}

#[cfg(test)]
mod framing_tests {
    use super::*;

    #[test]
    fn framing_clamps_to_coverage_and_preserves_contain() {
        let focus = FocalPoint { x: 0., y: 0.25 };
        assert_eq!(
            focal_shift(Some(&focus), 1080., 1920., 1080., 960.).unwrap(),
            (0., 480.)
        );
        assert_eq!(
            focal_shift(Some(&focus), 1920., 1080., 960., 1080.).unwrap(),
            (480., 0.)
        );
        assert_eq!(
            focal_shift(Some(&focus), 540., 960., 1080., 960.).unwrap(),
            (0., 0.)
        );
        assert_eq!(
            focal_shift(None, 1080., 1920., 1080., 960.).unwrap(),
            (0., 0.)
        );
        for x in [-0.1, 1.1, f64::NAN, f64::INFINITY] {
            assert!(focal_shift(Some(&FocalPoint { x, y: 0.5 }), 1., 1., 1., 1.).is_err());
        }
    }
}

#[derive(Clone, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Binding {
    pub resource_id: String,
    pub media_id: String,
    #[serde(default)]
    pub source_start_seconds: f64,
    #[serde(default)]
    pub fit: Fit,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub focal_point: Option<FocalPoint>,
}

#[derive(Serialize)]
pub struct Asset {
    binding: Binding,
    kind: String,
    width: f64,
    height: f64,
    duration: Option<f64>,
    identity: Value,
}

/// Application bindings fill resource slots without changing the saved template.
pub fn resolve(
    template: &mut Template,
    bindings: &[Binding],
    media: &Value,
) -> Result<BTreeMap<String, Asset>> {
    let mut seen = HashSet::new();
    for binding in bindings {
        ensure!(
            seen.insert(&binding.resource_id),
            "duplicate visual resource binding"
        );
        let resource = template
            .resource_slots
            .iter()
            .find(|r| r.id == binding.resource_id)
            .context("unknown visual resource slot")?;
        ensure!(
            resource.representation.is_visual_asset(),
            "resource does not accept visual media"
        );
        ensure!(valid_id(&binding.media_id), "invalid visual media ID");
        template.bind(&binding.resource_id, &binding.media_id);
    }
    // Resolve against the real catalog before the planner's binding-only fallback.
    let original = template.clone();
    for requirement in &original.composition.resource_requirements {
        let slot = original
            .resource_slots
            .iter()
            .find(|s| s.id == requirement.slot_id)
            .unwrap();
        if !slot.representation.is_visual_asset()
            || original
                .resource_bindings
                .iter()
                .any(|b| b.slot_id == slot.id && !b.enabled)
        {
            continue;
        }
        let candidates = std::iter::once(&slot.id).chain(requirement.fallback_slot_ids.iter());
        let mut reasons = vec![];
        let chosen = candidates
            .filter_map(|id| original.asset_id(id).map(|asset| (id, asset)))
            .find(|(id, asset_id)| {
                let asset = &media[*asset_id];
                let binding = bindings.iter().find(|b| b.resource_id == **id);
                let start = binding.map(|b| b.source_start_seconds).unwrap_or(0.);
                let kind = asset["type"].as_str().unwrap_or("");
                let check = original.composition.resource_check(
                    &slot.id,
                    asset,
                    binding.is_some_and(|b| matches!(b.fit, Fit::Cover)),
                    start,
                );
                if let Err(error) = &check {
                    reasons.push(format!("{asset_id}: {error}"));
                }
                let type_ok = kind == "image"
                    && matches!(
                        slot.representation,
                        Representation::Image | Representation::VisualMedia
                    )
                    || kind == "video"
                        && matches!(
                            slot.representation,
                            Representation::Video | Representation::VisualMedia
                        );
                asset["id"] == *asset_id
                    && type_ok
                    && start.is_finite()
                    && start >= 0.
                    && ["width", "height"].iter().all(|k| {
                        asset[k]
                            .as_f64()
                            .is_some_and(|n| (1.0..=32768.).contains(&n))
                    })
                    && (kind != "video" || asset["duration"].as_f64().is_some_and(|d| d > start))
                    && (kind != "image" || start == 0.)
                    && check.is_ok()
            });
        if let Some((_, asset)) = chosen {
            template.bind(&slot.id, asset);
        } else {
            ensure!(
                !requirement.required,
                "no eligible resource or fallback: {}: {}",
                slot.id,
                reasons.join("; ")
            );
            template.resource_bindings.retain(|b| b.slot_id != slot.id);
            template.resource_bindings.push(ResourceBinding {
                slot_id: slot.id.clone(),
                asset_id: "unavailable".into(),
                enabled: false,
            });
        }
    }
    template.composition.clone().resolve_resources(template)?;
    let mut output = BTreeMap::new();
    for resource in &template.resource_slots {
        if !resource.representation.is_visual_asset() {
            continue;
        }
        if !template
            .elements
            .iter()
            .any(|e| e.resource_id.as_deref() == Some(&resource.id))
            && !template.layouts.iter().any(|l| {
                l.secondary
                    .as_ref()
                    .is_some_and(|s| s.resource_id == resource.id)
            })
            && !template
                .composition
                .resource_requirements
                .iter()
                .any(|r| r.slot_id == resource.id && r.required)
        {
            continue;
        }
        let Some(media_id) = template.asset_id(&resource.id) else {
            continue;
        };
        let binding = bindings
            .iter()
            .find(|b| b.resource_id == resource.id && b.media_id == media_id)
            .or_else(|| {
                template
                    .composition
                    .resource_requirements
                    .iter()
                    .find(|r| r.slot_id == resource.id)
                    .and_then(|r| {
                        r.fallback_slot_ids.iter().find_map(|id| {
                            bindings
                                .iter()
                                .find(|b| &b.resource_id == id && b.media_id == media_id)
                        })
                    })
            })
            .cloned()
            .unwrap_or(Binding {
                resource_id: resource.id.clone(),
                media_id: media_id.into(),
                source_start_seconds: 0.,
                fit: Fit::Contain,
                focal_point: None,
            });
        let binding = Binding {
            resource_id: resource.id.clone(),
            ..binding
        };
        ensure!(
            binding.source_start_seconds.is_finite() && binding.source_start_seconds >= 0.,
            "invalid visual source start"
        );
        focal_shift(binding.focal_point.as_ref(), 1., 1., 1., 1.)?;
        let asset = &media[media_id];
        template.composition.resource_check(
            &resource.id,
            asset,
            matches!(binding.fit, Fit::Cover),
            binding.source_start_seconds,
        )?;
        ensure!(
            asset.is_object() && asset["id"] == media_id,
            "visual resource must reference the project's media catalog: {}",
            resource.id
        );
        let kind = asset["type"]
            .as_str()
            .context("visual media type required")?;
        ensure!(
            kind == "image" || kind == "video",
            "visual resource requires image or video"
        );
        ensure!(
            resource.representation == Representation::VisualMedia
                || (resource.representation == Representation::Image && kind == "image")
                || (resource.representation == Representation::Video && kind == "video"),
            "asset media type does not match the resource slot"
        );
        let width = asset["width"]
            .as_f64()
            .context("visual media width required")?;
        let height = asset["height"]
            .as_f64()
            .context("visual media height required")?;
        ensure!(
            (1.0..=32768.).contains(&width) && (1.0..=32768.).contains(&height),
            "invalid visual media dimensions"
        );
        let duration = if kind == "video" {
            let d = asset["duration"]
                .as_f64()
                .context("visual video duration required")?;
            ensure!(
                d.is_finite() && d > binding.source_start_seconds,
                "visual source start exceeds video duration"
            );
            Some(d)
        } else {
            ensure!(
                binding.source_start_seconds == 0.,
                "still image cannot have a source start"
            );
            None
        };
        output.insert(resource.id.clone(), Asset {
            binding, kind: kind.into(), width, height, duration,
            identity: json!({"id":asset["id"],"size":asset["size"],"lastModified":asset["lastModified"],"storageId":asset["storageId"]}),
        });
    }
    Ok(output)
}

pub fn compile(
    e: &PlacedElement,
    template: &Template,
    asset: &Asset,
    offset: f64,
    warnings: &mut Vec<String>,
) -> Result<Value> {
    compile_at(e, template, asset, offset, 0., warnings)
}

pub fn compile_at(
    e: &PlacedElement,
    template: &Template,
    asset: &Asset,
    offset: f64,
    source_elapsed_seconds: f64,
    warnings: &mut Vec<String>,
) -> Result<Value> {
    ensure!(
        e.features.representation == Representation::VisualMedia
            || (e.features.representation == Representation::Image && asset.kind == "image")
            || (e.features.representation == Representation::Video && asset.kind == "video"),
        "asset media type does not match the element representation"
    );
    ensure!(
        source_elapsed_seconds.is_finite() && source_elapsed_seconds >= 0.,
        "invalid secondary source elapsed time"
    );
    let ticks = |s: f64| (s * TICKS as f64).round() as i64;
    let duration = ticks(e.end) - ticks(e.start);
    let trim = if asset.kind == "video" {
        ticks(asset.binding.source_start_seconds + source_elapsed_seconds)
    } else {
        0
    };
    let end_trim = if let Some(total) = asset.duration {
        ensure!(
            trim + duration <= ticks(total),
            "visual resource {} is shorter than its placement; select a longer source or shorter element",
            asset.binding.resource_id
        );
        ticks(total) - trim - duration
    } else {
        0
    };
    let w = template.canvas.width as f64;
    let h = template.canvas.height as f64;
    let rw = e.region.width * w;
    let rh = e.region.height * h;
    let x = (e.region.x + e.region.width / 2. - 0.5) * w;
    let y = (e.region.y + e.region.height / 2. - 0.5) * h;
    let source_scale = match asset.binding.fit {
        Fit::Contain => (rw / asset.width).min(rh / asset.height),
        Fit::Cover => (rw / asset.width).max(rh / asset.height),
    };
    let scale = source_scale / (w / asset.width).min(h / asset.height);
    let (dx, dy) = focal_shift(
        asset.binding.focal_point.as_ref(),
        asset.width * source_scale,
        asset.height * source_scale,
        rw,
        rh,
    )?;
    let (x, y) = (x + dx, y + dy);
    let mut params = json!({"transform.positionX":x,"transform.positionY":y,
        "transform.scaleX":scale,"transform.scaleY":scale,"transform.rotate":0,"opacity":1,
        "template.instanceId":e.instance_id,"template.elementId":e.element_id,
        "template.resourceId":asset.binding.resource_id,"volume":0,"muted":true});
    if let Some(shadow) = e
        .style_id
        .as_ref()
        .and_then(|id| template.styles.iter().find(|s| &s.id == id))
        .and_then(|s| s.shadow.as_ref())
    {
        params["geometry.shadow.enabled"] = json!(true);
        params["geometry.shadow.color"] = json!(format!(
            "{}{:02x}",
            shadow.color,
            (shadow.opacity * 255.).round() as u8
        ));
        params["geometry.shadow.blur"] = json!(shadow.blur);
        params["geometry.shadow.offsetX"] = json!(shadow.x);
        params["geometry.shadow.offsetY"] = json!(shadow.y);
    }
    let mut element = json!({"id":id(),"type":asset.kind,"mediaId":asset.binding.media_id,
        "name":format!("{} / {}",template.name,e.instance_id),"startTime":ticks(offset+e.start),
        "duration":duration,"trimStart":trim,"trimEnd":end_trim,"hidden":false,"params":params,
        "animations":compiler::animations(e,x,y,scale,scale,warnings)});
    if asset.kind == "video" {
        element["isSourceAudioEnabled"] = json!(false);
    }
    if matches!(asset.binding.fit, Fit::Cover) {
        element["masks"] = json!([{"id":id(),"type":"rectangle","params":{
            "centerX":-dx/(asset.width*source_scale),"centerY":-dy/(asset.height*source_scale),"width":rw/(asset.width*source_scale),"height":rh/(asset.height*source_scale),
            "rotation":0,"scale":1,"feather":0,"inverted":false,"strokeColor":"#ffffff","strokeWidth":0,"strokeAlign":"inside"}}]);
    }
    Ok(element)
}
