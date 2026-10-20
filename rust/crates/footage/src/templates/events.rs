use super::{composition::*, model::*, rhythm::*, sound_events::ScheduleDecision};
use anyhow::{Context, Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

const KEYWORD_TRAILING_PUNCTUATION: &[char] = &[
    ',', '，', '。', '.', '!', '！', '?', '？', ';', '；', ':', '：',
];

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum EventKind {
    Video,
    Semantic,
    Caption,
    Keyword,
    Shot,
    Speech,
    Beat,
    Onset,
    Pause,
    EnergyPeak,
    Section,
}
impl From<&SoundEventKind> for EventKind {
    fn from(kind: &SoundEventKind) -> Self {
        match kind {
            SoundEventKind::Speech => Self::Speech,
            SoundEventKind::Beat => Self::Beat,
            SoundEventKind::Onset => Self::Onset,
            SoundEventKind::Pause => Self::Pause,
            SoundEventKind::EnergyPeak => Self::EnergyPeak,
            SoundEventKind::Section => Self::Section,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TimeEvent {
    pub id: String,
    pub kind: EventKind,
    pub start: f64,
    pub end: f64,
    pub strength: f64,
    pub confidence: f64,
    pub source_id: String,
    pub evidence: String,
    #[serde(default)]
    pub intent: Option<Intent>,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub caption_index: Option<usize>,
    #[serde(default)]
    pub semantic_index: Option<usize>,
}
pub fn collect(
    input: &PlanInput,
    semantics: &[SemanticUnit],
    captions: &[CaptionCue],
) -> Result<Vec<TimeEvent>> {
    let mut events = input.events.clone();
    super::sound_events::validate(&input.sound_events, input.duration_seconds)?;
    for s in &input.sound_events {
        events.push(TimeEvent {
            id: s.id.clone(),
            kind: (&s.kind).into(),
            start: s.start,
            end: s.end,
            strength: s.strength,
            confidence: s.confidence,
            source_id: s.source_id.clone(),
            evidence: s.evidence.clone(),
            intent: None,
            text: None,
            caption_index: None,
            semantic_index: None,
        });
    }
    let make =
        |id: String, kind, start, end, caption_index, semantic_index, intent, text| TimeEvent {
            id,
            kind,
            start,
            end,
            strength: 1.,
            confidence: 1.,
            source_id: "input".into(),
            evidence: "Derived from supplied aligned content".into(),
            intent,
            text,
            caption_index,
            semantic_index,
        };
    ensure!(
        events.iter().all(|e| !e.id.starts_with("auto-")),
        "auto- event IDs are reserved"
    );
    events.push(make(
        "auto-video".into(),
        EventKind::Video,
        0.,
        input.duration_seconds,
        None,
        None,
        None,
        None,
    ));
    for (i, s) in semantics.iter().enumerate() {
        events.push(make(
            format!("auto-semantic-{i}"),
            EventKind::Semantic,
            input.words[s.start_word].start,
            input.words[s.end_word - 1].end,
            None,
            Some(i),
            Some(s.intent.clone()),
            Some(text(&input.words[s.start_word..s.end_word])),
        ));
        if let Some(k) = &s.keyword {
            events.push(make(
                format!("auto-keyword-{i}"),
                EventKind::Keyword,
                input.words[k.start_word].start,
                input.words[k.end_word - 1].end,
                captions.iter().position(|c| {
                    c.word_span.start_word <= k.start_word && c.word_span.end_word > k.start_word
                }),
                Some(i),
                Some(s.intent.clone()),
                Some(text(&input.words[k.start_word..k.end_word])),
            ));
        }
    }
    for (i, c) in captions.iter().enumerate() {
        events.push(make(
            format!("auto-caption-{i}"),
            EventKind::Caption,
            c.start,
            c.end,
            Some(i),
            Some(c.semantic_index),
            Some(semantics[c.semantic_index].intent.clone()),
            Some(c.text.clone()),
        ));
    }
    let mut ids = HashSet::new();
    ensure!(events.len() <= 100000, "event budget exceeded");
    for e in &events {
        ensure!(
            valid_id(&e.id)
                && ids.insert(&e.id)
                && valid_id(&e.source_id)
                && !e.evidence.trim().is_empty(),
            "event identity and evidence required"
        );
        ensure!(
            e.start.is_finite()
                && e.end.is_finite()
                && e.start >= 0.
                && e.end >= e.start
                && e.end <= input.duration_seconds
                && (0.0..=1.).contains(&e.strength)
                && (0.0..=1.).contains(&e.confidence),
            "invalid time event"
        );
        ensure!(
            e.caption_index.is_none_or(|i| i < captions.len())
                && e.semantic_index.is_none_or(|i| i < semantics.len()),
            "invalid event content reference"
        );
    }
    events.sort_by(|a, b| a.start.total_cmp(&b.start).then(a.id.cmp(&b.id)));
    Ok(events)
}
fn anchor_kind(a: &Anchor) -> EventKind {
    match a {
        Anchor::VideoStart => EventKind::Video,
        Anchor::CueStart | Anchor::CueEnd => EventKind::Caption,
        Anchor::SemanticStart | Anchor::SemanticEnd => EventKind::Semantic,
        Anchor::KeywordStart => EventKind::Keyword,
    }
}
pub struct Scheduled {
    pub elements: Vec<PlacedElement>,
    pub layouts: Vec<LayoutInstance>,
    pub decisions: Vec<ScheduleDecision>,
}
pub fn schedule(
    input: &PlanInput,
    t: &Template,
    semantics: &[SemanticUnit],
    captions: &[CaptionCue],
    events: &[TimeEvent],
    warnings: &mut Vec<String>,
) -> Result<Scheduled> {
    let mut starts_by_kind: HashMap<&EventKind, Vec<f64>> = HashMap::new();
    for event in events {
        starts_by_kind
            .entry(&event.kind)
            .or_default()
            .push(event.start);
    }
    let kind = t
        .composition
        .layout_policy
        .as_ref()
        .and_then(|p| p.event_kind.clone())
        .unwrap_or(EventKind::Semantic);
    let mut layouts: Vec<LayoutInstance> = vec![];
    for event in events
        .iter()
        .filter(|e| e.kind == kind && e.start < input.duration_seconds)
    {
        let layout = t.composition.select_layout(
            t,
            event.intent.as_ref().unwrap_or(&Intent::Neutral),
            event.start,
            &layouts,
        );
        if layouts
            .last()
            .is_some_and(|l| l.layout_id == layout.id || l.start == event.start)
        {
            continue;
        }
        if let Some(last) = layouts.last_mut() {
            last.end = event.start;
        }
        layouts.push(LayoutInstance {
            instance_id: format!("layout-{}", layouts.len()),
            layout_id: layout.id.clone(),
            start: if layouts.is_empty() { 0. } else { event.start },
            end: input.duration_seconds,
            caption_index: event.caption_index.or_else(|| {
                captions
                    .iter()
                    .position(|c| c.start <= event.start && c.end > event.start)
            }),
            sound_event_id: if matches!(
                event.kind,
                EventKind::Video
                    | EventKind::Semantic
                    | EventKind::Caption
                    | EventKind::Keyword
                    | EventKind::Shot
            ) {
                None
            } else {
                Some(event.id.clone())
            },
            event_id: Some(event.id.clone()),
        });
    }
    if layouts.is_empty() {
        ensure!(
            t.composition
                .layout_policy
                .as_ref()
                .and_then(|p| p.event_kind.as_ref())
                .is_none(),
            "layout policy requires matching time events"
        );
        layouts.push(LayoutInstance {
            instance_id: "layout-0".into(),
            layout_id: t.layouts[0].id.clone(),
            start: 0.,
            end: input.duration_seconds,
            caption_index: None,
            sound_event_id: None,
            event_id: Some("auto-video".into()),
        });
    }
    let mut counts: HashMap<&str, usize> = HashMap::new();
    let mut last: HashMap<&str, f64> = HashMap::new();
    let mut occupied: HashMap<&str, Vec<(f64, f64)>> = HashMap::new();
    let mut elements = vec![];
    let mut decisions = vec![];
    let mut accent_ranges: Vec<(f64, f64)> = vec![];
    for event in events {
        let mut candidates: Vec<_> = t
            .elements
            .iter()
            .filter_map(|e| {
                let rule = t
                    .composition
                    .scheduling
                    .iter()
                    .find(|r| r.element_id == e.id);
                if rule
                    .map(|r| &r.event_kind)
                    .unwrap_or(&anchor_kind(&e.timing.anchor))
                    != &event.kind
                {
                    return None;
                }
                let count = counts.get(e.id.as_str()).copied().unwrap_or(0);
                let score = rule
                    .map(|r| {
                        r.strength_weight * event.strength + r.confidence_weight * event.confidence
                            - r.repetition_penalty * count as f64
                    })
                    .unwrap_or(e.priority as f64);
                Some((e, rule, count, score))
            })
            .collect();
        candidates.sort_by(|a, b| b.3.total_cmp(&a.3).then(a.0.id.cmp(&b.0.id)));
        for (e, rule, count, score) in candidates {
            let min_display_seconds = e
                .min_display_seconds
                .unwrap_or(t.visual_rhythm.min_display_seconds);
            ensure!(
                decisions.len() < 200000 && elements.len() < 10000,
                "schedule budget exceeded"
            );
            let semantic = event.semantic_index.and_then(|i| semantics.get(i));
            let cue = event.caption_index.and_then(|i| captions.get(i));
            let cue_end = cue
                .map(|c| {
                    c.end.max(c.start + min_display_seconds).min(
                        captions
                            .get(event.caption_index.unwrap() + 1)
                            .map(|c| c.start)
                            .unwrap_or(input.duration_seconds),
                    )
                })
                .unwrap_or(event.end);
            let boundary = if rule.is_none()
                && matches!(e.timing.anchor, Anchor::CueEnd | Anchor::SemanticEnd)
            {
                event.end
            } else {
                event.start
            };
            let start = (boundary + e.timing.offset_seconds).clamp(0., input.duration_seconds);
            let until = if rule.is_some_and(|r| r.end_at_next_event) {
                let starts = &starts_by_kind[&event.kind];
                starts
                    .get(starts.partition_point(|start| *start <= event.start))
                    .map(|start| {
                        (start + e.timing.offset_seconds).clamp(0., input.duration_seconds)
                    })
                    .unwrap_or(input.duration_seconds)
            } else if rule.is_some() {
                input.duration_seconds
            } else {
                match e.timing.anchor {
                    Anchor::VideoStart => input.duration_seconds,
                    Anchor::SemanticStart => event.end,
                    Anchor::KeywordStart => {
                        // A readability hold may use the gap after a word, but
                        // must not create overlap with the next keyword. Keep
                        // any overlap already present in the source events.
                        let starts = &starts_by_kind[&event.kind];
                        let next = starts
                            .get(starts.partition_point(|time| *time <= event.start))
                            .map(|time| {
                                (time + e.timing.offset_seconds).clamp(0., input.duration_seconds)
                            })
                            .unwrap_or(input.duration_seconds);
                        event
                            .end
                            .max(start + min_display_seconds)
                            .min(next.max(event.end))
                            .min(input.duration_seconds)
                    }
                    Anchor::SemanticEnd => events
                        .iter()
                        .filter(|v| {
                            v.kind == EventKind::Semantic
                                && v.start >= event.end
                                && v.id != event.id
                        })
                        .map(|v| v.start)
                        .min_by(f64::total_cmp)
                        .unwrap_or(input.duration_seconds),
                    _ => cue_end,
                }
            };
            let until = match e.timing.end_anchor {
                None => until,
                Some(EndAnchor::EventEnd) => event.end,
                Some(EndAnchor::CueEnd) => {
                    let cue = cue.context("cue_end requires an event associated with a caption")?;
                    ensure!(
                        event.end <= cue.end + 1e-9,
                        "cue_end event crosses its associated caption; use semantic_end"
                    );
                    cue.end
                }
                Some(EndAnchor::SemanticEnd) => {
                    let semantic = semantic.context(
                        "semantic_end requires an event associated with a semantic unit",
                    )?;
                    input.words[semantic.end_word - 1].end
                }
                Some(EndAnchor::VideoEnd) => input.duration_seconds,
            }
            .min(input.duration_seconds);
            let end = (start + e.timing.max_seconds).min(until);
            let content = match e.binding {
                Binding::Literal => e.literal.clone().unwrap_or_default(),
                Binding::Title => input.title.clone(),
                Binding::SemanticNumber => event
                    .semantic_index
                    .filter(|i| *i < semantics.len())
                    .map(|i| (i + 1).to_string())
                    .unwrap_or_default(),
                Binding::Sentence => {
                    if event.kind == EventKind::Caption {
                        event.text.clone().unwrap_or_default()
                    } else {
                        semantic
                            .map(|s| text(&input.words[s.start_word..s.end_word]))
                            .or_else(|| event.text.clone())
                            .unwrap_or_default()
                    }
                }
                Binding::Keyword => semantic
                    .and_then(|s| s.keyword.as_ref())
                    .map(|k| text(&input.words[k.start_word..k.end_word]))
                    // The trigger decides when to display; it does not turn a
                    // whole semantic unit or caption into an unmarked keyword.
                    .or_else(|| {
                        (event.kind == EventKind::Keyword)
                            .then(|| event.text.clone())
                            .flatten()
                    })
                    .unwrap_or_default()
                    .trim_end_matches(KEYWORD_TRAILING_PUNCTUATION)
                    .to_string(),
                Binding::Translation => event
                    .caption_index
                    .and_then(|i| input.translations.get(i))
                    .cloned()
                    .unwrap_or_default(),
                Binding::Speaker => cue
                    .and_then(|c| input.words[c.word_span.start_word].speaker.clone())
                    .unwrap_or_default(),
                Binding::SourceVideo => String::new(),
            };
            let layout_instance = layouts
                .iter()
                .find(|l| l.start <= start && l.end > start)
                .unwrap_or(layouts.last().unwrap());
            let layout = t
                .layouts
                .iter()
                .find(|l| l.id == layout_instance.layout_id)
                .unwrap();
            let region = if e.features.placement == Placement::Caption {
                layout.caption_region.clone()
            } else {
                e.region.clone()
            };
            let reason = if !e.intents.is_empty()
                && !e
                    .intents
                    .contains(event.intent.as_ref().unwrap_or(&Intent::Neutral))
            {
                "intent"
            } else if rule.is_some_and(|r| {
                event.confidence < r.min_confidence || event.strength < r.min_strength
            }) {
                "threshold"
            } else if rule.is_some_and(|r| count >= r.max_occurrences) {
                "occurrence_limit"
            } else if rule.is_some_and(|r| {
                last.get(e.id.as_str())
                    .is_some_and(|v| start - *v < r.cooldown_seconds)
            }) {
                "cooldown"
            } else if e.exclusive_group.as_ref().is_some_and(|g| {
                occupied
                    .get(g.as_str())
                    .is_some_and(|ranges| ranges.iter().any(|(a, b)| *a < end && *b > start))
            }) {
                "exclusive_group"
            } else if e.features.accent
                && e.features.representation != Representation::Audio
                && accent_ranges
                    .iter()
                    .filter(|(a, b)| *a < end && *b > start)
                    .count()
                    >= t.visual_rhythm.max_accents_per_cue as usize
            {
                "accent_budget"
            } else if e
                .resource_id
                .as_ref()
                .is_some_and(|id| t.asset_id(id).is_none())
            {
                "unresolved_resource"
            } else if end <= start || rule.is_some() && end - start < e.timing.min_seconds {
                "duration"
            } else if e.features.representation == Representation::Text && content.is_empty() {
                "empty_content"
            } else if e.features.avoid_protected_regions
                && !t
                    .composition
                    .spatial_relations
                    .iter()
                    .any(|r| r.element_id == e.id)
                && layout.safe_regions.iter().any(|r| {
                    r.x < region.x + region.width
                        && r.x + r.width > region.x
                        && r.y < region.y + region.height
                        && r.y + r.height > region.y
                })
            {
                "protected_region"
            } else {
                "selected"
            };
            let selected = reason == "selected";
            decisions.push(ScheduleDecision {
                event_id: event.id.clone(),
                element_id: e.id.clone(),
                score,
                selected,
                reason: reason.into(),
            });
            if !selected {
                if reason == "unresolved_resource" {
                    warnings.push(format!(
                        "unresolved_resource:{}",
                        e.resource_id.as_ref().unwrap()
                    ));
                }
                continue;
            }
            if end - start < e.timing.min_seconds {
                warnings.push(format!(
                    "display_below_element_minimum:{}:{}",
                    event.id, e.id
                ));
            }
            if let Some(g) = &e.exclusive_group {
                occupied.entry(g).or_default().push((start, end));
            }
            if e.features.accent && e.features.representation != Representation::Audio {
                accent_ranges.push((start, end));
            }
            counts.insert(&e.id, count + 1);
            last.insert(&e.id, start);
            let sentence_span = if e.binding == Binding::Sentence {
                if event.kind == EventKind::Caption {
                    cue.map(|c| c.word_span.clone())
                } else {
                    semantic.map(|s| WordSpan {
                        start_word: s.start_word,
                        end_word: s.end_word,
                    })
                }
            } else {
                None
            };
            let word_ranges = sentence_span
                .as_ref()
                .map(|span| {
                    let words = &input.words[span.start_word..span.end_word];
                    let (joined, ranges) = text_and_ranges(words);
                    if joined != content {
                        return vec![];
                    }
                    ranges
                        .into_iter()
                        .zip(words)
                        .map(|(r, w)| TimedTextRange {
                            start: r.start,
                            end: r.end,
                            start_seconds: w.start,
                            end_seconds: w.end,
                        })
                        .collect()
                })
                .unwrap_or_default();
            let layout_span = sentence_span.as_ref().or_else(|| {
                if e.binding == Binding::Keyword {
                    semantic.and_then(|s| s.keyword.as_ref())
                } else {
                    None
                }
            });
            let layout_ranges = layout_span
                .map(|span| {
                    input
                        .layout_phrases
                        .iter()
                        .filter(|phrase| {
                            let p = &phrase.word_span;
                            p.start_word >= span.start_word
                                && p.end_word <= span.end_word
                                && captions.iter().any(|cue| {
                                    cue.word_span.start_word <= p.start_word
                                        && cue.word_span.end_word >= p.end_word
                                })
                        })
                        .filter_map(|phrase| {
                            if e.binding != Binding::Keyword {
                                return keyword_text_range(
                                    &input.words,
                                    span,
                                    &phrase.word_span,
                                    &content,
                                );
                            }
                            // Keyword display removes trailing punctuation. Resolve against the
                            // original aligned words, then clip only that verified suffix in UTF-16.
                            let source = text(&input.words[span.start_word..span.end_word]);
                            if source.trim_end_matches(KEYWORD_TRAILING_PUNCTUATION) != content {
                                return None;
                            }
                            let mut range =
                                keyword_text_range(&input.words, span, &phrase.word_span, &source)?;
                            range.end = range.end.min(content.encode_utf16().count());
                            (range.start < range.end).then_some(range)
                        })
                        .collect()
                })
                .unwrap_or_default();
            let keyword_range = match e.binding {
                Binding::Sentence => sentence_span
                    .zip(semantic.and_then(|s| s.keyword.as_ref()))
                    .and_then(|(span, keyword)| {
                        keyword_text_range(&input.words, &span, keyword, &content)
                    }),
                Binding::Keyword
                    if !content.is_empty() && semantic.is_some_and(|s| s.keyword.is_some()) =>
                {
                    Some(TextRange {
                        start: 0,
                        end: content.encode_utf16().count(),
                    })
                }
                _ => None,
            };
            elements.push(PlacedElement {
                instance_id: format!("event-{}-{}", event.id, e.id),
                element_id: e.id.clone(),
                features: e.features.clone(),
                ellipse_arc: e.ellipse_arc.clone(),
                star_geometry: e.star_geometry.clone(),
                rectangle_geometry: e.rectangle_geometry.clone(),
                content,
                keyword_range,
                layout_ranges,
                word_ranges,
                start,
                end,
                region,
                style_id: e.style_id.clone(),
                resource_id: e.resource_id.clone(),
                motions: e.motions.clone(),
                z: e.z,
            });
        }
    }
    Ok(Scheduled {
        elements,
        layouts,
        decisions,
    })
}

fn keyword_text_range(
    words: &[Word],
    span: &WordSpan,
    keyword: &WordSpan,
    content: &str,
) -> Option<TextRange> {
    let start = span.start_word.max(keyword.start_word);
    let end = span.end_word.min(keyword.end_word);
    if start >= end || text(&words[span.start_word..span.end_word]) != content {
        return None;
    }
    // Joining prefixes uses the same spacing rules as captions; repeated words never
    // rely on substring search, and surrogate pairs retain JavaScript offsets.
    Some(TextRange {
        start: text(&words[span.start_word..=start]).encode_utf16().count()
            - words[start].text.encode_utf16().count(),
        end: text(&words[span.start_word..end]).encode_utf16().count(),
    })
}

/// Readability diagnostics use final lifecycle bounds, never the initial schedule.
/// Keep the existing warnings string API with an unambiguous JSON payload.
pub fn diagnose_readability(
    elements: &[PlacedElement],
    t: &Template,
    events: &[TimeEvent],
    duration: f64,
    warnings: &mut Vec<String>,
) {
    let by_id: HashMap<_, _> = events
        .iter()
        .map(|event| (event.id.as_str(), event))
        .collect();
    for placed in elements {
        let Some(e) = t.elements.iter().find(|e| e.id == placed.element_id) else {
            continue;
        };
        // These are the only default anchors that apply the visual minimum.
        if e.features.representation == Representation::Audio
            || t.composition
                .scheduling
                .iter()
                .any(|r| r.element_id == e.id)
            || !matches!(
                e.timing.anchor,
                Anchor::KeywordStart | Anchor::CueStart | Anchor::CueEnd
            )
        {
            continue;
        }
        let minimum = e
            .min_display_seconds
            .unwrap_or(t.visual_rhythm.min_display_seconds);
        let actual = placed.end - placed.start;
        if actual + 1e-9 >= minimum {
            continue;
        }
        let Some(event_id) = placed
            .instance_id
            .strip_prefix("event-")
            .and_then(|id| id.strip_suffix(&format!("-{}", e.id)))
        else {
            continue;
        };
        let Some(event) = by_id.get(event_id) else {
            continue;
        };
        let lifecycle = t
            .composition
            .lifecycles
            .iter()
            .any(|r| r.element_id == e.id)
            || t.composition
                .accumulating_lists
                .iter()
                .any(|list| list.items.iter().any(|item| item.element_id == e.id));
        let mut boundaries = vec![];
        if lifecycle {
            // Lifecycles replace both bounds, so original next/max/end causes
            // must not be attributed to the resulting interval.
            boundaries.push("lifecycle_boundary");
        } else {
            if (actual - e.timing.max_seconds).abs() <= 1e-9 {
                boundaries.push("max_seconds");
            }
            if (placed.end - duration).abs() <= 1e-9 {
                boundaries.push("input_end");
            }
            if actual + 1e-9 >= e.timing.max_seconds {
                // maxSeconds may win before an explicit end boundary.
            } else if let Some(anchor) = &e.timing.end_anchor {
                boundaries.push(match anchor {
                    EndAnchor::EventEnd => "explicit_event_end",
                    EndAnchor::CueEnd => "explicit_cue_end",
                    EndAnchor::SemanticEnd => "explicit_semantic_end",
                    EndAnchor::VideoEnd => "explicit_video_end",
                });
            } else if matches!(e.timing.anchor, Anchor::KeywordStart) {
                if let Some(next) = events
                    .iter()
                    .filter(|next| next.kind == event.kind && next.start > event.start)
                    .map(|next| next.start)
                    .min_by(f64::total_cmp)
                {
                    let next = (next + e.timing.offset_seconds).clamp(0., duration);
                    if next >= event.end && (placed.end - next).abs() <= 1e-9 {
                        boundaries.push("next_keyword");
                    }
                }
            }
            if boundaries.is_empty() {
                boundaries.push("lifecycle_boundary");
            }
        }
        warnings.push(format!(
            "display_below_readability_minimum:{}",
            serde_json::json!({
                "eventId":event.id,"elementId":e.id,"actualSeconds":actual,
                "requiredSeconds":minimum,"boundaries":boundaries
            })
        ));
    }
}
