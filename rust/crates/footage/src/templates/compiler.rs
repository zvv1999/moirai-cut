use super::{
    audio_compile::{self, AudioAsset},
    model::*,
    rhythm::{self, EditPlan, PlacedElement, PlanInput},
    source_layout::{self, SourceRef},
    visual_compile,
};
use crate::domain::{TICKS, id};
use anyhow::{Context, Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

#[derive(Clone, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompileInput {
    pub input: PlanInput,
    pub document: Value,
    pub scene_id: String,
    pub base_revision: u64,
    pub idempotency_key: String,
    #[serde(default)]
    pub start_time_seconds: f64,
    #[serde(default)]
    pub source: Option<SourceRef>,
    #[serde(default)]
    pub media: Value,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub visual_bindings: Vec<visual_compile::Binding>,
}

fn ticks(seconds: f64) -> i64 {
    (seconds * TICKS as f64).round() as i64
}

pub(crate) fn curve(easing: &Easing) -> [f64; 4] {
    match easing {
        Easing::Linear => [0., 0., 1., 1.],
        Easing::EaseIn => [0.42, 0., 1., 1.],
        Easing::EaseOut => [0., 0., 0.58, 1.],
        Easing::EaseInOut => [0.42, 0., 0.58, 1.],
        Easing::Overshoot => [0.34, 1.56, 0.64, 1.],
    }
}

pub(crate) fn animations(
    element: &PlacedElement,
    x: f64,
    y: f64,
    sx: f64,
    sy: f64,
    warnings: &mut Vec<String>,
) -> Value {
    let mut channels = serde_json::Map::new();
    for motion in &element.motions {
        let paths: Vec<(&str, f64, f64)> = match motion.property {
            MotionProperty::Opacity => vec![("opacity", 0., 1.)],
            MotionProperty::BackgroundOpacity => vec![("background.opacity", 0., 1.)],
            MotionProperty::Scale => {
                vec![("transform.scaleX", 0., sx), ("transform.scaleY", 0., sy)]
            }
            MotionProperty::ScaleX => vec![("transform.scaleX", 0., sx)],
            MotionProperty::ScaleY => vec![("transform.scaleY", 0., sy)],
            MotionProperty::X => vec![("transform.positionX", x, 1.)],
            MotionProperty::Y => vec![("transform.positionY", y, 1.)],
            MotionProperty::Rotation => vec![("transform.rotate", 0., 1.)],
            MotionProperty::StrokeReveal => vec![("params.strokeReveal", 0., 1.)],
            MotionProperty::Reveal => {
                warnings.push(format!("unsupported_motion:{}:reveal", element.instance_id));
                continue;
            }
        };
        for (path, offset, scale) in paths {
            let duration = element.end - element.start;
            let mut keys: Vec<Value> = motion.keys.iter().map(|k| json!({
                "id":id(), "time":ticks(k.time * duration), "value":offset + k.value * scale,
                "segmentToNext":"linear", "tangentMode":"broken"
            })).collect();
            for i in 0..keys.len().saturating_sub(1) {
                let a = &motion.keys[i];
                let b = &motion.keys[i + 1];
                let dt = ticks(b.time * duration) - ticks(a.time * duration);
                let dv = (b.value - a.value) * scale;
                let [x1, y1, x2, y2] = curve(&a.easing);
                if !matches!(a.easing, Easing::Linear) {
                    keys[i]["segmentToNext"] = json!("bezier");
                    keys[i]["rightHandle"] = json!({"dt":(dt as f64*x1).round() as i64,"dv":dv*y1});
                    keys[i + 1]["leftHandle"] =
                        json!({"dt":(dt as f64*(x2-1.)).round() as i64,"dv":dv*(y2-1.)});
                }
            }
            ensure_distinct_times(&mut keys);
            channels.insert(path.into(), json!({"keys":keys}));
        }
    }
    Value::Object(channels)
}

fn ensure_distinct_times(keys: &mut Vec<Value>) {
    // Rounding two normalized keys to the same tick must not create a zero-length segment.
    keys.dedup_by(|a, b| a["time"] == b["time"]);
}

pub fn supported_representation(representation: &Representation) -> bool {
    representation.is_visual_asset()
        || matches!(
            representation,
            Representation::Text
                | Representation::Rectangle
                | Representation::Line
                | Representation::Ellipse
                | Representation::Star
                | Representation::Audio
        )
}

fn compile_element(
    e: &PlacedElement,
    template: &Template,
    offset: f64,
    warnings: &mut Vec<String>,
) -> Result<Option<Value>> {
    let text = e.features.representation == Representation::Text;
    let graphic = matches!(
        e.features.representation,
        Representation::Rectangle
            | Representation::Line
            | Representation::Ellipse
            | Representation::Star
    );
    if !text && !graphic {
        warnings.push(format!(
            "unsupported_element:{}:{:?}",
            e.instance_id, e.features.representation
        ));
        return Ok(None);
    }
    ensure!(
        e.resource_id.is_none(),
        "procedural text/shape does not consume a media resource; use a media representation"
    );
    let style = e
        .style_id
        .as_ref()
        .and_then(|id| template.styles.iter().find(|s| &s.id == id));
    let width = template.canvas.width as f64;
    let height = template.canvas.height as f64;
    // Canvas text positions are alignment anchors, whereas template regions are boxes.
    let (padding_x, padding_y) = style
        .filter(|_| text)
        .filter(|s| s.background.is_some())
        .and_then(|s| s.background_padding.as_ref())
        .map(|p| (p.x, p.y))
        .unwrap_or((0., 0.));
    // Reserve the largest authored outline for the whole instance, including
    // pauses between active words, so highlighting cannot change line breaks.
    let base_outline = style.map(|s| s.stroke_width).unwrap_or(0.);
    let outline = if text {
        template
            .composition
            .applications
            .iter()
            .filter(|a| {
                a.enabled
                    && template
                        .composition
                        .members(&a.target)
                        .contains(&e.element_id.as_str())
            })
            .filter_map(|a| {
                template
                    .composition
                    .treatments
                    .iter()
                    .find(|t| t.id == a.treatment_id)
            })
            .filter_map(|t| match &t.operation {
                super::composition::TreatmentOperation::TextHighlight {
                    stroke: Some(stroke),
                    ..
                } => Some(stroke.width),
                _ => None,
            })
            .fold(base_outline, f64::max)
    } else {
        base_outline
    };
    let anchor_x = match style.filter(|_| text).map(|s| &s.text_align) {
        Some(TextAlignment::Left) => e.region.x * width + outline + padding_x,
        Some(TextAlignment::Right) => (e.region.x + e.region.width) * width - outline - padding_x,
        _ => (e.region.x + e.region.width / 2.) * width,
    };
    let x = anchor_x - width / 2.;
    let y = (e.region.y + e.region.height / 2. - 0.5) * height;
    // Graphics use the renderer's 512px source, fitted to the canvas before user scaling.
    let fit = width.min(height);
    let (sx, sy) = if graphic {
        (e.region.width * width / fit, e.region.height * height / fit)
    } else {
        (1., 1.)
    };
    let mut params = json!({"transform.positionX":x,"transform.positionY":y,
        "transform.scaleX":sx,"transform.scaleY":sy,"transform.rotate":0,"opacity":1,
        "template.instanceId":e.instance_id,"template.elementId":e.element_id});
    if text {
        let s = style.context("text instance requires a style")?;
        // Preserve the authored box in untransformed text-local pixels. The
        // renderer measures glyphs from anchor_x, not from the region center.
        params["template.textLayoutLeft"] = json!(e.region.x * width - anchor_x);
        params["template.textLayoutTop"] = json!(-e.region.height * height / 2.);
        params["template.textLayoutWidth"] = json!(e.region.width * width);
        params["template.textLayoutHeight"] = json!(e.region.height * height);
        params["content"] = json!(e.content);
        if let Some(range) = &e.keyword_range {
            params["text.highlightRange"] =
                json!(json!({"content":e.content,"start":range.start,"end":range.end}).to_string());
        }
        if !e.layout_ranges.is_empty() {
            params["text.layoutPhrases"] =
                json!(json!({"content":e.content,"ranges":e.layout_ranges}).to_string());
        }
        if !e.word_ranges.is_empty() {
            let windows: Vec<_> = e
                .word_ranges
                .iter()
                .map(|w| {
                    json!({
                        "start":w.start,"end":w.end,
                        "startTime":ticks(w.start_seconds)-ticks(e.start),
                        "endTime":ticks(w.end_seconds)-ticks(e.start)
                    })
                })
                .collect();
            params["text.wordTimings"] =
                json!(json!({"content":e.content,"windows":windows}).to_string());
        }
        // The existing renderer measures fontSize in units relative to a 90px-high canvas.
        params["fontSize"] = json!(s.font_size * 90. / height);
        params["fontFamily"] = json!(s.font_family);
        params["fontWeight"] = json!(s.weight.to_string());
        params["fontStyle"] = json!(if s.italic { "italic" } else { "normal" });
        params["textAlign"] = json!(s.text_align);
        params["color"] = json!(if e.features.outline {
            "#00000000"
        } else {
            &s.fill
        });
        params["lineHeight"] = json!(s.line_height);
        params["letterSpacing"] = json!(s.letter_spacing);
        ensure!(
            ((padding_x == 0. && outline <= base_outline)
                || e.region.width * width > (outline + padding_x) * 2.)
                && ((padding_y == 0. && outline <= base_outline)
                    || e.region.height * height > (outline + padding_y) * 2.),
            "text region has no room after stroke and background padding"
        );
        params["text.maxWidth"] =
            json!((e.region.width * width - (outline + padding_x) * 2.).max(1.));
        params["text.maxHeight"] =
            json!((e.region.height * height - (outline + padding_y) * 2.).max(1.));
        params["text.maxLines"] = json!(s.max_lines);
        params["background.enabled"] = json!(s.background.is_some());
        params["background.opacity"] = json!(s.background_opacity.unwrap_or(1.));
        if let Some(radius) = s.background_corner_radius {
            params["background.cornerRadius"] = json!(radius);
        }
        params["background.color"] = json!(s.background.as_deref().unwrap_or("#000000"));
        // The renderer multiplies padding by its fontSize / 15; normalize design pixels.
        params["background.paddingX"] = json!(padding_x * height / (s.font_size * 6.));
        params["background.paddingY"] = json!(padding_y * height / (s.font_size * 6.));
        params["geometry.stroke.width"] = json!(s.stroke_width);
        params["geometry.stroke.color"] = json!(s.stroke);
        if let Some(shadow) = &s.shadow {
            params["geometry.shadow.enabled"] = json!(true);
            params["geometry.shadow.color"] = json!(format!(
                "{}{:02x}",
                shadow.color,
                (shadow.opacity * 255.).round() as u8
            ));
            params["geometry.shadow.blur"] = json!(shadow.blur);
            params["geometry.shadow.offsetX"] = json!(shadow.x);
            params["geometry.shadow.offsetY"] = json!(shadow.y);
        }
    } else {
        let outline = e.features.outline;
        if let Some(rectangle) = &e.rectangle_geometry {
            params["cornerRadius"] = json!(rectangle.corner_radius);
            // The graphic source is square. Preserve the mapped design rectangle's
            // aspect so its circular corners survive the existing source fitting.
            // Authored scale_x/y motions remain independent deformations.
            params["rectangleAspectRatio"] =
                json!(e.region.width * width / (e.region.height * height));
        }
        if e.features.representation == Representation::Star {
            let star = e.star_geometry.clone().unwrap_or_default();
            params["points"] = json!(star.points);
            params["depth"] = json!(star.depth);
        }
        if e.ellipse_arc.is_some()
            || e.motions.iter().any(|m| m.property == MotionProperty::StrokeReveal)
            || template.composition.applications.iter().any(|application| {
                application.enabled
                    && matches!(&application.target, super::composition::Target::Element(id) if id == &e.element_id)
                    && template.composition.treatments.iter().any(|treatment| {
                        treatment.id == application.treatment_id
                            && matches!(&treatment.operation, super::composition::TreatmentOperation::Motion { channels, .. }
                                if channels.iter().any(|motion| motion.property == MotionProperty::StrokeReveal))
                    })
            })
        {
            let arc = e.ellipse_arc.clone().unwrap_or_default();
            params["arcStart"] = json!(arc.start_degrees);
            params["arcSweep"] = json!(arc.sweep_degrees);
            params["strokeCap"] = json!(arc.cap);
            params["strokeReveal"] = json!(1.);
        }
        if let Some(grid) = style.and_then(|s| s.grid.as_ref()) {
            params["gridEnabled"] = json!(true);
            params["gridSpacing"] = json!(grid.spacing);
            params["gridWidth"] = json!(grid.width);
            params["gridColor"] = json!(grid.color);
        }
        params["fill"] = json!(if outline {
            "#00000000"
        } else {
            style.map(|s| s.fill.as_str()).unwrap_or("#000000")
        });
        params["stroke"] = json!(style.map(|s| s.stroke.as_str()).unwrap_or("#ffffff"));
        params["strokeWidth"] = json!(if outline {
            style.map(|s| s.stroke_width).unwrap_or(2.)
        } else {
            0.
        });
    }
    let mut element = json!({"id":id(),"type":if text {"text"} else {"graphic"},
        "name":format!("{} / {}", template.name, e.instance_id),
        "startTime":ticks(offset+e.start),"duration":ticks(e.end)-ticks(e.start),
        "trimStart":0,"trimEnd":0,"hidden":false,"params":params,
        "animations":animations(e,x,y,sx,sy,warnings)});
    if graphic {
        element["definitionId"] = json!(if e.features.representation == Representation::Ellipse {
            "ellipse"
        } else if e.features.representation == Representation::Star {
            "star"
        } else {
            "rectangle"
        });
    }
    Ok(Some(element))
}

/// Produces a project document for the existing project's CAS writer; never writes a second project file.
pub fn compile(request: CompileInput) -> Result<Value> {
    compile_with_audio(request, &BTreeMap::new())
}

pub fn compile_with_audio(
    mut request: CompileInput,
    sounds: &BTreeMap<String, AudioAsset>,
) -> Result<Value> {
    ensure!(
        valid_id(&request.idempotency_key),
        "invalid idempotency key"
    );
    ensure!(
        request.start_time_seconds.is_finite()
            && (0.0..=86400.0).contains(&request.start_time_seconds),
        "invalid timeline offset"
    );
    let mut payload = json!({"input":request.input.hash_input()?,"sceneId":request.scene_id,"offset":request.start_time_seconds});
    request.input.template = request.input.resolved_template()?;
    request.input.resource_bindings.clear();
    if let Some(source) = &request.source {
        payload["source"] = serde_json::to_value(source)?;
    }
    if !sounds.is_empty() {
        payload["audioSources"] = serde_json::to_value(sounds)?;
    }
    let visuals = visual_compile::resolve(
        &mut request.input.template,
        &request.visual_bindings,
        &request.media,
    )?;
    if !visuals.is_empty() {
        payload["visualSources"] = serde_json::to_value(&visuals)?;
    }
    let hash = format!("{:x}", Sha256::digest(serde_json::to_vec(&payload)?));
    let doc = &mut request.document;
    ensure!(doc["version"] == 31, "unsupported project version");
    let scenes = doc["scenes"]
        .as_array()
        .context("project scenes required")?;
    let index = scenes
        .iter()
        .position(|s| s["id"] == request.scene_id)
        .context("scene not found")?;
    let existing: Vec<&Value> = scenes[index]["tracks"]["overlay"]
        .as_array()
        .context("overlay tracks required")?
        .iter()
        .chain(std::iter::once(&scenes[index]["tracks"]["main"]))
        .chain(
            scenes[index]["tracks"]["audio"]
                .as_array()
                .into_iter()
                .flatten(),
        )
        .flat_map(|t| t["elements"].as_array().into_iter().flatten())
        .filter(|e| e["params"]["template.applicationKey"] == request.idempotency_key)
        .collect();
    if !existing.is_empty() {
        ensure!(
            existing
                .iter()
                .all(|e| e["params"]["template.requestHash"] == hash),
            "idempotency key reused with different payload"
        );
        let expected = existing[0]["params"]["template.applicationCount"]
            .as_u64()
            .context("invalid application receipt")?;
        ensure!(
            existing.len() as u64 == expected,
            "template application modified; inspect project before reapplying"
        );
        let exit_sampling = super::exit_sampling::diagnose(doc, &request.scene_id)?;
        let mut warnings = vec![];
        super::exit_sampling::append_warnings(&exit_sampling, &mut warnings);
        return Ok(
            json!({"deduplicated":true,"document":doc,"elementCount":expected,"warnings":warnings,"exitSampling":exit_sampling}),
        );
    }
    ensure!(
        doc["revision"].as_u64().unwrap_or(0) == request.base_revision,
        "revision_conflict"
    );
    let t = &request.input.template;
    ensure!(
        doc["settings"]["canvasSize"]["width"] == t.canvas.width
            && doc["settings"]["canvasSize"]["height"] == t.canvas.height,
        "project canvas must match template canvas"
    );
    let plan: EditPlan = rhythm::plan(request.input.clone())?;
    for e in &plan.elements {
        ensure!(
            supported_representation(&e.features.representation),
            "unsupported representation in {}",
            e.element_id
        );
        ensure!(
            !e.motions
                .iter()
                .any(|m| matches!(m.property, MotionProperty::Reveal)),
            "unsupported reveal motion in {}",
            e.element_id
        );
    }
    let mut warnings = plan.warnings.clone();
    let mut lanes: BTreeMap<(i32, String), Vec<Value>> = BTreeMap::new();
    let mut count = 0;
    let mut source_replacements = vec![];
    let mut source_index = None;
    let mut source_audio = None;
    if let Some(source_ref) = &request.source {
        let main = &doc["scenes"][index]["tracks"]["main"];
        ensure!(
            main["id"] == source_ref.track_id,
            "layout source must be on the main video track"
        );
        ensure!(
            main["locked"] != true && main["hidden"] != true,
            "source track is locked or hidden"
        );
        let elements = main["elements"]
            .as_array()
            .context("main elements required")?;
        let at = elements
            .iter()
            .position(|e| e["id"] == source_ref.element_id)
            .context("source element not found")?;
        let source = &elements[at];
        let media_id = source["mediaId"]
            .as_str()
            .context("source media required")?;
        let mut compiled = source_layout::compile(
            source,
            source_ref.focal_point.as_ref(),
            &request.media[media_id],
            t,
            &plan,
            request.start_time_seconds,
            &visuals,
            &mut warnings,
        )?;
        source_replacements = compiled.replacements;
        source_index = Some(at);
        count += source_replacements.len() + compiled.overlays.len();
        if let Some(audio) = compiled.audio {
            count += 1;
            source_audio = Some((audio, main["muted"] == true, main["solo"] == true));
        }
        if !compiled.overlays.is_empty() {
            for element in &mut compiled.overlays {
                super::treatments::apply(element, t)?;
            }
            lanes.insert((i32::MIN, "source-layout".into()), compiled.overlays);
        }
    } else {
        for l in &plan.layouts {
            warnings.push(format!("source_layout_not_applied:{}", l.layout_id));
        }
    }
    for sound in &plan.sounds {
        let asset = sounds
            .get(&sound.sound_id)
            .context("sound asset must be resolved by native catalog")?;
        let audio =
            audio_compile::compile(sound, asset, request.start_time_seconds, &mut warnings)?;
        count += audio.len();
        lanes
            .entry((sound.z, sound.element_id.clone()))
            .or_default()
            .extend(audio);
    }
    for placed in &plan.elements {
        let visual = if placed.features.representation.is_visual_asset() {
            let asset = placed
                .resource_id
                .as_ref()
                .and_then(|id| visuals.get(id))
                .context("visual element requires a bound project media resource")?;
            Some(visual_compile::compile(
                placed,
                t,
                asset,
                request.start_time_seconds,
                &mut warnings,
            )?)
        } else {
            compile_element(placed, t, request.start_time_seconds, &mut warnings)?
        };
        if let Some(mut element) = visual {
            super::exit_sampling::annotate(
                &mut element,
                t.elements
                    .iter()
                    .find(|e| e.id == placed.element_id)
                    .and_then(|e| e.motion_timing.as_ref()),
                "element",
            )?;
            super::treatments::apply(&mut element, t)?;
            ensure!(
                element["duration"].as_i64().unwrap_or(0) > 0,
                "element shorter than one timeline tick"
            );
            element["params"]["template.applicationKey"] = json!(request.idempotency_key);
            element["params"]["template.requestHash"] = json!(hash);
            lanes
                .entry((placed.z, placed.element_id.clone()))
                .or_default()
                .push(element);
            count += 1;
        }
    }
    ensure!(count > 0, "no supported elements to apply");
    let mut tracks = vec![];
    let mut audio_tracks = vec![];
    if let Some((mut audio, muted, solo)) = source_audio {
        audio["params"]["template.applicationKey"] = json!(request.idempotency_key);
        audio["params"]["template.requestHash"] = json!(hash);
        audio["params"]["template.applicationCount"] = json!(count);
        audio_tracks.push(
            json!({"id":id(),"name":format!("{} / original audio",t.name),
            "type":"audio","muted":muted,"solo":solo,"elements":[audio]}),
        );
    }
    for ((_, name), mut elements) in lanes.into_iter().rev() {
        elements.sort_by_key(|e| e["startTime"].as_i64().unwrap_or(0));
        let mut partitions: Vec<Vec<Value>> = vec![];
        for mut element in elements {
            element["params"]["template.applicationKey"] = json!(request.idempotency_key);
            element["params"]["template.requestHash"] = json!(hash);
            element["params"]["template.applicationCount"] = json!(count);
            let start = element["startTime"].as_i64().unwrap();
            let lane = partitions.iter_mut().find(|p| {
                p.last().is_none_or(|last| {
                    last["startTime"].as_i64().unwrap() + last["duration"].as_i64().unwrap()
                        <= start
                })
            });
            if let Some(lane) = lane {
                lane.push(element);
            } else {
                partitions.push(vec![element]);
            }
        }
        for elements in partitions {
            let audio = elements[0]["type"] == "audio";
            let track_type = match elements[0]["type"].as_str().unwrap_or("") {
                "image" => "video",
                "sticker" => "graphic",
                kind => kind,
            };
            let mut track = json!({"id":id(),"name":format!("{} / {}",t.name,name),
                "type":track_type,"hidden":false,"elements":elements});
            if audio || track_type == "video" {
                track["muted"] = json!(false);
            }
            if audio {
                audio_tracks.push(track);
            } else {
                tracks.push(track);
            }
        }
    }
    for element in &mut source_replacements {
        super::treatments::apply(element, t)?;
        element["params"]["template.applicationKey"] = json!(request.idempotency_key);
        element["params"]["template.requestHash"] = json!(hash);
        element["params"]["template.applicationCount"] = json!(count);
    }
    super::relationships::follow(&mut tracks, t)?;
    let is_group = |id: &str| plan.groups.iter().any(|g| g.instance_id == id);
    let mut children_plan = plan.clone();
    children_plan
        .element_transitions
        .retain(|p| !is_group(&p.from_instance_id) && !is_group(&p.to_instance_id));
    super::treatments::transitions(
        &mut tracks,
        &mut source_replacements,
        t,
        &children_plan,
        request.start_time_seconds,
    )?;
    super::relationships::pack(&mut tracks, t, &plan, request.start_time_seconds)?;
    let mut group_plan = plan.clone();
    group_plan.transitions.clear();
    group_plan
        .element_transitions
        .retain(|p| is_group(&p.from_instance_id) || is_group(&p.to_instance_id));
    super::treatments::transitions(
        &mut tracks,
        &mut source_replacements,
        t,
        &group_plan,
        request.start_time_seconds,
    )?;
    super::rigid_transform::pack(&mut tracks, t)?;
    super::relationships::text_attachments(&mut tracks, t)?;
    count = source_replacements.len()
        + tracks
            .iter()
            .chain(audio_tracks.iter())
            .map(|t| t["elements"].as_array().unwrap().len())
            .sum::<usize>();
    for e in tracks
        .iter_mut()
        .chain(audio_tracks.iter_mut())
        .flat_map(|t| t["elements"].as_array_mut().unwrap())
        .chain(source_replacements.iter_mut())
    {
        e["params"]["template.applicationKey"] = json!(request.idempotency_key);
        e["params"]["template.requestHash"] = json!(hash);
        e["params"]["template.applicationCount"] = json!(count);
    }
    if let Some(at) = source_index {
        for element in &mut source_replacements {
            element["params"]["template.applicationKey"] = json!(request.idempotency_key);
            element["params"]["template.requestHash"] = json!(hash);
            element["params"]["template.applicationCount"] = json!(count);
        }
        doc["scenes"][index]["tracks"]["main"]["elements"]
            .as_array_mut()
            .unwrap()
            .splice(at..=at, source_replacements);
    }
    let overlay = doc["scenes"][index]["tracks"]["overlay"]
        .as_array_mut()
        .unwrap();
    tracks.append(overlay);
    *overlay = tracks;
    if !audio_tracks.is_empty() {
        let target = &mut doc["scenes"][index]["tracks"]["audio"];
        if target.is_null() {
            *target = json!([]);
        }
        target
            .as_array_mut()
            .context("audio tracks must be an array")?
            .extend(audio_tracks);
    }
    let scenes = doc["scenes"].as_array().unwrap();
    let main = scenes
        .iter()
        .find(|s| s["isMain"] == true)
        .unwrap_or(&scenes[0]);
    let mut duration = 0;
    for track in main["tracks"]["overlay"]
        .as_array()
        .into_iter()
        .flatten()
        .chain(std::iter::once(&main["tracks"]["main"]))
        .chain(main["tracks"]["audio"].as_array().into_iter().flatten())
    {
        for e in track["elements"].as_array().into_iter().flatten() {
            duration = duration
                .max(e["startTime"].as_i64().unwrap_or(0) + e["duration"].as_i64().unwrap_or(0));
        }
    }
    if doc["metadata"].is_null() {
        doc["metadata"] = json!({});
    }
    doc["metadata"]["duration"] = json!(duration);
    let exit_sampling = super::exit_sampling::diagnose(doc, &request.scene_id)?;
    super::exit_sampling::append_warnings(&exit_sampling, &mut warnings);
    warnings.sort();
    ensure!(
        !warnings.iter().any(|w| w.starts_with("unsupported_")),
        "unsupported execution: {}",
        warnings
            .iter()
            .filter(|w| w.starts_with("unsupported_"))
            .cloned()
            .collect::<Vec<_>>()
            .join(", ")
    );
    warnings.dedup();
    Ok(
        json!({"document":doc,"plan":plan,"elementCount":count,"deduplicated":false,"warnings":warnings,"exitSampling":exit_sampling}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn text_alignment_anchors_and_motion_stay_inside_the_template_region() {
        let mut template = request().input.template;
        template.canvas.width = 1000;
        let style_id = template.styles[0].id.clone();
        template.styles[0].stroke_width = 2.;
        let element = PlacedElement {
            instance_id: "aligned".into(),
            element_id: "aligned".into(),
            features: template.elements[0].features.clone(),
            ellipse_arc: None,
            star_geometry: None,
            rectangle_geometry: None,
            content: "Alignment".into(),
            keyword_range: None,
            layout_ranges: vec![],
            word_ranges: vec![],
            start: 0.,
            end: 2.,
            region: Rect {
                x: 0.1,
                y: 0.2,
                width: 0.6,
                height: 0.2,
            },
            style_id: Some(style_id),
            resource_id: None,
            motions: vec![Motion {
                property: MotionProperty::X,
                keys: vec![
                    MotionKey {
                        time: 0.,
                        value: 0.,
                        easing: Easing::Linear,
                    },
                    MotionKey {
                        time: 1.,
                        value: 20.,
                        easing: Easing::Linear,
                    },
                ],
            }],
            z: 1,
        };
        for (alignment, expected) in [
            (TextAlignment::Left, -398.),
            (TextAlignment::Center, -100.),
            (TextAlignment::Right, 198.),
        ] {
            template.styles[0].text_align = alignment;
            let mut text = element.clone();
            text.features.representation = Representation::Text;
            let compiled = compile_element(&text, &template, 0., &mut vec![])
                .unwrap()
                .unwrap();
            assert_eq!(compiled["params"]["transform.positionX"], expected);
            assert_eq!(compiled["params"]["text.maxWidth"], 596.);
            assert_eq!(
                compiled["params"]["template.textLayoutLeft"],
                100. - (expected + 500.)
            );
            assert_eq!(compiled["params"]["template.textLayoutWidth"], 600.);
            assert_eq!(
                compiled["params"]["template.textLayoutTop"],
                -0.1 * template.canvas.height as f64
            );
            assert_eq!(
                compiled["params"]["template.textLayoutHeight"],
                0.2 * template.canvas.height as f64
            );
            let keys = &compiled["animations"]["transform.positionX"]["keys"];
            assert_eq!(keys[0]["value"], expected);
            assert_eq!(keys[1]["value"], expected + 20.);
            text.features.representation = Representation::Rectangle;
            let graphic = compile_element(&text, &template, 0., &mut vec![])
                .unwrap()
                .unwrap();
            assert_eq!(graphic["params"]["transform.positionX"], -100.);
            assert!(graphic["params"].get("template.textLayoutLeft").is_none());
        }
        template.styles[0].text_align = TextAlignment::Left;
        template.styles[0].background = Some("#000000".into());
        template.styles[0].background_padding =
            Some(serde_json::from_value(json!({"x":12.,"y":8.})).unwrap());
        let mut text = element.clone();
        text.features.representation = Representation::Text;
        let compiled = compile_element(&text, &template, 0., &mut vec![])
            .unwrap()
            .unwrap();
        assert_eq!(compiled["params"]["template.textLayoutLeft"], -14.);
        assert_eq!(compiled["params"]["template.textLayoutWidth"], 600.);
    }

    #[test]
    fn role_representation_motion_and_asset_features_compose_in_the_actual_compiler() {
        for role in [
            Role::Title,
            Role::Emphasis,
            Role::Annotation,
            Role::Background,
        ] {
            let mut r = request();
            let t = &mut r.input.template;
            let mut text = t.elements[0].clone();
            text.id = "text".into();
            text.features.role = Some(role.clone());
            text.features.accent = false;
            text.binding = Binding::Literal;
            text.literal = Some("Shared meaning".into());
            text.intents.clear();
            text.exclusive_group = None;
            text.timing.anchor = Anchor::CueStart;
            text.motions = vec![Motion {
                property: MotionProperty::Opacity,
                keys: vec![
                    MotionKey {
                        time: 0.,
                        value: 0.,
                        easing: Easing::Linear,
                    },
                    MotionKey {
                        time: 1.,
                        value: 1.,
                        easing: Easing::Linear,
                    },
                ],
            }];
            let mut picture = text.clone();
            picture.id = "picture".into();
            picture.features.representation = Representation::Image;
            picture.features.media_use = Some(MediaUse::Icon);
            picture.resource_id = Some("picture".into());
            let mut sound = text.clone();
            sound.id = "sound".into();
            sound.features.representation = Representation::Audio;
            sound.features.media_use = Some(MediaUse::SoundEffect);
            sound.resource_id = Some("sound".into());
            sound.motions.clear();
            sound.timing.max_seconds = 0.2;
            sound.timing.min_seconds = 0.;
            t.elements = vec![text, picture, sound];
            t.resource_slots = vec![
                ResourceSlot {
                    id: "picture".into(),
                    representation: Representation::Image,
                    description: "image".into(),
                    tags: vec![],
                },
                ResourceSlot {
                    id: "sound".into(),
                    representation: Representation::Audio,
                    description: "audio".into(),
                    tags: vec![],
                },
            ];
            t.resource_bindings.clear();
            t.bind("sound", "click");
            for l in &mut t.layouts {
                l.safe_regions.clear();
            }
            // Serialization is the same path as persistence; no legacy kind can be reintroduced.
            let serialized = serde_json::to_value(&t).unwrap();
            assert!(serialized["elements"][0].get("kind").is_none());
            r.input.template = serde_json::from_value(serialized).unwrap();
            r.visual_bindings =
                serde_json::from_value(json!([{"resourceId":"picture","mediaId":"image"}]))
                    .unwrap();
            r.media = json!({"image":{"id":"image","type":"image","width":400,"height":400}});
            let sounds = BTreeMap::from([(
                "click".into(),
                AudioAsset {
                    sha256: "a".repeat(64),
                    duration_seconds: 0.3,
                },
            )]);
            let out = compile_with_audio(r.clone(), &sounds).unwrap();
            assert_eq!(out["elementCount"], 3);
            let plan = &out["plan"];
            assert_eq!(plan["sounds"].as_array().unwrap().len(), 1);
            assert_eq!(plan["sounds"][0]["role"], json!(role));
            assert_eq!(plan["elements"].as_array().unwrap().len(), 2);
            assert!(
                plan["elements"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .all(|e| e["features"]["role"] == json!(role))
            );
            r.document = out["document"].clone();
            assert_eq!(
                compile_with_audio(r, &sounds).unwrap()["deduplicated"],
                true
            );
        }
    }
    #[test]
    fn exit_sampling_compile_and_dedup_preserve_diagnostics() {
        let mut req = request();
        req.document["settings"]["fps"] = json!({"numerator":30,"denominator":1});
        let timing = MotionTiming {
            coverage: Some(MotionCoverage {
                min_exit_frames: 1,
                min_post_frames: 1,
            }),
            enter_end: 0.2,
            exit_start: 0.8,
            enter_seconds: 0.1,
            exit_seconds: 0.1,
        };
        req.input.template.elements[0].motion_timing = Some(timing);
        let first = compile(req.clone()).unwrap();
        assert!(
            !first["exitSampling"]["records"]
                .as_array()
                .unwrap()
                .is_empty()
        );
        assert_eq!(first["exitSampling"]["basis"], "predicted_frame_sampling");
        req.document = first["document"].clone();
        let again = compile(req).unwrap();
        assert_eq!(again["deduplicated"], true);
        assert_eq!(again["exitSampling"], first["exitSampling"]);
    }

    fn request() -> CompileInput {
        let t = super::super::seed::templates().unwrap().remove(2);
        CompileInput {
            document: json!({"version":31,"revision":3,"settings":{"canvasSize":{
            "width":t.canvas.width,"height":t.canvas.height}},"scenes":[{"id":"scene","tracks":{"overlay":[],"main":{"elements":[{"id":"human-video"}]}}}]}),
            input: PlanInput {
                events: vec![],
                sound_events: vec![],
                template: t,
                words: vec![rhythm::Word {
                    text: "内容价值".into(),
                    start: 0.2,
                    end: 1.2,
                    speaker: None,
                    emphasis: 0.8,
                }],
                duration_seconds: 2.,
                title: "信任".into(),
                translations: vec![],
                semantic_units: vec![],
                caption_spans: vec![],
                layout_phrases: vec![],
                caption_policy: None,
                receipt_input: None,
                resource_bindings: vec![],
                quiet_gap_seconds: None,
            },
            scene_id: "scene".into(),
            base_revision: 3,
            idempotency_key: "apply-test".into(),
            start_time_seconds: 4.,
            source: None,
            media: Value::Null,
            visual_bindings: vec![],
        }
    }
    #[test]
    fn phase_timing_uses_final_lifecycle_bounds_for_text_and_shapes() {
        for representation in [Representation::Text, Representation::Rectangle] {
            let mut request = request();
            let mut template =
                super::super::element_edit::create(super::super::element_edit::Create {
                    name: "Clock".into(),
                    canvas: request.input.template.canvas.clone(),
                })
                .unwrap();
            let element = &mut template.elements[0];
            element.features.representation = representation;
            element.binding = Binding::Literal;
            element.literal = Some("Clock".into());
            element.timing.anchor = Anchor::VideoStart;
            element.timing.max_seconds = 600.;
            template = super::super::element_edit::apply_envelope(
                super::super::element_edit::ApplyEnvelope {
                    template,
                    element_id: "caption".into(),
                    entrance: super::super::element_edit::Entrance::Pop,
                    enter_seconds: 0.2,
                    exit_seconds: 0.15,
                },
            )
            .unwrap();
            template.composition.lifecycles = serde_json::from_value(
                json!([{"elementId":"caption","startEventId":"bounds","endEventId":"bounds"}]),
            )
            .unwrap();
            request.input.template = template;
            request.input.duration_seconds = 4.;
            request.input.events=serde_json::from_value(json!([{"id":"bounds","kind":"section","start":0.5,"end":3.5,"strength":1,"confidence":1,"sourceId":"test","evidence":"Test lifecycle"}])).unwrap();
            let result = compile(request).unwrap();
            let clip = &result["document"]["scenes"][0]["tracks"]["overlay"][0]["elements"][0];
            assert_eq!(clip["startTime"], ticks(4.5));
            assert_eq!(clip["duration"], ticks(3.));
            let times: Vec<_> = clip["animations"]["opacity"]["keys"]
                .as_array()
                .unwrap()
                .iter()
                .map(|key| key["time"].as_i64().unwrap())
                .collect();
            assert_eq!(times, vec![0, ticks(0.2), ticks(2.85), ticks(3.)]);
            assert_eq!(
                clip["animations"]["transform.scaleX"]["keys"][1]["time"],
                ticks(0.2)
            );
        }
    }
    #[test]
    fn visual_resources_compile_and_replay_with_catalog_identity() {
        let mut request = request();
        let mut element = request.input.template.elements[0].clone();
        element.features.representation = Representation::Image;
        element.features.media_use = Some(MediaUse::Icon);
        element.resource_id = Some("badge".into());
        element.motions = serde_json::from_value(json!([{"property":"scale","keys":[
            {"time":0,"value":0.5,"easing":"ease_out"},
            {"time":0.2,"value":1,"easing":"linear"}
        ]}]))
        .unwrap();
        element.region = Rect {
            x: 0.1,
            y: 0.2,
            width: 0.2,
            height: 0.2,
        };
        element.intents.clear();
        element.exclusive_group = None;
        request.input.template.elements = vec![element];
        request.input.template.resource_slots = vec![ResourceSlot {
            id: "badge".into(),
            representation: Representation::Image,
            description: "Icon slot".into(),
            tags: vec![],
        }];
        for layout in &mut request.input.template.layouts {
            layout.safe_regions.clear();
        }
        request.visual_bindings =
            serde_json::from_value(json!([{"resourceId":"badge","mediaId":"badge-image"}]))
                .unwrap();
        request.media = json!({"badge-image":{"id":"badge-image","type":"image","width":400,"height":200,"size":100,"lastModified":1}});
        let result = compile(request.clone()).unwrap();
        assert_eq!(result["elementCount"], 1);
        let image = &result["document"]["scenes"][0]["tracks"]["overlay"][0]["elements"][0];
        assert_eq!(image["type"], "image");
        assert_eq!(image["mediaId"], "badge-image");
        assert_eq!(image["startTime"], ticks(4.));
        assert!((image["params"]["transform.scaleX"].as_f64().unwrap() - 0.2).abs() < 1e-8);
        assert!(!image["animations"].as_object().unwrap().is_empty());
        assert!(
            (image["animations"]["transform.scaleX"]["keys"][0]["value"]
                .as_f64()
                .unwrap()
                - 0.1)
                .abs()
                < 1e-8
        );
        let mut replay = request.clone();
        replay.document = result["document"].clone();
        assert_eq!(compile(replay.clone()).unwrap()["deduplicated"], true);
        replay.media["badge-image"]["size"] = json!(101);
        assert!(compile(replay).is_err());
        request.media["badge-image"]["type"] = json!("audio");
        assert!(compile(request).is_err());
    }

    #[test]
    fn broll_rejects_short_sources_and_preserves_muted_source_interval() {
        let mut request = request();
        let mut element = request.input.template.elements[0].clone();
        element.features.representation = Representation::VisualMedia;
        element.features.media_use = Some(MediaUse::Broll);
        element.resource_id = Some("cutaway".into());
        element.intents.clear();
        element.exclusive_group = None;
        request.input.template.elements = vec![element];
        request.input.template.resource_slots = vec![ResourceSlot {
            id: "cutaway".into(),
            representation: Representation::VisualMedia,
            description: "Cutaway".into(),
            tags: vec![],
        }];
        for layout in &mut request.input.template.layouts {
            layout.safe_regions.clear();
        }
        request.visual_bindings = serde_json::from_value(json!([{"resourceId":"cutaway","mediaId":"video","sourceStartSeconds":2,"fit":"cover"}])).unwrap();
        request.media =
            json!({"video":{"id":"video","type":"video","width":1920,"height":1080,"duration":3}});
        assert!(compile(request.clone()).is_err());
        request.visual_bindings[0].source_start_seconds = 0.5;
        let result = compile(request.clone()).unwrap();
        let clip = &result["document"]["scenes"][0]["tracks"]["overlay"][0]["elements"][0];
        assert_eq!(clip["isSourceAudioEnabled"], false);
        assert_eq!(clip["params"]["muted"], true);
        assert_eq!(clip["trimStart"], ticks(0.5));
        assert_eq!(clip["trimEnd"], ticks(0.5));
        assert_eq!(clip["masks"][0]["type"], "rectangle");
        request
            .visual_bindings
            .push(request.visual_bindings[0].clone());
        assert!(compile(request).is_err());
    }

    #[test]
    fn sound_tracks_preserve_human_audio_and_participate_in_application_receipts() {
        let mut request = request();
        request.document["scenes"][0]["tracks"]["audio"] =
            json!([{"id":"human-audio","elements":[]}]);
        request.input.template.bind("music", "verified-music");
        let mut assets = BTreeMap::new();
        assets.insert(
            "verified-music".into(),
            AudioAsset {
                sha256: "a".repeat(64),
                duration_seconds: 0.75,
            },
        );
        let result = compile_with_audio(request.clone(), &assets).unwrap();
        let audio = &result["document"]["scenes"][0]["tracks"]["audio"];
        assert_eq!(audio[0]["id"], "human-audio");
        assert_eq!(audio[1]["muted"], false);
        assert_eq!(audio[1]["elements"].as_array().unwrap().len(), 3);
        assert_eq!(audio[1]["elements"][0]["sourceType"], "library");
        request.document = result["document"].clone();
        assert_eq!(
            compile_with_audio(request.clone(), &assets).unwrap()["deduplicated"],
            true
        );
        let mut changed_assets = assets.clone();
        changed_assets.get_mut("verified-music").unwrap().sha256 = "b".repeat(64);
        assert!(
            compile_with_audio(request.clone(), &changed_assets)
                .unwrap_err()
                .to_string()
                .contains("different payload")
        );
        request.document["scenes"][0]["tracks"]["audio"][1]["elements"]
            .as_array_mut()
            .unwrap()
            .pop();
        assert!(
            compile_with_audio(request, &assets)
                .unwrap_err()
                .to_string()
                .contains("modified")
        );
    }
    #[test]
    fn preserves_human_tracks_and_replays_without_duplicate_elements() {
        let mut request = request();
        let compiled = compile(request.clone()).unwrap();
        assert_eq!(
            compiled["document"]["scenes"][0]["tracks"]["main"]["elements"][0]["id"],
            "human-video"
        );
        assert!(compiled["elementCount"].as_u64().unwrap() > 0);
        let first = &compiled["document"]["scenes"][0]["tracks"]["overlay"][0]["elements"][0];
        assert!(first["startTime"].as_i64().unwrap() >= ticks(4.));
        assert!(first["params"]["fontSize"].as_f64().unwrap() < 10.);
        assert!(first["params"]["text.maxLines"].as_u64().unwrap() >= 1);
        request.document = compiled["document"].clone();
        request.document["revision"] = json!(4);
        assert_eq!(compile(request.clone()).unwrap()["deduplicated"], true);
        request.input.title = "Changed".into();
        assert!(
            compile(request)
                .unwrap_err()
                .to_string()
                .contains("different payload")
        );
    }
    #[test]
    fn rejects_stale_revision_and_mismatched_canvas() {
        let mut r = request();
        r.base_revision = 2;
        assert!(
            compile(r)
                .unwrap_err()
                .to_string()
                .contains("revision_conflict")
        );
        let mut r = request();
        r.document["settings"]["canvasSize"]["width"] = json!(42);
        assert!(compile(r).unwrap_err().to_string().contains("canvas"));
    }
    #[test]
    fn secondary_views_follow_layouts_without_restarting_video_or_duplicating_audio() {
        let mut r = request();
        r.start_time_seconds = 0.;
        r.input.words = [(0.1, 0.4), (0.5, 0.8), (1.0, 1.3), (1.5, 1.9)]
            .into_iter()
            .map(|(start, end)| rhythm::Word {
                text: "内容".into(),
                start,
                end,
                speaker: None,
                emphasis: 0.,
            })
            .collect();
        let intents = [
            Intent::Neutral,
            Intent::List,
            Intent::Explanation,
            Intent::Conclusion,
        ];
        r.input.semantic_units = intents
            .iter()
            .enumerate()
            .map(|(i, intent)| rhythm::SemanticUnit {
                start_word: i,
                end_word: i + 1,
                intent: intent.clone(),
                keyword: None,
                rationale: "semantic layout test".into(),
            })
            .collect();
        let prototype = r.input.template.layouts[0].clone();
        r.input.template.layouts = intents
            .iter()
            .enumerate()
            .map(|(i, intent)| {
                let mut l = prototype.clone();
                l.id = format!("test-{i}");
                l.intents = vec![intent.clone()];
                l.safe_regions.clear();
                l.mode = if i == 1 {
                    LayoutMode::Split
                } else if i == 3 {
                    LayoutMode::PictureInPicture
                } else {
                    LayoutMode::FullBleed
                };
                l.video_region = Rect {
                    x: 0.,
                    y: 0.,
                    width: if i == 1 { 0.48 } else { 1. },
                    height: 1.,
                };
                l.secondary = if i == 1 || i == 3 {
                    Some(SecondaryView {
                        resource_id: "second".into(),
                        region: Rect {
                            x: 0.52,
                            y: 0.1,
                            width: 0.48,
                            height: 0.4,
                        },
                    })
                } else {
                    None
                };
                l
            })
            .collect();
        r.input.template.resource_slots.push(ResourceSlot {
            id: "second".into(),
            representation: Representation::VisualMedia,
            description: "Second camera".into(),
            tags: vec![],
        });
        r.visual_bindings=serde_json::from_value(json!([{"resourceId":"second","mediaId":"second-video","sourceStartSeconds":0.2,"fit":"cover"}])).unwrap();
        r.source = Some(SourceRef {
            track_id: "main".into(),
            element_id: "voice".into(),
            focal_point: None,
        });
        r.media = json!({"voice-video":{"id":"voice-video","width":1080,"height":1440,"duration":5.},"second-video":{"id":"second-video","type":"video","width":1920,"height":1080,"duration":3.}});
        r.document["scenes"][0]["tracks"]["main"] = json!({"id":"main","type":"video","elements":[{
            "id":"voice","type":"video","mediaId":"voice-video","startTime":0,"duration":ticks(2.),"trimStart":ticks(1.),"trimEnd":ticks(2.),"params":{"volume":-6},"isSourceAudioEnabled":true
        }]});
        let result = compile(r.clone()).unwrap();
        let tracks = &result["document"]["scenes"][0]["tracks"];
        let primary = tracks["main"]["elements"].as_array().unwrap();
        assert_eq!(primary.len(), 4);
        assert_eq!(
            primary
                .iter()
                .map(|e| e["duration"].as_i64().unwrap())
                .sum::<i64>(),
            ticks(2.)
        );
        for clip in primary {
            assert_eq!(clip["params"]["volume"], -6);
            assert_eq!(clip["isSourceAudioEnabled"], false);
            assert_eq!(
                clip["trimStart"].as_i64().unwrap(),
                ticks(1.) + clip["startTime"].as_i64().unwrap()
            );
        }
        let secondary: Vec<&Value> = tracks["overlay"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|t| t["elements"].as_array().unwrap())
            .filter(|e| e["mediaId"] == "second-video")
            .collect();
        assert_eq!(secondary.len(), 2);
        assert_eq!(secondary[0]["startTime"], ticks(0.5));
        assert_eq!(secondary[0]["trimStart"], ticks(0.2));
        assert_eq!(secondary[1]["startTime"], ticks(1.5));
        assert_eq!(secondary[1]["trimStart"], ticks(1.2));
        assert!(
            secondary
                .iter()
                .all(|e| e["isSourceAudioEnabled"] == false && e["params"]["muted"] == true)
        );
        let mut replay = r.clone();
        replay.document = result["document"].clone();
        let voice = &tracks["audio"][0]["elements"][0];
        assert_eq!(voice["mediaId"], "voice-video");
        assert_eq!(voice["duration"], ticks(2.));
        assert_eq!(voice["trimStart"], ticks(1.));
        assert_eq!(voice["params"]["volume"], -6);
        assert_eq!(compile(replay).unwrap()["deduplicated"], true);
        let mut muted = r.clone();
        let mut focused = r.clone();
        focused.source.as_mut().unwrap().focal_point =
            Some(visual_compile::FocalPoint { x: 0., y: 0.25 });
        focused.visual_bindings[0].focal_point = Some(visual_compile::FocalPoint { x: 1., y: 0. });
        let focused_result = compile(focused.clone()).unwrap();
        let focused_tracks = &focused_result["document"]["scenes"][0]["tracks"];
        let fp = &focused_tracks["main"]["elements"][1];
        let cp = &primary[1];
        assert!(
            fp["params"]["transform.positionX"].as_f64().unwrap()
                > cp["params"]["transform.positionX"].as_f64().unwrap()
        );
        // Moving the media must not move its assigned viewport.
        let source_width = 1080.
            * (r.input.template.canvas.width as f64 / 1080.)
                .min(r.input.template.canvas.height as f64 / 1440.)
            * fp["params"]["transform.scaleX"].as_f64().unwrap();
        let viewport_x = fp["params"]["transform.positionX"].as_f64().unwrap()
            + fp["masks"][0]["params"]["centerX"].as_f64().unwrap() * source_width;
        assert!((viewport_x - cp["params"]["transform.positionX"].as_f64().unwrap()).abs() < 1e-8);
        let fs = focused_tracks["overlay"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|t| t["elements"].as_array().unwrap())
            .find(|e| e["mediaId"] == "second-video")
            .unwrap();
        assert!(
            fs["params"]["transform.positionX"].as_f64().unwrap()
                < secondary[0]["params"]["transform.positionX"]
                    .as_f64()
                    .unwrap()
        );
        focused.document = focused_result["document"].clone();
        assert_eq!(compile(focused.clone()).unwrap()["deduplicated"], true);
        focused
            .source
            .as_mut()
            .unwrap()
            .focal_point
            .as_mut()
            .unwrap()
            .x = 0.5;
        assert!(compile(focused).is_err());
        muted.document["scenes"][0]["tracks"]["main"]["muted"] = json!(true);
        muted.document["scenes"][0]["tracks"]["main"]["solo"] = json!(true);
        let muted = compile(muted).unwrap();
        assert_eq!(
            muted["document"]["scenes"][0]["tracks"]["audio"][0]["muted"],
            true
        );
        assert_eq!(
            muted["document"]["scenes"][0]["tracks"]["audio"][0]["solo"],
            true
        );
        let mut disabled = r.clone();
        disabled.document["scenes"][0]["tracks"]["main"]["elements"][0]["isSourceAudioEnabled"] =
            json!(false);
        let disabled = compile(disabled).unwrap();
        assert!(
            disabled["document"]["scenes"][0]["tracks"]["audio"]
                .as_array()
                .is_none_or(|a| a.is_empty())
        );
        let mut short = r.clone();
        short.media["second-video"]["duration"] = json!(1.3);
        assert!(
            compile(short)
                .unwrap_err()
                .to_string()
                .contains("shorter than its placement")
        );
        let mut overlap = r.clone();
        overlap.input.template.layouts[1]
            .secondary
            .as_mut()
            .unwrap()
            .region
            .x = 0.1;
        assert!(
            compile(overlap)
                .unwrap_err()
                .to_string()
                .contains("must not overlap")
        );
        r.visual_bindings.clear();
        assert!(
            compile(r)
                .unwrap_err()
                .to_string()
                .contains("must be bound")
        );
    }

    #[test]
    fn source_layouts_preserve_continuous_source_time_and_atomic_replay() {
        let mut r = request();
        r.start_time_seconds = 0.;
        r.input.words.push(rhythm::Word {
            text: "必须".into(),
            start: 1.4,
            end: 1.9,
            speaker: None,
            emphasis: 1.,
        });
        r.input.semantic_units = vec![
            rhythm::SemanticUnit {
                start_word: 0,
                end_word: 1,
                intent: Intent::Neutral,
                keyword: None,
                rationale: "first".into(),
            },
            rhythm::SemanticUnit {
                start_word: 1,
                end_word: 2,
                intent: Intent::Emphasis,
                keyword: None,
                rationale: "accent".into(),
            },
        ];
        r.input.template.layouts[0].mode = LayoutMode::FullBleed;
        r.input.template.layouts[1].mode = LayoutMode::CircleInset;
        r.source = Some(SourceRef {
            track_id: "main".into(),
            element_id: "video".into(),
            focal_point: None,
        });
        r.media = json!({"asset":{"width":1080,"height":1440,"duration":5.}});
        r.document["scenes"][0]["tracks"]["main"] = json!({"id":"main","type":"video","elements":[{
            "id":"video","type":"video","mediaId":"asset","startTime":0,"duration":ticks(2.),
            "trimStart":ticks(1.),"trimEnd":ticks(2.),"params":{"volume":-3}}]});
        let result = compile(r.clone()).unwrap();
        let clips = result["document"]["scenes"][0]["tracks"]["main"]["elements"]
            .as_array()
            .unwrap();
        assert_eq!(clips.len(), 2);
        assert_eq!(clips[0]["startTime"], 0);
        assert_eq!(clips[0]["duration"], ticks(1.4));
        assert_eq!(clips[1]["trimStart"], ticks(2.4));
        assert_eq!(clips[1]["trimEnd"], ticks(2.));
        assert_eq!(clips[1]["masks"][0]["type"], "ellipse");
        assert_eq!(clips[1]["params"]["volume"], -3);
        r.document = result["document"].clone();
        r.document["revision"] = json!(4);
        assert_eq!(compile(r.clone()).unwrap()["deduplicated"], true);
        r.document["scenes"][0]["tracks"]["main"]["elements"]
            .as_array_mut()
            .unwrap()
            .pop();
        assert!(
            compile(r)
                .unwrap_err()
                .to_string()
                .contains("application modified")
        );
    }
}
