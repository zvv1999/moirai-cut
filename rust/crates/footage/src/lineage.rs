use crate::{
    domain::{Shot, Source, TICKS},
    service::App,
    storage,
};
use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};
use std::{fs, path::PathBuf};

pub fn releases(app: &App) -> Result<Vec<Value>> {
    let dir = app.config.data_dir.join("publications");
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut result = vec![];
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let value: Value = serde_json::from_slice(&fs::read(path)?)?;
        let id = value["publicationId"].as_str().context("发布记录无 ID")?;
        // A manifest is prepared before NAS commit; only completed jobs are visible.
        let job = app.db.get::<crate::domain::Job>("job", id)?;
        if job.status != "succeeded" {
            continue;
        }
        let current = app
            .db
            .get::<Shot>("shot", value["shot"]["id"].as_str().context("分镜无 ID")?)?;
        result.push(json!({"id":id,"shot":value["shot"],"source":value["source"],"current":current.status=="published" && current.revision==value["shot"]["revision"].as_u64().unwrap_or(0)}));
    }
    Ok(result)
}

pub fn release(app: &App, id: &str) -> Result<Value> {
    releases(app)?
        .into_iter()
        .find(|v| v["id"] == id)
        .context("发布版本不存在")
}

pub fn release_path(app: &App, id: &str) -> Result<PathBuf> {
    let value = release(app, id)?;
    let relative = value["shot"]["publishedPath"]
        .as_str()
        .context("发布路径不存在")?;
    let local = app.config.data_dir.join("releases").join(relative);
    if local.is_file() {
        let path = local.canonicalize()?;
        ensure!(
            path.starts_with(app.config.data_dir.join("releases").canonicalize()?),
            "发布路径越界"
        );
        return Ok(path);
    }
    let root = app.config.nas_root.canonicalize()?;
    let path = root.join(relative).canonicalize()?;
    ensure!(path.starts_with(root), "发布路径越界");
    Ok(path)
}

pub fn cache_legacy_releases(app: &App) -> Result<()> {
    for release in releases(app)? {
        let relative = release["shot"]["publishedPath"]
            .as_str()
            .context("发布路径缺失")?;
        if app
            .config
            .data_dir
            .join("releases")
            .join(relative)
            .is_file()
        {
            continue;
        }
        let shot = app
            .db
            .get::<Shot>("shot", release["shot"]["id"].as_str().context("分镜缺失")?)?;
        if let Some(output) = shot
            .output_path
            .filter(|p| std::path::Path::new(p).is_file())
        {
            let sha = release["shot"]["outputSha256"]
                .as_str()
                .context("版本哈希缺失")?;
            if storage::hash(std::path::Path::new(&output))? != sha {
                continue;
            }
            let root = app.config.data_dir.join("releases");
            fs::create_dir_all(&root)?;
            let relative = release["shot"]["publishedPath"]
                .as_str()
                .context("发布路径缺失")?;
            storage::publish_file(
                &root,
                std::path::Path::new(relative),
                std::path::Path::new(&output),
                sha,
                false,
            )?;
            let poster = std::path::Path::new(&output)
                .parent()
                .unwrap()
                .join("poster.jpg");
            if poster.is_file() {
                storage::publish_file(
                    &root,
                    &std::path::Path::new(relative)
                        .parent()
                        .unwrap()
                        .join("poster.jpg"),
                    &poster,
                    &storage::hash(&poster)?,
                    false,
                )?;
            }
        }
    }
    Ok(())
}

pub fn editor_asset(app: &App, id: &str) -> Result<Value> {
    let value = release(app, id)?;
    ensure!(
        value["current"] == true,
        "该版本已下架，请选择当前已入库版本"
    );
    let path = release_path(app, id)?;
    let sha = storage::hash(&path)?;
    ensure!(value["shot"]["outputSha256"] == sha, "发布视频校验失败");
    let probe = app.media.probe(&path)?;
    let streams = probe["streams"].as_array().context("视频流不存在")?;
    let video = streams
        .iter()
        .find(|s| s["codec_type"] == "video")
        .context("视频流不存在")?;
    let shot = &value["shot"];
    let source = app
        .db
        .get::<Source>("source", shot["sourceId"].as_str().unwrap_or_default())?;
    let lineage = json!({
        "schemaVersion":"moirai.lineage.v1","releaseId":id,"shotId":shot["id"],"shotRevision":shot["revision"],
        "sourceId":source.id,"sourceSha256":source.sha256,"sourceName":source.name,"product":source.product,"batch":source.batch,
        "sourceStartTicks":shot["startTicks"],"sourceEndTicks":shot["endTicks"],"ticksPerSecond":TICKS,
        "analysisRunId":shot["analysisRunId"],"modelId":shot["modelId"],"inputMode":shot["inputMode"],
        "recipe":shot["recipe"],"outputSha256":sha,"publishedPath":shot["publishedPath"],
        "description":shot["description"],"tags":shot["tags"],"roles":shot["roles"],"unsupportedClaims":shot["unsupportedClaims"],"evidence":shot["evidence"]
    });
    Ok(
        json!({"name":format!("{}.mp4",shot["name"].as_str().unwrap_or("shot")),"type":"video","width":video["width"],"height":video["height"],"duration":probe["format"]["duration"].as_str().and_then(|s|s.parse::<f64>().ok()),"fps":source.fps,"hasAudio":streams.iter().any(|s|s["codec_type"]=="audio"),"footage":lineage,"mediaUrl":format!("/api/footage/media/release/{id}/master")}),
    )
}

pub fn lineage(app: &App, id: &str) -> Result<Value> {
    let shot = app.db.get::<Shot>("shot", id)?;
    let source = app.db.get::<Source>("source", &shot.source_id)?;
    let versions = app
        .db
        .list::<Value>("shot_version")?
        .into_iter()
        .filter(|v| v["id"] == id)
        .collect::<Vec<_>>();
    let reviews = app
        .db
        .list::<crate::domain::Review>("review")?
        .into_iter()
        .filter(|v| v.shot_id == id)
        .map(
            |v| json!({"id":v.id,"revision":v.revision,"action":v.action,"createdAt":v.created_at}),
        )
        .collect::<Vec<_>>();
    let publications = releases(app)?
        .into_iter()
        .filter(|v| v["shot"]["id"] == id)
        .collect::<Vec<_>>();
    let root = std::env::var_os("OPENCUT_PROJECTS_DIR")
        .map(PathBuf::from)
        .unwrap_or(app.home.join("OpenCutProjects"));
    let mut uses = vec![];
    let mut warnings = vec![];
    if root.exists() {
        for entry in fs::read_dir(&root)? {
            let dir = entry?.path();
            if !dir.is_dir() {
                continue;
            }
            let index = dir.join("media/index.json");
            if !index.exists() {
                continue;
            }
            let result = (|| -> Result<Vec<Value>> {
                let index: Value = serde_json::from_slice(&fs::read(index)?)?;
                let document: Value = serde_json::from_slice(&fs::read(dir.join("project.json"))?)?;
                let mut items = vec![];
                for (asset_id, asset) in index.as_object().context("工程媒体索引无效")? {
                    if asset["footage"]["shotId"] != id {
                        continue;
                    }
                    let mut elements = vec![];
                    collect_elements(&document, asset_id, &mut elements);
                    items.push(json!({"projectId":document["metadata"]["id"],"projectName":document["metadata"]["name"],"mediaId":asset_id,"releaseId":asset["footage"]["releaseId"],"shotRevision":asset["footage"]["shotRevision"],"elements":elements}));
                }
                Ok(items)
            })();
            match result {
                Ok(items) => uses.extend(items),
                Err(_) => warnings.push(format!(
                    "工程 {} 读取失败",
                    dir.file_name().unwrap_or_default().to_string_lossy()
                )),
            }
        }
    }
    let mut safe_versions = versions;
    for version in &mut safe_versions {
        if let Some(v) = version.as_object_mut() {
            v.remove("outputPath");
        }
    }
    Ok(
        json!({"source":{"id":source.id,"name":source.name,"sha256":source.sha256,"batch":source.batch,"product":source.product},"shotId":id,"analysisRunId":shot.analysis_run_id,"versions":safe_versions,"reviews":reviews,"releases":publications,"uses":uses,"warnings":warnings}),
    )
}

fn collect_elements(value: &Value, asset_id: &str, result: &mut Vec<Value>) {
    if let Some(scenes) = value["scenes"].as_array() {
        for scene in scenes {
            let tracks = &scene["tracks"];
            let mut all = vec![&tracks["main"]];
            for kind in ["overlay", "audio"] {
                if let Some(items) = tracks[kind].as_array() {
                    all.extend(items);
                }
            }
            for track in all {
                if let Some(elements) = track["elements"].as_array() {
                    for element in elements {
                        if element["mediaId"] == asset_id {
                            result.push(json!({"sceneId":scene["id"],"trackId":track["id"],"elementId":element["id"],"startTime":element["startTime"],"duration":element["duration"],"trimStart":element["trimStart"],"trimEnd":element["trimEnd"],"retime":element["retime"]}));
                        }
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn usage_retains_scene_track_and_retime_without_confusing_source_time() {
        let document = json!({"scenes":[{"id":"scene","tracks":{"main":{"id":"track","elements":[{"id":"element","mediaId":"asset","startTime":120000,"trimStart":240000,"retime":{"rate":2}}]},"overlay":[],"audio":[]}}]});
        let mut uses = vec![];
        collect_elements(&document, "asset", &mut uses);
        assert_eq!(uses.len(), 1);
        assert_eq!(uses[0]["sceneId"], "scene");
        assert_eq!(uses[0]["trackId"], "track");
        assert_eq!(uses[0]["trimStart"], 240000);
        assert_eq!(uses[0]["retime"]["rate"], 2);
        collect_elements(&document, "missing", &mut uses);
        assert_eq!(uses.len(), 1);
    }
}
