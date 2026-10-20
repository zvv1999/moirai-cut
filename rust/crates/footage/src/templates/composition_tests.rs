use super::{
    compiler::{CompileInput, compile},
    model::*,
    rhythm::{PlanInput, plan},
};
use crate::domain::TICKS;
use serde_json::{Value, json};

#[test]
fn readability_diagnostics_follow_final_lifecycle_and_list_bounds() {
    let mut value = input();
    value["words"] = json!([{"text":"first","start":0.,"end":0.2}]);
    value["captionSpans"] = json!([{"startWord":0,"endWord":1}]);
    value["durationSeconds"] = json!(3.);
    value["semanticUnits"] = json!([{ "startWord":0,"endWord":1,"intent":"neutral","keyword":{"startWord":0,"endWord":1},"rationale":"first" }]);
    value["template"]["visualRhythm"]["minDisplaySeconds"] = json!(0.8);
    value["template"]["elements"][0]["binding"] = json!("keyword");
    value["template"]["elements"][0]["timing"]["anchor"] = json!("keyword_start");
    value["template"]["elements"][0]["timing"]["maxSeconds"] = json!(0.2);
    let inspect = |value: Value| {
        let result = plan(serde_json::from_value(value).unwrap()).unwrap();
        let diagnostics = result
            .warnings
            .iter()
            .filter_map(|warning| {
                warning
                    .strip_prefix("display_below_readability_minimum:")
                    .map(|json| serde_json::from_str::<Value>(json).unwrap())
            })
            .collect::<Vec<_>>();
        (result, diagnostics)
    };
    for list in [false, true] {
        let mut extended = value.clone();
        if list {
            extended["template"]["composition"]["accumulatingLists"] = json!([{"items":[{"elementId":"caption","startEventId":"auto-video"}],"endEventId":"auto-video"}]);
        } else {
            extended["template"]["composition"]["lifecycles"] = json!([{"elementId":"caption","startEventId":"auto-video","endEventId":"auto-video"}]);
        }
        let (result, diagnostics) = inspect(extended.clone());
        assert_eq!(result.elements[0].end, 3.);
        assert!(
            diagnostics.is_empty(),
            "final extended interval meets reading minimum"
        );
        extended["template"]["elements"][0]["timing"]["maxSeconds"] = json!(3.);
        if list {
            extended["template"]["composition"]["accumulatingLists"][0]["endEventId"] =
                json!("auto-keyword-0");
        } else {
            extended["template"]["composition"]["lifecycles"][0]["endEventId"] =
                json!("auto-keyword-0");
        }
        let (result, diagnostics) = inspect(extended.clone());
        assert_eq!(result.elements[0].end, 0.2);
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0]["actualSeconds"], 0.2);
        assert_eq!(diagnostics[0]["boundaries"], json!(["lifecycle_boundary"]));
        extended["template"]["composition"]["scheduling"] = json!([{"elementId":"caption","eventKind":"keyword","minConfidence":0.,"minStrength":0.,"cooldownSeconds":0.,"maxOccurrences":10,"strengthWeight":1.,"confidenceWeight":1.,"repetitionPenalty":0.}]);
        assert!(
            inspect(extended).1.is_empty(),
            "explicit scheduling does not use visual minimum"
        );
    }
}

#[test]
fn readability_hold_diagnostics_report_real_bounds_without_changing_timing() {
    let mut value = input();
    value["words"] =
        json!([{"text":"first","start":0.,"end":0.2},{"text":"second","start":0.5,"end":0.7}]);
    value["durationSeconds"] = json!(1.);
    value["semanticUnits"] = json!([
        {"startWord":0,"endWord":1,"intent":"neutral","keyword":{"startWord":0,"endWord":1},"rationale":"first"},
        {"startWord":1,"endWord":2,"intent":"neutral","keyword":{"startWord":1,"endWord":2},"rationale":"second"}
    ]);
    value["template"]["visualRhythm"]["minDisplaySeconds"] = json!(0.8);
    value["template"]["elements"][0]["binding"] = json!("keyword");
    value["template"]["elements"][0]["timing"]["anchor"] = json!("keyword_start");
    let inspect = |value: Value| {
        let result = plan(serde_json::from_value(value).unwrap()).unwrap();
        let mut diagnostics = result
            .warnings
            .iter()
            .filter_map(|warning| {
                warning
                    .strip_prefix("display_below_readability_minimum:")
                    .map(|json| serde_json::from_str::<Value>(json).unwrap())
            })
            .collect::<Vec<_>>();
        diagnostics.sort_by(|a, b| a["eventId"].as_str().cmp(&b["eventId"].as_str()));
        (result, diagnostics)
    };
    let (result, diagnostics) = inspect(value.clone());
    assert_eq!(
        result
            .elements
            .iter()
            .map(|e| (e.start, e.end))
            .collect::<Vec<_>>(),
        vec![(0., 0.5), (0.5, 1.)]
    );
    assert_eq!(diagnostics.len(), 2);
    assert_eq!(diagnostics[0]["elementId"], "caption");
    assert_eq!(diagnostics[0]["eventId"], "auto-keyword-0");
    assert_eq!(diagnostics[0]["actualSeconds"], 0.5);
    assert_eq!(diagnostics[0]["requiredSeconds"], 0.8);
    assert_eq!(diagnostics[0]["boundaries"], json!(["next_keyword"]));
    assert_eq!(diagnostics[1]["boundaries"], json!(["input_end"]));
    let mut satisfying = value.clone();
    satisfying["template"]["elements"][0]["minDisplaySeconds"] = json!(0.4);
    assert!(
        inspect(satisfying).1.is_empty(),
        "local minimum overrides the host minimum"
    );
    let mut explicit = value.clone();
    explicit["template"]["elements"][0]["timing"]["endAnchor"] = json!("event_end");
    let (result, diagnostics) = inspect(explicit);
    assert_eq!(result.elements[0].end, 0.2);
    assert_eq!(diagnostics[0]["boundaries"], json!(["explicit_event_end"]));
    let mut capped = value.clone();
    capped["template"]["elements"][0]["timing"]["maxSeconds"] = json!(0.3);
    assert_eq!(inspect(capped).1[0]["boundaries"], json!(["max_seconds"]));
    let mut semantic = value.clone();
    semantic["template"]["elements"][0]["timing"]["anchor"] = json!("semantic_start");
    assert!(
        inspect(semantic).1.is_empty(),
        "semantic timing does not apply this hold"
    );
    value["template"]["elements"][0]["features"]["representation"] = json!("audio");
    value["template"]["elements"][0]["features"]["mediaUse"] = json!("sound_effect");
    value["template"]["elements"][0]["resourceId"] = json!("audio-slot");
    value["template"]["resourceSlots"] =
        json!([{"id":"audio-slot","representation":"audio","description":"sound","tags":[]}]);
    value["template"]["resourceBindings"] =
        json!([{"slotId":"audio-slot","assetId":"sound","enabled":true}]);
    let (audio, diagnostics) = inspect(value);
    assert!(!audio.sounds.is_empty());
    assert!(
        diagnostics.is_empty(),
        "audio does not have a visual reading budget"
    );
}

#[test]
fn keyword_reading_hold_uses_gap_without_covering_next_keyword() {
    let mut value = input();
    value["words"] =
        json!([{"text":"first","start":0.,"end":0.2},{"text":"second","start":0.5,"end":0.7}]);
    value["durationSeconds"] = json!(1.);
    value["semanticUnits"] = json!([
        {"startWord":0,"endWord":1,"intent":"neutral","keyword":{"startWord":0,"endWord":1},"rationale":"first"},
        {"startWord":1,"endWord":2,"intent":"neutral","keyword":{"startWord":1,"endWord":2},"rationale":"second"}
    ]);
    value["template"]["visualRhythm"]["minDisplaySeconds"] = json!(0.8);
    value["template"]["elements"][0]["binding"] = json!("keyword");
    value["template"]["elements"][0]["timing"]["anchor"] = json!("keyword_start");
    let result = plan(serde_json::from_value(value.clone()).unwrap()).unwrap();
    assert_eq!(
        result
            .elements
            .iter()
            .map(|e| (e.start, e.end))
            .collect::<Vec<_>>(),
        vec![(0., 0.5), (0.5, 1.)]
    );
    // Explicit event ends override the optional visual hold.
    value["template"]["elements"][0]["timing"]["endAnchor"] = json!("event_end");
    let result = plan(serde_json::from_value(value.clone()).unwrap()).unwrap();
    assert_eq!(
        result
            .elements
            .iter()
            .map(|e| (e.start, e.end))
            .collect::<Vec<_>>(),
        vec![(0., 0.2), (0.5, 0.7)]
    );
    value["template"]["elements"][0]["timing"]
        .as_object_mut()
        .unwrap()
        .remove("endAnchor");
    value["template"]["elements"][0]["timing"]["offsetSeconds"] = json!(0.1);
    let result = plan(serde_json::from_value(value).unwrap()).unwrap();
    assert_eq!(
        result
            .elements
            .iter()
            .map(|e| (e.start, e.end))
            .collect::<Vec<_>>(),
        vec![(0.1, 0.6), (0.6, 1.)]
    );
}

#[test]
fn layout_followers_inherit_measured_attachment_through_graphic_chain() {
    let mut template: Template = serde_json::from_value(input()["template"].clone()).unwrap();
    template.composition.spatial_relations = serde_json::from_value(json!([
        {"elementId":"fiber","relativeTo":"highlight","placement":"overlay","gap":0.,"offsetX":0.,"offsetY":0.,"followMotion":true},
        {"elementId":"highlight","relativeTo":"tape","placement":"overlay","gap":0.,"offsetX":0.,"offsetY":0.,"followMotion":true},
        {"elementId":"tape","relativeTo":"caption","placement":"above","gap":0.,"offsetX":0.,"offsetY":0.,"followMotion":true,"referenceBounds":"text_box"}
    ])).unwrap();
    let mut elements = vec![];
    for start in [0, 100] {
        for name in ["caption", "tape", "highlight", "fiber"] {
            elements.push(json!({"id":format!("{name}-{start}"),"type":if name=="caption" {"text"} else {"graphic"},"startTime":start,"duration":50,"params":{"template.elementId":name}}));
        }
    }
    let mut tracks = vec![json!({"id":"track","elements":elements})];
    super::relationships::text_attachments(&mut tracks, &template).unwrap();
    for (index, element) in tracks[0]["elements"].as_array().unwrap().iter().enumerate() {
        if index % 4 == 0 {
            assert!(element.get("textAttachment").is_none());
            continue;
        }
        assert_eq!(
            element["textAttachment"]["parent"]["elementId"],
            format!("caption-{}", if index < 4 { 0 } else { 100 })
        );
        assert_eq!(element["textAttachment"]["anchor"], json!([0.5, 0.]));
    }
    template.composition.spatial_relations[1].follow_motion = false;
    let mut tracks = vec![json!({"id":"track","elements":elements})];
    super::relationships::text_attachments(&mut tracks, &template).unwrap();
    assert!(tracks[0]["elements"][2].get("textAttachment").is_none());
    assert!(tracks[0]["elements"][3].get("textAttachment").is_none());
}

#[test]
fn measured_attachment_compiles_exact_parent_identity_and_preserves_legacy_serialization() {
    let mut value = input();
    let mut child = value["template"]["elements"][0].clone();
    child["id"] = json!("child");
    child["region"] = json!({"x":0.1,"y":0.1,"width":0.1,"height":0.1});
    value["template"]["elements"]
        .as_array_mut()
        .unwrap()
        .push(child);
    let legacy = json!({"elementId":"child","relativeTo":"caption","placement":"overlay","gap":0.,"offsetX":0.,"offsetY":0.,"followMotion":true});
    let relation: super::composition::SpatialRelation =
        serde_json::from_value(legacy.clone()).unwrap();
    assert!(
        serde_json::to_value(relation)
            .unwrap()
            .get("referenceBounds")
            .is_none()
    );
    value["template"]["composition"] = json!({"spatialRelations":[legacy]});
    let old = compile(request(value.clone())).unwrap();
    assert!(
        visuals(&old)
            .iter()
            .all(|clip| clip.get("textAttachment").is_none())
    );
    value["template"]["composition"]["spatialRelations"][0]["referenceBounds"] = json!("text_box");
    let output = compile(request(value.clone())).unwrap();
    let clips = visuals(&output);
    let parent = clips
        .iter()
        .find(|e| e["params"]["template.elementId"] == "caption")
        .unwrap();
    let child = clips
        .iter()
        .find(|e| e["params"]["template.elementId"] == "child")
        .unwrap();
    assert_eq!(child["textAttachment"]["parent"]["elementId"], parent["id"]);
    assert_eq!(child["textAttachment"]["parent"]["groupPath"], json!([]));
    assert!(child["textAttachment"]["parent"]["trackId"].is_string());
    assert_eq!(child["textAttachment"]["anchor"], json!([0.5, 0.5]));
    assert!(child.get("renderGroup").is_none());
    assert!(parent.get("renderGroup").is_none());
    assert!(
        parent["params"]["template.textLayoutWidth"]
            .as_f64()
            .unwrap()
            > 0.
    );
    value["template"]["composition"]["spatialRelations"][0]["followMotion"] = json!(false);
    assert!(
        compile(request(value))
            .unwrap_err()
            .to_string()
            .contains("requires motion following")
    );
}

#[test]
fn spatial_anchor_geometry_preserves_edges_gaps_and_independent_offsets() {
    use super::composition::{SpatialPlacement, SpatialRelation, relative_region};
    let parent = Rect {
        x: 0.3,
        y: 0.3,
        width: 0.4,
        height: 0.3,
    };
    let child = Rect {
        x: 0.01,
        y: 0.02,
        width: 0.1,
        height: 0.08,
    };
    for (placement, expected) in [
        (SpatialPlacement::Overlay, [0.45, 0.41]),
        (SpatialPlacement::Above, [0.45, 0.20]),
        (SpatialPlacement::Below, [0.45, 0.62]),
        (SpatialPlacement::Left, [0.18, 0.41]),
        (SpatialPlacement::Right, [0.72, 0.41]),
    ] {
        let relation = SpatialRelation {
            size_binding: None,
            reference_bounds: Default::default(),
            follow_motion: false,
            element_id: "child".into(),
            relative_to: "parent".into(),
            placement,
            gap: 0.02,
            offset_x: 0.01,
            offset_y: -0.03,
        };
        let result = relative_region(&child, &parent, &relation).unwrap();
        assert!((result.x - expected[0] - 0.01).abs() < 1e-12);
        assert!((result.y - expected[1] + 0.03).abs() < 1e-12);
        assert_eq!(result.width, child.width);
        assert_eq!(result.height, child.height);
        // Moving the reference cannot change the gap or the child's own size.
        let moved = Rect {
            x: parent.x + 0.04,
            y: parent.y + 0.05,
            ..parent.clone()
        };
        let shifted = relative_region(&child, &moved, &relation).unwrap();
        assert!((shifted.x - result.x - 0.04).abs() < 1e-12);
        assert!((shifted.y - result.y - 0.05).abs() < 1e-12);
    }
}

#[test]
fn measured_attachment_identity_uses_final_group_path_and_scene_clock() {
    let mut template: Template = serde_json::from_value(input()["template"].clone()).unwrap();
    template.composition.spatial_relations=serde_json::from_value(json!([{"elementId":"child","relativeTo":"caption","placement":"right","gap":0.,"offsetX":0.,"offsetY":0.,"followMotion":true,"referenceBounds":"text_box"}])).unwrap();
    let parent = json!({"id":"parent-instance","type":"text","startTime":10,"duration":20,"params":{"template.elementId":"caption"}});
    let group = json!({"id":"group-instance","startTime":80,"duration":40,"trimStart":5,"renderGroup":{"timeOrigin":0,"tracks":[{"id":"inner-track","elements":[parent]}]}});
    let child = json!({"id":"child-instance","type":"graphic","startTime":90,"duration":10,"params":{"template.elementId":"child"}});
    let mut tracks = vec![json!({"id":"outer-track","elements":[group,child]})];
    super::relationships::text_attachments(&mut tracks, &template).unwrap();
    assert_eq!(
        tracks[0]["elements"][1]["textAttachment"],
        json!({"parent":{"elementId":"parent-instance","trackId":"inner-track","groupPath":["group-instance"]},"anchor":[1.,0.5]})
    );
    template.composition.spatial_relations[0].size_binding =
        Some(serde_json::from_value(json!({"width":{"factor":1.2,"padding":0.01}})).unwrap());
    super::relationships::text_attachments(&mut tracks, &template).unwrap();
    assert_eq!(
        tracks[0]["elements"][1]["textAttachment"]["parent"]["groupPath"],
        json!(["group-instance"])
    );
    assert_eq!(
        tracks[0]["elements"][1]["textAttachment"]["sizeBinding"]["childAnchor"],
        json!([0., 0.5])
    );
    // Parent scene interval is 85..105 after the group's clock conversion.
    tracks[0]["elements"][1]["startTime"] = json!(104);
    assert!(super::relationships::text_attachments(&mut tracks, &template).is_err());
    tracks[0]["elements"][1]["startTime"] = json!(90);
    // Same leaf scene clock, but the enclosing surface is not visible until 100.
    tracks[0]["elements"][0]["startTime"] = json!(100);
    tracks[0]["elements"][0]["renderGroup"]["timeOrigin"] = json!(20);
    assert!(super::relationships::text_attachments(&mut tracks, &template).is_err());
    // Nor can the leaf supply a parent after the enclosing surface ends at 95.
    tracks[0]["elements"][0]["startTime"] = json!(80);
    tracks[0]["elements"][0]["renderGroup"]["timeOrigin"] = json!(0);
    tracks[0]["elements"][0]["duration"] = json!(15);
    assert!(super::relationships::text_attachments(&mut tracks, &template).is_err());
}

pub(super) fn input() -> Value {
    let mut t = super::seed::templates().unwrap().remove(0);
    let mut e = t
        .elements
        .iter()
        .find(|e| e.features.representation == Representation::Text)
        .unwrap()
        .clone();
    e.id = "caption".into();
    e.intents.clear();
    e.exclusive_group = None;
    e.resource_id = None;
    e.binding = Binding::Sentence;
    e.features.placement = Placement::Fixed;
    e.features.avoid_protected_regions = false;
    e.features.accent = false;
    e.motions.clear();
    e.timing = Timing {
        end_anchor: None,
        anchor: Anchor::CueStart,
        offset_seconds: 0.,
        max_seconds: 1.,
        min_seconds: 0.1,
    };
    t.elements = vec![e];
    t.layouts.truncate(1);
    t.layouts[0].intents.clear();
    t.layouts[0].safe_regions.clear();
    t.layout_entrances.clear();
    t.transition_rules.clear();
    t.resource_bindings.clear();
    t.resource_slots.clear();
    json!({"template":t,"words":[{"text":"first","start":0.,"end":1.},{"text":"second","start":1.,"end":2.}],"durationSeconds":2.,"title":"test","semanticUnits":[{"startWord":0,"endWord":2,"intent":"neutral","keyword":null,"rationale":"one sentence"}],"captionSpans":[{"startWord":0,"endWord":1},{"startWord":1,"endWord":2}]})
}
pub(super) fn request(input: Value) -> CompileInput {
    serde_json::from_value(json!({"input":input,"document":{"version":31,"revision":0,"settings":{"canvasSize":input["template"]["canvas"]},"scenes":[{"id":"scene","tracks":{"main":{"id":"main","type":"video","elements":[]},"overlay":[],"audio":[]}}]},"sceneId":"scene","baseRevision":0,"idempotencyKey":"orthogonal-test","media":{}})).unwrap()
}

fn evaluation(r: CompileInput) -> super::execution::Evaluation {
    serde_json::from_value(json!({"request":r,"maxCandidates":24})).unwrap()
}

#[test]
fn layout_policy_changes_preserve_duration_and_transition_repairs() {
    let mut r = request(input());
    r.input.template.composition = serde_json::from_value(composition()).unwrap();
    let mut e = evaluation(r);
    e.repair.shorten_elements.insert("caption".into(), 0.2);
    e.repair.cut_transitions.push("join".into());
    let mut search = super::search::Search::new(&e).unwrap();
    let mut found = false;
    for _ in 0..100 {
        let Some(node) = search.next() else {
            break;
        };
        let t = &node.request.input.template;
        if t.elements[0].timing.max_seconds == 0.2
            && t.composition.transitions.is_empty()
            && t.composition.layout_policy.is_some()
        {
            found = true;
            break;
        }
        search.expand(&node, 50.);
    }
    assert!(
        found,
        "rhythm changes must coexist with duration and transition repairs"
    );
}

#[test]
fn repair_cost_uses_final_difference_and_penalizes_reading_loss() {
    let original = request(input());
    let mut changed = original.clone();
    changed.input.template.elements[0].timing.max_seconds = 0.5;
    let text = super::search::repair_cost(&original, &changed);
    assert_eq!(text["total"], 6.);
    changed.input.template.elements[0].timing.max_seconds = 1.;
    assert_eq!(super::search::repair_cost(&original, &changed)["total"], 0.);
    let mut video = video_request();
    let original = video.clone();
    video.input.template.elements[0].timing.max_seconds = 0.5;
    assert_eq!(super::search::repair_cost(&original, &video)["total"], 3.);
    video.visual_bindings[0].media_id = "long".into();
    video.input.template.elements[0].timing.max_seconds = 1.;
    assert_eq!(super::search::repair_cost(&original, &video)["total"], 1.);
}
fn video_request() -> CompileInput {
    let mut v = input();
    v["template"]["elements"][0]["features"]["representation"] = json!("video");
    v["template"]["elements"][0]["features"]["mediaUse"] = json!("broll");
    v["template"]["elements"][0]["resourceId"] = json!("primary");
    v["template"]["resourceSlots"] =
        json!([{"id":"primary","representation":"video","description":"video","tags":[]}]);
    let mut r = request(v);
    r.media = json!({"short":{"id":"short","type":"video","width":1080,"height":1920,"duration":0.7},"long":{"id":"long","type":"video","width":1080,"height":1920,"duration":3.}});
    r.visual_bindings = serde_json::from_value(
        json!([{"resourceId":"primary","mediaId":"short","sourceStartSeconds":0.2,"fit":"cover"}]),
    )
    .unwrap();
    r
}

#[test]
fn calibration_preserves_zero_weights_and_distinguishes_legacy_sound_inputs() {
    let mut e = evaluation(request(input()));
    e.weights.insert("coverage".into(), 0.);
    super::preferences::apply(
        &mut e,
        &json!({"active":true,"factors":{"coverage":4.,"readability":2.}}),
    );
    assert!(
        !e.weights.contains_key("readability"),
        "legacy metric weights must not leak into new evaluations"
    );
    super::preferences::apply(
        &mut e,
        &json!({"active":true,"metricVersion":super::execution::METRIC_VERSION,"factors":{"coverage":4.,"readability":2.}}),
    );
    assert_eq!(e.weights["coverage"], 0.);
    assert_eq!(e.weights["readability"], 2.);
    let db = crate::store::Store::open(std::path::Path::new(":memory:")).unwrap();
    let mut a = json!({"candidates":[]});
    super::preferences::remember(&db, &e, &mut a).unwrap();
    e.request.input.sound_events=serde_json::from_value(json!([{"id":"beat","kind":"beat","start":0.,"end":0.,"strength":1.,"confidence":1.,"sourceId":"music","evidence":"fixture"}])).unwrap();
    let mut b = json!({"candidates":[]});
    super::preferences::remember(&db, &e, &mut b).unwrap();
    let a: Value = db
        .get("template_evaluation", a["evaluationId"].as_str().unwrap())
        .unwrap();
    let b: Value = db
        .get("template_evaluation", b["evaluationId"].as_str().unwrap())
        .unwrap();
    assert_ne!(a["inputIdentity"], b["inputIdentity"]);
}

#[test]
fn search_backtracks_declared_fallback_after_placement_failure() {
    let mut r = video_request();
    let mut slot = r.input.template.resource_slots[0].clone();
    slot.id = "backup".into();
    r.input.template.resource_slots.push(slot);
    r.input.template.composition=serde_json::from_value(json!({"resourceRequirements":[{"slotId":"primary","required":true,"minDurationSeconds":0.1,"minWidth":0,"minHeight":0,"minAspectRatio":0.1,"maxAspectRatio":100.,"allowCrop":true,"requiredTags":[],"fallbackSlotIds":["backup"]}]})).unwrap();
    r.visual_bindings.push(
        serde_json::from_value(
            json!({"resourceId":"backup","mediaId":"long","sourceStartSeconds":0.3,"fit":"cover"}),
        )
        .unwrap(),
    );
    assert!(compile(r.clone()).is_err());
    let a = super::execution::evaluate(evaluation(r), compile).unwrap();
    let chosen = a["candidates"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["id"] == a["selectedId"])
        .unwrap();
    let binding = chosen["request"]["visualBindings"]
        .as_array()
        .unwrap()
        .iter()
        .find(|b| b["resourceId"] == "primary")
        .unwrap();
    assert_eq!(binding["mediaId"], "long");
    assert_eq!(binding["sourceStartSeconds"], 0.3);
}

#[test]
fn search_recovers_actual_duration_failure_and_preserves_binding_parameters() {
    let r = video_request();
    assert!(compile(r.clone()).is_err());
    let mut e = evaluation(r);
    e.resource_candidates = serde_json::from_value(
        json!([{"resourceId":"primary","mediaId":"long","sourceStartSeconds":0.2,"fit":"cover"}]),
    )
    .unwrap();
    let a = super::execution::evaluate(e.clone(), compile).unwrap();
    let b = super::execution::evaluate(e, compile).unwrap();
    assert_eq!(a["selectedId"], b["selectedId"]);
    assert_eq!(a["search"], b["search"]);
    let chosen = a["candidates"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["id"] == a["selectedId"])
        .unwrap();
    assert_eq!(chosen["request"]["visualBindings"][0]["mediaId"], "long");
    assert_eq!(
        chosen["request"]["visualBindings"][0]["sourceStartSeconds"],
        0.2
    );
    assert_eq!(chosen["request"]["visualBindings"][0]["fit"], "cover");
    assert!(
        a["candidates"]
            .as_array()
            .unwrap()
            .iter()
            .any(|c| c["executable"] == false)
    );
}

#[test]
fn shortening_requires_explicit_bounds_and_keeps_speech_clock() {
    let r = video_request();
    let original_words = serde_json::to_value(&r.input.words).unwrap();
    let a = super::execution::evaluate(evaluation(r.clone()), compile).unwrap();
    assert!(a["selectedId"].is_null());
    let mut e = evaluation(r);
    e.repair.shorten_elements.insert("caption".into(), 0.2);
    let a = super::execution::evaluate(e.clone(), compile).unwrap();
    let chosen = a["candidates"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["id"] == a["selectedId"])
        .unwrap();
    assert_eq!(chosen["executable"], true);
    assert_eq!(chosen["request"]["input"]["words"], original_words);
    assert_eq!(chosen["request"]["input"]["durationSeconds"], 2.);
    assert!(
        chosen["request"]["input"]["template"]["elements"][0]["timing"]["maxSeconds"]
            .as_f64()
            .unwrap()
            <= 0.5
    );
    e.repair.shorten_elements.insert("caption".into(), 0.01);
    assert!(super::execution::evaluate(e, compile).is_err());
}

#[test]
fn search_joint_assignments_and_dimension_coverage_avoid_slot_starvation() {
    let mut r = video_request();
    r.visual_bindings.clear();
    let mut slot = r.input.template.resource_slots[0].clone();
    slot.id = "second".into();
    r.input.template.resource_slots.push(slot);
    let mut element = r.input.template.elements[0].clone();
    element.id = "second".into();
    element.resource_id = Some("second".into());
    r.input.template.elements.push(element);
    let mut e = evaluation(r);
    e.max_candidates = 6;
    for i in 0..20 {
        let id = format!("asset-{i}");
        e.request.media[&id] =
            json!({"id":id,"type":"video","width":1080,"height":1920,"duration":3.});
        e.resource_candidates
            .push(serde_json::from_value(json!({"resourceId":"primary","mediaId":id})).unwrap());
    }
    let a = super::execution::evaluate(e, compile).unwrap();
    assert!(!a["selectedId"].is_null());
    assert_eq!(a["searchTruncated"], true);
    assert!(
        a["search"]["coveredDimensions"]
            .as_array()
            .unwrap()
            .contains(&json!("resource:second"))
    );
    let joint = a["candidates"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["strategy"] == "joint-resources")
        .unwrap();
    assert_eq!(joint["executable"], true);
}

#[test]
fn permitted_transition_removal_recovers_preroll_without_changing_source() {
    let mut r = video_request();
    r.input.template.composition = serde_json::from_value(composition()).unwrap();
    r.visual_bindings[0].media_id = "long".into();
    r.visual_bindings[0].source_start_seconds = 0.;
    assert!(
        compile(r.clone())
            .unwrap_err()
            .to_string()
            .contains("preroll")
    );
    let a = super::execution::evaluate(evaluation(r.clone()), compile).unwrap();
    assert!(a["selectedId"].is_null());
    let mut e = evaluation(r);
    e.repair.cut_transitions.push("join".into());
    let a = super::execution::evaluate(e, compile).unwrap();
    assert!(!a["selectedId"].is_null());
    assert!(
        a["candidates"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|c| c["executable"] == true)
            .all(
                |c| c["request"]["input"]["template"]["composition"]["transitions"]
                    .as_array()
                    .unwrap()
                    .is_empty()
            )
    );
}
fn visuals(output: &Value) -> Vec<&Value> {
    output["document"]["scenes"][0]["tracks"]["overlay"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|t| t["elements"].as_array().unwrap())
        .collect()
}
fn composition() -> Value {
    json!({"treatments":[{"id":"blur","operation":{"kind":"blur","intensity":12}},{"id":"grade","operation":{"kind":"color_grade","exposure":0.2,"contrast":10,"saturation":-10,"temperature":0}},{"id":"pulse","operation":{"kind":"motion","channels":[{"property":"scale","keys":[{"time":0,"value":0.8,"easing":"ease_out"},{"time":1,"value":1,"easing":"linear"}]}]}}],"applications":[{"treatmentId":"blur","target":{"kind":"element","id":"caption"},"enabled":true},{"treatmentId":"grade","target":{"kind":"element","id":"caption"},"enabled":true},{"treatmentId":"pulse","target":{"kind":"element","id":"caption"},"enabled":true}],"transitionEffects":[{"id":"cross","effect":"dissolve","durationSeconds":0.2}],"transitions":[{"id":"join","fromElementId":"caption","toElementId":"caption","effectId":"cross"}]})
}

#[test]
fn unified_events_keep_semantic_and_shot_timing_independent_of_captions() {
    let mut value = input();
    value["template"]["elements"][0]["timing"]["anchor"] = json!("semantic_start");
    let mut shot = value["template"]["elements"][0].clone();
    shot["id"] = json!("shot");
    shot["binding"] = json!("literal");
    shot["literal"] = json!("shot");
    value["template"]["elements"]
        .as_array_mut()
        .unwrap()
        .push(shot);
    value["events"] = json!([{"id":"shot-event","kind":"shot","start":0.5,"end":1.8,"strength":1.,"confidence":1.,"sourceId":"camera","evidence":"fixture boundary"}]);
    value["template"]["composition"] = json!({"scheduling":[{"elementId":"shot","eventKind":"shot","minConfidence":0.,"minStrength":0.,"cooldownSeconds":0.,"maxOccurrences":10,"strengthWeight":1.,"confidenceWeight":1.,"repetitionPenalty":0.}]});
    let a = plan(serde_json::from_value(value.clone()).unwrap()).unwrap();
    value["captionSpans"] = json!([{"startWord":0,"endWord":2}]);
    let b = plan(serde_json::from_value(value.clone()).unwrap()).unwrap();
    assert_eq!(
        serde_json::to_value(a.elements).unwrap(),
        serde_json::to_value(b.elements).unwrap()
    );
    value["events"][0]["semanticIndex"] = json!(999);
    assert!(
        plan(serde_json::from_value(value).unwrap())
            .unwrap_err()
            .to_string()
            .contains("reference")
    );
}

#[test]
fn dynamic_attachment_bakes_parent_motion_and_child_motion() {
    let mut value = input();
    let mut child = value["template"]["elements"][0].clone();
    child["id"] = json!("child");
    child["region"] = json!({"x":0.1,"y":0.1,"width":0.1,"height":0.1});
    child["motions"] = json!([{"property":"x","keys":[{"time":0,"value":0,"easing":"linear"},{"time":1,"value":20,"easing":"linear"}]}]);
    value["template"]["elements"][0]["motions"] = json!([{"property":"x","keys":[{"time":0,"value":0,"easing":"linear"},{"time":1,"value":100,"easing":"linear"}]}]);
    value["template"]["elements"]
        .as_array_mut()
        .unwrap()
        .push(child);
    value["template"]["composition"] = json!({"spatialRelations":[{"elementId":"child","relativeTo":"caption","placement":"overlay","gap":0.,"offsetX":0.,"offsetY":0.,"followMotion":true}]});
    let out = compile(request(value)).unwrap();
    let clips = visuals(&out);
    let child = clips
        .iter()
        .find(|e| e["params"]["template.elementId"] == "child")
        .unwrap();
    let keys = child["animations"]["transform.positionX"]["keys"]
        .as_array()
        .unwrap();
    assert!(
        (keys.last().unwrap()["value"].as_f64().unwrap()
            - keys[0]["value"].as_f64().unwrap()
            - 120.)
            .abs()
            < 1e-6
    );
    assert!(child["params"]["template.attachedTo"].is_string());
}

#[test]
fn attachment_position_uses_rotated_parent_axes_at_child_activation() {
    let mut template: Template = serde_json::from_value(input()["template"].clone()).unwrap();
    template.composition.spatial_relations = serde_json::from_value(json!([
        {"elementId":"child","relativeTo":"caption","placement":"right","gap":0.,"offsetX":0.,"offsetY":0.,"followMotion":true}
    ])).unwrap();
    let tick = TICKS as i64;
    let channel = |a: f64, b: f64| {
        json!({"keys":[
            {"id":"a","time":tick,"value":a,"segmentToNext":"linear","tangentMode":"flat"},
            {"id":"b","time":2*tick,"value":b,"segmentToNext":"linear","tangentMode":"flat"}
        ]})
    };
    let parent = json!({"id":"parent-instance","startTime":0,"duration":3*tick,
    "params":{"template.elementId":"caption","transform.scaleY":3},
    "animations":{
        "transform.positionX":channel(10.,30.),"transform.positionY":channel(20.,40.),
        "transform.scaleX":channel(2.,4.),"transform.rotate":channel(90.,180.)
    }});
    let child = json!({"id":"child-instance","startTime":tick,"duration":tick,
    "params":{"template.elementId":"child","transform.positionX":10,"transform.positionY":80,"opacity":0.7},
    "animations":{"transform.positionX":{"keys":[
        {"id":"c","time":0,"value":10,"segmentToNext":"linear","tangentMode":"flat"},
        {"id":"d","time":tick,"value":40,"segmentToNext":"linear","tangentMode":"flat"}
    ]}}});
    let mut tracks = vec![json!({"elements":[child.clone(),parent.clone()]})];
    super::relationships::follow(&mut tracks, &template).unwrap();
    let result = &tracks[0]["elements"][0];
    for (path, start, end) in [
        ("transform.positionX", 10., -90.),
        ("transform.positionY", 80., 70.),
    ] {
        let keys = result["animations"][path]["keys"].as_array().unwrap();
        assert!((keys[0]["value"].as_f64().unwrap() - start).abs() < 1e-6);
        assert!((keys.last().unwrap()["value"].as_f64().unwrap() - end).abs() < 1e-6);
    }
    // At activation the offset is local (30, 0); child motion adds local (0, -10).
    // Final parent scale (4, 3), rotation 180 and origin (30, 40) give (-90, 70).
    assert_eq!(result["params"]["opacity"], child["params"]["opacity"]);
    assert_eq!(result["startTime"], child["startTime"]);
    assert_eq!(result["duration"], child["duration"]);
    assert_eq!(tracks[0]["elements"][1], parent);
    // Text-box mode instead shares the absolute authored-to-parent basis with
    // the renderer's measured-box correction, including the initial pose.
    template.composition.spatial_relations[0].reference_bounds =
        super::composition::SpatialBounds::TextBox;
    let mut measured_tracks = vec![json!({"elements":[child.clone(),parent.clone()]})];
    super::relationships::follow(&mut measured_tracks, &template).unwrap();
    let measured = &measured_tracks[0]["elements"][0];
    for (path, start, end) in [
        ("transform.positionX", -230., -130.),
        ("transform.positionY", 40., -200.),
        ("transform.scaleX", 2., 4.),
        ("transform.scaleY", 3., 3.),
        ("transform.rotate", 90., 180.),
    ] {
        let keys = measured["animations"][path]["keys"].as_array().unwrap();
        assert!(
            (keys[0]["value"].as_f64().unwrap() - start).abs() < 1e-6,
            "{path}"
        );
        assert!(
            (keys.last().unwrap()["value"].as_f64().unwrap() - end).abs() < 1e-6,
            "{path}"
        );
    }
    assert_eq!(measured["params"]["opacity"], child["params"]["opacity"]);
    let mut zero_parent = parent.clone();
    zero_parent["animations"]["transform.scaleX"] = channel(0., 4.);
    let mut zero_tracks = vec![json!({"elements":[child,zero_parent]})];
    super::relationships::follow(&mut zero_tracks, &template).unwrap();
    assert_eq!(
        zero_tracks[0]["elements"][0]["animations"]["transform.scaleX"]["keys"][0]["value"],
        0.
    );
}

#[test]
fn composite_group_preserves_children_internal_transitions_and_replay() {
    let mut value = input();
    value["template"]["composition"] = composition();
    value["template"]["composition"]["groups"] =
        json!([{"id":"surface","elementIds":["caption"],"composite":true}]);
    value["template"]["composition"]["applications"][0]["target"] =
        json!({"kind":"group","id":"surface"});
    let mut r = request(value);
    let out = compile(r.clone()).unwrap();
    let clips = visuals(&out);
    assert_eq!(clips.len(), 1);
    let surface = clips[0];
    assert_eq!(surface["effects"][0]["type"], "blur");
    let children: Vec<_> = surface["renderGroup"]["tracks"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|t| t["elements"].as_array().unwrap())
        .collect();
    assert_eq!(children.len(), 2);
    assert!(
        children
            .iter()
            .any(|e| e["params"]["template.transitionId"] == "join")
    );
    assert!(children.iter().all(|e| e["effects"][0]["type"] != "blur"));
    r.document = out["document"].clone();
    assert_eq!(compile(r).unwrap()["deduplicated"], true);
}

#[test]
fn whole_group_dissolve_prerolls_its_children() {
    let mut value = input();
    let mut second = value["template"]["elements"][0].clone();
    value["template"]["elements"][0]["intents"] = json!(["neutral"]);
    second["id"] = json!("second");
    second["intents"] = json!(["emphasis"]);
    value["template"]["elements"]
        .as_array_mut()
        .unwrap()
        .push(second);
    value["semanticUnits"] = json!([{"startWord":0,"endWord":1,"intent":"neutral","keyword":null,"rationale":"first"},{"startWord":1,"endWord":2,"intent":"emphasis","keyword":null,"rationale":"second"}]);
    value["template"]["composition"] = json!({"groups":[{"id":"a","elementIds":["caption"],"composite":true},{"id":"b","elementIds":["second"],"composite":true}],"transitionEffects":[{"id":"cross","effect":"dissolve","durationSeconds":0.2}],"transitions":[{"id":"join","fromElementId":"a","toElementId":"b","effectId":"cross"}]});
    let out = compile(request(value)).unwrap();
    let clips = visuals(&out);
    let incoming = clips
        .iter()
        .find(|e| e["params"]["template.groupId"] == "b")
        .unwrap();
    assert_eq!(incoming["startTime"], (0.8 * TICKS as f64) as i64);
    assert_eq!(
        incoming["renderGroup"]["tracks"][0]["elements"][0]["startTime"],
        incoming["startTime"]
    );
    assert!(
        incoming["renderGroup"]["tracks"][0]["elements"][0]
            .get("renderGroup")
            .is_none()
    );
}

#[test]
fn preflight_matches_compile_and_candidates_rank_whole_plans() {
    let mut r = request(input());
    assert_eq!(
        super::execution::preflight(r.clone(), compile)["executable"],
        true
    );
    r.base_revision = 999;
    assert!(compile(r.clone()).is_err());
    assert_eq!(super::execution::preflight(r, compile)["executable"], false);
    let r = request(input());
    let mut bad = r.input.template.clone();
    bad.elements[0].features.representation = Representation::Arrow;
    let evaluation = super::execution::Evaluation {
        request: r,
        alternatives: vec![bad],
        resource_candidates: vec![],
        max_candidates: 12,
        weights: Default::default(),
        repair: Default::default(),
        profile_id: "default".into(),
    };
    let a = super::execution::evaluate(evaluation.clone(), compile).unwrap();
    let b = super::execution::evaluate(evaluation, compile).unwrap();
    assert_eq!(a["selectedId"], b["selectedId"]);
    let candidates = a["candidates"].as_array().unwrap();
    assert_eq!(candidates.len(), 6);
    assert_eq!(candidates.last().unwrap()["executable"], false);
    for c in candidates.iter().filter(|c| c["executable"] == true) {
        assert_eq!(c["metrics"].as_object().unwrap().len(), 6);
        assert!(compile(serde_json::from_value(c["request"].clone()).unwrap()).is_ok());
    }
}

#[test]
fn evaluation_prefers_better_complete_coverage_and_enforces_budget() {
    let mut r = request(input());
    let full = r.input.template.clone();
    r.input.template.elements[0].timing.max_seconds = 0.2;
    let evaluation = super::execution::Evaluation {
        request: r,
        alternatives: vec![full],
        resource_candidates: vec![],
        max_candidates: 4,
        weights: std::collections::BTreeMap::from([("coverage".into(), 100.)]),
        repair: Default::default(),
        profile_id: "default".into(),
    };
    let result = super::execution::evaluate(evaluation.clone(), compile).unwrap();
    assert_eq!(result["selectedId"], 1);
    let mut bounded = evaluation;
    bounded.max_candidates = 1;
    let result = super::execution::evaluate(bounded, compile).unwrap();
    assert_eq!(result["candidates"].as_array().unwrap().len(), 1);
    assert_eq!(result["searchTruncated"], true);
}

#[test]
fn evaluation_readability_uses_the_same_sound_policy_as_caption_diagnostics() {
    let mut value = input();
    value["words"][0]["text"] = json!("abcdefghijkl");
    value["words"][1]["text"] = json!("mnopqrstuvwx");
    value["template"]["segmentation"]["maxCharactersPerSecond"] = json!(8.);
    let r = request(value.clone());
    let output = compile(r.clone()).unwrap();
    let metrics = super::execution::metrics(&output["plan"], &r);
    assert!((metrics["readability"] - 2. / 3.).abs() < 1e-9);
    assert!(
        output["plan"]["captions"][0]["warnings"]
            .as_array()
            .unwrap()
            .contains(&json!("reading_speed_exceeds_limit"))
    );

    value["captionPolicy"] = value["template"]["segmentation"].clone();
    value["captionPolicy"]["maxCharactersPerSecond"] = json!(20.);
    let r = request(value.clone());
    let output = compile(r.clone()).unwrap();
    assert_eq!(
        super::execution::metrics(&output["plan"], &r)["readability"],
        1.
    );
    assert!(
        !output["plan"]["captions"][0]["warnings"]
            .as_array()
            .unwrap()
            .contains(&json!("reading_speed_exceeds_limit"))
    );

    value.as_object_mut().unwrap().remove("captionPolicy");
    value["template"]["segmentation"]["maxCharactersPerSecond"] = json!(20.);
    let r = request(value);
    let output = compile(r.clone()).unwrap();
    assert_eq!(
        super::execution::metrics(&output["plan"], &r)["readability"],
        1.
    );
}

#[test]
fn reading_metric_counts_unicode_and_matches_short_cue_diagnostic_floor() {
    let mut value = input();
    value["words"][0] = json!({"text":"好","start":0.,"end":0.02});
    value["words"][1] = json!({"text":"🙂","start":1.,"end":1.02});
    value["template"]["segmentation"]["maxCharactersPerSecond"] = json!(20.);
    let r = request(value);
    let output = compile(r.clone()).unwrap();
    assert_eq!(
        super::execution::metrics(&output["plan"], &r)["readability"],
        1.
    );
    assert!(
        output["plan"]["captions"]
            .as_array()
            .unwrap()
            .iter()
            .all(|cue| !cue["warnings"]
                .as_array()
                .unwrap()
                .contains(&json!("reading_speed_exceeds_limit")))
    );
}

#[test]
fn resource_fallback_skips_invalid_first_asset_and_keeps_second_trim() {
    let mut value = input();
    value["template"]["elements"][0]["features"]["representation"] = json!("video");
    value["template"]["elements"][0]["resourceId"] = json!("primary");
    value["template"]["resourceSlots"] = json!([{"id":"primary","representation":"video","description":"primary","tags":[]},{"id":"bad","representation":"video","description":"bad","tags":[]},{"id":"good","representation":"video","description":"good","tags":[]}]);
    value["template"]["composition"] = json!({"resourceRequirements":[{"slotId":"primary","required":true,"minDurationSeconds":1.,"minWidth":720,"minHeight":720,"minAspectRatio":0.5,"maxAspectRatio":2.,"allowCrop":false,"requiredTags":["product"],"fallbackSlotIds":["bad","good"]}]});
    let mut r = request(value);
    r.visual_bindings=serde_json::from_value(json!([{"resourceId":"bad","mediaId":"bad-asset"},{"resourceId":"good","mediaId":"good-asset","sourceStartSeconds":0.5}])).unwrap();
    r.media = json!({"bad-asset":{"id":"bad-asset","type":"video","width":100,"height":100,"duration":3.,"tags":[]},"good-asset":{"id":"good-asset","type":"video","width":1080,"height":1920,"duration":3.,"tags":["product"]}});
    let out = compile(r.clone()).unwrap();
    assert!(
        visuals(&out)
            .iter()
            .all(|e| e["mediaId"] == "good-asset" && e["trimStart"] == (0.5 * TICKS as f64) as i64)
    );
    r.input.resource_bindings.push(ResourceBinding {
        slot_id: "primary".into(),
        asset_id: "none".into(),
        enabled: false,
    });
    assert!(
        compile(r)
            .unwrap_err()
            .to_string()
            .contains("required resource missing")
    );
}

#[test]
fn filters_motion_and_dissolve_compose_on_text_image_and_shapes_and_replay() {
    for kind in ["text", "image", "rectangle"] {
        let mut input = input();
        input["template"]["composition"] = composition();
        input["template"]["elements"][0]["features"]["representation"] = json!(kind);
        input["template"]["elements"][0]["features"]["mediaUse"] = Value::Null;
        input["template"]["elements"][0]["motions"] = json!([{"property":"opacity","keys":[{"time":0,"value":0.6,"easing":"linear"},{"time":1,"value":0.6,"easing":"linear"}]}]);
        let mut r = request(input);
        if kind == "image" {
            r.input.template.elements[0].resource_id = Some("picture".into());
            r.input.template.resource_slots = serde_json::from_value(
                json!([{"id":"picture","representation":"image","description":"test","tags":[]}]),
            )
            .unwrap();
            r.input.template.bind("picture", "asset");
            r.media = json!({"asset":{"id":"asset","type":"image","width":1080,"height":1920}});
        }
        let out = compile(r.clone()).unwrap();
        let clips = visuals(&out);
        assert_eq!(clips.len(), 2);
        let incoming = clips
            .iter()
            .find(|e| e["params"]["template.transitionId"] == "join")
            .unwrap();
        assert_eq!(incoming["startTime"], (0.8 * TICKS as f64) as i64);
        assert_eq!(incoming["duration"], (1.2 * TICKS as f64) as i64);
        assert_eq!(incoming["effects"][0]["type"], "blur");
        assert_eq!(incoming["effects"][1]["type"], "color-grade");
        assert!(
            incoming["animations"]["transform.scaleX"]["keys"]
                .as_array()
                .unwrap()
                .len()
                > 2
        );
        let alpha = incoming["animations"]["opacity"]["keys"]
            .as_array()
            .unwrap();
        assert_eq!(alpha[0]["value"], 0.);
        assert!((alpha.last().unwrap()["value"].as_f64().unwrap() - 0.6).abs() < 1e-9);
        let middle = alpha
            .iter()
            .find(|k| k["time"] == (0.1 * TICKS as f64) as i64)
            .unwrap();
        assert!((middle["value"].as_f64().unwrap() - 0.3).abs() < 1e-6);
        assert_eq!(clips[0]["id"], incoming["id"]);
        assert_eq!(out["document"]["metadata"]["duration"], 2 * TICKS);
        r.document = out["document"].clone();
        assert_eq!(compile(r).unwrap()["deduplicated"], true);
    }
}

#[test]
fn non_speech_events_drive_scheduling_with_explainable_limits() {
    let mut input = input();
    input["words"] = json!([]);
    input["semanticUnits"] = json!([]);
    input["captionSpans"] = json!([]);
    input["template"]["elements"][0]["binding"] = json!("literal");
    input["template"]["elements"][0]["literal"] = json!("beat");
    input["template"]["composition"] = json!({"scheduling":[{"elementId":"caption","eventKind":"beat","minConfidence":0.5,"minStrength":0.2,"cooldownSeconds":0.5,"maxOccurrences":2,"strengthWeight":2,"confidenceWeight":1,"repetitionPenalty":0.3}]});
    input["soundEvents"] = json!([{"id":"a","kind":"beat","start":0.,"end":0.,"strength":0.8,"confidence":0.9,"sourceId":"music","evidence":"measured"},{"id":"b","kind":"beat","start":0.1,"end":0.1,"strength":0.8,"confidence":0.9,"sourceId":"music","evidence":"measured"},{"id":"c","kind":"beat","start":1.,"end":1.,"strength":0.8,"confidence":0.9,"sourceId":"music","evidence":"measured"},{"id":"d","kind":"beat","start":1.8,"end":1.8,"strength":0.8,"confidence":0.9,"sourceId":"music","evidence":"measured"}]);
    let mut layout = input["template"]["layouts"][0].clone();
    layout["id"] = json!("alternate");
    input["template"]["layouts"]
        .as_array_mut()
        .unwrap()
        .push(layout);
    input["template"]["composition"]["layoutPolicy"] = json!({"eventKind":"beat","intentMatchWeight":0.,"repetitionPenalty":1.,"minHoldSeconds":0.5,"baseScores":{}});
    let p = plan(serde_json::from_value(input.clone()).unwrap()).unwrap();
    assert!(p.words.is_empty() && p.captions.is_empty());
    assert_eq!(p.elements.len(), 2);
    assert_eq!(p.layouts.len(), 3);
    assert!(
        p.layouts
            .iter()
            .all(|l| l.caption_index.is_none() && l.sound_event_id.is_some())
    );
    assert_eq!(p.schedule_decisions[1].reason, "cooldown");
    assert_eq!(p.schedule_decisions[3].reason, "occurrence_limit");
    assert_eq!(p.schedule_decisions[2].score, 2.2);
    assert_eq!(visuals(&compile(request(input)).unwrap()).len(), 2);
}

#[test]
fn outgoing_envelope_is_an_independent_transition_parameter() {
    let mut input = input();
    input["template"]["composition"] = composition();
    input["template"]["composition"]["transitionEffects"][0]["outgoingFade"] = json!(true);
    let out = compile(request(input)).unwrap();
    let clips = visuals(&out);
    let outgoing = clips
        .iter()
        .find(|e| e["params"]["template.transitionOutId"] == "join")
        .unwrap();
    let keys = outgoing["animations"]["opacity"]["keys"]
        .as_array()
        .unwrap();
    assert_eq!(keys[0]["value"], 1.);
    assert_eq!(keys.last().unwrap()["value"], 0.);
    assert!(
        (keys
            .iter()
            .find(|k| k["time"] == (0.9 * TICKS as f64) as i64)
            .unwrap()["value"]
            .as_f64()
            .unwrap()
            - 0.5)
            .abs()
            < 1e-6
    );
}

#[test]
fn spatial_links_resolve_transitively_and_reject_cycles_or_missing_parents() {
    let mut input = input();
    let mut child = input["template"]["elements"][0].clone();
    child["id"] = json!("child");
    child["region"] = json!({"x":0.,"y":0.,"width":0.1,"height":0.1});
    input["template"]["elements"][0]["region"] = json!({"x":0.2,"y":0.2,"width":0.3,"height":0.2});
    input["template"]["elements"]
        .as_array_mut()
        .unwrap()
        .push(child);
    input["template"]["composition"] = json!({"spatialRelations":[{"elementId":"child","relativeTo":"caption","placement":"below","gap":0.02,"offsetX":0.,"offsetY":0.}]});
    let p = plan(serde_json::from_value(input.clone()).unwrap()).unwrap();
    let child = p.elements.iter().find(|e| e.element_id == "child").unwrap();
    assert!((child.region.y - 0.42).abs() < 1e-9);
    assert!((child.region.x - 0.3).abs() < 1e-9);
    input["template"]["composition"]["spatialRelations"].as_array_mut().unwrap().push(json!({"elementId":"caption","relativeTo":"child","placement":"above","gap":0.,"offsetX":0.,"offsetY":0.}));
    assert!(
        plan(serde_json::from_value(input).unwrap())
            .unwrap_err()
            .to_string()
            .contains("cyclic")
    );
}

#[test]
fn resource_requirements_reject_incompatible_catalog_metadata_and_preserve_fallback_offset() {
    let mut input = input();
    input["template"]["elements"][0]["features"]["representation"] = json!("video");
    input["template"]["elements"][0]["resourceId"] = json!("primary");
    input["template"]["elements"][0]["features"]["mediaUse"] = json!("broll");
    input["template"]["resourceSlots"] = json!([{"id":"primary","representation":"video","description":"primary","tags":[]},{"id":"fallback","representation":"video","description":"fallback","tags":[]}]);
    input["template"]["composition"] = json!({"resourceRequirements":[{"slotId":"primary","required":true,"minDurationSeconds":1.,"minWidth":720,"minHeight":720,"minAspectRatio":0.5,"maxAspectRatio":2.,"allowCrop":false,"requiredTags":["product"],"fallbackSlotIds":["fallback"]}]});
    let mut r = request(input);
    r.visual_bindings=serde_json::from_value(json!([{"resourceId":"fallback","mediaId":"asset","sourceStartSeconds":0.5,"fit":"contain"}])).unwrap();
    r.media = json!({"asset":{"id":"asset","type":"video","width":1080,"height":1920,"duration":3.,"tags":["product"]}});
    let out = compile(r.clone()).unwrap();
    assert!(
        visuals(&out)
            .iter()
            .all(|e| e["trimStart"] == (0.5 * TICKS as f64) as i64)
    );
    r.media["asset"]["tags"] = json!([]);
    assert!(compile(r.clone()).unwrap_err().to_string().contains("tags"));
    r.media["asset"]["tags"] = json!(["product"]);
    r.media["asset"]["width"] = json!(640);
    assert!(compile(r).unwrap_err().to_string().contains("dimensions"));
}

#[test]
fn chained_layout_dissolves_keep_audio_and_source_clock_and_layer_order() {
    let mut input = input();
    input["words"] = json!([{"text":"a","start":0.,"end":1.},{"text":"b","start":1.,"end":2.},{"text":"c","start":2.,"end":3.}]);
    input["durationSeconds"] = json!(3.);
    input["captionSpans"] = json!([]);
    input["semanticUnits"] = json!([{"startWord":0,"endWord":1,"intent":"neutral","keyword":null,"rationale":"a"},{"startWord":1,"endWord":2,"intent":"emphasis","keyword":null,"rationale":"b"},{"startWord":2,"endWord":3,"intent":"conclusion","keyword":null,"rationale":"c"}]);
    let base = input["template"]["layouts"][0].clone();
    input["template"]["layouts"] = json!([base.clone(), base.clone(), base]);
    for (i, intent) in ["neutral", "emphasis", "conclusion"].iter().enumerate() {
        input["template"]["layouts"][i]["id"] = json!(format!("l{i}"));
        input["template"]["layouts"][i]["mode"] = json!("full_bleed");
        input["template"]["layouts"][i]["intents"] = json!([intent]);
    }
    input["template"]["transitionRules"] = json!([{"id":"ab","fromLayoutId":"l0","toLayoutId":"l1","effect":"dissolve","durationSeconds":0.2},{"id":"bc","fromLayoutId":"l1","toLayoutId":"l2","effect":"dissolve","durationSeconds":0.2}]);
    let mut r = request(input);
    r.source = serde_json::from_value(json!({"trackId":"main","elementId":"source"})).unwrap();
    r.media = json!({"media":{"id":"media","type":"video","width":1080,"height":1920,"duration":5.,"hasAudio":true}});
    r.document["scenes"][0]["tracks"]["main"]["elements"] = json!([{"id":"source","type":"video","mediaId":"media","startTime":0,"duration":3*TICKS,"trimStart":TICKS,"trimEnd":TICKS,"params":{}}]);
    let out = compile(r.clone()).unwrap();
    let tracks = &out["document"]["scenes"][0]["tracks"];
    assert_eq!(tracks["audio"].as_array().unwrap().len(), 1);
    assert_eq!(tracks["audio"][0]["elements"][0]["duration"], 3 * TICKS);
    let clips = visuals(&out);
    let layouts: Vec<_> = clips
        .iter()
        .filter(|e| e["params"]["template.layoutId"].is_string())
        .collect();
    assert_eq!(layouts.len(), 2);
    assert_eq!(layouts[0]["params"]["template.layoutId"], "l2");
    for e in layouts {
        assert_eq!(
            e["trimStart"].as_i64().unwrap() - e["startTime"].as_i64().unwrap(),
            TICKS as i64
        );
        assert_eq!(e["isSourceAudioEnabled"], false);
    }
    assert_eq!(out["document"]["metadata"]["duration"], 3 * TICKS);
    r.document = out["document"].clone();
    assert_eq!(compile(r).unwrap()["deduplicated"], true);
}

#[test]
fn invalid_or_unexecutable_combinations_fail_before_document_is_returned() {
    let mut input = input();
    input["template"]["composition"] = composition();
    input["template"]["elements"][0]["features"]["representation"] = json!("audio");
    assert!(plan(serde_json::from_value::<PlanInput>(input).unwrap()).is_err());
    let mut input = self::input();
    input["template"]["composition"] = composition();
    input["template"]["elements"][0]["features"]["representation"] = json!("video");
    input["template"]["elements"][0]["features"]["mediaUse"] = json!("broll");
    input["template"]["elements"][0]["resourceId"] = json!("slot");
    input["template"]["resourceSlots"] =
        json!([{"id":"slot","representation":"video","description":"video","tags":[]}]);
    input["template"]["resourceBindings"] =
        json!([{"slotId":"slot","assetId":"media","enabled":true}]);
    let mut r = request(input);
    r.media =
        json!({"media":{"id":"media","type":"video","width":1080,"height":1920,"duration":3.}});
    assert!(compile(r).unwrap_err().to_string().contains("preroll"));
}

#[test]
fn text_background_corner_radius_preserves_legacy_and_other_channels() {
    let mut value = input();
    let style_id = value["template"]["elements"][0]["styleId"].clone();
    for style in value["template"]["styles"].as_array_mut().unwrap() {
        if style["id"] == style_id {
            style["background"] = json!("#101923");
        }
    }
    let old = compile(request(value.clone())).unwrap();
    assert!(
        visuals(&old)
            .iter()
            .all(|clip| clip["params"].get("background.cornerRadius").is_none())
    );
    for radius in [0., 35., 100.] {
        let mut variant = value.clone();
        for style in variant["template"]["styles"].as_array_mut().unwrap() {
            if style["id"] == style_id {
                style["backgroundCornerRadius"] = json!(radius);
            }
        }
        let output = compile(request(variant)).unwrap();
        for (before, after) in visuals(&old).iter().zip(visuals(&output)) {
            let mut params = after["params"].clone();
            assert_eq!(
                params
                    .as_object_mut()
                    .unwrap()
                    .remove("background.cornerRadius"),
                Some(json!(radius))
            );
            assert_ne!(
                params["template.requestHash"],
                before["params"]["template.requestHash"]
            );
            params["template.requestHash"] = before["params"]["template.requestHash"].clone();
            assert_eq!(params, before["params"]);
            assert_eq!(after["startTime"], before["startTime"]);
            assert_eq!(after["duration"], before["duration"]);
        }
    }
    for radius in [-1., 101.] {
        let mut invalid = value.clone();
        invalid["template"]["styles"][0]["backgroundCornerRadius"] = json!(radius);
        assert!(compile(request(invalid)).is_err());
    }
}

#[test]
fn background_opacity_motion_compiles_independently_and_composes() {
    let mut value = input();
    let style_id = value["template"]["elements"][0]["styleId"].clone();
    for style in value["template"]["styles"].as_array_mut().unwrap() {
        if style["id"] == style_id {
            style["background"] = json!("#101923");
            style["backgroundOpacity"] = json!(0.62);
        }
    }
    value["template"]["elements"][0]["motions"] = json!([
        {"property":"background_opacity","keys":[{"time":0.,"value":0.,"easing":"linear"},{"time":1.,"value":0.6,"easing":"linear"}]}
    ]);
    let result = compile(request(value.clone())).unwrap();
    for clip in visuals(&result) {
        assert_eq!(clip["params"]["opacity"].as_f64(), Some(1.));
        assert!(clip["animations"]["opacity"].is_null());
        assert_eq!(
            clip["animations"]["background.opacity"]["keys"][0]["value"],
            json!(0.)
        );
        assert_eq!(
            clip["animations"]["background.opacity"]["keys"][1]["value"],
            json!(0.6)
        );
    }
    value["template"]["composition"] = json!({"treatments":[{"id":"backing","operation":{"kind":"motion","channels":[{"property":"background_opacity","keys":[{"time":0.,"value":0.5,"easing":"linear"},{"time":1.,"value":0.5,"easing":"linear"}]}]}}],"applications":[{"treatmentId":"backing","target":{"kind":"element","id":"caption"},"enabled":true}]});
    let combined = compile(request(value.clone())).unwrap();
    for clip in visuals(&combined) {
        let keys = clip["animations"]["background.opacity"]["keys"]
            .as_array()
            .unwrap();
        assert_eq!(keys.last().unwrap()["value"], json!(0.3));
        assert!(clip["animations"]["opacity"].is_null());
    }
    value["template"]["elements"][0]["motions"] = json!([]);
    let static_base = compile(request(value)).unwrap();
    for clip in visuals(&static_base) {
        assert_eq!(
            clip["animations"]["background.opacity"]["keys"][0]["value"],
            json!(0.31)
        );
    }
}

#[test]
fn background_opacity_motion_rejects_incompatible_targets_and_values() {
    let mut value = input();
    value["template"]["elements"][0]["motions"] = json!([{ "property":"background_opacity","keys":[{"time":0.,"value":0.,"easing":"linear"},{"time":1.,"value":1.,"easing":"linear"}]}]);
    for style in value["template"]["styles"].as_array_mut().unwrap() {
        style["background"] = Value::Null;
    }
    assert!(
        compile(request(value.clone()))
            .unwrap_err()
            .to_string()
            .contains("enabled background")
    );
    for style in value["template"]["styles"].as_array_mut().unwrap() {
        style["background"] = json!("#000000");
    }
    let valid = value.clone();
    value["template"]["elements"][0]["motions"][0]["keys"][1]["value"] = json!(1.1);
    assert!(
        compile(request(value))
            .unwrap_err()
            .to_string()
            .contains("values must be 0-1")
    );
    let mut value = valid.clone();
    value["template"]["elements"][0]["features"]["representation"] = json!("rectangle");
    assert!(
        compile(request(value))
            .unwrap_err()
            .to_string()
            .contains("requires text")
    );
    let mut value = valid;
    let channels = value["template"]["elements"][0]["motions"].take();
    value["template"]["elements"][0]["motions"] = json!([]);
    let layout_id = value["template"]["layouts"][0]["id"].clone();
    value["template"]["composition"] = json!({"treatments":[{"id":"backing","operation":{"kind":"motion","channels":channels}}],"applications":[{"treatmentId":"backing","target":{"kind":"layout","id":layout_id},"enabled":true}]});
    assert!(
        compile(request(value))
            .unwrap_err()
            .to_string()
            .contains("requires text")
    );
}

#[test]
fn explicit_end_boundaries_are_independent_of_binding_and_start_offset() {
    let mut value = input();
    value["words"] = json!([{"text":"first","start":0.,"end":0.2},{"text":"second","start":0.2,"end":0.4},{"text":"third","start":0.6,"end":1.2},{"text":"fourth","start":1.5,"end":2.2}]);
    value["durationSeconds"] = json!(3.);
    value["semanticUnits"] = json!([{"startWord":0,"endWord":3,"intent":"neutral","keyword":{"startWord":0,"endWord":1},"rationale":"fixture"},{"startWord":3,"endWord":4,"intent":"neutral","keyword":null,"rationale":"fixture"}]);
    value["captionSpans"] = json!([{"startWord":0,"endWord":2},{"startWord":2,"endWord":3},{"startWord":3,"endWord":4}]);
    value["template"]["elements"][0]["timing"] =
        json!({"anchor":"keyword_start","offsetSeconds":0.05,"maxSeconds":10.,"minSeconds":0.1});
    let words = value["words"].clone();
    for binding in ["keyword", "literal"] {
        value["template"]["elements"][0]["binding"] = json!(binding);
        value["template"]["elements"][0]["literal"] = json!("fixed");
        for (boundary, expected) in [
            ("event_end", 0.2),
            ("cue_end", 0.4),
            ("semantic_end", 1.2),
            ("video_end", 3.),
        ] {
            value["template"]["elements"][0]["timing"]["endAnchor"] = json!(boundary);
            let output = plan(serde_json::from_value(value.clone()).unwrap()).unwrap();
            assert_eq!(output.elements.len(), 1);
            assert_eq!(output.elements[0].start, 0.05);
            assert_eq!(output.elements[0].end, expected);
            assert_eq!(
                output.elements[0].content,
                if binding == "keyword" {
                    "first"
                } else {
                    "fixed"
                }
            );
            assert_eq!(value["words"], words);
        }
    }
    value["template"]["elements"][0]["timing"]["maxSeconds"] = json!(0.25);
    let output = plan(serde_json::from_value(value.clone()).unwrap()).unwrap();
    assert!((output.elements[0].end - 0.3).abs() < 1e-10);
    value["template"]["elements"][0]["timing"]["endAnchor"] = json!("cue_end");
    value["semanticUnits"][0]["keyword"]["endWord"] = json!(3);
    assert!(
        plan(serde_json::from_value(value.clone()).unwrap())
            .unwrap_err()
            .to_string()
            .contains("crosses its associated caption")
    );
    value["template"]["elements"][0]["timing"]["anchor"] = json!("video_start");
    for (end, message) in [
        ("cue_end", "associated with a caption"),
        ("semantic_end", "associated with a semantic unit"),
    ] {
        value["template"]["elements"][0]["timing"]["endAnchor"] = json!(end);
        assert!(
            plan(serde_json::from_value(value.clone()).unwrap())
                .unwrap_err()
                .to_string()
                .contains(message)
        );
    }
}

#[test]
fn omitted_end_boundary_preserves_serialization_and_existing_schedule() {
    let value = input();
    let parsed: PlanInput = serde_json::from_value(value.clone()).unwrap();
    assert!(
        serde_json::to_value(&parsed.template.elements[0].timing)
            .unwrap()
            .get("endAnchor")
            .is_none()
    );
    let legacy = plan(parsed).unwrap();
    let mut explicit_null = value;
    explicit_null["template"]["elements"][0]["timing"]["endAnchor"] = Value::Null;
    let equivalent = plan(serde_json::from_value(explicit_null).unwrap()).unwrap();
    assert_eq!(
        serde_json::to_value(legacy).unwrap(),
        serde_json::to_value(equivalent).unwrap()
    );
}

#[test]
fn composite_active_intervals_restart_motion_without_retiming_children() {
    for (gap, stagger, expected) in [(0., 0., 2), (0.4, 0., 2), (0., 0.15, 2)] {
        let mut value = input();
        value["words"][1]["start"] = json!(1. + gap);
        value["words"][1]["end"] = json!(2. + gap);
        value["durationSeconds"] = json!(2.5 + gap);
        let mut second = value["template"]["elements"][0].clone();
        second["id"] = json!("back");
        second["timing"]["offsetSeconds"] = json!(stagger);
        value["template"]["elements"]
            .as_array_mut()
            .unwrap()
            .push(second);
        value["template"]["composition"] = json!({"groups":[{"id":"surface","elementIds":["caption","back"],"composite":true,"separateInstances":true}],"treatments":[{"id":"fade","operation":{"kind":"motion","channels":[{"property":"opacity","keys":[{"time":0,"value":0,"easing":"linear"},{"time":0.2,"value":1,"easing":"linear"},{"time":0.8,"value":1,"easing":"linear"},{"time":1,"value":0,"easing":"linear"}]}],"motionTiming":{"enterEnd":0.2,"enterSeconds":0.04,"exitStart":0.8,"exitSeconds":0.06}}}],"applications":[{"treatmentId":"fade","target":{"kind":"group","id":"surface"},"enabled":true}]});
        let planned = plan(serde_json::from_value(value.clone()).unwrap()).unwrap();
        assert_eq!(planned.groups.len(), expected);
        let mut ids = std::collections::HashSet::new();
        for group in &planned.groups {
            assert!(ids.insert(&group.instance_id));
        }
        let output = compile(request(value.clone())).unwrap();
        let controllers = visuals(&output);
        assert_eq!(controllers.len(), expected);
        let mut children = vec![];
        for c in controllers {
            let keys = c["animations"]["opacity"]["keys"].as_array().unwrap();
            assert_eq!(keys.first().unwrap()["value"], 0.);
            assert_eq!(keys.last().unwrap()["value"], 0.);
            let last_full = keys.iter().rev().find(|k| k["value"] == 1.).unwrap()["time"]
                .as_i64()
                .unwrap();
            assert_eq!(
                c["duration"].as_i64().unwrap() - last_full,
                (0.06 * TICKS as f64) as i64
            );
            for t in c["renderGroup"]["tracks"].as_array().unwrap() {
                for child in t["elements"].as_array().unwrap() {
                    children.push((
                        child["params"]["template.instanceId"].clone(),
                        child["startTime"].clone(),
                        child["duration"].clone(),
                    ));
                }
            }
        }
        assert_eq!(children.len(), planned.elements.len());
        for e in &planned.elements {
            assert!(children.contains(&(
                json!(e.instance_id),
                json!((e.start * TICKS as f64).round() as i64),
                json!(((e.end - e.start) * TICKS as f64).round() as i64)
            )));
        }
        value["template"]["composition"]["groups"][0]
            .as_object_mut()
            .unwrap()
            .remove("separateInstances");
        assert_eq!(
            plan(serde_json::from_value(value).unwrap())
                .unwrap()
                .groups
                .len(),
            1
        );
    }
}

#[test]
fn text_size_binding_compiles_axes_padding_and_exact_secondary_parent() {
    let mut value = input();
    let mut secondary = value["template"]["elements"][0].clone();
    secondary["id"] = json!("secondary");
    let mut child = secondary.clone();
    child["id"] = json!("ring");
    child["features"]["representation"] = json!("ellipse");
    child["region"] = json!({"x":0.2,"y":0.2,"width":0.1,"height":0.04});
    value["template"]["elements"]
        .as_array_mut()
        .unwrap()
        .extend([secondary, child]);
    value["template"]["composition"] = json!({"spatialRelations":[{
        "elementId":"ring","relativeTo":"secondary","placement":"below","gap":0.01,
        "offsetX":0.,"offsetY":0.,"followMotion":true,"referenceBounds":"text_box",
        "sizeBinding":{"width":{"factor":1.2,"padding":0.02},"height":{"factor":1.,"padding":0.005}}
    }]});
    let output = compile(request(value.clone())).unwrap();
    let clips = visuals(&output);
    let width = value["template"]["canvas"]["width"].as_f64().unwrap();
    let height = value["template"]["canvas"]["height"].as_f64().unwrap();
    for child in clips
        .iter()
        .filter(|c| c["params"]["template.elementId"] == "ring")
    {
        let descriptor = &child["textAttachment"]["sizeBinding"];
        assert_eq!(descriptor["childAnchor"], json!([0.5, 0.]));
        assert_eq!(
            descriptor["baselineSizePx"],
            json!([0.1 * width, 0.04 * height])
        );
        assert_eq!(descriptor["sourceSizePx"], width.min(height));
        assert_eq!(
            descriptor["width"],
            json!({"factor":1.2,"paddingPx":0.02*width})
        );
        assert_eq!(
            descriptor["height"],
            json!({"factor":1.,"paddingPx":0.005*height})
        );
        let parent = clips
            .iter()
            .find(|p| p["id"] == child["textAttachment"]["parent"]["elementId"])
            .unwrap();
        assert_eq!(parent["params"]["template.elementId"], "secondary");
        assert_eq!(child["startTime"], parent["startTime"]);
    }
    value["template"]["composition"]["spatialRelations"][0]["sizeBinding"] =
        json!({"width":{"factor":1.,"padding":0.}});
    let one_axis = compile(request(value.clone())).unwrap();
    assert!(
        visuals(&one_axis)
            .iter()
            .filter(|c| c["params"]["template.elementId"] == "ring")
            .all(|c| c["textAttachment"]["sizeBinding"].get("height").is_none())
    );
    value["template"]["composition"]["spatialRelations"][0]
        .as_object_mut()
        .unwrap()
        .remove("sizeBinding");
    let legacy = compile(request(value)).unwrap();
    assert!(
        visuals(&legacy)
            .iter()
            .all(|c| c["textAttachment"].get("sizeBinding").is_none())
    );
}

#[test]
fn text_size_binding_rejects_unsupported_and_invalid_relations() {
    let schema =
        serde_json::to_value(schemars::schema_for!(super::composition::TextSizeAxis)).unwrap();
    assert_eq!(schema["properties"]["factor"]["exclusiveMinimum"], 0.);
    assert_eq!(schema["properties"]["factor"]["maximum"], 20.);
    assert_eq!(schema["properties"]["padding"]["minimum"], 0.);
    assert_eq!(schema["properties"]["padding"]["maximum"], 1.);
    let mut template: Template = serde_json::from_value(input()["template"].clone()).unwrap();
    let mut child = template.elements[0].clone();
    child.id = "child".into();
    child.features.representation = Representation::Rectangle;
    template.elements.push(child);
    let valid = json!({"elementId":"child","relativeTo":"caption","placement":"overlay","gap":0.,"offsetX":0.,"offsetY":0.,"followMotion":true,"referenceBounds":"text_box","sizeBinding":{"width":{"factor":1.,"padding":0.}}});
    template.composition.spatial_relations = serde_json::from_value(json!([valid])).unwrap();
    template.validate().unwrap();
    for binding in [
        json!({}),
        json!({"width":{"factor":0.,"padding":0.}}),
        json!({"width":{"factor":21.,"padding":0.}}),
        json!({"height":{"factor":1.,"padding":-0.1}}),
        json!({"height":{"factor":1.,"padding":1.1}}),
    ] {
        let mut invalid = template.clone();
        invalid.composition.spatial_relations[0].size_binding =
            Some(serde_json::from_value(binding).unwrap());
        assert!(invalid.validate().is_err());
    }
    let mut invalid = template.clone();
    invalid.composition.spatial_relations[0].reference_bounds = Default::default();
    assert!(
        invalid
            .validate()
            .unwrap_err()
            .to_string()
            .contains("text-box")
    );
    let mut invalid = template.clone();
    invalid.elements[1].features.representation = Representation::Text;
    assert!(
        invalid
            .validate()
            .unwrap_err()
            .to_string()
            .contains("native rectangle")
    );
    let mut invalid = template.clone();
    invalid.elements[0].features.representation = Representation::Rectangle;
    assert!(
        invalid
            .validate()
            .unwrap_err()
            .to_string()
            .contains("text parent")
    );
    let mut follower = template.elements[1].clone();
    follower.id = "follower".into();
    template.elements.push(follower);
    template.composition.spatial_relations.push(serde_json::from_value(json!({"elementId":"follower","relativeTo":"child","placement":"right","gap":0.,"offsetX":0.,"offsetY":0.,"followMotion":true})).unwrap());
    assert!(
        template
            .validate()
            .unwrap_err()
            .to_string()
            .contains("following a size-bound")
    );
}
