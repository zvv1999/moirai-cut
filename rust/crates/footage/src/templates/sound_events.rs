use super::{composition::*, model::*};
use anyhow::{Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SoundEvent {
    pub id: String,
    pub kind: SoundEventKind,
    pub start: f64,
    pub end: f64,
    pub strength: f64,
    pub confidence: f64,
    pub source_id: String,
    pub evidence: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScheduleDecision {
    pub event_id: String,
    pub element_id: String,
    pub score: f64,
    pub selected: bool,
    pub reason: String,
}
pub fn validate(events: &[SoundEvent], duration: f64) -> Result<()> {
    let mut ids = HashSet::new();
    ensure!(events.len() <= 30000, "too many sound events");
    for e in events {
        ensure!(
            valid_id(&e.id)
                && ids.insert(&e.id)
                && valid_id(&e.source_id)
                && !e.evidence.trim().is_empty()
                && e.evidence.len() <= 2000,
            "sound event requires unique identity and source evidence"
        );
        ensure!(
            e.start.is_finite()
                && e.end.is_finite()
                && e.start >= 0.
                && e.end >= e.start
                && e.end <= duration
                && (0.0..=1.).contains(&e.strength)
                && (0.0..=1.).contains(&e.confidence),
            "invalid sound event"
        );
    }
    Ok(())
}
