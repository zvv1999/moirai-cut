use super::{
    compiler::CompileInput,
    execution::Evaluation,
    model::*,
    visual_compile::{Binding, Fit},
};
use anyhow::{Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, HashSet};

#[derive(Clone, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RepairPolicy {
    /// Only these visual elements may have their maximum display time reduced.
    #[serde(default)]
    pub shorten_elements: BTreeMap<String, f64>,
    /// Only these pair rules may be changed to a cut. Speech and source timing stay fixed.
    #[serde(default)]
    pub cut_transitions: Vec<String>,
}
#[derive(Clone)]
enum Action {
    Binding(Binding),
    Template(Box<Template>, String),
    Shorten(String, f64),
    Cut(String),
    Rhythm(String, f64, f64),
    Layout(String, f64),
    Event(super::events::EventKind),
}
fn policy(t: &mut Template) -> &mut super::composition::LayoutPolicy {
    t.composition
        .layout_policy
        .get_or_insert(super::composition::LayoutPolicy {
            event_kind: None,
            intent_match_weight: 2.,
            repetition_penalty: 0.,
            min_hold_seconds: 0.,
            base_scores: BTreeMap::new(),
        })
}

/// Cost describes the final request, independently of the path used to discover it.
pub fn repair_cost(original: &CompileInput, candidate: &CompileInput) -> Value {
    let mut components = vec![];
    let a = &original.input.template;
    let b = &candidate.input.template;
    let mut add =
        |kind: &str, id: &str, cost: f64| components.push(json!({"kind":kind,"id":id,"cost":cost}));
    for slot in &b.resource_slots {
        if fingerprint(&binding(original, &slot.id)) != fingerprint(&binding(candidate, &slot.id)) {
            add("resource", &slot.id, 1.);
        }
    }
    for element in &a.elements {
        if let Some(next) = b.elements.iter().find(|e| e.id == element.id) {
            let loss = (element.timing.max_seconds - next.timing.max_seconds).max(0.)
                / element.timing.max_seconds.max(0.001);
            if loss > 0. {
                add(
                    "shorten",
                    &element.id,
                    loss * if element.features.representation == Representation::Text {
                        12.
                    } else {
                        6.
                    },
                );
            }
        }
    }
    for rule in &a.composition.transitions {
        if !b.composition.transitions.iter().any(|r| r.id == rule.id) {
            add("cut", &rule.id, 8.);
        }
    }
    for rule in &a.transition_rules {
        if !matches!(rule.effect, TransitionKind::Cut)
            && b.transition_rules
                .iter()
                .any(|r| r.id == rule.id && matches!(r.effect, TransitionKind::Cut))
        {
            add("cut", &rule.id, 8.);
        }
    }
    if fingerprint(&a.composition.layout_policy) != fingerprint(&b.composition.layout_policy) {
        add("layout_policy", "layout", 2.);
    }
    // Any remaining authored-template change is an explicit alternative, not a cheap repair.
    let mut normalized = b.clone();
    normalized.composition.layout_policy = a.composition.layout_policy.clone();
    for rule in &a.composition.transitions {
        if !normalized
            .composition
            .transitions
            .iter()
            .any(|r| r.id == rule.id)
        {
            normalized.composition.transitions.push(rule.clone());
        }
    }
    normalized
        .composition
        .transitions
        .sort_by(|a, b| a.id.cmp(&b.id));
    for rule in &mut normalized.transition_rules {
        if let Some(old) = a.transition_rules.iter().find(|r| r.id == rule.id) {
            if matches!(rule.effect, TransitionKind::Cut) {
                rule.effect = old.effect.clone();
            }
        }
    }
    for e in &mut normalized.elements {
        if let Some(old) = a.elements.iter().find(|old| old.id == e.id) {
            if e.timing.max_seconds < old.timing.max_seconds {
                e.timing.max_seconds = old.timing.max_seconds;
            }
        }
    }
    let mut baseline = a.clone();
    baseline
        .composition
        .transitions
        .sort_by(|a, b| a.id.cmp(&b.id));
    if fingerprint(&baseline) != fingerprint(&normalized) {
        add("template", "alternative", 20.);
    }
    let total: f64 = components.iter().map(|c| c["cost"].as_f64().unwrap()).sum();
    json!({"model":"final-difference-v1","total":total,"components":components})
}
#[derive(Clone)]
pub struct Node {
    pub request: CompileInput,
    pub strategy: String,
    pub changes: Vec<String>,
    priority: f64,
    axis: String,
    serial: usize,
}
pub struct Search {
    queue: Vec<Node>,
    seen: HashSet<String>,
    actions: Vec<Action>,
    serial: usize,
    pub covered: BTreeSet<String>,
    pub axes: BTreeSet<String>,
    pub duplicates: usize,
    pub limited: bool,
}
pub fn fingerprint<T: Serialize>(v: &T) -> String {
    format!("{:x}", Sha256::digest(serde_json::to_vec(v).unwrap()))
}
fn identity(r: &CompileInput) -> String {
    fingerprint(&json!({"template":r.input.template,"bindings":r.visual_bindings}))
}
fn binding(r: &CompileInput, slot: &str) -> Option<Binding> {
    r.visual_bindings
        .iter()
        .find(|b| b.resource_id == slot)
        .cloned()
        .or_else(|| {
            r.input
                .resolved_template()
                .ok()?
                .asset_id(slot)
                .map(|asset| Binding {
                    resource_id: slot.into(),
                    media_id: asset.into(),
                    source_start_seconds: 0.,
                    fit: Fit::Contain,
                    focal_point: None,
                })
        })
}
fn disabled(r: &CompileInput, slot: &str) -> bool {
    r.input.resolved_template().ok().is_some_and(|t| {
        t.resource_bindings
            .iter()
            .any(|b| b.slot_id == slot && !b.enabled)
    })
}
fn asset_score(r: &CompileInput, b: &Binding) -> f64 {
    let Some(slot) = r
        .input
        .template
        .resource_slots
        .iter()
        .find(|s| s.id == b.resource_id)
    else {
        return -100.;
    };
    let a = &r.media[&b.media_id];
    let kind = a["type"].as_str().unwrap_or("");
    if a["id"] != b.media_id
        || !matches!(kind, "image" | "video")
        || slot.representation == Representation::Image && kind != "image"
        || slot.representation == Representation::Video && kind != "video"
    {
        return -100.;
    }
    if r.input
        .template
        .composition
        .resource_check(
            &slot.id,
            a,
            matches!(b.fit, Fit::Cover),
            b.source_start_seconds,
        )
        .is_err()
    {
        return -100.;
    }
    let tags = a["tags"].as_array();
    let matches = slot
        .tags
        .iter()
        .filter(|tag| tags.is_some_and(|ts| ts.iter().any(|t| t.as_str() == Some(tag))))
        .count();
    let remaining =
        a["duration"].as_f64().unwrap_or(r.input.duration_seconds) - b.source_start_seconds;
    10. * matches as f64 / slot.tags.len().max(1) as f64
        + (remaining / r.input.duration_seconds).clamp(0., 1.) * 5.
}
impl Search {
    pub fn new(input: &Evaluation) -> Result<Self> {
        let r = &input.request;
        let t = &r.input.template;
        ensure!(
            input.repair.shorten_elements.len() <= 32 && input.repair.cut_transitions.len() <= 32,
            "repair policy too large"
        );
        for (id, min) in &input.repair.shorten_elements {
            let e = t
                .elements
                .iter()
                .find(|e| &e.id == id)
                .ok_or_else(|| anyhow::anyhow!("unknown repair element: {id}"))?;
            ensure!(
                e.features.representation != Representation::Audio
                    && min.is_finite()
                    && *min >= e.timing.min_seconds
                    && *min <= e.timing.max_seconds,
                "invalid shortening boundary: {id}"
            );
        }
        for id in &input.repair.cut_transitions {
            ensure!(
                t.composition.transitions.iter().any(|r| &r.id == id)
                    || t.transition_rules.iter().any(|r| &r.id == id),
                "unknown repair transition: {id}"
            );
        }
        let mut slots: BTreeMap<String, Vec<Binding>> = BTreeMap::new();
        for b in &input.resource_candidates {
            ensure!(
                t.resource_slots
                    .iter()
                    .any(|s| s.id == b.resource_id && s.representation.is_visual_asset()),
                "unknown candidate visual slot"
            );
            if !disabled(r, &b.resource_id) {
                slots
                    .entry(b.resource_id.clone())
                    .or_default()
                    .push(b.clone());
            }
        }
        for requirement in &t.composition.resource_requirements {
            if disabled(r, &requirement.slot_id) {
                continue;
            }
            for fallback in &requirement.fallback_slot_ids {
                if let Some(mut b) = binding(r, fallback) {
                    b.resource_id = requirement.slot_id.clone();
                    slots.entry(b.resource_id.clone()).or_default().push(b);
                }
            }
        }
        // Discover only empty visual slots; a user's explicit asset is not silently replaced.
        for slot in t
            .resource_slots
            .iter()
            .filter(|s| s.representation.is_visual_asset())
        {
            if binding(r, &slot.id).is_some() || disabled(r, &slot.id) {
                continue;
            }
            if let Some(media) = r.media.as_object() {
                let mut options: Vec<_> = media
                    .keys()
                    .map(|id| Binding {
                        resource_id: slot.id.clone(),
                        media_id: id.clone(),
                        source_start_seconds: 0.,
                        fit: Fit::Contain,
                        focal_point: None,
                    })
                    .filter(|b| asset_score(r, b) >= 0.)
                    .collect();
                options.sort_by(|a, b| {
                    asset_score(r, b)
                        .total_cmp(&asset_score(r, a))
                        .then(a.media_id.cmp(&b.media_id))
                });
                options.truncate(4);
                slots.entry(slot.id.clone()).or_default().extend(options);
            }
        }
        ensure!(slots.len() <= 64, "too many resource search dimensions");
        let mut search = Self {
            queue: vec![],
            seen: HashSet::new(),
            actions: vec![],
            serial: 0,
            covered: BTreeSet::new(),
            axes: BTreeSet::new(),
            duplicates: 0,
            limited: false,
        };
        let base = Node {
            request: r.clone(),
            strategy: "original".into(),
            changes: vec![],
            priority: 1000.,
            axis: "original".into(),
            serial: 0,
        };
        search.push(base.clone());
        let mut joint = base.clone();
        joint.strategy = "joint-resources".into();
        joint.priority = 900.;
        joint.axis = "joint".into();
        for (slot, mut options) in slots {
            options.sort_by(|a, b| {
                asset_score(r, b)
                    .total_cmp(&asset_score(r, a))
                    .then(fingerprint(a).cmp(&fingerprint(b)))
            });
            let mut seen = HashSet::new();
            options.retain(|b| seen.insert(fingerprint(b)));
            if let Some(first) = options.first() {
                joint
                    .request
                    .visual_bindings
                    .retain(|b| b.resource_id != slot);
                joint.request.visual_bindings.push(first.clone());
                joint
                    .changes
                    .push(format!("resource:{slot}:{}", first.media_id));
            }
            for option in options {
                search.actions.push(Action::Binding(option));
            }
            search.axes.insert(format!("resource:{slot}"));
        }
        if !joint.changes.is_empty() {
            search.push(joint);
        }
        for (i, t) in input.alternatives.iter().enumerate() {
            search.actions.push(Action::Template(
                Box::new(t.clone()),
                format!("alternative-{}", i + 1),
            ));
        }
        let p = t
            .composition
            .layout_policy
            .clone()
            .unwrap_or(super::composition::LayoutPolicy {
                event_kind: None,
                intent_match_weight: 2.,
                repetition_penalty: 0.,
                min_hold_seconds: 0.,
                base_scores: BTreeMap::new(),
            });
        for (name, hold, penalty) in [("stable", 2., 0.), ("varied", 0.8, 2.)] {
            search
                .actions
                .push(Action::Rhythm(name.into(), hold, penalty));
        }
        if r.source.is_some() {
            for layout in t.layouts.iter().take(4) {
                search.actions.push(Action::Layout(
                    layout.id.clone(),
                    p.base_scores.get(&layout.id).copied().unwrap_or(0.) + 3.,
                ));
            }
            for kind in [
                super::events::EventKind::Shot,
                super::events::EventKind::Beat,
                super::events::EventKind::Section,
            ] {
                if r.input.events.iter().any(|e| e.kind == kind) {
                    search.actions.push(Action::Event(kind));
                }
            }
        }
        for (id, min) in &input.repair.shorten_elements {
            search.actions.push(Action::Shorten(id.clone(), *min));
        }
        for id in &input.repair.cut_transitions {
            search.actions.push(Action::Cut(id.clone()));
        }
        search.expand(&base, 0.);
        Ok(search)
    }
    fn push(&mut self, mut node: Node) {
        node.request
            .visual_bindings
            .sort_by(|a, b| a.resource_id.cmp(&b.resource_id));
        if !self.seen.insert(identity(&node.request)) {
            self.duplicates += 1;
            return;
        }
        if self.queue.len() >= 2048 {
            self.limited = true;
            return;
        }
        node.serial = self.serial;
        self.serial += 1;
        self.queue.push(node);
    }
    pub fn next(&mut self) -> Option<Node> {
        let best = self
            .queue
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| {
                let priority = |n: &Node| {
                    n.priority
                        + if !self.covered.contains(&n.axis) {
                            200.
                        } else {
                            0.
                        }
                };
                priority(a)
                    .total_cmp(&priority(b))
                    .then(b.serial.cmp(&a.serial))
            })
            .map(|(i, _)| i)?;
        let n = self.queue.remove(best);
        self.covered.insert(n.axis.clone());
        Some(n)
    }
    pub fn expand(&mut self, node: &Node, score: f64) {
        for action in self.actions.clone() {
            if let Action::Shorten(id, min) = &action {
                let Some(e) = node
                    .request
                    .input
                    .template
                    .elements
                    .iter()
                    .find(|e| e.id == *id)
                else {
                    continue;
                };
                if e.features.representation == Representation::Audio {
                    continue;
                }
                let lower = (*min).max(e.timing.min_seconds);
                let mut durations = vec![lower];
                if let Some(slot) = &e.resource_id {
                    for b in node
                        .request
                        .visual_bindings
                        .iter()
                        .filter(|b| b.resource_id == *slot)
                    {
                        if let Some(d) = node.request.media[&b.media_id]["duration"].as_f64() {
                            durations.push(d - b.source_start_seconds);
                        }
                    }
                    if let Some(b) = binding(&node.request, slot) {
                        if let Some(d) = node.request.media[&b.media_id]["duration"].as_f64() {
                            durations.push(d - b.source_start_seconds);
                        }
                    }
                }
                durations.retain(|d| d.is_finite() && *d >= lower && *d < e.timing.max_seconds);
                durations.sort_by(|a, b| b.total_cmp(a));
                durations.dedup();
                for duration in durations {
                    let mut next = node.clone();
                    next.request
                        .input
                        .template
                        .elements
                        .iter_mut()
                        .find(|e| e.id == *id)
                        .unwrap()
                        .timing
                        .max_seconds = duration;
                    next.axis = format!("shorten:{id}");
                    self.axes.insert(next.axis.clone());
                    next.strategy = format!("shorten:{id}:{duration}");
                    next.changes.push(next.strategy.clone());
                    next.priority =
                        score - 5. - (e.timing.max_seconds - duration) / e.timing.max_seconds;
                    self.push(next);
                }
                continue;
            }
            let mut next = node.clone();
            let change = match action {
                Action::Rhythm(name, hold, penalty) => {
                    let p = policy(&mut next.request.input.template);
                    p.min_hold_seconds = hold;
                    p.repetition_penalty = penalty;
                    next.axis = "policy:rhythm".into();
                    next.priority = score;
                    name
                }
                Action::Layout(id, value) => {
                    if !next
                        .request
                        .input
                        .template
                        .layouts
                        .iter()
                        .any(|l| l.id == id)
                    {
                        continue;
                    }
                    policy(&mut next.request.input.template)
                        .base_scores
                        .insert(id.clone(), value);
                    next.axis = format!("policy:layout:{id}");
                    next.priority = score;
                    format!("layout-{id}")
                }
                Action::Event(kind) => {
                    policy(&mut next.request.input.template).event_kind = Some(kind.clone());
                    next.axis = "policy:event".into();
                    next.priority = score;
                    format!("event-{kind:?}")
                }
                Action::Binding(b) => {
                    if disabled(&next.request, &b.resource_id) {
                        continue;
                    }
                    next.axis = format!("resource:{}", b.resource_id);
                    next.priority = score + asset_score(&next.request, &b) * 0.1;
                    next.request
                        .visual_bindings
                        .retain(|v| v.resource_id != b.resource_id);
                    next.request.visual_bindings.push(b.clone());
                    format!("resource:{}:{}", b.resource_id, b.media_id)
                }
                Action::Template(t, name) => {
                    next.request.input.template = *t;
                    next.axis = format!("template:{name}");
                    next.priority = score;
                    name
                }
                Action::Shorten(..) => unreachable!("shortening handled above"),
                Action::Cut(id) => {
                    let t = &mut next.request.input.template;
                    t.composition.transitions.retain(|r| r.id != id);
                    for r in &mut t.transition_rules {
                        if r.id == id {
                            r.effect = TransitionKind::Cut;
                        }
                    }
                    next.axis = format!("cut:{id}");
                    next.priority = score - 10.;
                    format!("cut:{id}")
                }
            };
            self.axes.insert(next.axis.clone());
            next.strategy = change.clone();
            next.changes.push(change);
            next.priority -= next.changes.len() as f64 * 0.2;
            self.push(next);
        }
    }
    pub fn report(&self) -> Value {
        json!({"frontierRemaining":self.queue.len(),"coveredDimensions":self.covered,"unexploredDimensions":self.axes.difference(&self.covered).collect::<Vec<_>>(),"duplicatesSkipped":self.duplicates,"frontierLimited":self.limited})
    }
    pub fn remaining(&self) -> bool {
        !self.queue.is_empty() || self.limited
    }
}
