use serde_json::{Value, json};

// Energy onsets are cut candidates, not semantic downbeats. Keep confidence low
// when the interval pattern is irregular instead of inventing a music grid.
pub fn rhythm(input: &Value) -> Result<Value, String> {
    let step = input["stepSeconds"]
        .as_f64()
        .filter(|n| n.is_finite() && *n > 0.0 && *n <= 0.1)
        .ok_or("Invalid envelope step")?;
    let decoded: Vec<Value> = input["levels"]
        .as_str()
        .unwrap_or("")
        .lines()
        .filter_map(|line| line.strip_prefix("lavfi.astats.Overall.RMS_level="))
        .map(|v| {
            v.parse::<f64>()
                .map(|db| json!(10_f64.powf(db / 20.0)))
                .map_err(|_| "Invalid RMS metadata")
        })
        .collect::<Result<_, _>>()?;
    let raw = input["rms"].as_array().unwrap_or(&decoded);
    if raw.len() > 360_000 {
        return Err("Invalid audio envelope".into());
    }
    let rms: Vec<f64> = raw
        .iter()
        .map(|v| {
            v.as_f64()
                .filter(|n| n.is_finite() && *n >= 0.0 && *n <= 1.01)
                .ok_or("Invalid RMS value")
        })
        .collect::<Result<_, _>>()?;
    let duration = rms.len() as f64 * step;
    let mut novelty = vec![0.0; rms.len()];
    let history = (0.1 / step).round().max(1.0) as usize;
    for i in 0..rms.len() {
        let from = i.saturating_sub(history);
        let base = rms[from..i].iter().sum::<f64>() / (i - from).max(1) as f64;
        novelty[i] = (rms[i] - base).max(0.0);
    }
    let peak = novelty.iter().copied().fold(0.0, f64::max);
    let threshold = (peak * 0.15).max(0.008);
    let mut peaks: Vec<usize> = vec![];
    for i in 1..rms.len().saturating_sub(1) {
        if novelty[i] < threshold || novelty[i] < novelty[i - 1] || novelty[i] <= novelty[i + 1] {
            continue;
        }
        if let Some(last) = peaks.last_mut()
            && (i - *last) as f64 * step < 0.15
        {
            if novelty[i] > novelty[*last] {
                *last = i;
            }
        } else {
            peaks.push(i);
        }
    }
    let intervals: Vec<f64> = peaks
        .windows(2)
        .map(|w| (w[1] - w[0]) as f64 * step)
        .collect();
    let mut sorted = intervals.clone();
    sorted.sort_by(f64::total_cmp);
    let median = sorted.get(sorted.len() / 2).copied().unwrap_or(0.0);
    let confidence = if intervals.len() >= 3 && median > 0.0 {
        intervals
            .iter()
            .filter(|n| (**n - median).abs() <= 0.06_f64.max(median * 0.12))
            .count() as f64
            / intervals.len() as f64
    } else {
        0.0
    };
    let tempo = if confidence >= 0.7 && (0.25..=1.5).contains(&median) {
        Some((60.0 / median * 10.0).round() / 10.0)
    } else {
        None
    };
    let block = (1.0 / step).round().max(1.0) as usize;
    let energy: Vec<Value> = rms.chunks(block).enumerate().map(|(i,c)| {
        let level=(c.iter().map(|v| v*v).sum::<f64>()/c.len() as f64).sqrt();
        json!({"startSeconds":i as f64*block as f64*step,"endSeconds":((i+1)*block).min(rms.len()) as f64*step,
            "rmsDb":(20.0*level.max(0.000001).log10()*10.0).round()/10.0})
    }).collect();
    let total = peaks.len();
    Ok(
        json!({"method":"energy-onsets-v1","timebase":"source-media-seconds","analyzedDurationSeconds":duration,
        "onsets":peaks.iter().take(600).map(|i| json!({"seconds":((*i as f64*step)*1000.0).round()/1000.0,"strength":(novelty[*i]/peak*1000.0).round()/1000.0})).collect::<Vec<_>>(),
        "omittedOnsets":total.saturating_sub(600),"energy":energy,"estimatedBpm":tempo,"confidence":confidence,
        "limitations":["Onsets are energy rises, not verified musical downbeats or speech boundaries.","Tempo can be half/double the musical tempo; validate against the material."]}),
    )
}
