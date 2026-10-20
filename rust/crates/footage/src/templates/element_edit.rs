use super::{composition::Target, model::Template};
use anyhow::{Context, Result, ensure};
use schemars::JsonSchema;
use serde::Deserialize;
use std::collections::HashSet;

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Remove {
    pub template: Template,
    pub element_id: String,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Create {
    pub name: String,
    pub canvas: super::model::Canvas,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Add {
    pub template: Template,
    pub representation: super::model::Representation,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Entrance {
    Fade,
    Pop,
    Rise,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApplyEntrance {
    pub template: Template,
    pub element_id: String,
    pub entrance: Entrance,
    /// Fraction of the resolved element lifetime, not the template's maximum duration.
    pub duration_fraction: f64,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApplyEnvelope {
    pub template: Template,
    pub element_id: String,
    pub entrance: Entrance,
    pub enter_seconds: f64,
    pub exit_seconds: f64,
}

pub fn apply_envelope(input: ApplyEnvelope) -> Result<Template> {
    use super::model::{Easing, MotionKey, MotionProperty, MotionTiming};
    let timing = MotionTiming {
        coverage: input
            .template
            .elements
            .iter()
            .find(|e| e.id == input.element_id)
            .and_then(|e| e.motion_timing.as_ref())
            .and_then(|t| t.coverage.clone()),
        enter_end: 0.2,
        exit_start: 0.8,
        enter_seconds: input.enter_seconds,
        exit_seconds: input.exit_seconds,
    };
    super::motion_timing::validate(&timing)?;
    let mut template = apply_entrance(ApplyEntrance {
        template: input.template,
        element_id: input.element_id.clone(),
        entrance: input.entrance,
        duration_fraction: timing.enter_end,
    })?;
    let element = template
        .elements
        .iter_mut()
        .find(|element| element.id == input.element_id)
        .context("unknown element")?;
    let opacity = element
        .motions
        .iter_mut()
        .find(|motion| motion.property == MotionProperty::Opacity)
        .unwrap();
    opacity.keys.extend([
        MotionKey {
            time: timing.exit_start,
            value: 1.,
            easing: Easing::EaseIn,
        },
        MotionKey {
            time: 1.,
            value: 0.,
            easing: Easing::Linear,
        },
    ]);
    element.motion_timing = Some(timing);
    template.validate()?;
    Ok(template)
}

pub fn apply_entrance(input: ApplyEntrance) -> Result<Template> {
    use super::model::{Easing, Motion, MotionKey, MotionProperty, Representation};
    ensure!(
        input.duration_fraction.is_finite() && (0.01..=1.).contains(&input.duration_fraction),
        "entrance duration must be between 1% and 100%"
    );
    let mut template = input.template;
    template.validate()?;
    let distance = template.canvas.height as f64 * 0.04;
    let element = template
        .elements
        .iter_mut()
        .find(|e| e.id == input.element_id)
        .context("unknown element")?;
    ensure!(
        element.features.representation != Representation::Audio,
        "entrance requires a visual element"
    );
    let motion = |property, start, end, easing| Motion {
        property,
        keys: vec![
            MotionKey {
                time: 0.,
                value: start,
                easing,
            },
            MotionKey {
                time: input.duration_fraction,
                value: end,
                easing: Easing::Linear,
            },
        ],
    };
    let mut tracks = vec![motion(MotionProperty::Opacity, 0., 1., Easing::EaseOut)];
    match input.entrance {
        Entrance::Fade => {}
        Entrance::Pop => tracks.push(motion(MotionProperty::Scale, 0.8, 1., Easing::Overshoot)),
        Entrance::Rise => tracks.push(motion(MotionProperty::Y, distance, 0., Easing::EaseOut)),
    }
    // Replace only channels owned by this entrance, retaining independent motion.
    element.motions.retain(|existing| {
        !tracks.iter().any(|track| {
            existing.property == track.property
                || (track.property == MotionProperty::Scale
                    && matches!(
                        existing.property,
                        MotionProperty::ScaleX | MotionProperty::ScaleY
                    ))
        })
    });
    element.motions.extend(tracks);
    template.validate()?;
    Ok(template)
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InsertAsset {
    pub template: Template,
    pub asset_id: String,
}

pub fn insert_asset(
    template: Template,
    asset: &super::assets::Asset,
) -> Result<(Template, String)> {
    use super::model::{Representation, ResourceSlot, Role};
    ensure!(
        asset.width > 0 && asset.height > 0,
        "invalid asset dimensions"
    );
    let (mut template, id) = add(Add {
        template,
        representation: Representation::Rectangle,
    })?;
    let element = template.elements.last_mut().unwrap();
    let style_id = element.style_id.take();
    template
        .styles
        .retain(|style| Some(&style.id) != style_id.as_ref());
    element.description = asset.name.clone();
    element.literal = Some(asset.name.clone());
    element.features.representation = match asset.kind {
        super::assets::Kind::Image => Representation::Image,
        super::assets::Kind::Video => Representation::Video,
    };
    element.features.role = Some(Role::SupportingVisual);
    let slot = format!("slot-{}", uuid::Uuid::new_v4());
    element.resource_id = Some(slot.clone());
    let aspect = asset.width as f64 / asset.height as f64;
    let width =
        0.4_f64.min(0.6 * template.canvas.height as f64 * aspect / template.canvas.width as f64);
    element.region.width = width;
    element.region.height =
        width * template.canvas.width as f64 / aspect / template.canvas.height as f64;
    template.resource_slots.push(ResourceSlot {
        id: slot.clone(),
        representation: element.features.representation.clone(),
        description: asset.name.clone(),
        tags: asset.tags.clone(),
    });
    template.bind(&slot, &asset.id);
    template.validate()?;
    Ok((template, id))
}

pub fn add(input: Add) -> Result<(Template, String)> {
    use super::model::{Anchor, Binding, Placement, Rect, Representation, Role};
    ensure!(
        matches!(
            input.representation,
            Representation::Text
                | Representation::Rectangle
                | Representation::Ellipse
                | Representation::Star
                | Representation::Line
        ),
        "unsupported basic element"
    );
    let mut t = input.template;
    t.validate()?;
    let mut defaults = create(Create {
        name: "Element".into(),
        canvas: t.canvas.clone(),
    })?;
    let mut element = defaults.elements.remove(0);
    let mut style = defaults.styles.remove(0);
    let text = input.representation == Representation::Text;
    element.id = format!("element-{}", uuid::Uuid::new_v4());
    style.id = format!("style-{}", uuid::Uuid::new_v4());
    element.style_id = Some(style.id.clone());
    element.description = if text { "文字" } else { "图形" }.into();
    element.features.role = Some(if text { Role::Title } else { Role::Decoration });
    element.features.placement = Placement::Fixed;
    element.features.representation = input.representation;
    element.binding = Binding::Literal;
    element.literal = Some(if text { "新文字" } else { "图形" }.into());
    element.region = Rect {
        x: 0.1,
        y: 0.15,
        width: 0.8,
        height: if element.features.representation == Representation::Line {
            0.01
        } else {
            0.15
        },
    };
    if element.features.representation == Representation::Star {
        // Start with a regular star on every canvas. A user can independently
        // stretch it afterwards; the text-shaped default would flatten it.
        let side = 0.2 * f64::from(t.canvas.width.min(t.canvas.height));
        let width = side / f64::from(t.canvas.width);
        let height = side / f64::from(t.canvas.height);
        element.region = Rect {
            x: (1. - width) / 2.,
            y: (1. - height) / 2.,
            width,
            height,
        };
    }
    element.timing.anchor = Anchor::VideoStart;
    element.timing.max_seconds = 600.;
    element.z = t
        .elements
        .iter()
        .map(|e| e.z)
        .max()
        .unwrap_or(0)
        .checked_add(1)
        .context("layer order overflow")?;
    if !text {
        style.stroke_width = 0.;
        style.fill = "#32836a".into();
    }
    let id = element.id.clone();
    t.elements.push(element);
    t.styles.push(style);
    t.validate()?;
    Ok((t, id))
}

pub fn create(input: Create) -> Result<Template> {
    let region = serde_json::json!({"x":0.08,"y":0.7,"width":0.84,"height":0.18});
    let template: Template = serde_json::from_value(serde_json::json!({
        "schemaVersion":"moirai.template.v2", "id":format!("template-{}", uuid::Uuid::new_v4()),
        "revision":0, "name":input.name, "description":"", "tags":[], "canvas":input.canvas,
        "elements":[{
            "id":"caption", "description":"字幕", "features":{"role":"subtitle","representation":"text","mediaUse":null,"outline":false,"accent":false,"placement":"caption","avoidProtectedRegions":true},
            "binding":"sentence","literal":null,"styleId":"caption-style","resourceId":null,
            "region":region,"z":1,"timing":{"anchor":"cue_start","offsetSeconds":0,"minSeconds":0.2,"maxSeconds":5},
            "motions":[],"intents":[],"priority":50,"exclusiveGroup":null,"evidence":[]
        }],
        "styles":[{"id":"caption-style","description":"字幕样式","fontFamily":"PingFang SC","fontSize":48,"weight":600,"italic":false,"fill":"#ffffff","stroke":"#202020","strokeWidth":2,"background":null,"shadow":null,"lineHeight":1.2,"maxLines":2}],
        "resourceSlots":[],"resourceBindings":[],
        "layouts":[{"id":"full","description":"全画面","mode":"full_bleed","videoRegion":{"x":0,"y":0,"width":1,"height":1},"captionRegion":region,"safeRegions":[],"intents":[],"evidence":[]}],
        "layoutEntrances":[],"transitionRules":[],
        "segmentation":{"pauseBoundarySeconds":0.32,"maxPhraseSeconds":3.5,"maxCharacters":16,"maxCharactersPerSecond":10},
        "visualRhythm":{"minDisplaySeconds":0.2,"maxAccentsPerCue":2},
        "audioPlacement":{"effectCooldownSeconds":0.3},
        "mix":{"musicGainDb":-24,"musicDuckDb":-12,"effectGainDb":-12},"evidence":[]
    }))?;
    template.validate()?;
    Ok(template)
}

pub fn duplicate(mut t: Template, id: &str) -> Result<(Template, String)> {
    t.validate()?;
    let mut element = t
        .elements
        .iter()
        .find(|e| e.id == id)
        .context("unknown element")?
        .clone();
    element.id = format!("element-{}", uuid::Uuid::new_v4());
    element.description = format!("{} 副本", element.description);
    if let Some(style_id) = &element.style_id {
        let mut style = t
            .styles
            .iter()
            .find(|s| &s.id == style_id)
            .context("unknown style")?
            .clone();
        style.id = format!("style-{}", uuid::Uuid::new_v4());
        element.style_id = Some(style.id.clone());
        t.styles.push(style);
    }
    if let Some(slot_id) = &element.resource_id {
        let mut slot = t
            .resource_slots
            .iter()
            .find(|s| &s.id == slot_id)
            .context("unknown resource slot")?
            .clone();
        slot.id = format!("slot-{}", uuid::Uuid::new_v4());
        if let Some(mut binding) = t
            .resource_bindings
            .iter()
            .find(|b| &b.slot_id == slot_id)
            .cloned()
        {
            binding.slot_id = slot.id.clone();
            t.resource_bindings.push(binding);
        }
        element.resource_id = Some(slot.id.clone());
        t.resource_slots.push(slot);
    }
    // A new element is independently editable, not implicitly a member of the original's relations.
    element.exclusive_group = None;
    let id = element.id.clone();
    t.elements.push(element);
    t.validate()?;
    Ok((t, id))
}

pub fn remove(mut t: Template, id: &str) -> Result<Template> {
    t.validate()?;
    let element = t
        .elements
        .iter()
        .find(|e| e.id == id)
        .context("unknown element")?;
    let slot = element.resource_id.clone();
    ensure!(t.elements.len() > 1, "cannot remove the last element");
    t.elements.retain(|e| e.id != id);
    let c = &mut t.composition;
    for group in &mut c.groups {
        group.element_ids.retain(|member| member != id);
    }
    let empty_groups: HashSet<_> = c
        .groups
        .iter()
        .filter(|g| g.element_ids.is_empty())
        .map(|g| g.id.clone())
        .collect();
    c.groups.retain(|g| !empty_groups.contains(&g.id));
    c.arrangements
        .retain(|a| !empty_groups.contains(&a.group_id));
    let removed_target = |target: &Target| match target {
        Target::Element(target) => target == id,
        Target::Group(target) => empty_groups.contains(target),
        Target::Layout(_) => false,
    };
    let affected_treatments: HashSet<_> = c
        .applications
        .iter()
        .filter(|a| removed_target(&a.target))
        .map(|a| a.treatment_id.clone())
        .collect();
    c.applications.retain(|a| !removed_target(&a.target));
    c.treatments.retain(|effect| {
        !affected_treatments.contains(&effect.id)
            || c.applications.iter().any(|a| a.treatment_id == effect.id)
    });
    let removed_endpoint = |target: &str| target == id || empty_groups.contains(target);
    let affected_transitions: HashSet<_> = c
        .transitions
        .iter()
        .filter(|r| removed_endpoint(&r.from_element_id) || removed_endpoint(&r.to_element_id))
        .map(|r| r.effect_id.clone())
        .collect();
    c.transitions
        .retain(|r| !removed_endpoint(&r.from_element_id) && !removed_endpoint(&r.to_element_id));
    c.transition_effects.retain(|effect| {
        !affected_transitions.contains(&effect.id)
            || c.transitions.iter().any(|r| r.effect_id == effect.id)
    });
    c.spatial_relations
        .retain(|r| r.element_id != id && r.relative_to != id);
    c.reading_replicas
        .retain(|r| r.element_id != id && r.primary_id != id);
    c.scheduling.retain(|r| r.element_id != id);
    c.lifecycles.retain(|r| r.element_id != id);
    c.state_relations
        .retain(|r| r.source_element_id != id && r.target_element_id != id);
    for list in &mut c.accumulating_lists {
        list.items.retain(|item| item.element_id != id);
    }
    c.accumulating_lists.retain(|list| !list.items.is_empty());
    // Slots can also supply secondary views or fallbacks for other slots.
    if let Some(slot) = slot {
        let shared = t
            .elements
            .iter()
            .any(|e| e.resource_id.as_ref() == Some(&slot))
            || t.layouts
                .iter()
                .any(|l| l.secondary.as_ref().is_some_and(|s| s.resource_id == slot))
            || c.resource_requirements
                .iter()
                .any(|r| r.slot_id != slot && r.fallback_slot_ids.contains(&slot));
        if !shared {
            t.resource_slots.retain(|r| r.id != slot);
            t.resource_bindings.retain(|r| r.slot_id != slot);
            c.resource_requirements.retain(|r| r.slot_id != slot);
        }
    }
    t.validate()?;
    Ok(t)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn entrances_compose_with_existing_motion_and_do_not_change_content() {
        use super::super::model::{MotionProperty, Representation};
        for representation in [Representation::Text, Representation::Rectangle] {
            for entrance in [Entrance::Fade, Entrance::Pop, Entrance::Rise] {
                let (mut template, element_id) = add(Add {
                    template: fixture(),
                    representation: representation.clone(),
                })
                .unwrap();
                let element = template.elements.last_mut().unwrap();
                element.motions = serde_json::from_value(json!([
                    {"property":"x","keys":[{"time":0,"value":0,"easing":"linear"},{"time":1,"value":10,"easing":"linear"}]},
                    {"property":"scale_x","keys":[{"time":0,"value":1,"easing":"linear"},{"time":1,"value":1.1,"easing":"linear"}]}
                ])).unwrap();
                let before = serde_json::to_value(&template).unwrap();
                let pop = matches!(entrance, Entrance::Pop);
                let output = apply_entrance(ApplyEntrance {
                    template,
                    element_id,
                    entrance,
                    duration_fraction: 0.2,
                })
                .unwrap();
                let last = output.elements.last().unwrap();
                assert!(last.motions.iter().any(|m| m.property == MotionProperty::X));
                assert_eq!(
                    last.motions
                        .iter()
                        .any(|m| m.property == MotionProperty::ScaleX),
                    !pop
                );
                let opacity = last
                    .motions
                    .iter()
                    .find(|m| m.property == MotionProperty::Opacity)
                    .unwrap();
                assert_eq!(opacity.keys[0].value, 0.);
                assert_eq!(opacity.keys[1].value, 1.);
                assert_eq!(opacity.keys[1].time, 0.2);
                let mut after = serde_json::to_value(&output).unwrap();
                let index = output.elements.len() - 1;
                after["elements"][index]["motions"] = before["elements"][index]["motions"].clone();
                assert_eq!(before, after);
                let element_id = last.id.clone();
                let replay = apply_entrance(ApplyEntrance {
                    template: output,
                    element_id,
                    entrance: Entrance::Fade,
                    duration_fraction: 0.3,
                });
                assert!(replay.is_ok());
            }
        }
    }

    #[test]
    fn entrance_rejects_unknown_elements_and_invalid_duration() {
        for fraction in [0., -1., 1.01, f64::NAN] {
            let template = fixture();
            let element_id = template.elements[0].id.clone();
            assert!(
                apply_entrance(ApplyEntrance {
                    template,
                    element_id,
                    entrance: Entrance::Fade,
                    duration_fraction: fraction
                })
                .is_err()
            );
        }
        assert!(
            apply_entrance(ApplyEntrance {
                template: fixture(),
                element_id: "missing".into(),
                entrance: Entrance::Fade,
                duration_fraction: 0.2
            })
            .is_err()
        );
    }

    fn fixture() -> Template {
        serde_json::from_value(super::super::composition_tests::input()["template"].clone())
            .unwrap()
    }

    #[test]
    fn inserted_assets_preserve_aspect_and_have_independent_bindings() {
        use super::super::{
            assets::{Asset, Kind},
            model::Representation,
        };
        for kind in [Kind::Image, Kind::Video] {
            let asset = Asset {
                id: "asset-example".into(),
                sha256: "hash".into(),
                source_sha256: "source".into(),
                name: "Illustration".into(),
                description: String::new(),
                tags: vec!["icon".into()],
                provenance: "test".into(),
                kind: kind.clone(),
                width: 240,
                height: 960,
                duration: None,
                size: 1,
                created_at: 0,
            };
            let original = fixture();
            let original_elements = serde_json::to_value(&original.elements).unwrap();
            let original_styles = serde_json::to_value(&original.styles).unwrap();
            let (first, first_id) = insert_asset(original, &asset).unwrap();
            let (result, second_id) = insert_asset(first, &asset).unwrap();
            assert_ne!(first_id, second_id);
            let first = &result.elements[result.elements.len() - 2];
            let second = result.elements.last().unwrap();
            assert_ne!(first.resource_id, second.resource_id);
            assert!(second.style_id.is_none());
            assert_eq!(
                second.features.representation,
                match kind {
                    Kind::Image => Representation::Image,
                    Kind::Video => Representation::Video,
                }
            );
            let ratio = second.region.width * result.canvas.width as f64
                / (second.region.height * result.canvas.height as f64);
            assert!((ratio - 0.25).abs() < 1e-9);
            assert!(second.region.y + second.region.height <= 1.0);
            for element in [first, second] {
                assert!(
                    result
                        .resource_bindings
                        .iter()
                        .any(
                            |binding| Some(&binding.slot_id) == element.resource_id.as_ref()
                                && binding.asset_id == asset.id
                        )
                );
            }
            assert_eq!(
                serde_json::to_value(&result.elements[..result.elements.len() - 2]).unwrap(),
                original_elements
            );
            assert_eq!(
                serde_json::to_value(&result.styles).unwrap(),
                original_styles
            );
            result.validate().unwrap();
            let mut invalid = asset;
            invalid.height = 0;
            assert!(insert_asset(result, &invalid).is_err());
        }
    }

    #[test]
    fn create_accepts_supported_canvases_and_rejects_invalid_drafts() {
        for (width, height) in [(720, 1280), (1280, 720), (720, 720)] {
            let t = create(Create {
                name: "New".into(),
                canvas: super::super::model::Canvas {
                    width,
                    height,
                    fps: 30,
                },
            })
            .unwrap();
            assert_eq!(t.revision, 0);
            assert_eq!(t.elements.len(), 1);
            assert!(t.resource_bindings.is_empty());
            t.validate().unwrap();
        }
        assert!(
            create(Create {
                name: "".into(),
                canvas: super::super::model::Canvas {
                    width: 720,
                    height: 1280,
                    fps: 30
                }
            })
            .is_err()
        );
        assert!(
            create(Create {
                name: "New".into(),
                canvas: super::super::model::Canvas {
                    width: 1,
                    height: 1,
                    fps: 30
                }
            })
            .is_err()
        );
    }

    #[test]
    fn basic_elements_are_independent_and_invalid_types_are_rejected() {
        use super::super::model::Representation;
        for representation in [
            Representation::Text,
            Representation::Rectangle,
            Representation::Ellipse,
            Representation::Line,
        ] {
            let t = fixture();
            let original = serde_json::to_value(&t.elements).unwrap();
            let (result, id) = add(Add {
                template: t,
                representation: representation.clone(),
            })
            .unwrap();
            let last = result.elements.last().unwrap();
            assert_eq!(last.id, id);
            assert_eq!(last.features.representation, representation);
            assert_eq!(
                serde_json::to_value(&result.elements[..result.elements.len() - 1]).unwrap(),
                original
            );
            result.validate().unwrap();
        }
        assert!(
            add(Add {
                template: fixture(),
                representation: Representation::Audio
            })
            .is_err()
        );
    }

    #[test]
    fn removal_cleans_relations_and_keeps_shared_effects_and_other_elements() {
        let mut t = fixture();
        let mut second = t.elements[0].clone();
        second.id = "second".into();
        t.elements.push(second);
        let id = t.elements[0].id.clone();
        let other = t.elements[1].id.clone();
        t.composition = serde_json::from_value(json!({
            "groups":[{"id":"solo","elementIds":[id]},{"id":"shared","elementIds":[id,other]}],
            "treatments":[{"id":"sole","operation":{"kind":"blur","intensity":2}},{"id":"both","operation":{"kind":"blur","intensity":2}}],
            "applications":[{"treatmentId":"sole","target":{"kind":"group","id":"solo"},"enabled":true},{"treatmentId":"both","target":{"kind":"element","id":id},"enabled":true},{"treatmentId":"both","target":{"kind":"element","id":other},"enabled":true}],
            "transitions":[{"id":"edge","fromElementId":id,"toElementId":other,"effectId":"fade"}],
            "transitionEffects":[{"id":"fade","effect":"dissolve","durationSeconds":0.2}],
            "spatialRelations":[{"elementId":other,"relativeTo":id,"placement":"overlay","gap":0,"offsetX":0,"offsetY":0}]
        })).unwrap();
        let before = serde_json::to_value(&t.elements[1..]).unwrap();
        let result = remove(t, &id).unwrap();
        assert_eq!(serde_json::to_value(&result.elements).unwrap(), before);
        assert_eq!(result.composition.groups.len(), 1);
        assert_eq!(result.composition.groups[0].element_ids, vec![other]);
        assert_eq!(result.composition.treatments.len(), 1);
        assert_eq!(result.composition.treatments[0].id, "both");
        assert_eq!(result.composition.applications.len(), 1);
        assert!(result.composition.transitions.is_empty());
        assert!(result.composition.transition_effects.is_empty());
        assert!(result.composition.spatial_relations.is_empty());
        assert!(remove(result, "missing").is_err());
    }

    #[test]
    fn removal_cleans_lifecycle_state_and_lists_without_losing_other_members() {
        let mut t = fixture();
        let text = t
            .elements
            .iter()
            .find(|e| {
                matches!(
                    e.features.representation,
                    super::super::model::Representation::Text
                )
            })
            .unwrap()
            .clone();
        for id in ["first", "second", "third", "fourth"] {
            let mut element = text.clone();
            element.id = id.into();
            t.elements.push(element);
        }
        t.composition = serde_json::from_value(json!({
            "accumulatingLists":[
                {"items":[{"elementId":"first","startEventId":"a"},{"elementId":"second","startEventId":"b"}],"endEventId":"end"},
                {"items":[{"elementId":"third","startEventId":"c"}],"endEventId":"end"}
            ],
            "lifecycles":[{"elementId":"fourth","startEventId":"d","endEventId":"end"}],
            "stateRelations":[
                {"sourceElementId":"first","targetElementId":"second","opacity":0.3,"durationSeconds":0.2},
                {"sourceElementId":"second","targetElementId":"third","opacity":0.4,"durationSeconds":0.2}
            ]
        })).unwrap();
        let result = remove(t, "first").unwrap();
        assert_eq!(result.composition.accumulating_lists[0].items.len(), 1);
        assert_eq!(
            result.composition.accumulating_lists[0].items[0].element_id,
            "second"
        );
        assert_eq!(result.composition.state_relations.len(), 1);
        let result = remove(result, "third").unwrap();
        assert_eq!(result.composition.accumulating_lists.len(), 1);
        assert!(result.composition.state_relations.is_empty());
        let result = remove(result, "fourth").unwrap();
        assert!(result.composition.lifecycles.is_empty());
        result.validate().unwrap();
    }

    #[test]
    fn duplicate_has_independent_style_and_preserves_original() {
        let t = fixture();
        let source = t
            .elements
            .iter()
            .find(|e| e.style_id.is_some())
            .unwrap()
            .clone();
        let original = serde_json::to_value(&t).unwrap();
        let (mut result, id) = duplicate(t, &source.id).unwrap();
        let copy = result.elements.iter().find(|e| e.id == id).unwrap();
        assert_ne!(copy.style_id, source.style_id);
        let copy_style = copy.style_id.clone().unwrap();
        result
            .styles
            .iter_mut()
            .find(|s| s.id == copy_style)
            .unwrap()
            .fill = "#123456".into();
        assert_eq!(
            serde_json::to_value(&result.elements[..result.elements.len() - 1]).unwrap(),
            original["elements"]
        );
        assert_eq!(
            serde_json::to_value(&result.styles[..result.styles.len() - 1]).unwrap(),
            original["styles"]
        );
        assert!(duplicate(result, "missing").is_err());
    }
}
