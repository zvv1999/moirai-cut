use super::{legacy_seed, model::Template};
use anyhow::Result;

pub fn templates() -> Result<Vec<Template>> {
    legacy_seed::observations()
        .into_iter()
        .map(|observation| {
            let legacy = legacy_seed::from_observation(observation)?;
            let template: Template = serde_json::from_value(serde_json::to_value(legacy)?)?;
            template.validate()?;
            Ok(template)
        })
        .collect()
}

#[cfg(test)]
pub(super) use legacy_seed::{from_observation, observations};

#[cfg(test)]
mod tests {
    #[test]
    fn every_reference_has_a_valid_editable_template() {
        let all = super::templates().unwrap();
        assert_eq!(all.len(), 54);
        for t in all {
            t.validate().unwrap();
            assert!(!t.evidence.is_empty());
            assert_eq!(t.schema_version, "moirai.template.v2");
            let encoded = serde_json::to_value(&t).unwrap();
            let decoded: super::Template = serde_json::from_value(encoded.clone()).unwrap();
            assert_eq!(encoded, serde_json::to_value(decoded).unwrap());
        }
    }
}
