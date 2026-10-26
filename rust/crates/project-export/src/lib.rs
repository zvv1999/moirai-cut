//! Platform-independent timeline planning and NLE interchange. Filesystem and rendering live in adapters.
#![recursion_limit = "256"]
mod draft;
mod xml;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashSet};

pub const TICKS: f64 = 120_000.0;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub id: String,
    pub name: String,
    pub path: String,
    pub url: String,
    pub width: u32,
    pub height: u32,
    pub duration_seconds: f64,
    pub audio_channels: u32,
    pub sample_rate: u32,
    pub still: bool,
    #[serde(default)]
    pub requires_bake: bool,
    #[serde(default)]
    pub fps: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub source: String,
    pub start: i64,
    pub end: i64,
    pub source_in: i64,
    pub enabled: bool,
    pub gain: f64,
    pub scale: f64,
    pub x: f64,
    pub y: f64,
    pub text: String,
    pub font: String,
    pub font_size: f64,
    pub color: String,
    pub link: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Track {
    pub name: String,
    pub clips: Vec<Clip>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bake {
    pub id: String,
    pub kind: String,
    pub track_id: String,
    pub element_id: String,
    pub start: i64,
    pub end: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub name: String,
    pub target: String,
    pub folder: String,
    pub id: String,
    pub now: i64,
    pub numerator: u32,
    pub denominator: u32,
    pub width: u32,
    pub height: u32,
    pub duration: i64,
    pub files: Vec<Source>,
    pub video: Vec<Track>,
    pub audio: Vec<Track>,
    pub bakes: Vec<Bake>,
    pub warnings: Vec<String>,
    pub subtitles: String,
}
pub fn text(v: &Value, key: &str, fallback: &str) -> String {
    v[key].as_str().unwrap_or(fallback).into()
}
fn num(v: &Value, key: &str, fallback: f64) -> f64 {
    v[key]
        .as_f64()
        .filter(|n| n.is_finite())
        .unwrap_or(fallback)
}
fn flag(v: &Value, key: &str) -> bool {
    v[key].as_bool().unwrap_or(false)
}
fn items(v: &Value) -> &[Value] {
    v.as_array().map(Vec::as_slice).unwrap_or(&[])
}
fn populated(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Array(a) => !a.is_empty(),
        Value::Object(o) => !o.is_empty(),
        _ => true,
    }
}
impl Plan {
    pub fn fps(&self) -> f64 {
        self.numerator as f64 / self.denominator as f64
    }
    pub fn frame(&self, ticks: f64) -> i64 {
        (ticks / TICKS * self.fps()).round() as i64
    }
    pub fn us(&self, frame: i64) -> i64 {
        (frame as f64 * 1_000_000.0 / self.fps()).round() as i64
    }
    pub fn time(&self, frame: i64) -> String {
        format!("{}/{}s", frame * self.denominator as i64, self.numerator)
    }
    pub fn file(&self, id: &str) -> &Source {
        self.files
            .iter()
            .find(|s| s.id == id)
            .expect("validated source reference")
    }
    fn bake(&mut self, kind: &str, track: &Value, element: &Value, start: i64, end: i64) -> String {
        let id = format!("bake-{}", self.bakes.len());
        let ext = if kind == "audio" {
            "wav"
        } else if kind == "still" {
            "png"
        } else {
            "mov"
        };
        self.bakes.push(Bake {
            id: id.clone(),
            kind: kind.into(),
            track_id: text(track, "id", ""),
            element_id: text(element, "id", ""),
            start,
            end,
        });
        self.files.push(Source {
            id: id.clone(),
            name: text(element, "name", "Rendered scene"),
            path: format!("{}/media/{id}.{ext}", self.folder),
            url: xml::file_url(&format!("{}/media/{id}.{ext}", self.folder)),
            width: if kind == "audio" { 0 } else { self.width },
            height: if kind == "audio" { 0 } else { self.height },
            duration_seconds: (end - start) as f64 / self.fps(),
            audio_channels: if kind == "audio" { 2 } else { 0 },
            sample_rate: 44100,
            still: kind == "still",
            requires_bake: false,
            fps: self.fps(),
        });
        id
    }
}
fn clip(element: &Value, start: i64, end: i64) -> Clip {
    Clip {
        id: text(element, "id", "clip"),
        name: text(element, "name", "Clip"),
        kind: text(element, "type", "video"),
        source: text(element, "mediaId", ""),
        start,
        end,
        source_in: 0,
        enabled: !flag(element, "hidden"),
        gain: 1.0,
        scale: 1.0,
        x: 0.0,
        y: 0.0,
        text: String::new(),
        font: String::new(),
        font_size: 48.0,
        color: "#ffffff".into(),
        link: String::new(),
    }
}
fn lanes(name: &str, mut clips: Vec<Clip>) -> Vec<Track> {
    clips.sort_by_key(|c| c.start);
    let mut tracks: Vec<Track> = Vec::new();
    for c in clips {
        if let Some(t) = tracks
            .iter_mut()
            .find(|t| t.clips.last().is_none_or(|last| last.end <= c.start))
        {
            t.clips.push(c);
        } else {
            tracks.push(Track {
                name: name.into(),
                clips: vec![c],
            });
        }
    }
    tracks
}
fn retimed(e: &Value) -> bool {
    let r = &e["retime"];
    num(r, "rate", 1.0) != 1.0
        || flag(r, "reverse")
        || !r["freezeFrameAt"].is_null()
        || populated(&r["curve"])
}
fn animated(e: &Value) -> bool {
    e["animations"]
        .as_object()
        .is_some_and(|a| a.values().any(populated))
}
fn visual_bake(e: &Value) -> bool {
    let p = &e["params"];
    animated(e)
        || retimed(e)
        || populated(&e["effects"])
        || populated(&e["masks"])
        || populated(&e["motionTracking"])
        || flag(&e["stabilization"], "enabled")
        || num(p, "transform.rotate", 0.0) != 0.0
        || num(p, "transform.scaleX", 1.0) != num(p, "transform.scaleY", 1.0)
        || num(p, "transform.scaleX", 1.0) <= 0.0
        || num(p, "opacity", 1.0) != 1.0
        || [
            "crop.left",
            "crop.right",
            "crop.top",
            "crop.bottom",
            "geometry.cornerRadius",
            "geometry.stroke.width",
        ]
        .iter()
        .any(|k| num(p, k, 0.0) != 0.0)
        || [
            "geometry.mirrorX",
            "geometry.mirrorY",
            "geometry.shadow.enabled",
        ]
        .iter()
        .any(|k| flag(p, k))
}
fn audio_bake(e: &Value) -> bool {
    retimed(e)
        || animated(e)
        || ["audioFadeIn", "audioFadeOut"]
            .iter()
            .any(|k| num(&e["params"], k, 0.0) != 0.0)
        || text(e, "sourceType", "") == "library"
}
pub fn plan(input: &Value) -> Result<Plan, String> {
    let project = &input["project"];
    let settings = &project["settings"];
    let target = text(input, "target", "");
    if !["premiere", "fcpxml", "jianying", "capcut"].contains(&target.as_str()) {
        return Err("Unsupported export target".into());
    }
    let numerator = num(&settings["fps"], "numerator", 30.0) as u32;
    let denominator = num(&settings["fps"], "denominator", 1.0) as u32;
    let width = num(&settings["canvasSize"], "width", 0.0) as u32;
    let height = num(&settings["canvasSize"], "height", 0.0) as u32;
    if denominator == 0
        || numerator == 0
        || !(1.0..=120.0).contains(&(numerator as f64 / denominator as f64))
        || !(16..=8192).contains(&width)
        || !(16..=8192).contains(&height)
    {
        return Err("Invalid canvas or frame rate".into());
    }
    // FCP7 XML represents integer and 1000/1001 rates only. Refuse rounding that shifts cuts.
    if target == "premiere"
        && !numerator.is_multiple_of(denominator)
        && !(denominator == 1001 && numerator.is_multiple_of(1000))
    {
        return Err("Premiere XML requires an integer or 1000/1001 frame rate".into());
    }
    let scene = items(&project["scenes"])
        .iter()
        .find(|s| s["id"] == project["currentSceneId"])
        .ok_or("Active scene is missing")?;
    let t = &scene["tracks"];
    let mut tracks = vec![&t["main"]];
    tracks.extend(items(&t["overlay"]).iter().rev());
    tracks.extend(items(&t["audio"]));
    let mut p = Plan {
        name: text(&project["metadata"], "name", "Moirai Cut"),
        target,
        folder: text(input, "folder", ""),
        id: text(input, "id", "export"),
        now: num(input, "now", 0.0) as i64,
        numerator,
        denominator,
        width,
        height,
        duration: 0,
        files: serde_json::from_value(input["sources"].clone()).map_err(|e| e.to_string())?,
        video: vec![],
        audio: vec![],
        bakes: vec![],
        warnings: vec![],
        subtitles: String::new(),
    };
    if p.files
        .iter()
        .any(|f| !f.duration_seconds.is_finite() || f.duration_seconds < 0.0)
    {
        return Err("Invalid source duration".into());
    }
    let mut all_elements = 0;
    let mut ids = HashSet::new();
    for track in &tracks {
        for e in items(&track["elements"]) {
            all_elements += 1;
            let id = text(e, "id", "");
            if id.is_empty() || !ids.insert(id) {
                return Err("Missing or duplicate clip id".into());
            }
            if ![
                "video", "image", "audio", "text", "graphic", "sticker", "effect",
            ]
            .contains(&text(e, "type", "").as_str())
            {
                return Err("Unsupported timeline element".into());
            }
            let start = num(e, "startTime", -1.0);
            let duration = num(e, "duration", 0.0);
            if start < 0.0
                || duration <= 0.0
                || start + duration > TICKS * 86400.0
                || num(e, "trimStart", 0.0) < 0.0
            {
                return Err(format!("Invalid clip time: {}", text(e, "name", "Clip")));
            }
            if p.frame(start + duration) <= p.frame(start) {
                return Err(format!(
                    "Clip shorter than one export frame: {}",
                    text(e, "name", "Clip")
                ));
            }
            p.duration = p.duration.max(p.frame(start + duration));
            if let Some(id) = e["mediaId"].as_str()
                && !p.files.iter().any(|s| s.id == id)
            {
                return Err(format!("Missing original media: {id}"));
            }
        }
    }
    if all_elements == 0 || all_elements > 10000 {
        return Err("Timeline must contain 1 to 10000 clips".into());
    }
    let flatten = settings["background"]["type"] == "blur"
        || tracks.iter().any(|track| {
            items(&track["elements"]).iter().any(|e| {
                e["type"] == "effect"
                    || populated(&e["compound"])
                    || populated(&e["transitionIn"])
                    || text(&e["params"], "blendMode", "normal") != "normal"
            })
        });
    let solo = tracks.iter().any(|t| flag(t, "solo"));
    let mut cues = vec![];
    for track in &tracks {
        for e in items(&track["elements"]) {
            if e["type"] == "text" && !flag(track, "hidden") && !flag(e, "hidden") {
                let text = text(
                    &e["params"],
                    "caption.primaryText",
                    &text(&e["params"], "content", ""),
                );
                if !text.trim().is_empty() {
                    cues.push((
                        p.frame(num(e, "startTime", 0.0)),
                        p.frame(num(e, "startTime", 0.0) + num(e, "duration", 0.0)),
                        text,
                    ));
                }
            }
        }
    }
    cues.sort_by_key(|c| c.0);
    fn srt_time(us: i64) -> String {
        let ms = us / 1000;
        format!(
            "{:02}:{:02}:{:02},{:03}",
            ms / 3600000,
            ms / 60000 % 60,
            ms / 1000 % 60,
            ms % 1000
        )
    }
    for (i, (a, b, text)) in cues.iter().enumerate() {
        p.subtitles.push_str(&format!(
            "{}\n{} --> {}\n{}\n\n",
            i + 1,
            srt_time(p.us(*a)),
            srt_time(p.us(*b)),
            text
        ));
    }
    if flatten {
        let id = p.bake("scene", &Value::Null, &Value::Null, 0, p.duration);
        let mut c = clip(
            &json!({"id":"scene","name":p.name,"type":"video"}),
            0,
            p.duration,
        );
        c.source = id;
        p.video.push(Track {
            name: "Rendered picture".into(),
            clips: vec![c],
        });
        p.warnings.push("跨轨效果、转场、复合片段或模糊背景已合成为整段画面；声音仍按片段导出。原工程快照保存在包内。".into());
    }
    for track in &tracks {
        let mut video = vec![];
        let mut audio = vec![];
        for e in items(&track["elements"]) {
            let start = p.frame(num(e, "startTime", 0.0));
            let end = p.frame(num(e, "startTime", 0.0) + num(e, "duration", 0.0));
            let mut c = clip(e, start, end);
            c.source_in = p.frame(num(e, "trimStart", 0.0));
            c.link = c.id.clone();
            let params = &e["params"];
            let source = p.files.iter().find(|s| s.id == c.source).cloned();
            // XML readers disagree on mixed source/sequence frame units. Conform these
            // clips with the authoritative renderer instead of risking a shifted trim.
            let mixed_rate = ["premiere", "fcpxml"].contains(&p.target.as_str())
                && source
                    .as_ref()
                    .is_some_and(|s| !s.still && s.fps > 0.0 && (s.fps - p.fps()).abs() > 0.01);
            let has_audio = e["type"] == "audio"
                || (e["type"] == "video"
                    && source.as_ref().is_some_and(|s| s.audio_channels > 0)
                    && e["isSourceAudioEnabled"] != false);
            if has_audio && !populated(&e["compound"]) {
                let mut a = c.clone();
                a.id.push_str("-audio");
                a.kind = "audio".into();
                a.enabled = !flag(track, "muted")
                    && !flag(params, "muted")
                    && (!solo || flag(track, "solo"));
                a.gain = 10.0_f64.powf(num(params, "volume", 0.0).clamp(-60.0, 20.0) / 20.0);
                if audio_bake(e) || mixed_rate {
                    a.source = p.bake("audio", track, e, start, end);
                    a.source_in = 0;
                    a.gain = 1.0;
                } else if let Some(s) = &source
                    && num(e, "trimStart", 0.0) / TICKS + (end - start) as f64 / p.fps()
                        > s.duration_seconds + 1.0 / p.fps()
                {
                    return Err(format!("Audio clip exceeds original media: {}", c.name));
                }
                if p.target == "jianying" && p.file(&a.source).audio_channels == 1 && a.enabled {
                    p.warnings.push(format!(
                        "{}：单声道音量已补偿剪映的上混增益（约 +3 dB），保持 Moirai 的播放音量。",
                        c.name
                    ));
                }
                audio.push(a);
            }
            if flatten
                || !["video", "image", "text", "graphic", "sticker"].contains(&c.kind.as_str())
            {
                continue;
            }
            c.enabled &= !flag(track, "hidden");
            c.x = num(params, "transform.positionX", 0.0);
            c.y = num(params, "transform.positionY", 0.0);
            let bake = visual_bake(e)
                || mixed_rate
                || source.as_ref().is_some_and(|s| s.requires_bake)
                || ["graphic", "sticker"].contains(&c.kind.as_str())
                || (c.kind == "text" && p.target == "premiere");
            if bake {
                let kind =
                    if (e["type"] == "text" || e["type"] == "graphic" || e["type"] == "image")
                        && !animated(e)
                        && !populated(&e["effects"])
                    {
                        "still"
                    } else {
                        "video"
                    };
                c.source = p.bake(kind, track, e, start, end);
                c.kind = if kind == "still" { "image" } else { "video" }.into();
                c.source_in = 0;
                c.x = 0.0;
                c.y = 0.0;
                p.warnings.push(format!(
                    "{}：外观已渲染为独立素材，剪切点可编辑，内部效果不再可编辑。",
                    c.name
                ));
            } else if c.kind == "text" {
                c.text = text(params, "content", &text(params, "caption.primaryText", ""));
                c.font = text(params, "fontFamily", "Arial");
                c.font_size = num(params, "fontSize", 15.0) * height as f64 / 90.0;
                c.scale = num(params, "transform.scaleX", 1.0);
                c.color = text(params, "color", "#ffffff");
                p.warnings.push(format!(
                    "{}：导出为可编辑文字；目标软件的字体、换行和字效可能不同，请核对。",
                    c.name
                ));
            } else {
                let s = source
                    .as_ref()
                    .ok_or_else(|| format!("Missing source: {}", c.name))?;
                if s.width == 0 || s.height == 0 {
                    return Err(format!("Missing source dimensions: {}", c.name));
                }
                c.scale = (width as f64 / s.width as f64).min(height as f64 / s.height as f64)
                    * num(params, "transform.scaleX", 1.0);
                if !s.still
                    && num(e, "trimStart", 0.0) / TICKS + (end - start) as f64 / p.fps()
                        > s.duration_seconds + 1.0 / p.fps()
                {
                    return Err(format!("Clip exceeds original media: {}", c.name));
                }
            }
            video.push(c);
        }
        p.video.extend(lanes(&text(track, "name", "Video"), video));
        p.audio.extend(lanes(&text(track, "name", "Audio"), audio));
    }
    if flatten
        && tracks.iter().any(|t| {
            items(&t["elements"])
                .iter()
                .any(|e| populated(&e["compound"]))
        })
    {
        // Compound children can carry audio not present on the outer element: use the editor's authoritative mix.
        p.audio.clear();
        let id = p.bake("mix", &Value::Null, &Value::Null, 0, p.duration);
        let s = p.files.last_mut().unwrap();
        s.path = s.path.replace(".mov", ".wav");
        s.url = s.url.replace(".mov", ".wav");
        s.width = 0;
        s.height = 0;
        s.audio_channels = 2;
        let mut c = clip(
            &json!({"id":"mix","name":"Scene mix","type":"audio"}),
            0,
            p.duration,
        );
        c.source = id;
        p.audio.push(Track {
            name: "Scene mix".into(),
            clips: vec![c],
        });
        p.warnings
            .push("复合片段的声音已合为完整混音，内部音轨不再独立。".into());
    }
    if !flatten
        && settings["background"]["type"] == "color"
        && !["#000000", "#000", "black", "transparent"]
            .contains(&text(&settings["background"], "color", "#000000").as_str())
    {
        let id = p.bake("background", &Value::Null, &Value::Null, 0, p.duration);
        let s = p.files.last_mut().unwrap();
        s.path = s.path.replace(".mov", ".png");
        s.url = s.url.replace(".mov", ".png");
        s.still = true;
        let mut c = clip(
            &json!({"id":"background","name":"Background","type":"image"}),
            0,
            p.duration,
        );
        c.source = id;
        p.video.insert(
            0,
            Track {
                name: "Background".into(),
                clips: vec![c],
            },
        );
    }
    p.files.retain(|s| {
        p.video
            .iter()
            .chain(&p.audio)
            .flat_map(|t| &t.clips)
            .any(|c| c.source == s.id)
            || p.bakes.iter().any(|b| b.id == s.id)
    });
    Ok(p)
}
pub fn execute(input: Value) -> Result<Value, String> {
    if input["action"] == "plan" {
        return serde_json::to_value(plan(&input)?).map_err(|e| e.to_string());
    }
    if input["action"] != "serialize" {
        return Err("Unknown export action".into());
    }
    let p: Plan = serde_json::from_value(input["plan"].clone()).map_err(|e| e.to_string())?;
    for c in p.video.iter().chain(&p.audio).flat_map(|t| &t.clips) {
        if c.kind != "text" && !p.files.iter().any(|s| s.id == c.source) {
            return Err("Unresolved export source".into());
        }
    }
    let mut docs: BTreeMap<String, String> = BTreeMap::new();
    match p.target.as_str() {
        "premiere" => {
            docs.insert("timeline.xml".into(), xml::xmeml(&p));
        }
        "fcpxml" => {
            docs.insert("timeline.fcpxml".into(), xml::fcpxml(&p));
        }
        "jianying" | "capcut" => {
            let (info, meta) = draft::document(&p);
            let body = serde_json::to_string_pretty(&info).unwrap();
            docs.insert("draft_info.json".into(), body.clone());
            docs.insert("draft_content.json".into(), body);
            docs.insert(
                "draft_meta_info.json".into(),
                serde_json::to_string_pretty(&meta).unwrap(),
            );
        }
        _ => return Err("Unsupported target".into()),
    }
    docs.insert("subtitles.srt".into(), p.subtitles.clone());
    Ok(json!({"documents":docs}))
}
