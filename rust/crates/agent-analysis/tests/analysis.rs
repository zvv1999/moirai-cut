use moirai_agent_analysis::execute;
use serde_json::{Value, json};
fn clip(id: &str, kind: &str, start: f64, duration: f64) -> Value {
    json!({"id":id,"mediaId":id,"type":kind,"startTime":start*120000.0,"duration":duration*120000.0,"trimStart":0})
}
fn document() -> Value {
    json!({"revision":4,"metadata":{"id":"p"},"currentSceneId":"s","scenes":[{"id":"s","tracks":{
        "main":{"id":"main","elements":[clip("background","video",0.0,4.0)]},
        "overlay":[{"id":"product","elements":[clip("product","video",0.0,4.0)]},
            {"id":"text","elements":[clip("title","text",0.1,0.1)]}],"audio":[]}}]})
}
fn inspect(doc: Value) -> Value {
    execute(
        json!({"command":"inspect","document":doc,"startSeconds":0,"endSeconds":4,"maxFrames":2}),
    )
    .unwrap()
}

#[test]
fn sees_overlay_and_short_title_with_composite_times() {
    let result = inspect(document());
    assert!(result["byAsset"]["background"].is_object());
    assert!(result["byAsset"]["product"].is_object());
    assert_eq!(result["layers"].as_array().unwrap().len(), 3);
    assert!(
        result["compositeAtSeconds"]
            .as_array()
            .unwrap()
            .iter()
            .any(|v| (v.as_f64().unwrap() - 0.15).abs() < 0.001)
    );
    assert_eq!(result["coverage"]["sourceFramesAreComposite"], false);
}
#[test]
fn hidden_layers_do_not_invent_coverage() {
    let mut doc = document();
    doc["scenes"][0]["tracks"]["overlay"][0]["hidden"] = json!(true);
    let result = inspect(doc);
    assert!(result["byAsset"]["product"].is_null());
}
#[test]
fn maps_speed_reverse_freeze_and_stills() {
    let mut doc = document();
    let e = &mut doc["scenes"][0]["tracks"]["main"]["elements"][0];
    e["trimStart"] = json!(240000);
    e["sourceDuration"] = json!(960000);
    e["retime"] = json!({"rate":2,"reverse":true});
    let result = inspect(doc.clone());
    assert_eq!(
        result["byAsset"]["background"]["samples"][1]["sourceSeconds"],
        8.0
    );
    doc["scenes"][0]["tracks"]["main"]["elements"][0]["retime"]["freezeFrameAt"] = json!(60000);
    assert_eq!(
        inspect(doc.clone())["byAsset"]["background"]["sourceSeconds"],
        json!([2.5])
    );
    doc["scenes"][0]["tracks"]["main"]["elements"][0]["type"] = json!("image");
    assert_eq!(
        inspect(doc)["byAsset"]["background"]["sourceSeconds"],
        json!([0.0])
    );
}
#[test]
fn curve_speed_maps_to_integral() {
    let mut doc = document();
    doc["scenes"][0]["tracks"]["main"]["elements"][0]["retime"] =
        json!({"curve":{"points":[{"time":0,"rate":1},{"time":480000,"rate":3}]}});
    let result = inspect(doc);
    assert_eq!(
        result["byAsset"]["background"]["samples"][1]["sourceSeconds"],
        1.25
    );
}
#[test]
fn rejects_missing_scene_and_bad_range() {
    assert!(execute(json!({"command":"inspect","document":document(),"sceneId":"absent","startSeconds":0,"endSeconds":2})).is_err());
    assert!(
        execute(json!({"command":"inspect","document":document(),"startSeconds":3,"endSeconds":2}))
            .is_err()
    );
}
#[test]
fn reports_source_budget_omissions() {
    let mut doc = document();
    doc["scenes"][0]["tracks"]["overlay"]=json!((0..20).map(|i| json!({"id":format!("t{i}"),"elements":[clip(&format!("p{i}"),"video",0.0,4.0)]})).collect::<Vec<_>>());
    assert!(
        inspect(doc)["coverage"]["omittedSourceSamples"]
            .as_u64()
            .unwrap()
            > 0
    );
}
#[test]
fn pulse_train_finds_120_bpm_and_source_times() {
    let mut rms = vec![0.0; 300];
    for i in (25..300).step_by(25) {
        rms[i] = 0.5;
        rms[i + 1] = 0.3;
    }
    let r = execute(json!({"command":"rhythm","stepSeconds":0.02,"rms":rms})).unwrap();
    assert_eq!(r["estimatedBpm"], 120.0);
    assert_eq!(r["confidence"], 1.0);
    assert_eq!(r["onsets"][0]["seconds"], 0.5);
}
#[test]
fn silence_and_constant_tone_have_no_tempo() {
    for level in [0.0, 0.2] {
        let r =
            execute(json!({"command":"rhythm","stepSeconds":0.02,"rms":vec![level;200]})).unwrap();
        assert!(r["estimatedBpm"].is_null());
        assert_eq!(r["onsets"], json!([]));
    }
}
#[test]
fn ffmpeg_silence_metadata_is_valid() {
    let r=execute(json!({"command":"rhythm","stepSeconds":0.02,"levels":"frame:0\nlavfi.astats.Overall.RMS_level=-inf\n"})).unwrap();
    assert_eq!(r["energy"][0]["rmsDb"], -120.0);
}
fn review(verdict: &str, repairs: u64) -> Value {
    execute(json!({"command":"review_decision","revision":5,"evidenceRevision":5,"stable":true,"lintErrors":0,"repairs":repairs,
        "report":json!({"revision":5,"verdict":verdict,"summary":"Checked","findings":if verdict=="pass"{json!([])}else{json!([{"atSeconds":1,"description":"Title clipped"}])}}).to_string()})).unwrap()
}
#[test]
fn permits_one_repair_then_reports_unresolved() {
    assert_eq!(review("repair", 0)["action"], "repair");
    assert_eq!(review("repair", 1)["action"], "unresolved");
    assert_eq!(review("pass", 1)["action"], "pass");
}
#[test]
fn stale_or_malformed_review_never_passes() {
    for report in [
        "not json",
        r#"{"revision":4,"verdict":"pass","findings":[],"summary":"OK"}"#,
    ] {
        let r=execute(json!({"command":"review_decision","revision":5,"evidenceRevision":5,"stable":true,"lintErrors":0,"repairs":0,"report":report})).unwrap();
        assert_eq!(r["action"], "unresolved");
    }
}
#[test]
fn review_sampling_covers_whole_edit_and_text() {
    let r=execute(json!({"command":"review_plan","document":{"settings":{"fps":{"numerator":30,"denominator":1}},"tracks":[{"elements":[{"type":"video","startTimeSeconds":0,"durationSeconds":12},{"type":"text","startTimeSeconds":8,"durationSeconds":1}]}]}})).unwrap();
    assert!(r["atSeconds"].as_array().unwrap().contains(&json!(8.5)));
    assert!(
        r["atSeconds"]
            .as_array()
            .unwrap()
            .last()
            .unwrap()
            .as_f64()
            .unwrap()
            > 11.9
    );
}
