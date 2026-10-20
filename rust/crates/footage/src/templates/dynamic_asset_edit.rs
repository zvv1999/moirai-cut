use super::{
    composition::Target,
    dynamic_asset::{Definition, Layer, LayerContent, TextInput},
    element_edit,
    model::*,
};
use anyhow::{Context, Result, ensure};
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashSet};

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Edit {
    pub definition: Definition,
    pub operation: Operation,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MediaEdit {
    pub definition: Definition,
    pub asset_id: String,
    pub layer_id: Option<String>,
    pub parent_id: Option<String>,
    #[serde(default)]
    pub convert_shape: bool,
}

pub fn edit_media(input: MediaEdit, asset: &super::assets::Asset) -> Result<Value> {
    let mut definition = input.definition;
    let projected = definition.project(&BTreeMap::new())?;
    ensure!(input.asset_id == asset.id, "visual asset identity mismatch");
    ensure!(
        !input.convert_shape || input.layer_id.is_some(),
        "shape conversion requires a layer"
    );
    let representation = match asset.kind {
        super::assets::Kind::Image => Representation::Image,
        super::assets::Kind::Video => Representation::Video,
    };
    let selected_id = if let Some(layer_id) = input.layer_id {
        ensure!(
            input.parent_id.is_none(),
            "replacement cannot change parent"
        );
        let layer = definition
            .layers
            .iter_mut()
            .find(|layer| id(layer) == layer_id)
            .context("unknown layer")?;
        let LayerContent::Element { element } = &mut layer.content else {
            anyhow::bail!("replacement requires a media element")
        };
        if input.convert_shape {
            ensure!(
                matches!(
                    element.features.representation,
                    Representation::Rectangle | Representation::Ellipse
                ),
                "shape conversion requires a rectangle or ellipse"
            );
        } else {
            ensure!(
                element.features.representation == representation
                    || element.features.representation == Representation::VisualMedia,
                "replacement requires compatible media type"
            );
        }
        if let Some(duration) = asset.duration {
            ensure!(
                element.timing.max_seconds <= duration + 0.000001,
                "replacement video is shorter than layer maximum duration; shorten the layer duration first"
            );
        }
        let old_style = if input.convert_shape {
            element.features.representation = representation.clone();
            element.features.role = Some(Role::SupportingVisual);
            element.features.outline = false;
            element.description = asset.name.clone();
            element.literal = Some(asset.name.clone());
            element.style_id.take()
        } else {
            None
        };
        let old_slot = element
            .resource_id
            .replace(format!("slot-{}", crate::domain::id()));
        let slot_id = element.resource_id.clone().unwrap();
        definition.resource_slots.push(ResourceSlot {
            id: slot_id.clone(),
            representation,
            description: asset.name.clone(),
            tags: asset.tags.clone(),
        });
        definition.resource_bindings.push(ResourceBinding {
            slot_id,
            asset_id: asset.id.clone(),
            enabled: true,
        });
        if let Some(old) = old_style {
            if !definition.layers.iter().any(|layer|matches!(&layer.content,LayerContent::Element {element} if element.style_id.as_deref()==Some(&old))) {
                definition.styles.retain(|style|style.id!=old);
            }
        }
        if let Some(old) = old_slot {
            if !definition.layers.iter().any(|layer|matches!(&layer.content,LayerContent::Element {element} if element.resource_id.as_deref()==Some(&old))) {
                definition.resource_slots.retain(|slot|slot.id!=old);
                definition.resource_bindings.retain(|binding|binding.slot_id!=old);
            }
        }
        layer_id
    } else {
        if let Some(parent) = &input.parent_id {
            ensure!(
                definition.layers.iter().any(
                    |layer| matches!(&layer.content,LayerContent::Group {id,..} if id==parent)
                ),
                "parent must be a group"
            );
        }
        let (mut template, layer_id) = element_edit::insert_asset(projected, asset)?;
        let mut element = template.elements.pop().context("missing inserted media")?;
        element.features.avoid_protected_regions = false;
        if let Some(duration) = asset.duration {
            element.timing.max_seconds = element.timing.max_seconds.min(duration);
            element.timing.min_seconds = element.timing.min_seconds.min(element.timing.max_seconds);
        }
        let slot_id = element
            .resource_id
            .as_ref()
            .context("missing inserted resource")?;
        definition.resource_slots.push(
            template
                .resource_slots
                .iter()
                .find(|slot| &slot.id == slot_id)
                .context("missing slot")?
                .clone(),
        );
        definition.resource_bindings.push(
            template
                .resource_bindings
                .iter()
                .find(|binding| &binding.slot_id == slot_id)
                .context("missing binding")?
                .clone(),
        );
        definition.layers.push(Layer {
            parent_id: input.parent_id,
            content: LayerContent::Element { element },
        });
        layer_id
    };
    definition.project(&BTreeMap::new())?;
    Ok(json!({"definition":definition,"selectedLayerId":selected_id}))
}

#[derive(Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Operation {
    /// Edit rectangle geometry without changing paint, scheduling or motion.
    RectangleGeometry {
        layer_id: String,
        rectangle_geometry: Option<super::rectangle_geometry::RectangleGeometry>,
    },
    /// Edit star geometry without changing styling, content, timing or motion.
    StarGeometry {
        layer_id: String,
        star_geometry: Option<super::star_geometry::StarGeometry>,
    },
    /// Edit ellipse geometry independently of styling and motion.
    EllipseArc {
        layer_id: String,
        ellipse_arc: Option<super::ellipse_arc::EllipseArc>,
    },
    /// Toggle native shape outline; incompatible existing geometry/motion is rejected.
    Outline {
        layer_id: String,
        enabled: bool,
    },
    DetachInFrame {
        layer_id: String,
        attached: FramePose,
        independent: FramePose,
    },
    ScaleInFrame {
        layer_id: String,
        delta: [f64; 2],
        diagonal: [f64; 2],
        pivot_to_origin: [f64; 2],
        basis: [f64; 4],
        axis: Option<FrameScaleAxis>,
        visual_basis: Option<[f64; 4]>,
    },
    /// Renderer supplies the frame's layout-to-canvas linear basis; Rust owns
    /// inversion, unit conversion and the authored relation/layout edit.
    MoveInFrame {
        layer_id: String,
        delta_x: f64,
        delta_y: f64,
        basis: [f64; 4],
    },
    ReadingReplica {
        layer_id: String,
        primary_id: Option<String>,
    },
    SpatialRelation {
        layer_id: String,
        relation: Option<super::composition::SpatialRelation>,
    },
    Resize {
        layer_id: String,
        corner: ResizeCorner,
        delta_x: f64,
        delta_y: f64,
    },
    Move {
        layer_id: String,
        delta_x: f64,
        delta_y: f64,
    },
    PlaceBeside {
        layer_id: String,
        reference_id: String,
        side: PlacementSide,
        gap: f64,
    },
    Align {
        layer_id: String,
        alignment: Alignment,
    },
    Stack {
        layer_id: String,
        position: StackPosition,
    },
    Envelope {
        layer_id: String,
        entrance: element_edit::Entrance,
        enter_seconds: f64,
        exit_seconds: f64,
    },
    /// Copy shared visual styling for one element; content and scheduling stay unchanged.
    DetachStyle {
        layer_id: String,
    },
    /// Choose isolated group rendering; leaves and their animation are preserved.
    GroupCompositing {
        layer_id: String,
        composite: bool,
    },
    GroupInstances {
        layer_id: String,
        separate_instances: bool,
    },
    /// Edit an isolated container's fixed-second exit; null removes this managed effect.
    GroupFade {
        layer_id: String,
        exit_seconds: Option<f64>,
        #[serde(default)]
        enter_seconds: Option<f64>,
    },
    /// Change semantic intent independently of appearance, content and scheduling.
    SemanticRole {
        layer_id: String,
        role: Option<Role>,
    },
    /// Edit an existing shared highlight, preserving content, timing and motion.
    HighlightTreatment {
        layer_id: String,
        treatment_id: String,
        highlight: Option<Highlight>,
    },
    /// Change text binding and highlighting without changing timing or motion.
    /// Configure scheduling separately when the new content needs a different anchor.
    TextPresentation {
        layer_id: String,
        binding: Binding,
        highlight: Option<Highlight>,
    },
    Add {
        representation: Representation,
        parent_id: Option<String>,
    },
    Duplicate {
        layer_id: String,
    },
    Remove {
        layer_id: String,
    },
    Entrance {
        layer_id: String,
        entrance: element_edit::Entrance,
        duration_fraction: f64,
    },
}

#[derive(Clone, Copy, PartialEq, Eq, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum FrameScaleAxis {
    X,
    Y,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FramePose {
    pub scene_time: i64,
    pub local_time: i64,
    pub position: [f64; 2],
    pub basis: [f64; 4],
}

fn pose_axes(pose: &FramePose) -> Result<(f64, f64, f64)> {
    ensure!(
        pose.scene_time >= 0
            && pose.local_time >= 0
            && pose
                .position
                .iter()
                .chain(&pose.basis)
                .all(|v| v.is_finite()),
        "invalid measured frame pose"
    );
    let [a, b, c, d] = pose.basis;
    let sx = a.hypot(b);
    ensure!(sx > 1e-9, "cannot detach a singular frame pose");
    let sy = (a * d - b * c) / sx;
    ensure!(sy.abs() > 1e-9, "cannot detach a singular frame pose");
    ensure!(
        (a * c + b * d).abs() <= 1e-7 * sx * sy.abs(),
        "detaching a sheared pose requires an authored affine transform"
    );
    Ok((sx, sy, b.atan2(a).to_degrees()))
}

fn adjust_motion(element: &mut Element, property: MotionProperty, multiply: bool, value: f64) {
    if let Some(motion) = element
        .motions
        .iter_mut()
        .find(|motion| motion.property == property)
    {
        for key in &mut motion.keys {
            key.value = if multiply {
                key.value * value
            } else {
                key.value + value
            };
        }
    } else {
        element.motions.push(Motion {
            property,
            keys: vec![
                MotionKey {
                    time: 0.,
                    value,
                    easing: Easing::Linear,
                },
                MotionKey {
                    time: 1.,
                    value,
                    easing: Easing::Linear,
                },
            ],
        });
    }
}

pub fn detached_preview_definition(
    mut definition: Definition,
    layer_id: &str,
) -> Result<Definition> {
    definition.project(&BTreeMap::new())?;
    ensure!(
        definition
            .spatial_relations
            .iter()
            .any(|r| r.element_id == layer_id),
        "layer has no attachment"
    );
    definition
        .spatial_relations
        .retain(|r| r.element_id != layer_id);
    definition.project(&BTreeMap::new())?;
    Ok(definition)
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum StackPosition {
    Front,
    Back,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Alignment {
    Left,
    Center,
    Right,
    Top,
    Middle,
    Bottom,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum PlacementSide {
    Left,
    Right,
    Above,
    Below,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ResizeCorner {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
}

fn resize_axis(start: f64, length: f64, delta: f64, leading: bool, minimum: f64) -> (f64, f64) {
    if leading {
        let end = start + length;
        let next = (start + delta).clamp(0.0, (end - minimum.min(end)).max(0.0));
        (next, end - next)
    } else {
        (
            start,
            (length + delta).clamp(minimum.min(1.0 - start), 1.0 - start),
        )
    }
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Highlight {
    pub mode: super::composition::TextHighlightMode,
    pub color: String,
    #[serde(default)]
    pub stroke: Option<super::composition::TextStroke>,
}

fn id(layer: &Layer) -> &str {
    match &layer.content {
        LayerContent::Group { id, .. } => id,
        LayerContent::Element { element } => &element.id,
    }
}

fn subtree(definition: &Definition, root: &str) -> Result<HashSet<String>> {
    ensure!(
        definition.layers.iter().any(|layer| id(layer) == root),
        "unknown layer"
    );
    let mut ids = HashSet::from([root.to_owned()]);
    loop {
        let size = ids.len();
        for layer in &definition.layers {
            if layer
                .parent_id
                .as_ref()
                .is_some_and(|parent| ids.contains(parent))
            {
                ids.insert(id(layer).to_owned());
            }
        }
        if ids.len() == size {
            return Ok(ids);
        }
    }
}

fn retain_resolved_layout(
    definition: &mut Definition,
    projected: &Template,
    layer_id: &str,
) -> Result<()> {
    ensure!(
        !definition
            .spatial_relations
            .iter()
            .any(|r| r.element_id == layer_id
                && r.reference_bounds == super::composition::SpatialBounds::TextBox),
        "detaching a text-box attachment requires measured placement writeback"
    );
    let resolved = &projected
        .elements
        .iter()
        .find(|element| element.id == layer_id)
        .context("missing attached element")?
        .region;
    let layer = definition
        .layers
        .iter()
        .find(|layer| id(layer) == layer_id)
        .context("unknown layer")?;
    let parent_region = layer
        .parent_id
        .as_ref()
        .map(|parent| definition.canvas_region(parent))
        .transpose()?
        .unwrap_or(Rect {
            x: 0.,
            y: 0.,
            width: 1.,
            height: 1.,
        });
    if let LayerContent::Element { element } = &mut definition
        .layers
        .iter_mut()
        .find(|layer| id(layer) == layer_id)
        .unwrap()
        .content
    {
        element.region = Rect {
            x: (resolved.x - parent_region.x) / parent_region.width,
            y: (resolved.y - parent_region.y) / parent_region.height,
            width: resolved.width / parent_region.width,
            height: resolved.height / parent_region.height,
        };
    }
    Ok(())
}

pub fn edit(input: Edit) -> Result<Value> {
    if let Operation::DetachInFrame {
        layer_id,
        attached,
        independent,
    } = &input.operation
    {
        ensure!(
            attached.scene_time == independent.scene_time
                && attached.local_time == independent.local_time,
            "detach measurements must describe the same frame"
        );
        let (sx, sy, rotation) = pose_axes(attached)?;
        let (ix, iy, initial_rotation) = pose_axes(independent)?;
        let mut definition = detached_preview_definition(input.definition, layer_id)?;
        let layer = definition
            .layers
            .iter_mut()
            .find(|layer| id(layer) == layer_id)
            .context("unknown layer")?;
        let LayerContent::Element { element } = &mut layer.content else {
            anyhow::bail!("detaching requires a visual leaf")
        };
        // Bake only a static correction at the chosen frame. The leaf's own
        // animation stays editable; the former parent's motion is not inherited.
        let (fx, fy) = (sx / ix, sy / iy);
        if (fx - 1.).abs() > 1e-10 || (fy - 1.).abs() > 1e-10 {
            if let Some(index) = element
                .motions
                .iter()
                .position(|m| m.property == MotionProperty::Scale)
            {
                let mut uniform = element.motions.remove(index);
                uniform.property = MotionProperty::ScaleX;
                element.motions.push(uniform.clone());
                uniform.property = MotionProperty::ScaleY;
                element.motions.push(uniform);
            }
            adjust_motion(element, MotionProperty::ScaleX, true, fx);
            adjust_motion(element, MotionProperty::ScaleY, true, fy);
        }
        let angle = (rotation - initial_rotation + 180.).rem_euclid(360.) - 180.;
        if angle.abs() > 1e-10 {
            adjust_motion(element, MotionProperty::Rotation, false, angle);
        }
        for (property, delta) in [
            (
                MotionProperty::X,
                attached.position[0] - independent.position[0],
            ),
            (
                MotionProperty::Y,
                attached.position[1] - independent.position[1],
            ),
        ] {
            if delta.abs() > 1e-10 {
                adjust_motion(element, property, false, delta);
            }
        }
        definition.project(&BTreeMap::new())?;
        return Ok(json!({"definition":definition,"selectedLayerId":layer_id}));
    }
    if let Operation::ScaleInFrame {
        layer_id,
        delta,
        diagonal,
        pivot_to_origin,
        basis,
        axis,
        visual_basis,
    } = &input.operation
    {
        input.definition.project(&BTreeMap::new())?;
        ensure!(
            delta
                .iter()
                .chain(diagonal)
                .chain(pivot_to_origin)
                .chain(basis)
                .all(|v| v.is_finite()),
            "frame scaling must be finite"
        );
        let length = diagonal[0] * diagonal[0] + diagonal[1] * diagonal[1];
        ensure!(length >= 1., "frame scaling requires a visible diagonal");
        let factor = 1. + (delta[0] * diagonal[0] + delta[1] * diagonal[1]) / length;
        ensure!(
            factor.is_finite() && (0.05..=20.).contains(&factor),
            "frame scale factor must be between 0.05 and 20"
        );
        let [a, b, c, d] = *basis;
        let det = a * d - b * c;
        ensure!(
            det.is_finite() && det.abs() >= 1e-12,
            "cannot scale through a singular frame transform"
        );
        let mut displacement = *pivot_to_origin;
        if let Some(relation) = input
            .definition
            .spatial_relations
            .iter()
            .find(|r| &r.element_id == layer_id && r.size_binding.is_some())
        {
            let (_, anchor, _) = relation.placement.anchors();
            if anchor != [0.5, 0.5] {
                let [va, vb, vc, vd] =
                    visual_basis.context("size-bound edge scaling requires a visual basis")?;
                ensure!(
                    [va, vb, vc, vd].iter().all(|v| v.is_finite()),
                    "invalid visual basis for size-bound scaling"
                );
                let source = input
                    .definition
                    .canvas
                    .width
                    .min(input.definition.canvas.height) as f64;
                let (x, y) = ((anchor[0] - 0.5) * source, (anchor[1] - 0.5) * source);
                // A size-bound graphic scales around its attachment anchor. The
                // renderer already moves its center; compensate only pivot→anchor.
                displacement[0] += va * x + vc * y;
                displacement[1] += vb * x + vd * y;
            }
        }
        if let Some(axis) = axis {
            let [va, vb, vc, vd] = visual_basis.context("axis scaling requires a visual basis")?;
            let determinant = va * vd - vb * vc;
            ensure!(
                [va, vb, vc, vd].iter().all(|v| v.is_finite())
                    && determinant.is_finite()
                    && determinant.abs() >= 1e-12,
                "invalid visual basis for axis scaling"
            );
            let x = (vd * displacement[0] - vc * displacement[1]) / determinant;
            let y = (-vb * displacement[0] + va * displacement[1]) / determinant;
            displacement = match axis {
                FrameScaleAxis::X => [va * x, vb * x],
                FrameScaleAxis::Y => [vc * y, vd * y],
            };
        }
        let dx = (factor - 1.) * displacement[0];
        let dy = (factor - 1.) * displacement[1];
        let local_x = (d * dx - c * dy) / det;
        let local_y = (-b * dx + a * dy) / det;
        let mut definition = input.definition;
        let attached = definition
            .spatial_relations
            .iter()
            .any(|r| &r.element_id == layer_id);
        ensure!(
            !definition
                .spatial_relations
                .iter()
                .any(|r| &r.element_id == layer_id
                    && r.follow_motion
                    && r.reference_bounds == super::composition::SpatialBounds::Layout),
            "frame scaling a layout attachment requires activation-pose measurement"
        );
        let layer = definition
            .layers
            .iter_mut()
            .find(|l| id(l) == layer_id)
            .context("unknown layer")?;
        let LayerContent::Element { element } = &mut layer.content else {
            anyhow::bail!("frame scaling requires a visual leaf")
        };
        if axis.is_some() {
            if let Some(index) = element
                .motions
                .iter()
                .position(|m| m.property == MotionProperty::Scale)
            {
                let mut uniform = element.motions.remove(index);
                uniform.property = MotionProperty::ScaleX;
                element.motions.push(uniform.clone());
                uniform.property = MotionProperty::ScaleY;
                element.motions.push(uniform);
            }
        }
        let axis_channels = element
            .motions
            .iter()
            .any(|m| matches!(m.property, MotionProperty::ScaleX | MotionProperty::ScaleY));
        let mut adjust = |property: MotionProperty, multiply: bool, value: f64| {
            if let Some(motion) = element
                .motions
                .iter_mut()
                .find(|motion| motion.property == property)
            {
                for key in &mut motion.keys {
                    key.value = if multiply {
                        key.value * value
                    } else {
                        key.value + value
                    };
                }
            } else {
                element.motions.push(Motion {
                    property,
                    keys: vec![
                        MotionKey {
                            time: 0.,
                            value,
                            easing: Easing::Linear,
                        },
                        MotionKey {
                            time: 1.,
                            value,
                            easing: Easing::Linear,
                        },
                    ],
                });
            }
        };
        // Axis channels stay independent; existing timing/easing and zero-scale
        // entrances are preserved instead of replacing them with a static pose.
        match axis {
            Some(FrameScaleAxis::X) => adjust(MotionProperty::ScaleX, true, factor),
            Some(FrameScaleAxis::Y) => adjust(MotionProperty::ScaleY, true, factor),
            None if axis_channels => {
                adjust(MotionProperty::ScaleX, true, factor);
                adjust(MotionProperty::ScaleY, true, factor);
            }
            None => adjust(MotionProperty::Scale, true, factor),
        }
        if !attached {
            if local_x.abs() > 1e-12 {
                adjust(MotionProperty::X, false, local_x);
            }
            if local_y.abs() > 1e-12 {
                adjust(MotionProperty::Y, false, local_y);
            }
        }
        if let Some(relation) = definition
            .spatial_relations
            .iter_mut()
            .find(|r| &r.element_id == layer_id)
        {
            relation.offset_x += local_x / definition.canvas.width as f64;
            relation.offset_y += local_y / definition.canvas.height as f64;
        }
        definition.project(&BTreeMap::new())?;
        return Ok(json!({"definition":definition,"selectedLayerId":layer_id}));
    }
    if let Operation::MoveInFrame {
        layer_id,
        delta_x,
        delta_y,
        basis,
    } = &input.operation
    {
        ensure!(
            !input
                .definition
                .spatial_relations
                .iter()
                .any(|r| &r.element_id == layer_id
                    && r.follow_motion
                    && r.reference_bounds == super::composition::SpatialBounds::Layout),
            "frame dragging a layout attachment requires activation-pose measurement"
        );
        let [a, b, c, d] = *basis;
        ensure!(
            basis.iter().all(|value| value.is_finite())
                && delta_x.is_finite()
                && delta_y.is_finite(),
            "frame movement must be finite"
        );
        let determinant = a * d - b * c;
        ensure!(
            determinant.is_finite() && determinant.abs() >= 1e-12,
            "cannot move through a singular frame transform"
        );
        let x = (d * delta_x - c * delta_y) / determinant / input.definition.canvas.width as f64;
        let y = (-b * delta_x + a * delta_y) / determinant / input.definition.canvas.height as f64;
        // Measured text can be much narrower than its authored layout. Clamping
        // against that invisible rectangle would truncate an otherwise valid drag.
        let mut definition = input.definition;
        if let Some(relation) = definition
            .spatial_relations
            .iter_mut()
            .find(|r| &r.element_id == layer_id)
        {
            relation.offset_x += x;
            relation.offset_y += y;
            definition.project(&BTreeMap::new())?;
            return Ok(json!({"definition":definition,"selectedLayerId":layer_id}));
        }
        return edit(Edit {
            definition,
            operation: Operation::Move {
                layer_id: layer_id.clone(),
                delta_x: x,
                delta_y: y,
            },
        });
    }
    let mut definition = input.definition;
    // A geometry repair can resolve a draft's pending shape/style change. Apply
    // only the requested field first, then validate the complete resulting draft.
    if let Operation::RectangleGeometry {
        layer_id,
        rectangle_geometry,
    } = &input.operation
    {
        let layer = definition
            .layers
            .iter_mut()
            .find(|layer| id(layer) == layer_id)
            .context("unknown layer")?;
        let LayerContent::Element { element } = &mut layer.content else {
            anyhow::bail!("rectangle geometry requires an element")
        };
        ensure!(
            rectangle_geometry.is_none()
                || element.features.representation == Representation::Rectangle,
            "rectangle geometry requires a rectangle"
        );
        element.rectangle_geometry = rectangle_geometry.clone();
        definition.project(&BTreeMap::new())?;
        return Ok(json!({"definition":definition,"selectedLayerId":layer_id}));
    }
    if let Operation::StarGeometry {
        layer_id,
        star_geometry,
    } = &input.operation
    {
        let layer = definition
            .layers
            .iter_mut()
            .find(|l| id(l) == layer_id)
            .context("unknown layer")?;
        let LayerContent::Element { element } = &mut layer.content else {
            anyhow::bail!("star geometry requires an element")
        };
        ensure!(
            star_geometry.is_none() || element.features.representation == Representation::Star,
            "star geometry requires a star"
        );
        element.star_geometry = star_geometry.clone();
        definition.project(&BTreeMap::new())?;
        return Ok(json!({"definition":definition,"selectedLayerId":layer_id}));
    }
    if let Operation::EllipseArc {
        layer_id,
        ellipse_arc,
    } = &input.operation
    {
        let layer = definition
            .layers
            .iter_mut()
            .find(|layer| id(layer) == layer_id)
            .context("unknown layer")?;
        let LayerContent::Element { element } = &mut layer.content else {
            anyhow::bail!("ellipse arc requires an element")
        };
        ensure!(
            ellipse_arc.is_none() || element.features.representation == Representation::Ellipse,
            "ellipse arc requires an ellipse"
        );
        element.ellipse_arc = ellipse_arc.clone();
        definition.project(&BTreeMap::new())?;
        return Ok(json!({"definition":definition,"selectedLayerId":layer_id}));
    }
    if let Operation::Outline { layer_id, enabled } = &input.operation {
        let layer = definition
            .layers
            .iter_mut()
            .find(|layer| id(layer) == layer_id)
            .context("unknown layer")?;
        let LayerContent::Element { element } = &mut layer.content else {
            anyhow::bail!("outline requires a shape element")
        };
        ensure!(
            matches!(
                element.features.representation,
                Representation::Rectangle
                    | Representation::Ellipse
                    | Representation::Star
                    | Representation::Line
            ),
            "outline requires a native shape"
        );
        element.features.outline = *enabled;
        definition.project(&BTreeMap::new())?;
        return Ok(json!({"definition":definition,"selectedLayerId":layer_id}));
    }
    // Relation repair must validate the result, not reject the very stale relation
    // being removed. Preserve all other unsaved draft fields and validate them below.
    if let Operation::ReadingReplica {
        layer_id,
        primary_id,
    } = &input.operation
    {
        ensure!(
            definition.layers.iter().any(|layer| id(layer) == layer_id),
            "unknown reading replica layer"
        );
        definition
            .reading_replicas
            .retain(|r| &r.element_id != layer_id);
        if let Some(primary_id) = primary_id {
            definition
                .reading_replicas
                .push(super::composition::ReadingReplica {
                    element_id: layer_id.clone(),
                    primary_id: primary_id.clone(),
                });
        }
        definition.project(&BTreeMap::new())?;
        return Ok(json!({"definition":definition,"selectedLayerId":layer_id}));
    }
    let projected = definition.project(&BTreeMap::new())?;
    if let Operation::Align { layer_id, .. } | Operation::PlaceBeside { layer_id, .. } =
        &input.operation
    {
        ensure!(
            !definition
                .spatial_relations
                .iter()
                .any(|r| &r.element_id == layer_id),
            "detach spatial relation before one-time positioning"
        );
    }
    let attached_edit = match &input.operation {
        Operation::Move { layer_id, .. } | Operation::Resize { layer_id, .. } => definition
            .spatial_relations
            .iter()
            .any(|r| &r.element_id == layer_id)
            .then_some(layer_id.clone()),
        _ => None,
    };
    if let Some(layer_id) = attached_edit {
        let old = &projected
            .elements
            .iter()
            .find(|element| element.id == layer_id)
            .context("missing attached element")?
            .region;
        let mut next = old.clone();
        match &input.operation {
            Operation::Move {
                delta_x, delta_y, ..
            } => {
                ensure!(
                    delta_x.is_finite() && delta_y.is_finite(),
                    "movement must be finite"
                );
                next.x = (old.x + delta_x).clamp(0., 1. - old.width);
                next.y = (old.y + delta_y).clamp(0., 1. - old.height);
            }
            Operation::Resize {
                corner,
                delta_x,
                delta_y,
                ..
            } => {
                ensure!(
                    delta_x.is_finite() && delta_y.is_finite(),
                    "resize must be finite"
                );
                (next.x, next.width) = resize_axis(
                    old.x,
                    old.width,
                    *delta_x,
                    matches!(corner, ResizeCorner::TopLeft | ResizeCorner::BottomLeft),
                    1. / definition.canvas.width as f64,
                );
                (next.y, next.height) = resize_axis(
                    old.y,
                    old.height,
                    *delta_y,
                    matches!(corner, ResizeCorner::TopLeft | ResizeCorner::TopRight),
                    1. / definition.canvas.height as f64,
                );
            }
            _ => unreachable!(),
        }
        let raw = definition.canvas_region(&layer_id)?;
        let layer = definition
            .layers
            .iter_mut()
            .find(|layer| id(layer) == layer_id)
            .unwrap();
        if let LayerContent::Element { element } = &mut layer.content {
            element.region.width *= next.width / raw.width;
            element.region.height *= next.height / raw.height;
        }
        let relation = definition
            .spatial_relations
            .iter_mut()
            .find(|r| r.element_id == layer_id)
            .unwrap();
        use super::composition::SpatialPlacement;
        let anchor_dx = match relation.placement {
            SpatialPlacement::Left => old.width - next.width,
            SpatialPlacement::Right => 0.,
            _ => (old.width - next.width) / 2.,
        };
        let anchor_dy = match relation.placement {
            SpatialPlacement::Above => old.height - next.height,
            SpatialPlacement::Below => 0.,
            _ => (old.height - next.height) / 2.,
        };
        relation.offset_x += next.x - old.x - anchor_dx;
        relation.offset_y += next.y - old.y - anchor_dy;
        definition.project(&BTreeMap::new())?;
        return Ok(json!({"definition":definition,"selectedLayerId":layer_id}));
    }
    let selected_id = match input.operation {
        Operation::DetachInFrame { .. } => {
            unreachable!("frame detach is handled before layout editing")
        }
        Operation::ScaleInFrame { .. } => {
            unreachable!("frame scaling is handled before layout editing")
        }
        Operation::MoveInFrame { .. } => {
            unreachable!("frame movement is normalized before editing")
        }
        Operation::Resize {
            layer_id,
            corner,
            delta_x,
            delta_y,
        } => {
            ensure!(
                delta_x.is_finite() && delta_y.is_finite(),
                "resize deltas must be finite"
            );
            let canvas_region = definition.canvas_region(&layer_id)?;
            let layer = definition
                .layers
                .iter_mut()
                .find(|layer| id(layer) == layer_id)
                .context("unknown layer")?;
            let region = match &mut layer.content {
                LayerContent::Element { element } => &mut element.region,
                LayerContent::Group { region, .. } => region,
            };
            let parent_width = canvas_region.width / region.width;
            let parent_height = canvas_region.height / region.height;
            (region.x, region.width) = resize_axis(
                region.x,
                region.width,
                delta_x / parent_width,
                matches!(corner, ResizeCorner::TopLeft | ResizeCorner::BottomLeft),
                1.0 / definition.canvas.width as f64 / parent_width,
            );
            (region.y, region.height) = resize_axis(
                region.y,
                region.height,
                delta_y / parent_height,
                matches!(corner, ResizeCorner::TopLeft | ResizeCorner::TopRight),
                1.0 / definition.canvas.height as f64 / parent_height,
            );
            layer_id
        }
        Operation::Move {
            layer_id,
            delta_x,
            delta_y,
        } => {
            ensure!(
                delta_x.is_finite() && delta_y.is_finite(),
                "movement must be finite"
            );
            let canvas_region = definition.canvas_region(&layer_id)?;
            let layer = definition
                .layers
                .iter_mut()
                .find(|layer| id(layer) == layer_id)
                .context("unknown layer")?;
            let region = match &mut layer.content {
                LayerContent::Element { element } => &mut element.region,
                LayerContent::Group { region, .. } => region,
            };
            let parent_width = canvas_region.width / region.width;
            let parent_height = canvas_region.height / region.height;
            region.x =
                (region.x + delta_x / parent_width).clamp(0.0, (1.0 - region.width).max(0.0));
            region.y =
                (region.y + delta_y / parent_height).clamp(0.0, (1.0 - region.height).max(0.0));
            layer_id
        }
        Operation::PlaceBeside {
            layer_id,
            reference_id,
            side,
            gap,
        } => {
            ensure!(
                gap.is_finite() && (0.0..=1.0).contains(&gap),
                "gap must be between 0 and 1"
            );
            ensure!(layer_id != reference_id, "reference must be another layer");
            let reference = definition
                .layers
                .iter()
                .find(|layer| id(layer) == reference_id)
                .context("unknown reference layer")?;
            let parent = reference.parent_id.clone();
            let reference_region = match &reference.content {
                LayerContent::Group { region, .. } => region.clone(),
                LayerContent::Element { element } => element.region.clone(),
            };
            let layer = definition
                .layers
                .iter_mut()
                .find(|layer| id(layer) == layer_id)
                .context("unknown layer")?;
            ensure!(
                layer.parent_id == parent,
                "relative placement requires layers in the same container"
            );
            let region = match &mut layer.content {
                LayerContent::Group { region, .. } => region,
                LayerContent::Element { element } => &mut element.region,
            };
            match side {
                PlacementSide::Left | PlacementSide::Right => {
                    region.x = if matches!(side, PlacementSide::Left) {
                        reference_region.x - gap - region.width
                    } else {
                        reference_region.x + reference_region.width + gap
                    };
                    region.y = reference_region.y + (reference_region.height - region.height) / 2.0;
                }
                PlacementSide::Above | PlacementSide::Below => {
                    region.y = if matches!(side, PlacementSide::Above) {
                        reference_region.y - gap - region.height
                    } else {
                        reference_region.y + reference_region.height + gap
                    };
                    region.x = reference_region.x + (reference_region.width - region.width) / 2.0;
                }
            }
            ensure!(
                region.x >= 0.0
                    && region.y >= 0.0
                    && region.x + region.width <= 1.0 + 1e-12
                    && region.y + region.height <= 1.0 + 1e-12,
                "参照图层旁的空间不足，请减小尺寸、间距或更换方向。"
            );
            layer_id
        }
        Operation::Align {
            layer_id,
            alignment,
        } => {
            let layer = definition
                .layers
                .iter_mut()
                .find(|layer| id(layer) == layer_id)
                .context("unknown layer")?;
            let region = match &mut layer.content {
                LayerContent::Group { region, .. } => region,
                LayerContent::Element { element } => &mut element.region,
            };
            // Layer regions are normalized in their parent's coordinate space.
            match alignment {
                Alignment::Left => region.x = 0.0,
                Alignment::Center => region.x = (1.0 - region.width) / 2.0,
                Alignment::Right => region.x = 1.0 - region.width,
                Alignment::Top => region.y = 0.0,
                Alignment::Middle => region.y = (1.0 - region.height) / 2.0,
                Alignment::Bottom => region.y = 1.0 - region.height,
            }
            layer_id
        }
        Operation::Stack { layer_id, position } => {
            let current = definition
                .layers
                .iter()
                .find(|layer| id(layer) == layer_id)
                .context("unknown layer")?;
            let LayerContent::Element { element } = &current.content else {
                anyhow::bail!("stack position requires an element")
            };
            let other_z: Vec<i32> = definition
                .layers
                .iter()
                .filter_map(|layer| match &layer.content {
                    LayerContent::Element { element } if element.id != layer_id => Some(element.z),
                    _ => None,
                })
                .collect();
            let z = match position {
                StackPosition::Front => match other_z.iter().max() {
                    Some(top) if element.z <= *top => {
                        top.checked_add(1).context("layer order overflow")?
                    }
                    _ => element.z,
                },
                StackPosition::Back => match other_z.iter().min() {
                    Some(bottom) if element.z >= *bottom => {
                        bottom.checked_sub(1).context("layer order overflow")?
                    }
                    _ => element.z,
                },
            };
            let layer = definition
                .layers
                .iter_mut()
                .find(|layer| id(layer) == layer_id)
                .unwrap();
            if let LayerContent::Element { element } = &mut layer.content {
                element.z = z;
            }
            layer_id
        }
        Operation::Envelope {
            layer_id,
            entrance,
            enter_seconds,
            exit_seconds,
        } => {
            let template = element_edit::apply_envelope(element_edit::ApplyEnvelope {
                template: definition.project(&BTreeMap::new())?,
                element_id: layer_id.clone(),
                entrance,
                enter_seconds,
                exit_seconds,
            })?;
            let authored = template
                .elements
                .iter()
                .find(|element| element.id == layer_id)
                .context("unknown element")?;
            let layer = definition
                .layers
                .iter_mut()
                .find(|layer| id(layer) == layer_id)
                .context("unknown layer")?;
            let LayerContent::Element { element } = &mut layer.content else {
                anyhow::bail!("envelope requires an element")
            };
            element.motions = authored.motions.clone();
            element.motion_timing = authored.motion_timing.clone();
            layer_id
        }
        Operation::HighlightTreatment {
            layer_id,
            treatment_id,
            highlight,
        } => {
            use super::composition::TreatmentOperation;
            let mut applies = false;
            for application in &definition.applications {
                if application.treatment_id != treatment_id {
                    continue;
                }
                applies |= match &application.target {
                    Target::Element(id) => id == &layer_id,
                    Target::Group(id) => subtree(&definition, id)?.contains(&layer_id),
                    Target::Layout(_) => false,
                };
            }
            ensure!(
                applies,
                "highlight treatment does not apply to selected layer"
            );
            let treatment = definition
                .treatments
                .iter_mut()
                .find(|item| item.id == treatment_id)
                .context("unknown highlight treatment")?;
            ensure!(
                matches!(
                    treatment.operation,
                    TreatmentOperation::TextHighlight { .. }
                ),
                "treatment is not a text highlight"
            );
            if let Some(highlight) = highlight {
                treatment.operation = TreatmentOperation::TextHighlight {
                    color: highlight.color,
                    mode: highlight.mode,
                    stroke: highlight.stroke,
                };
            } else {
                definition
                    .applications
                    .retain(|item| item.treatment_id != treatment_id);
                definition.treatments.retain(|item| item.id != treatment_id);
            }
            layer_id
        }
        Operation::GroupFade {
            layer_id,
            exit_seconds,
            enter_seconds,
        } => {
            use super::composition::{Treatment, TreatmentApplication, TreatmentOperation};
            ensure!(definition.layers.iter().any(|layer| matches!(&layer.content,LayerContent::Group {id,composite:true,..} if id==&layer_id)), "group fade requires an isolated composite container");
            let treatment_id = format!("group-fade-{layer_id}");
            if let Some(existing) = definition.treatments.iter().find(|t| t.id == treatment_id) {
                ensure!(
                    matches!(&existing.operation,TreatmentOperation::Motion {channels,repeat_seconds:None,..} if channels.len()==1 && channels[0].property==MotionProperty::Opacity),
                    "group fade treatment ID is occupied"
                );
                ensure!(
                    definition
                        .applications
                        .iter()
                        .filter(|a| a.treatment_id == treatment_id)
                        .all(|a| matches!(&a.target,Target::Group(id) if id==&layer_id)),
                    "group fade is shared with another target"
                );
            }
            let inherited_coverage = definition
                .treatments
                .iter()
                .find(|t| t.id == treatment_id)
                .and_then(|t| match &t.operation {
                    TreatmentOperation::Motion {
                        motion_timing: Some(timing),
                        ..
                    } => timing.coverage.clone(),
                    _ => None,
                });
            let inherited_enter = definition
                .treatments
                .iter()
                .find(|t| t.id == treatment_id)
                .and_then(|t| match &t.operation {
                    TreatmentOperation::Motion {
                        motion_timing: Some(timing),
                        ..
                    } => Some(timing.enter_seconds),
                    _ => None,
                })
                .unwrap_or(0.);
            let enter = enter_seconds.unwrap_or(inherited_enter);
            ensure!(
                enter.is_finite() && (0.0..=30.0).contains(&enter),
                "invalid group entrance budget"
            );
            definition.treatments.retain(|t| t.id != treatment_id);
            definition
                .applications
                .retain(|a| a.treatment_id != treatment_id);
            if let Some(seconds) = exit_seconds {
                ensure!(
                    seconds.is_finite() && (0.0..=30.0).contains(&seconds),
                    "invalid group fade seconds"
                );
                definition.treatments.push(Treatment {
                    id: treatment_id.clone(),
                    operation: TreatmentOperation::Motion {
                        channels: vec![Motion {
                            property: MotionProperty::Opacity,
                            keys: vec![
                                MotionKey {
                                    time: 0.,
                                    value: 1.,
                                    easing: Easing::Linear,
                                },
                                MotionKey {
                                    time: 0.8,
                                    value: 1.,
                                    easing: Easing::Linear,
                                },
                                MotionKey {
                                    time: 1.,
                                    value: 0.,
                                    easing: Easing::Linear,
                                },
                            ],
                        }],
                        repeat_seconds: None,
                        motion_timing: Some(MotionTiming {
                            coverage: inherited_coverage,
                            enter_end: 0.2,
                            exit_start: 0.8,
                            enter_seconds: enter,
                            exit_seconds: seconds,
                        }),
                    },
                });
                definition.applications.push(TreatmentApplication {
                    treatment_id,
                    target: Target::Group(layer_id.clone()),
                    enabled: true,
                });
            }
            layer_id
        }
        Operation::GroupInstances {
            layer_id,
            separate_instances,
        } => {
            let layer = definition
                .layers
                .iter_mut()
                .find(|layer| id(layer) == layer_id)
                .context("unknown layer")?;
            let LayerContent::Group {
                separate_instances: value,
                ..
            } = &mut layer.content
            else {
                anyhow::bail!("group instances requires a container")
            };
            *value = separate_instances;
            layer_id
        }
        Operation::GroupCompositing {
            layer_id,
            composite,
        } => {
            let layer = definition
                .layers
                .iter_mut()
                .find(|layer| id(layer) == layer_id)
                .context("unknown layer")?;
            let LayerContent::Group {
                composite: value, ..
            } = &mut layer.content
            else {
                anyhow::bail!("group compositing requires a container")
            };
            *value = composite;
            layer_id
        }
        Operation::RectangleGeometry { .. }
        | Operation::StarGeometry { .. }
        | Operation::EllipseArc { .. }
        | Operation::Outline { .. } => {
            unreachable!("shape field edits validate their final draft before layout editing")
        }
        Operation::SemanticRole { layer_id, role } => {
            let layer = definition
                .layers
                .iter_mut()
                .find(|layer| id(layer) == layer_id)
                .context("unknown layer")?;
            let LayerContent::Element { element } = &mut layer.content else {
                anyhow::bail!("semantic role requires an element")
            };
            element.features.role = role;
            layer_id
        }
        Operation::DetachStyle { layer_id } => {
            let index = definition
                .layers
                .iter()
                .position(|layer| id(layer) == layer_id)
                .context("unknown layer")?;
            let LayerContent::Element { element } = &definition.layers[index].content else {
                anyhow::bail!("independent style requires an element")
            };
            let style_id = element
                .style_id
                .as_ref()
                .context("element has no visual style")?
                .clone();
            let references = definition.layers.iter().filter(|layer|
                matches!(&layer.content, LayerContent::Element { element } if element.style_id.as_ref() == Some(&style_id))
            ).count();
            if references > 1 {
                let mut style = definition
                    .styles
                    .iter()
                    .find(|style| style.id == style_id)
                    .context("unknown visual style")?
                    .clone();
                style.id = format!("style-{}", crate::domain::id());
                if let LayerContent::Element { element } = &mut definition.layers[index].content {
                    element.style_id = Some(style.id.clone());
                }
                definition.styles.push(style);
            }
            layer_id
        }
        Operation::TextPresentation {
            layer_id,
            binding,
            highlight,
        } => {
            use super::composition::{Treatment, TreatmentApplication, TreatmentOperation};
            ensure!(
                matches!(
                    binding,
                    Binding::Literal | Binding::Sentence | Binding::Keyword
                ),
                "text presentation requires literal, sentence or keyword binding"
            );
            let highlighted: HashSet<_> = definition
                .treatments
                .iter()
                .filter(|treatment| {
                    matches!(
                        treatment.operation,
                        TreatmentOperation::TextHighlight { .. }
                    )
                })
                .map(|treatment| treatment.id.clone())
                .collect();
            for application in &definition.applications {
                if application.enabled && highlighted.contains(&application.treatment_id) {
                    if let Target::Group(group) = &application.target {
                        ensure!(
                            !subtree(&definition, group)?.contains(&layer_id),
                            "text inherits a group highlight; edit the group treatment first"
                        );
                    }
                }
            }
            let layer = definition
                .layers
                .iter_mut()
                .find(|layer| id(layer) == layer_id)
                .context("unknown layer")?;
            let LayerContent::Element { element } = &mut layer.content else {
                anyhow::bail!("text presentation requires an element")
            };
            ensure!(
                element.features.representation == Representation::Text,
                "text presentation requires text"
            );
            // Content binding is independent of scheduling. Creation supplies defaults.
            element.binding = binding;
            let affected: HashSet<_> = definition
                .applications
                .iter()
                .filter(|application| {
                    highlighted.contains(&application.treatment_id)
                        && matches!(&application.target,Target::Element(id) if id == &layer_id)
                })
                .map(|application| application.treatment_id.clone())
                .collect();
            definition.applications.retain(|application| {
                !(highlighted.contains(&application.treatment_id)
                    && matches!(&application.target,Target::Element(id) if id == &layer_id))
            });
            definition.treatments.retain(|treatment| {
                !affected.contains(&treatment.id)
                    || definition
                        .applications
                        .iter()
                        .any(|application| application.treatment_id == treatment.id)
            });
            if let Some(highlight) = highlight {
                let treatment_id = format!("highlight-{}", crate::domain::id());
                definition.treatments.push(Treatment {
                    id: treatment_id.clone(),
                    operation: TreatmentOperation::TextHighlight {
                        mode: highlight.mode,
                        color: highlight.color,
                        stroke: highlight.stroke,
                    },
                });
                definition.applications.push(TreatmentApplication {
                    treatment_id,
                    target: Target::Element(layer_id.clone()),
                    enabled: true,
                });
            }
            layer_id
        }
        Operation::Entrance {
            layer_id,
            entrance,
            duration_fraction,
        } => {
            let template = element_edit::apply_entrance(element_edit::ApplyEntrance {
                template: definition.project(&BTreeMap::new())?,
                element_id: layer_id.clone(),
                entrance,
                duration_fraction,
            })?;
            let motions = &template
                .elements
                .iter()
                .find(|element| element.id == layer_id)
                .context("unknown element")?
                .motions;
            let layer = definition
                .layers
                .iter_mut()
                .find(|layer| id(layer) == layer_id)
                .context("unknown layer")?;
            let LayerContent::Element { element } = &mut layer.content else {
                anyhow::bail!("entrance requires an element")
            };
            element.motions = motions.clone();
            layer_id
        }
        Operation::Add {
            representation,
            parent_id,
        } => {
            if let Some(parent) = &parent_id {
                ensure!(definition.layers.iter().any(|layer| matches!(&layer.content, LayerContent::Group {id,..} if id == parent)), "parent must be a group");
            }
            let (mut projected, new_id) = element_edit::add(element_edit::Add {
                template: definition.project(&BTreeMap::new())?,
                representation,
            })?;
            let mut element = projected.elements.pop().context("missing new element")?;
            if element.features.representation == Representation::Star
                && let Some(parent) = &parent_id
            {
                // Added children use parent-local coordinates. Base the default
                // square on the parent's projected pixel size, including every
                // ancestor, so a nonuniform group does not flatten a new star.
                let region = definition.canvas_region(parent)?;
                let parent_width = region.width * f64::from(definition.canvas.width);
                let parent_height = region.height * f64::from(definition.canvas.height);
                let side = 0.2 * parent_width.min(parent_height);
                let width = side / parent_width;
                let height = side / parent_height;
                element.region = Rect {
                    x: (1. - width) / 2.,
                    y: (1. - height) / 2.,
                    width,
                    height,
                };
            }
            element.features.avoid_protected_regions = false;
            if element.features.representation == Representation::Text {
                definition.inputs.push(TextInput {
                    id: format!("input-{}", crate::domain::id()),
                    label: element.description.clone(),
                    default: element.literal.clone().unwrap_or_else(|| "新文字".into()),
                    max_characters: 200,
                    layer_ids: vec![new_id.clone()],
                });
            }
            definition
                .styles
                .push(projected.styles.pop().context("missing new style")?);
            definition.layers.push(Layer {
                parent_id,
                content: LayerContent::Element { element },
            });
            new_id
        }
        Operation::ReadingReplica { .. } => {
            unreachable!("reading relation handled before projection")
        }
        Operation::SpatialRelation { layer_id, relation } => {
            ensure!(definition.layers.iter().any(|layer| matches!(&layer.content,LayerContent::Element {element} if element.id == layer_id)), "spatial relation requires an element");
            if relation.is_none() {
                retain_resolved_layout(&mut definition, &projected, &layer_id)?;
            }
            definition
                .spatial_relations
                .retain(|r| r.element_id != layer_id);
            if let Some(relation) = relation {
                ensure!(
                    relation.element_id == layer_id,
                    "spatial relation target mismatch"
                );
                definition.spatial_relations.push(relation);
            }
            layer_id
        }
        Operation::Duplicate { layer_id } => {
            let ids = subtree(&definition, &layer_id)?;
            let map: BTreeMap<_, _> = ids
                .iter()
                .map(|id| (id.clone(), format!("layer-{}", crate::domain::id())))
                .collect();
            let mut style_map = BTreeMap::new();
            let mut slot_map = BTreeMap::new();
            let mut copies = Vec::new();
            for layer in definition
                .layers
                .clone()
                .into_iter()
                .filter(|layer| ids.contains(id(layer)))
            {
                let mut copy = layer.clone();
                copy.parent_id = layer
                    .parent_id
                    .as_ref()
                    .map(|parent| map.get(parent).unwrap_or(parent).clone());
                match &mut copy.content {
                    LayerContent::Group { id, .. } => *id = map[id].clone(),
                    LayerContent::Element { element } => {
                        element.id = map[&element.id].clone();
                        element.description = format!("{} 副本", element.description);
                        element.exclusive_group = None;
                        if let Some(old) = &element.style_id {
                            let new = style_map
                                .entry(old.clone())
                                .or_insert_with(|| format!("style-{}", crate::domain::id()))
                                .clone();
                            element.style_id = Some(new);
                        }
                        if let Some(old) = &element.resource_id {
                            let new = slot_map
                                .entry(old.clone())
                                .or_insert_with(|| format!("slot-{}", crate::domain::id()))
                                .clone();
                            element.resource_id = Some(new);
                        }
                    }
                }
                copies.push(copy);
            }
            for (old, new) in style_map {
                let mut style = definition
                    .styles
                    .iter()
                    .find(|style| style.id == old)
                    .context("unknown style")?
                    .clone();
                style.id = new;
                definition.styles.push(style);
            }
            for (old, new) in slot_map {
                let mut slot = definition
                    .resource_slots
                    .iter()
                    .find(|slot| slot.id == old)
                    .context("unknown slot")?
                    .clone();
                slot.id = new.clone();
                definition.resource_slots.push(slot);
                if let Some(mut binding) = definition
                    .resource_bindings
                    .iter()
                    .find(|binding| binding.slot_id == old)
                    .cloned()
                {
                    binding.slot_id = new;
                    definition.resource_bindings.push(binding);
                }
            }
            // Preserve sharing inside the copied subtree, with no input/style ownership shared with its source.
            for input in definition.inputs.clone() {
                let layer_ids: Vec<_> = input
                    .layer_ids
                    .iter()
                    .filter_map(|id| map.get(id).cloned())
                    .collect();
                if !layer_ids.is_empty() {
                    definition.inputs.push(TextInput {
                        id: format!("input-{}", crate::domain::id()),
                        label: format!("{} 副本", input.label),
                        layer_ids,
                        ..input
                    });
                }
            }
            for mut application in definition.applications.clone() {
                let target = match &mut application.target {
                    Target::Element(id) | Target::Group(id) => id,
                    Target::Layout(_) => continue,
                };
                if let Some(new) = map.get(target) {
                    *target = new.clone();
                    definition.applications.push(application);
                }
            }
            for mut relation in definition.reading_replicas.clone() {
                if let Some(new) = map.get(&relation.element_id) {
                    relation.element_id = new.clone();
                    if let Some(primary) = map.get(&relation.primary_id) {
                        relation.primary_id = primary.clone();
                    }
                    definition.reading_replicas.push(relation);
                }
            }
            for mut relation in definition.spatial_relations.clone() {
                if let Some(new) = map.get(&relation.element_id) {
                    relation.element_id = new.clone();
                    if let Some(parent) = map.get(&relation.relative_to) {
                        relation.relative_to = parent.clone();
                    }
                    definition.spatial_relations.push(relation);
                }
            }
            definition.layers.extend(copies);
            map[&layer_id].clone()
        }
        Operation::Remove { layer_id } => {
            let mut ids = subtree(&definition, &layer_id)?;
            let detached: Vec<_> = definition
                .spatial_relations
                .iter()
                .filter(|relation| {
                    !ids.contains(&relation.element_id) && ids.contains(&relation.relative_to)
                })
                .map(|relation| relation.element_id.clone())
                .collect();
            for layer_id in detached {
                retain_resolved_layout(&mut definition, &projected, &layer_id)?;
            }
            let removed_elements: Vec<_> = definition
                .layers
                .iter()
                .filter_map(|layer| match &layer.content {
                    LayerContent::Element { element } if ids.contains(&element.id) => Some(element),
                    _ => None,
                })
                .collect();
            let affected_styles: HashSet<_> = removed_elements
                .iter()
                .filter_map(|element| element.style_id.clone())
                .collect();
            let affected_slots: HashSet<_> = removed_elements
                .iter()
                .filter_map(|element| element.resource_id.clone())
                .collect();
            definition.layers.retain(|layer| !ids.contains(id(layer)));
            definition
                .reading_replicas
                .retain(|r| !ids.contains(&r.element_id) && !ids.contains(&r.primary_id));
            definition.spatial_relations.retain(|relation| {
                !ids.contains(&relation.element_id) && !ids.contains(&relation.relative_to)
            });
            // Removing the last child also removes newly empty ancestors.
            loop {
                let empty: HashSet<_> = definition
                    .layers
                    .iter()
                    .filter(|layer| {
                        matches!(layer.content, LayerContent::Group { .. })
                            && !definition
                                .layers
                                .iter()
                                .any(|child| child.parent_id.as_deref() == Some(id(layer)))
                    })
                    .map(|layer| id(layer).to_owned())
                    .collect();
                if empty.is_empty() {
                    break;
                }
                definition.layers.retain(|layer| !empty.contains(id(layer)));
                ids.extend(empty);
            }
            ensure!(
                definition
                    .layers
                    .iter()
                    .any(|layer| matches!(layer.content, LayerContent::Element { .. })),
                "cannot remove the last element"
            );
            for input in &mut definition.inputs {
                input.layer_ids.retain(|id| !ids.contains(id));
            }
            definition
                .inputs
                .retain(|input| !input.layer_ids.is_empty());
            definition
                .applications
                .retain(|application| match &application.target {
                    Target::Element(id) | Target::Group(id) => !ids.contains(id),
                    Target::Layout(_) => false,
                });
            definition.styles.retain(|style| !affected_styles.contains(&style.id) || definition.layers.iter().any(|layer| matches!(&layer.content, LayerContent::Element {element} if element.style_id.as_ref() == Some(&style.id))));
            definition.resource_slots.retain(|slot| !affected_slots.contains(&slot.id) || definition.layers.iter().any(|layer| matches!(&layer.content, LayerContent::Element {element} if element.resource_id.as_ref() == Some(&slot.id))));
            definition.resource_bindings.retain(|binding| {
                definition
                    .resource_slots
                    .iter()
                    .any(|slot| slot.id == binding.slot_id)
            });
            id(definition
                .layers
                .iter()
                .find(|layer| matches!(layer.content, LayerContent::Element { .. }))
                .unwrap())
            .to_owned()
        }
    };
    definition.project(&BTreeMap::new())?;
    Ok(json!({"definition":definition,"selectedLayerId":selected_id}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn independent_style_copies_only_shared_visual_data_and_is_repeatable() {
        let (mut definition, child) = result(
            fixture(),
            Operation::Duplicate {
                layer_id: "headline".into(),
            },
        );
        let style_id = definition
            .layers
            .iter()
            .find_map(|layer| match &layer.content {
                LayerContent::Element { element } if element.id == "headline" => {
                    element.style_id.clone()
                }
                _ => None,
            })
            .unwrap();
        if let LayerContent::Element { element } = &mut definition
            .layers
            .iter_mut()
            .find(|layer| id(layer) == child)
            .unwrap()
            .content
        {
            element.style_id = Some(style_id.clone());
        }
        let before = serde_json::to_value(&definition).unwrap();
        let (mut detached, selected) = result(
            definition.clone(),
            Operation::DetachStyle {
                layer_id: child.clone(),
            },
        );
        assert_eq!(selected, child);
        assert_eq!(detached.styles.len(), definition.styles.len() + 1);
        let copy = detached.styles.last().unwrap();
        assert_ne!(copy.id, style_id);
        let new_id = copy.id.clone();
        let mut copy_data = serde_json::to_value(copy).unwrap();
        copy_data["id"] = json!(style_id);
        assert_eq!(
            copy_data,
            serde_json::to_value(
                definition
                    .styles
                    .iter()
                    .find(|style| style.id == style_id)
                    .unwrap()
            )
            .unwrap()
        );
        let (repeated, _) = result(
            detached.clone(),
            Operation::DetachStyle {
                layer_id: child.clone(),
            },
        );
        assert_eq!(
            serde_json::to_value(&repeated).unwrap(),
            serde_json::to_value(&detached).unwrap()
        );
        let LayerContent::Element { element } = &mut detached
            .layers
            .iter_mut()
            .find(|layer| id(layer) == child)
            .unwrap()
            .content
        else {
            panic!()
        };
        assert_eq!(element.style_id.as_deref(), Some(new_id.as_str()));
        element.style_id = Some(style_id);
        detached.styles.pop();
        assert_eq!(serde_json::to_value(detached).unwrap(), before);
        for layer_id in ["missing", "root"] {
            assert!(
                edit(Edit {
                    definition: definition.clone(),
                    operation: Operation::DetachStyle {
                        layer_id: layer_id.into()
                    }
                })
                .is_err()
            );
        }
        if let LayerContent::Element { element } = &mut definition
            .layers
            .iter_mut()
            .find(|layer| id(layer) == child)
            .unwrap()
            .content
        {
            element.style_id = None;
        }
        assert!(
            edit(Edit {
                definition,
                operation: Operation::DetachStyle { layer_id: child }
            })
            .is_err()
        );
    }

    #[test]
    fn shared_highlight_edit_preserves_layers_and_validates_every_reference() {
        let (mut definition, child) = result(
            fixture(),
            Operation::Duplicate {
                layer_id: "headline".into(),
            },
        );
        for layer in &mut definition.layers {
            if let LayerContent::Element { element } = &mut layer.content {
                element.binding = Binding::Sentence;
            }
        }
        definition.treatments=serde_json::from_value(json!([{"id":"shared","operation":{"kind":"text_highlight","mode":"keyword","color":"#11C6ED"}}])).unwrap();
        definition.applications = serde_json::from_value(
            json!([{"treatmentId":"shared","target":{"kind":"group","id":"root"},"enabled":true}]),
        )
        .unwrap();
        definition.project(&BTreeMap::new()).unwrap();
        let operation = |layer: &str, mode: &str| {
            serde_json::from_value::<Operation>(json!({"kind":"highlight_treatment","layerId":layer,"treatmentId":"shared","highlight":{"mode":mode,"color":"#FFE064"}})).unwrap()
        };
        let (edited, selected) = result(definition.clone(), operation(&child, "active_word"));
        assert_eq!(selected, child);
        assert_eq!(
            serde_json::to_value(&edited.layers).unwrap(),
            serde_json::to_value(&definition.layers).unwrap()
        );
        assert_eq!(
            serde_json::to_value(&edited.applications).unwrap(),
            serde_json::to_value(&definition.applications).unwrap()
        );
        assert_eq!(
            serde_json::to_value(&edited.treatments).unwrap()[0]["operation"]["mode"],
            "active_word"
        );
        assert!(
            edit(Edit {
                definition: definition.clone(),
                operation: operation("unrelated", "keyword")
            })
            .is_err()
        );
        let mut disabled = definition.clone();
        disabled.applications[0].enabled = false;
        let local:Operation=serde_json::from_value(json!({"kind":"text_presentation","layerId":"headline","binding":"sentence","highlight":{"mode":"keyword","color":"#FF0000"}})).unwrap();
        let (local_edited, _) = result(disabled, local);
        assert_eq!(
            local_edited
                .applications
                .iter()
                .filter(|a| a.enabled)
                .count(),
            1
        );
        assert!(
            local_edited
                .applications
                .iter()
                .any(|a| a.treatment_id == "shared" && !a.enabled)
        );
        let mut incompatible = definition.clone();
        if let LayerContent::Element { element } = &mut incompatible
            .layers
            .iter_mut()
            .find(|layer| id(layer) == child)
            .unwrap()
            .content
        {
            element.binding = Binding::Keyword;
        }
        assert!(
            edit(Edit {
                definition: incompatible,
                operation: operation("headline", "active_word")
            })
            .is_err()
        );
        let (cleared, _) = result(
            edited,
            Operation::HighlightTreatment {
                layer_id: "headline".into(),
                treatment_id: "shared".into(),
                highlight: None,
            },
        );
        assert!(cleared.treatments.is_empty() && cleared.applications.is_empty());
        assert_eq!(
            serde_json::to_value(&cleared.layers).unwrap(),
            serde_json::to_value(&definition.layers).unwrap()
        );
    }

    #[test]
    fn detach_at_frame_preserves_leaf_motion_and_rejects_mismatched_or_sheared_poses() {
        let original = fixture();
        let parent = id(original
            .layers
            .iter()
            .find(|l| matches!(l.content, LayerContent::Element { .. }))
            .unwrap())
        .to_owned();
        let (mut definition, child) = result(
            original,
            Operation::Duplicate {
                layer_id: parent.clone(),
            },
        );
        definition.spatial_relations.push(serde_json::from_value(json!({"elementId":child,"relativeTo":parent,"placement":"overlay","gap":0.,"offsetX":0.,"offsetY":0.,"followMotion":true,"referenceBounds":"text_box"})).unwrap());
        let layer = definition
            .layers
            .iter_mut()
            .find(|l| id(l) == child)
            .unwrap();
        let LayerContent::Element { element } = &mut layer.content else {
            unreachable!()
        };
        element.motions=serde_json::from_value(json!([
            {"property":"x","keys":[{"time":0.,"value":3.,"easing":"ease_out"},{"time":1.,"value":9.,"easing":"linear"}]},
            {"property":"opacity","keys":[{"time":0.,"value":0.2,"easing":"linear"},{"time":1.,"value":1.,"easing":"linear"}]}
        ])).unwrap();
        let pose = |time, basis| FramePose {
            scene_time: time,
            local_time: time,
            position: [10., 20.],
            basis,
        };
        let (detached, _) = result(
            definition.clone(),
            Operation::DetachInFrame {
                layer_id: child.clone(),
                attached: FramePose {
                    position: [30., 50.],
                    ..pose(50, [0., 2., -3., 0.])
                },
                independent: pose(50, [1., 0., 0., 1.]),
            },
        );
        assert!(detached.spatial_relations.is_empty());
        let LayerContent::Element { element } = &detached
            .layers
            .iter()
            .find(|l| id(l) == child)
            .unwrap()
            .content
        else {
            unreachable!()
        };
        let motion = |p| element.motions.iter().find(|m| m.property == p).unwrap();
        assert_eq!(
            motion(MotionProperty::X)
                .keys
                .iter()
                .map(|k| k.value)
                .collect::<Vec<_>>(),
            vec![23., 29.]
        );
        assert!(matches!(
            motion(MotionProperty::X).keys[0].easing,
            Easing::EaseOut
        ));
        assert_eq!(motion(MotionProperty::Y).keys[0].value, 30.);
        assert_eq!(motion(MotionProperty::Rotation).keys[0].value, 90.);
        assert_eq!(motion(MotionProperty::ScaleX).keys[0].value, 2.);
        assert_eq!(motion(MotionProperty::ScaleY).keys[0].value, 3.);
        assert_eq!(motion(MotionProperty::Opacity).keys[0].value, 0.2);
        for attached in [
            pose(51, [1., 0., 0., 1.]),
            pose(50, [1., 0., 0.5, 1.]),
            pose(50, [0., 0., 0., 0.]),
        ] {
            assert!(
                edit(Edit {
                    definition: definition.clone(),
                    operation: Operation::DetachInFrame {
                        layer_id: child.clone(),
                        attached,
                        independent: pose(50, [1., 0., 0., 1.])
                    }
                })
                .is_err()
            );
        }
    }
    #[test]
    fn axis_frame_scaling_splits_uniform_keys_and_preserves_sheared_opposite_edge() {
        let mut definition = fixture();
        let layer = definition
            .layers
            .iter_mut()
            .find(|layer| matches!(layer.content, LayerContent::Element { .. }))
            .unwrap();
        let LayerContent::Element { element } = &mut layer.content else {
            unreachable!()
        };
        let layer_id = element.id.clone();
        element.motions = vec![Motion {
            property: MotionProperty::Scale,
            keys: vec![
                MotionKey {
                    time: 0.,
                    value: 0.,
                    easing: Easing::EaseOut,
                },
                MotionKey {
                    time: 1.,
                    value: 2.,
                    easing: Easing::Linear,
                },
            ],
        }];
        for (axis, delta, diagonal, expected_x, expected_y, position) in [
            (
                FrameScaleAxis::X,
                [40., 20.],
                [80., 40.],
                3.,
                2.,
                [2.5, -10.],
            ),
            (
                FrameScaleAxis::Y,
                [-10., -60.],
                [20., 120.],
                2.,
                1.,
                [-15., 5.],
            ),
        ] {
            let (scaled, _) = result(
                definition.clone(),
                Operation::ScaleInFrame {
                    layer_id: layer_id.clone(),
                    delta,
                    diagonal,
                    pivot_to_origin: [30., 70.],
                    basis: [0., 2., -1., 0.],
                    axis: Some(axis),
                    visual_basis: Some([2., 1., 0.5, 3.]),
                },
            );
            let LayerContent::Element { element } = &scaled
                .layers
                .iter()
                .find(|l| id(l) == layer_id)
                .unwrap()
                .content
            else {
                unreachable!()
            };
            let motion = |p| element.motions.iter().find(|m| m.property == p).unwrap();
            assert_eq!(motion(MotionProperty::ScaleX).keys[1].value, expected_x);
            assert_eq!(motion(MotionProperty::ScaleY).keys[1].value, expected_y);
            assert_eq!(motion(MotionProperty::ScaleX).keys[0].value, 0.);
            assert!(matches!(
                motion(MotionProperty::ScaleY).keys[0].easing,
                Easing::EaseOut
            ));
            assert_eq!(motion(MotionProperty::X).keys[0].value, position[0]);
            assert_eq!(motion(MotionProperty::Y).keys[0].value, position[1]);
            assert!(
                !element
                    .motions
                    .iter()
                    .any(|m| m.property == MotionProperty::Scale)
            );
        }
        for visual_basis in [None, Some([1., 2., 2., 4.])] {
            assert!(
                edit(Edit {
                    definition: definition.clone(),
                    operation: Operation::ScaleInFrame {
                        layer_id: layer_id.clone(),
                        delta: [1., 0.],
                        diagonal: [40., 0.],
                        pivot_to_origin: [30., 70.],
                        basis: [1., 0., 0., 1.],
                        axis: Some(FrameScaleAxis::X),
                        visual_basis
                    }
                })
                .is_err()
            );
        }
    }
    #[test]
    fn frame_scaling_preserves_axis_animation_and_translates_about_opposite_corner() {
        let mut definition = fixture();
        let layer = definition
            .layers
            .iter_mut()
            .find(|layer| matches!(layer.content, LayerContent::Element { .. }))
            .unwrap();
        let LayerContent::Element { element } = &mut layer.content else {
            unreachable!()
        };
        let layer_id = element.id.clone();
        element.motions=serde_json::from_value(json!([
            {"property":"scale_x","keys":[{"time":0.,"value":0.,"easing":"ease_out"},{"time":1.,"value":2.,"easing":"linear"}]},
            {"property":"scale_y","keys":[{"time":0.,"value":1.,"easing":"linear"},{"time":1.,"value":0.5,"easing":"linear"}]},
            {"property":"x","keys":[{"time":0.,"value":3.,"easing":"ease_in"},{"time":1.,"value":9.,"easing":"linear"}]}
        ])).unwrap();
        let old_region = serde_json::to_value(&element.region).unwrap();
        let (scaled, _) = result(
            definition.clone(),
            Operation::ScaleInFrame {
                layer_id: layer_id.clone(),
                delta: [20., 15.],
                diagonal: [40., 30.],
                pivot_to_origin: [10., 20.],
                basis: [1., 0., 0., 1.],
                axis: None,
                visual_basis: None,
            },
        );
        let LayerContent::Element { element } = &scaled
            .layers
            .iter()
            .find(|layer| id(layer) == layer_id)
            .unwrap()
            .content
        else {
            unreachable!()
        };
        assert_eq!(serde_json::to_value(&element.region).unwrap(), old_region);
        let motion = |property| {
            element
                .motions
                .iter()
                .find(|m| m.property == property)
                .unwrap()
        };
        assert_eq!(
            motion(MotionProperty::ScaleX)
                .keys
                .iter()
                .map(|k| k.value)
                .collect::<Vec<_>>(),
            vec![0., 3.]
        );
        assert!(matches!(
            motion(MotionProperty::ScaleX).keys[0].easing,
            Easing::EaseOut
        ));
        assert_eq!(
            motion(MotionProperty::ScaleY)
                .keys
                .iter()
                .map(|k| k.value)
                .collect::<Vec<_>>(),
            vec![1.5, 0.75]
        );
        assert_eq!(
            motion(MotionProperty::X)
                .keys
                .iter()
                .map(|k| k.value)
                .collect::<Vec<_>>(),
            vec![8., 14.]
        );
        assert_eq!(
            motion(MotionProperty::Y)
                .keys
                .iter()
                .map(|k| k.value)
                .collect::<Vec<_>>(),
            vec![10., 10.]
        );
        assert!(
            !element
                .motions
                .iter()
                .any(|m| m.property == MotionProperty::Scale)
        );
        for delta in [[-40., -30.], [f64::NAN, 1.]] {
            assert!(
                edit(Edit {
                    definition: definition.clone(),
                    operation: Operation::ScaleInFrame {
                        layer_id: layer_id.clone(),
                        delta,
                        diagonal: [40., 30.],
                        pivot_to_origin: [10., 20.],
                        basis: [1., 0., 0., 1.],
                        axis: None,
                        visual_basis: None
                    }
                })
                .is_err()
            );
        }
    }
    #[test]
    fn frame_movement_inverts_rotation_scale_and_shear_before_native_edit() {
        let original = fixture();
        let layer = id(original
            .layers
            .iter()
            .find(|layer| matches!(layer.content, LayerContent::Element { .. }))
            .unwrap())
        .to_owned();
        let (expected, _) = result(
            original.clone(),
            Operation::Move {
                layer_id: layer.clone(),
                delta_x: 7. / 720.,
                delta_y: -5. / 720.,
            },
        );
        for basis in [[0., 2., -0.5, 0.], [1., 0.4, 0.3, 0.8], [-1., 0., 0., 2.]] {
            let [a, b, c, d] = basis;
            let (actual, _) = result(
                original.clone(),
                Operation::MoveInFrame {
                    layer_id: layer.clone(),
                    delta_x: a * 7. - c * 5.,
                    delta_y: b * 7. - d * 5.,
                    basis,
                },
            );
            let got = actual.canvas_region(&layer).unwrap();
            let want = expected.canvas_region(&layer).unwrap();
            assert!((got.x - want.x).abs() < 1e-10 && (got.y - want.y).abs() < 1e-10);
        }
        for basis in [[1., 2., 2., 4.], [f64::NAN, 0., 0., 1.]] {
            assert!(
                edit(Edit {
                    definition: original.clone(),
                    operation: Operation::MoveInFrame {
                        layer_id: layer.clone(),
                        delta_x: 7.,
                        delta_y: 5.,
                        basis
                    }
                })
                .is_err()
            );
        }
    }
    #[test]
    fn measured_frame_drag_is_not_clamped_by_invisible_authored_text_width() {
        let original = fixture();
        let parent = id(original
            .layers
            .iter()
            .find(|layer| matches!(layer.content, LayerContent::Element { .. }))
            .unwrap())
        .to_owned();
        let (mut definition, child) = result(
            original,
            Operation::Duplicate {
                layer_id: parent.clone(),
            },
        );
        for layer in &mut definition.layers {
            if let LayerContent::Element { element } = &mut layer.content {
                element.region = if element.id == parent {
                    Rect {
                        x: 0.1,
                        y: 0.3,
                        width: 0.8,
                        height: 0.2,
                    }
                } else {
                    Rect {
                        x: 0.8,
                        y: 0.3,
                        width: 0.04,
                        height: 0.04,
                    }
                };
            }
        }
        definition.spatial_relations.push(serde_json::from_value(json!({"elementId":child,"relativeTo":parent,"placement":"right","referenceBounds":"text_box","followMotion":true,"gap":0.02,"offsetX":0.04,"offsetY":0.})).unwrap());
        let (moved, _) = result(
            definition,
            Operation::MoveInFrame {
                layer_id: child,
                delta_x: 72.,
                delta_y: -14.4,
                basis: [1., 0., 0., 1.],
            },
        );
        assert!((moved.spatial_relations[0].offset_x - 0.14).abs() < 1e-10);
        assert!((moved.spatial_relations[0].offset_y + 0.02).abs() < 1e-10);
    }
    #[test]
    fn group_manipulation_preserves_child_local_data_and_projects_all_descendants() {
        let mut definition = fixture();
        if let LayerContent::Group { region, .. } = &mut definition.layers[0].content {
            *region = Rect {
                x: 0.1,
                y: 0.1,
                width: 0.8,
                height: 0.8,
            };
        }
        definition.layers[1].parent_id = Some("inner".into());
        definition.layers.push(Layer {
            parent_id: Some("root".into()),
            content: LayerContent::Group {
                composite: false,
                separate_instances: false,
                id: "inner".into(),
                region: Rect {
                    x: 0.2,
                    y: 0.2,
                    width: 0.5,
                    height: 0.5,
                },
            },
        });
        let before = definition.project(&BTreeMap::new()).unwrap();
        let (moved, _) = result(
            definition.clone(),
            Operation::Move {
                layer_id: "inner".into(),
                delta_x: 0.04,
                delta_y: 0.04,
            },
        );
        let after = moved.project(&BTreeMap::new()).unwrap();
        assert!((after.elements[0].region.x - before.elements[0].region.x - 0.04).abs() < 1e-12);
        assert!((after.elements[0].region.y - before.elements[0].region.y - 0.04).abs() < 1e-12);
        assert_eq!(
            serde_json::to_value(&moved.layers[1]).unwrap(),
            serde_json::to_value(&definition.layers[1]).unwrap()
        );
        let (resized, _) = result(
            moved,
            Operation::Resize {
                layer_id: "inner".into(),
                corner: ResizeCorner::BottomRight,
                delta_x: 0.08,
                delta_y: 0.08,
            },
        );
        let resized_projection = resized.project(&BTreeMap::new()).unwrap();
        assert!(
            (resized_projection.elements[0].region.width / before.elements[0].region.width - 1.2)
                .abs()
                < 1e-12
        );
        assert_eq!(
            serde_json::to_value(&resized.layers[1]).unwrap(),
            serde_json::to_value(&definition.layers[1]).unwrap()
        );
        assert_eq!(
            serde_json::to_value(&resized.styles).unwrap(),
            serde_json::to_value(&definition.styles).unwrap()
        );
        let metadata =
            super::super::dynamic_asset::editing_regions(&resized, &resized_projection).unwrap();
        let group = metadata
            .as_array()
            .unwrap()
            .iter()
            .find(|entry| entry["id"] == "inner")
            .unwrap();
        assert_eq!(group["kind"], "group");
        assert!((group["region"]["width"].as_f64().unwrap() - 0.48).abs() < 1e-12);
    }
    #[test]
    fn resize_corners_hold_opposite_edges_and_preserve_styles_and_time() {
        let mut definition = fixture();
        if let LayerContent::Group { region, .. } = &mut definition.layers[0].content {
            *region = Rect {
                x: 0.2,
                y: 0.1,
                width: 0.5,
                height: 0.5,
            };
        }
        let selected = id(&definition.layers[1]).to_owned();
        for (corner, x, y, width, height) in [
            (ResizeCorner::TopLeft, 0.2, 0.5, 0.7, 0.1),
            (ResizeCorner::TopRight, 0.1, 0.5, 0.9, 0.1),
            (ResizeCorner::BottomLeft, 0.2, 0.4, 0.7, 0.3),
            (ResizeCorner::BottomRight, 0.1, 0.4, 0.9, 0.3),
        ] {
            let (resized, _) = result(
                definition.clone(),
                Operation::Resize {
                    layer_id: selected.clone(),
                    corner,
                    delta_x: 0.05,
                    delta_y: 0.05,
                },
            );
            let mut expected = serde_json::to_value(&definition).unwrap();
            let actual = serde_json::to_value(&resized).unwrap();
            let region = &actual["layers"][1]["content"]["element"]["region"];
            for (key, value) in [("x", x), ("y", y), ("width", width), ("height", height)] {
                assert!((region[key].as_f64().unwrap() - value).abs() < 1e-12);
            }
            expected["layers"][1]["content"]["element"]["region"] = region.clone();
            assert_eq!(expected, actual);
        }
        let (minimum, _) = result(
            definition.clone(),
            Operation::Resize {
                layer_id: selected.clone(),
                corner: ResizeCorner::BottomRight,
                delta_x: -5.0,
                delta_y: -5.0,
            },
        );
        let projected = minimum.project(&BTreeMap::new()).unwrap();
        assert!((projected.elements[0].region.width * 720.0 - 1.0).abs() < 1e-10);
        assert!((projected.elements[0].region.height * 720.0 - 1.0).abs() < 1e-10);
        assert!(
            edit(Edit {
                definition,
                operation: Operation::Resize {
                    layer_id: selected,
                    corner: ResizeCorner::TopLeft,
                    delta_x: f64::INFINITY,
                    delta_y: 0.0
                }
            })
            .is_err()
        );
    }
    #[test]
    fn canvas_movement_converts_nested_space_and_clamps_without_changing_motion() {
        let mut definition = fixture();
        if let LayerContent::Group { region, .. } = &mut definition.layers[0].content {
            *region = Rect {
                x: 0.2,
                y: 0.1,
                width: 0.5,
                height: 0.5,
            };
        }
        let selected = id(&definition.layers[1]).to_owned();
        let (definition, _) = result(
            definition,
            Operation::Envelope {
                layer_id: selected.clone(),
                entrance: element_edit::Entrance::Pop,
                enter_seconds: 0.2,
                exit_seconds: 0.15,
            },
        );
        let projection = definition.project(&BTreeMap::new()).unwrap();
        let regions =
            super::super::dynamic_asset::editing_regions(&definition, &projection).unwrap();
        assert_eq!(regions[0]["id"], selected);
        assert!((regions[0]["region"]["x"].as_f64().unwrap() - 0.25).abs() < 1e-12);
        let (moved, _) = result(
            definition.clone(),
            Operation::Move {
                layer_id: selected.clone(),
                delta_x: 0.025,
                delta_y: 0.05,
            },
        );
        let mut expected = serde_json::to_value(&definition).unwrap();
        let actual = serde_json::to_value(&moved).unwrap();
        let region = &actual["layers"][1]["content"]["element"]["region"];
        assert!((region["x"].as_f64().unwrap() - 0.15).abs() < 1e-12);
        assert!((region["y"].as_f64().unwrap() - 0.5).abs() < 1e-12);
        expected["layers"][1]["content"]["element"]["region"] = region.clone();
        assert_eq!(actual, expected);
        let (clamped, _) = result(
            moved,
            Operation::Move {
                layer_id: selected.clone(),
                delta_x: -2.0,
                delta_y: 2.0,
            },
        );
        let LayerContent::Element { element } = &clamped.layers[1].content else {
            panic!()
        };
        assert_eq!(element.region.x, 0.0);
        assert!((element.region.y - 0.8).abs() < 1e-12);
        assert!(
            edit(Edit {
                definition,
                operation: Operation::Move {
                    layer_id: selected,
                    delta_x: f64::NAN,
                    delta_y: 0.0
                }
            })
            .is_err()
        );
    }
    #[test]
    fn relative_placement_preserves_authored_fields_and_rejects_missing_space() {
        let (mut definition, selected) = media_result(
            fixture(),
            &media_asset("icon", None),
            None,
            Some("root".into()),
        );
        let reference = id(&definition.layers[1]).to_owned();
        if let LayerContent::Element { element } = &mut definition.layers[1].content {
            element.region = Rect {
                x: 0.3,
                y: 0.3,
                width: 0.4,
                height: 0.2,
            };
        }
        if let LayerContent::Element { element } = &mut definition.layers[2].content {
            element.region = Rect {
                x: 0.1,
                y: 0.1,
                width: 0.1,
                height: 0.1,
            };
        }
        for (side, x, y) in [
            (PlacementSide::Left, 0.18, 0.35),
            (PlacementSide::Right, 0.72, 0.35),
            (PlacementSide::Above, 0.45, 0.18),
            (PlacementSide::Below, 0.45, 0.52),
        ] {
            let (placed, _) = result(
                definition.clone(),
                Operation::PlaceBeside {
                    layer_id: selected.clone(),
                    reference_id: reference.clone(),
                    side,
                    gap: 0.02,
                },
            );
            let mut expected = serde_json::to_value(&definition).unwrap();
            let actual = serde_json::to_value(placed).unwrap();
            let region = &actual["layers"][2]["content"]["element"]["region"];
            assert!((region["x"].as_f64().unwrap() - x).abs() < 1e-12);
            assert!((region["y"].as_f64().unwrap() - y).abs() < 1e-12);
            expected["layers"][2]["content"]["element"]["region"]["x"] = region["x"].clone();
            expected["layers"][2]["content"]["element"]["region"]["y"] = region["y"].clone();
            assert_eq!(actual, expected);
        }
        for (reference_id, gap) in [
            (selected.as_str(), 0.02),
            ("missing", 0.02),
            ("root", 0.02),
            (reference.as_str(), -0.1),
            (reference.as_str(), 0.8),
        ] {
            assert!(
                edit(Edit {
                    definition: definition.clone(),
                    operation: Operation::PlaceBeside {
                        layer_id: selected.clone(),
                        reference_id: reference_id.into(),
                        side: PlacementSide::Right,
                        gap
                    }
                })
                .is_err()
            );
        }
    }
    #[test]
    fn alignment_preserves_size_and_uses_parent_coordinates() {
        let mut definition = fixture();
        let LayerContent::Group { region, .. } = &mut definition.layers[0].content else {
            panic!()
        };
        *region = Rect {
            x: 0.1,
            y: 0.1,
            width: 0.8,
            height: 0.8,
        };
        let selected = id(&definition.layers[1]).to_owned();
        for (alignment, axis, value) in [
            (Alignment::Left, "x", 0.0),
            (Alignment::Center, "x", 0.1),
            (Alignment::Right, "x", 0.2),
            (Alignment::Top, "y", 0.0),
            (Alignment::Middle, "y", 0.4),
            (Alignment::Bottom, "y", 0.8),
        ] {
            let (aligned, _) = result(
                definition.clone(),
                Operation::Align {
                    layer_id: selected.clone(),
                    alignment,
                },
            );
            let mut expected = serde_json::to_value(&definition).unwrap();
            let actual = serde_json::to_value(&aligned).unwrap();
            let coordinate = actual["layers"][1]["content"]["element"]["region"][axis]
                .as_f64()
                .unwrap();
            assert!((coordinate - value).abs() < 1e-12);
            expected["layers"][1]["content"]["element"]["region"][axis] = json!(coordinate);
            assert_eq!(expected, actual);
            aligned.project(&BTreeMap::new()).unwrap();
        }
        let (group, _) = result(
            definition.clone(),
            Operation::Align {
                layer_id: "root".into(),
                alignment: Alignment::Bottom,
            },
        );
        assert_eq!(
            serde_json::to_value(&group.layers[1]).unwrap(),
            serde_json::to_value(&definition.layers[1]).unwrap()
        );
        assert!(
            edit(Edit {
                definition,
                operation: Operation::Align {
                    layer_id: "missing".into(),
                    alignment: Alignment::Left
                }
            })
            .is_err()
        );
    }
    #[test]
    fn stack_changes_only_selected_z_and_repeating_is_stable() {
        let (definition, selected) = media_result(
            fixture(),
            &media_asset("icon", None),
            None,
            Some("root".into()),
        );
        let (definition, _) = result(
            definition,
            Operation::Envelope {
                layer_id: selected.clone(),
                entrance: element_edit::Entrance::Pop,
                enter_seconds: 0.2,
                exit_seconds: 0.15,
            },
        );
        for position in [StackPosition::Back, StackPosition::Front] {
            let back = matches!(position, StackPosition::Back);
            let (changed, _) = result(
                definition.clone(),
                Operation::Stack {
                    layer_id: selected.clone(),
                    position,
                },
            );
            let mut expected = serde_json::to_value(&definition).unwrap();
            let actual = serde_json::to_value(&changed).unwrap();
            let index = changed
                .layers
                .iter()
                .position(|l| id(l) == selected)
                .unwrap();
            let z = actual["layers"][index]["content"]["element"]["z"]
                .as_i64()
                .unwrap();
            for layer in &changed.layers {
                if let LayerContent::Element { element } = &layer.content {
                    if element.id != selected {
                        assert!(if back {
                            z < element.z as i64
                        } else {
                            z > element.z as i64
                        });
                    }
                }
            }
            expected["layers"][index]["content"]["element"]["z"] = json!(z);
            assert_eq!(actual, expected);
            let (repeated, _) = result(
                changed,
                Operation::Stack {
                    layer_id: selected.clone(),
                    position: if back {
                        StackPosition::Back
                    } else {
                        StackPosition::Front
                    },
                },
            );
            assert_eq!(serde_json::to_value(repeated).unwrap(), actual);
        }
        for layer_id in ["root", "missing"] {
            assert!(
                edit(Edit {
                    definition: definition.clone(),
                    operation: Operation::Stack {
                        layer_id: layer_id.into(),
                        position: StackPosition::Back
                    }
                })
                .is_err()
            );
        }
    }
    fn media_asset(id: &str, duration: Option<f64>) -> super::super::assets::Asset {
        serde_json::from_value(json!({
            "id":id,"sha256":"test","sourceSha256":"test","name":id,
            "description":"fixture","tags":[],"provenance":"test",
            "kind":if duration.is_some(){"video"}else{"image"},
            "width":200,"height":230,"duration":duration,"size":1,"createdAt":0
        }))
        .unwrap()
    }
    fn media_result(
        definition: Definition,
        asset: &super::super::assets::Asset,
        layer_id: Option<String>,
        parent_id: Option<String>,
    ) -> (Definition, String) {
        let value = edit_media(
            MediaEdit {
                definition,
                asset_id: asset.id.clone(),
                layer_id,
                parent_id,
                convert_shape: false,
            },
            asset,
        )
        .unwrap();
        (
            serde_json::from_value(value["definition"].clone()).unwrap(),
            value["selectedLayerId"].as_str().unwrap().into(),
        )
    }
    #[test]
    fn deleting_reference_group_preserves_surviving_nested_attachment_layout() {
        let mut value = serde_json::to_value(fixture()).unwrap();
        value["layers"][0]["content"]["region"] = json!({"x":0.1,"y":0.1,"width":0.8,"height":0.8});
        let mut icon = value["layers"][1].clone();
        value["layers"][1]["parentId"] = json!("reference");
        icon["parentId"] = json!("decorations");
        icon["content"]["element"]["id"] = json!("icon");
        icon["content"]["element"]["features"]["representation"] = json!("rectangle");
        icon["content"]["element"]["region"] = json!({"x":0.1,"y":0.1,"width":0.15,"height":0.15});
        let mut badge = icon.clone();
        badge["content"]["element"]["id"] = json!("badge");
        badge["content"]["element"]["region"] = json!({"x":0.1,"y":0.1,"width":0.08,"height":0.08});
        value["layers"].as_array_mut().unwrap().extend([
            json!({"parentId":"root","content":{"kind":"group","id":"reference","region":{"x":0,"y":0,"width":1,"height":1}}}),
            json!({"parentId":"root","content":{"kind":"group","id":"decorations","region":{"x":0.2,"y":0.2,"width":0.6,"height":0.6}}}),
            icon.clone(),badge.clone(),
        ]);
        value["spatialRelations"] = json!([
            {"elementId":"icon","relativeTo":"headline","placement":"above","gap":0.02,"offsetX":0,"offsetY":0,"followMotion":true},
            {"elementId":"badge","relativeTo":"icon","placement":"right","gap":0.01,"offsetX":0,"offsetY":0,"followMotion":true}
        ]);
        let original: Definition = serde_json::from_value(value).unwrap();
        let before = original.project(&BTreeMap::new()).unwrap();
        let (removed, _) = result(
            original.clone(),
            Operation::Remove {
                layer_id: "reference".into(),
            },
        );
        let after = removed.project(&BTreeMap::new()).unwrap();
        assert_eq!(removed.spatial_relations.len(), 1);
        assert_eq!(removed.spatial_relations[0].relative_to, "icon");
        assert!(removed.inputs.is_empty());
        for name in ["icon", "badge"] {
            let a = &before
                .elements
                .iter()
                .find(|e| e.id == name)
                .unwrap()
                .region;
            let b = &after.elements.iter().find(|e| e.id == name).unwrap().region;
            for (expected, actual) in [
                (a.x, b.x),
                (a.y, b.y),
                (a.width, b.width),
                (a.height, b.height),
            ] {
                assert!((expected - actual).abs() < 1e-10, "{name} layout changed");
            }
            let old = serde_json::to_value(original.layers.iter().find(|l| id(l) == name).unwrap())
                .unwrap();
            let new = serde_json::to_value(removed.layers.iter().find(|l| id(l) == name).unwrap())
                .unwrap();
            assert_eq!(old["parentId"], new["parentId"]);
            for key in ["motions", "motionTiming", "timing"] {
                assert_eq!(
                    old["content"]["element"][key],
                    new["content"]["element"][key]
                );
            }
        }
    }
    #[test]
    fn explicit_shape_conversion_preserves_authored_geometry_and_motion() {
        let definition = super::super::dynamic_asset::create(super::super::dynamic_asset::Create {
            name: "Decoration".into(),
            canvas: Canvas {
                width: 720,
                height: 1280,
                fps: 30,
            },
            purpose: Some(super::super::dynamic_asset::CreatePurpose::Decoration),
        })
        .unwrap();
        let before = serde_json::to_value(&definition).unwrap();
        let source = definition
            .layers
            .iter()
            .find(|layer| matches!(layer.content, LayerContent::Element { .. }))
            .unwrap();
        let source_id = id(source).to_string();
        for duration in [None, Some(3.)] {
            let asset = media_asset("replacement", duration);
            let request = |convert_shape| MediaEdit {
                definition: definition.clone(),
                asset_id: asset.id.clone(),
                layer_id: Some(source_id.clone()),
                parent_id: None,
                convert_shape,
            };
            assert!(edit_media(request(false), &asset).is_err());
            let result = edit_media(request(true), &asset).unwrap();
            let converted: Definition =
                serde_json::from_value(result["definition"].clone()).unwrap();
            let output = converted
                .layers
                .iter()
                .find(|layer| id(layer) == source_id)
                .unwrap();
            let old = serde_json::to_value(source).unwrap();
            let new = serde_json::to_value(output).unwrap();
            assert_eq!(new["parentId"], old["parentId"]);
            for key in ["id", "region", "timing", "motions", "motionTiming", "z"] {
                assert_eq!(
                    new["content"]["element"][key], old["content"]["element"][key],
                    "{key}"
                );
            }
            assert_eq!(
                new["content"]["element"]["features"]["representation"],
                if duration.is_some() { "video" } else { "image" }
            );
            assert!(converted.styles.is_empty());
            assert!(converted.inputs.is_empty());
            assert_eq!(converted.resource_bindings[0].asset_id, "replacement");
            converted.project(&BTreeMap::new()).unwrap();
        }
        let short = media_asset("too-short", Some(0.1));
        assert!(
            edit_media(
                MediaEdit {
                    definition: definition.clone(),
                    asset_id: short.id.clone(),
                    layer_id: Some(source_id.clone()),
                    parent_id: None,
                    convert_shape: true
                },
                &short
            )
            .is_err()
        );
        let image = media_asset("image", None);
        for (definition, layer_id) in [
            (fixture(), Some("headline".into())),
            (definition.clone(), None),
        ] {
            assert!(
                edit_media(
                    MediaEdit {
                        definition,
                        asset_id: image.id.clone(),
                        layer_id,
                        parent_id: None,
                        convert_shape: true
                    },
                    &image
                )
                .is_err()
            );
        }
        assert_eq!(serde_json::to_value(&definition).unwrap(), before);
    }
    #[test]
    fn media_replacement_detaches_shared_binding_and_preserves_authored_element() {
        let original = fixture();
        let (added, selected) = media_result(
            original.clone(),
            &media_asset("first", None),
            None,
            Some("root".into()),
        );
        let (mut added, _) = result(
            added,
            Operation::Envelope {
                layer_id: selected.clone(),
                entrance: element_edit::Entrance::Pop,
                enter_seconds: 0.2,
                exit_seconds: 0.15,
            },
        );
        let mut shared = added.layers.last().unwrap().clone();
        let LayerContent::Element { element } = &mut shared.content else {
            panic!()
        };
        element.id = "shared-media".into();
        let old_slot = element.resource_id.clone().unwrap();
        added.layers.push(shared);
        let before = serde_json::to_value(&added).unwrap();
        let (replaced, _) = media_result(
            added.clone(),
            &media_asset("second", None),
            Some(selected.clone()),
            None,
        );
        assert_eq!(
            replaced
                .resource_bindings
                .iter()
                .find(|b| b.slot_id == old_slot)
                .unwrap()
                .asset_id,
            "first"
        );
        assert_eq!(
            replaced.resource_bindings.len(),
            added.resource_bindings.len() + 1
        );
        let new_layer = replaced.layers.iter().find(|l| id(l) == selected).unwrap();
        let mut expected =
            serde_json::to_value(added.layers.iter().find(|l| id(l) == selected).unwrap()).unwrap();
        let actual = serde_json::to_value(new_layer).unwrap();
        expected["content"]["element"]["resourceId"] =
            actual["content"]["element"]["resourceId"].clone();
        assert_eq!(actual, expected);
        assert_eq!(serde_json::to_value(&added).unwrap(), before);
        assert_eq!(original.layers.len(), 2);
        let (again, _) = media_result(
            replaced.clone(),
            &media_asset("third", None),
            Some(selected),
            None,
        );
        assert_eq!(
            again.resource_bindings.len(),
            replaced.resource_bindings.len()
        );
    }
    #[test]
    fn media_add_caps_video_and_rejects_incompatible_replacements_and_parent() {
        let video = media_asset("clip", Some(2.4));
        let (added, selected) = media_result(fixture(), &video, None, Some("root".into()));
        let LayerContent::Element { element } = &added.layers.last().unwrap().content else {
            panic!()
        };
        assert!(element.timing.max_seconds <= 2.4);
        assert!(!element.features.avoid_protected_regions);
        assert_eq!(
            added.layers.last().unwrap().parent_id.as_deref(),
            Some("root")
        );
        for asset in [media_asset("short", Some(0.01)), media_asset("image", None)] {
            assert!(
                edit_media(
                    MediaEdit {
                        definition: added.clone(),
                        asset_id: asset.id.clone(),
                        layer_id: Some(selected.clone()),
                        parent_id: None,
                        convert_shape: false,
                    },
                    &asset
                )
                .is_err()
            );
        }
        assert!(
            edit_media(
                MediaEdit {
                    definition: fixture(),
                    asset_id: video.id.clone(),
                    layer_id: None,
                    parent_id: Some("missing".into()),
                    convert_shape: false,
                },
                &video
            )
            .is_err()
        );
    }
    #[test]
    fn semantic_role_edits_only_the_selected_element_and_can_be_cleared() {
        let (definition, child) = result(
            fixture(),
            Operation::Duplicate {
                layer_id: "headline".into(),
            },
        );
        for role in [Some(Role::Callout), None] {
            let operation: Operation = serde_json::from_value(json!({
                "kind":"semantic_role", "layerId":child, "role":role,
            }))
            .unwrap();
            let (edited, selected) = result(definition.clone(), operation);
            assert_eq!(selected, child);
            let mut expected = serde_json::to_value(&definition).unwrap();
            let layer = expected["layers"]
                .as_array_mut()
                .unwrap()
                .iter_mut()
                .find(|layer| layer["content"]["element"]["id"] == child)
                .unwrap();
            layer["content"]["element"]["features"]["role"] = json!(role);
            assert_eq!(serde_json::to_value(edited).unwrap(), expected);
        }
        for layer_id in ["missing", "root"] {
            assert!(
                edit(Edit {
                    definition: definition.clone(),
                    operation: Operation::SemanticRole {
                        layer_id: layer_id.into(),
                        role: Some(Role::Title),
                    }
                })
                .is_err()
            );
        }
        assert!(
            serde_json::from_value::<Operation>(json!({
                "kind":"semantic_role", "layerId":"headline", "role":"made_up",
            }))
            .is_err()
        );
    }

    #[test]
    fn exit_sampling_envelope_and_group_fade_preserve_explicit_requirement() {
        use super::super::composition::TreatmentOperation;
        use super::super::model::MotionCoverage;
        let envelope = || Operation::Envelope {
            layer_id: "headline".into(),
            entrance: element_edit::Entrance::Pop,
            enter_seconds: 0.2,
            exit_seconds: 0.15,
        };
        let (mut definition, _) = result(fixture(), envelope());
        if let LayerContent::Element { element } = &mut definition.layers[1].content {
            element.motion_timing.as_mut().unwrap().coverage = Some(MotionCoverage {
                min_exit_frames: 2,
                min_post_frames: 1,
            });
        }
        let (next, _) = result(definition, envelope());
        let projected = next.project(&BTreeMap::new()).unwrap();
        assert_eq!(
            projected.elements[0]
                .motion_timing
                .as_ref()
                .unwrap()
                .coverage
                .as_ref()
                .unwrap()
                .min_exit_frames,
            2
        );
        let mut definition = next;
        if let LayerContent::Group { composite, .. } = &mut definition.layers[0].content {
            *composite = true;
        }
        let fade = |seconds| Operation::GroupFade {
            layer_id: "root".into(),
            exit_seconds: seconds,
            enter_seconds: None,
        };
        let (mut definition, _) = result(definition, fade(Some(0.15)));
        if let TreatmentOperation::Motion {
            motion_timing: Some(t),
            ..
        } = &mut definition.treatments[0].operation
        {
            t.coverage = Some(MotionCoverage {
                min_exit_frames: 1,
                min_post_frames: 2,
            });
        }
        let (definition, _) = result(definition, fade(Some(0.3)));
        let value = serde_json::to_value(&definition.treatments).unwrap();
        assert_eq!(
            value[0]["operation"]["motionTiming"]["coverage"]["minPostFrames"],
            2
        );
        let (removed, _) = result(definition, fade(None));
        assert!(removed.treatments.is_empty());
    }

    fn fixture() -> Definition {
        super::super::dynamic_asset::draft(
            element_edit::create(element_edit::Create {
                name: "Layers".into(),
                canvas: Canvas {
                    width: 720,
                    height: 720,
                    fps: 30,
                },
            })
            .unwrap(),
        )
        .unwrap()
    }
    fn result(definition: Definition, operation: Operation) -> (Definition, String) {
        let value = edit(Edit {
            definition,
            operation,
        })
        .unwrap();
        (
            serde_json::from_value(value["definition"].clone()).unwrap(),
            value["selectedLayerId"].as_str().unwrap().to_owned(),
        )
    }
    #[test]
    fn copied_subtree_keeps_local_geometry_with_independent_inputs_and_styles() {
        let original = fixture();
        let (copy, root) = result(
            original.clone(),
            Operation::Duplicate {
                layer_id: "root".into(),
            },
        );
        assert_eq!(copy.layers.len(), 4);
        assert_eq!(copy.inputs.len(), 2);
        assert_eq!(copy.styles.len(), 2);
        assert_ne!(copy.inputs[0].layer_ids, copy.inputs[1].layer_ids);
        assert_eq!(copy.layers[3].parent_id.as_deref(), Some(root.as_str()));
        let LayerContent::Element { element: old } = &original.layers[1].content else {
            panic!()
        };
        let LayerContent::Element { element: new } = &copy.layers[3].content else {
            panic!()
        };
        assert_eq!(
            serde_json::to_value(&old.region).unwrap(),
            serde_json::to_value(&new.region).unwrap()
        );
        assert_eq!(
            serde_json::to_value(&old.motions).unwrap(),
            serde_json::to_value(&new.motions).unwrap()
        );
        assert_ne!(old.style_id, new.style_id);
        let (restored, _) = result(copy, Operation::Remove { layer_id: root });
        assert_eq!(
            serde_json::to_value(restored).unwrap(),
            serde_json::to_value(original).unwrap()
        );
    }
    #[test]
    fn add_then_remove_text_cleans_ownership_without_touching_original() {
        let original = fixture();
        let (added, id) = result(
            original.clone(),
            Operation::Add {
                representation: Representation::Text,
                parent_id: Some("root".into()),
            },
        );
        assert_eq!(added.inputs.len(), 2);
        let (removed, _) = result(added, Operation::Remove { layer_id: id });
        assert_eq!(
            serde_json::to_value(removed).unwrap(),
            serde_json::to_value(&original).unwrap()
        );
        for operation in [
            Operation::Remove {
                layer_id: "root".into(),
            },
            Operation::Duplicate {
                layer_id: "missing".into(),
            },
            Operation::Add {
                representation: Representation::Text,
                parent_id: Some("headline".into()),
            },
            Operation::Add {
                representation: Representation::Audio,
                parent_id: None,
            },
        ] {
            assert!(
                edit(Edit {
                    definition: original.clone(),
                    operation
                })
                .is_err()
            );
        }
    }

    #[test]
    fn entrance_preserves_local_geometry_and_input_ownership() {
        let original = fixture();
        let (mut edited, selected) = result(
            original.clone(),
            Operation::Entrance {
                layer_id: "headline".into(),
                entrance: element_edit::Entrance::Pop,
                duration_fraction: 0.25,
            },
        );
        assert_eq!(selected, "headline");
        let LayerContent::Element { element } = &mut edited.layers[1].content else {
            panic!()
        };
        assert_eq!(
            element
                .motions
                .iter()
                .find(|motion| motion.property == MotionProperty::Opacity)
                .unwrap()
                .keys[1]
                .time,
            0.25
        );
        let LayerContent::Element { element: old } = &original.layers[1].content else {
            panic!()
        };
        element.motions = old.motions.clone();
        assert_eq!(
            serde_json::to_value(edited).unwrap(),
            serde_json::to_value(original).unwrap()
        );
    }

    #[test]
    fn copy_and_remove_preserve_resources_and_shared_treatments() {
        use super::super::composition::{Treatment, TreatmentApplication, TreatmentOperation};
        let mut original = fixture();
        original.inputs.clear();
        let LayerContent::Element { element } = &mut original.layers[1].content else {
            panic!()
        };
        element.features.representation = Representation::Image;
        element.style_id = None;
        element.resource_id = Some("image-slot".into());
        original.resource_slots.push(ResourceSlot {
            id: "image-slot".into(),
            representation: Representation::Image,
            description: "Image".into(),
            tags: vec![],
        });
        original.resource_bindings.push(ResourceBinding {
            slot_id: "image-slot".into(),
            asset_id: "image-asset".into(),
            enabled: true,
        });
        original.treatments.push(Treatment {
            id: "clip".into(),
            operation: TreatmentOperation::CanvasClip {
                region: Rect {
                    x: 0.,
                    y: 0.,
                    width: 1.,
                    height: 1.,
                },
            },
        });
        original.applications.push(TreatmentApplication {
            treatment_id: "clip".into(),
            target: Target::Group("root".into()),
            enabled: true,
        });
        let (copied, root) = result(
            original.clone(),
            Operation::Duplicate {
                layer_id: "root".into(),
            },
        );
        assert_eq!(copied.resource_slots.len(), 2);
        assert_ne!(copied.resource_slots[0].id, copied.resource_slots[1].id);
        assert_eq!(copied.resource_bindings[1].asset_id, "image-asset");
        assert_eq!(copied.applications.len(), 2);
        assert!(matches!(&copied.applications[1].target,Target::Group(id) if id == &root));
        let (restored, _) = result(copied, Operation::Remove { layer_id: root });
        assert_eq!(
            serde_json::to_value(restored).unwrap(),
            serde_json::to_value(original).unwrap()
        );
    }
}
