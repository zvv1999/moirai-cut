use super::rhythm::{SemanticUnit, WordSpan};
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Action {
    Split { index: usize, at: usize },
    Merge { index: usize },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub word_count: usize,
    pub semantic_units: Vec<SemanticUnit>,
    pub action: Action,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Edited {
    pub semantic_units: Vec<SemanticUnit>,
    pub warnings: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CaptionRequest {
    pub word_count: usize,
    pub caption_spans: Vec<WordSpan>,
    #[serde(default)]
    pub semantic_units: Vec<SemanticUnit>,
    pub action: Action,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditedCaptions {
    pub caption_spans: Vec<WordSpan>,
}

pub fn edit_captions(mut input: CaptionRequest) -> Result<EditedCaptions> {
    if !input.semantic_units.is_empty() {
        validate(&input.semantic_units, input.word_count)?;
    }
    ensure!(
        (1..=100_000).contains(&input.word_count),
        "invalid word count"
    );
    let spans = &mut input.caption_spans;
    let mut next = 0;
    for span in spans.iter() {
        ensure!(
            span.start_word == next && span.end_word > next && span.end_word <= input.word_count,
            "caption spans must cover every word exactly once in order"
        );
        next = span.end_word;
    }
    ensure!(
        next == input.word_count,
        "caption spans omit trailing words"
    );
    match input.action {
        Action::Split { index, at } => {
            let original = spans
                .get(index)
                .ok_or_else(|| anyhow::anyhow!("unknown caption span"))?
                .clone();
            ensure!(
                at > original.start_word && at < original.end_word,
                "split must be inside the caption span"
            );
            spans.splice(
                index..=index,
                [
                    WordSpan {
                        start_word: original.start_word,
                        end_word: at,
                    },
                    WordSpan {
                        start_word: at,
                        end_word: original.end_word,
                    },
                ],
            );
        }
        Action::Merge { index } => {
            ensure!(
                index < spans.len().saturating_sub(1),
                "no following caption span"
            );
            ensure!(
                input.semantic_units.is_empty()
                    || input
                        .semantic_units
                        .iter()
                        .any(|unit| unit.start_word <= spans[index].start_word
                            && unit.end_word >= spans[index + 1].end_word),
                "字幕不能跨越语义段，请先合并对应的内容段落。"
            );
            let right = spans.remove(index + 1);
            spans[index].end_word = right.end_word;
        }
    }
    Ok(EditedCaptions {
        caption_spans: input.caption_spans,
    })
}

fn validate(units: &[SemanticUnit], count: usize) -> Result<()> {
    ensure!((1..=100_000).contains(&count), "invalid word count");
    let mut next = 0;
    for unit in units {
        ensure!(
            unit.start_word == next && unit.end_word > next && unit.end_word <= count,
            "semantic units must cover every word exactly once in order"
        );
        if let Some(key) = &unit.keyword {
            ensure!(
                key.start_word >= unit.start_word
                    && key.end_word <= unit.end_word
                    && key.end_word > key.start_word,
                "keyword must be inside its semantic unit"
            );
        }
        next = unit.end_word;
    }
    ensure!(next == count, "semantic units omit trailing words");
    Ok(())
}

pub fn edit(mut input: Request) -> Result<Edited> {
    validate(&input.semantic_units, input.word_count)?;
    let units = &mut input.semantic_units;
    let mut warnings = vec![];
    match input.action {
        Action::Split { index, at } => {
            ensure!(index < units.len(), "unknown semantic unit");
            let original = units[index].clone();
            ensure!(
                at > original.start_word && at < original.end_word,
                "split must be inside the semantic unit"
            );
            let mut left = original.clone();
            let mut right = original.clone();
            left.end_word = at;
            right.start_word = at;
            left.keyword = original.keyword.clone().filter(|key| key.end_word <= at);
            right.keyword = original.keyword.clone().filter(|key| key.start_word >= at);
            if original.keyword.is_some() && left.keyword.is_none() && right.keyword.is_none() {
                warnings.push("拆分点位于重点词内部，已取消该重点，请重新选择。".into());
            }
            left.rationale = "User split semantic unit at aligned word boundary".into();
            right.rationale = left.rationale.clone();
            units.splice(index..=index, [left, right]);
        }
        Action::Merge { index } => {
            ensure!(
                index < units.len().saturating_sub(1),
                "no following semantic unit"
            );
            let right = units.remove(index + 1);
            let left = &mut units[index];
            left.end_word = right.end_word;
            if left.keyword.is_some() && right.keyword.is_some() {
                left.keyword = None;
                warnings.push("合并的两段各有重点，已取消重点，请重新选择。".into());
            } else if left.keyword.is_none() {
                left.keyword = right.keyword;
            }
            left.rationale = "User merged adjacent semantic units".into();
        }
    }
    validate(units, input.word_count)?;
    Ok(Edited {
        semantic_units: input.semantic_units,
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn caption_merge_respects_supplied_semantic_boundaries() {
        let units = edit(request(json!({"kind":"split","index":0,"at":6})))
            .unwrap()
            .semantic_units;
        let mut input: CaptionRequest = serde_json::from_value(json!({
            "wordCount":8,
            "captionSpans":[{"startWord":0,"endWord":6},{"startWord":6,"endWord":8}],
            "semanticUnits":units,
            "action":{"kind":"merge","index":0}
        }))
        .unwrap();
        assert!(
            edit_captions(input)
                .err()
                .unwrap()
                .to_string()
                .contains("语义段")
        );
        input = serde_json::from_value(json!({
            "wordCount":8,
            "captionSpans":[{"startWord":0,"endWord":3},{"startWord":3,"endWord":6},{"startWord":6,"endWord":8}],
            "semanticUnits":units,
            "action":{"kind":"merge","index":0}
        })).unwrap();
        assert_eq!(edit_captions(input).unwrap().caption_spans[0].end_word, 6);
    }
    #[test]
    fn captions_edit_independently_and_reject_invalid_coverage() {
        let request = |spans, action| {
            serde_json::from_value::<CaptionRequest>(json!({
                "wordCount": 8, "captionSpans": spans, "action": action
            }))
            .unwrap()
        };
        let split = edit_captions(request(
            json!([{"startWord":0,"endWord":8}]),
            json!({"kind":"split","index":0,"at":3}),
        ))
        .unwrap();
        assert_eq!(split.caption_spans.len(), 2);
        assert_eq!(split.caption_spans[0].end_word, 3);
        let merged = edit_captions(CaptionRequest {
            word_count: 8,
            caption_spans: split.caption_spans,
            semantic_units: vec![],
            action: Action::Merge { index: 0 },
        })
        .unwrap();
        assert_eq!(merged.caption_spans[0].start_word, 0);
        assert_eq!(merged.caption_spans[0].end_word, 8);
        for spans in [
            json!([]),
            json!([{"startWord":1,"endWord":8}]),
            json!([{"startWord":0,"endWord":7}]),
            json!([{"startWord":0,"endWord":5},{"startWord":4,"endWord":8}]),
        ] {
            assert!(
                edit_captions(request(spans, json!({"kind":"split","index":0,"at":3}))).is_err()
            );
        }
        for at in [0, 8, usize::MAX] {
            assert!(
                edit_captions(request(
                    json!([{"startWord":0,"endWord":8}]),
                    json!({"kind":"split","index":0,"at":at})
                ))
                .is_err()
            );
        }
        assert!(
            edit_captions(request(
                json!([{"startWord":0,"endWord":8}]),
                json!({"kind":"merge","index":usize::MAX})
            ))
            .is_err()
        );
    }
    fn request(action: serde_json::Value) -> Request {
        serde_json::from_value(json!({"wordCount":8,"semanticUnits":[{"startWord":0,"endWord":8,"intent":"neutral","keyword":{"startWord":2,"endWord":5},"rationale":"reviewed"}],"action":action})).unwrap()
    }
    #[test]
    fn split_and_merge_preserve_coverage_and_contained_keywords() {
        let split = edit(request(json!({"kind":"split","index":0,"at":6}))).unwrap();
        assert_eq!(
            split.semantic_units[0].keyword.as_ref().unwrap().start_word,
            2
        );
        assert!(split.semantic_units[1].keyword.is_none());
        let merged = edit(Request {
            word_count: 8,
            semantic_units: split.semantic_units,
            action: Action::Merge { index: 0 },
        })
        .unwrap();
        assert_eq!(merged.semantic_units.len(), 1);
        assert_eq!(merged.semantic_units[0].end_word, 8);
        assert_eq!(
            merged.semantic_units[0].keyword.as_ref().unwrap().end_word,
            5
        );
    }
    #[test]
    fn merge_requires_reselection_when_both_segments_have_keywords() {
        let mut split = edit(request(json!({"kind":"split","index":0,"at":6}))).unwrap();
        split.semantic_units[1].keyword = Some(super::super::rhythm::WordSpan {
            start_word: 6,
            end_word: 8,
        });
        let merged = edit(Request {
            word_count: 8,
            semantic_units: split.semantic_units,
            action: Action::Merge { index: 0 },
        })
        .unwrap();
        assert!(merged.semantic_units[0].keyword.is_none());
        assert_eq!(merged.warnings.len(), 1);
    }
    #[test]
    fn crossing_keywords_are_not_silently_truncated_and_invalid_boundaries_fail() {
        let result = edit(request(json!({"kind":"split","index":0,"at":3}))).unwrap();
        assert!(result.semantic_units.iter().all(|u| u.keyword.is_none()));
        assert_eq!(result.warnings.len(), 1);
        for at in [0, 8, 9] {
            assert!(edit(request(json!({"kind":"split","index":0,"at":at}))).is_err());
        }
        assert!(edit(request(json!({"kind":"merge","index":0}))).is_err());
        let mut invalid = request(json!({"kind":"split","index":0,"at":3}));
        invalid.semantic_units[0].start_word = 1;
        assert!(edit(invalid).is_err());
    }
}
