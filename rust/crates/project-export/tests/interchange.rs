use moirai_project_export::{execute, plan};
use serde_json::{Value, json};

fn fixture(target: &str) -> Value {
    json!({"action":"plan","target":target,"folder":"/tmp/品牌 & export","id":"11111111-1111-4111-8111-111111111111","now":1000,
        "sources":[{"id":"source","name":"商品 & 人物.mp4","path":"/tmp/商品 & 人物.mp4","url":"file:///tmp/%E5%95%86%E5%93%81.mp4","width":1920,"height":1080,"durationSeconds":10.0,"audioChannels":2,"sampleRate":48000,"still":false}],
        "project":{"metadata":{"id":"project","name":"品牌 <A>"},"currentSceneId":"main","settings":{"fps":{"numerator":30000,"denominator":1001},"canvasSize":{"width":1080,"height":1920},"background":{"type":"color","color":"#000000"}},"scenes":[{"id":"main","tracks":{"main":{"id":"v1","name":"Main","type":"video","elements":[{"id":"c1","name":"商品","type":"video","mediaId":"source","startTime":0,"duration":120000,"trimStart":240000,"params":{"transform.positionX":54,"transform.positionY":-96,"transform.scaleX":1.2,"transform.scaleY":1.2,"volume":-6}}]},"overlay":[],"audio":[]}}]}})
}
fn element(v: &mut Value) -> &mut Value {
    &mut v["project"]["scenes"][0]["tracks"]["main"]["elements"][0]
}
#[test]
fn preserves_source_trim_gain_and_contain_geometry() {
    let p = plan(&fixture("premiere")).unwrap();
    let c = &p.video[0].clips[0];
    assert_eq!((c.start, c.end, c.source_in), (0, 30, 60));
    assert!((c.scale - 0.675).abs() < 1e-9);
    assert_eq!((c.x, c.y), (54.0, -96.0));
    assert!((p.audio[0].clips[0].gain - 0.501187).abs() < 1e-5);
    assert!(p.bakes.is_empty());
}
#[test]
fn adjacent_ntsc_cuts_share_one_rounded_edge() {
    let mut v = fixture("premiere");
    let mut second = element(&mut v).clone();
    second["id"] = json!("c2");
    second["startTime"] = json!(120000);
    v["project"]["scenes"][0]["tracks"]["main"]["elements"]
        .as_array_mut()
        .unwrap()
        .push(second);
    let p = plan(&v).unwrap();
    assert_eq!(p.video[0].clips[0].end, p.video[0].clips[1].start);
    assert_eq!(p.time(30), "30030/30000s");
}
#[test]
fn rejects_missing_media_before_export() {
    let mut v = fixture("premiere");
    v["sources"] = json!([]);
    assert!(plan(&v).unwrap_err().contains("Missing original"));
}
#[test]
fn rejects_empty_invalid_and_subframe_timelines() {
    for time in [-1, 0, 1] {
        let mut v = fixture("premiere");
        element(&mut v)["duration"] = json!(time);
        assert!(plan(&v).is_err());
    }
    let mut v = fixture("premiere");
    v["project"]["settings"]["fps"]["denominator"] = json!(0);
    assert!(plan(&v).is_err());
}
#[test]
fn out_of_source_is_not_silent_black() {
    let mut v = fixture("premiere");
    element(&mut v)["trimStart"] = json!(1200000);
    assert!(plan(&v).unwrap_err().contains("exceeds"));
}
#[test]
fn overlapping_clips_get_separate_lanes() {
    let mut v = fixture("premiere");
    let mut second = element(&mut v).clone();
    second["id"] = json!("c2");
    second["startTime"] = json!(60000);
    v["project"]["scenes"][0]["tracks"]["main"]["elements"]
        .as_array_mut()
        .unwrap()
        .push(second);
    assert_eq!(plan(&v).unwrap().video.len(), 2);
}
#[test]
fn hidden_and_muted_are_independent() {
    let mut v = fixture("jianying");
    v["project"]["scenes"][0]["tracks"]["main"]["hidden"] = json!(true);
    let p = plan(&v).unwrap();
    assert!(!p.video[0].clips[0].enabled);
    assert!(p.audio[0].clips[0].enabled);
    element(&mut v)["params"]["muted"] = json!(true);
    assert!(!plan(&v).unwrap().audio[0].clips[0].enabled);
}
#[test]
fn audio_fades_are_baked_with_gain_once() {
    let mut v = fixture("capcut");
    element(&mut v)["params"]["audioFadeIn"] = json!(0.2);
    let p = plan(&v).unwrap();
    assert_eq!(p.bakes[0].kind, "audio");
    assert_eq!(p.audio[0].clips[0].source_in, 0);
    assert_eq!(p.audio[0].clips[0].gain, 1.0);
    assert_eq!(p.video[0].clips[0].source, "source");
}
#[test]
fn unsupported_appearance_is_rendered_instead_of_discarded() {
    for (key, value) in [
        ("geometry.mirrorX", json!(true)),
        ("geometry.cornerRadius", json!(20)),
        ("crop.left", json!(10)),
        ("opacity", json!(0.5)),
        ("transform.rotate", json!(45)),
    ] {
        let mut v = fixture("premiere");
        element(&mut v)["params"][key] = value;
        let p = plan(&v).unwrap();
        assert_eq!(p.bakes[0].kind, "video");
        assert_eq!(p.video[0].clips[0].scale, 1.0);
        assert_eq!(p.video[0].clips[0].x, 0.0);
        assert!(!p.warnings.is_empty());
    }
}
#[test]
fn global_effects_and_transitions_preserve_composite() {
    let mut v = fixture("fcpxml");
    element(&mut v)["transitionIn"] = json!({"id":"fade"});
    let p = plan(&v).unwrap();
    assert_eq!(p.bakes[0].kind, "scene");
    assert_eq!(p.video.len(), 1);
    assert!(!p.audio.is_empty());
}
#[test]
fn titles_are_editable_except_in_premiere_and_srt_keeps_unicode() {
    for target in ["premiere", "fcpxml", "jianying", "capcut"] {
        let mut v = fixture(target);
        element(&mut v)["type"] = json!("text");
        element(&mut v).as_object_mut().unwrap().remove("mediaId");
        element(&mut v)["params"] = json!({"content":"你好 & <brand>\n新款","fontSize":5});
        let p = plan(&v).unwrap();
        assert!(p.subtitles.contains("你好 & <brand>\n新款"));
        if target == "premiere" {
            assert_eq!(p.bakes[0].kind, "still");
        } else {
            assert_eq!(p.video[0].clips[0].kind, "text");
            assert_eq!(p.video[0].clips[0].font_size, 5.0 * 1920.0 / 90.0);
        }
    }
}
#[test]
fn xml_escapes_names_and_uses_exact_rational_times() {
    for target in ["premiere", "fcpxml"] {
        let p = plan(&fixture(target)).unwrap();
        let out = execute(json!({"action":"serialize","plan":p})).unwrap();
        let doc = out["documents"][if target == "premiere" {
            "timeline.xml"
        } else {
            "timeline.fcpxml"
        }]
        .as_str()
        .unwrap();
        assert!(doc.contains("品牌 &lt;A&gt;"));
        if target == "fcpxml" {
            assert!(doc.contains("30030/30000s"));
        } else {
            assert!(doc.contains("<ntsc>TRUE</ntsc>"));
            assert!(doc.contains("<linkclipref>clip-c1-audio</linkclipref>"));
        }
    }
}
#[test]
fn drafts_have_consistent_ids_sources_microseconds_and_no_double_audio() {
    for target in ["jianying", "capcut"] {
        let p = plan(&fixture(target)).unwrap();
        let out = execute(json!({"action":"serialize","plan":p})).unwrap();
        assert_eq!(
            out["documents"]["draft_info.json"],
            out["documents"]["draft_content.json"]
        );
        let info: Value =
            serde_json::from_str(out["documents"]["draft_info.json"].as_str().unwrap()).unwrap();
        let meta: Value =
            serde_json::from_str(out["documents"]["draft_meta_info.json"].as_str().unwrap())
                .unwrap();
        assert_eq!(info["id"], meta["draft_id"]);
        assert_eq!(info["duration"], json!(1001000));
        let video = &info["tracks"][0]["segments"][0];
        assert!((video["volume"].as_f64().unwrap() - 0.501187).abs() < 1e-5);
        assert_eq!(info["tracks"].as_array().unwrap().len(), 1);
        assert_eq!(video["source_timerange"]["start"], json!(2002000));
        assert_eq!(video["material_id"], info["materials"]["videos"][0]["id"]);
        assert_eq!(
            meta["draft_materials"][0]["value"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            info["platform"]["app_id"],
            json!(if target == "jianying" { 3704 } else { 359289 })
        );
    }
}

#[test]
fn jianying_title_size_matches_native_canvas_width_calibration() {
    let mut v = fixture("jianying");
    element(&mut v)["type"] = json!("text");
    element(&mut v).as_object_mut().unwrap().remove("mediaId");
    element(&mut v)["params"] = json!({"content":"慢慢品尝","fontSize":4});
    let p = plan(&v).unwrap();
    let out = execute(json!({"action":"serialize","plan":p})).unwrap();
    let info: Value =
        serde_json::from_str(out["documents"]["draft_info.json"].as_str().unwrap()).unwrap();
    let content: Value =
        serde_json::from_str(info["materials"]["texts"][0]["content"].as_str().unwrap()).unwrap();
    // Native 1080x1920 acceptance: the old size 6 produced a 145 px title,
    // versus 332 px in Moirai. 13.6533 preserves its scale as editable text.
    assert!((content["styles"][0]["size"].as_f64().unwrap() - 13.653333).abs() < 1e-6);
    assert_eq!(info["tracks"][0]["type"], "text");
    v["project"]["settings"]["canvasSize"] = json!({"width":1920,"height":1080});
    // Same 85.333 px font in landscape: Moirai sizes are relative to height,
    // while the native draft's size is relative to width.
    element(&mut v)["params"]["fontSize"] = json!(4.0 * 1920.0 / 1080.0);
    let out = execute(json!({"action":"serialize","plan":plan(&v).unwrap()})).unwrap();
    let info: Value =
        serde_json::from_str(out["documents"]["draft_info.json"].as_str().unwrap()).unwrap();
    let content: Value =
        serde_json::from_str(info["materials"]["texts"][0]["content"].as_str().unwrap()).unwrap();
    assert!((content["styles"][0]["size"].as_f64().unwrap() - 7.68).abs() < 1e-9);
}

#[test]
fn jianying_mono_upmix_matches_moirai_without_changing_stereo_or_baked_audio() {
    for kind in ["video", "audio"] {
        for channels in [1, 2] {
            let mut v = fixture("jianying");
            element(&mut v)["type"] = json!(kind);
            v["sources"][0]["audioChannels"] = json!(channels);
            let p = plan(&v).unwrap();
            assert_eq!(p.warnings.len(), usize::from(channels == 1));
            let out = execute(json!({"action":"serialize","plan":p})).unwrap();
            let info: Value =
                serde_json::from_str(out["documents"]["draft_info.json"].as_str().unwrap())
                    .unwrap();
            let expected = 10.0_f64.powf(-6.0 / 20.0)
                * if channels == 1 {
                    std::f64::consts::SQRT_2
                } else {
                    1.0
                };
            assert!(
                (info["tracks"][0]["segments"][0]["volume"].as_f64().unwrap() - expected).abs()
                    < 1e-9
            );
            assert_eq!(info["tracks"].as_array().unwrap().len(), 1);

            element(&mut v)["params"]["muted"] = json!(true);
            let out = execute(json!({"action":"serialize","plan":plan(&v).unwrap()})).unwrap();
            let info: Value =
                serde_json::from_str(out["documents"]["draft_info.json"].as_str().unwrap())
                    .unwrap();
            assert_eq!(info["tracks"][0]["segments"][0]["volume"], 0.0);
        }
    }
    let mut v = fixture("jianying");
    v["sources"][0]["audioChannels"] = json!(1);
    element(&mut v)["params"]["audioFadeIn"] = json!(0.2);
    let out = execute(json!({"action":"serialize","plan":plan(&v).unwrap()})).unwrap();
    let info: Value =
        serde_json::from_str(out["documents"]["draft_info.json"].as_str().unwrap()).unwrap();
    assert_eq!(info["tracks"][0]["segments"][0]["volume"], 0.0);
    assert_eq!(info["tracks"][1]["segments"][0]["volume"], 1.0);
}

#[test]
fn xml_resource_ids_are_valid_when_media_uuid_starts_with_a_digit() {
    for target in ["premiere", "fcpxml"] {
        let mut v = fixture(target);
        v["sources"][0]["id"] = json!("123-source");
        element(&mut v)["mediaId"] = json!("123-source");
        let output = execute(json!({"action":"serialize","plan":plan(&v).unwrap()})).unwrap();
        let name = if target == "premiere" {
            "timeline.xml"
        } else {
            "timeline.fcpxml"
        };
        let doc = output["documents"][name].as_str().unwrap();
        assert!(!doc.contains("id=\"123-source\""));
        assert!(doc.contains(if target == "premiere" {
            "id=\"media-123-source\""
        } else {
            "id=\"asset-123-source\""
        }));
        if target == "fcpxml" {
            assert!(doc.contains("ref=\"asset-123-source\""));
        }
    }
}

#[test]
fn repeated_ids_are_rejected_before_serialization() {
    let mut v = fixture("premiere");
    let duplicate = element(&mut v).clone();
    v["project"]["scenes"][0]["tracks"]["main"]["elements"]
        .as_array_mut()
        .unwrap()
        .push(duplicate);
    assert!(plan(&v).unwrap_err().contains("duplicate clip id"));
}

#[test]
fn mixed_rate_xml_is_conformed_without_moving_cut_points() {
    let mut v = fixture("premiere");
    v["sources"][0]["fps"] = json!(60);
    let p = plan(&v).unwrap();
    assert_eq!(p.bakes.len(), 2);
    assert_eq!(p.video[0].clips[0].end, 30);
    assert_eq!(p.video[0].clips[0].source_in, 0);
    assert_eq!(p.audio[0].clips[0].source_in, 0);
    v["target"] = json!("jianying");
    assert!(plan(&v).unwrap().bakes.is_empty());
}
