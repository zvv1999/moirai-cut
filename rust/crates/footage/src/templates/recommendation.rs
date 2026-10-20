use super::{api::root, compiler, model::Template, rhythm, transcription};
use crate::{domain::Job, service::App, storage, store};
use anyhow::{Context, Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::fs;

pub(super) const MODEL: &str = "intfloat/multilingual-e5-small";
pub(super) const REVISION: &str = "614241f622f53c4eeff9890bdc4f31cfecc418b3";
const METHOD: &str = "semantic-topic-style-v2";

#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub input_id: String,
    pub transcript_revision: u64,
    #[serde(default)]
    pub brief: String,
    #[serde(default = "default_limit")]
    pub limit: usize,
}
fn default_limit() -> usize {
    5
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    request: Request,
    input: transcription::Input,
    transcript: transcription::Transcript,
    templates: Vec<Template>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Embeddings {
    model_id: String,
    model_revision: String,
    pub model_sha256: String,
    pub tokenizer_sha256: String,
    pub engine_version: String,
    pub vectors: Vec<Vector>,
}
#[derive(Deserialize)]
pub(super) struct Vector {
    pub embedding: Vec<f64>,
    pub truncated: bool,
}

pub fn enqueue(app: &App, request: Request) -> Result<Job> {
    ensure!(
        (1..=10).contains(&request.limit) && request.brief.chars().count() <= 300,
        "invalid recommendation request"
    );
    let input: transcription::Input = app.db.get("template_input", &request.input_id)?;
    let transcript: transcription::Transcript =
        app.db.get("template_transcript", &request.input_id)?;
    ensure!(
        transcript.revision == request.transcript_revision,
        "revision_conflict"
    );
    ensure!(
        transcript.source_sha256 == input.sha256 && !transcript.words.is_empty(),
        "需要当前素材的非空转写"
    );
    ensure!(
        storage::hash(&transcription::file(app, &input.id, "original")?.0)? == input.sha256,
        "输入文件已变化"
    );
    let mut templates = app.db.list::<Template>("template")?;
    templates.sort_by(|a, b| a.id.cmp(&b.id));
    ensure!(!templates.is_empty(), "没有可匹配模板");
    let snapshot = Snapshot {
        request,
        input,
        transcript,
        templates,
    };
    let target = format!(
        "recommend-{:x}",
        Sha256::digest(serde_json::to_vec(&(MODEL, REVISION, METHOD, &snapshot))?)
    );
    app.db.transaction(|db| {
        if let Some(job) = store::list::<Job>(db, "job")?.into_iter().find(|j| {
            j.kind == "template_recommendation"
                && j.target_id == target
                && ["queued", "running", "succeeded"].contains(&j.status.as_str())
        }) {
            return Ok(job);
        }
        store::put(db, "template_recommendation_input", &target, &snapshot)?;
        let job = Job::new("template_recommendation", &target, 0);
        store::put(db, "job", &job.id, &job)?;
        Ok(job)
    })
}

fn chunks(words: &[rhythm::Word]) -> Vec<String> {
    let mut output = vec![];
    let mut current = vec![];
    let mut count = 0;
    for word in words {
        let size = word.text.chars().count();
        if count + size > 220 && !current.is_empty() {
            output.push(rhythm::text(&current));
            current.clear();
            count = 0;
        }
        count += size;
        current.push(word.clone());
    }
    if !current.is_empty() {
        output.push(rhythm::text(&current));
    }
    output
}

pub(super) fn cosine(a: &[f64], b: &[f64]) -> Result<f64> {
    ensure!(
        a.len() == 384 && b.len() == 384 && a.iter().chain(b).all(|x| x.is_finite()),
        "invalid embedding"
    );
    let aa = a.iter().map(|v| v * v).sum::<f64>();
    let bb = b.iter().map(|v| v * v).sum::<f64>();
    ensure!(aa > 0. && bb > 0., "zero embedding");
    Ok((a.iter().zip(b).map(|(x, y)| x * y).sum::<f64>() / (aa * bb).sqrt()).clamp(-1., 1.))
}

pub fn run(app: &App, target: &str) -> Result<()> {
    let snapshot: Snapshot = app.db.get("template_recommendation_input", target)?;
    let source_chunks = chunks(&snapshot.transcript.words);
    let mut queries = source_chunks
        .iter()
        .map(|s| format!("query: {s}"))
        .collect::<Vec<_>>();
    let has_brief = !snapshot.request.brief.trim().is_empty();
    if has_brief {
        queries.push(format!("query: {}", snapshot.request.brief));
    }
    let passages = snapshot
        .templates
        .iter()
        .flat_map(|t| {
            [
                format!("passage: 关于{}的短视频内容", t.tags.join("、")),
                format!(
                    "passage: {}。适用主题：{}。画面设计：{}",
                    t.name,
                    t.tags.join("、"),
                    t.description
                ),
            ]
        })
        .collect::<Vec<_>>();
    let texts = queries.iter().chain(&passages).cloned().collect::<Vec<_>>();
    let dir = root(app).join("recommendations").join(target);
    let embedded = embed(app, &dir, &texts)?;
    let mut ranked = vec![];
    let total_weight = source_chunks
        .iter()
        .map(|s| s.chars().count())
        .sum::<usize>() as f64;
    for (i, t) in snapshot.templates.iter().enumerate() {
        let vector = &embedded.vectors[queries.len() + i * 2];
        let style_vector = &embedded.vectors[queries.len() + i * 2 + 1];
        let mut content_score = 0.;
        let mut best = (-2., 0);
        for (j, chunk) in source_chunks.iter().enumerate() {
            let score = cosine(&vector.embedding, &embedded.vectors[j].embedding)?;
            content_score += score * chunk.chars().count() as f64 / total_weight;
            if score > best.0 {
                best = (score, j);
            }
        }
        let brief_score = if has_brief {
            Some(cosine(
                &style_vector.embedding,
                &embedded.vectors[queries.len() - 1].embedding,
            )?)
        } else {
            None
        };
        let score = brief_score
            .map(|s| 0.7 * content_score + 0.3 * s)
            .unwrap_or(content_score);
        let mut warnings = vec![];
        if vector.truncated
            || style_vector.truncated
            || embedded.vectors[..queries.len()]
                .iter()
                .any(|v| v.truncated)
        {
            warnings.push("embedding_text_truncated".to_string());
        }
        if let (Some(w), Some(h)) = (snapshot.input.width, snapshot.input.height) {
            if (w as f64 / h as f64 - t.canvas.width as f64 / t.canvas.height as f64).abs() > 0.02 {
                warnings.push("source_aspect_requires_reframing".into());
            }
        }
        let unresolved = t
            .resource_slots
            .iter()
            .filter(|r| t.asset_id(&r.id).is_none())
            .map(|r| r.id.clone())
            .collect::<Vec<_>>();
        let mut unsupported = t
            .elements
            .iter()
            .filter(|e| !compiler::supported_representation(&e.features.representation))
            .map(|e| {
                serde_json::to_value(&e.features.representation)
                    .unwrap()
                    .as_str()
                    .unwrap()
                    .to_owned()
            })
            .collect::<Vec<_>>();
        unsupported.sort();
        unsupported.dedup();
        ranked.push(json!({"templateId":t.id,"templateRevision":t.revision,"name":t.name,"score":score,
            "referenceId":t.evidence.iter().find_map(|e|e.reference_id.as_ref()),
            "contentScore":content_score,"briefScore":brief_score,"tags":t.tags,"description":t.description,
            "matchedText":source_chunks[best.1],"canvas":t.canvas,"unresolvedResources":unresolved,
            "unsupportedElements":unsupported,"warnings":warnings}));
    }
    ranked.sort_by(|a, b| {
        b["score"]
            .as_f64()
            .unwrap()
            .total_cmp(&a["score"].as_f64().unwrap())
            .then_with(|| a["templateId"].as_str().cmp(&b["templateId"].as_str()))
    });
    ranked.truncate(snapshot.request.limit);
    app.db.put("template_recommendation_result",target,&json!({"inputId":snapshot.input.id,
        "transcriptRevision":snapshot.transcript.revision,"sourceSha256":snapshot.input.sha256,"brief":snapshot.request.brief,
        "modelId":MODEL,"modelRevision":REVISION,"modelSha256":embedded.model_sha256,"tokenizerSha256":embedded.tokenizer_sha256,
        "engineVersion":embedded.engine_version,"method":METHOD,"queryChunks":source_chunks.len(),"candidates":ranked,
        "warnings":["semantic_similarity_is_not_a_quality_or_confidence_score","visual_content_not_analyzed_for_recommendation"]}))
}

pub(super) fn embed(app: &App, dir: &std::path::Path, texts: &[String]) -> Result<Embeddings> {
    fs::create_dir_all(dir)?;
    let manifest = dir.join("manifest.json");
    fs::write(
        &manifest,
        serde_json::to_vec(&json!({"modelId":MODEL,"modelRevision":REVISION,"texts":texts}))?,
    )?;
    let adapter = dir.join("inference.py");
    fs::write(&adapter, include_str!("embed_templates.py"))?;
    let output = dir.join("embeddings.json");
    let python = std::env::var_os("MOIRAI_TEMPLATE_PYTHON")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            app.home
                .join(".moirai-cut/template-workbench/audio-env/bin/python")
        });
    app.media.run(
        &python.to_string_lossy(),
        &[
            adapter.to_string_lossy().into(),
            manifest.to_string_lossy().into(),
            output.to_string_lossy().into(),
        ],
        1800,
    )?;
    let embedded: Embeddings = serde_json::from_slice(&fs::read(output)?)?;
    ensure!(
        embedded.model_id == MODEL
            && embedded.model_revision == REVISION
            && embedded.vectors.len() == texts.len(),
        "unexpected embedding output"
    );
    Ok(embedded)
}

pub fn read(app: &App, job_id: &str) -> Result<Value> {
    let job: Job = app.db.get("job", job_id)?;
    ensure!(
        job.kind == "template_recommendation",
        "not a recommendation job"
    );
    if job.status != "succeeded" {
        return Ok(json!({"job":job,"result":null}));
    }
    let mut result: Value = app
        .db
        .get("template_recommendation_result", &job.target_id)?;
    let input_id = result["inputId"]
        .as_str()
        .context("missing recommendation input")?;
    let transcript: transcription::Transcript = app.db.get("template_transcript", input_id)?;
    let current = app.db.list::<Template>("template")?;
    let snapshot: Snapshot = app
        .db
        .get("template_recommendation_input", &job.target_id)?;
    let stale = result["method"] != METHOD
        || transcript.revision != snapshot.transcript.revision
        || current.len() != snapshot.templates.len()
        || snapshot.templates.iter().any(|t| {
            !current
                .iter()
                .any(|c| c.id == t.id && c.revision == t.revision)
        });
    result["stale"] = json!(stale);
    // Rendering support can change independently of the saved ranking or template revision.
    if let Some(candidates) = result["candidates"].as_array_mut() {
        for candidate in candidates {
            if let Some(template) = snapshot
                .templates
                .iter()
                .find(|t| candidate["templateId"] == t.id)
            {
                let mut unsupported: Vec<String> = template
                    .elements
                    .iter()
                    .filter(|e| !compiler::supported_representation(&e.features.representation))
                    .map(|e| {
                        serde_json::to_value(&e.features.representation)
                            .unwrap()
                            .as_str()
                            .unwrap()
                            .to_owned()
                    })
                    .collect();
                unsupported.sort();
                unsupported.dedup();
                candidate["unsupportedElements"] = json!(unsupported);
            }
        }
    }
    Ok(json!({"job":job,"result":result}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn chunks_preserve_the_entire_transcript() {
        let words = (0..30)
            .map(|i| rhythm::Word {
                text: "持续的内容价值".repeat(3),
                start: i as f64,
                end: i as f64 + 0.5,
                speaker: None,
                emphasis: 0.,
            })
            .collect::<Vec<_>>();
        let result = chunks(&words);
        assert!(result.len() > 1);
        assert_eq!(result.concat(), rhythm::text(&words));
    }
    #[test]
    fn cosine_rejects_invalid_vectors_and_preserves_similarity_order() {
        let a = vec![1.; 384];
        let b = vec![-1.; 384];
        assert_eq!(cosine(&a, &a).unwrap(), 1.);
        assert_eq!(cosine(&a, &b).unwrap(), -1.);
        assert!(cosine(&a, &vec![0.; 384]).is_err());
        assert!(cosine(&a, &vec![f64::NAN; 384]).is_err());
    }
}
