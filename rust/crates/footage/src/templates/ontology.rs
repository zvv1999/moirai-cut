//! Compatibility names for the former read-only ontology endpoint.
//! The ontology is now the actual persisted and compiled model.
pub use super::model::Template as TemplateOntology;
pub use super::rhythm::EditPlan as PlanOntology;
pub fn template(value: &TemplateOntology) -> anyhow::Result<TemplateOntology> {
    value.validate()?;
    Ok(value.clone())
}
pub fn plan(value: &PlanOntology) -> anyhow::Result<PlanOntology> {
    Ok(value.clone())
}

/// Ownership shared by both schema endpoints; no second persisted ontology.
pub fn model_boundaries() -> serde_json::Value {
    serde_json::json!({
        "definition": {
            "schemaVersion": super::dynamic_asset::SCHEMA,
            "role": "reusable_visual_style",
            "owns": ["layers", "styles", "resourceSlots", "defaultResourceBindings", "treatments", "spatialRelations", "contentBindings", "relativeMotion", "usageGuide"],
            "realInputAnnotations": false
        },
        "application": {
            "role": "revision_pinned_style_application",
            "owns": ["assetId", "assetRevision", "inputs", "canvas", "placement", "transform", "sourceFraming", "displayOverrides"],
            "writesDefinition": false
        },
        "sample": {
            "role": "input_bound_content_annotations",
            "owns": ["inputId", "transcriptRevision", "semanticUnits", "captionSpans", "layoutPhrases", "events", "soundEvents", "resourceOverrides"]
        },
        "template": {
            "schemaVersion": "moirai.template.v2",
            "role": "compilable_composition_document",
            "mayContainApplicationOrchestration": true,
            "saveImpliesReusableStyle": false,
            "toDefinition": "explicit_capture_rejecting_unsupported_scene_rules"
        },
        "plan": {
            "role": "resolved_timeline_instances",
            "timingSource": "content_and_time_events"
        },
        "evidence": {
            "role": "context_bound_observations",
            "separateFromReusablePolicy": true,
            "impliesQualityApproval": false
        }
    })
}
