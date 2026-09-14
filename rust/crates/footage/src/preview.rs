use crate::{
    domain::*,
    media::frame_geometry,
    service::{ApiError, App},
};
use anyhow::{Result, ensure};
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, State},
    routing::post,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::sync::Arc;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PlanInput {
    start_ticks: i64,
    end_ticks: i64,
    recipe: Recipe,
    #[serde(default)]
    auto_brightness: f64,
    #[serde(default)]
    base_lut: Option<crate::adaptive_lut::AdaptiveLut>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RangeInput {
    start_ticks: i64,
    end_ticks: i64,
}

pub fn router() -> Router<Arc<App>> {
    Router::new()
        .route(
            "/shots/{id}/preview-plan",
            post(plan).layer(DefaultBodyLimit::max(4 * 1024 * 1024)),
        )
        .route("/shots/{id}/preview-exposure", post(exposure))
        .route("/shots/{id}/preview-lut", post(lut))
}

fn source_for(app: &App, id: &str) -> Result<Source> {
    let shot = app.db.get::<Shot>("shot", id)?;
    ensure!(!shot.direct_upload, "直接上传分镜不进行画面加工");
    app.db.get("source", &shot.source_id)
}

async fn plan(
    State(app): State<Arc<App>>,
    Path(id): Path<String>,
    Json(input): Json<PlanInput>,
) -> Result<Json<Value>, ApiError> {
    let source = source_for(&app, &id)?;
    validate_range(input.start_ticks, input.end_ticks, source.duration_ticks)?;
    input.recipe.validate()?;
    if !input.auto_brightness.is_finite() || input.auto_brightness.abs() > 0.025 {
        return Err(anyhow::anyhow!("自动曝光参数无效").into());
    }
    let geometry = frame_geometry(&input.recipe, &source)?;
    let (brightness, contrast, saturation) = match input.recipe.color_mode.as_str() {
        "preserve" | "adaptive" => (0.0, 1.0, 1.0),
        "auto" => (input.auto_brightness, 1.0, 1.0),
        _ => (
            input.recipe.brightness,
            input.recipe.contrast,
            input.recipe.saturation,
        ),
    };
    let lut = if let Some(base) = input.base_lut {
        if base.size != 33
            || base.values.len() != 33 * 33 * 33 * 3
            || !base.values.iter().all(|v| v.is_finite())
        {
            return Err(anyhow::anyhow!("调色数据无效").into());
        }
        Some(crate::manual_color::apply_to(base, &input.recipe))
    } else if crate::manual_color::enabled(&input.recipe) {
        Some(crate::manual_color::lut(&input.recipe))
    } else {
        None
    };
    Ok(Json(
        json!({"rotation":input.recipe.rotation,"geometry":geometry,
        "flipHorizontal":input.recipe.flip_horizontal,"flipVertical":input.recipe.flip_vertical,
        "zoom":{"startScale":1.0,"endScale":input.recipe.push_in_end_scale(),
            "durationSeconds":(input.end_ticks-input.start_ticks) as f64 / TICKS as f64},
        "brightness":brightness,"contrast":contrast,"saturation":saturation,
        "lut":lut}),
    ))
}

async fn exposure(
    State(app): State<Arc<App>>,
    Path(id): Path<String>,
    Json(input): Json<RangeInput>,
) -> Result<Json<Value>, ApiError> {
    Ok(Json(
        tokio::task::spawn_blocking(move || -> Result<Value> {
            let source = source_for(&app, &id)?;
            validate_range(input.start_ticks, input.end_ticks, source.duration_ticks)?;
            let brightness = app
                .media
                .exposure(&source, input.start_ticks, input.end_ticks)?;
            Ok(json!({"brightness":brightness}))
        })
        .await??,
    ))
}

async fn lut(
    State(app): State<Arc<App>>,
    Path(id): Path<String>,
    Json(input): Json<RangeInput>,
) -> Result<Json<crate::adaptive_lut::AdaptiveLut>, ApiError> {
    Ok(Json(
        tokio::task::spawn_blocking(move || -> Result<_> {
            let source = source_for(&app, &id)?;
            app.media
                .adaptive_lut(&source, input.start_ticks, input.end_ticks)
        })
        .await??,
    ))
}
