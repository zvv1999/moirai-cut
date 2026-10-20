use super::{compiler::CompileInput, model::Template, visual_compile::Binding};
use anyhow::{Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

pub const CONTRACT: &str = "moirai.execution.v1";
pub const METRIC_VERSION: &str = "caption-budget-v2";

pub fn preflight(
    request: CompileInput,
    compile: impl FnOnce(CompileInput) -> Result<Value>,
) -> Value {
    let fingerprint = format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&request).unwrap())
    );
    match compile(request) {
        Ok(output) => json!({"contractVersion":CONTRACT,"requestFingerprint":fingerprint,
            "executable":true,"issues":[],"warnings":output["warnings"],"elementCount":output["elementCount"]}),
        Err(error) => json!({"contractVersion":CONTRACT,"requestFingerprint":fingerprint,
            "executable":false,"issues":[{"code":"compile_rejected","stage":"compile","message":format!("{error:#}")}],"warnings":[]}),
    }
}

#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Evaluation {
    pub request: CompileInput,
    #[serde(default)]
    pub alternatives: Vec<Template>,
    /// Explicit candidate bindings; the bounded search considers combinations across slots.
    #[serde(default)]
    pub resource_candidates: Vec<Binding>,
    #[serde(default = "default_limit")]
    pub max_candidates: usize,
    #[serde(default)]
    pub weights: BTreeMap<String, f64>,
    #[serde(default)]
    pub repair: super::search::RepairPolicy,
    #[serde(default = "default_profile")]
    pub profile_id: String,
}
fn default_profile() -> String {
    "default".into()
}
fn default_limit() -> usize {
    12
}

fn num(v: &Value, key: &str) -> f64 {
    v[key].as_f64().unwrap_or(0.)
}
fn array<'a>(v: &'a Value, key: &str) -> &'a [Value] {
    v[key].as_array().map(Vec::as_slice).unwrap_or(&[])
}

pub(crate) fn metrics(plan: &Value, request: &CompileInput) -> BTreeMap<String, f64> {
    let duration = num(plan, "durationSeconds").max(0.001);
    let elements: Vec<_> = array(plan, "elements")
        .iter()
        .chain(array(plan, "sounds"))
        .collect();
    let mut spans: Vec<_> = elements
        .iter()
        .map(|e| (num(e, "start"), num(e, "end")))
        .collect();
    if request.source.is_some() {
        spans.push((0., duration));
    }
    spans.sort_by(|a, b| a.0.total_cmp(&b.0));
    let (mut coverage, mut end) = (0., 0f64);
    for (a, b) in spans {
        coverage += (b - end.max(a)).max(0.);
        end = end.max(b);
    }
    let captions = array(plan, "captions");
    let reading_budget = request
        .input
        .caption_policy
        .as_ref()
        .unwrap_or(&request.input.template.segmentation)
        .max_characters_per_second;
    let burden: f64 = captions
        .iter()
        .map(|c| {
            let cps = super::rhythm::reading_speed(
                c["text"].as_str().unwrap_or(""),
                num(c, "start"),
                num(c, "end"),
            );
            (cps / reading_budget - 1.).max(0.)
        })
        .sum();
    let events = array(plan, "events");
    let alignment = elements
        .iter()
        .map(|e| {
            events
                .iter()
                .map(|v| (num(e, "start") - num(v, "start")).abs())
                .fold(f64::INFINITY, f64::min)
        })
        .filter(|d| *d <= 0.12)
        .count() as f64
        / elements.len().max(1) as f64;
    let layouts = array(plan, "layouts");
    let short = layouts
        .iter()
        .filter(|l| num(l, "end") - num(l, "start") < 0.8)
        .count();
    let distinct = layouts
        .iter()
        .filter_map(|l| l["layoutId"].as_str())
        .collect::<std::collections::HashSet<_>>()
        .len();
    let repeated = layouts.len().saturating_sub(distinct);
    let resources = &request.input.template.resource_slots;
    let relevance: Vec<f64> = request
        .visual_bindings
        .iter()
        .filter_map(|b| {
            let slot = resources.iter().find(|s| s.id == b.resource_id)?;
            let tags = &request.media[&b.media_id]["tags"];
            if slot.tags.is_empty() {
                return None;
            }
            Some(
                slot.tags
                    .iter()
                    .filter(|tag| {
                        tags.as_array()
                            .is_some_and(|ts| ts.iter().any(|t| t.as_str() == Some(tag.as_str())))
                    })
                    .count() as f64
                    / slot.tags.len() as f64,
            )
        })
        .collect();
    BTreeMap::from([
        ("coverage".into(), (coverage / duration).clamp(0., 1.)),
        (
            "readability".into(),
            1. / (1. + burden / captions.len().max(1) as f64),
        ),
        ("eventAlignment".into(), alignment),
        (
            "continuity".into(),
            1. - short as f64 / layouts.len().max(1) as f64,
        ),
        (
            "variation".into(),
            if layouts.len() < 2 {
                0.5
            } else {
                1. - repeated as f64 / (layouts.len() - 1) as f64
            },
        ),
        (
            "resourceRelevance".into(),
            if relevance.is_empty() {
                0.5
            } else {
                relevance.iter().sum::<f64>() / relevance.len() as f64
            },
        ),
    ])
}

pub fn evaluate(
    input: Evaluation,
    mut compile: impl FnMut(CompileInput) -> Result<Value>,
) -> Result<Value> {
    ensure!(
        (1..=24).contains(&input.max_candidates),
        "maxCandidates must be between 1 and 24"
    );
    ensure!(
        input.alternatives.len() <= 8 && input.resource_candidates.len() <= 64,
        "candidate input limit exceeded"
    );
    let names = [
        "coverage",
        "readability",
        "eventAlignment",
        "continuity",
        "variation",
        "resourceRelevance",
    ];
    ensure!(
        input
            .weights
            .iter()
            .all(|(k, v)| names.contains(&k.as_str()) && v.is_finite() && *v >= 0. && *v <= 100.),
        "invalid evaluation weights"
    );
    let weights: BTreeMap<String, f64> = names
        .into_iter()
        .map(|n| (n.into(), input.weights.get(n).copied().unwrap_or(1.)))
        .collect();
    let total: f64 = weights.values().sum();
    ensure!(
        total > 0.,
        "at least one evaluation weight must be positive"
    );
    let mut search = super::search::Search::new(&input)?;
    let mut candidates = vec![];
    while candidates.len() < input.max_candidates {
        let Some(node) = search.next() else {
            break;
        };
        let mut request = node.request.clone();
        let index = candidates.len();
        request.idempotency_key = format!(
            "candidate-{}-{}",
            &super::search::fingerprint(&input.request.idempotency_key)[..24],
            index
        );
        let fingerprint = super::search::fingerprint(&request);
        let cost = super::search::repair_cost(&input.request, &request);
        let (mut candidate, score) = match compile(request.clone()) {
            Ok(output) => {
                ensure!(
                    !output["deduplicated"].as_bool().unwrap_or(false),
                    "candidate evaluation requires an unapplied request"
                );
                let values = metrics(&output["plan"], &request);
                let score = 100. * values.iter().map(|(k, v)| v * weights[k]).sum::<f64>() / total;
                (
                    json!({"id":index,"strategy":node.strategy,"changes":node.changes,"executable":true,"score":score,"metrics":values,"warnings":output["warnings"],"plan":output["plan"],"request":request,"requestFingerprint":fingerprint}),
                    score,
                )
            }
            Err(error) => (
                json!({"id":index,"strategy":node.strategy,"changes":node.changes,"executable":false,"score":null,"issues":[{"code":"compile_rejected","stage":"compile","message":format!("{error:#}")}],"request":request,"requestFingerprint":fingerprint}),
                0.,
            ),
        };
        candidate["repairCost"] = cost;
        search.expand(&node, score);
        candidates.push(candidate);
    }
    let truncated = search.remaining();
    let search_report = search.report();
    candidates.sort_by(|a, b| {
        b["executable"]
            .as_bool()
            .cmp(&a["executable"].as_bool())
            .then_with(|| num(b, "score").total_cmp(&num(a, "score")))
            .then_with(|| a["id"].as_u64().cmp(&b["id"].as_u64()))
    });
    let selected = candidates
        .iter()
        .find(|c| c["executable"] == true)
        .map(|c| c["id"].clone());
    Ok(
        json!({"contractVersion":CONTRACT,"scoreModel":"heuristic-v2","metricVersion":METRIC_VERSION,"weights":weights,"selectedId":selected,"searchTruncated":truncated,"search":search_report,"candidates":candidates}),
    )
}
