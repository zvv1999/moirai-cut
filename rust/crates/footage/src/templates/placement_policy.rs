//! Translation-only placement from geometry, independent of any asset or style.
//!
//! The caller supplies a conservative envelope relative to the current effect
//! center. It may include an entire animation, measured text, decorations and
//! clearance. This solver does not infer the envelope or certify its evidence.
//! Touching edges are allowed, with a 1e-12 normalized floating-point tolerance.
use super::{
    composition::{Target, TreatmentOperation},
    model::{MotionProperty, Placement, Rect, Representation, Template},
};
use anyhow::{Result, ensure};
use serde::Serialize;
use std::collections::BTreeSet;

/// Shared numerical tolerance for the solver and any candidate presentation.
/// It must not be replaced by a larger UI tolerance for collision decisions.
pub const EPSILON: f64 = 1e-12;
const MAX_PROTECTED: usize = 64;
const MAX_RETURNED: usize = 16;

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Center {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub center: Center,
    pub bounds: Rect,
    pub distance_pixels: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentAssessment {
    pub center: Center,
    pub bounds: Rect,
    pub eligible: bool,
    pub outside_safe_area: bool,
    pub blocker_count: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Solution {
    /// Always present, even when the current center is not eligible.
    pub current: CurrentAssessment,
    /// At most 16 feasible boundary/projection candidates, nearest first.
    /// Includes the unchanged center when it is feasible.
    pub candidates: Vec<Candidate>,
    /// The bounded geometry search is exhaustive for existence and the nearest
    /// feasible translation. This is not a statement about evidence coverage.
    pub search_complete: bool,
    pub evaluated_centers: usize,
    pub feasible: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationCheck {
    pub equivariant: bool,
    /// Stable, sorted diagnostic codes. Unknown or unsupported coordinate owners
    /// withhold reuse of an old envelope rather than claiming that it translates.
    pub reasons: Vec<String>,
}

/// Whether changing this native Application's center translates every visible
/// point by the same world-space displacement. This checks coordinate ownership,
/// not evidence completeness or the correctness of a supplied envelope.
///
/// Composite controllers transform their children around the canvas origin. A
/// child's authored displacement therefore becomes M(t) * delta under controller
/// scale/rotation. Leaf motion, ordinary groups, and composite translation/opacity
/// remain equivariant. The native application-rotation wrapper is special: its
/// pivot follows the Application center, so it preserves world translation.
pub fn translation_check(template: &Template) -> TranslationCheck {
    let mut reasons = BTreeSet::new();
    let visual_ids: BTreeSet<_> = template
        .elements
        .iter()
        .filter(|element| element.features.representation != Representation::Audio)
        .map(|element| element.id.as_str())
        .collect();
    for element in template
        .elements
        .iter()
        .filter(|element| element.features.representation != Representation::Audio)
    {
        if element.features.placement != Placement::Fixed {
            reasons.insert(format!("layout_owned_placement:{}", element.id));
        }
        if element.features.avoid_protected_regions {
            reasons.insert(format!("position_dependent_scheduling:{}", element.id));
        }
    }
    for arrangement in &template.composition.arrangements {
        // Application::transform_projection currently moves leaf regions, not
        // arrangement regions; Composition::place subsequently overwrites them.
        reasons.insert(format!(
            "arrangement_owned_placement:{}",
            arrangement.group_id
        ));
    }
    for relation in &template.composition.spatial_relations {
        if !visual_ids.contains(relation.element_id.as_str())
            || !visual_ids.contains(relation.relative_to.as_str())
        {
            reasons.insert(format!(
                "external_attachment_anchor:{}",
                relation.element_id
            ));
        }
    }
    for transform in &template.composition.rigid_transforms {
        if transform.id != "application-rotation"
            || transform.element_ids.len() != visual_ids.len()
            || !transform
                .element_ids
                .iter()
                .all(|id| visual_ids.contains(id.as_str()))
        {
            reasons.insert(format!("fixed_external_rotation_pivot:{}", transform.id));
        }
    }
    for application in template
        .composition
        .applications
        .iter()
        .filter(|a| a.enabled)
    {
        let Some(treatment) = template
            .composition
            .treatments
            .iter()
            .find(|treatment| treatment.id == application.treatment_id)
        else {
            reasons.insert(format!("unknown_treatment:{}", application.treatment_id));
            continue;
        };
        let group_id = match &application.target {
            Target::Element(id) => {
                if !visual_ids.contains(id.as_str()) {
                    reasons.insert(format!("external_treatment_target:{id}"));
                }
                continue;
            }
            Target::Layout(id) => {
                reasons.insert(format!("layout_treatment_target:{id}"));
                continue;
            }
            Target::Group(id) => id,
        };
        let Some(group) = template
            .composition
            .groups
            .iter()
            .find(|group| &group.id == group_id)
        else {
            reasons.insert(format!("unknown_group_target:{group_id}"));
            continue;
        };
        if !group.composite {
            continue;
        }
        if let TreatmentOperation::Motion { channels, .. } = &treatment.operation {
            let nonidentity = channels.iter().any(|motion| {
                let identity = match motion.property {
                    MotionProperty::Scale | MotionProperty::ScaleX | MotionProperty::ScaleY => 1.,
                    MotionProperty::Rotation => 0.,
                    _ => return false,
                };
                // Use exact identity: tiny authored movement is still movement,
                // and this guard should not silently reinterpret the design.
                motion.keys.iter().any(|key| key.value != identity)
            });
            if nonidentity {
                reasons.insert(format!("composite_group_basis:{group_id}"));
            }
        }
    }
    TranslationCheck {
        equivariant: reasons.is_empty(),
        reasons: reasons.into_iter().collect(),
    }
}

fn finite(value: f64) -> bool {
    value.is_finite() && value.abs() <= 1_000_000.
}

fn validate_rect(rect: &Rect, name: &str) -> Result<()> {
    ensure!(
        [rect.x, rect.y, rect.width, rect.height]
            .into_iter()
            .all(finite)
            && rect.width > 0.
            && rect.height > 0.,
        "invalid {name} rectangle"
    );
    Ok(())
}

fn bounds_at(relative: &Rect, center: Center) -> Rect {
    Rect {
        x: center.x + relative.x,
        y: center.y + relative.y,
        width: relative.width,
        height: relative.height,
    }
}

pub fn overlaps(a: &Rect, b: &Rect) -> bool {
    a.x < b.x + b.width - EPSILON
        && b.x < a.x + a.width - EPSILON
        && a.y < b.y + b.height - EPSILON
        && b.y < a.y + a.height - EPSILON
}

fn center_domain(relative: &Rect, safe: &Rect) -> Option<(f64, f64, f64, f64)> {
    let min_x = (safe.x - relative.x).max(0.);
    let max_x = (safe.x + safe.width - relative.x - relative.width).min(1.);
    let min_y = (safe.y - relative.y).max(0.);
    let max_y = (safe.y + safe.height - relative.y - relative.height).min(1.);
    (min_x <= max_x && min_y <= max_y).then_some((min_x, max_x, min_y, max_y))
}

pub fn assess_center(
    center: Center,
    relative: &Rect,
    safe: &Rect,
    protected: &[Rect],
) -> CurrentAssessment {
    let bounds = bounds_at(relative, center);
    // Tolerance may absorb arithmetic error at a fitting edge, but must not turn
    // an envelope that cannot fit anywhere into an eligible current position.
    let outside_safe_area = center_domain(relative, safe).is_none()
        || bounds.x < safe.x - EPSILON
        || bounds.y < safe.y - EPSILON
        || bounds.x + bounds.width > safe.x + safe.width + EPSILON
        || bounds.y + bounds.height > safe.y + safe.height + EPSILON;
    let blocker_count = protected.iter().filter(|p| overlaps(&bounds, p)).count();
    CurrentAssessment {
        center,
        bounds,
        eligible: !outside_safe_area && blocker_count == 0,
        outside_safe_area,
        blocker_count,
    }
}

fn axis_candidates(current: f64, min: f64, max: f64, edges: impl Iterator<Item = f64>) -> Vec<f64> {
    let mut values = vec![min, max, current.clamp(min, max)];
    values.extend(edges.filter(|v| *v >= min && *v <= max));
    // Normalize signed zero and sort before deduplication so obstacle input order
    // cannot influence candidate identity or equal-distance tie breaking.
    for value in &mut values {
        if *value == 0. {
            *value = 0.;
        }
    }
    values.sort_by(f64::total_cmp);
    values.dedup();
    values
}

/// Find the nearest eligible Application center without changing size, rotation,
/// internal relationships, content or motion. Coordinates are normalized output
/// canvas coordinates; distance ranking uses output pixels. Centers stay within
/// [0, 1], matching the Application transform contract.
///
/// The envelope is relative to the current center, not an absolute bounds box.
/// For a measured absolute box B, pass x=B.x-current.x, y=B.y-current.y and its
/// original width/height. Inflate that box for any clearance before this call.
/// The safe area is an allowed output-canvas rectangle, never a preferred anchor.
///
/// Expanding each obstacle by the envelope produces a forbidden center rectangle.
/// Their edges partition the feasible-center domain into axis-aligned cells.
/// The point closest to the current center in any cell is its coordinate-wise
/// projection: each coordinate is the current coordinate or a cell edge. Thus
/// the Cartesian product below contains a nearest feasible point whenever one
/// exists. We check every candidate against the original hard constraints; only
/// the returned list is truncated, never the search. The bound is 131² candidates
/// with 64 obstacles, independent of template identity or canvas orientation.
pub fn solve(
    current: Center,
    relative_envelope: &Rect,
    safe_area: &Rect,
    protected: &[Rect],
    canvas_width: f64,
    canvas_height: f64,
) -> Result<Solution> {
    ensure!(
        current.x.is_finite()
            && current.y.is_finite()
            && (0. ..=1.).contains(&current.x)
            && (0. ..=1.).contains(&current.y),
        "invalid current placement center"
    );
    ensure!(
        canvas_width.is_finite()
            && canvas_height.is_finite()
            && (0. ..=10_000_000.).contains(&canvas_width)
            && (0. ..=10_000_000.).contains(&canvas_height)
            && canvas_width > 0.
            && canvas_height > 0.,
        "invalid placement canvas dimensions"
    );
    ensure!(
        protected.len() <= MAX_PROTECTED,
        "too many protected rectangles"
    );
    validate_rect(relative_envelope, "relative envelope")?;
    validate_rect(safe_area, "safe area")?;
    ensure!(
        safe_area.x >= 0.
            && safe_area.y >= 0.
            && safe_area.x + safe_area.width <= 1. + EPSILON
            && safe_area.y + safe_area.height <= 1. + EPSILON,
        "safe area must be inside the output canvas"
    );
    for region in protected {
        validate_rect(region, "protected")?;
    }

    let original = assess_center(current, relative_envelope, safe_area, protected);
    let mut result = Solution {
        current: original,
        candidates: vec![],
        search_complete: true,
        evaluated_centers: 0,
        feasible: false,
    };
    let Some((min_x, max_x, min_y, max_y)) = center_domain(relative_envelope, safe_area) else {
        return Ok(result);
    };
    // A current edge can differ from its recomputed domain boundary by a few
    // floating-point ulps. Preserve it when the same hard-constraint assessment
    // passes; do not introduce a microscopic movement solely from reassociation.
    if result.current.eligible {
        result.candidates.push(Candidate {
            center: current,
            bounds: result.current.bounds.clone(),
            distance_pixels: 0.,
        });
    }

    let xs = axis_candidates(
        current.x,
        min_x,
        max_x,
        protected.iter().flat_map(|p| {
            [
                p.x - relative_envelope.x - relative_envelope.width,
                p.x + p.width - relative_envelope.x,
            ]
        }),
    );
    let ys = axis_candidates(
        current.y,
        min_y,
        max_y,
        protected.iter().flat_map(|p| {
            [
                p.y - relative_envelope.y - relative_envelope.height,
                p.y + p.height - relative_envelope.y,
            ]
        }),
    );
    for x in xs {
        for &y in &ys {
            result.evaluated_centers += 1;
            let center = Center { x, y };
            let checked = assess_center(center, relative_envelope, safe_area, protected);
            if checked.eligible {
                result.candidates.push(Candidate {
                    center,
                    bounds: checked.bounds,
                    distance_pixels: ((x - current.x) * canvas_width)
                        .hypot((y - current.y) * canvas_height),
                });
            }
        }
    }
    result.candidates.sort_by(|a, b| {
        a.distance_pixels
            .total_cmp(&b.distance_pixels)
            .then_with(|| a.center.x.total_cmp(&b.center.x))
            .then_with(|| a.center.y.total_cmp(&b.center.y))
    });
    result.candidates.dedup_by(|a, b| a.center == b.center);
    result.feasible = !result.candidates.is_empty();
    result.candidates.truncate(MAX_RETURNED);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn template() -> Template {
        let asset = super::super::dynamic_asset::create(serde_json::from_value(json!({
            "name":"Geometry rule test", "canvas":{"width":720,"height":720,"fps":30}, "purpose":"decoration"
        })).unwrap()).unwrap();
        asset.project(&Default::default()).unwrap()
    }

    fn group_motion(template: &mut Template, property: &str, value: f64) {
        let id = template.elements[0].id.clone();
        template.composition = serde_json::from_value(json!({
            "groups":[{"id":"root","elementIds":[id],"composite":true}],
            "treatments":[{"id":"motion","operation":{"kind":"motion","channels":[{"property":property,"keys":[{"time":0,"value":value,"easing":"linear"},{"time":1,"value":value,"easing":"linear"}]}]}}],
            "applications":[{"treatmentId":"motion","target":{"kind":"group","id":"root"},"enabled":true}]
        })).unwrap();
    }

    fn rect(x: f64, y: f64, width: f64, height: f64) -> Rect {
        Rect {
            x,
            y,
            width,
            height,
        }
    }
    fn full() -> Rect {
        rect(0., 0., 1., 1.)
    }
    fn centered(width: f64, height: f64) -> Rect {
        rect(-width / 2., -height / 2., width, height)
    }
    fn close(a: f64, b: f64) {
        assert!((a - b).abs() < 1e-10, "{a} != {b}");
    }
    fn assert_hard_constraints(
        solution: &Solution,
        envelope: &Rect,
        safe: &Rect,
        protected: &[Rect],
    ) {
        for candidate in &solution.candidates {
            assert!(assess_center(candidate.center, envelope, safe, protected).eligible);
        }
    }

    #[test]
    fn narrow_corridor_is_found_when_all_fixed_anchors_fail() {
        let envelope = centered(0.1, 0.1);
        let protected = [rect(0., 0., 0.57, 1.), rect(0.7, 0., 0.3, 1.)];
        let current = Center { x: 0.5, y: 0.5 };
        for (x, y) in [
            (0.5, 0.5),
            (0.18, 0.3),
            (0.82, 0.3),
            (0.18, 0.7),
            (0.82, 0.7),
            (0.5, 0.18),
            (0.5, 0.82),
        ] {
            assert!(!assess_center(Center { x, y }, &envelope, &full(), &protected).eligible);
        }
        let result = solve(current, &envelope, &full(), &protected, 1000., 1000.).unwrap();
        assert!(result.search_complete && result.feasible);
        assert!(!result.current.eligible);
        close(result.candidates[0].center.x, 0.62);
        close(result.candidates[0].center.y, 0.5);
        close(result.candidates[0].distance_pixels, 120.);
        assert_hard_constraints(&result, &envelope, &full(), &protected);
    }

    #[test]
    fn whole_motion_envelope_and_moving_protection_union_are_respected() {
        let current = Center { x: 0.4, y: 0.5 };
        let obstacle = [rect(0.5, 0.2, 0.1, 0.6)];
        let still = solve(
            current,
            &centered(0.1, 0.1),
            &full(),
            &obstacle,
            1000.,
            1000.,
        )
        .unwrap();
        assert!(still.current.eligible);
        let swept = centered(0.4, 0.1);
        let moving = solve(current, &swept, &full(), &obstacle, 1000., 1000.).unwrap();
        assert!(!moving.current.eligible);
        close(moving.candidates[0].center.x, 0.3);
        close(moving.candidates[0].center.y, 0.5);
        // A tracked subject's whole-interval envelope can be supplied as one
        // protected rectangle without choosing a frame or special style rule.
        let subject_sweep = [rect(0.3, 0.2, 0.3, 0.6)];
        let subject = solve(
            current,
            &centered(0.1, 0.1),
            &full(),
            &subject_sweep,
            1000.,
            1000.,
        )
        .unwrap();
        assert!(!subject.current.eligible);
        close(subject.candidates[0].center.x, 0.25);
    }

    #[test]
    fn nearest_distance_uses_pixels_for_portrait_and_landscape() {
        let current = Center { x: 0.5, y: 0.5 };
        let envelope = centered(0.1, 0.1);
        let protected = [rect(0.4, 0.4, 0.2, 0.2)];
        let wide = solve(current, &envelope, &full(), &protected, 1280., 720.).unwrap();
        close(wide.candidates[0].center.x, 0.5);
        close(wide.candidates[0].center.y, 0.35);
        close(wide.candidates[0].distance_pixels, 108.);
        let tall = solve(current, &envelope, &full(), &protected, 720., 1280.).unwrap();
        close(tall.candidates[0].center.x, 0.35);
        close(tall.candidates[0].center.y, 0.5);
        close(tall.candidates[0].distance_pixels, 108.);
    }

    #[test]
    fn no_fit_or_full_blockage_are_complete_negative_results() {
        let current = Center { x: 0.5, y: 0.5 };
        let too_wide = solve(current, &centered(1.2, 0.1), &full(), &[], 100., 100.).unwrap();
        assert!(too_wide.search_complete && !too_wide.feasible);
        assert!(too_wide.current.outside_safe_area);
        assert_eq!(too_wide.evaluated_centers, 0);
        let blocked = solve(current, &centered(0.1, 0.1), &full(), &[full()], 100., 100.).unwrap();
        assert!(blocked.search_complete && !blocked.feasible);
        assert!(blocked.evaluated_centers > 0);
        assert_eq!(blocked.current.blocker_count, 1);
        assert!(blocked.candidates.is_empty());
    }

    #[test]
    fn edge_touching_and_exact_fit_are_eligible() {
        let current = Center { x: 0.5, y: 0.5 };
        let exact = solve(current, &centered(1., 1.), &full(), &[], 720., 1280.).unwrap();
        assert_eq!(exact.candidates.len(), 1);
        assert_eq!(exact.candidates[0].center, current);
        let protected = [rect(0.6, 0.4, 0.2, 0.2)];
        let touching = solve(
            current,
            &centered(0.2, 0.2),
            &full(),
            &protected,
            100.,
            100.,
        )
        .unwrap();
        assert!(touching.current.eligible);
        assert_eq!(touching.candidates[0].center, current);
        close(touching.candidates[0].distance_pixels, 0.);
    }

    #[test]
    fn tolerance_never_hides_overlap_beyond_epsilon_or_an_impossible_domain() {
        let current = Center { x: 0.5, y: 0.5 };
        let envelope = centered(0.2, 0.2);
        let blocked = solve(
            current,
            &envelope,
            &full(),
            &[rect(0.6 - 4. * EPSILON, 0.4, 0.2, 0.2)],
            1000.,
            1000.,
        )
        .unwrap();
        assert!(!blocked.current.eligible);
        assert_eq!(blocked.current.blocker_count, 1);
        assert!(blocked.feasible);
        assert!(blocked.candidates[0].distance_pixels > 0.);

        // A slightly oversized envelope has no center domain even if its
        // excess width would otherwise disappear into a per-edge tolerance.
        let no_fit = solve(
            current,
            &centered(1. + EPSILON / 2., 0.1),
            &full(),
            &[],
            1000.,
            1000.,
        )
        .unwrap();
        assert!(!no_fit.current.eligible);
        assert!(!no_fit.feasible);
        assert!(no_fit.search_complete && no_fit.candidates.is_empty());

        // Arithmetic-scale edge drift on a shape that can fit preserves the
        // current center and must not fabricate a nonzero adjustment.
        let edge = Center {
            x: 0.05 - EPSILON / 4.,
            y: 0.5,
        };
        let fits = solve(edge, &centered(0.1, 0.1), &full(), &[], 1000., 1000.).unwrap();
        assert!(fits.current.eligible && fits.feasible);
        assert_eq!(fits.candidates[0].center, edge);
        assert_eq!(fits.candidates[0].distance_pixels, 0.);
    }

    #[test]
    fn safe_area_and_asymmetric_relative_envelope_are_hard_constraints() {
        let current = Center { x: 0.1, y: 0.2 };
        let envelope = rect(-0.05, -0.1, 0.3, 0.2);
        let safe = rect(0.2, 0.15, 0.6, 0.7);
        let result = solve(current, &envelope, &safe, &[], 720., 1280.).unwrap();
        assert!(result.current.outside_safe_area);
        close(result.candidates[0].center.x, 0.25);
        close(result.candidates[0].center.y, 0.25);
        assert_hard_constraints(&result, &envelope, &safe, &[]);
    }

    #[test]
    fn output_is_deterministic_under_obstacle_permutation_and_ties() {
        let current = Center { x: 0.5, y: 0.5 };
        let envelope = centered(0.1, 0.1);
        let mut protected = vec![
            rect(0.4, 0.4, 0.2, 0.2),
            rect(0., 0., 0.1, 0.1),
            rect(0.8, 0.8, 0.1, 0.1),
        ];
        let expected = solve(current, &envelope, &full(), &protected, 1000., 1000.).unwrap();
        for _ in 0..protected.len() {
            protected.rotate_left(1);
            let actual = solve(current, &envelope, &full(), &protected, 1000., 1000.).unwrap();
            assert_eq!(
                serde_json::to_value(&expected).unwrap(),
                serde_json::to_value(&actual).unwrap()
            );
        }
        protected.reverse();
        assert_eq!(
            serde_json::to_value(&expected).unwrap(),
            serde_json::to_value(
                solve(current, &envelope, &full(), &protected, 1000., 1000.).unwrap()
            )
            .unwrap()
        );
        close(expected.candidates[0].center.x, 0.35);
        close(expected.candidates[0].center.y, 0.5);
    }

    #[test]
    fn maximum_obstacles_do_not_truncate_search_and_all_results_are_safe() {
        let current = Center { x: 0.5, y: 0.5 };
        let envelope = centered(0.025, 0.025);
        let protected: Vec<_> = (0..64)
            .map(|i| {
                // Distinct x/y edges exercise the complete bounded cross-product.
                rect(0.1 + i as f64 * 0.01, 0.1 + i as f64 * 0.009, 0.003, 0.003)
            })
            .collect();
        let result = solve(current, &envelope, &full(), &protected, 720., 1280.).unwrap();
        assert!(result.feasible && result.search_complete);
        assert!(result.evaluated_centers > 10_000);
        assert!(result.evaluated_centers <= 131 * 131);
        assert_eq!(result.candidates.len(), MAX_RETURNED);
        assert_hard_constraints(&result, &envelope, &full(), &protected);
    }

    #[test]
    fn invalid_or_unbounded_geometry_is_rejected() {
        let current = Center { x: 0.5, y: 0.5 };
        let envelope = centered(0.1, 0.1);
        assert!(
            solve(
                Center {
                    x: f64::NAN,
                    y: 0.5
                },
                &envelope,
                &full(),
                &[],
                1.,
                1.
            )
            .is_err()
        );
        assert!(solve(current, &rect(0., 0., 0., 1.), &full(), &[], 1., 1.).is_err());
        assert!(solve(current, &envelope, &rect(-0.1, 0., 1., 1.), &[], 1., 1.).is_err());
        assert!(
            solve(
                current,
                &envelope,
                &full(),
                &[rect(0., f64::INFINITY, 0.1, 0.1)],
                1.,
                1.
            )
            .is_err()
        );
        assert!(solve(current, &envelope, &full(), &vec![full(); 65], 1., 1.).is_err());
        assert!(solve(current, &envelope, &full(), &[], 0., 1.).is_err());
    }

    #[test]
    fn composite_scale_and_rotation_prevent_reusing_a_translated_old_envelope() {
        let mut t = template();
        for (property, value) in [
            ("scale", 1.2),
            ("scale_x", 1.2),
            ("scale_y", 0.8),
            ("rotation", 12.),
        ] {
            group_motion(&mut t, property, value);
            let result = translation_check(&t);
            assert!(!result.equivariant);
            assert_eq!(result.reasons, ["composite_group_basis:root"]);
        }
        // Independent compositor math demonstrates why a scale controller
        // cannot reuse old_world_bounds + authored_translation.
        let scale_about_canvas_center = |x: f64| 0.5 + (x - 0.5) * 1.2;
        let actual_displacement = scale_about_canvas_center(0.4) - scale_about_canvas_center(0.2);
        close(actual_displacement, 0.24);
        assert!((actual_displacement - 0.2).abs() > 0.01);
    }

    #[test]
    fn leaf_motion_ordinary_groups_and_identity_composite_motion_remain_reusable() {
        let mut t = template();
        assert!(translation_check(&t).equivariant);
        for (property, value) in [
            ("scale", 1.),
            ("scale_x", 1.),
            ("scale_y", 1.),
            ("rotation", 0.),
            ("x", 200.),
            ("y", -100.),
            ("opacity", 0.3),
        ] {
            group_motion(&mut t, property, value);
            assert!(translation_check(&t).equivariant, "{property}");
        }
        group_motion(&mut t, "scale", 1.2);
        t.composition.applications[0].enabled = false;
        assert!(translation_check(&t).equivariant);
        t.composition.applications[0].enabled = true;
        t.composition.groups[0].composite = false;
        assert!(translation_check(&t).equivariant);
        t.composition.groups[0].composite = true;
        t.composition.applications[0].target = Target::Element(t.elements[0].id.clone());
        assert!(translation_check(&t).equivariant);
    }

    #[test]
    fn external_coordinate_owners_and_unknown_targets_fail_closed() {
        let mut t = template();
        let id = t.elements[0].id.clone();
        t.elements[0].features.placement = Placement::Caption;
        assert!(!translation_check(&t).equivariant);
        t.elements[0].features.placement = Placement::Fixed;
        t.elements[0].features.avoid_protected_regions = true;
        assert!(!translation_check(&t).equivariant);
        t.elements[0].features.avoid_protected_regions = false;
        t.composition.arrangements = serde_json::from_value(json!([{"groupId":"grid","region":{"x":0.,"y":0.,"width":1.,"height":1.},"columns":1,"gap":0.}])).unwrap();
        assert_eq!(
            translation_check(&t).reasons,
            ["arrangement_owned_placement:grid"]
        );
        t.composition.arrangements.clear();
        t.composition.rigid_transforms = vec![super::super::rigid_transform::RigidTransform {
            id: "application-rotation".into(),
            element_ids: vec![id.clone()],
            pivot_x: 0.5,
            pivot_y: 0.5,
            rotation_degrees: 90.,
        }];
        assert!(translation_check(&t).equivariant);
        t.composition.rigid_transforms[0].id = "fixed-world-pivot".into();
        assert_eq!(
            translation_check(&t).reasons,
            ["fixed_external_rotation_pivot:fixed-world-pivot"]
        );
        t.composition.rigid_transforms.clear();
        group_motion(&mut t, "opacity", 1.);
        t.composition.applications[0].target = Target::Group("external".into());
        assert_eq!(
            translation_check(&t).reasons,
            ["unknown_group_target:external"]
        );
        t.composition.applications[0].target = Target::Element("viewport".into());
        assert_eq!(
            translation_check(&t).reasons,
            ["external_treatment_target:viewport"]
        );
    }
}
