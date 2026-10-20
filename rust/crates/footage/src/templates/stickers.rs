use super::{
    assets::{Asset, Kind},
    composition::{Target, Treatment, TreatmentApplication, TreatmentOperation},
    model::*,
    search::fingerprint,
};
use crate::service::App;
use anyhow::{Context, Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Recipe {
    pub name: String,
    pub tags: Vec<String>,
    pub asset_id: String,
    pub preview_asset_id: String,
    pub motion: TreatmentOperation,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sticker {
    pub id: String,
    pub recipe: Recipe,
    pub provenance: String,
}
#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Insert {
    pub template: Template,
    pub sticker_id: String,
    pub instance_id: String,
    pub region: Rect,
}

fn validate_recipe(recipe: &Recipe) -> Result<f64> {
    ensure!(
        !recipe.name.trim().is_empty() && recipe.name.len() <= 200,
        "sticker name required"
    );
    ensure!(
        recipe.tags.len() <= 32
            && recipe
                .tags
                .iter()
                .all(|tag| !tag.trim().is_empty() && tag.len() <= 100),
        "invalid sticker tags"
    );
    let TreatmentOperation::Motion {
        repeat_seconds: Some(period),
        ..
    } = &recipe.motion
    else {
        anyhow::bail!("animated sticker requires a looping motion");
    };
    let mut template = super::seed::templates()?.remove(0);
    template.composition.treatments.push(Treatment {
        id: "sticker-validation".into(),
        operation: recipe.motion.clone(),
    });
    template.validate()?;
    Ok(*period)
}

pub fn save(app: &App, recipe: Recipe) -> Result<Sticker> {
    let period = validate_recipe(&recipe)?;
    let asset: Asset = app.db.get("template_visual_asset", &recipe.asset_id)?;
    let preview: Asset = app
        .db
        .get("template_visual_asset", &recipe.preview_asset_id)?;
    ensure!(
        matches!(asset.kind, Kind::Image),
        "sticker requires transparent image source"
    );
    ensure!(
        matches!(preview.kind, Kind::Video) && preview.duration.is_some_and(|d| d >= period),
        "sticker preview must contain a full cycle"
    );
    let sticker = Sticker {
        id: format!("sticker-{}", &fingerprint(&recipe)[..32]),
        recipe,
        provenance: asset.provenance,
    };
    app.db.put("template_sticker", &sticker.id, &sticker)?;
    Ok(sticker)
}

pub fn insert(
    mut template: Template,
    sticker: &Sticker,
    instance_id: &str,
    region: Rect,
) -> Result<Template> {
    template.validate()?;
    validate_recipe(&sticker.recipe)?;
    ensure!(valid_id(instance_id), "invalid sticker instance ID");
    ensure!(
        !template.elements.iter().any(|e| e.id == instance_id)
            && !template.resource_slots.iter().any(|r| r.id == instance_id)
            && !template
                .composition
                .treatments
                .iter()
                .any(|t| t.id == instance_id),
        "sticker instance already exists"
    );
    let z = template
        .elements
        .iter()
        .map(|e| e.z)
        .max()
        .unwrap_or(0)
        .checked_add(1)
        .context("layer limit reached")?;
    let element: Element = serde_json::from_value(json!({
        "id":instance_id,"features":{"role":"decoration","representation":"image","mediaUse":null,"placement":"fixed","accent":false,"outline":false,"avoidProtectedRegions":false},
        "description":sticker.recipe.name,"binding":"literal","literal":sticker.recipe.name,"styleId":null,"resourceId":instance_id,"region":region,"z":z,
        "timing":{"anchor":"video_start","offsetSeconds":0,"maxSeconds":600,"minSeconds":0.1},"motions":[],"intents":[],"priority":50,"exclusiveGroup":null,"evidence":[]
    }))?;
    template.elements.push(element);
    template.resource_slots.push(ResourceSlot {
        id: instance_id.into(),
        representation: Representation::Image,
        description: sticker.recipe.name.clone(),
        tags: sticker.recipe.tags.clone(),
    });
    template.bind(instance_id, &sticker.recipe.asset_id);
    template.composition.treatments.push(Treatment {
        id: instance_id.into(),
        operation: sticker.recipe.motion.clone(),
    });
    template
        .composition
        .applications
        .push(TreatmentApplication {
            treatment_id: instance_id.into(),
            target: Target::Element(instance_id.into()),
            enabled: true,
        });
    template.validate()?;
    Ok(template)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn insertion_keeps_original_elements_and_creates_independent_editable_bindings() {
        let template: Template =
            serde_json::from_value(super::super::composition_tests::input()["template"].clone())
                .unwrap();
        let before = serde_json::to_value(&template.elements).unwrap();
        let sticker=Sticker {id:"test".into(),provenance:"test license".into(),recipe:serde_json::from_value(json!({"name":"Arrow","tags":["guide"],"assetId":"visual-image","previewAssetId":"visual-preview","motion":{"kind":"motion","repeatSeconds":1.2,"channels":[{"property":"x","keys":[{"time":0,"value":0,"easing":"linear"},{"time":0.5,"value":12,"easing":"linear"},{"time":1,"value":0,"easing":"linear"}]}]}})).unwrap()};
        let region = Rect {
            x: 0.1,
            y: 0.1,
            width: 0.2,
            height: 0.2,
        };
        let result = insert(template, &sticker, "instance", region.clone()).unwrap();
        assert_eq!(
            serde_json::to_value(&result.elements[..result.elements.len() - 1]).unwrap(),
            before
        );
        assert_eq!(
            result.resource_bindings.last().unwrap().asset_id,
            "visual-image"
        );
        assert_eq!(
            result.composition.applications.last().unwrap().treatment_id,
            "instance"
        );
        let removed = super::super::element_edit::remove(result.clone(), "instance").unwrap();
        assert_eq!(serde_json::to_value(&removed.elements).unwrap(), before);
        assert!(!removed.resource_slots.iter().any(|r| r.id == "instance"));
        assert!(
            !removed
                .resource_bindings
                .iter()
                .any(|r| r.slot_id == "instance")
        );
        assert!(
            !removed
                .composition
                .treatments
                .iter()
                .any(|r| r.id == "instance")
        );
        assert!(
            !removed
                .composition
                .applications
                .iter()
                .any(|r| r.treatment_id == "instance")
        );
        let mut shared = result.clone();
        let mut duplicate = shared.elements.last().unwrap().clone();
        duplicate.id = "shared-image".into();
        shared.elements.push(duplicate);
        let shared = super::super::element_edit::remove(shared, "instance").unwrap();
        assert!(shared.resource_slots.iter().any(|r| r.id == "instance"));
        assert_eq!(shared.asset_id("instance"), Some("visual-image"));
        assert!(insert(result.clone(), &sticker, "instance", region).is_err());
        assert!(
            insert(
                result,
                &sticker,
                "another",
                Rect {
                    x: 0.9,
                    y: 0.9,
                    width: 0.3,
                    height: 0.3
                }
            )
            .is_err()
        );
    }
}
