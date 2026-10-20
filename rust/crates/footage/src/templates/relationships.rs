use super::{model::*, rhythm::EditPlan, treatments};
use crate::domain::{TICKS, id};
use anyhow::{Result, ensure};
use serde_json::{Value, json};
use std::collections::HashSet;

/// Emit exact render identities only after grouping and transition preroll finish.
pub fn text_attachments(tracks: &mut [Value], t: &Template) -> Result<()> {
    use super::composition::SpatialBounds;
    use std::collections::BTreeMap;
    let relations: Vec<_> = t
        .composition
        .spatial_relations
        .iter()
        .filter(|r| r.reference_bounds == SpatialBounds::TextBox)
        .collect();
    if relations.is_empty() {
        return Ok(());
    }
    struct Instance {
        key: String,
        identity: Value,
        authored: String,
        start: i64,
        end: i64,
        text: bool,
        graphic_size: Option<[f64; 2]>,
    }
    fn collect(
        tracks: &[Value],
        path: &[String],
        clock: i64,
        visible: (i64, i64),
        source_size: f64,
        out: &mut Vec<Instance>,
    ) {
        for track in tracks {
            for e in track["elements"].as_array().unwrap() {
                let id = e["id"].as_str().unwrap();
                let identity = json!({"elementId":id,"trackId":track["id"],"groupPath":path});
                let start = e["startTime"].as_i64().unwrap() + clock;
                // A leaf cannot supply an attachment outside any enclosing group's
                // visible interval, even when its local clock still covers the child.
                let interval = (
                    start.max(visible.0),
                    (start + e["duration"].as_i64().unwrap()).min(visible.1),
                );
                if interval.0 >= interval.1 {
                    continue;
                }
                out.push(Instance {
                    key: identity.to_string(),
                    identity,
                    authored: e["params"]["template.elementId"]
                        .as_str()
                        .unwrap_or("")
                        .into(),
                    start: interval.0,
                    end: interval.1,
                    text: e["type"] == "text",
                    graphic_size: (e["type"] == "graphic").then(|| {
                        [
                            e["params"]["transform.scaleX"].as_f64().unwrap_or(1.) * source_size,
                            e["params"]["transform.scaleY"].as_f64().unwrap_or(1.) * source_size,
                        ]
                    }),
                });
                if let Some(children) = e["renderGroup"]["tracks"].as_array() {
                    let mut nested = path.to_vec();
                    nested.push(id.into());
                    let child_clock = clock + e["startTime"].as_i64().unwrap()
                        - e["renderGroup"]["timeOrigin"].as_i64().unwrap()
                        - e["trimStart"].as_i64().unwrap_or(0);
                    collect(children, &nested, child_clock, interval, source_size, out);
                }
            }
        }
    }
    let mut instances = vec![];
    let source_size = t.canvas.width.min(t.canvas.height) as f64;
    collect(
        tracks,
        &[],
        0,
        (i64::MIN, i64::MAX),
        source_size,
        &mut instances,
    );
    let mut updates = BTreeMap::new();
    for relation in relations {
        for child in instances
            .iter()
            .filter(|e| e.authored == relation.element_id)
        {
            let candidates: Vec<_> = instances
                .iter()
                .filter(|e| {
                    e.authored == relation.relative_to
                        && e.text
                        && e.start <= child.start
                        && e.end >= child.end
                })
                .collect();
            ensure!(
                candidates.len() == 1,
                "text-box attachment requires a unique covering compiled parent"
            );
            let (anchor, child_anchor, _) = relation.placement.anchors();
            let mut binding = json!({"parent":candidates[0].identity,"anchor":anchor});
            if let Some(size) = &relation.size_binding {
                let baseline = child
                    .graphic_size
                    .as_ref()
                    .filter(|axes| axes.iter().all(|v| v.is_finite() && *v > 0.))
                    .ok_or_else(|| {
                        anyhow::anyhow!(
                            "text size binding requires positive native graphic geometry"
                        )
                    })?;
                let mut descriptor = json!({"baselineSizePx":baseline,"sourceSizePx":source_size,"childAnchor":child_anchor});
                for (name, axis, canvas) in [
                    ("width", &size.width, t.canvas.width),
                    ("height", &size.height, t.canvas.height),
                ] {
                    if let Some(axis) = axis {
                        descriptor[name] =
                            json!({"factor":axis.factor,"paddingPx":axis.padding * canvas as f64});
                    }
                }
                binding["sizeBinding"] = descriptor;
            }
            ensure!(
                updates.insert(child.key.clone(), binding).is_none(),
                "duplicate compiled text-box attachment"
            );
        }
    }
    // Layout followers already inherit authored motion, but must also inherit
    // the measured-text displacement applied later by the renderer. Forward
    // the exact upstream binding rather than treating a graphic as a text box.
    for _ in 0..t.composition.spatial_relations.len() {
        let mut changed = false;
        for relation in t
            .composition
            .spatial_relations
            .iter()
            .filter(|r| r.follow_motion && r.reference_bounds == SpatialBounds::Layout)
        {
            for child in instances
                .iter()
                .filter(|e| e.authored == relation.element_id)
            {
                if updates.contains_key(&child.key) {
                    continue;
                }
                let candidates: Vec<_> = instances
                    .iter()
                    .filter(|e| {
                        e.authored == relation.relative_to
                            && e.start <= child.start
                            && e.end >= child.end
                    })
                    .collect();
                ensure!(
                    candidates.len() == 1,
                    "layout attachment requires a unique covering compiled parent"
                );
                if let Some(binding) = updates.get(&candidates[0].key).cloned() {
                    updates.insert(child.key.clone(), binding);
                    changed = true;
                }
            }
        }
        if !changed {
            break;
        }
    }
    fn write(tracks: &mut [Value], path: &[String], updates: &BTreeMap<String, Value>) {
        for track in tracks {
            let track_id = track["id"].clone();
            for e in track["elements"].as_array_mut().unwrap() {
                let id = e["id"].as_str().unwrap().to_string();
                let key = json!({"elementId":id,"trackId":track_id,"groupPath":path}).to_string();
                if let Some(value) = updates.get(&key) {
                    e["textAttachment"] = value.clone();
                }
                if let Some(children) = e
                    .get_mut("renderGroup")
                    .and_then(|group| group.get_mut("tracks"))
                    .and_then(Value::as_array_mut)
                {
                    let mut nested = path.to_vec();
                    nested.push(id);
                    write(children, &nested, updates);
                }
            }
        }
    }
    write(tracks, &[], &updates);
    Ok(())
}
pub fn resolve_lifecycles(
    elements: &mut [super::rhythm::PlacedElement],
    t: &Template,
    events: &[super::events::TimeEvent],
) -> Result<()> {
    let mut rules = t.composition.lifecycles.clone();
    for list in &t.composition.accumulating_lists {
        let mut previous = -1.;
        for item in &list.items {
            let matching: Vec<_> = events
                .iter()
                .filter(|e| e.id == item.start_event_id)
                .collect();
            ensure!(
                matching.len() == 1 && matching[0].start >= previous,
                "list item events must be unique and ordered"
            );
            previous = matching[0].start;
            rules.push(super::composition::ElementLifecycle {
                element_id: item.element_id.clone(),
                start_event_id: item.start_event_id.clone(),
                end_event_id: list.end_event_id.clone(),
            });
        }
    }
    for rule in &rules {
        let starts: Vec<_> = events
            .iter()
            .filter(|e| e.id == rule.start_event_id)
            .collect();
        let ends: Vec<_> = events
            .iter()
            .filter(|e| e.id == rule.end_event_id)
            .collect();
        ensure!(
            starts.len() == 1 && ends.len() == 1,
            "lifecycle requires unique start/end events"
        );
        let members: Vec<_> = elements
            .iter_mut()
            .filter(|e| e.element_id == rule.element_id)
            .collect();
        ensure!(
            members.len() == 1,
            "lifecycle requires exactly one element instance"
        );
        let start = starts[0].start;
        let end = ends[0].end;
        ensure!(end > start, "lifecycle end must follow start");
        for e in members {
            e.start = start;
            e.end = end;
        }
    }
    let snapshot = elements.to_vec();
    for rule in &t.composition.state_relations {
        let sources: Vec<_> = snapshot
            .iter()
            .filter(|e| e.element_id == rule.source_element_id)
            .collect();
        let targets: Vec<_> = elements
            .iter_mut()
            .filter(|e| e.element_id == rule.target_element_id)
            .collect();
        ensure!(
            !sources.is_empty() && !targets.is_empty(),
            "state relation requires source and target instances"
        );
        for target in targets {
            let triggers: Vec<_> = sources
                .iter()
                .filter(|s| s.start >= target.start && s.start < target.end)
                .collect();
            ensure!(
                triggers.len() == 1,
                "state relation requires a unique overlapping source"
            );
            ensure!(
                !target
                    .motions
                    .iter()
                    .any(|m| matches!(m.property, MotionProperty::Opacity)),
                "state relation conflicts with authored opacity"
            );
            let duration = target.end - target.start;
            let start = (triggers[0].start - target.start) / duration;
            let end =
                ((triggers[0].start + rule.duration_seconds - target.start) / duration).min(1.);
            let mut keys = vec![MotionKey {
                time: 0.,
                value: 1.,
                easing: Easing::Linear,
            }];
            if start > 0. {
                keys.push(MotionKey {
                    time: start,
                    value: 1.,
                    easing: Easing::Linear,
                });
            }
            keys.push(MotionKey {
                time: end,
                value: rule.opacity,
                easing: Easing::Linear,
            });
            if end < 1. {
                keys.push(MotionKey {
                    time: 1.,
                    value: rule.opacity,
                    easing: Easing::Linear,
                });
            }
            target.motions.push(Motion {
                property: MotionProperty::Opacity,
                keys,
            });
        }
    }
    Ok(())
}
fn key(t: i64, v: f64) -> Value {
    json!({"id":id(),"time":t,"value":v,"segmentToNext":"linear","tangentMode":"flat"})
}
pub fn follow(tracks: &mut [Value], t: &Template) -> Result<()> {
    let mut done = HashSet::new();
    for _ in 0..=t.composition.spatial_relations.len() {
        for r in &t.composition.spatial_relations {
            if done.contains(&r.element_id)
                || t.composition
                    .spatial_relations
                    .iter()
                    .any(|p| p.element_id == r.relative_to && !done.contains(&p.element_id))
            {
                continue;
            }
            if r.follow_motion {
                let parents: Vec<_> = tracks
                    .iter()
                    .flat_map(|t| t["elements"].as_array().unwrap())
                    .filter(|e| e["params"]["template.elementId"] == r.relative_to)
                    .cloned()
                    .collect();
                for child in tracks
                    .iter_mut()
                    .flat_map(|t| t["elements"].as_array_mut().unwrap())
                    .filter(|e| e["params"]["template.elementId"] == r.element_id)
                {
                    let start = child["startTime"].as_i64().unwrap();
                    let duration = child["duration"].as_i64().unwrap();
                    let parents: Vec<_> = parents
                        .iter()
                        .filter(|p| {
                            p["startTime"].as_i64().unwrap() <= start
                                && p["startTime"].as_i64().unwrap()
                                    + p["duration"].as_i64().unwrap()
                                    >= start + duration
                        })
                        .collect();
                    ensure!(
                        parents.len() == 1,
                        "dynamic attachment requires a unique covering parent"
                    );
                    let parent = parents[0];
                    let old = child.clone();
                    let paths = [
                        "transform.positionX",
                        "transform.positionY",
                        "transform.scaleX",
                        "transform.scaleY",
                        "transform.rotate",
                    ];
                    let mut channels: Vec<Vec<Value>> = vec![vec![]; 5];
                    let step = TICKS as i64 / t.canvas.fps as i64;
                    ensure!(
                        duration / step.max(1) <= 200000,
                        "attachment sample budget exceeded"
                    );
                    let mut times: Vec<_> = (0..=duration).step_by(step.max(1) as usize).collect();
                    times.push(duration);
                    times.sort();
                    times.dedup();
                    let value = |e: &Value, path: &str, time: i64, default: f64| {
                        treatments::sample(
                            &e["animations"][path],
                            time,
                            e["params"][path].as_f64().unwrap_or(default),
                        )
                    };
                    let p0 = start - parent["startTime"].as_i64().unwrap();
                    let origin = (
                        value(parent, paths[0], p0, 0.),
                        value(parent, paths[1], p0, 0.),
                    );
                    let measured = r.reference_bounds == super::composition::SpatialBounds::TextBox;
                    for time in times {
                        let sx0 = value(parent, paths[2], p0, 1.);
                        let sy0 = value(parent, paths[3], p0, 1.);
                        ensure!(
                            measured || (sx0.abs() > 1e-9 && sy0.abs() > 1e-9),
                            "attachment parent has zero initial scale"
                        );
                        // Measured text uses its untransformed authored box as reference.
                        // Its baseline and glyph correction must share the absolute parent
                        // basis, including a nonidentity pose at child activation.
                        let sx = value(parent, paths[2], p0 + time, 1.)
                            / if measured { 1. } else { sx0 };
                        let sy = value(parent, paths[3], p0 + time, 1.)
                            / if measured { 1. } else { sy0 };
                        let initial_angle = if measured {
                            0.
                        } else {
                            value(parent, paths[4], p0, 0.)
                        };
                        let current_angle = value(parent, paths[4], p0 + time, 0.);
                        let angle = current_angle - initial_angle;
                        let initial_rad = initial_angle.to_radians();
                        let rad = current_angle.to_radians();
                        let reference_origin = if measured {
                            (
                                parent["params"][paths[0]].as_f64().unwrap_or(0.),
                                parent["params"][paths[1]].as_f64().unwrap_or(0.),
                            )
                        } else {
                            origin
                        };
                        let world_x = value(&old, paths[0], time, 0.) - reference_origin.0;
                        let world_y = value(&old, paths[1], time, 0.) - reference_origin.1;
                        // Nonuniform scale acts along the parent's axes at activation.
                        let dx = (world_x * initial_rad.cos() + world_y * initial_rad.sin()) * sx;
                        let dy = (-world_x * initial_rad.sin() + world_y * initial_rad.cos()) * sy;
                        let values = [
                            value(parent, paths[0], p0 + time, 0.) + dx * rad.cos()
                                - dy * rad.sin(),
                            value(parent, paths[1], p0 + time, 0.)
                                + dx * rad.sin()
                                + dy * rad.cos(),
                            value(&old, paths[2], time, 1.) * sx,
                            value(&old, paths[3], time, 1.) * sy,
                            value(&old, paths[4], time, 0.) + angle,
                        ];
                        for i in 0..5 {
                            ensure!(values[i].is_finite(), "nonfinite attachment transform");
                            channels[i].push(key(time, values[i]));
                        }
                    }
                    if !child["animations"].is_object() {
                        child["animations"] = json!({});
                    }
                    for (path, keys) in paths.iter().zip(channels) {
                        child["animations"][*path] = json!({"keys":keys});
                    }
                    child["params"]["template.attachedTo"] = parent["id"].clone();
                }
            }
            done.insert(&r.element_id);
        }
    }
    Ok(())
}
pub fn pack(tracks: &mut Vec<Value>, t: &Template, plan: &EditPlan, offset: f64) -> Result<()> {
    for group in &plan.groups {
        let mut children = vec![];
        let mut insert = tracks.len();
        for (i, track) in tracks.iter_mut().enumerate() {
            let elements = track["elements"].as_array_mut().unwrap();
            let mut members = vec![];
            elements.retain(|e| {
                if group
                    .member_instance_ids
                    .iter()
                    .any(|id| e["params"]["template.instanceId"] == *id)
                {
                    members.push(e.clone());
                    false
                } else {
                    true
                }
            });
            if !members.is_empty() {
                insert = insert.min(i);
                let mut layer = track.clone();
                layer["elements"] = json!(members);
                children.push(layer);
            }
        }
        ensure!(!children.is_empty(), "group members were not compiled");
        let mut controller = json!({"id":id(),"type":"graphic","definitionId":"rectangle","name":group.id,"startTime":((offset+group.start)*TICKS as f64).round() as i64,"duration":((group.end-group.start)*TICKS as f64).round() as i64,"trimStart":0,"trimEnd":0,"hidden":false,
            "params":{"fill":"#00000000","transform.positionX":0,"transform.positionY":0,"transform.scaleX":1,"transform.scaleY":1,"transform.rotate":0,"opacity":1,"template.groupId":group.id,"template.instanceId":group.instance_id},
            "renderGroup":{"tracks":children},"animations":{}});
        treatments::apply(&mut controller, t)?;
        let actual_start = controller["renderGroup"]["tracks"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|t| t["elements"].as_array().unwrap())
            .map(|e| e["startTime"].as_i64().unwrap())
            .min()
            .unwrap();
        let old_start = controller["startTime"].as_i64().unwrap();
        if actual_start < old_start {
            let delta = old_start - actual_start;
            controller["startTime"] = json!(actual_start);
            controller["duration"] = json!(controller["duration"].as_i64().unwrap() + delta);
            for channel in controller["animations"]
                .as_object_mut()
                .unwrap()
                .values_mut()
            {
                for key in channel["keys"].as_array_mut().unwrap() {
                    key["time"] = json!(key["time"].as_i64().unwrap() + delta);
                }
            }
        }
        controller["renderGroup"]["timeOrigin"] = controller["startTime"].clone();
        tracks.insert(insert,json!({"id":id(),"name":group.id,"type":"graphic","hidden":false,"elements":[controller]}));
    }
    tracks.retain(|t| !t["elements"].as_array().unwrap().is_empty());
    Ok(())
}
