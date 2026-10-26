use serde_json::{Value, json};

fn array(v: &Value) -> &[Value] {
    v.as_array().map(Vec::as_slice).unwrap_or(&[])
}
fn number(v: &Value) -> f64 {
    v.as_f64().filter(|n| n.is_finite()).unwrap_or(0.0)
}
fn seconds(v: &Value) -> f64 {
    number(v) / 120_000.0
}
fn rounded(v: f64) -> f64 {
    (v * 1000.0).round() / 1000.0
}
fn rate(v: &Value) -> f64 {
    v.as_f64()
        .filter(|n| n.is_finite() && *n > 0.0)
        .unwrap_or(1.0)
}
fn tracks(scene: &Value) -> Vec<(&str, &Value)> {
    let mut tracks = vec![];
    if scene["tracks"]["main"].is_object() {
        tracks.push(("main", &scene["tracks"]["main"]));
    }
    for bucket in ["overlay", "audio"] {
        tracks.extend(array(&scene["tracks"][bucket]).iter().map(|t| (bucket, t)));
    }
    tracks
}

fn integrate(clip: f64, retime: &Value) -> f64 {
    let mut points: Vec<(f64, f64)> = array(&retime["curve"]["points"])
        .iter()
        .map(|p| (seconds(&p["time"]), rate(&p["rate"])))
        .collect();
    points.sort_by(|a, b| a.0.total_cmp(&b.0));
    if points.is_empty() {
        return clip * rate(&retime["rate"]);
    }
    let (mut source, mut cursor, mut current) = (0.0, 0.0, points[0].1);
    for &(time, next) in points.iter().skip(1) {
        if clip <= cursor {
            break;
        }
        let duration = (clip.min(time) - cursor).max(0.0);
        let end_rate = current + (next - current) * duration / (time - cursor).max(0.001);
        source += duration * (current + end_rate) / 2.0;
        if clip <= time {
            return source;
        }
        cursor = time;
        current = next;
    }
    source + (clip - cursor).max(0.0) * current
}

fn source_at(element: &Value, time: f64) -> f64 {
    if element["type"] == "image" {
        return 0.0;
    }
    let trim = seconds(&element["trimStart"]);
    let retime = &element["retime"];
    if retime["freezeFrameAt"].is_number() {
        return trim + seconds(&retime["freezeFrameAt"]).max(0.0);
    }
    let forward = integrate((time - seconds(&element["startTime"])).max(0.0), retime);
    if retime["reverse"] != true {
        return trim + forward;
    }
    let span = if element["sourceDuration"].is_number() {
        seconds(&element["sourceDuration"])
    } else {
        integrate(seconds(&element["duration"]), retime)
    };
    trim + (span - forward).max(0.0)
}

pub fn uses(document: &Value) -> Value {
    let mut result = json!({});
    for scene in array(&document["scenes"]) {
        for (_, track) in tracks(scene) {
            for element in array(&track["elements"]) {
                let Some(asset) = element["mediaId"].as_str() else {
                    continue;
                };
                let start = seconds(&element["startTime"]);
                let end = start + seconds(&element["duration"]);
                let a = source_at(element, start);
                let b = source_at(element, end);
                if !result[asset].is_array() {
                    result[asset] = json!([]);
                }
                result[asset].as_array_mut().unwrap().push(json!({
                    "sceneId":scene["id"], "trackId":track["id"], "elementId":element["id"],
                    "timelineStartSeconds":rounded(start), "timelineEndSeconds":rounded(end),
                    "sourceStartSeconds":rounded(a.min(b)), "sourceEndSeconds":rounded(a.max(b))
                }));
            }
        }
    }
    result
}

pub fn inspect(input: &Value) -> Result<Value, String> {
    let start = input["startSeconds"]
        .as_f64()
        .filter(|n| n.is_finite() && *n >= 0.0);
    let end = input["endSeconds"].as_f64().filter(|n| n.is_finite());
    let (Some(start), Some(end)) = (start, end) else {
        return Err("endSeconds must be greater than a finite, non-negative startSeconds.".into());
    };
    if end <= start {
        return Err("endSeconds must be greater than a finite, non-negative startSeconds.".into());
    }
    let max = if input["maxFrames"].is_null() {
        12
    } else {
        input["maxFrames"]
            .as_u64()
            .filter(|n| (1..=25).contains(n))
            .ok_or("maxFrames must be an integer from 1 to 25.")? as usize
    };
    let doc = &input["document"];
    let scenes = array(&doc["scenes"]);
    let scene = if let Some(id) = input["sceneId"].as_str() {
        scenes
            .iter()
            .find(|s| s["id"] == id)
            .ok_or("Unknown sceneId")?
    } else {
        scenes
            .iter()
            .find(|s| s["id"] == doc["currentSceneId"])
            .or_else(|| scenes.iter().find(|s| s["isMain"] == true))
            .or_else(|| scenes.first())
            .ok_or("The project has no scene to inspect.")?
    };
    let mut layers = vec![];
    for (bucket, track) in tracks(scene) {
        if bucket == "audio" || track["hidden"] == true {
            continue;
        }
        for element in array(&track["elements"]) {
            let a = seconds(&element["startTime"]);
            let b = a + seconds(&element["duration"]);
            if element["hidden"] != true
                && element["type"] != "audio"
                && b > a
                && a < end
                && b > start
            {
                layers.push((bucket, track, element, a.max(start), b.min(end)));
            }
        }
    }
    let mut moments: Vec<f64> = (0..max.min(24))
        .map(|i| start + (i as f64 + 0.5) * (end - start) / max.min(24) as f64)
        .collect();
    // Include short overlays/titles that fall between the uniform samples.
    let mut omitted_layers = vec![];
    for (_, _, e, a, b) in &layers {
        if !moments.iter().any(|t| *t >= *a && *t < *b) {
            if moments.len() < 24 {
                moments.push((a + b) / 2.0);
            } else {
                omitted_layers.push(e["id"].clone());
            }
        }
    }
    moments.sort_by(f64::total_cmp);
    let mut samples = vec![];
    let mut by_asset = json!({});
    let mut omitted_samples = 0;
    for &time in &moments {
        for (bucket, track, element, a, b) in &layers {
            let Some(asset) = element["mediaId"].as_str() else {
                continue;
            };
            if time < *a
                || time >= *b
                || !matches!(element["type"].as_str(), Some("video" | "image"))
            {
                continue;
            }
            if samples.len() >= 200
                || (by_asset[asset].is_null() && by_asset.as_object().unwrap().len() >= 12)
            {
                omitted_samples += 1;
                continue;
            }
            let source = rounded(source_at(element, time));
            samples.push(json!({"timelineSeconds":rounded(time),"sourceSeconds":source,
                "assetId":asset,"trackId":track["id"],"trackBucket":bucket,"elementId":element["id"],
                "elementName":element["name"].as_str().or(element["id"].as_str()),"mediaType":element["type"]}));
            if by_asset[asset].is_null() {
                by_asset[asset] =
                    json!({"assetId":asset,"elementIds":[],"sourceSeconds":[],"samples":[]});
            }
            let group = &mut by_asset[asset];
            for (key, value) in [
                ("elementIds", element["id"].clone()),
                ("sourceSeconds", json!(source)),
            ] {
                let values = group[key].as_array_mut().unwrap();
                if !values.contains(&value) {
                    values.push(value);
                }
            }
            group["samples"].as_array_mut().unwrap().push(json!({"timelineSeconds":rounded(time),"sourceSeconds":source,"elementId":element["id"]}));
        }
    }
    Ok(
        json!({"schemaVersion":"opencut.timeline-inspection.v1","projectId":doc["metadata"]["id"],
            "revision":doc["revision"].as_u64().unwrap_or(0),"sceneId":scene["id"],"range":{"startSeconds":start,"endSeconds":end},
            "samples":samples,"byAsset":by_asset,"compositeAtSeconds":moments,
            "layers":layers.iter().map(|(bucket,track,e,a,b)| json!({"trackId":track["id"],"trackBucket":bucket,
                "elementId":e["id"],"type":e["type"],"startSeconds":a,"endSeconds":b,"text":e["content"]})).collect::<Vec<_>>(),
            "coverage":{"omittedLayerIds":omitted_layers,"omittedSourceSamples":omitted_samples,
                "sourceFramesAreComposite":false,"requiresComposite":true}
        }),
    )
}
