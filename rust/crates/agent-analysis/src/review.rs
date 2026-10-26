use serde_json::{Value, json};

pub fn plan(input: &Value) -> Result<Value, String> {
    let doc = &input["document"];
    let clips: Vec<&Value> = doc["tracks"]
        .as_array()
        .ok_or("No tracks to review")?
        .iter()
        .filter(|t| t["hidden"] != true)
        .flat_map(|t| t["elements"].as_array().into_iter().flatten())
        .collect();
    let duration = clips
        .iter()
        .map(|e| {
            e["startTimeSeconds"].as_f64().unwrap_or(0.0)
                + e["durationSeconds"].as_f64().unwrap_or(0.0)
        })
        .fold(0.0, f64::max);
    let fps = doc["settings"]["fps"]["numerator"].as_f64().unwrap_or(30.0)
        / doc["settings"]["fps"]["denominator"]
            .as_f64()
            .unwrap_or(1.0)
            .max(1.0);
    let last = (duration - 1.0 / fps.max(1.0)).max(0.0);
    let mut times = vec![0.0, (duration / 2.0).min(last), last];
    for e in clips {
        if e["type"] == "audio" || e["hidden"] == true {
            continue;
        }
        let start = e["startTimeSeconds"].as_f64().unwrap_or(0.0);
        let length = e["durationSeconds"].as_f64().unwrap_or(0.0);
        times.push((start + length / 2.0).min(last));
    }
    times.sort_by(f64::total_cmp);
    times.dedup_by(|a, b| (*a - *b).abs() < 0.001);
    let total = times.len();
    if total > 12 {
        times = (0..12).map(|i| times[i * (total - 1) / 11]).collect();
    }
    Ok(
        json!({"atSeconds":times,"durationSeconds":duration,"omittedMoments":total.saturating_sub(12)}),
    )
}

pub fn decision(input: &Value) -> Result<Value, String> {
    let unresolved = |reason: &str| json!({"action":"unresolved","summary":reason});
    let Some(revision) = input["revision"].as_u64() else {
        return Ok(unresolved("无法确认当前工程版本。"));
    };
    if input["evidenceRevision"].as_u64() != Some(revision) || input["stable"] != true {
        return Ok(unresolved("工程在复核期间发生变化，画面证据已过期。"));
    }
    let report: Value = match input["report"].as_str().map(serde_json::from_str) {
        Some(Ok(v)) => v,
        _ => return Ok(unresolved("模型未返回有效的结构化检查结论。")),
    };
    if report["revision"].as_u64() != Some(revision) {
        return Ok(unresolved("检查结论与工程版本不一致。"));
    }
    let Some(findings) = report["findings"].as_array() else {
        return Ok(unresolved("检查结论缺少问题清单。"));
    };
    if findings.len() > 20
        || findings.iter().any(|f| {
            f["atSeconds"]
                .as_f64()
                .is_none_or(|n| !n.is_finite() || n < 0.0)
                || f["description"]
                    .as_str()
                    .is_none_or(|s| s.trim().is_empty() || s.len() > 4000)
        })
    {
        return Ok(unresolved("检查结论的问题清单格式无效。"));
    }
    let Some(summary) = report["summary"]
        .as_str()
        .filter(|s| !s.trim().is_empty() && s.len() <= 4000)
    else {
        return Ok(unresolved("未提供有效检查说明。"));
    };
    let action = match report["verdict"].as_str() {
        Some("pass") if findings.is_empty() && input["lintErrors"].as_u64() == Some(0) => "pass",
        Some("repair") if !findings.is_empty() && input["repairs"].as_u64() == Some(0) => "repair",
        _ => "unresolved",
    };
    Ok(json!({"action":action,"summary":summary,"findings":findings}))
}
