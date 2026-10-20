//! Authored sampling requests, predicted on the export tick grid. Not pixel evidence.
use super::model::MotionTiming;
use crate::domain::TICKS;
use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};

pub fn annotate(element: &mut Value, timing: Option<&MotionTiming>, source: &str) -> Result<()> {
    let Some(timing) = timing.filter(|t| t.coverage.is_some()) else {
        return Ok(());
    };
    super::motion_timing::validate(timing)?;
    let duration = element["duration"]
        .as_i64()
        .context("exit sampling duration missing")?;
    let seconds = duration as f64 / TICKS as f64;
    let (_, exit) = super::motion_timing::resolved_phase_seconds(timing, seconds);
    let exit_ticks = (exit * TICKS as f64).round() as i64;
    // A string metadata value remains transportable through the editor's parameter map.
    let mut requests: Vec<Value> = element["params"]["template.exitCoverage"]
        .as_str()
        .map(serde_json::from_str)
        .transpose()?
        .unwrap_or_default();
    requests.push(
        json!({"source":source,"exitStartTicks":duration-exit_ticks,"required":timing.coverage}),
    );
    element["params"]["template.exitCoverage"] = json!(serde_json::to_string(&requests)?);
    Ok(())
}

pub fn diagnose(document: &Value, scene_id: &str) -> Result<Value> {
    fn requested(value: &Value) -> bool {
        match value {
            Value::Object(map) => {
                map.contains_key("template.exitCoverage") || map.values().any(requested)
            }
            Value::Array(items) => items.iter().any(requested),
            _ => false,
        }
    }
    // Existing projects without authored requirements need no new metadata.
    if !requested(document) {
        return Ok(
            json!({"basis":"predicted_frame_sampling","samplingEvidence":"not_measured","status":"not_requested","records":[]}),
        );
    }

    let fps = &document["settings"]["fps"];
    let num = fps["numerator"].as_f64().context("sampling fps missing")?;
    let den = fps["denominator"]
        .as_f64()
        .context("sampling fps missing")?;
    let duration = document["metadata"]["duration"]
        .as_i64()
        .context("sampling duration missing")?;
    ensure!(
        num.is_finite() && den.is_finite() && num > 0. && den > 0.,
        "invalid sampling fps"
    );
    let step = (TICKS as f64 * den / num).round() as i64;
    ensure!(
        step > 0 && duration >= 0,
        "invalid sampling export interval"
    );
    let frames = duration / step;
    let scene = document["scenes"]
        .as_array()
        .context("sampling scenes missing")?
        .iter()
        .find(|s| s["id"] == scene_id)
        .context("sampling scene missing")?;
    let tracks = &scene["tracks"];
    let all = std::iter::once(&tracks["main"])
        .chain(tracks["overlay"].as_array().into_iter().flatten())
        .collect();
    let mut records = vec![];
    visit(all, 0, 0, duration, &[], step, frames, &mut records)?;
    let status = if records.is_empty() {
        "not_requested"
    } else if records
        .iter()
        .any(|r| r["findings"].as_array().is_some_and(|f| !f.is_empty()))
    {
        "warning"
    } else {
        "passed"
    };
    Ok(
        json!({"basis":"predicted_frame_sampling","samplingEvidence":"not_measured","status":status,"records":records}),
    )
}

// Count half-open intervals on the actual exporter integer-tick grid. Clamp to export.
fn count(start: i64, end: i64, step: i64, frames: i64) -> i64 {
    let ceil = |n: i64| n.max(0) / step + i64::from(n.max(0) % step != 0);
    (ceil(end).min(frames) - ceil(start).min(frames)).max(0)
}
#[allow(clippy::too_many_arguments)]
fn visit(
    tracks: Vec<&Value>,
    offset: i64,
    parent_start: i64,
    parent_end: i64,
    path: &[String],
    step: i64,
    frames: i64,
    out: &mut Vec<Value>,
) -> Result<()> {
    ensure!(path.len() <= 32, "sampling nesting exceeds limit");
    for track in tracks {
        if track["hidden"] == true {
            continue;
        }
        for e in track["elements"].as_array().into_iter().flatten() {
            if e["hidden"] == true {
                continue;
            }
            if !e["params"]["template.exitCoverage"].is_string() && !e["renderGroup"].is_object() {
                continue;
            }
            let own = e["startTime"]
                .as_i64()
                .context("sampling element start missing")?;
            let duration = e["duration"]
                .as_i64()
                .context("sampling element duration missing")?;
            let start = offset + own;
            let end = start + duration;
            let active_start = start.max(parent_start);
            let active_end = end.min(parent_end);
            if let Some(raw) = e["params"]["template.exitCoverage"].as_str() {
                let requests: Vec<Value> = serde_json::from_str(raw)?;
                for request in requests {
                    ensure!(out.len() < 10000, "sampling request budget exceeded");
                    let exit_start = start
                        + request["exitStartTicks"]
                            .as_i64()
                            .context("sampling phase missing")?;
                    let exit_frames = count(exit_start.max(active_start), active_end, step, frames);
                    let post_frames = count(active_end, frames * step, step, frames);
                    let required = &request["required"];
                    let mut findings = vec![];
                    if active_end < end {
                        findings.push("ancestor_or_export_clip");
                    }
                    if active_start >= active_end {
                        findings.push("no_active_interval");
                    }
                    if exit_frames
                        < required["minExitFrames"]
                            .as_i64()
                            .context("sampling minimum missing")?
                    {
                        findings.push("insufficient_exit_frames");
                    }
                    if post_frames
                        < required["minPostFrames"]
                            .as_i64()
                            .context("sampling minimum missing")?
                    {
                        findings.push("insufficient_post_frames");
                    }
                    out.push(json!({"elementId":e["id"],"templateElementId":e["params"]["template.elementId"],"templateInstanceId":e["params"]["template.instanceId"],"groupPath":path,"source":request["source"],"exitStartTicks":exit_start,"effectiveStartTicks":active_start,"effectiveEndTicks":active_end,"lastFrameTicks":if frames>0 {Some((frames-1)*step)}else{None},"exitFrames":exit_frames,"postFrames":post_frames,"required":required,"findings":findings}));
                }
            }
            if let Some(group) = e.get("renderGroup").filter(|g| g.is_object()) {
                let mut ancestry = path.to_vec();
                ancestry.push(
                    e["id"]
                        .as_str()
                        .context("sampling group id missing")?
                        .to_owned(),
                );
                let child_offset = offset + own
                    - group["timeOrigin"]
                        .as_i64()
                        .context("sampling group origin missing")?
                    - e["trimStart"].as_i64().unwrap_or(0);
                visit(
                    group["tracks"]
                        .as_array()
                        .context("sampling group tracks missing")?
                        .iter()
                        .collect(),
                    child_offset,
                    active_start,
                    active_end,
                    &ancestry,
                    step,
                    frames,
                    out,
                )?;
            }
        }
    }
    Ok(())
}

pub fn append_warnings(diagnostic: &Value, warnings: &mut Vec<String>) {
    for record in diagnostic["records"].as_array().into_iter().flatten() {
        if record["findings"].as_array().is_some_and(|f| !f.is_empty()) {
            warnings.push(format!(
                "exit_sampling:{}",
                json!({"basis":"predicted_frame_sampling","record":record})
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::model::MotionCoverage;
    use super::*;
    fn timing() -> MotionTiming {
        MotionTiming {
            enter_end: 0.2,
            exit_start: 0.9,
            enter_seconds: 0.09,
            exit_seconds: 0.04,
            coverage: Some(MotionCoverage {
                min_exit_frames: 1,
                min_post_frames: 1,
            }),
        }
    }
    fn element(start: i64, duration: i64) -> Value {
        json!({"id":"text","type":"text","startTime":start,"duration":duration,"params":{}})
    }
    fn doc(e: Value, duration: i64) -> Value {
        json!({"metadata":{"duration":duration},"settings":{"fps":{"numerator":30,"denominator":1}},"scenes":[{"id":"scene","tracks":{"main":{"elements":[e]},"overlay":[]}}]})
    }
    #[test]
    fn exit_sampling_reproduces_real_tail_failure_and_repair() {
        for (start, end, exits, posts) in [(1298400, 1481448, 0, 0), (1214400, 1464000, 1, 4)] {
            let mut e = element(start, end - start);
            annotate(&mut e, Some(&timing()), "element").unwrap();
            let d = diagnose(&doc(e, 1481448), "scene").unwrap();
            let r = &d["records"][0];
            assert_eq!(r["exitFrames"], exits);
            assert_eq!(r["postFrames"], posts);
            assert_eq!(r["lastFrameTicks"], 1476000);
            assert_eq!(d["status"], if exits == 0 { "warning" } else { "passed" });
            let mut warnings = vec![];
            append_warnings(&d, &mut warnings);
            assert_eq!(warnings.len(), usize::from(exits == 0));
        }
    }
    #[test]
    fn exit_sampling_default_cut_and_hidden_are_not_requested() {
        let mut e = element(0, 120000);
        let mut t = timing();
        t.coverage = None;
        annotate(&mut e, Some(&t), "element").unwrap();
        assert!(e["params"].get("template.exitCoverage").is_none());
        assert_eq!(
            diagnose(&doc(e.clone(), 120000), "scene").unwrap()["status"],
            "not_requested"
        );
        annotate(&mut e, Some(&timing()), "element").unwrap();
        e["hidden"] = json!(true);
        assert_eq!(
            diagnose(&doc(e, 120000), "scene").unwrap()["status"],
            "not_requested"
        );
    }
    #[test]
    fn exit_sampling_nested_clock_and_ancestor_clip() {
        let mut child = element(12000, 120000);
        annotate(&mut child, Some(&timing()), "element").unwrap();
        let mut group = element(60000, 132000);
        group["id"] = json!("group");
        group["renderGroup"] = json!({"timeOrigin":12000,"tracks":[{"elements":[child]}]});
        let okay = diagnose(&doc(group.clone(), 240000), "scene").unwrap();
        assert_eq!(okay["status"], "passed");
        assert_eq!(okay["records"][0]["effectiveEndTicks"], 180000);
        assert_eq!(okay["records"][0]["groupPath"], json!(["group"]));
        group["duration"] = json!(60000);
        let clipped = diagnose(&doc(group, 240000), "scene").unwrap();
        let f = clipped["records"][0]["findings"].as_array().unwrap();
        assert!(f.contains(&json!("ancestor_or_export_clip")));
        assert!(f.contains(&json!("insufficient_exit_frames")));
    }
    #[test]
    fn exit_sampling_integer_grid_boundary_and_fractional_fps() {
        assert_eq!(count(116000, 120000, 4000, 30), 1);
        assert_eq!(count(116001, 120000, 4000, 30), 0);
        assert_eq!(count(120000, 128000, 4000, 32), 2);
        let mut e = element(0, 120000);
        annotate(&mut e, Some(&timing()), "element").unwrap();
        let mut d = doc(e, 180000);
        d["settings"]["fps"] = json!({"numerator":30000,"denominator":1001});
        let r = diagnose(&d, "scene").unwrap();
        assert_eq!(r["records"][0]["lastFrameTicks"], 43 * 4004);
        assert_eq!(r["status"], "passed");
    }
    #[test]
    fn exit_sampling_validation_and_json_legacy_roundtrip() {
        let original =
            json!({"enterEnd":0.2,"exitStart":0.9,"enterSeconds":0.09,"exitSeconds":0.04});
        let t: MotionTiming = serde_json::from_value(original.clone()).unwrap();
        assert_eq!(serde_json::to_value(t).unwrap(), original);
        for (a, b, seconds) in [(0, 0, 0.04), (121, 1, 0.04), (1, 121, 0.04), (1, 1, 0.)] {
            let mut t = timing();
            t.coverage = Some(MotionCoverage {
                min_exit_frames: a,
                min_post_frames: b,
            });
            t.exit_seconds = seconds;
            assert!(super::super::motion_timing::validate(&t).is_err());
        }
        let mut t = timing();
        t.exit_seconds = 0.;
        t.coverage.as_mut().unwrap().min_exit_frames = 0;
        assert!(super::super::motion_timing::validate(&t).is_ok());
    }
}

/// Count actual decoded PTS inside the authored windows. Does not inspect pixels/audio.
pub fn observed_from_pts(prediction: &Value, pts: &[i64], sha: &str) -> Result<Value> {
    ensure!(
        !pts.is_empty() && pts.len() <= 2_000_000,
        "invalid observed frame budget"
    );
    ensure!(
        pts.iter().all(|t| *t >= 0) && pts.windows(2).all(|p| p[0] < p[1]),
        "decoded frame timestamps are missing or non-monotonic"
    );
    let mut records = vec![];
    for prior in prediction["records"]
        .as_array()
        .context("sampling prediction missing")?
    {
        let exit = prior["exitStartTicks"]
            .as_i64()
            .context("sampling exit missing")?;
        let start = prior["effectiveStartTicks"]
            .as_i64()
            .context("sampling start missing")?;
        let end = prior["effectiveEndTicks"]
            .as_i64()
            .context("sampling end missing")?;
        // PTS are validated strictly increasing once. Each window is logarithmic,
        // avoiding frames × instances work for dense, long exports.
        let end_index = pts.partition_point(|t| *t < end);
        let exit_index = pts.partition_point(|t| *t < exit.max(start));
        let exit_frames = end_index.saturating_sub(exit_index);
        let post_frames = pts.len() - end_index;
        let mut record = prior.clone();
        let mut findings: Vec<Value> = prior["findings"]
            .as_array()
            .context("sampling findings missing")?
            .iter()
            .filter(|v| {
                v.as_str() != Some("insufficient_exit_frames")
                    && v.as_str() != Some("insufficient_post_frames")
            })
            .cloned()
            .collect();
        if (exit_frames as u64)
            < prior["required"]["minExitFrames"]
                .as_u64()
                .context("sampling minimum missing")?
        {
            findings.push(json!("insufficient_exit_frames"));
        }
        if (post_frames as u64)
            < prior["required"]["minPostFrames"]
                .as_u64()
                .context("sampling minimum missing")?
        {
            findings.push(json!("insufficient_post_frames"));
        }
        record["exitFrames"] = json!(exit_frames);
        record["postFrames"] = json!(post_frames);
        record["lastFrameTicks"] = json!(pts.last());
        record["findings"] = json!(findings);
        records.push(record);
    }
    let status = if records
        .iter()
        .any(|r| r["findings"].as_array().is_some_and(|v| !v.is_empty()))
    {
        "warning"
    } else {
        "passed"
    };
    Ok(
        json!({"basis":"decoded_video_frame_pts","status":status,"outputSha256":sha,"timebase":TICKS,"framesObserved":pts.len(),"lastFrameTicks":pts.last(),"records":records,"pixelDisappearanceVerified":false,"listened":false}),
    )
}

/// Opt-in extra evidence: decode/probe problems remain unmeasured, never a false pass.
pub fn observe(
    media: &crate::media::Media,
    path: &std::path::Path,
    prediction: &Value,
    sha: &str,
) -> Value {
    if prediction["records"]
        .as_array()
        .is_none_or(|r| r.is_empty())
    {
        return json!({"status":"not_requested","basis":"decoded_video_frame_pts","outputSha256":sha});
    }
    let result = (|| -> Result<Value> {
        let raw = media.run(
            &media.ffprobe,
            &[
                "-v".into(),
                "error".into(),
                "-select_streams".into(),
                "v:0".into(),
                "-show_frames".into(),
                "-show_entries".into(),
                "frame=best_effort_timestamp_time".into(),
                "-of".into(),
                "json".into(),
                path.to_string_lossy().into(),
            ],
            180,
        )?;
        ensure!(
            raw.len() <= 128 * 1024 * 1024,
            "decoded PTS output budget exceeded"
        );
        let probe: Value = serde_json::from_str(&raw)?;
        let pts: Vec<i64> = probe["frames"]
            .as_array()
            .context("decoded PTS missing")?
            .iter()
            .map(|frame| {
                let seconds = frame["best_effort_timestamp_time"]
                    .as_str()
                    .context("decoded frame PTS missing")?
                    .parse::<f64>()?;
                ensure!(
                    seconds.is_finite()
                        && seconds >= 0.
                        && seconds * TICKS as f64 <= i64::MAX as f64,
                    "invalid decoded PTS"
                );
                Ok((seconds * TICKS as f64).round() as i64)
            })
            .collect::<Result<_>>()?;
        ensure!(
            crate::storage::hash(path)? == sha,
            "preview changed during sampling audit"
        );
        observed_from_pts(prediction, &pts, sha)
    })();
    result.unwrap_or_else(|error|json!({"basis":"decoded_video_frame_pts","status":"not_measured","outputSha256":sha,"reason":error.to_string()}))
}

#[cfg(test)]
mod observed_tests {
    use super::*;
    #[test]
    fn exit_sampling_actual_pts_do_not_inherit_predicted_pass_or_failure() {
        let prediction = json!({"records":[{"exitStartTicks":100,"effectiveStartTicks":0,"effectiveEndTicks":120,"required":{"minExitFrames":1,"minPostFrames":1},"findings":[]} ]});
        let absent = observed_from_pts(&prediction, &[0, 40, 80], "hash").unwrap();
        assert_eq!(absent["status"], "warning");
        let actual = observed_from_pts(&prediction, &[0, 40, 80, 110, 120], "hash").unwrap();
        assert_eq!(actual["status"], "passed");
        assert_eq!(actual["records"][0]["exitFrames"], 1);
        assert_eq!(actual["records"][0]["postFrames"], 1);
        assert_eq!(actual["outputSha256"], "hash");
        assert!(observed_from_pts(&prediction, &[0, 0, 40], "hash").is_err());
        assert!(observed_from_pts(&prediction, &[], "hash").is_err());
        let mut predicted_failure = prediction;
        predicted_failure["records"][0]["findings"] = json!(["insufficient_exit_frames"]);
        assert_eq!(
            observed_from_pts(&predicted_failure, &[0, 110, 120], "hash").unwrap()["status"],
            "passed"
        );
    }
    #[test]
    fn exit_sampling_actual_pts_respect_effective_start_and_retain_clip_findings() {
        let mut prediction = json!({"records":[{"exitStartTicks":100,"effectiveStartTicks":115,"effectiveEndTicks":130,"required":{"minExitFrames":1,"minPostFrames":1},"findings":[]} ]});
        let observed =
            observed_from_pts(&prediction, &[0, 100, 110, 120, 130, 140], "hash").unwrap();
        assert_eq!(observed["records"][0]["exitFrames"], 1);
        assert_eq!(observed["records"][0]["postFrames"], 2);
        prediction["records"][0]["findings"] = json!(["ancestor_or_export_clip"]);
        assert_eq!(
            observed_from_pts(&prediction, &[0, 120, 130], "hash").unwrap()["status"],
            "warning"
        );
        prediction["records"][0]["effectiveStartTicks"] = json!(150);
        let reversed = observed_from_pts(&prediction, &[0, 120, 130], "hash").unwrap();
        assert_eq!(reversed["records"][0]["exitFrames"], 0);
        prediction["records"][0]["required"] = json!({"minExitFrames":0,"minPostFrames":1});
        let truncated = observed_from_pts(&prediction, &[0, 100, 120], "hash").unwrap();
        assert_eq!(truncated["status"], "warning");
        assert_eq!(truncated["records"][0]["postFrames"], 0);
    }
}

#[cfg(test)]
mod probe_tests {
    use super::*;
    #[test]
    #[ignore = "requires ffmpeg and ffprobe (FFMPEG_BIN / FFPROBE_BIN)"]
    fn exit_sampling_reads_real_decoded_pts_and_reports_probe_failure() {
        let dir = tempfile::tempdir().unwrap();
        let media = crate::media::Media {
            ffmpeg: std::env::var("FFMPEG_BIN").unwrap(),
            ffprobe: std::env::var("FFPROBE_BIN").unwrap(),
            root: dir.path().into(),
        };
        let path = dir.path().join("sampling.mp4");
        media
            .run(
                &media.ffmpeg,
                &[
                    "-v".into(),
                    "error".into(),
                    "-f".into(),
                    "lavfi".into(),
                    "-i".into(),
                    "color=size=16x16:rate=30:duration=1".into(),
                    "-an".into(),
                    "-c:v".into(),
                    "libx264".into(),
                    "-y".into(),
                    path.to_string_lossy().into(),
                ],
                30,
            )
            .unwrap();
        let sha = crate::storage::hash(&path).unwrap();
        let prediction = json!({"records":[{"elementId":"test","effectiveStartTicks":0,"exitStartTicks":104000,"effectiveEndTicks":108000,"required":{"minExitFrames":1,"minPostFrames":1},"findings":[]}]});
        let observed = observe(&media, &path, &prediction, &sha);
        assert_eq!(observed["status"], "passed", "{observed}");
        assert_eq!(observed["framesObserved"], 30);
        assert_eq!(observed["lastFrameTicks"], 116000);
        assert_eq!(observed["records"][0]["exitFrames"], 1);
        assert_eq!(observed["records"][0]["postFrames"], 3);
        assert_eq!(observed["outputSha256"], sha);
        let bad = crate::media::Media {
            ffprobe: dir.path().join("absent-probe").to_string_lossy().into(),
            ..media
        };
        assert_eq!(
            observe(&bad, &path, &prediction, &sha)["status"],
            "not_measured"
        );
        assert_eq!(
            observe(&bad, &path, &json!({"records":[]}), &sha)["status"],
            "not_requested"
        );
    }
}
