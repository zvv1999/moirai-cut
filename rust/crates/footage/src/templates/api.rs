use super::{
    audio, compiler,
    model::{Template, valid_id},
    rhythm::{self, PlanInput},
    seed, transcription,
};
use crate::{
    service::{ApiError, App},
    store,
};
use anyhow::{Context, Result, ensure};
use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, Path, Query, State},
    http::HeaderMap,
    response::Response,
    routing::{get, post},
};
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf, sync::Arc};
use tokio::io::AsyncWriteExt;
type Shared = Arc<App>;
fn optional<T: serde::de::DeserializeOwned>(
    db: &rusqlite::Connection,
    kind: &str,
    id: &str,
) -> Result<Option<T>> {
    let exists: bool = db.query_row(
        "SELECT EXISTS(SELECT 1 FROM records WHERE kind=?1 AND id=?2)",
        rusqlite::params![kind, id],
        |row| row.get(0),
    )?;
    if exists {
        Ok(Some(store::get(db, kind, id)?))
    } else {
        Ok(None)
    }
}
pub fn root(app: &App) -> PathBuf {
    app.config.data_dir.join("templates")
}
pub fn bootstrap(app: &App) -> Result<()> {
    fs::create_dir_all(root(app))?;
    app.db.transaction(|db| {
        for t in seed::templates()? {
            if optional::<Template>(db, "template", &t.id)?.is_none() {
                store::put(db, "template", &t.id, &t)?;
                store::put(db, "template_version", &format!("{}-r1", t.id), &t)?;
            }
        }
        Ok(())
    })?;
    let existing = app.db.list::<Value>("template")?;
    app.db.transaction(|db| {
        for raw in existing {
            if raw["schemaVersion"] != "moirai.template.v1" {
                continue;
            }
            let template: Template = serde_json::from_value(raw.clone())?;
            template.validate()?;
            let backup_id = format!("{}-r{}-v1", template.id, template.revision);
            if optional::<Value>(db, "template_schema_source", &backup_id)?.is_none() {
                store::put(db, "template_schema_source", &backup_id, &raw)?;
            }
            store::put(db, "template", &template.id, &template)?;
        }
        Ok(())
    })
}
pub fn router() -> Router<Shared> {
    Router::new()
        .route("/timeline/copies/remap", post(remap_timeline_copies))
        .route("/templates", get(list))
        .route("/templates/references", post(submit_reference))
        .route("/templates/references/schema", get(reference_schema))
        .route("/templates/references/{id}", get(read_reference))
        .route(
            "/templates/references/{id}/frames/{index}",
            get(reference_frame),
        )
        .route(
            "/templates/dynamic-assets",
            get(dynamic_assets).post(save_dynamic_asset),
        )
        .route(
            "/templates/dynamic-assets/schema",
            get(dynamic_asset_schema),
        )
        .route(
            "/templates/dynamic-assets/placement-advice",
            post(dynamic_asset_placement_advice),
        )
        .route(
            "/templates/dynamic-assets/reviews",
            get(list_style_reviews).post(save_style_review),
        )
        .route(
            "/templates/dynamic-assets/review-series",
            get(list_style_review_series).post(save_style_review_series),
        )
        .route(
            "/templates/dynamic-assets/archive",
            post(archive_dynamic_asset),
        )
        .route(
            "/templates/dynamic-assets/application-history",
            get(list_application_history).post(save_application_history),
        )
        .route(
            "/templates/dynamic-assets/application-history/{id}",
            get(read_application_history),
        )
        .route(
            "/templates/dynamic-assets/application-history/{id}/restore",
            post(restore_application_history),
        )
        .route("/templates/dynamic-assets/draft", post(draft_dynamic_asset))
        .route(
            "/templates/dynamic-assets/capture",
            post(capture_dynamic_asset),
        )
        .route(
            "/templates/dynamic-assets/create",
            post(create_dynamic_asset),
        )
        .route(
            "/templates/dynamic-assets/duplicate",
            post(duplicate_dynamic_asset),
        )
        .route(
            "/templates/dynamic-assets/layers",
            post(edit_dynamic_asset_layers),
        )
        .route(
            "/templates/dynamic-assets/media",
            post(edit_dynamic_asset_media),
        )
        .route(
            "/templates/dynamic-assets/inspect",
            post(inspect_dynamic_asset),
        )
        .route(
            "/templates/dynamic-assets/preview",
            post(preview_dynamic_asset),
        )
        .route(
            "/templates/dynamic-assets/detach-preview",
            post(preview_detached_dynamic_asset),
        )
        .route(
            "/templates/dynamic-assets/insert",
            post(insert_dynamic_asset),
        )
        .route(
            "/templates/dynamic-assets/application",
            post(dynamic_asset_application),
        )
        .route(
            "/templates/dynamic-assets/application-preview",
            post(preview_dynamic_asset_application),
        )
        .route(
            "/templates/dynamic-assets/sample-preview",
            post(preview_dynamic_asset_sample),
        )
        .route(
            "/templates/samples/validate",
            post(validate_template_samples),
        )
        .route("/templates/dynamic-assets/{id}", get(read_dynamic_asset))
        .route("/templates/previews", get(template_previews))
        .route("/templates/reviews", post(save_review))
        .route("/templates/stickers", get(stickers).post(save_sticker))
        .route("/templates/stickers/insert", post(insert_sticker))
        .route("/templates/elements/remove", post(remove_element))
        .route("/templates/elements/duplicate", post(duplicate_element))
        .route("/templates/elements/add", post(add_element))
        .route("/templates/elements/entrance", post(apply_element_entrance))
        .route("/templates/elements/envelope", post(apply_element_envelope))
        .route("/templates/create", post(create_template_draft))
        .route("/templates/schema", get(schema))
        .route(
            "/templates/assets",
            get(visual_assets).post(import_visual_asset),
        )
        .route("/templates/assets/resolve", post(resolve_visual_assets))
        .route("/templates/assets/insert", post(insert_visual_asset))
        .route("/templates/assets/{id}/media", get(visual_asset_media))
        .route(
            "/templates/production/prepare",
            post(prepare_production).layer(DefaultBodyLimit::max(64 * 1024 * 1024)),
        )
        .route(
            "/templates/production/{id}/items/{index}/captions/{fixture}",
            get(production_captions),
        )
        .route(
            "/templates/production",
            get(productions)
                .post(produce)
                .layer(DefaultBodyLimit::max(64 * 1024 * 1024)),
        )
        .route("/templates/production/{id}", get(production))
        .route(
            "/templates/production/{id}/items/{index}/reading-diagnostic",
            post(production_reading_diagnostic),
        )
        .route(
            "/templates/production/{id}/execute",
            post(production_execute),
        )
        .route(
            "/templates/production/{id}/control",
            post(production_control),
        )
        .route(
            "/templates/production/{id}/items/{index}",
            get(production_item),
        )
        .route(
            "/templates/production/{id}/items/{index}/audit",
            post(production_audit),
        )
        .route(
            "/templates/production/{id}/items/{index}/publish",
            post(production_publish),
        )
        .route(
            "/templates/production/{id}/items/{index}/render",
            post(production_render),
        )
        .route(
            "/templates/production/{id}/items/{index}/previews/{fixture}",
            get(production_preview),
        )
        .route("/templates/ontology", post(project_ontology))
        .route("/templates/ontology/plan", post(plan_ontology))
        .route("/templates/{id}/ontology", get(read_ontology))
        .route("/templates/save", post(save))
        .route("/templates/validate", post(validate))
        .route("/templates/plan", post(plan))
        .route("/templates/content/edit", post(edit_content))
        .route("/templates/captions/edit", post(edit_captions))
        .route(
            "/templates/repair",
            post(repair).layer(DefaultBodyLimit::max(32 * 1024 * 1024)),
        )
        .route("/templates/preferences/{id}", get(preference_profile))
        .route("/templates/preferences", post(preference_feedback))
        .route("/templates/preferences/retract", post(preference_retract))
        .route(
            "/templates/preflight",
            post(preflight).layer(DefaultBodyLimit::max(32 * 1024 * 1024)),
        )
        .route(
            "/templates/evaluate",
            post(evaluate).layer(DefaultBodyLimit::max(32 * 1024 * 1024)),
        )
        .route(
            "/templates/compile",
            // Compilation roundtrips the editable document, including its thumbnail.
            post(compile).layer(DefaultBodyLimit::max(32 * 1024 * 1024)),
        )
        .route("/templates/{id}", get(read))
        .route("/templates/media/{id}/{variant}", get(media))
        .route("/templates/references/{id}/separate", post(separate))
        .route("/templates/sounds/{id}/audio", get(sound_media))
        .route("/templates/sounds/{id}/review", post(review_sound))
        .route("/templates/sounds/clip", post(clip_sound))
        .route("/templates/sounds/analyze", post(analyze_sounds))
        .route("/templates/sounds/search", post(search_sounds))
        .route("/templates/tts/voices", get(tts_voices))
        .route("/templates/tts/generate", post(generate_tts))
        .route("/templates/recommendations", post(recommend))
        .route("/templates/recommendations/{id}", get(read_recommendation))
        .route(
            "/templates/inputs",
            get(inputs)
                .post(upload_input)
                .layer(DefaultBodyLimit::disable()),
        )
        .route("/templates/inputs/import", post(import_input))
        .route("/templates/inputs/{id}", get(read_input))
        .route("/templates/inputs/{id}/transcribe", post(transcribe_input))
        .route("/templates/inputs/{id}/correct", post(correct_input))
        .route("/templates/inputs/{id}/prosody", post(analyze_prosody))
        .route("/templates/inputs/{id}/media/{variant}", get(input_media))
}

async fn inputs(State(app): State<Shared>) -> Result<Json<Value>, ApiError> {
    work(move||Ok(Json(json!({"inputs":app.db.list::<transcription::Input>("template_input")?,"jobs":app.db.list::<crate::domain::Job>("job")?.into_iter().filter(|j|j.kind=="template_transcribe").collect::<Vec<_>>()})))).await
}
async fn template_previews(State(app): State<Shared>) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::production::previews(&app.db)?))).await
}
async fn save_review(
    State(app): State<Shared>,
    Json(review): Json<super::reviews::Review>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::reviews::save(&app.db, review)?))).await
}
async fn productions(State(app): State<Shared>) -> Result<Json<Value>, ApiError> {
    work(move || {
        Ok(Json(
            json!({"batches":app.db.list::<Value>("template_production")?}),
        ))
    })
    .await
}
async fn prepare_production(
    State(app): State<Shared>,
    Json(input): Json<super::production_author::Prepare>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::production_author::prepare(&app, input)?))).await
}
async fn produce(
    State(app): State<Shared>,
    Json(input): Json<super::production::Request>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::production::enqueue(&app.db, input)?))).await
}
async fn production(
    State(app): State<Shared>,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::production::read(&app.db, &id)?))).await
}
async fn production_control(
    State(app): State<Shared>,
    Path(id): Path<String>,
    Json(input): Json<super::production::Control>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::production::control(&app.db, &id, input)?))).await
}
async fn production_execute(
    State(app): State<Shared>,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::production_runner::enqueue(&app.db, &id)?))).await
}
async fn production_item(
    State(app): State<Shared>,
    Path((id, index)): Path<(String, usize)>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::production::item(&app.db, &id, index)?))).await
}
async fn production_reading_diagnostic(
    State(app): State<Shared>,
    Path((id, index)): Path<(String, usize)>,
    Json(input): Json<super::reading_diagnostic::Request>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        Ok(Json(super::reading_diagnostic::diagnose(
            &app.db, &id, index, input,
        )?))
    })
    .await
}
async fn production_publish(
    State(app): State<Shared>,
    Path((id, index)): Path<(String, usize)>,
    Json(input): Json<super::production::Publish>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::production::publish(&app, &id, index, input)?))).await
}
async fn production_audit(
    State(app): State<Shared>,
    Path((id, index)): Path<(String, usize)>,
    Json(input): Json<super::production::Audit>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        Ok(Json(super::production::audit_published(
            &app, &id, index, input,
        )?))
    })
    .await
}
async fn production_render(
    State(app): State<Shared>,
    Path((id, index)): Path<(String, usize)>,
    Json(input): Json<super::production::RenderUpdate>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        Ok(Json(super::production::render_update(
            &app.db, &id, index, input,
        )?))
    })
    .await
}
async fn production_preview(
    State(app): State<Shared>,
    Path((id, index, fixture)): Path<(String, usize, usize)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let entry = super::production::item(&app.db, &id, index)?;
    let preview = entry["previews"]
        .as_array()
        .and_then(|p| p.iter().find(|p| p["fixture"] == fixture))
        .context("preview 不存在")?;
    let path = PathBuf::from(preview["path"].as_str().context("invalid preview path")?);
    if !path.starts_with(root(&app).join("production")) {
        return Err(anyhow::anyhow!("invalid production preview location").into());
    }
    crate::service::file_response(path, "video/mp4", headers).await
}
async fn production_captions(
    State(app): State<Shared>,
    Path((id, index, fixture)): Path<(String, usize, usize)>,
) -> Result<Response, ApiError> {
    let entry = super::production::item(&app.db, &id, index)?;
    let fixture = entry["output"]["fixtures"]
        .as_array()
        .and_then(|f| f.iter().find(|f| f["index"] == fixture))
        .context("fixture 不存在")?;
    let timestamp = |seconds: f64| {
        let ms = (seconds.max(0.) * 1000.).round() as u64;
        format!(
            "{:02}:{:02}:{:02}.{:03}",
            ms / 3600000,
            (ms / 60000) % 60,
            (ms / 1000) % 60,
            ms % 1000
        )
    };
    let mut text = String::from("WEBVTT\n\n");
    let offset = fixture["request"]["startTimeSeconds"]
        .as_f64()
        .unwrap_or(0.);
    if let Some(captions) = fixture["compilation"]["plan"]["captions"].as_array() {
        for c in captions {
            let content = c["text"]
                .as_str()
                .unwrap_or("")
                .replace('&', "&amp;")
                .replace('<', "&lt;")
                .replace('>', "&gt;")
                .replace(['\n', '\r'], " ");
            text.push_str(&format!(
                "{} --> {}\n{}\n\n",
                timestamp(c["start"].as_f64().unwrap_or(0.) + offset),
                timestamp(c["end"].as_f64().unwrap_or(0.) + offset),
                content
            ));
        }
    }
    Ok(Response::builder()
        .header("content-type", "text/vtt; charset=utf-8")
        .body(Body::from(text))
        .unwrap())
}
async fn recommend(
    State(app): State<Shared>,
    Json(input): Json<super::recommendation::Request>,
) -> Result<Json<crate::domain::Job>, ApiError> {
    work(move || Ok(Json(super::recommendation::enqueue(&app, input)?))).await
}
async fn read_recommendation(
    State(app): State<Shared>,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::recommendation::read(&app, &id)?))).await
}
async fn correct_input(
    State(app): State<Shared>,
    Path(id): Path<String>,
    Json(input): Json<transcription::Correct>,
) -> Result<Json<transcription::Transcript>, ApiError> {
    work(move || Ok(Json(transcription::correct(&app, &id, input)?))).await
}
async fn analyze_prosody(
    State(app): State<Shared>,
    Path(id): Path<String>,
    Json(input): Json<super::prosody::Request>,
) -> Result<Json<super::prosody::Analysis>, ApiError> {
    work(move || Ok(Json(super::prosody::analyze(&app, &id, input)?))).await
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ImportInput {
    path: PathBuf,
    name: Option<String>,
}
async fn import_input(
    State(app): State<Shared>,
    Json(input): Json<ImportInput>,
) -> Result<Json<transcription::Input>, ApiError> {
    work(move || {
        let name = input.name.unwrap_or_else(|| {
            input
                .path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned()
        });
        Ok(Json(transcription::import(&app, &input.path, &name)?))
    })
    .await
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UploadInput {
    filename: String,
}
async fn upload_input(
    State(app): State<Shared>,
    Query(query): Query<UploadInput>,
    body: Body,
) -> Result<Json<transcription::Input>, ApiError> {
    if query.filename.trim().is_empty() || query.filename.len() > 500 {
        return Err(anyhow::anyhow!("invalid filename").into());
    }
    let dir = root(&app).join("uploads");
    tokio::fs::create_dir_all(&dir).await?;
    let temp = dir.join(crate::domain::id());
    let result = async {
        let mut file = tokio::fs::File::create(&temp).await?;
        let mut stream = body.into_data_stream();
        let mut size = 0u64;
        while let Some(chunk) = stream.next().await {
            let bytes = chunk?;
            size += bytes.len() as u64;
            ensure!(size <= 2 * 1024 * 1024 * 1024, "输入文件不能超过 2 GB");
            file.write_all(&bytes).await?;
        }
        ensure!(size > 0, "输入文件为空");
        file.sync_all().await?;
        Ok::<(), anyhow::Error>(())
    }
    .await;
    if let Err(e) = result {
        let _ = tokio::fs::remove_file(&temp).await;
        return Err(e.into());
    }
    work(move || {
        let result = transcription::import(&app, &temp, &query.filename);
        let _ = fs::remove_file(temp);
        Ok(Json(result?))
    })
    .await
}
async fn read_input(
    State(app): State<Shared>,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        let input: transcription::Input = app.db.get("template_input", &id)?;
        let mut transcript = app.db.transaction(|db| {
            optional::<transcription::Transcript>(db, "template_transcript", &id)
        })?;
        if let Some(transcript) = &mut transcript {
            transcript.text = rhythm::text(&transcript.words);
        }
        let prosody = transcript
            .as_ref()
            .map(|t| super::prosody::current(&app, t))
            .transpose()?
            .flatten();
        let job = app
            .db
            .list::<crate::domain::Job>("job")?
            .into_iter()
            .find(|j| j.kind == "template_transcribe" && j.target_id == id);
        let syntheses = app.db.list::<super::tts::Record>("template_tts")?.into_iter()
            .filter(|record| record.input.id == id && record.input.sha256 == input.sha256).collect::<Vec<_>>();
        Ok(Json(
            json!({"input":input,"transcript":transcript,"job":job,"prosody":prosody,"syntheses":syntheses}),
        ))
    })
    .await
}
async fn transcribe_input(
    State(app): State<Shared>,
    Path(id): Path<String>,
) -> Result<Json<crate::domain::Job>, ApiError> {
    work(move || Ok(Json(transcription::enqueue(&app, &id)?))).await
}
async fn input_media(
    State(app): State<Shared>,
    Path((id, variant)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (file, mime) = work(move || transcription::file(&app, &id, &variant)).await?;
    crate::service::file_response(file, mime, headers).await
}
async fn work<T: Send + 'static>(
    f: impl FnOnce() -> Result<T> + Send + 'static,
) -> Result<T, ApiError> {
    Ok(tokio::task::spawn_blocking(f)
        .await
        .context("template task interrupted")??)
}
async fn visual_assets(State(app): State<Shared>) -> Result<Json<Value>, ApiError> {
    work(move || {
        Ok(Json(
            json!({"assets":app.db.list::<super::assets::Asset>("template_visual_asset")?}),
        ))
    })
    .await
}

async fn insert_visual_asset(
    State(app): State<Shared>,
    Json(input): Json<super::element_edit::InsertAsset>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        let asset = app
            .db
            .get::<super::assets::Asset>("template_visual_asset", &input.asset_id)?;
        super::assets::file(&app, &asset.id)?;
        let (template, element_id) = super::element_edit::insert_asset(input.template, &asset)?;
        Ok(Json(json!({"template":template,"elementId":element_id})))
    })
    .await
}
async fn stickers(State(app): State<Shared>) -> Result<Json<Value>, ApiError> {
    work(move || {
        Ok(Json(
            json!({"stickers":app.db.list::<super::stickers::Sticker>("template_sticker")?}),
        ))
    })
    .await
}
async fn dynamic_assets(State(app): State<Shared>) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::dynamic_asset_library::list(&app.db)?))).await
}
async fn archive_dynamic_asset(
    State(app): State<Shared>,
    Json(input): Json<super::dynamic_asset_library::Archive>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        Ok(Json(
            json!({"entry":super::dynamic_asset_library::archive(&app.db,input)?}),
        ))
    })
    .await
}
async fn reference_schema() -> Json<Value> {
    Json(
        json!({"submit":schemars::schema_for!(super::reference::Submit),"observations":schemars::schema_for!(super::reference::Observations)}),
    )
}
async fn submit_reference(
    State(app): State<Shared>,
    Json(input): Json<super::reference::Submit>,
) -> Result<Json<crate::domain::Job>, ApiError> {
    work(move || Ok(Json(super::reference::submit(&app, input)?))).await
}
async fn read_reference(
    State(app): State<Shared>,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::reference::read(&app, &id)?))).await
}
async fn reference_frame(
    State(app): State<Shared>,
    Path((id, index)): Path<(String, usize)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let file = work(move || super::reference::frame_file(&app, &id, index)).await?;
    crate::service::file_response(file, "image/png", headers).await
}
async fn list_style_reviews(State(app): State<Shared>) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::style_reviews::list(&app.db)?))).await
}
async fn save_style_review(
    State(app): State<Shared>,
    Json(input): Json<super::style_reviews::Submission>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::style_reviews::save(&app.db, input)?))).await
}
async fn list_style_review_series(State(app): State<Shared>) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::style_review_series::list(&app.db)?))).await
}
async fn save_style_review_series(
    State(app): State<Shared>,
    Json(input): Json<super::style_review_series::Submission>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::style_review_series::save(&app.db, input)?))).await
}
async fn list_application_history(
    State(app): State<Shared>,
    Query(query): Query<super::application_history::Query>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::application_history::list(&app.db, query)?))).await
}
async fn save_application_history(
    State(app): State<Shared>,
    Json(input): Json<super::application_history::Save>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::application_history::save(&app.db, input)?))).await
}
async fn read_application_history(
    State(app): State<Shared>,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::application_history::read(&app.db, &id)?))).await
}
async fn restore_application_history(
    State(app): State<Shared>,
    Path(id): Path<String>,
    Json(input): Json<super::application_history::Restore>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        Ok(Json(super::application_history::restore(
            &app.db, &id, input,
        )?))
    })
    .await
}
async fn dynamic_asset_schema() -> Json<Value> {
    Json(json!({
        "modelBoundaries":super::ontology::model_boundaries(),
        "definition":schemars::schema_for!(super::dynamic_asset::Definition),
        "ellipseArcCapabilities":super::ellipse_arc::capabilities(),
        "starGeometryCapabilities":super::star_geometry::capabilities(),
        "rectangleGeometryCapabilities":super::rectangle_geometry::capabilities(),
        "qualityReview":schemars::schema_for!(super::style_reviews::Submission),
        "qualityReviewSeries":schemars::schema_for!(super::style_review_series::Submission),
        "applicationHistorySave":schemars::schema_for!(super::application_history::Save),
        "applicationHistoryRestore":schemars::schema_for!(super::application_history::Restore),
        "applicationHistoryQuery":schemars::schema_for!(super::application_history::Query),
        "applicationHistoryCapabilities":{"endpoint":"/templates/dynamic-assets/application-history","immutable":true,"restoreRequiresCurrentBackup":true,"restoreChangesProject":false,"rejectsStaleRestore":true,"qualityApproval":false,"protectionContext":"exact_sample_application_and_extras","legacyProtection":"unbound_not_inferred_from_ui_state"},
        "qualityReviewCapabilities":{"endpoint":"/templates/dynamic-assets/reviews","scope":"saved_style_revision_and_exact_application","minimumPreviews":3,"internalThreshold":90,"listeningRecordedSeparately":true},
        "qualityReviewSeriesCapabilities":{"endpoint":"/templates/dynamic-assets/review-series","scope":"saved_style_revision_and_application_series","minimumPreviewsPerCase":1,"minimumDistinctPreviews":3,"sameCurrentStyleRevision":true,"uniqueProductionItems":true,"duplicatePreviewHashesRejected":true,"scoreAggregation":"minimum","listeningAggregation":"all","finalAestheticAggregation":"all","internalThreshold":90,"changesSingleApplicationReviews":false},
        "capture":schemars::schema_for!(super::dynamic_asset::Capture),
        "archive":schemars::schema_for!(super::dynamic_asset_library::Archive),
        "save":schemars::schema_for!(super::dynamic_asset::Save),
        "insert":schemars::schema_for!(super::dynamic_asset::Insert),
        "application":schemars::schema_for!(super::dynamic_asset::Application),
        "placementAdvice":schemars::schema_for!(super::placement_advice::Request),
        "placementAdviceCapabilities":super::placement_advice::capabilities(),
        "applicationPreview":schemars::schema_for!(super::dynamic_asset::ApplicationPreview),
        "samplePreview":schemars::schema_for!(super::production_author::SamplePreview),
        "preview":schemars::schema_for!(super::dynamic_asset::Preview),
        "detachPreview":schemars::schema_for!(super::dynamic_asset::DetachPreview),
        "create":schemars::schema_for!(super::dynamic_asset::Create),
        "duplicate":schemars::schema_for!(super::dynamic_asset::Duplicate),
        "editLayers":schemars::schema_for!(super::dynamic_asset_edit::Edit),
        "mediaEdit":schemars::schema_for!(super::dynamic_asset_edit::MediaEdit)
    }))
}
async fn edit_dynamic_asset_layers(
    Json(input): Json<super::dynamic_asset_edit::Edit>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::dynamic_asset_edit::edit(input)?))).await
}
async fn remap_timeline_copies(
    Json(input): Json<crate::timeline_copy::Request>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        Ok(Json(
            json!({"elements":crate::timeline_copy::remap(input)?}),
        ))
    })
    .await
}
async fn edit_dynamic_asset_media(
    State(app): State<Shared>,
    Json(input): Json<super::dynamic_asset_edit::MediaEdit>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        let asset = app
            .db
            .get::<super::assets::Asset>("template_visual_asset", &input.asset_id)?;
        let (path, _) = super::assets::file(&app, &asset.id)?;
        anyhow::ensure!(
            crate::storage::hash(&path)? == asset.sha256,
            "visual asset hash mismatch"
        );
        Ok(Json(super::dynamic_asset_edit::edit_media(input, &asset)?))
    })
    .await
}
async fn capture_dynamic_asset(
    Json(input): Json<super::dynamic_asset::Capture>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::dynamic_asset::capture(input)?.inspect()?))).await
}
async fn draft_dynamic_asset(Json(template): Json<Template>) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::dynamic_asset::draft(template)?.inspect()?))).await
}

async fn create_dynamic_asset(
    Json(input): Json<super::dynamic_asset::Create>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::dynamic_asset::create(input)?.inspect()?))).await
}
async fn duplicate_dynamic_asset(
    Json(input): Json<super::dynamic_asset::Duplicate>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::dynamic_asset::duplicate(input)?.inspect()?))).await
}
async fn read_dynamic_asset(
    State(app): State<Shared>,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        let asset: super::dynamic_asset::Definition =
            app.db.get(super::dynamic_asset::RECORD, &id)?;
        Ok(Json(asset.inspect()?))
    })
    .await
}
async fn inspect_dynamic_asset(
    Json(asset): Json<super::dynamic_asset::Definition>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(asset.inspect()?))).await
}

async fn preview_dynamic_asset(
    State(app): State<Shared>,
    Json(input): Json<super::dynamic_asset::Preview>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        let template = input.definition.project(&input.inputs)?;
        let regions = super::dynamic_asset::editing_regions(&input.definition, &template)?;
        let mut result = preview_application_assets(
            &app,
            super::dynamic_asset::ApplicationPreview {
                template,
                duration_seconds: input.duration_seconds,
                example: input.example,
            },
        )?;
        result["editingRegions"] = regions;
        Ok(Json(result))
    })
    .await
}
async fn preview_detached_dynamic_asset(
    State(app): State<Shared>,
    Json(input): Json<super::dynamic_asset::DetachPreview>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        let mut preview = input.preview;
        preview.definition = super::dynamic_asset_edit::detached_preview_definition(
            preview.definition,
            &input.layer_id,
        )?;
        let template = preview.definition.project(&preview.inputs)?;
        Ok(Json(preview_application_assets(
            &app,
            super::dynamic_asset::ApplicationPreview {
                template,
                duration_seconds: preview.duration_seconds,
                example: preview.example,
            },
        )?))
    })
    .await
}
async fn save_dynamic_asset(
    State(app): State<Shared>,
    Json(input): Json<super::dynamic_asset::Save>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        Ok(Json(
            json!({"definition":super::dynamic_asset::save(&app.db,input)?}),
        ))
    })
    .await
}
async fn insert_dynamic_asset(
    State(app): State<Shared>,
    Json(input): Json<super::dynamic_asset::Insert>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        let asset: super::dynamic_asset::Definition = app.db.get(
            "dynamic_asset_version",
            &format!("{}-r{}", input.asset_id, input.asset_revision),
        )?;
        Ok(Json(super::dynamic_asset::insert_configured(
            input, &asset,
        )?))
    })
    .await
}
async fn dynamic_asset_placement_advice(
    State(app): State<Shared>,
    Json(input): Json<super::placement_advice::Request>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        let asset: super::dynamic_asset::Definition = app.db.get(
            "dynamic_asset_version",
            &format!(
                "{}-r{}",
                input.application.asset_id, input.application.asset_revision
            ),
        )?;
        Ok(Json(super::placement_advice::advise(&asset, &input)?))
    })
    .await
}
async fn dynamic_asset_application(
    State(app): State<Shared>,
    Json(input): Json<super::dynamic_asset::Application>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        let asset: super::dynamic_asset::Definition = app.db.get("dynamic_asset_version", &format!("{}-r{}",input.asset_id,input.asset_revision))?;
        Ok(Json(json!({"template":super::dynamic_asset::application(&asset,&input)?,"assetId":asset.id,"assetRevision":asset.revision})))
    }).await
}
async fn preview_dynamic_asset_application(
    State(app): State<Shared>,
    Json(input): Json<super::dynamic_asset::ApplicationPreview>,
) -> Result<Json<Value>, ApiError> {
    work(move || preview_application_assets(&app, input).map(Json)).await
}
fn preview_application_assets(
    app: &App,
    input: super::dynamic_asset::ApplicationPreview,
) -> Result<Value> {
    let (media, sources) = super::assets::preview_media(app, input.template.clone())?;
    let mut result = super::dynamic_asset::preview_application_with_media(input, media)?;
    result["mediaSources"] = json!(sources);
    Ok(result)
}
async fn validate_template_samples(
    State(app): State<Shared>,
    Json(input): Json<super::production_author::SampleValidation>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        Ok(Json(super::production_author::validate_samples(
            &app, input,
        )?))
    })
    .await
}

async fn preview_dynamic_asset_sample(
    State(app): State<Shared>,
    Json(input): Json<super::production_author::SamplePreview>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::production_author::preview_sample(&app, input)?))).await
}
async fn save_sticker(
    State(app): State<Shared>,
    Json(input): Json<super::stickers::Recipe>,
) -> Result<Json<super::stickers::Sticker>, ApiError> {
    work(move || Ok(Json(super::stickers::save(&app, input)?))).await
}
async fn insert_sticker(
    State(app): State<Shared>,
    Json(input): Json<super::stickers::Insert>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        let sticker = app.db.get("template_sticker", &input.sticker_id)?;
        Ok(Json(json!({"template":super::stickers::insert(input.template, &sticker, &input.instance_id, input.region)?})))
    }).await
}
async fn remove_element(
    Json(input): Json<super::element_edit::Remove>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        Ok(Json(
            json!({"template":super::element_edit::remove(input.template, &input.element_id)?}),
        ))
    })
    .await
}

async fn duplicate_element(
    Json(input): Json<super::element_edit::Remove>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        let (template, element_id) =
            super::element_edit::duplicate(input.template, &input.element_id)?;
        Ok(Json(json!({"template": template, "elementId": element_id})))
    })
    .await
}

async fn create_template_draft(
    Json(input): Json<super::element_edit::Create>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        Ok(Json(
            json!({"template":super::element_edit::create(input)?}),
        ))
    })
    .await
}

async fn add_element(Json(input): Json<super::element_edit::Add>) -> Result<Json<Value>, ApiError> {
    work(move || {
        let (template, element_id) = super::element_edit::add(input)?;
        Ok(Json(json!({"template":template,"elementId":element_id})))
    })
    .await
}

async fn apply_element_entrance(
    Json(input): Json<super::element_edit::ApplyEntrance>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        Ok(Json(
            json!({"template":super::element_edit::apply_entrance(input)?}),
        ))
    })
    .await
}
async fn apply_element_envelope(
    Json(input): Json<super::element_edit::ApplyEnvelope>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        Ok(Json(
            json!({"template":super::element_edit::apply_envelope(input)?}),
        ))
    })
    .await
}
async fn import_visual_asset(
    State(app): State<Shared>,
    Json(input): Json<super::assets::Import>,
) -> Result<Json<super::assets::Asset>, ApiError> {
    work(move || Ok(Json(super::assets::import(&app, input)?))).await
}
async fn resolve_visual_assets(
    State(app): State<Shared>,
    Json(input): Json<super::assets::Resolve>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        let assets=super::assets::resolve_assets(input,&app.db.list::<super::assets::Asset>("template_visual_asset")?)?;
        for asset in &assets {let (path,_)=super::assets::file(&app,&asset.id)?;ensure!(crate::storage::hash(&path)?==asset.sha256,"shared asset blob corrupted");}
        Ok(Json(json!({"assets":assets.iter().map(|a|json!({"asset":a,"metadata":a.metadata(),"mediaPath":format!("/api/footage/templates/assets/{}/media",a.id)})).collect::<Vec<_>>()})))
    }).await
}
async fn visual_asset_media(
    State(app): State<Shared>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (path, mime) = work(move || super::assets::file(&app, &id)).await?;
    crate::service::file_response(path, mime, headers).await
}
async fn list(State(app): State<Shared>) -> Result<Json<Value>, ApiError> {
    work(move||{
        let mut templates=app.db.list::<Template>("template")?;
        let previews=super::production::previews(&app.db)?;
        let quality:serde_json::Map<String,Value>=templates.iter().map(|t|(t.id.clone(),super::reviews::summary(t,&previews))).collect();
        templates.sort_by_key(|t| quality[&t.id]["status"] != "qualified");
        let references=match fs::read(root(&app).join("references/audit.json")) {
            Ok(bytes)=>serde_json::from_slice::<Value>(&bytes)?,
            Err(e) if e.kind()==std::io::ErrorKind::NotFound=>json!({"references":[]}),
            Err(e)=>return Err(e.into()),
        };
        let sounds=app.db.list::<Value>("template_sound")?;
        let jobs=app.db.list::<crate::domain::Job>("job")?.into_iter().filter(|j|j.kind=="template_audio").collect::<Vec<_>>();
        let assessments=app.db.list::<super::audio_assessment::Assessment>("template_sound_assessment")?.into_iter().filter(|a|sounds.iter().any(|s|s["id"]==a.sound_id && s["audioSha256"]==a.audio_sha256)).collect::<Vec<_>>();
        let assessment_jobs=app.db.list::<crate::domain::Job>("job")?.into_iter().filter(|j|j.kind=="template_sound_assessment").collect::<Vec<_>>();
        Ok(Json(json!({"templates":templates,"quality":quality,"references":references["references"],"sounds":sounds,"audioJobs":jobs,"soundAssessments":assessments,"soundAssessmentJobs":assessment_jobs})))
    }).await
}
async fn schema() -> Json<Value> {
    let mut schema = json!({"capabilities":super::treatments::capabilities(),"productionInput":schemars::schema_for!(super::production::Request),"productionControl":schemars::schema_for!(super::production::Control),"productionPublish":schemars::schema_for!(super::production::Publish),"template":schemars::schema_for!(Template),"planInput":schemars::schema_for!(PlanInput),"planOutput":schemars::schema_for!(super::rhythm::EditPlan),"compileInput":schemars::schema_for!(compiler::CompileInput),"evaluationInput":schemars::schema_for!(super::execution::Evaluation),"preferenceFeedback":schemars::schema_for!(super::preferences::Feedback),"preferenceRetraction":schemars::schema_for!(super::preferences::Retract),"templateOntology":schemars::schema_for!(super::ontology::TemplateOntology),"planOntology":schemars::schema_for!(super::ontology::PlanOntology)});
    schema["modelBoundaries"] = super::ontology::model_boundaries();
    schema["visualAssetImport"] = json!(schemars::schema_for!(super::assets::Import));
    schema["stickerRecipe"] = json!(schemars::schema_for!(super::stickers::Recipe));
    schema["stickerInsert"] = json!(schemars::schema_for!(super::stickers::Insert));
    schema["elementRemove"] = json!(schemars::schema_for!(super::element_edit::Remove));
    schema["elementDuplicate"] = json!(schemars::schema_for!(super::element_edit::Remove));
    schema["templateCreate"] = json!(schemars::schema_for!(super::element_edit::Create));
    schema["elementAdd"] = json!(schemars::schema_for!(super::element_edit::Add));
    schema["elementEntrance"] = json!(schemars::schema_for!(super::element_edit::ApplyEntrance));
    schema["elementEnvelope"] = json!(schemars::schema_for!(super::element_edit::ApplyEnvelope));
    schema["visualAssetInsert"] = json!(schemars::schema_for!(super::element_edit::InsertAsset));
    schema["productionReadingDiagnostic"] =
        json!(schemars::schema_for!(super::reading_diagnostic::Request));
    schema["productionAudit"] = json!(schemars::schema_for!(super::production::Audit));
    schema["productionRenderUpdate"] =
        json!(schemars::schema_for!(super::production::RenderUpdate));
    schema["productionTextMeasurements"] = json!(schemars::schema_for!(
        super::production_text_measurements::TextMeasurements
    ));
    schema["sampleValidationInput"] = json!(schemars::schema_for!(
        super::production_author::SampleValidation
    ));
    schema["productionAuthoringInput"] =
        json!(schemars::schema_for!(super::production_author::Request));
    schema["qualityReview"] = json!(schemars::schema_for!(super::reviews::Review));
    schema["capabilities"]["qualityReview"] = json!({"submit":"/templates/reviews","read":"/templates/previews","scope":"template_revision_batch_item_and_preview_hashes","minimumPreviews":3,"internalThreshold":90,"listeningRecordedSeparately":true,"aestheticQualityVerified":"explicit reviewer assertion; requires listened=true, score>=90 and no blocking findings"});
    schema["capabilities"]["production"] = json!({"automaticRendering":true,"execute":"/templates/production/{id}/execute","renderStatus":"renderJob","concurrency":1,"publication":"all_fixture_previews_verified","aestheticQualityVerified":"set only by a current review with explicit final verification"});
    schema["capabilities"]["production"]["textMeasurements"] = json!({
        "submit":"/templates/production/{id}/items/{index}/render",
        "read":"/templates/production/{id}/items/{index}",
        "publish":"/templates/production/{id}/items/{index}/publish",
        "field":"textMeasurements",
        "optional":true,
        "allowedRenderStatus":"completed",
        "renderPath":"renders[fixture].textMeasurements",
        "publishedPath":"previews[].textMeasurements",
        "fixtureContract":{"field":"textMeasurementContractVersion","version":1},
        "geometryContract":{"fixtureField":"textMeasurementGeometryCoverage","measurementField":"geometryCoverage","value":"constant_record_pose_v1","legacyDiagnostic":"partial","droppedRecordsDiagnostic":"partial"},
        "legacy":{"status":"not_measured","retrofit":false,"acceptsAttachments":false},
        "timebase":120000,
        "producer":"production-scene-exporter",
        "producerAuthenticated":false,
        "measurementIndependentlyVerified":false,
        "fontIdentityVerified":false,
        "publicationBinding":"outputSha256 must match the actual preview file SHA-256",
        "affectsQualityScore":false,
        "limitations":[
            "constant_record_pose_v1 records require unchanged layout, textBox, leaf transform and every ancestor pose throughout each consecutive frame interval",
            "Legacy records without geometryCoverage retain only the first pose and cannot certify interval geometry or grant reading timing exemption",
            "Empty sampled records do not certify expected text coverage",
            "Nonzero droppedRecords means incomplete evidence"
        ]
    });
    schema["capabilities"]["visualAssets"]["projectMaterialization"] =
        json!("web_transport_or_mcp_apply");
    schema["visualAssetResolve"] = json!(schemars::schema_for!(super::assets::Resolve));
    Json(schema)
}
async fn read(
    State(app): State<Shared>,
    Path(id): Path<String>,
) -> Result<Json<Template>, ApiError> {
    work(move || Ok(Json(app.db.get("template", &id)?))).await
}
async fn read_ontology(
    State(app): State<Shared>,
    Path(id): Path<String>,
) -> Result<Json<super::ontology::TemplateOntology>, ApiError> {
    work(move || {
        Ok(Json(super::ontology::template(
            &app.db.get("template", &id)?,
        )?))
    })
    .await
}
async fn project_ontology(
    Json(template): Json<Template>,
) -> Result<Json<super::ontology::TemplateOntology>, ApiError> {
    Ok(Json(super::ontology::template(&template)?))
}
async fn plan_ontology(
    State(app): State<Shared>,
    Json(input): Json<PlanInput>,
) -> Result<Json<super::ontology::PlanOntology>, ApiError> {
    work(move || {
        audio::validate_resources(&app, &input.resolved_template()?)?;
        Ok(Json(super::ontology::plan(&rhythm::plan(input)?)?))
    })
    .await
}
async fn validate(Json(template): Json<Template>) -> Result<Json<Value>, ApiError> {
    template.validate()?;
    Ok(Json(json!({"valid":true,"template":template})))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Save {
    pub template: Template,
    pub base_revision: u64,
    pub idempotency_key: String,
}
pub fn save_template(app: &App, input: Save) -> Result<Value> {
    save_template_with_legacy_hash(app, input, None)
}
fn normalized_receipt(mut value: Value) -> Result<Value> {
    if value["template"]["schemaVersion"] == "moirai.template.v1" {
        let template: Template = serde_json::from_value(value["template"].clone())?;
        value["template"] = serde_json::to_value(template)?;
    }
    Ok(value)
}
fn save_template_with_legacy_hash(
    app: &App,
    input: Save,
    legacy_hash: Option<String>,
) -> Result<Value> {
    input.template.validate()?;
    ensure!(valid_id(&input.idempotency_key), "invalid idempotency key");
    let hash = format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(
            &json!({"baseRevision":input.base_revision,"template":input.template})
        )?)
    );
    // An acknowledged save remains replayable if a referenced asset is later rejected.
    if let Some(receipt) = app
        .db
        .transaction(|db| optional::<Value>(db, "template_receipt", &input.idempotency_key))?
    {
        ensure!(
            receipt["hash"] == hash || legacy_hash.as_ref().is_some_and(|h| receipt["hash"] == *h),
            "idempotency key reused with different payload"
        );
        return normalized_receipt(receipt["result"].clone());
    }
    audio::validate_resources(app, &input.template)?;
    app.db.transaction(|db| {
        if let Some(receipt) = optional::<Value>(db, "template_receipt", &input.idempotency_key)? {
            ensure!(
                receipt["hash"] == hash
                    || legacy_hash.as_ref().is_some_and(|h| receipt["hash"] == *h),
                "idempotency key reused with different payload"
            );
            return normalized_receipt(receipt["result"].clone());
        }
        let existing = optional::<Template>(db, "template", &input.template.id)?;
        ensure!(
            existing.as_ref().map(|t| t.revision).unwrap_or(0) == input.base_revision,
            "revision_conflict"
        );
        let mut template = input.template;
        template.revision = input
            .base_revision
            .checked_add(1)
            .context("revision overflow")?;
        store::put(db, "template", &template.id, &template)?;
        store::put(
            db,
            "template_version",
            &format!("{}-r{}", template.id, template.revision),
            &template,
        )?;
        let result = json!({"template":template,"saved":true});
        store::put(
            db,
            "template_receipt",
            &input.idempotency_key,
            &json!({"hash":hash,"result":result}),
        )?;
        Ok(result)
    })
}
fn save_request(app: &App, raw: Value) -> Result<Value> {
    let legacy_hash = if raw["template"]["schemaVersion"] == "moirai.template.v1" {
        let template: super::legacy_model::Template =
            serde_json::from_value(raw["template"].clone())?;
        Some(format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(
                &json!({"baseRevision":raw["baseRevision"],"template":template})
            )?)
        ))
    } else {
        None
    };
    save_template_with_legacy_hash(app, serde_json::from_value(raw)?, legacy_hash)
}
async fn save(
    State(app): State<Shared>,
    Json(input): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(save_request(&app, input)?))).await
}
async fn plan(
    State(app): State<Shared>,
    Json(input): Json<PlanInput>,
) -> Result<Json<rhythm::EditPlan>, ApiError> {
    work(move || {
        audio::validate_resources(&app, &input.resolved_template()?)?;
        Ok(Json(rhythm::plan(input)?))
    })
    .await
}
async fn edit_content(
    Json(input): Json<super::content_edit::Request>,
) -> Result<Json<super::content_edit::Edited>, ApiError> {
    work(move || Ok(Json(super::content_edit::edit(input)?))).await
}
async fn edit_captions(
    Json(input): Json<super::content_edit::CaptionRequest>,
) -> Result<Json<super::content_edit::EditedCaptions>, ApiError> {
    work(move || Ok(Json(super::content_edit::edit_captions(input)?))).await
}
async fn compile(
    State(app): State<Shared>,
    Json(input): Json<compiler::CompileInput>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(execute(&app, input)?))).await
}
fn execute(app: &App, input: compiler::CompileInput) -> Result<Value> {
    let sounds = audio::resolve_resources(app, &input.input.resolved_template()?)?;
    compiler::compile_with_audio(input, &sounds)
}
async fn preflight(
    State(app): State<Shared>,
    Json(input): Json<compiler::CompileInput>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        Ok(Json(super::execution::preflight(input, |r| {
            execute(&app, r)
        })))
    })
    .await
}
async fn evaluate(
    State(app): State<Shared>,
    Json(mut input): Json<super::execution::Evaluation>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        let profile = super::preferences::profile(&app.db, &input.profile_id)?;
        super::preferences::apply(&mut input, &profile);
        let mut result = super::execution::evaluate(input.clone(), |r| execute(&app, r))?;
        result["calibration"] = profile.clone();
        if profile["active"] == true {
            result["scoreModel"] = json!("preference-v1");
        }
        super::preferences::remember(&app.db, &input, &mut result)?;
        Ok(Json(result))
    })
    .await
}
async fn repair(
    State(app): State<Shared>,
    Json(input): Json<super::execution::Evaluation>,
) -> Result<Json<Value>, ApiError> {
    work(move || {
        let mut result = super::execution::evaluate(input, |r| execute(&app, r))?;
        let selected = result["candidates"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|c| c["executable"] == true)
            .min_by(|a, b| {
                a["repairCost"]["total"]
                    .as_f64()
                    .unwrap()
                    .total_cmp(&b["repairCost"]["total"].as_f64().unwrap())
                    .then_with(|| {
                        b["score"]
                            .as_f64()
                            .unwrap()
                            .total_cmp(&a["score"].as_f64().unwrap())
                    })
                    .then_with(|| a["id"].as_u64().cmp(&b["id"].as_u64()))
            })
            .cloned();
        if let Some(candidate) = selected {
            result["selectedId"] = candidate["id"].clone();
            result["selectedRequest"] = candidate["request"].clone();
            result["compilation"] =
                execute(&app, serde_json::from_value(candidate["request"].clone())?)?;
            result["repaired"] = json!(true);
        } else {
            result["repaired"] = json!(false);
        }
        Ok(Json(result))
    })
    .await
}
async fn preference_profile(
    State(app): State<Shared>,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::preferences::profile(&app.db, &id)?))).await
}
async fn preference_feedback(
    State(app): State<Shared>,
    Json(input): Json<super::preferences::Feedback>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::preferences::feedback(&app.db, input)?))).await
}
async fn preference_retract(
    State(app): State<Shared>,
    Json(input): Json<super::preferences::Retract>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::preferences::retract(&app.db, input)?))).await
}
async fn separate(
    State(app): State<Shared>,
    Path(id): Path<String>,
) -> Result<Json<crate::domain::Job>, ApiError> {
    work(move || Ok(Json(audio::enqueue(&app, &id)?))).await
}
async fn review_sound(
    State(app): State<Shared>,
    Path(id): Path<String>,
    Json(input): Json<audio::Review>,
) -> Result<Json<audio::Sound>, ApiError> {
    work(move || Ok(Json(audio::review(&app, &id, input)?))).await
}
#[derive(Deserialize)]
struct SoundQuery {
    sha256: Option<String>,
}
async fn clip_sound(
    State(app): State<Shared>,
    Json(input): Json<audio::ClipInput>,
) -> Result<Json<audio::Sound>, ApiError> {
    work(move || Ok(Json(audio::clip_input(&app, input)?))).await
}
async fn analyze_sounds(State(app): State<Shared>) -> Result<Json<crate::domain::Job>, ApiError> {
    work(move || Ok(Json(super::audio_assessment::enqueue(&app)?))).await
}
async fn tts_voices(State(app): State<Shared>) -> Result<Json<super::tts::Voices>, ApiError> {
    work(move || Ok(Json(super::tts::voices(&app)?))).await
}
async fn generate_tts(
    State(app): State<Shared>,
    Json(request): Json<super::tts::Request>,
) -> Result<Json<super::tts::Generated>, ApiError> {
    work(move || Ok(Json(super::tts::generate(&app, request)?))).await
}
async fn search_sounds(
    State(app): State<Shared>,
    Json(input): Json<super::sound_search::Request>,
) -> Result<Json<Value>, ApiError> {
    work(move || Ok(Json(super::sound_search::search(&app, input)?))).await
}
async fn sound_media(
    State(app): State<Shared>,
    Path(id): Path<String>,
    Query(query): Query<SoundQuery>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let file = work(move || audio::checked_sound_file(&app, &id, query.sha256.as_deref())).await?;
    crate::service::file_response(file, "audio/wav", headers).await
}
async fn media(
    State(app): State<Shared>,
    Path((id, variant)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (file, mime) = work(move || {
        ensure!(valid_id(&id), "invalid reference ID");
        let (filename, mime) = match variant.as_str() {
            "video" => ("reference.mp4", "video/mp4"),
            "sequence" => ("sequence.jpg", "image/jpeg"),
            "mix" => ("mix.wav", "audio/wav"),
            _ => anyhow::bail!("媒体不存在"),
        };
        let reference_root = root(&app).join("references").canonicalize()?;
        let file = reference_root
            .join(id)
            .join(filename)
            .canonicalize()
            .context("媒体不存在")?;
        ensure!(file.starts_with(reference_root), "invalid media path");
        Ok((file, mime))
    })
    .await?;
    crate::service::file_response(file, mime, headers).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn rectangle_geometry_schema_matches_template_and_dynamic_edit_contracts() {
        let Json(template_schema) = schema().await;
        let Json(asset_schema) = dynamic_asset_schema().await;
        let capability = &asset_schema["rectangleGeometryCapabilities"];
        assert_eq!(
            capability,
            &template_schema["capabilities"]["rectangleGeometry"]
        );
        assert_eq!(
            capability["nativeParams"],
            json!(["cornerRadius", "rectangleAspectRatio"])
        );
        assert_eq!(capability["cornerRadius"]["maximum"], 50);
        assert_eq!(
            capability["legacyAbsent"],
            "unchanged_no_native_geometry_params"
        );
        assert!(
            asset_schema["editLayers"]
                .to_string()
                .contains("rectangle_geometry")
        );
        assert!(
            template_schema["planOutput"]
                .to_string()
                .contains("rectangleGeometry")
        );
    }
    #[tokio::test]
    async fn ellipse_arc_schema_exposes_same_execution_limits_for_templates_and_assets() {
        let Json(template_schema) = schema().await;
        let Json(asset_schema) = dynamic_asset_schema().await;
        let capability = &asset_schema["ellipseArcCapabilities"];
        assert_eq!(capability, &template_schema["capabilities"]["ellipseArc"]);
        assert_eq!(capability["nativeAnimationPath"], "params.strokeReveal");
        assert_eq!(capability["treatmentTargets"], json!(["element"]));
        assert_eq!(capability["defaultCap"], "butt");
        assert!(
            asset_schema["editLayers"]
                .to_string()
                .contains("ellipse_arc")
        );
        assert!(asset_schema["editLayers"].to_string().contains("outline"));
    }
    #[tokio::test]
    async fn production_schema_exposes_optional_measurement_contract_and_limits() {
        use tower::ServiceExt;
        let dir = tempfile::tempdir().unwrap();
        let response = router()
            .with_state(Arc::new(app(dir.path())))
            .oneshot(
                axum::http::Request::builder()
                    .uri("/templates/schema")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), 4_000_000)
            .await
            .unwrap();
        let schema: Value = serde_json::from_slice(&body).unwrap();
        let update = &schema["productionRenderUpdate"];
        assert!(update["properties"]["textMeasurements"].is_object());
        assert_eq!(update["additionalProperties"], false);
        assert!(
            !update["required"]
                .as_array()
                .unwrap()
                .contains(&json!("textMeasurements"))
        );
        let measurements = &schema["productionTextMeasurements"];
        assert_eq!(measurements["additionalProperties"], false);
        assert!(measurements["properties"]["outputSha256"].is_object());
        assert!(measurements["$defs"]["Source"]["properties"]["groupPath"].is_object());
        assert!(measurements["$defs"]["Layout"]["properties"]["fontIdentityVerified"].is_object());
        assert!(schema["productionPublish"].is_object());
        let capability = &schema["capabilities"]["production"]["textMeasurements"];
        assert_eq!(
            capability["submit"],
            "/templates/production/{id}/items/{index}/render"
        );
        assert_eq!(
            capability["read"],
            "/templates/production/{id}/items/{index}"
        );
        assert_eq!(
            capability["publish"],
            "/templates/production/{id}/items/{index}/publish"
        );
        assert_eq!(capability["allowedRenderStatus"], "completed");
        assert_eq!(capability["optional"], true);
        assert_eq!(
            capability["fixtureContract"],
            json!({"field":"textMeasurementContractVersion","version":1})
        );
        assert_eq!(
            capability["legacy"],
            json!({"status":"not_measured","retrofit":false,"acceptsAttachments":false})
        );
        assert_eq!(capability["producer"], "production-scene-exporter");
        assert_eq!(capability["producerAuthenticated"], false);
        assert_eq!(capability["measurementIndependentlyVerified"], false);
        assert_eq!(capability["fontIdentityVerified"], false);
        assert_eq!(capability["affectsQualityScore"], false);
    }
    #[tokio::test]
    async fn series_review_route_and_schema_remain_independent() {
        use tower::ServiceExt;
        let dir = tempfile::tempdir().unwrap();
        let router = router().with_state(Arc::new(app(dir.path())));
        let response = router
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .uri("/templates/dynamic-assets/review-series")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), 1_000_000)
            .await
            .unwrap();
        assert_eq!(
            serde_json::from_slice::<Value>(&body).unwrap(),
            json!({"reviews":[]})
        );
        let response = router.oneshot(axum::http::Request::builder()
            .method("POST").uri("/templates/dynamic-assets/review-series")
            .header("content-type", "application/json")
            .body(Body::from(json!({"cases":[],"rationale":"test","coverage":"none","limitations":"test"}).to_string())).unwrap()).await.unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::BAD_REQUEST);
        let Json(schema) = dynamic_asset_schema().await;
        assert_eq!(schema["qualityReviewCapabilities"]["minimumPreviews"], 3);
        assert_eq!(
            schema["qualityReviewSeriesCapabilities"]["minimumPreviewsPerCase"],
            1
        );
        assert_eq!(
            schema["qualityReviewSeriesCapabilities"]["minimumDistinctPreviews"],
            3
        );
        assert!(schema["qualityReviewSeries"]["properties"]["cases"].is_object());
    }
    fn app(root: &std::path::Path) -> App {
        App {
            db: store::Store::open(&root.join("test.sqlite3")).unwrap(),
            config: crate::service::Config {
                data_dir: root.into(),
                nas_root: PathBuf::new(),
                require_smb: false,
                ffmpeg: "ffmpeg".into(),
                ffprobe: "ffprobe".into(),
                port: 0,
            },
            media: crate::media::Media {
                root: root.into(),
                ffmpeg: "ffmpeg".into(),
                ffprobe: "ffprobe".into(),
            },
            home: root.into(),
            token: "test".into(),
        }
    }
    #[test]
    fn migration_persists_v2_keeps_v1_source_and_replays_existing_save_receipts() {
        let dir = tempfile::tempdir().unwrap();
        let state = app(dir.path());
        let old = seed::from_observation(seed::observations().remove(0)).unwrap();
        let raw = serde_json::to_value(&old).unwrap();
        state.db.put("template", &old.id, &raw).unwrap();
        let hash = format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(&json!({"baseRevision":0,"template":old})).unwrap())
        );
        state
            .db
            .put(
                "template_receipt",
                "old-save",
                &json!({"hash":hash,"result":{"template":raw,"saved":true}}),
            )
            .unwrap();
        bootstrap(&state).unwrap();
        let stored: Value = state.db.get("template", &old.id).unwrap();
        assert_eq!(stored["schemaVersion"], "moirai.template.v2");
        assert_eq!(stored["revision"], old.revision);
        let backup: Value = state
            .db
            .get(
                "template_schema_source",
                &format!("{}-r{}-v1", old.id, old.revision),
            )
            .unwrap();
        assert_eq!(backup, raw);
        bootstrap(&state).unwrap();
        assert_eq!(state.db.get::<Value>("template", &old.id).unwrap(), stored);
        let request = json!({"template":raw,"baseRevision":0,"idempotencyKey":"old-save"});
        let replay = save_request(&state, request.clone()).unwrap();
        assert_eq!(replay["template"], stored);
        let mut changed = request;
        changed["template"]["name"] = json!("different");
        assert!(save_request(&state, changed).is_err());
    }
    #[test]
    fn save_is_cas_and_durably_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let state = app(dir.path());
        let mut template = seed::templates().unwrap().remove(0);
        template.id = "test-template".into();
        template.revision = 0;
        let save = |t: Template, base, key: &str| Save {
            template: t,
            base_revision: base,
            idempotency_key: key.into(),
        };
        let first = save_template(&state, save(template.clone(), 0, "one")).unwrap();
        assert_eq!(first["template"]["revision"], 1);
        assert_eq!(
            save_template(&state, save(template.clone(), 0, "one")).unwrap(),
            first
        );
        assert!(
            save_template(&state, save(template.clone(), 0, "two"))
                .unwrap_err()
                .to_string()
                .contains("revision_conflict")
        );
        template.name = "revised".into();
        assert!(save_template(&state, save(template.clone(), 0, "one")).is_err());
        let second = save_template(&state, save(template.clone(), 1, "two")).unwrap();
        assert_eq!(second["template"]["revision"], 2);
        assert_ne!(
            state
                .db
                .get::<Template>("template_version", "test-template-r1")
                .unwrap()
                .name,
            template.name
        );
        drop(state);
        let state = app(dir.path());
        assert_eq!(
            save_template(&state, save(template, 1, "two")).unwrap(),
            second
        );
    }
    #[test]
    fn corrupt_record_is_not_overwritten_as_a_new_template() {
        let dir = tempfile::tempdir().unwrap();
        let state = app(dir.path());
        let template = seed::templates().unwrap().remove(0);
        state
            .db
            .put("template", &template.id, &json!({"corrupt":true}))
            .unwrap();
        assert!(
            save_template(
                &state,
                Save {
                    template,
                    base_revision: 0,
                    idempotency_key: "new".into()
                }
            )
            .is_err()
        );
    }
    #[test]
    fn transcript_correction_preserves_timing_raw_evidence_and_versions() {
        let dir = tempfile::tempdir().unwrap();
        let state = app(dir.path());
        let original:transcription::Transcript=serde_json::from_value(json!({
            "inputId":"input-test","sourceSha256":"test-hash","engine":"test","language":"zh","languageProbability":1,
            "rawWords":[{"text":"每","start":0.1,"end":0.3,"probability":0.9},{"text":"夜","start":0.3,"end":0.5,"probability":0.4}],
            "words":[{"text":"每","start":0.1,"end":0.3},{"text":"夜","start":0.3,"end":0.5}],"segments":[],"warnings":[],"createdAt":0
        })).unwrap();
        state
            .db
            .put("template_transcript", "input-test", &original)
            .unwrap();
        let corrected = transcription::correct(
            &state,
            "input-test",
            transcription::Correct {
                base_revision: 1,
                edits: vec![
                    transcription::EditWord {
                        index: 0,
                        text: "美".into(),
                        reason: "reference caption".into(),
                    },
                    transcription::EditWord {
                        index: 1,
                        text: "业".into(),
                        reason: "reference caption".into(),
                    },
                ],
            },
        )
        .unwrap();
        assert_eq!(corrected.revision, 2);
        assert_eq!(corrected.corrections.len(), 2);
        assert_eq!(corrected.raw_words[1].text, "夜");
        assert_eq!(
            corrected
                .words
                .iter()
                .map(|w| (w.start, w.end))
                .collect::<Vec<_>>(),
            original
                .words
                .iter()
                .map(|w| (w.start, w.end))
                .collect::<Vec<_>>()
        );
        assert_eq!(
            state
                .db
                .get::<transcription::Transcript>("template_transcript_version", "input-test-r1")
                .unwrap()
                .words[0]
                .text,
            "每"
        );
        assert!(
            transcription::correct(
                &state,
                "input-test",
                transcription::Correct {
                    base_revision: 1,
                    edits: vec![transcription::EditWord {
                        index: 0,
                        text: "美".into(),
                        reason: "stale".into()
                    }]
                }
            )
            .is_err()
        );
        assert!(
            transcription::correct(
                &state,
                "input-test",
                transcription::Correct {
                    base_revision: 2,
                    edits: vec![transcription::EditWord {
                        index: 999,
                        text: "x".into(),
                        reason: "invalid".into()
                    }]
                }
            )
            .is_err()
        );
        assert_eq!(
            state
                .db
                .get::<transcription::Transcript>("template_transcript", "input-test")
                .unwrap()
                .revision,
            2
        );
    }
}
