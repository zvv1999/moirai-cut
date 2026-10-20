use super::{
    api,
    model::{ResourceBinding, Template, valid_id},
};
use crate::{
    domain::{id, now},
    service::App,
    storage, store,
};
use anyhow::{Context, Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, fs, path::PathBuf};

#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Image,
    Video,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Import {
    pub path: PathBuf,
    pub kind: Kind,
    pub name: String,
    pub description: String,
    pub tags: Vec<String>,
    /// A caller-supplied origin statement, not an independently verified license.
    pub provenance: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: String,
    pub sha256: String,
    pub source_sha256: String,
    pub name: String,
    pub description: String,
    pub tags: Vec<String>,
    pub provenance: String,
    pub kind: Kind,
    pub width: u64,
    pub height: u64,
    pub duration: Option<f64>,
    pub size: u64,
    pub created_at: u64,
}
impl Asset {
    pub fn extension(&self) -> &'static str {
        match self.kind {
            Kind::Image => "png",
            Kind::Video => "mp4",
        }
    }
    pub fn mime(&self) -> &'static str {
        match self.kind {
            Kind::Image => "image/png",
            Kind::Video => "video/mp4",
        }
    }
    pub fn metadata(&self) -> Value {
        json!({"id":self.id,"name":format!("{}.{}",self.name,self.extension()),"type":self.kind,
            "ext":self.extension(),"mimeType":self.mime(),"width":self.width,"height":self.height,
            "duration":self.duration,"size":self.size,"hasAudio":false,"tags":self.tags,
            "lastModified":self.created_at*1000,
            "templateAsset":{"id":self.id,"sha256":self.sha256,"sourceSha256":self.source_sha256,"provenance":self.provenance}})
    }
}
fn blob(app: &App, asset: &Asset) -> PathBuf {
    api::root(app)
        .join("assets/blobs")
        .join(format!("{}.{}", asset.sha256, asset.extension()))
}
pub fn file(app: &App, id: &str) -> Result<(PathBuf, &'static str)> {
    ensure!(valid_id(id), "invalid visual asset ID");
    let asset: Asset = app.db.get("template_visual_asset", id)?;
    Ok((blob(app, &asset), asset.mime()))
}
pub fn import(app: &App, input: Import) -> Result<Asset> {
    ensure!(
        !input.name.trim().is_empty() && input.name.len() <= 200,
        "asset name required"
    );
    ensure!(
        !input.provenance.trim().is_empty()
            && input.provenance.len() <= 4000
            && input.description.len() <= 4000,
        "asset provenance required or text too long"
    );
    ensure!(
        input.tags.len() <= 32
            && input
                .tags
                .iter()
                .all(|t| !t.trim().is_empty() && t.len() <= 100),
        "invalid asset tags"
    );
    let source = input.path.canonicalize().context("asset file missing")?;
    let size = fs::metadata(&source)?;
    ensure!(
        size.is_file() && size.len() > 0 && size.len() <= 512 * 1024 * 1024,
        "asset must be a file up to 512 MB"
    );
    let work = api::root(app).join("assets/work").join(id());
    fs::create_dir_all(&work)?;
    let result = (|| {
        let snapshot = work.join("source");
        fs::copy(source, &snapshot)?;
        ensure!(
            fs::metadata(&snapshot)?.len() <= 512 * 1024 * 1024,
            "asset snapshot exceeds 512 MB"
        );
        let source_sha256 = storage::hash(&snapshot)?;
        let probe = app.media.probe(&snapshot)?;
        let stream = probe["streams"]
            .as_array()
            .context("asset has no streams")?
            .iter()
            .find(|s| s["codec_type"] == "video")
            .context("visual stream required")?;
        let width = stream["width"].as_u64().context("asset width missing")?;
        let height = stream["height"].as_u64().context("asset height missing")?;
        ensure!(
            (1..=8192).contains(&width) && (1..=8192).contains(&height),
            "asset dimensions exceed 8192 pixels"
        );
        let duration = probe["format"]["duration"]
            .as_str()
            .and_then(|d| d.parse::<f64>().ok());
        let (extension, mut output_args) = match input.kind {
            Kind::Image => {
                ensure!(
                    duration.is_none()
                        && ["png", "mjpeg", "webp", "bmp", "tiff"]
                            .contains(&stream["codec_name"].as_str().unwrap_or("")),
                    "image import requires a still image; extract a frame explicitly for videos"
                );
                (
                    "png",
                    vec!["-frames:v", "1", "-c:v", "png", "-pix_fmt", "rgba"],
                )
            }
            Kind::Video => {
                ensure!(
                    duration.is_some_and(|d| d.is_finite() && d > 0. && d <= 120.),
                    "reusable video assets must be at most 120 seconds"
                );
                (
                    "mp4",
                    vec![
                        "-c:v",
                        "libx264",
                        "-pix_fmt",
                        "yuv420p",
                        "-vf",
                        "pad=ceil(iw/2)*2:ceil(ih/2)*2",
                        "-movflags",
                        "+faststart",
                        "-crf",
                        "18",
                    ],
                )
            }
        };
        let output = work.join(format!("asset.{extension}"));
        let mut args = vec![
            "-v".into(),
            "error".into(),
            "-y".into(),
            "-i".into(),
            snapshot.to_string_lossy().into_owned(),
            "-map".into(),
            "0:v:0".into(),
            "-an".into(),
        ];
        args.extend(output_args.drain(..).map(str::to_owned));
        args.push(output.to_string_lossy().into_owned());
        app.media.run(&app.media.ffmpeg, &args, 300)?;
        let check = app.media.probe(&output)?;
        let stream = &check["streams"][0];
        let sha256 = storage::hash(&output)?;
        ensure!(
            fs::metadata(&output)?.len() <= 512 * 1024 * 1024,
            "normalized asset exceeds 512 MB"
        );
        let mut asset = Asset {
            id: String::new(),
            sha256,
            source_sha256,
            name: input.name,
            description: input.description,
            tags: input
                .tags
                .into_iter()
                .collect::<BTreeSet<_>>()
                .into_iter()
                .collect(),
            provenance: input.provenance,
            kind: input.kind,
            width: stream["width"]
                .as_u64()
                .context("converted width missing")?,
            height: stream["height"]
                .as_u64()
                .context("converted height missing")?,
            duration: if extension == "mp4" {
                check["format"]["duration"]
                    .as_str()
                    .and_then(|d| d.parse().ok())
            } else {
                None
            },
            size: fs::metadata(&output)?.len(),
            created_at: 0,
        };
        asset.id = format!("visual-{:x}", Sha256::digest(serde_json::to_vec(&asset)?));
        let path = blob(app, &asset);
        fs::create_dir_all(path.parent().unwrap())?;
        if !path.exists() {
            fs::rename(&output, &path)?;
        }
        ensure!(
            storage::hash(&path)? == asset.sha256,
            "shared asset blob corrupted"
        );
        app.db.transaction(|db| {
            let exists: bool = db.query_row(
                "SELECT EXISTS(SELECT 1 FROM records WHERE kind='template_visual_asset' AND id=?1)",
                [&asset.id],
                |r| r.get(0),
            )?;
            if exists {
                return store::get(db, "template_visual_asset", &asset.id);
            }
            asset.created_at = now();
            store::put(db, "template_visual_asset", &asset.id, &asset)?;
            Ok(asset)
        })
    })();
    let _ = fs::remove_dir_all(work);
    result
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Resolve {
    pub template: Template,
    #[serde(default)]
    pub bindings: Vec<ResourceBinding>,
    #[serde(default)]
    pub visual_bindings: Vec<super::visual_compile::Binding>,
}
pub fn resolve_assets(input: Resolve, catalog: &[Asset]) -> Result<Vec<Asset>> {
    let mut template = input.template;
    let mut slots = BTreeSet::new();
    for binding in input.bindings {
        ensure!(
            slots.insert(binding.slot_id.clone()),
            "duplicate resource override"
        );
        template
            .resource_bindings
            .retain(|b| b.slot_id != binding.slot_id);
        template.resource_bindings.push(binding);
    }
    slots.clear();
    for binding in input.visual_bindings {
        ensure!(
            slots.insert(binding.resource_id.clone()),
            "duplicate visual override"
        );
        template.bind(&binding.resource_id, &binding.media_id);
    }
    template.validate()?;
    let mut output = vec![];
    let mut seen = BTreeSet::new();
    for binding in &template.resource_bindings {
        if !binding.enabled || !binding.asset_id.starts_with("visual-") {
            continue;
        }
        let slot = template
            .resource_slots
            .iter()
            .find(|s| s.id == binding.slot_id)
            .context("unknown resource slot")?;
        ensure!(
            slot.representation.is_visual_asset(),
            "shared visual asset cannot bind audio slot"
        );
        let asset = catalog
            .iter()
            .find(|a| a.id == binding.asset_id)
            .context("shared visual asset missing")?;
        let accepts = matches!(
            (&slot.representation, &asset.kind),
            (super::model::Representation::Image, Kind::Image)
                | (super::model::Representation::Video, Kind::Video)
                | (super::model::Representation::VisualMedia, _)
        );
        ensure!(accepts, "shared visual asset type mismatch");
        if seen.insert(asset.id.clone()) {
            output.push(asset.clone());
        }
    }
    Ok(output)
}

pub fn preview_media(app: &App, template: Template) -> Result<(Value, Vec<Value>)> {
    let assets = resolve_assets(
        Resolve {
            template,
            bindings: vec![],
            visual_bindings: vec![],
        },
        &app.db.list::<Asset>("template_visual_asset")?,
    )?;
    let mut metadata = serde_json::Map::new();
    let mut sources = vec![];
    for asset in assets {
        let (path, _) = file(app, &asset.id)?;
        ensure!(
            crate::storage::hash(&path)? == asset.sha256,
            "visual preview source hash mismatch"
        );
        metadata.insert(asset.id.clone(), asset.metadata());
        sources.push(json!({"id":asset.id,"name":asset.name,"type":asset.kind,"width":asset.width,"height":asset.height,
            "duration":asset.duration,"sha256":asset.sha256,"url":format!("/api/footage/templates/assets/{}/media",asset.id)}));
    }
    Ok((Value::Object(metadata), sources))
}

#[cfg(test)]
mod tests {
    use super::super::model::{Representation, ResourceSlot};
    use super::*;
    fn setup() -> (Template, Asset) {
        let mut template = super::super::seed::templates().unwrap().remove(0);
        template.resource_slots.push(ResourceSlot {
            id: "shared".into(),
            representation: Representation::Image,
            description: "Reusable sticker".into(),
            tags: vec![],
        });
        template.bind("shared", "visual-test");
        let asset = Asset {
            id: "visual-test".into(),
            sha256: "a".repeat(64),
            source_sha256: "b".repeat(64),
            name: "Sticker".into(),
            description: "test".into(),
            tags: vec!["sticker".into()],
            provenance: "test fixture".into(),
            kind: Kind::Image,
            width: 32,
            height: 32,
            duration: None,
            size: 100,
            created_at: 1,
        };
        (template, asset)
    }
    #[test]
    fn shared_assets_preserve_identity_and_reject_missing_or_wrong_types() {
        let (template, asset) = setup();
        let request = || Resolve {
            template: template.clone(),
            bindings: vec![],
            visual_bindings: vec![],
        };
        assert!(resolve_assets(request(), &[]).is_err());
        let result = resolve_assets(request(), &[asset.clone()]).unwrap();
        assert_eq!(
            result[0].metadata()["templateAsset"]["sha256"],
            asset.sha256
        );
        assert_eq!(result[0].metadata()["type"], "image");
        let mut video = asset;
        video.kind = Kind::Video;
        assert!(resolve_assets(request(), &[video]).is_err());
    }
    #[test]
    fn disabled_and_project_overrides_do_not_import_default_shared_assets() {
        let (template, _) = setup();
        let disabled = ResourceBinding {
            slot_id: "shared".into(),
            asset_id: "visual-missing".into(),
            enabled: false,
        };
        assert!(
            resolve_assets(
                Resolve {
                    template: template.clone(),
                    bindings: vec![disabled],
                    visual_bindings: vec![]
                },
                &[]
            )
            .unwrap()
            .is_empty()
        );
        let binding =
            serde_json::from_value(json!({"resourceId":"shared","mediaId":"project-local"}))
                .unwrap();
        assert!(
            resolve_assets(
                Resolve {
                    template: template.clone(),
                    bindings: vec![],
                    visual_bindings: vec![binding]
                },
                &[]
            )
            .unwrap()
            .is_empty()
        );
        let duplicate = ResourceBinding {
            slot_id: "shared".into(),
            asset_id: "project-local".into(),
            enabled: true,
        };
        assert!(
            resolve_assets(
                Resolve {
                    template,
                    bindings: vec![duplicate.clone(), duplicate],
                    visual_bindings: vec![]
                },
                &[]
            )
            .is_err()
        );
    }
}
