use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TagEvidence {
    pub tag: String,
    pub reason: String,
    pub start_seconds: f64,
    pub end_seconds: f64,
    pub confidence: f64,
}

// Malformed optional evidence must not prevent review of otherwise valid analysis.
pub fn deserialize<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Vec<TagEvidence>, D::Error> {
    let value = serde_json::Value::deserialize(deserializer)?;
    Ok(value
        .as_array()
        .into_iter()
        .flatten()
        .take(120)
        .filter_map(|entry| serde_json::from_value(entry.clone()).ok())
        .collect())
}

/// Validate window-relative evidence, then convert its timestamps to source seconds.
pub fn normalize(
    entries: Vec<TagEvidence>,
    tags: &[String],
    holiday_tags: &[String],
    window_start: f64,
    window_end: f64,
    source_offset: f64,
) -> Vec<TagEvidence> {
    if !window_start.is_finite()
        || !window_end.is_finite()
        || window_end < window_start
        || !source_offset.is_finite()
    {
        return vec![];
    }
    let valid = entries.into_iter().filter_map(|mut entry| {
        entry.tag = entry.tag.trim().to_owned();
        entry.reason = entry.reason.trim().to_owned();
        if !(tags.contains(&entry.tag) || holiday_tags.contains(&entry.tag))
            || entry.reason.is_empty()
            || entry.reason.chars().count() > 1000
            || !entry.confidence.is_finite()
            || !(0.0..=1.0).contains(&entry.confidence)
            || !entry.start_seconds.is_finite()
            || !entry.end_seconds.is_finite()
            || entry.start_seconds < window_start
            || entry.end_seconds > window_end
            || entry.end_seconds < entry.start_seconds
        {
            return None;
        }
        entry.start_seconds += source_offset;
        entry.end_seconds += source_offset;
        Some(entry)
    });
    let mut normalized = vec![];
    merge(&mut normalized, valid);
    normalized
}

pub fn merge(target: &mut Vec<TagEvidence>, entries: impl IntoIterator<Item = TagEvidence>) {
    for entry in entries {
        if let Some(existing) = target.iter_mut().find(|existing| {
            existing.tag == entry.tag
                && existing.reason == entry.reason
                && (existing.start_seconds - entry.start_seconds).abs() < 0.001
                && (existing.end_seconds - entry.end_seconds).abs() < 0.001
        }) {
            existing.confidence = existing.confidence.max(entry.confidence);
        } else if target.len() < 120 {
            target.push(entry);
        }
    }
}

pub fn prompt() -> &'static str {
    "\n标签依据另用 tagEvidence 数组，保留原 evidence 文本不变。每个选中的结构小类或节日标签必须有一项依据：{\"tag\":\"已配置标签原文\",\"reason\":\"直接可见的匹配理由\",\"startSeconds\":0,\"endSeconds\":1,\"confidence\":0.9}。时间以本次观察窗口0秒为起点，必须落在当前分析范围内；原片择片时只能引用选中 segment 范围内的画面。单帧依据可让起止时间相同。confidence 为0到1，仅表达把握程度。无可见依据不选该标签，不补造时间或证据；没有匹配时返回空数组。tagEvidence 的时间只用于定位证据，不是切分或加工建议。"
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(tag: &str, start: f64, end: f64) -> TagEvidence {
        TagEvidence {
            tag: tag.into(),
            reason: "visible action".into(),
            start_seconds: start,
            end_seconds: end,
            confidence: 0.9,
        }
    }

    #[test]
    fn rejects_unselected_and_out_of_range_evidence_and_offsets_valid_entries() {
        let tags = vec!["demo".into()];
        let result = normalize(
            vec![
                entry("demo", 2.0, 3.0),
                entry("other", 2.0, 3.0),
                entry("demo", 1.0, 3.0),
                entry("demo", 3.0, 6.0),
            ],
            &tags,
            &[],
            2.0,
            5.0,
            28.0,
        );
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].start_seconds, 30.0);
        assert_eq!(result[0].end_seconds, 31.0);
    }

    #[test]
    fn rejects_empty_reason_non_finite_and_invalid_confidence() {
        let mut invalid = vec![entry("demo", f64::NAN, 1.0), entry("demo", 2.0, 1.0)];
        let mut blank = entry("demo", 0.0, 1.0);
        blank.reason = " ".into();
        invalid.push(blank);
        let mut low = entry("demo", 0.0, 1.0);
        low.confidence = -0.1;
        invalid.push(low);
        let mut high = entry("demo", 0.0, 1.0);
        high.confidence = 1.1;
        invalid.push(high);
        assert!(normalize(invalid, &["demo".into()], &[], 0.0, 3.0, 0.0).is_empty());
    }

    #[test]
    fn keeps_distinct_occurrences_and_deduplicates_repeated_evidence() {
        let mut target = vec![entry("demo", 0.0, 1.0)];
        let mut repeated = target[0].clone();
        repeated.confidence = 0.95;
        merge(&mut target, vec![repeated, entry("demo", 30.0, 31.0)]);
        assert_eq!(target.len(), 2);
        assert_eq!(target[0].confidence, 0.95);
    }
}
