//! Advisory checks on resolved text animation, independent of authored style IDs.
use super::{
    model::{MotionProperty, Representation},
    rhythm::PlacedElement,
};

/// Longest authored, fully opaque plateau. This is deliberately not a claim
/// about perceptual readability: inherited opacity, occlusion and other effects
/// still require rendered inspection. Varying intervals are not counted.
pub fn opacity_hold_warning(element: &PlacedElement) -> Option<String> {
    if element.features.representation != Representation::Text || element.content.trim().is_empty()
    {
        return None;
    }
    let opacity = element
        .motions
        .iter()
        .find(|m| m.property == MotionProperty::Opacity)?;
    let keys = &opacity.keys;
    if keys.len() < 2 || keys.iter().all(|k| (k.value - keys[0].value).abs() < 1e-9) {
        return None;
    }
    let duration = element.end - element.start;
    let mut longest: f64 = 0.;
    let mut run: f64 = 0.;
    for pair in keys.windows(2) {
        if pair.iter().all(|k| (k.value - 1.).abs() < 1e-9) {
            run += pair[1].time - pair[0].time;
            longest = longest.max(run);
        } else {
            run = 0.;
        }
    }
    // Compiler interpolation clamps before the first and after the last key.
    if let Some(first) = keys.first().filter(|k| (k.value - 1.).abs() < 1e-9) {
        let mut leading = first.time;
        for pair in keys.windows(2) {
            if pair.iter().all(|k| (k.value - 1.).abs() < 1e-9) {
                leading += pair[1].time - pair[0].time;
            } else {
                break;
            }
        }
        longest = longest.max(leading);
    }
    if let Some(last) = keys.last().filter(|k| (k.value - 1.).abs() < 1e-9) {
        longest = longest.max(run + 1. - last.time);
    }
    let held = longest * duration;
    let required = 0.15_f64.min(duration * 0.5);
    (held + 1e-9 < required).then(|| {
        format!(
            "text_opacity_hold_short:{}:{:.3}:{:.3}:{:.3}:{:.3}",
            element.instance_id, element.start, element.end, held, required
        )
    })
}

#[cfg(test)]
mod tests {
    use super::super::{
        model::{Motion, MotionTiming},
        motion_timing,
    };
    use super::*;
    fn element(duration: f64) -> PlacedElement {
        let mut features = super::super::seed::templates().unwrap()[0].elements[0]
            .features
            .clone();
        features.representation = Representation::Text;
        serde_json::from_value(serde_json::json!({
            "instanceId":"short-word","elementId":"headline","features":features,
            "content":"December","start":1.36,"end":1.36+duration,
            "region":{"x":0.,"y":0.,"width":1.,"height":1.},"styleId":null,"resourceId":null,"z":1,
            "motions":[{"property":"opacity","keys":[
                {"time":0.,"value":0.,"easing":"linear"},
                {"time":0.2,"value":1.,"easing":"linear"},
                {"time":0.8,"value":1.,"easing":"linear"},
                {"time":1.,"value":0.,"easing":"linear"}]}]
        }))
        .unwrap()
    }
    #[test]
    fn resolved_short_word_warns_but_long_word_and_opaque_revision_do_not() {
        let timing = MotionTiming {
            coverage: None,
            enter_end: 0.2,
            exit_start: 0.8,
            enter_seconds: 0.19,
            exit_seconds: 0.1,
        };
        let mut short = element(0.36);
        short.motions[0] = motion_timing::resolve(&short.motions[0], &timing, 0.36).unwrap();
        assert_eq!(
            opacity_hold_warning(&short).unwrap(),
            "text_opacity_hold_short:short-word:1.360:1.720:0.070:0.150"
        );
        let mut long = element(1.4);
        long.motions[0] = motion_timing::resolve(&long.motions[0], &timing, 1.4).unwrap();
        assert!(opacity_hold_warning(&long).is_none());
        short.motions.clear();
        assert!(opacity_hold_warning(&short).is_none());
    }
    #[test]
    fn excludes_nontext_and_intentional_constant_opacity_and_counts_contiguous_hold() {
        let mut e = element(0.36);
        e.motions[0] =
            serde_json::from_value::<Motion>(serde_json::json!({"property":"opacity","keys":[
            {"time":0.,"value":0.,"easing":"linear"},{"time":0.4,"value":1.,"easing":"linear"},
            {"time":0.5,"value":1.,"easing":"linear"},{"time":0.6,"value":0.,"easing":"linear"},
            {"time":0.7,"value":1.,"easing":"linear"},{"time":0.8,"value":1.,"easing":"linear"},
            {"time":1.,"value":0.,"easing":"linear"}]}))
            .unwrap();
        assert!(opacity_hold_warning(&e).is_some());
        e.features.representation = Representation::Rectangle;
        assert!(opacity_hold_warning(&e).is_none());
        e.features.representation = Representation::Text;
        for key in &mut e.motions[0].keys {
            key.value = 0.7;
        }
        assert!(opacity_hold_warning(&e).is_none());
        e.content.clear();
        assert!(opacity_hold_warning(&e).is_none());
    }
}
