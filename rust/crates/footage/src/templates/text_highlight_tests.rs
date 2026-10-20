use super::{
    compiler::compile,
    composition_tests::{input, request},
    rhythm::{PlanInput, plan},
};
use serde_json::{Value, json};

#[test]
fn typography_and_axis_motion_survive_compilation() {
    let mut v = input();
    let style_id = v["template"]["elements"][0]["styleId"]
        .as_str()
        .unwrap()
        .to_owned();
    for style in v["template"]["styles"].as_array_mut().unwrap() {
        if style["id"] == style_id {
            style["letterSpacing"] = json!(6.);
            style["textAlign"] = json!("left");
        }
    }
    v["template"]["elements"][0]["motions"] = json!([
        {"property":"scale_x","keys":[{"time":0.,"value":0.7,"easing":"linear"},{"time":1.,"value":0.8,"easing":"linear"}]},
        {"property":"scale_y","keys":[{"time":0.,"value":1.2,"easing":"linear"},{"time":1.,"value":1.3,"easing":"linear"}]}
    ]);
    let result = compile(request(v.clone())).unwrap();
    let clip = &result["document"]["scenes"][0]["tracks"]["overlay"][0]["elements"][0];
    assert_eq!(clip["params"]["letterSpacing"], 6.);
    assert_eq!(clip["params"]["textAlign"], "left");
    assert_eq!(
        clip["animations"]["transform.scaleX"]["keys"][0]["value"],
        0.7
    );
    assert_eq!(
        clip["animations"]["transform.scaleY"]["keys"][0]["value"],
        1.2
    );
    let uniform = json!({"property":"scale","keys":[{"time":0.,"value":1.,"easing":"linear"},{"time":1.,"value":1.,"easing":"linear"}]});
    v["template"]["elements"][0]["motions"]
        .as_array_mut()
        .unwrap()
        .push(uniform);
    assert!(compile(request(v)).is_err());
}

#[test]
fn legacy_typography_defaults_and_validation() {
    let mut v = input();
    for style in v["template"]["styles"].as_array_mut().unwrap() {
        style.as_object_mut().unwrap().remove("letterSpacing");
        style.as_object_mut().unwrap().remove("textAlign");
    }
    let result = compile(request(v.clone())).unwrap();
    let clip = &result["document"]["scenes"][0]["tracks"]["overlay"][0]["elements"][0];
    assert_eq!(clip["params"]["letterSpacing"], 0.);
    assert_eq!(clip["params"]["textAlign"], "center");
    v["template"]["styles"][0]["letterSpacing"] = json!(501.);
    assert!(compile(request(v)).is_err());
}

fn highlighted() -> Value {
    let mut v = input();
    v["template"]["composition"]["treatments"] = json!([
        {"id":"highlight","operation":{"kind":"text_highlight","color":"#ff3355"}},
        {"id":"bounce","operation":{"kind":"motion","channels":[{"property":"scale","keys":[{"time":0.,"value":0.8,"easing":"ease_out"},{"time":1.,"value":1.,"easing":"linear"}]}]}}
    ]);
    v["template"]["composition"]["applications"] = json!([
        {"treatmentId":"highlight","target":{"kind":"element","id":"caption"},"enabled":true},
        {"treatmentId":"bounce","target":{"kind":"element","id":"caption"},"enabled":true}
    ]);
    v["template"]["elements"][0]["timing"]["maxSeconds"] = json!(10.);
    v
}

#[test]
fn highlight_outline_reserves_stable_layout_space_for_direct_and_shared_targets() {
    for alignment in ["left", "center", "right"] {
        for shared in [false, true] {
            let mut v = highlighted();
            let style_id = v["template"]["elements"][0]["styleId"]
                .as_str()
                .unwrap()
                .to_owned();
            let style = v["template"]["styles"]
                .as_array_mut()
                .unwrap()
                .iter_mut()
                .find(|s| s["id"] == style_id)
                .unwrap();
            style["textAlign"] = json!(alignment);
            style["strokeWidth"] = json!(2.);
            v["template"]["composition"]["treatments"][0]["operation"]["mode"] =
                json!("active_word");
            v["template"]["composition"]["treatments"][0]["operation"]["stroke"] =
                json!({"color":"#FF3366","width":12.});
            if shared {
                v["template"]["composition"]["groups"] =
                    json!([{"id":"shared","elementIds":["caption"],"composite":false}]);
                v["template"]["composition"]["applications"][0]["target"] =
                    json!({"kind":"group","id":"shared"});
            }
            let on = compile(request(v.clone())).unwrap();
            v["template"]["composition"]["applications"][0]["enabled"] = json!(false);
            let off = compile(request(v)).unwrap();
            let params = |output: &Value| {
                output["document"]["scenes"][0]["tracks"]["overlay"][0]["elements"][0]["params"]
                    .clone()
            };
            let (a, b) = (params(&on), params(&off));
            for key in ["text.maxWidth", "text.maxHeight"] {
                assert!((b[key].as_f64().unwrap() - a[key].as_f64().unwrap() - 20.).abs() < 1e-8);
            }
            let shift = a["transform.positionX"].as_f64().unwrap()
                - b["transform.positionX"].as_f64().unwrap();
            assert!(
                (shift
                    - match alignment {
                        "left" => 10.,
                        "right" => -10.,
                        _ => 0.,
                    })
                .abs()
                    < 1e-8
            );
            assert_eq!(a["geometry.stroke.width"], b["geometry.stroke.width"]);
            assert_eq!(a["fontSize"], b["fontSize"]);
            assert_eq!(a["template.textLayoutWidth"], b["template.textLayoutWidth"]);
            let clip = &on["document"]["scenes"][0]["tracks"]["overlay"][0]["elements"][0];
            assert!(clip["animations"]["text.maxWidth"].is_null());
            assert!(clip["animations"]["text.maxHeight"].is_null());
        }
    }
    let mut narrow = highlighted();
    narrow["template"]["elements"][0]["region"]["width"] = json!(0.01);
    narrow["template"]["composition"]["treatments"][0]["operation"]["stroke"] =
        json!({"color":"#FF3366","width":30.});
    assert!(
        compile(request(narrow))
            .unwrap_err()
            .to_string()
            .contains("no room after stroke")
    );
}

#[test]
fn highlight_stroke_and_fixed_clip_compile_independently() {
    let mut v = highlighted();
    v["semanticUnits"][0]["keyword"] = json!({"startWord":0,"endWord":1});
    v["template"]["composition"]["treatments"][0]["operation"]["stroke"] =
        json!({"color":"#fff2d4","width":3.});
    v["template"]["composition"]["treatments"].as_array_mut().unwrap().push(json!({"id":"clip","operation":{"kind":"canvas_clip","region":{"x":0.1,"y":0.2,"width":0.8,"height":0.6}}}));
    v["template"]["composition"]["applications"]
        .as_array_mut()
        .unwrap()
        .push(
            json!({"treatmentId":"clip","target":{"kind":"element","id":"caption"},"enabled":true}),
        );
    let width = v["template"]["canvas"]["width"].as_f64().unwrap();
    let out = compile(request(v.clone())).unwrap();
    let params = &out["document"]["scenes"][0]["tracks"]["overlay"][0]["elements"][0]["params"];
    assert_eq!(params["text.highlightStrokeColor"], "#fff2d4");
    assert_eq!(params["text.highlightStrokeWidth"], 3.);
    assert_eq!(params["clip.x"], width * 0.1);
    assert_eq!(params["clip.enabled"], true);
    v["template"]["composition"]["treatments"][0]["operation"]["stroke"]["width"] = json!(-1.);
    assert!(compile(request(v)).is_err());
}

#[test]
fn lifecycle_and_dimming_compile_to_editable_instances() {
    let mut v = input();
    v["captionSpans"] = json!([{"startWord":0,"endWord":2}]);
    let mut keyword = v["template"]["elements"][0].clone();
    keyword["id"] = json!("incoming");
    keyword["timing"]["offsetSeconds"] = json!(0.5);
    v["template"]["elements"]
        .as_array_mut()
        .unwrap()
        .push(keyword);
    v["template"]["composition"]["lifecycles"] =
        json!([{"elementId":"caption","startEventId":"auto-video","endEventId":"auto-video"}]);
    v["template"]["composition"]["stateRelations"] = json!([{"sourceElementId":"incoming","targetElementId":"caption","opacity":0.35,"durationSeconds":0.2}]);
    let p = plan(serde_json::from_value::<PlanInput>(v.clone()).unwrap()).unwrap();
    let caption = p
        .elements
        .iter()
        .find(|e| e.element_id == "caption")
        .unwrap();
    assert_eq!(caption.end, 2.);
    assert_eq!(
        caption.motions.last().unwrap().keys.last().unwrap().value,
        0.35
    );
    assert!(compile(request(v.clone())).is_ok());
    v["template"]["composition"]["lifecycles"][0]["endEventId"] = json!("missing");
    assert!(compile(request(v)).is_err());
}

#[test]
fn accumulating_list_holds_items_and_rejects_reversed_events() {
    let mut v = input();
    v["captionSpans"] = json!([{"startWord":0,"endWord":2}]);
    let mut second = v["template"]["elements"][0].clone();
    second["id"] = json!("second");
    v["template"]["elements"]
        .as_array_mut()
        .unwrap()
        .push(second);
    v["events"] = json!([
        {"id":"first-entry","kind":"section","start":0.,"end":0.1,"strength":1.,"confidence":1.,"sourceId":"manual","evidence":"test"},
        {"id":"second-entry","kind":"section","start":0.7,"end":0.8,"strength":1.,"confidence":1.,"sourceId":"manual","evidence":"test"}
    ]);
    v["template"]["composition"]["accumulatingLists"] = json!([{"items":[{"elementId":"caption","startEventId":"first-entry"},{"elementId":"second","startEventId":"second-entry"}],"endEventId":"auto-video"}]);
    let p = plan(serde_json::from_value::<PlanInput>(v.clone()).unwrap()).unwrap();
    assert_eq!(
        p.elements
            .iter()
            .find(|e| e.element_id == "second")
            .unwrap()
            .start,
        0.7
    );
    assert!(p.elements.iter().all(|e| e.end == 2.));
    v["template"]["composition"]["accumulatingLists"][0]["items"]
        .as_array_mut()
        .unwrap()
        .reverse();
    assert!(compile(request(v)).is_err());
}

#[test]
fn inline_highlight_tracks_repeated_words_and_composes_with_motion() {
    let mut v = highlighted();
    v["words"][1]["text"] = json!("first");
    v["semanticUnits"][0]["keyword"] = json!({"startWord":1,"endWord":2});
    v["captionSpans"] = json!([{"startWord":0,"endWord":2}]);
    let result = compile(request(v)).unwrap();
    let clip = &result["document"]["scenes"][0]["tracks"]["overlay"][0]["elements"][0];
    let range: Value =
        serde_json::from_str(clip["params"]["text.highlightRange"].as_str().unwrap()).unwrap();
    assert_eq!(range, json!({"content":"first first","start":6,"end":11}));
    assert_eq!(clip["params"]["text.highlightColor"], "#ff3355");
    assert_eq!(clip["params"]["text.highlightEnabled"], true);
    assert!(
        clip["animations"]["transform.scaleX"]["keys"]
            .as_array()
            .unwrap()
            .len()
            > 1
    );
}

#[test]
fn inline_highlight_intersects_caption_spans_with_utf16_offsets() {
    let mut v = highlighted();
    v["durationSeconds"] = json!(4.);
    v["words"] = json!([
        {"text":"看","start":0.,"end":1.},
        {"text":"🌟","start":1.,"end":2.},
        {"text":"重点","start":2.,"end":3.},
        {"text":"内容","start":3.,"end":4.}
    ]);
    v["semanticUnits"][0]["endWord"] = json!(4);
    v["semanticUnits"][0]["keyword"] = json!({"startWord":1,"endWord":3});
    v["captionSpans"] = json!([{"startWord":0,"endWord":2},{"startWord":2,"endWord":4}]);
    let p = plan(serde_json::from_value::<PlanInput>(v).unwrap()).unwrap();
    let a = p.elements[0].keyword_range.as_ref().unwrap();
    let b = p.elements[1].keyword_range.as_ref().unwrap();
    assert_eq!((a.start, a.end), (1, 3));
    assert_eq!((b.start, b.end), (0, 2));
}

#[test]
fn inline_highlight_rejects_incompatible_targets_and_conflicts() {
    let mut v = highlighted();
    v["template"]["elements"][0]["binding"] = json!("translation");
    assert!(
        compile(request(v))
            .unwrap_err()
            .to_string()
            .contains("sentence/keyword")
    );
    let mut v = highlighted();
    v["template"]["composition"]["treatments"][1] =
        json!({"id":"second","operation":{"kind":"text_highlight","color":"#00ff00"}});
    v["template"]["composition"]["applications"][1]["treatmentId"] = json!("second");
    assert!(
        compile(request(v))
            .unwrap_err()
            .to_string()
            .contains("multiple highlight")
    );
    let mut v = highlighted();
    v["words"][1]["text"] = json!("שלום");
    v["semanticUnits"][0]["keyword"] = json!({"startWord":1,"endWord":2});
    assert!(
        compile(request(v))
            .unwrap_err()
            .to_string()
            .contains("left-to-right")
    );
}

#[test]
fn inline_highlight_without_a_keyword_preserves_plain_text() {
    let result = compile(request(highlighted())).unwrap();
    let clip = &result["document"]["scenes"][0]["tracks"]["overlay"][0]["elements"][0];
    assert!(clip["params"]["text.highlightEnabled"].is_null());
    assert!(clip["params"]["text.highlightRange"].is_null());
}

#[test]
fn inline_highlight_shared_text_group_is_not_a_composite_filter() {
    let mut v = highlighted();
    let mut second = v["template"]["elements"][0].clone();
    second["id"] = json!("second-caption");
    second["z"] = json!(2);
    v["template"]["elements"]
        .as_array_mut()
        .unwrap()
        .push(second);
    v["semanticUnits"][0]["keyword"] = json!({"startWord":0,"endWord":1});
    v["template"]["composition"]["groups"] =
        json!([{"id":"captions","elementIds":["caption","second-caption"],"composite":false}]);
    v["template"]["composition"]["applications"][0]["target"] =
        json!({"kind":"group","id":"captions"});
    let result = compile(request(v.clone())).unwrap();
    let count = result["document"]["scenes"][0]["tracks"]["overlay"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|t| t["elements"].as_array().unwrap())
        .filter(|e| e["params"]["text.highlightEnabled"] == true)
        .count();
    assert_eq!(count, 2);
    v["template"]["composition"]["groups"][0]["composite"] = json!(true);
    assert!(
        compile(request(v))
            .unwrap_err()
            .to_string()
            .contains("shared text group")
    );
}

#[test]
fn active_word_highlight_uses_measured_time_and_clears_during_pauses() {
    let mut v = highlighted();
    v["template"]["composition"]["treatments"][0]["operation"]["mode"] = json!("active_word");
    v["words"][1]["start"] = json!(1.5);
    v["captionSpans"] = json!([{"startWord":0,"endWord":2}]);
    v["template"]["elements"][0]["timing"]["offsetSeconds"] = json!(0.2);
    let result = compile(request(v)).unwrap();
    let clip = &result["document"]["scenes"][0]["tracks"]["overlay"][0]["elements"][0];
    let keys = clip["animations"]["text.highlightRange"]["keys"]
        .as_array()
        .unwrap();
    let ticks = crate::domain::TICKS as f64;
    assert_eq!(
        keys.iter()
            .map(|k| k["time"].as_i64().unwrap())
            .collect::<Vec<_>>(),
        vec![
            0,
            (0.8 * ticks) as i64,
            (1.3 * ticks) as i64,
            (1.8 * ticks) as i64
        ]
    );
    assert_eq!(keys[1]["value"], "");
    assert_eq!(keys[3]["value"], "");
    let first: Value = serde_json::from_str(keys[0]["value"].as_str().unwrap()).unwrap();
    let second: Value = serde_json::from_str(keys[2]["value"].as_str().unwrap()).unwrap();
    assert_eq!(first, json!({"content":"first second","start":0,"end":5}));
    assert_eq!(second, json!({"content":"first second","start":6,"end":12}));
    assert!(clip["animations"]["transform.scaleX"].is_object());
    assert_eq!(result["plan"]["words"][1]["start"], 1.5);
}

#[test]
fn active_word_highlight_refuses_unaligned_bindings() {
    let mut v = highlighted();
    v["template"]["composition"]["treatments"][0]["operation"]["mode"] = json!("active_word");
    v["template"]["elements"][0]["binding"] = json!("keyword");
    assert!(compile(request(v)).is_err());
}

#[test]
fn layout_phrases_compile_as_static_metadata_without_changing_timing() {
    let mut v = highlighted();
    v["words"][0]["text"] = json!("看🌟");
    v["words"][1]["text"] = json!("最重要");
    v["captionSpans"] = json!([{"startWord":0,"endWord":2}]);
    let before = plan(serde_json::from_value(v.clone()).unwrap()).unwrap();
    v["layoutPhrases"] = json!([{"wordSpan":{"startWord":1,"endWord":2}}]);
    let after = plan(serde_json::from_value(v.clone()).unwrap()).unwrap();
    assert_eq!(
        serde_json::to_value(&before.words).unwrap(),
        serde_json::to_value(&after.words).unwrap()
    );
    assert_eq!(
        serde_json::to_value(&before.captions).unwrap(),
        serde_json::to_value(&after.captions).unwrap()
    );
    assert_eq!(before.elements[0].start, after.elements[0].start);
    assert_eq!(before.elements[0].end, after.elements[0].end);
    let result = compile(request(v)).unwrap();
    let clip = &result["document"]["scenes"][0]["tracks"]["overlay"][0]["elements"][0];
    let value: Value =
        serde_json::from_str(clip["params"]["text.layoutPhrases"].as_str().unwrap()).unwrap();
    assert_eq!(
        value,
        json!({"content":"看🌟最重要","ranges":[{"start":3,"end":6}]})
    );
    assert!(clip["animations"]["text.layoutPhrases"].is_null());
}

#[test]
fn layout_phrases_reject_invalid_ranges_and_skip_cross_caption_groups() {
    let mut v = highlighted();
    for spans in [
        json!([{"startWord":1,"endWord":1}]),
        json!([{"startWord":0,"endWord":3}]),
        json!([{"startWord":0,"endWord":2},{"startWord":1,"endWord":2}]),
    ] {
        v["layoutPhrases"] = Value::Array(
            spans
                .as_array()
                .unwrap()
                .iter()
                .map(|span| json!({"wordSpan":span}))
                .collect(),
        );
        assert!(
            plan(serde_json::from_value(v.clone()).unwrap())
                .unwrap_err()
                .to_string()
                .contains("layout phrases")
        );
    }
    v["captionSpans"] = json!([{"startWord":0,"endWord":1},{"startWord":1,"endWord":2}]);
    v["layoutPhrases"] = json!([{"wordSpan":{"startWord":0,"endWord":2}}]);
    let p = plan(serde_json::from_value(v).unwrap()).unwrap();
    assert!(
        p.warnings
            .iter()
            .any(|w| w == "layout_phrase_crosses_caption:0:0:2")
    );
    assert!(p.elements.iter().all(|e| e.layout_ranges.is_empty()));
    assert_eq!(p.captions.len(), 2);
}

#[test]
fn keyword_layout_phrases_survive_display_punctuation_trimming() {
    for (tokens, phrase_start, displayed, ranges) in [
        (
            vec!["看🌟", "你的", "地方。"],
            1,
            "看🌟你的地方",
            json!([{"start":3,"end":7}]),
        ),
        (vec!["go", "go!"], 1, "go go", json!([{"start":3,"end":5}])),
        (vec!["go", "!"], 1, "go", json!([])),
    ] {
        let mut v = input();
        let n = tokens.len();
        v["words"] = json!(
            tokens
                .iter()
                .enumerate()
                .map(|(i, t)| json!({"text":t,"start":i as f64,"end":(i+1) as f64}))
                .collect::<Vec<_>>()
        );
        v["durationSeconds"] = json!(n);
        v["semanticUnits"] = json!([{"startWord":0,"endWord":n,"intent":"neutral","keyword":{"startWord":0,"endWord":n},"rationale":"test"}]);
        v["captionSpans"] = json!([{"startWord":0,"endWord":n}]);
        v["template"]["elements"][0]["binding"] = json!("keyword");
        v["template"]["elements"][0]["timing"]["anchor"] = json!("keyword_start");
        v["template"]["elements"][0]["timing"]["maxSeconds"] = json!(10.);
        let before = plan(serde_json::from_value(v.clone()).unwrap()).unwrap();
        v["layoutPhrases"] = json!([{"wordSpan":{"startWord":phrase_start,"endWord":n}}]);
        let after = plan(serde_json::from_value(v.clone()).unwrap()).unwrap();
        assert_eq!(after.elements[0].content, displayed);
        assert_eq!(
            serde_json::to_value(&after.elements[0].layout_ranges).unwrap(),
            ranges
        );
        assert_eq!(
            (after.elements[0].start, after.elements[0].end),
            (before.elements[0].start, before.elements[0].end)
        );
        assert_eq!(
            serde_json::to_value(&after.words).unwrap(),
            serde_json::to_value(&before.words).unwrap()
        );
        let output = compile(request(v)).unwrap();
        let metadata = &output["document"]["scenes"][0]["tracks"]["overlay"][0]["elements"][0]["params"]
            ["text.layoutPhrases"];
        if ranges.as_array().unwrap().is_empty() {
            assert!(metadata.is_null());
        } else {
            assert_eq!(
                serde_json::from_str::<Value>(metadata.as_str().unwrap()).unwrap(),
                json!({"content":displayed,"ranges":ranges})
            );
        }
    }
}
