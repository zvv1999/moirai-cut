//! Application-level rigid transforms preserve the complete local animation tree.
use super::model::{Canvas, Rect, Representation, Template, valid_id};
use anyhow::{Context, Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashSet;

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RigidTransform {
    pub id: String,
    /// Complete, disjoint sets of visual elements. Existing composite groups cannot be split.
    pub element_ids: Vec<String>,
    /// Output-canvas fractions. Rotation itself is computed in pixel coordinates.
    pub pivot_x: f64,
    pub pivot_y: f64,
    /// Clockwise static rotation, -180..180 degrees. Applied after local animation.
    pub rotation_degrees: f64,
}

pub fn validate(template: &Template) -> Result<()> {
    let mut ids = HashSet::new();
    let mut owned = HashSet::new();
    ensure!(
        template.composition.rigid_transforms.len() <= 200,
        "too many rigid transforms"
    );
    for transform in &template.composition.rigid_transforms {
        ensure!(
            valid_id(&transform.id) && ids.insert(&transform.id),
            "invalid or duplicate rigid transform ID"
        );
        ensure!(
            [transform.pivot_x, transform.pivot_y]
                .iter()
                .all(|value| value.is_finite() && (0.0..=1.0).contains(value)),
            "invalid rigid transform pivot"
        );
        ensure!(
            transform.rotation_degrees.is_finite()
                && (-180.0..=180.0).contains(&transform.rotation_degrees),
            "rigid rotation must be between -180 and 180 degrees"
        );
        let members: HashSet<_> = transform.element_ids.iter().collect();
        ensure!(
            !members.is_empty()
                && members.len() == transform.element_ids.len()
                && members.iter().all(|id| owned.insert(*id)
                    && template.elements.iter().any(|element| &element.id == *id
                        && element.features.representation != Representation::Audio)),
            "rigid transforms require disjoint visual members"
        );
        for group in template
            .composition
            .groups
            .iter()
            .filter(|group| group.composite)
        {
            let count = group
                .element_ids
                .iter()
                .filter(|id| members.contains(id))
                .count();
            ensure!(
                count == 0 || count == group.element_ids.len(),
                "rigid transform cannot split an existing composite group"
            );
        }
        for relation in &template.composition.spatial_relations {
            ensure!(
                members.contains(&relation.element_id) == members.contains(&relation.relative_to),
                "rigid transform does not support attachments across its boundary"
            );
        }
    }
    Ok(())
}

/// Relative-to-canvas-center translation required by the renderer's group pivot.
fn compensation(transform: &RigidTransform, canvas: &Canvas) -> (f64, f64) {
    let px = (transform.pivot_x - 0.5) * canvas.width as f64;
    let py = (transform.pivot_y - 0.5) * canvas.height as f64;
    let (sin, cos) = transform.rotation_degrees.to_radians().sin_cos();
    (px - (cos * px - sin * py), py - (sin * px + cos * py))
}

pub fn rotate_bounds(region: &Rect, transform: &RigidTransform, canvas: &Canvas) -> Rect {
    let (sin, cos) = transform.rotation_degrees.to_radians().sin_cos();
    let width = canvas.width as f64;
    let height = canvas.height as f64;
    let px = transform.pivot_x * width;
    let py = transform.pivot_y * height;
    let mut left = f64::INFINITY;
    let mut top = f64::INFINITY;
    let mut right = f64::NEG_INFINITY;
    let mut bottom = f64::NEG_INFINITY;
    for x in [region.x, region.x + region.width] {
        for y in [region.y, region.y + region.height] {
            let dx = x * width - px;
            let dy = y * height - py;
            let rx = (px + cos * dx - sin * dy) / width;
            let ry = (py + sin * dx + cos * dy) / height;
            left = left.min(rx);
            right = right.max(rx);
            top = top.min(ry);
            bottom = bottom.max(ry);
        }
    }
    Rect {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
    }
}

/// A single Application owns all of its visual members and at most one rotation.
pub fn application_bounds(template: &Template, authored: &Rect) -> Rect {
    template.composition.rigid_transforms.first().map_or_else(
        || authored.clone(),
        |transform| rotate_bounds(authored, transform, &template.canvas),
    )
}

fn leaf_ids<'a>(clip: &'a Value, ids: &mut Vec<&'a str>) {
    if let Some(tracks) = clip["renderGroup"]["tracks"].as_array() {
        for track in tracks {
            for child in track["elements"].as_array().into_iter().flatten() {
                leaf_ids(child, ids);
            }
        }
    } else if let Some(id) = clip["params"]["template.elementId"].as_str() {
        ids.push(id);
    }
}

pub fn pack(tracks: &mut Vec<Value>, template: &Template) -> Result<()> {
    for transform in &template.composition.rigid_transforms {
        if transform.rotation_degrees == 0. {
            continue;
        }
        let members: HashSet<_> = transform.element_ids.iter().map(String::as_str).collect();
        let mut children = vec![];
        let mut insertion = tracks.len();
        let mut selected_indices = vec![];
        for (index, track) in tracks.iter_mut().enumerate() {
            let mut selected = vec![];
            let mut retained = vec![];
            for clip in track["elements"]
                .as_array()
                .context("rigid transform track requires elements")?
            {
                let mut leaves = vec![];
                leaf_ids(clip, &mut leaves);
                let count = leaves.iter().filter(|id| members.contains(*id)).count();
                ensure!(
                    count == 0 || count == leaves.len(),
                    "rigid transform cannot split a compiled group"
                );
                if count > 0 {
                    selected.push(clip.clone());
                } else {
                    retained.push(clip.clone());
                }
            }
            if !selected.is_empty() {
                // Extracting part of a lane could reorder unrelated elements at shared times.
                ensure!(
                    retained.is_empty(),
                    "rigid transform does not support mixed visual lanes"
                );
                insertion = insertion.min(index);
                selected_indices.push(index);
                let mut child_track = track.clone();
                child_track["elements"] = json!(selected);
                children.push(child_track);
                track["elements"] = json!([]);
            }
        }
        // Keyword-negative fixtures legitimately contain no matching visual instances.
        if children.is_empty() {
            continue;
        }
        let last = *selected_indices.last().unwrap();
        ensure!(
            tracks[insertion..=last]
                .iter()
                .all(|track| track["elements"].as_array().is_some_and(Vec::is_empty)),
            "rigid transform does not support interleaved external visual layers"
        );
        let clips: Vec<_> = children
            .iter()
            .flat_map(|track| track["elements"].as_array().unwrap())
            .collect();
        let start = clips
            .iter()
            .map(|clip| clip["startTime"].as_i64().unwrap())
            .min()
            .unwrap();
        let end = clips
            .iter()
            .map(|clip| clip["startTime"].as_i64().unwrap() + clip["duration"].as_i64().unwrap())
            .max()
            .unwrap();
        let (x, y) = compensation(transform, &template.canvas);
        let controller = json!({"id":crate::domain::id(),"type":"graphic","definitionId":"rectangle","name":transform.id,
            "startTime":start,"duration":end-start,"trimStart":0,"trimEnd":0,"hidden":false,
            "params":{"fill":"#00000000","transform.positionX":x,"transform.positionY":y,"transform.scaleX":1,"transform.scaleY":1,"transform.rotate":transform.rotation_degrees,"opacity":1,"template.rigidTransformId":transform.id},
            "renderGroup":{"tracks":children,"timeOrigin":start},"animations":{}});
        tracks.insert(insertion,json!({"id":crate::domain::id(),"name":transform.id,"type":"graphic","hidden":false,"elements":[controller]}));
        tracks.retain(|track| !track["elements"].as_array().unwrap().is_empty());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::templates::{compiler, composition::SpatialRelation, composition_tests};
    fn transform(angle: f64) -> RigidTransform {
        RigidTransform {
            id: "turn".into(),
            element_ids: vec!["caption".into()],
            pivot_x: 0.3,
            pivot_y: 0.65,
            rotation_degrees: angle,
        }
    }
    fn close(a: f64, b: f64) {
        assert!((a - b).abs() < 1e-8, "{a} != {b}");
    }

    #[test]
    fn quarter_turns_keep_pixel_geometry_and_application_pivot_on_both_aspects() {
        for (width, height) in [(1280, 720), (720, 1280)] {
            let canvas = Canvas {
                width,
                height,
                fps: 30,
            };
            for angle in [90., -90.] {
                let rotation = transform(angle);
                let rect = Rect {
                    x: 0.25,
                    y: 0.6,
                    width: 0.1,
                    height: 0.1,
                };
                let bounds = rotate_bounds(&rect, &rotation, &canvas);
                close(bounds.x + bounds.width / 2., rotation.pivot_x);
                close(bounds.y + bounds.height / 2., rotation.pivot_y);
                close(bounds.width * width as f64, rect.height * height as f64);
                close(bounds.height * height as f64, rect.width * width as f64);
                let (x, y) = compensation(&rotation, &canvas);
                let px = (rotation.pivot_x - 0.5) * width as f64;
                let py = (rotation.pivot_y - 0.5) * height as f64;
                let (sin, cos) = angle.to_radians().sin_cos();
                close(cos * px - sin * py + x, px);
                close(sin * px + cos * py + y, py);
                // A local rightward vector becomes down for +90, up for -90.
                close(cos * 20., 0.);
                close(sin * 20., if angle > 0. { 20. } else { -20. });
            }
        }
    }

    #[test]
    fn wrapping_keeps_existing_group_motion_and_children_byte_for_byte() {
        let mut template: Template =
            serde_json::from_value(composition_tests::input()["template"].clone()).unwrap();
        template.composition.rigid_transforms = vec![transform(90.)];
        let child = json!({"id":"child","type":"text","startTime":40,"duration":60,"params":{"template.elementId":"caption"},"animations":{"transform.positionX":{"keys":[{"time":0,"value":12},{"time":60,"value":40}]}}});
        let group = json!({"id":"existing","type":"graphic","startTime":30,"duration":90,"trimStart":0,"params":{"template.groupId":"old"},"renderGroup":{"tracks":[{"id":"children","elements":[child]}],"timeOrigin":30},"animations":{"transform.positionX":{"keys":[{"time":0,"value":10},{"time":90,"value":50}]},"opacity":{"keys":[{"time":0,"value":0.2},{"time":90,"value":0.8}]}}});
        let original = vec![json!({"id":"old-track","elements":[group]})];
        let mut tracks = original.clone();
        pack(&mut tracks, &template).unwrap();
        let wrapper = &tracks[0]["elements"][0];
        assert_eq!(wrapper["renderGroup"]["tracks"], json!(original));
        assert_eq!(wrapper["startTime"], 30);
        assert_eq!(wrapper["duration"], 90);
        assert_eq!(wrapper["renderGroup"]["timeOrigin"], 30);
        assert_eq!(wrapper["params"]["transform.rotate"], 90.);
        assert_eq!(wrapper["animations"], json!({}));
        let mut empty = vec![];
        pack(&mut empty, &template).unwrap();
        assert!(empty.is_empty());
    }

    #[test]
    fn compiled_text_attachment_identity_includes_rotation_wrapper() {
        let mut value = composition_tests::input();
        let mut child = value["template"]["elements"][0].clone();
        child["id"] = json!("child");
        child["region"] = json!({"x":0.1,"y":0.1,"width":0.1,"height":0.1});
        value["template"]["elements"]
            .as_array_mut()
            .unwrap()
            .push(child);
        value["template"]["composition"] = json!({
            "rigidTransforms":[{"id":"turn","elementIds":["caption","child"],"pivotX":0.3,"pivotY":0.65,"rotationDegrees":-90}],
            "spatialRelations":[{"elementId":"child","relativeTo":"caption","placement":"overlay","gap":0.,"offsetX":0.,"offsetY":0.,"followMotion":true,"referenceBounds":"text_box"}]});
        let source = json!({"id":"untouched-source","type":"video","startTime":0,"duration":240000,"params":{"transform.rotate":17}});
        let audio = json!({"id":"untouched-audio","type":"audio","startTime":0,"duration":240000,"params":{"volume":0.8}});
        let mut request = composition_tests::request(value);
        request.document["scenes"][0]["tracks"]["main"]["elements"] = json!([source]);
        request.document["scenes"][0]["tracks"]["audio"] =
            json!([{"id":"original-audio","type":"audio","elements":[audio]}]);
        let result = compiler::compile(request).unwrap();
        let wrapper = &result["document"]["scenes"][0]["tracks"]["overlay"][0]["elements"][0];
        let children: Vec<_> = wrapper["renderGroup"]["tracks"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|track| track["elements"].as_array().unwrap())
            .collect();
        let bound: Vec<_> = children
            .iter()
            .filter(|clip| clip["params"]["template.elementId"] == "child")
            .collect();
        assert!(!bound.is_empty());
        for clip in bound {
            assert_eq!(
                clip["textAttachment"]["parent"]["groupPath"],
                json!([wrapper["id"]])
            );
            assert!(
                children
                    .iter()
                    .any(|parent| parent["id"] == clip["textAttachment"]["parent"]["elementId"])
            );
        }
        assert_eq!(
            result["document"]["scenes"][0]["tracks"]["main"]["elements"],
            json!([source])
        );
        assert_eq!(
            result["document"]["scenes"][0]["tracks"]["audio"][0]["elements"],
            json!([audio])
        );
    }

    #[test]
    fn crossing_relationships_and_split_composite_groups_are_explicitly_rejected() {
        let mut template: Template =
            serde_json::from_value(composition_tests::input()["template"].clone()).unwrap();
        let mut child = template.elements[0].clone();
        child.id = "outside".into();
        template.elements.push(child);
        template.composition.rigid_transforms = vec![transform(90.)];
        let relation:SpatialRelation=serde_json::from_value(json!({"elementId":"outside","relativeTo":"caption","placement":"right","gap":0.,"offsetX":0.,"offsetY":0.,"followMotion":true,"referenceBounds":"text_box"})).unwrap();
        template.composition.spatial_relations.push(relation);
        assert!(
            template
                .validate()
                .unwrap_err()
                .to_string()
                .contains("across its boundary")
        );
        template.composition.spatial_relations.clear();
        template.composition.groups = serde_json::from_value(
            json!([{"id":"both","elementIds":["caption","outside"],"composite":true}]),
        )
        .unwrap();
        assert!(
            template
                .validate()
                .unwrap_err()
                .to_string()
                .contains("split an existing composite group")
        );
    }
}
