//! The conversion boundary for persisted or imported v1 data.
use super::{legacy_model as old, model::*};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LegacyPlanInput {
    template: old::Template,
    words: Vec<super::rhythm::Word>,
    duration_seconds: f64,
    title: String,
    #[serde(default)]
    translations: Vec<String>,
    #[serde(default)]
    phrase_specs: Vec<super::rhythm::SemanticUnit>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    quiet_gap_seconds: Option<Vec<f64>>,
}
pub fn receipt_input(value: &Value) -> Result<Option<Value>> {
    if value["template"]["schemaVersion"] != "moirai.template.v1" {
        return Ok(None);
    }
    let old: LegacyPlanInput = serde_json::from_value(value.clone())?;
    Ok(Some(serde_json::to_value(old)?))
}

fn features(kind: &old::ElementKind) -> Features {
    use Representation as P;
    use Role as R;
    use old::ElementKind as K;
    let (role, representation, media_use) = match kind {
        K::Title => (Some(R::Title), P::Text, None),
        K::Subtitle => (Some(R::Subtitle), P::Text, None),
        K::Translation => (Some(R::Translation), P::Text, None),
        K::Emphasis => (Some(R::Emphasis), P::Text, None),
        K::Callout => (Some(R::Callout), P::Text, None),
        K::SpeakerLabel => (Some(R::SpeakerLabel), P::Text, None),
        K::Chapter => (Some(R::Chapter), P::Text, None),
        K::ListItem => (Some(R::ListItem), P::Text, None),
        K::Metric => (Some(R::Metric), P::Text, None),
        K::Icon => (None, P::Image, Some(MediaUse::Icon)),
        K::Sticker => (None, P::Image, Some(MediaUse::Sticker)),
        K::Arrow => (Some(R::Annotation), P::Arrow, None),
        K::Underline => (Some(R::Annotation), P::Line, None),
        K::CircleAnnotation => (Some(R::Annotation), P::Ellipse, None),
        K::Backplate | K::Frame => (Some(R::Decoration), P::Rectangle, None),
        K::Particle => (None, P::Particles, None),
        K::SubjectOutline => (Some(R::Annotation), P::SubjectContour, None),
        K::Spotlight => (None, P::Spotlight, None),
        K::Broll => (
            Some(R::SupportingVisual),
            P::VisualMedia,
            Some(MediaUse::Broll),
        ),
        K::Video => (
            Some(R::PrimaryVisual),
            P::Video,
            Some(MediaUse::SourceVideo),
        ),
        K::Background => (Some(R::Background), P::Rectangle, None),
        K::SoundEffect => (None, P::Audio, Some(MediaUse::SoundEffect)),
        K::BackgroundMusic => (Some(R::Background), P::Audio, Some(MediaUse::Music)),
    };
    Features {
        role,
        representation,
        media_use,
        outline: matches!(kind, K::Frame | K::CircleAnnotation),
        accent: matches!(
            kind,
            K::Emphasis | K::Callout | K::Icon | K::Sticker | K::Metric
        ),
        placement: if matches!(kind, K::Subtitle) {
            Placement::Caption
        } else {
            Placement::Fixed
        },
        avoid_protected_regions: !matches!(
            kind,
            K::Video
                | K::Background
                | K::Backplate
                | K::Frame
                | K::SoundEffect
                | K::BackgroundMusic
        ),
    }
}
pub fn template(value: Value) -> Result<Value> {
    if value["schemaVersion"] != "moirai.template.v1" {
        return Ok(value);
    }
    let legacy: old::Template = serde_json::from_value(value)?;
    legacy.validate()?;
    let mut value = serde_json::to_value(&legacy)?;
    let root = value.as_object_mut().unwrap();
    root.insert("schemaVersion".into(), json!("moirai.template.v2"));
    for (element, source) in root
        .get_mut("elements")
        .unwrap()
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .zip(&legacy.elements)
    {
        let object = element.as_object_mut().unwrap();
        object.remove("kind");
        object.insert(
            "features".into(),
            serde_json::to_value(features(&source.kind))?,
        );
        let anchor = match source.timing.anchor {
            old::Anchor::PhraseStart => "cue_start",
            old::Anchor::PhraseEnd => "cue_end",
            old::Anchor::SectionStart => "semantic_start",
            old::Anchor::KeywordStart => "keyword_start",
            old::Anchor::VideoStart => "video_start",
        };
        element["timing"]["anchor"] = json!(anchor);
    }
    let slots: Vec<Value> = legacy.resources.iter().map(|r| json!({
        "id":r.id,"description":r.description,"representation":features(&r.kind).representation,"tags":r.tags
    })).collect();
    let bindings: Vec<Value> = legacy.resources.iter().filter_map(|r| {
        r.asset_id.as_ref().map(|id| json!({"slotId":r.id,"assetId":id,"enabled":!matches!(r.status, old::EvidenceStatus::Unverified)}))
    }).collect();
    root.remove("resources");
    root.insert("resourceSlots".into(), json!(slots));
    root.insert("resourceBindings".into(), json!(bindings));
    let mut entrances = vec![];
    for layout in root.get_mut("layouts").unwrap().as_array_mut().unwrap() {
        let l = layout.as_object_mut().unwrap();
        let effect = l.remove("transition").unwrap();
        let duration = l.remove("transitionSeconds").unwrap();
        if effect != "cut" {
            entrances.push(json!({"layoutId":l["id"],"effect":effect,"durationSeconds":duration}));
        }
    }
    root.insert("layoutEntrances".into(), json!(entrances));
    root.insert("transitionRules".into(), json!([]));
    root.remove("rhythm");
    let r = &legacy.rhythm;
    root.insert("segmentation".into(), json!({"pauseBoundarySeconds":r.pause_boundary_seconds,"maxPhraseSeconds":r.max_phrase_seconds,"maxCharacters":r.max_characters,"maxCharactersPerSecond":r.max_characters_per_second}));
    root.insert("visualRhythm".into(), json!({"minDisplaySeconds":r.min_display_seconds,"maxAccentsPerCue":r.max_accents_per_phrase}));
    root.insert(
        "audioPlacement".into(),
        json!({"effectCooldownSeconds":r.effect_cooldown_seconds}),
    );
    root.insert("mix".into(), json!({"musicGainDb":r.music_gain_db,"musicDuckDb":r.music_duck_db,"effectGainDb":r.effect_gain_db,"musicDuckAttackSeconds":r.music_duck_attack_seconds,"musicDuckReleaseSeconds":r.music_duck_release_seconds}));
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn old_bindings_keep_selection_without_turning_unverified_assets_into_active_bindings() {
        let mut old =
            super::super::seed::from_observation(super::super::seed::observations().remove(0))
                .unwrap();
        old.resources[0].asset_id = Some("candidate".into());
        old.resources[0].status = old::EvidenceStatus::Unverified;
        let normalized: Template =
            serde_json::from_value(serde_json::to_value(&old).unwrap()).unwrap();
        assert_eq!(normalized.resource_bindings[0].asset_id, "candidate");
        assert!(!normalized.resource_bindings[0].enabled);
        assert!(normalized.asset_id(&old.resources[0].id).is_none());
        let value = serde_json::to_value(&normalized).unwrap();
        assert!(value.get("resources").is_none());
        assert!(value.get("rhythm").is_none());
        assert!(
            value["elements"]
                .as_array()
                .unwrap()
                .iter()
                .all(|e| e.get("kind").is_none())
        );
        assert!(
            value["layouts"]
                .as_array()
                .unwrap()
                .iter()
                .all(|l| l.get("transition").is_none())
        );
        let again: Template = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(serde_json::to_value(again).unwrap(), value);
    }
}
