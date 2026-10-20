use super::model::*;
use anyhow::{Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Word {
    pub text: String,
    pub start: f64,
    pub end: f64,
    #[serde(default)]
    pub speaker: Option<String>,
    #[serde(default)]
    pub emphasis: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WordSpan {
    pub start_word: usize,
    pub end_word: usize,
}
/// Content-specific line grouping. Only an explicit segmentation-policy opt-in
/// also uses these hints when choosing automatic caption boundaries; audio stays unchanged.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LayoutPhrase {
    pub word_span: WordSpan,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SemanticUnit {
    pub start_word: usize,
    pub end_word: usize,
    pub intent: Intent,
    pub keyword: Option<WordSpan>,
    pub rationale: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CaptionCue {
    pub id: String,
    pub word_span: WordSpan,
    pub semantic_index: usize,
    pub text: String,
    pub start: f64,
    pub end: f64,
    pub warnings: Vec<String>,
}
#[derive(Clone, Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PlanInput {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub events: Vec<super::events::TimeEvent>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sound_events: Vec<super::sound_events::SoundEvent>,
    pub template: Template,
    pub words: Vec<Word>,
    pub duration_seconds: f64,
    pub title: String,
    pub translations: Vec<String>,
    pub semantic_units: Vec<SemanticUnit>,
    pub caption_spans: Vec<WordSpan>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub layout_phrases: Vec<LayoutPhrase>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caption_policy: Option<SegmentationPolicy>,
    pub quiet_gap_seconds: Option<Vec<f64>>,
    #[serde(default)]
    pub resource_bindings: Vec<ResourceBinding>,
    #[serde(skip)]
    #[schemars(skip)]
    pub(crate) receipt_input: Option<serde_json::Value>,
}
#[derive(Deserialize)]
#[serde(remote = "PlanInput", rename_all = "camelCase", deny_unknown_fields)]
struct PlanInputWire {
    #[serde(default)]
    events: Vec<super::events::TimeEvent>,
    #[serde(default)]
    sound_events: Vec<super::sound_events::SoundEvent>,
    template: Template,
    words: Vec<Word>,
    duration_seconds: f64,
    title: String,
    #[serde(default)]
    translations: Vec<String>,
    #[serde(default)]
    semantic_units: Vec<SemanticUnit>,
    #[serde(default)]
    caption_spans: Vec<WordSpan>,
    #[serde(default)]
    layout_phrases: Vec<LayoutPhrase>,
    #[serde(default)]
    caption_policy: Option<SegmentationPolicy>,
    #[serde(default)]
    quiet_gap_seconds: Option<Vec<f64>>,
    #[serde(default)]
    resource_bindings: Vec<ResourceBinding>,
    #[serde(skip)]
    receipt_input: Option<serde_json::Value>,
}
impl<'de> Deserialize<'de> for PlanInput {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> std::result::Result<Self, D::Error> {
        let mut v = serde_json::Value::deserialize(d)?;
        let receipt_input = super::legacy::receipt_input(&v).map_err(serde::de::Error::custom)?;
        if let Some(object) = v.as_object_mut() {
            if let Some(specs) = object.remove("phraseSpecs") {
                if object.contains_key("semanticUnits") || object.contains_key("captionSpans") {
                    return Err(serde::de::Error::custom(
                        "mixed legacy and v2 content fields",
                    ));
                }
                let spans: Vec<_> = specs
                    .as_array()
                    .ok_or_else(|| serde::de::Error::custom("phraseSpecs must be an array"))?
                    .iter()
                    .map(|s| serde_json::json!({"startWord":s["startWord"],"endWord":s["endWord"]}))
                    .collect();
                object.insert("semanticUnits".into(), specs);
                object.insert("captionSpans".into(), serde_json::json!(spans));
            }
        }
        let mut input = PlanInputWire::deserialize(v).map_err(serde::de::Error::custom)?;
        input.receipt_input = receipt_input;
        Ok(input)
    }
}
impl PlanInput {
    pub fn resolved_template(&self) -> Result<Template> {
        let mut template = self.template.clone();
        if let Some(policy) = &self.caption_policy {
            template.segmentation = policy.clone();
        }
        let mut seen = std::collections::HashSet::new();
        for binding in &self.resource_bindings {
            ensure!(
                seen.insert(&binding.slot_id),
                "duplicate application resource binding"
            );
            template
                .resource_bindings
                .retain(|b| b.slot_id != binding.slot_id);
            template.resource_bindings.push(binding.clone());
        }
        template.validate()?;
        Ok(template)
    }
    pub fn hash_input(&self) -> Result<serde_json::Value> {
        let current = serde_json::to_value(self)?;
        if let Some(raw) = &self.receipt_input {
            let original: Self = serde_json::from_value(raw.clone())?;
            if serde_json::to_value(original)? == current {
                return Ok(raw.clone());
            }
        }
        Ok(current)
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlacedElement {
    pub instance_id: String,
    pub element_id: String,
    pub features: Features,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ellipse_arc: Option<super::ellipse_arc::EllipseArc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub star_geometry: Option<super::star_geometry::StarGeometry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rectangle_geometry: Option<super::rectangle_geometry::RectangleGeometry>,
    pub content: String,
    /// Half-open UTF-16 offsets, matching the editable web text's indexing.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub keyword_range: Option<TextRange>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub layout_ranges: Vec<TextRange>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub word_ranges: Vec<TimedTextRange>,
    pub start: f64,
    pub end: f64,
    pub region: Rect,
    pub style_id: Option<String>,
    pub resource_id: Option<String>,
    pub motions: Vec<Motion>,
    pub z: i32,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TextRange {
    pub start: usize,
    pub end: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TimedTextRange {
    pub start: usize,
    pub end: usize,
    pub start_seconds: f64,
    pub end_seconds: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LayoutInstance {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event_id: Option<String>,
    pub instance_id: String,
    pub caption_index: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sound_event_id: Option<String>,
    pub layout_id: String,
    pub start: f64,
    pub end: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TransitionInstance {
    pub instance_id: String,
    pub from_instance_id: String,
    pub to_instance_id: String,
    pub effect: TransitionKind,
    pub start: f64,
    pub end: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ElementTransitionInstance {
    pub rule_id: String,
    pub effect_id: String,
    pub from_instance_id: String,
    pub to_instance_id: String,
    pub start: f64,
    pub end: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContentIssue {
    pub code: ContentIssueCode,
    /// Zero-based index into this plan's semantic units, never parsed from display text.
    pub semantic_index: usize,
    pub start_word: usize,
    pub end_word: usize,
    pub message: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ContentIssueCode {
    MissingKeyword,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditPlan {
    pub groups: Vec<GroupInstance>,
    pub events: Vec<super::events::TimeEvent>,
    pub element_transitions: Vec<ElementTransitionInstance>,
    pub sound_events: Vec<super::sound_events::SoundEvent>,
    pub schedule_decisions: Vec<super::sound_events::ScheduleDecision>,
    pub schema_version: String,
    pub template_id: String,
    pub template_revision: u64,
    pub duration_seconds: f64,
    pub words: Vec<Word>,
    pub semantic_units: Vec<SemanticUnit>,
    pub captions: Vec<CaptionCue>,
    pub elements: Vec<PlacedElement>,
    pub layouts: Vec<LayoutInstance>,
    pub transitions: Vec<TransitionInstance>,
    pub warnings: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub content_issues: Vec<ContentIssue>,
    pub sounds: Vec<super::audio_plan::SoundInstance>,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GroupInstance {
    pub id: String,
    pub instance_id: String,
    pub start: f64,
    pub end: f64,
    pub member_instance_ids: Vec<String>,
    pub z: i32,
}
fn intent(text: &str) -> Intent {
    if ["关注", "收藏", "点赞", "评论", "下单"]
        .iter()
        .any(|s| text.contains(s))
    {
        Intent::CallToAction
    } else if ["但是", "然而", "不是", "反而", "而是"]
        .iter()
        .any(|s| text.contains(s))
    {
        Intent::Contrast
    } else if text.contains(['?', '？'])
        || ["为什么", "怎么办", "如何"]
            .iter()
            .any(|s| text.contains(s))
    {
        Intent::Question
    } else if ["第一", "第二", "第三", "首先", "其次", "最后"]
        .iter()
        .any(|s| text.contains(s))
    {
        Intent::List
    } else if text.chars().any(|c| c.is_numeric()) {
        Intent::Metric
    } else {
        Intent::Neutral
    }
}
pub fn text(words: &[Word]) -> String {
    join_text(words, |_| {})
}
pub fn text_and_ranges(words: &[Word]) -> (String, Vec<TextRange>) {
    let mut ranges = Vec::with_capacity(words.len());
    let content = join_text(words, |range| ranges.push(range));
    (content, ranges)
}
fn needs_word_space(previous: Option<char>, next: Option<char>) -> bool {
    previous.is_some_and(|c| {
        c.is_ascii_alphanumeric() || matches!(c, '.' | ',' | '!' | '?' | ';' | ':' | '\'')
    }) && next.is_some_and(|c| c.is_ascii_alphabetic())
}
fn join_text(words: &[Word], mut on_word: impl FnMut(TextRange)) -> String {
    let mut text = String::new();
    let mut units = 0;
    for w in words {
        if needs_word_space(text.chars().last(), w.text.chars().next()) {
            text.push(' ');
            units += 1;
        }
        let start = units;
        units += w.text.encode_utf16().count();
        text.push_str(&w.text);
        on_word(TextRange { start, end: units });
    }
    text
}
fn validate_words(words: &[Word], duration: f64, gaps: Option<&[f64]>) -> Result<()> {
    ensure!(
        duration.is_finite() && duration > 0. && duration <= 3600.,
        "invalid source duration"
    );
    ensure!(words.len() <= 30000, "too many timed words");
    let mut previous = 0.;
    for w in words {
        ensure!(
            !w.text.trim().is_empty()
                && w.start.is_finite()
                && w.end.is_finite()
                && w.start >= previous
                && w.end > w.start
                && w.end <= duration + 0.001
                && (0.0..=1.0).contains(&w.emphasis),
            "invalid or overlapping aligned words"
        );
        previous = w.end;
    }
    if let Some(gaps) = gaps {
        ensure!(
            gaps.len() == words.len().saturating_sub(1),
            "quiet gaps must cover every adjacent word boundary"
        );
        for (gap, pair) in gaps.iter().zip(words.windows(2)) {
            ensure!(
                gap.is_finite() && *gap >= 0. && *gap <= pair[1].start - pair[0].end + 1e-6,
                "quiet gap exceeds aligned word interval"
            );
        }
    }
    Ok(())
}
fn terminal(w: &Word) -> bool {
    w.text
        .ends_with(['。', '！', '？', '.', '!', '?', '；', ';'])
}
fn clause_boundary(previous: &Word, next: &Word) -> bool {
    let mut chars = previous.text.chars().rev();
    let Some(last) = chars.next() else {
        return false;
    };
    if !matches!(last, ',' | '，' | ':' | '：') {
        return false;
    }
    // Numeric separators (1,000 or 12:30) are not clause boundaries.
    !(chars.next().is_some_and(|c| c.is_ascii_digit())
        && next.text.starts_with(|c: char| c.is_ascii_digit()))
}
pub(super) fn reading_speed(text: &str, start: f64, end: f64) -> f64 {
    text.chars().count() as f64 / (end - start).max(0.05)
}

fn cue(
    words: &[Word],
    span: WordSpan,
    semantic_index: usize,
    index: usize,
    rules: &SegmentationPolicy,
) -> CaptionCue {
    let selected = &words[span.start_word..span.end_word];
    let text = text(selected);
    let start = selected[0].start;
    let end = selected.last().unwrap().end;
    let mut warnings = vec![];
    if reading_speed(&text, start, end) > rules.max_characters_per_second {
        warnings.push("reading_speed_exceeds_limit".into());
    }
    if selected.len() > 1 && end - start > rules.max_phrase_seconds {
        warnings.push("caption_exceeds_phrase_duration".into());
    }
    if selected
        .iter()
        .any(|word| word.end - word.start > rules.max_phrase_seconds)
    {
        warnings.push("aligned_word_exceeds_phrase_duration".into());
    }
    if selected.len() > 1 && text.chars().count() > rules.max_characters {
        warnings.push("caption_exceeds_character_budget".into());
    }
    if selected
        .iter()
        .any(|word| word.text.chars().count() > rules.max_characters)
    {
        warnings.push("aligned_word_exceeds_character_budget".into());
    }
    CaptionCue {
        id: format!("cue-{index}"),
        word_span: span,
        semantic_index,
        text,
        start,
        end,
        warnings,
    }
}
fn caption_boundary(
    words: &[Word],
    i: usize,
    rules: &SegmentationPolicy,
    gaps: Option<&[f64]>,
) -> bool {
    gaps.map_or(words[i].start - words[i - 1].end, |g| g[i - 1]) >= rules.pause_boundary_seconds
        || terminal(&words[i - 1])
        || clause_boundary(&words[i - 1], &words[i])
        || words[i - 1].speaker != words[i].speaker
}

fn spans(
    words: &[Word],
    lo: usize,
    hi: usize,
    rules: &SegmentationPolicy,
    gaps: Option<&[f64]>,
    phrases: &[LayoutPhrase],
) -> Vec<WordSpan> {
    if lo == hi {
        return vec![];
    }
    // A hint cannot override a pause/clause/speaker boundary or exceed the
    // authored time/character budget. Oversized hints use ordinary segmentation.
    let atomic: Vec<_> = phrases
        .iter()
        .map(|p| &p.word_span)
        .filter(|p| {
            rules.preserve_layout_phrases
                && p.start_word >= lo
                && p.end_word <= hi
                && text(&words[p.start_word..p.end_word]).chars().count() <= rules.max_characters
                && words[p.end_word - 1].end - words[p.start_word].start <= rules.max_phrase_seconds
                && !(p.start_word + 1..p.end_word).any(|i| caption_boundary(words, i, rules, gaps))
        })
        .collect();
    let mut out = vec![];
    let mut start = lo;
    let mut chars = 0;
    let mut i = lo;
    while i < hi {
        let end = atomic
            .iter()
            .find(|p| p.start_word == i)
            .map_or(i + 1, |p| p.end_word);
        let count = text(&words[i..end]).chars().count();
        let separator = usize::from(
            i > start
                && needs_word_space(
                    words[i - 1].text.chars().last(),
                    words[i].text.chars().next(),
                ),
        );
        if i > start
            && (caption_boundary(words, i, rules, gaps)
                || words[end - 1].end - words[start].start > rules.max_phrase_seconds
                || chars + separator + count > rules.max_characters)
        {
            out.push(WordSpan {
                start_word: start,
                end_word: i,
            });
            start = i;
            chars = 0;
        }
        chars += count + if i > start { separator } else { 0 };
        i = end;
    }
    out.push(WordSpan {
        start_word: start,
        end_word: hi,
    });
    // Balance a short Latin tail left by a size/time limit, never a deliberate
    // pause, clause or speaker boundary. Explicit caption spans bypass this path.
    for index in 1..out.len() {
        let right = &out[index];
        let left = &out[index - 1];
        if right.end_word - right.start_word > 2
            || !words[right.start_word]
                .text
                .chars()
                .any(|c| c.is_ascii_alphabetic())
            || left.end_word - left.start_word < 3
            || caption_boundary(words, right.start_word, rules, gaps)
        {
            continue;
        }
        let (lo, hi) = (left.start_word, right.end_word);
        let mut best = None;
        for split in lo + 2..=hi - 2 {
            if atomic
                .iter()
                .any(|p| p.start_word < split && split < p.end_word)
            {
                continue;
            }
            let a = text(&words[lo..split]).chars().count();
            let b = text(&words[split..hi]).chars().count();
            if a > rules.max_characters
                || b > rules.max_characters
                || words[split - 1].end - words[lo].start > rules.max_phrase_seconds
                || words[hi - 1].end - words[split].start > rules.max_phrase_seconds
            {
                continue;
            }
            let imbalance = a.abs_diff(b);
            if best.is_none_or(|(_, score)| imbalance < score) {
                best = Some((split, imbalance));
            }
        }
        if let Some((split, _)) = best {
            out[index - 1].end_word = split;
            out[index].start_word = split;
        }
    }
    out
}
pub fn segment(
    words: &[Word],
    duration: f64,
    rules: &SegmentationPolicy,
) -> Result<Vec<CaptionCue>> {
    validate_words(words, duration, None)?;
    Ok(spans(words, 0, words.len(), rules, None, &[])
        .into_iter()
        .enumerate()
        .map(|(i, s)| cue(words, s, 0, i, rules))
        .collect())
}
fn overlaps(a: &Rect, b: &Rect) -> bool {
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}
fn acoustic_keyword(words: &[Word], start: usize, end: usize) -> Option<WordSpan> {
    let peak = words[start..end]
        .iter()
        .map(|word| word.emphasis)
        .fold(0.0_f64, f64::max);
    if peak <= 0.0 {
        return None;
    }
    let peaks: Vec<_> = (start..end)
        .filter(|&index| {
            words[index].emphasis == peak && words[index].text.chars().any(char::is_alphanumeric)
        })
        .collect();
    let first = *peaks.first()?;
    let last = *peaks.last()?;
    // A uniform score or separate tied peaks do not identify one reliable phrase.
    if (end - start > 1 && peaks.len() == end - start) || last - first + 1 != peaks.len() {
        return None;
    }
    Some(WordSpan {
        start_word: first,
        end_word: last + 1,
    })
}

pub fn plan(input: PlanInput) -> Result<EditPlan> {
    let mut resolved = input.resolved_template()?;
    resolved
        .composition
        .clone()
        .resolve_resources(&mut resolved)?;
    ensure!(
        !input.words.is_empty() || !input.sound_events.is_empty() || !input.events.is_empty(),
        "aligned speech or sound events required"
    );
    let t = &resolved;
    let words = &input.words;
    validate_words(
        words,
        input.duration_seconds,
        input.quiet_gap_seconds.as_deref(),
    )?;
    let mut previous_end = 0;
    for phrase in &input.layout_phrases {
        let span = &phrase.word_span;
        ensure!(
            span.start_word >= previous_end
                && span.start_word < span.end_word
                && span.end_word <= words.len(),
            "layout phrases must be nonempty, ordered, nonoverlapping aligned word spans"
        );
        previous_end = span.end_word;
    }
    let mut semantics = input.semantic_units.clone();
    let mut warnings = vec![];
    if semantics.is_empty() && !words.is_empty() {
        warnings.push(
            "Semantic units use sentence/speaker boundaries and lexical intent; review meaning."
                .into(),
        );
        let mut start = 0;
        for end in 1..=words.len() {
            if end == words.len()
                || terminal(&words[end - 1])
                || words[end - 1].speaker != words[end].speaker
            {
                let keyword = acoustic_keyword(words, start, end);
                semantics.push(SemanticUnit {
                    start_word: start,
                    end_word: end,
                    intent: intent(&text(&words[start..end])),
                    rationale: if keyword.is_some() {
                        "Sentence/speaker boundary; lexical intent; aligned emphasis peak"
                    } else {
                        "Sentence/speaker boundary; lexical intent; no unambiguous emphasis signal"
                    }
                    .into(),
                    keyword,
                });
                start = end;
            }
        }
    }
    let mut next = 0;
    for s in &semantics {
        ensure!(
            s.start_word == next && s.end_word > s.start_word && s.end_word <= words.len(),
            "semantic units must cover every word exactly once in order"
        );
        ensure!(
            !s.rationale.trim().is_empty() && s.rationale.len() <= 2000,
            "semantic rationale required"
        );
        if let Some(k) = &s.keyword {
            ensure!(
                k.start_word >= s.start_word
                    && k.end_word > k.start_word
                    && k.end_word <= s.end_word,
                "keyword must be inside its semantic unit"
            );
        }
        next = s.end_word;
    }
    ensure!(next == words.len(), "semantic units omit trailing words");
    let ranges = if input.caption_spans.is_empty() {
        semantics
            .iter()
            .flat_map(|s| {
                spans(
                    words,
                    s.start_word,
                    s.end_word,
                    &t.segmentation,
                    input.quiet_gap_seconds.as_deref(),
                    &input.layout_phrases,
                )
            })
            .collect()
    } else {
        input.caption_spans.clone()
    };
    let mut captions = vec![];
    next = 0;
    let mut semantic_index = 0;
    for (i, span) in ranges.into_iter().enumerate() {
        ensure!(
            span.start_word == next
                && span.end_word > span.start_word
                && span.end_word <= words.len(),
            "caption spans must cover every word exactly once in order"
        );
        while semantic_index + 1 < semantics.len()
            && span.start_word >= semantics[semantic_index].end_word
        {
            semantic_index += 1;
        }
        ensure!(
            span.start_word >= semantics[semantic_index].start_word
                && span.end_word <= semantics[semantic_index].end_word,
            "caption cannot cross a semantic boundary"
        );
        next = span.end_word;
        captions.push(cue(words, span, semantic_index, i, &t.segmentation));
    }
    ensure!(next == words.len(), "caption spans omit trailing words");
    for (index, phrase) in input.layout_phrases.iter().enumerate() {
        let span = &phrase.word_span;
        if !captions.iter().any(|cue| {
            cue.word_span.start_word <= span.start_word && cue.word_span.end_word >= span.end_word
        }) {
            warnings.push(format!(
                "layout_phrase_crosses_caption:{index}:{}:{}",
                span.start_word, span.end_word
            ));
        }
    }
    for cue in &captions {
        warnings.extend(cue.warnings.iter().map(|w| format!("{}:{w}", cue.id)));
    }
    ensure!(
        input.translations.is_empty() || input.translations.len() == captions.len(),
        "translation count must match caption cues"
    );
    let events = super::events::collect(&input, &semantics, &captions)?;
    let scheduled =
        super::events::schedule(&input, t, &semantics, &captions, &events, &mut warnings)?;
    let mut elements = scheduled.elements;
    let layouts = scheduled.layouts;
    let mut schedule_decisions = scheduled.decisions;
    t.composition.place(&mut elements)?;
    for element in &elements {
        if element.features.representation != Representation::Audio
            && element.features.avoid_protected_regions
        {
            for instance in layouts
                .iter()
                .filter(|l| l.start < element.end && l.end > element.start)
            {
                let layout = t
                    .layouts
                    .iter()
                    .find(|l| l.id == instance.layout_id)
                    .unwrap();
                ensure!(
                    !layout
                        .safe_regions
                        .iter()
                        .any(|r| overlaps(&element.region, r)),
                    "placed element violates protected region: {}",
                    element.element_id
                );
            }
        }
    }
    let mut transitions = vec![];
    for pair in layouts.windows(2) {
        if let Some(rule) = t
            .transition_rules
            .iter()
            .find(|r| r.from_layout_id == pair[0].layout_id && r.to_layout_id == pair[1].layout_id)
        {
            let duration = if matches!(rule.effect, TransitionKind::Cut) {
                0.
            } else {
                rule.duration_seconds
                    .min((pair[0].end - pair[0].start) / 2.)
                    .min((pair[1].end - pair[1].start) / 2.)
            };
            transitions.push(TransitionInstance {
                instance_id: format!("transition-{}", transitions.len()),
                from_instance_id: pair[0].instance_id.clone(),
                to_instance_id: pair[1].instance_id.clone(),
                effect: rule.effect.clone(),
                start: pair[1].start - duration,
                end: pair[1].start,
            });
        }
    }
    elements.sort_by(|a, b| a.start.total_cmp(&b.start));
    let mut last_effect = f64::NEG_INFINITY;
    elements.retain(|e| {
        if e.features.media_use != Some(MediaUse::SoundEffect) {
            return true;
        }
        if e.start - last_effect < t.audio_placement.effect_cooldown_seconds {
            warnings.push(format!("effect_cooldown:{}", e.instance_id));
            return false;
        }
        last_effect = e.start;
        true
    });
    for decision in &mut schedule_decisions {
        if decision.selected
            && !elements.iter().any(|e| {
                e.instance_id == format!("event-{}-{}", decision.event_id, decision.element_id)
            })
        {
            decision.selected = false;
            decision.reason = "audio_cooldown".into();
        }
    }
    let speech_events = events
        .iter()
        .filter(|e| e.kind == super::events::EventKind::Speech)
        .map(|e| super::sound_events::SoundEvent {
            id: e.id.clone(),
            kind: super::composition::SoundEventKind::Speech,
            start: e.start,
            end: e.end,
            strength: e.strength,
            confidence: e.confidence,
            source_id: e.source_id.clone(),
            evidence: e.evidence.clone(),
        })
        .collect::<Vec<_>>();
    let sounds = super::audio_plan::plan_with_events(&elements, words, t, &speech_events);
    // Audio has its own instance type and is not also a visual element.
    elements.retain(|e| e.features.representation != Representation::Audio);
    super::relationships::resolve_lifecycles(&mut elements, t, &events)?;
    let content_issues =
        diagnose_missing_keywords(t, &semantics, &events, &schedule_decisions, &elements);
    // Keep the original warnings for existing consumers. Both presentations
    // come from one diagnosis so actionable locations cannot disagree with it.
    warnings.extend(
        content_issues
            .iter()
            .map(|issue| format!("content_missing_keyword:{}", issue.message)),
    );
    super::events::diagnose_readability(
        &elements,
        t,
        &events,
        input.duration_seconds,
        &mut warnings,
    );
    for placed in &mut elements {
        if let Some(authored) = t
            .elements
            .iter()
            .find(|element| element.id == placed.element_id)
        {
            if let Some(timing) = &authored.motion_timing {
                for motion in &mut placed.motions {
                    // Relationship-generated channels follow event time and keep their own clock.
                    if authored
                        .motions
                        .iter()
                        .any(|channel| channel.property == motion.property)
                    {
                        *motion = super::motion_timing::resolve(
                            motion,
                            timing,
                            placed.end - placed.start,
                        )?;
                    }
                }
            }
        }
    }
    let mut groups = vec![];
    let mut transition_nodes = elements.clone();
    for group in t.composition.groups.iter().filter(|g| g.composite) {
        let members: Vec<_> = elements
            .iter()
            .filter(|e| group.element_ids.contains(&e.element_id))
            .collect();
        if members.is_empty() {
            continue;
        }
        let min_z = members.iter().map(|e| e.z).min().unwrap();
        let max_z = members.iter().map(|e| e.z).max().unwrap();
        ensure!(
            !elements
                .iter()
                .any(|e| !group.element_ids.contains(&e.element_id)
                    && e.z >= min_z
                    && e.z <= max_z
                    && members.iter().any(|m| m.start < e.end && m.end > e.start)),
            "composite group cannot reorder interleaved layers"
        );
        let mut spans: Vec<Vec<&PlacedElement>> = vec![];
        if group.separate_instances {
            let mut ordered = members.clone();
            ordered.sort_by(|a, b| a.start.total_cmp(&b.start).then(a.end.total_cmp(&b.end)));
            let mut active_end = f64::NEG_INFINITY;
            for member in ordered {
                // Touching intervals are distinct activations; overlapping members
                // stay together, including staggered entrances and departures.
                if spans.is_empty() || member.start >= active_end {
                    spans.push(vec![]);
                    active_end = member.end;
                } else {
                    active_end = active_end.max(member.end);
                }
                spans.last_mut().unwrap().push(member);
            }
        } else {
            spans.push(members);
        }
        for (index, members) in spans.iter().enumerate() {
            let start = members
                .iter()
                .map(|e| e.start)
                .min_by(f64::total_cmp)
                .unwrap();
            let end = members
                .iter()
                .map(|e| e.end)
                .max_by(f64::total_cmp)
                .unwrap();
            let instance_id = if group.separate_instances {
                format!("group-{}-{}", group.id, index)
            } else {
                format!("group-{}", group.id)
            };
            let mut proxy = (*members[0]).clone();
            proxy.instance_id = instance_id.clone();
            proxy.element_id = group.id.clone();
            proxy.start = start;
            proxy.end = end;
            transition_nodes.push(proxy);
            groups.push(GroupInstance {
                id: group.id.clone(),
                instance_id,
                start,
                end,
                member_instance_ids: members.iter().map(|e| e.instance_id.clone()).collect(),
                z: max_z,
            });
        }
    }
    let mut element_transitions = vec![];
    for rule in &t.composition.transitions {
        let effect = t
            .composition
            .transition_effects
            .iter()
            .find(|e| e.id == rule.effect_id)
            .unwrap();
        for to in transition_nodes
            .iter()
            .filter(|e| e.element_id == rule.to_element_id)
        {
            let from: Vec<_> = transition_nodes
                .iter()
                .filter(|e| e.element_id == rule.from_element_id && (e.end - to.start).abs() < 1e-6)
                .collect();
            if from.is_empty() {
                continue;
            }
            ensure!(from.len() == 1, "ambiguous transition predecessor");
            ensure!(
                from[0].end - from[0].start > effect.duration_seconds
                    && to.end - to.start > effect.duration_seconds,
                "transition exceeds instance interval"
            );
            element_transitions.push(ElementTransitionInstance {
                rule_id: rule.id.clone(),
                effect_id: effect.id.clone(),
                from_instance_id: from[0].instance_id.clone(),
                to_instance_id: to.instance_id.clone(),
                start: to.start - effect.duration_seconds,
                end: to.start,
            });
        }
    }
    warnings.extend(
        elements
            .iter()
            .filter_map(super::readability::opacity_hold_warning),
    );
    warnings.sort();
    warnings.dedup();
    Ok(EditPlan {
        groups,
        events,
        element_transitions,
        sound_events: input.sound_events,
        schedule_decisions,
        schema_version: "moirai.template-plan.v2".into(),
        template_id: t.id.clone(),
        template_revision: t.revision,
        duration_seconds: input.duration_seconds,
        words: input.words,
        semantic_units: semantics,
        captions,
        elements,
        layouts,
        transitions,
        warnings,
        content_issues,
        sounds,
    })
}

fn diagnose_missing_keywords(
    template: &Template,
    semantics: &[SemanticUnit],
    events: &[super::events::TimeEvent],
    decisions: &[super::sound_events::ScheduleDecision],
    elements: &[PlacedElement],
) -> Vec<ContentIssue> {
    use std::collections::{HashMap, HashSet};
    let events: HashMap<_, _> = events
        .iter()
        .map(|event| (event.id.as_str(), event))
        .collect();
    let authored: HashMap<_, _> = template
        .elements
        .iter()
        .map(|element| (element.id.as_str(), element))
        .collect();
    let placed: HashMap<_, _> = elements
        .iter()
        .map(|element| (element.instance_id.as_str(), element))
        .collect();
    let mut supplied = HashSet::new();
    // A supplied event is evidence only when scheduling actually produced its
    // keyword text. Unrelated events, rejected candidates and empty graphics
    // must not hide missing content in another semantic unit.
    for decision in decisions.iter().filter(|decision| decision.selected) {
        let Some(event) = events.get(decision.event_id.as_str()) else {
            continue;
        };
        if event.kind != super::events::EventKind::Keyword
            || !event
                .text
                .as_ref()
                .is_some_and(|text| !text.trim().is_empty())
        {
            continue;
        }
        let Some(index) = event.semantic_index else {
            continue;
        };
        let Some(semantic) = semantics.get(index) else {
            continue;
        };
        let Some(authored) = authored.get(decision.element_id.as_str()) else {
            continue;
        };
        if authored.binding != Binding::Keyword
            || authored.features.representation != Representation::Text
            || !authored.intents.is_empty() && !authored.intents.contains(&semantic.intent)
        {
            continue;
        }
        let instance_id = format!("event-{}-{}", event.id, authored.id);
        if placed.get(instance_id.as_str()).is_some_and(|element| {
            element.element_id == authored.id
                && element.features.representation == Representation::Text
                && !element.content.trim().is_empty()
                && element.end > element.start
        }) {
            supplied.insert(index);
        }
    }
    let mut issues = vec![];
    for (index, semantic) in semantics.iter().enumerate() {
        if semantic.keyword.is_none()
            && !supplied.contains(&index)
            && template.elements.iter().any(|element| {
                element.binding == Binding::Keyword
                    && (element.intents.is_empty() || element.intents.contains(&semantic.intent))
            })
        {
            issues.push(ContentIssue {
                code: ContentIssueCode::MissingKeyword,
                semantic_index: index,
                start_word: semantic.start_word,
                end_word: semantic.end_word,
                message: format!("第{}段未设置重点，重点文字可能为空或不出现。", index + 1),
            });
        }
    }
    issues
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn english_caption_boundaries_keep_spaces_after_punctuation() {
        let words =
            ["Hello,", "world.", "Workers'", "lives", "matter."].map(|text| word(text, 0., 1.));
        assert_eq!(text(&words), "Hello, world. Workers' lives matter.");
        let mixed = ["价格", "12", ".", "50", "元"].map(|text| word(text, 0., 1.));
        assert_eq!(text(&mixed), "价格12.50元");
    }
    use serde_json::{json, to_value};
    fn word(text: &str, start: f64, end: f64) -> Word {
        Word {
            text: text.into(),
            start,
            end,
            speaker: None,
            emphasis: 0.,
        }
    }
    fn input() -> PlanInput {
        let mut template = super::super::seed::templates().unwrap().remove(0);
        template.segmentation.max_characters = 4;
        for l in &mut template.layouts {
            l.safe_regions.clear();
        }
        PlanInput {
            events: vec![],
            sound_events: vec![],
            template,
            words: vec![
                word("持续", 0., 0.3),
                word("的", 0.3, 0.4),
                word("内容", 0.4, 0.6),
                word("价值", 0.6, 0.9),
            ],
            duration_seconds: 1.2,
            title: "标题".into(),
            translations: vec![],
            semantic_units: vec![SemanticUnit {
                start_word: 0,
                end_word: 4,
                intent: Intent::Emphasis,
                keyword: Some(WordSpan {
                    start_word: 2,
                    end_word: 4,
                }),
                rationale: "One complete thought".into(),
            }],
            caption_spans: vec![],
            layout_phrases: vec![],
            caption_policy: None,
            quiet_gap_seconds: None,
            receipt_input: None,
            resource_bindings: vec![],
        }
    }
    #[test]
    fn caption_policy_is_per_sound_validated_and_preserves_word_alignment() {
        let mut i = input();
        let original = to_value(&i.template).unwrap();
        assert!(to_value(&i).unwrap().get("captionPolicy").is_none());
        i.caption_spans = vec![WordSpan {
            start_word: 0,
            end_word: 4,
        }];
        let before = plan(i.clone()).unwrap();
        assert!(
            before.captions[0]
                .warnings
                .iter()
                .any(|w| w == "caption_exceeds_character_budget")
        );
        let mut policy = i.template.segmentation.clone();
        policy.max_characters = 42;
        i.caption_policy = Some(policy);
        let wire = to_value(&i).unwrap();
        let restored: PlanInput = serde_json::from_value(wire).unwrap();
        let after = plan(restored).unwrap();
        assert!(
            !after.captions[0]
                .warnings
                .iter()
                .any(|w| w == "caption_exceeds_character_budget")
        );
        assert_eq!(after.captions[0].start, before.captions[0].start);
        assert_eq!(after.captions[0].end, before.captions[0].end);
        assert_eq!(after.captions[0].text, before.captions[0].text);
        assert_eq!(to_value(&i.template).unwrap(), original);
        i.caption_policy.as_mut().unwrap().max_characters = 61;
        assert!(plan(i).is_err());
    }
    #[test]
    fn missing_keyword_warning_respects_template_binding_and_intent() {
        let mut i = input();
        i.template.elements[0].binding = Binding::Keyword;
        i.template.elements[0].intents.clear();
        assert!(
            !plan(i.clone())
                .unwrap()
                .warnings
                .iter()
                .any(|w| w.starts_with("content_missing_keyword:"))
        );
        i.semantic_units[0].keyword = None;
        assert!(
            plan(i.clone())
                .unwrap()
                .warnings
                .iter()
                .any(|w| w.starts_with("content_missing_keyword:"))
        );
        for element in &mut i.template.elements {
            element.binding = Binding::Sentence;
        }
        assert!(
            !plan(i.clone())
                .unwrap()
                .warnings
                .iter()
                .any(|w| w.starts_with("content_missing_keyword:"))
        );
        i.template.elements[0].binding = Binding::Keyword;
        i.template.elements[0].intents = vec![Intent::Question];
        assert!(
            !plan(i)
                .unwrap()
                .warnings
                .iter()
                .any(|w| w.starts_with("content_missing_keyword:"))
        );
    }
    fn explicit_keyword_input() -> PlanInput {
        let mut input = input();
        let mut element = input
            .template
            .elements
            .iter()
            .find(|element| element.features.representation == Representation::Text)
            .unwrap()
            .clone();
        element.id = "keyword-text".into();
        element.binding = Binding::Keyword;
        element.intents = vec![Intent::Emphasis];
        element.features.accent = false;
        element.features.avoid_protected_regions = false;
        element.resource_id = None;
        element.exclusive_group = None;
        element.timing.anchor = Anchor::KeywordStart;
        element.timing.offset_seconds = 0.;
        element.timing.min_seconds = 0.1;
        element.timing.max_seconds = 2.;
        element.timing.end_anchor = Some(EndAnchor::EventEnd);
        element.min_display_seconds = Some(0.1);
        element.motions.clear();
        element.motion_timing = None;
        input.template.elements = vec![element];
        input.template.composition = Default::default();
        input.semantic_units[0].keyword = None;
        input.events = vec![super::super::events::TimeEvent {
            id: "explicit-keyword".into(),
            kind: super::super::events::EventKind::Keyword,
            start: 0.4,
            end: 0.9,
            strength: 1.,
            confidence: 1.,
            source_id: "sample".into(),
            evidence: "Explicit sample keyword label".into(),
            intent: Some(Intent::Emphasis),
            text: Some("内容价值".into()),
            caption_index: None,
            semantic_index: Some(0),
        }];
        input
    }
    fn missing_keyword_warnings(plan: &EditPlan) -> Vec<&str> {
        plan.warnings
            .iter()
            .map(String::as_str)
            .filter(|warning| warning.starts_with("content_missing_keyword:"))
            .collect()
    }
    #[test]
    fn content_issues_locate_long_inputs_in_semantic_order_and_clear_selected_ranges() {
        let mut input = explicit_keyword_input();
        input.events.clear();
        input.duration_seconds = 38.;
        input.words = (0..38)
            .map(|index| word("内容", index as f64, index as f64 + 0.8))
            .collect();
        input.semantic_units = (0..38)
            .map(|index| SemanticUnit {
                start_word: index,
                end_word: index + 1,
                intent: Intent::Emphasis,
                keyword: None,
                rationale: "Explicitly reviewed sentence boundary".into(),
            })
            .collect();
        let result = plan(input.clone()).unwrap();
        assert_eq!(result.content_issues.len(), 38);
        assert_eq!(missing_keyword_warnings(&result).len(), 38);
        for (index, issue) in result.content_issues.iter().enumerate() {
            assert_eq!(issue.code, ContentIssueCode::MissingKeyword);
            assert_eq!(issue.semantic_index, index);
            assert_eq!((issue.start_word, issue.end_word), (index, index + 1));
            assert!(issue.message.starts_with(&format!("第{}段", index + 1)));
            assert!(
                result
                    .warnings
                    .contains(&format!("content_missing_keyword:{}", issue.message))
            );
        }
        input.semantic_units[10].keyword = Some(WordSpan {
            start_word: 10,
            end_word: 11,
        });
        let updated = plan(input).unwrap();
        assert_eq!(updated.content_issues.len(), 37);
        assert_eq!(missing_keyword_warnings(&updated).len(), 37);
        assert_eq!(
            updated
                .content_issues
                .iter()
                .map(|issue| issue.semantic_index)
                .collect::<Vec<_>>(),
            (0..38).filter(|index| *index != 10).collect::<Vec<_>>()
        );
    }
    #[test]
    fn content_issues_are_additive_and_old_plans_still_deserialize() {
        let mut input = explicit_keyword_input();
        input.events.clear();
        let result = plan(input).unwrap();
        let mut wire = to_value(&result).unwrap();
        assert_eq!(wire["contentIssues"][0]["code"], "missing_keyword");
        assert_eq!(wire["contentIssues"][0]["semanticIndex"], 0);
        assert_eq!(wire["contentIssues"][0]["startWord"], 0);
        assert_eq!(wire["contentIssues"][0]["endWord"], 4);
        let restored: EditPlan = serde_json::from_value(wire.clone()).unwrap();
        assert_eq!(to_value(restored).unwrap(), wire);
        wire.as_object_mut().unwrap().remove("contentIssues");
        let legacy: EditPlan = serde_json::from_value(wire.clone()).unwrap();
        assert!(legacy.content_issues.is_empty());
        assert_eq!(legacy.warnings, result.warnings);
        assert_eq!(to_value(legacy).unwrap(), wire);
        let satisfied = plan(explicit_keyword_input()).unwrap();
        assert!(to_value(satisfied).unwrap().get("contentIssues").is_none());
    }
    #[test]
    fn explicit_keyword_text_satisfies_diagnostic_without_rewriting_plan() {
        let input = explicit_keyword_input();
        let result = plan(input.clone()).unwrap();
        assert!(missing_keyword_warnings(&result).is_empty());
        assert!(result.content_issues.is_empty());
        assert_eq!(result.elements.len(), 1);
        assert_eq!(result.elements[0].content, "内容价值");
        assert_eq!(
            (result.elements[0].start, result.elements[0].end),
            (0.4, 0.9)
        );
        assert_eq!(
            to_value(&result.words).unwrap(),
            to_value(&input.words).unwrap()
        );
        assert_eq!(
            to_value(&result.semantic_units).unwrap(),
            to_value(&input.semantic_units).unwrap()
        );
        assert_eq!(
            to_value(
                result
                    .events
                    .iter()
                    .find(|event| event.id == "explicit-keyword")
                    .unwrap()
            )
            .unwrap(),
            to_value(&input.events[0]).unwrap()
        );
        // The diagnostic consumes scheduler results; it never repairs or
        // re-creates an element, event, decision, layout or aligned word.
        let template = input.resolved_template().unwrap();
        let scheduled = super::super::events::schedule(
            &input,
            &template,
            &result.semantic_units,
            &result.captions,
            &result.events,
            &mut vec![],
        )
        .unwrap();
        assert_eq!(
            to_value(&result.elements).unwrap(),
            to_value(scheduled.elements).unwrap()
        );
        assert_eq!(
            to_value(&result.schedule_decisions).unwrap(),
            to_value(scheduled.decisions).unwrap()
        );
        assert_eq!(
            to_value(&result.layouts).unwrap(),
            to_value(scheduled.layouts).unwrap()
        );
    }
    #[test]
    fn explicit_keyword_rejected_by_intent_duration_or_constraints_still_warns() {
        let original = explicit_keyword_input();
        let mut intent = original.clone();
        intent.events[0].intent = Some(Intent::Question);
        let mut duration = original.clone();
        duration.template.elements[0].timing.offset_seconds = 1.;
        let mut protected = original.clone();
        protected.template.elements[0]
            .features
            .avoid_protected_regions = true;
        for layout in &mut protected.template.layouts {
            layout.safe_regions = vec![Rect {
                x: 0.,
                y: 0.,
                width: 1.,
                height: 1.,
            }];
        }
        for (input, reason) in [
            (intent, "intent"),
            (duration, "duration"),
            (protected, "protected_region"),
        ] {
            let result = plan(input).unwrap();
            assert_eq!(missing_keyword_warnings(&result).len(), 1, "{reason}");
            assert_eq!(result.content_issues.len(), 1, "{reason}");
            assert_eq!(result.content_issues[0].semantic_index, 0, "{reason}");
            assert!(result.elements.is_empty(), "{reason}");
            assert!(
                result
                    .schedule_decisions
                    .iter()
                    .any(|decision| decision.event_id == "explicit-keyword"
                        && !decision.selected
                        && decision.reason == reason)
            );
        }
    }
    #[test]
    fn explicit_keyword_needs_nonempty_text_not_a_graphic_or_sentence_fallback() {
        for text in [None, Some(""), Some(" \t\n"), Some("，。！？")] {
            let mut input = explicit_keyword_input();
            input.events[0].text = text.map(str::to_string);
            let result = plan(input).unwrap();
            assert_eq!(missing_keyword_warnings(&result).len(), 1, "{text:?}");
        }
        let mut graphic = explicit_keyword_input();
        graphic.template.elements[0].features.representation = Representation::Rectangle;
        let result = plan(graphic).unwrap();
        assert_eq!(result.elements.len(), 1);
        assert_eq!(missing_keyword_warnings(&result).len(), 1);
        let mut sentence_event = explicit_keyword_input();
        sentence_event.events.clear();
        sentence_event.template.elements[0].timing.anchor = Anchor::SemanticStart;
        let result = plan(sentence_event).unwrap();
        assert!(result.elements.is_empty());
        assert_eq!(missing_keyword_warnings(&result).len(), 1);
    }
    #[test]
    fn keyword_binding_never_uses_non_keyword_event_text_as_implicit_content() {
        use super::super::events::{EventKind, TimeEvent};
        for (anchor, event_kind) in [
            (Anchor::SemanticStart, EventKind::Semantic),
            (Anchor::CueStart, EventKind::Caption),
            (Anchor::VideoStart, EventKind::Video),
        ] {
            let mut input = explicit_keyword_input();
            input.template.elements[0].timing.anchor = anchor;
            input.events = vec![TimeEvent {
                id: "supplied-trigger".into(),
                kind: event_kind,
                start: 0.,
                end: 0.9,
                strength: 1.,
                confidence: 1.,
                source_id: "sample".into(),
                evidence: "Reviewed event text, not a keyword annotation".into(),
                intent: Some(Intent::Emphasis),
                text: Some("This whole sentence must not become a keyword".into()),
                caption_index: Some(0),
                semantic_index: Some(0),
            }];
            let result = plan(input).unwrap();
            assert!(result.elements.is_empty());
            assert_eq!(result.content_issues.len(), 1);
            assert!(result.schedule_decisions.iter().any(|decision| {
                decision.event_id == "supplied-trigger"
                    && !decision.selected
                    && decision.reason == "empty_content"
            }));
        }
    }
    #[test]
    fn semantic_trigger_keeps_annotated_keyword_text_and_semantic_timing() {
        let mut input = explicit_keyword_input();
        input.events.clear();
        input.template.elements[0].timing.anchor = Anchor::SemanticStart;
        input.semantic_units[0].keyword = Some(WordSpan {
            start_word: 2,
            end_word: 4,
        });
        let result = plan(input).unwrap();
        assert_eq!(result.elements.len(), 1);
        assert_eq!(result.elements[0].content, "内容价值");
        assert_eq!(result.elements[0].start, 0.);
        assert_eq!(result.elements[0].end, 0.9);
        assert!(result.content_issues.is_empty());
    }
    #[test]
    fn explicit_keyword_only_satisfies_its_associated_semantic_unit() {
        let mut no_reference = explicit_keyword_input();
        no_reference.events[0].semantic_index = None;
        let result = plan(no_reference).unwrap();
        assert_eq!(result.elements.len(), 1);
        assert_eq!(missing_keyword_warnings(&result).len(), 1);
        let mut two_units = explicit_keyword_input();
        let mut second = two_units.semantic_units[0].clone();
        two_units.semantic_units[0].end_word = 2;
        second.start_word = 2;
        two_units.semantic_units.push(second);
        two_units.events[0].semantic_index = Some(1);
        let result = plan(two_units).unwrap();
        assert_eq!(result.elements.len(), 1);
        let missing = missing_keyword_warnings(&result);
        assert_eq!(missing.len(), 1);
        assert!(missing[0].contains("第1段"));
        assert_eq!(result.content_issues.len(), 1);
        assert_eq!(result.content_issues[0].semantic_index, 0);
    }
    #[test]
    fn automatic_keywords_require_an_unambiguous_signal_and_keep_manual_ranges() {
        let mut i = input();
        i.semantic_units.clear();
        assert!(plan(i.clone()).unwrap().semantic_units[0].keyword.is_none());
        for w in &mut i.words {
            w.emphasis = 0.5;
        }
        assert!(plan(i.clone()).unwrap().semantic_units[0].keyword.is_none());
        i.words[0].emphasis = 0.0;
        i.words[1].emphasis = 0.0;
        let peak = plan(i.clone()).unwrap().semantic_units[0]
            .keyword
            .clone()
            .unwrap();
        assert_eq!((peak.start_word, peak.end_word), (2, 4));
        i.words[0].emphasis = 0.5;
        assert!(plan(i).unwrap().semantic_units[0].keyword.is_none());
        let manual = input();
        assert_eq!(
            to_value(plan(manual.clone()).unwrap().semantic_units).unwrap(),
            to_value(manual.semantic_units).unwrap()
        );
    }
    #[test]
    fn keyword_display_omits_terminal_punctuation_without_rewriting_transcript() {
        let mut i = input();
        i.words = vec![word("价格", 0., 0.3), word("1,000.50，", 0.3, 0.9)];
        i.semantic_units[0].end_word = 2;
        i.semantic_units[0].keyword = Some(WordSpan {
            start_word: 1,
            end_word: 2,
        });
        let mut e = i.template.elements[0].clone();
        e.binding = Binding::Keyword;
        e.timing.anchor = Anchor::SemanticStart;
        e.intents.clear();
        i.template.elements = vec![e];
        let p = plan(i.clone()).unwrap();
        assert_eq!(p.elements[0].content, "1,000.50");
        assert_eq!(p.captions.last().unwrap().text, "1,000.50，");
        assert_eq!(to_value(p.words).unwrap(), to_value(&i.words).unwrap());
    }
    #[test]
    fn semantic_number_tracks_sections_not_caption_or_filtered_occurrences() {
        let mut i = input();
        let mut first = i.semantic_units[0].clone();
        first.end_word = 2;
        first.keyword = None;
        first.intent = Intent::Explanation;
        let mut second = first.clone();
        second.start_word = 2;
        second.end_word = 4;
        second.intent = Intent::Conclusion;
        i.semantic_units = vec![first, second];
        i.caption_spans = (0..4)
            .map(|start_word| WordSpan {
                start_word,
                end_word: start_word + 1,
            })
            .collect();
        let mut e = i.template.elements[0].clone();
        e.binding = Binding::SemanticNumber;
        e.features.accent = false;
        e.timing.anchor = Anchor::CueStart;
        e.intents.clear();
        i.template.elements = vec![e];
        let p = plan(i.clone()).unwrap();
        assert_eq!(
            p.elements
                .iter()
                .map(|e| e.content.as_str())
                .collect::<Vec<_>>(),
            vec!["1", "1", "2", "2"]
        );
        i.template.elements[0].timing.anchor = Anchor::SemanticStart;
        i.template.elements[0].intents = vec![Intent::Conclusion];
        let p = plan(i.clone()).unwrap();
        assert_eq!(p.elements.len(), 1);
        assert_eq!(p.elements[0].content, "2");
        i.template.elements[0].timing.anchor = Anchor::VideoStart;
        i.template.elements[0].intents.clear();
        assert!(plan(i).unwrap().elements.is_empty());
    }
    #[test]
    fn visual_event_hold_bridges_pauses_without_extending_captions_or_words() {
        let mut i = input();
        i.words = vec![word("开场", 0., 0.3), word("结论", 0.8, 1.)];
        i.semantic_units = vec![
            SemanticUnit {
                start_word: 0,
                end_word: 1,
                intent: Intent::Hook,
                keyword: None,
                rationale: "Opening statement".into(),
            },
            SemanticUnit {
                start_word: 1,
                end_word: 2,
                intent: Intent::Conclusion,
                keyword: None,
                rationale: "Closing statement".into(),
            },
        ];
        let mut e = i.template.elements[0].clone();
        e.id = "panel".into();
        e.intents.clear();
        e.features.accent = false;
        e.features.avoid_protected_regions = false;
        e.timing.anchor = Anchor::SemanticStart;
        e.timing.min_seconds = 0.01;
        e.timing.max_seconds = 10.;
        e.timing.offset_seconds = 0.;
        e.binding = Binding::Literal;
        e.literal = Some("panel".into());
        e.resource_id = None;
        i.template.elements = vec![e];
        i.template.composition.scheduling = vec![
            serde_json::from_value(serde_json::json!({
                "elementId":"panel", "eventKind":"semantic", "endAtNextEvent":true,
                "minConfidence":0., "minStrength":0., "cooldownSeconds":0., "maxOccurrences":10,
                "strengthWeight":1., "confidenceWeight":1., "repetitionPenalty":0.
            }))
            .unwrap(),
        ];
        let p = plan(i.clone()).unwrap();
        assert_eq!(p.elements.len(), 2);
        assert_eq!((p.elements[0].start, p.elements[0].end), (0., 0.8));
        assert_eq!((p.elements[1].start, p.elements[1].end), (0.8, 1.2));
        assert_eq!(p.captions[0].end, 0.3);
        assert_eq!(to_value(p.words).unwrap(), to_value(&i.words).unwrap());
        i.template.elements[0].intents = vec![Intent::Hook];
        i.template.elements[0].timing.offset_seconds = 0.1;
        let filtered = plan(i.clone()).unwrap();
        assert_eq!(filtered.elements.len(), 1);
        assert_eq!(
            (filtered.elements[0].start, filtered.elements[0].end),
            (0.1, 0.9)
        );
        i.template.elements[0].timing.max_seconds = 0.4;
        assert_eq!(plan(i).unwrap().elements[0].end, 0.5);
    }
    #[test]
    fn caption_budget_warnings_distinguish_phrases_from_indivisible_words() {
        let rules = SegmentationPolicy {
            max_characters: 8,
            max_phrase_seconds: 1.,
            ..Default::default()
        };
        // A manual phrase exceeds both limits, while each individual word fits.
        let words = vec![word("hello", 0., 0.4), word("world", 1.2, 1.6)];
        let result = cue(
            &words,
            WordSpan {
                start_word: 0,
                end_word: 2,
            },
            0,
            0,
            &rules,
        );
        assert!(
            result
                .warnings
                .contains(&"caption_exceeds_character_budget".into())
        );
        assert!(
            result
                .warnings
                .contains(&"caption_exceeds_phrase_duration".into())
        );
        assert!(
            !result
                .warnings
                .iter()
                .any(|w| w.starts_with("aligned_word_exceeds"))
        );
        assert_eq!((result.start, result.end), (0., 1.6));
        assert_eq!(result.text, "hello world");
        // A genuinely indivisible long token retains its original diagnostic codes.
        let words = vec![word("unbreakable", 0., 1.5)];
        let result = cue(
            &words,
            WordSpan {
                start_word: 0,
                end_word: 1,
            },
            0,
            0,
            &rules,
        );
        assert!(
            result
                .warnings
                .contains(&"aligned_word_exceeds_character_budget".into())
        );
        assert!(
            result
                .warnings
                .contains(&"aligned_word_exceeds_phrase_duration".into())
        );
        assert!(
            !result
                .warnings
                .iter()
                .any(|w| w.starts_with("caption_exceeds"))
        );
        // A multiword phrase containing that token must still expose the token problem.
        let words = vec![word("unbreakable", 0., 1.5), word("word", 1.5, 1.7)];
        let result = cue(
            &words,
            WordSpan {
                start_word: 0,
                end_word: 2,
            },
            0,
            0,
            &rules,
        );
        assert!(
            result
                .warnings
                .contains(&"caption_exceeds_character_budget".into())
        );
        assert!(
            result
                .warnings
                .contains(&"aligned_word_exceeds_character_budget".into())
        );
    }
    #[test]
    fn automatic_character_budget_matches_rendered_spaces_and_unicode() {
        let rules = SegmentationPolicy {
            max_characters: 10,
            max_phrase_seconds: 5.,
            ..Default::default()
        };
        for tokens in [
            vec!["hello", "world", "again"],
            vec!["Hello,", "world"],
            vec!["中文", "hello", "world"],
            vec!["😀", "hello", "world"],
        ] {
            let words: Vec<_> = tokens
                .iter()
                .enumerate()
                .map(|(i, t)| word(t, i as f64 * 0.3, (i + 1) as f64 * 0.3))
                .collect();
            let cues = segment(&words, 4., &rules).unwrap();
            assert_eq!(cues.last().unwrap().word_span.end_word, words.len());
            for cue in cues {
                assert!(
                    cue.text.chars().count() <= rules.max_characters,
                    "{}",
                    cue.text
                );
                assert!(
                    !cue.warnings
                        .iter()
                        .any(|w| w == "aligned_word_exceeds_character_budget")
                );
            }
        }
        let oversized = vec![word("unbreakable", 0., 0.5)];
        let cues = segment(&oversized, 1., &rules).unwrap();
        assert_eq!(cues[0].text, "unbreakable");
        assert!(
            cues[0]
                .warnings
                .iter()
                .any(|w| w == "aligned_word_exceeds_character_budget")
        );
    }
    #[test]
    fn automatic_captions_rebalance_latin_orphans_without_crossing_boundaries() {
        let mut words: Vec<_> = [
            "giving", "us", "the", "summer", "or", "longer", "sunlight", "during", "the", "day.",
        ]
        .iter()
        .enumerate()
        .map(|(i, text)| word(text, i as f64 * 0.3, (i + 1) as f64 * 0.3))
        .collect();
        let rules = SegmentationPolicy {
            max_characters: 42,
            max_phrase_seconds: 5.,
            ..Default::default()
        };
        let captions = segment(&words, 4., &rules).unwrap();
        assert_eq!(captions.len(), 2);
        assert!(
            captions
                .iter()
                .all(|c| c.word_span.end_word - c.word_span.start_word >= 2)
        );
        assert_eq!(captions[0].word_span.start_word, 0);
        assert_eq!(
            captions[0].word_span.end_word,
            captions[1].word_span.start_word
        );
        assert_eq!(captions[1].word_span.end_word, words.len());
        for cue in &captions {
            assert_eq!(cue.start, words[cue.word_span.start_word].start);
            assert_eq!(cue.end, words[cue.word_span.end_word - 1].end);
            assert!(cue.end - cue.start <= rules.max_phrase_seconds);
        }
        words[9].start += 0.5;
        words[9].end += 0.5;
        assert_eq!(
            segment(&words, 4., &rules).unwrap().last().unwrap().text,
            "day."
        );
        words[9].start -= 0.5;
        words[9].end -= 0.5;
        words[8].text = "the,".into();
        assert_eq!(
            segment(&words, 4., &rules).unwrap().last().unwrap().text,
            "day."
        );
        words[8].text = "the".into();
        words[9].speaker = Some("other".into());
        assert_eq!(
            segment(&words, 4., &rules).unwrap().last().unwrap().text,
            "day."
        );
        let phrase: Vec<_> = [
            "the",
            "northern",
            "hemisphere",
            "has",
            "pointed",
            "more",
            "towards",
            "the",
            "sun,",
        ]
        .iter()
        .enumerate()
        .map(|(i, t)| word(t, i as f64 * 0.3, (i + 1) as f64 * 0.3))
        .collect();
        let balanced = segment(&phrase, 4., &rules).unwrap();
        assert_eq!(balanced.len(), 2);
        assert!(
            balanced
                .iter()
                .all(|c| c.word_span.end_word - c.word_span.start_word >= 3)
        );
        let chinese: Vec<_> = "一二三四五"
            .chars()
            .enumerate()
            .map(|(i, c)| word(&c.to_string(), i as f64 * 0.2, (i + 1) as f64 * 0.2))
            .collect();
        let chinese_rules = SegmentationPolicy {
            max_characters: 4,
            ..Default::default()
        };
        assert_eq!(
            segment(&chinese, 2., &chinese_rules)
                .unwrap()
                .last()
                .unwrap()
                .text,
            "五"
        );
    }
    #[test]
    fn clauses_keep_natural_phrases_and_measured_word_boundaries() {
        let clauses = [
            "这只粉色的小伙伴,",
            "放在手心里就很可爱,",
            "出门带着它,",
            "路上也多了一点陪伴",
        ];
        let mut words = vec![];
        for clause in clauses {
            for c in clause.chars() {
                let start = (words.len() * 18) as f64 / 100.;
                let end = ((words.len() + 1) * 18) as f64 / 100.;
                words.push(word(&c.to_string(), start, end));
            }
        }
        let mut rules = SegmentationPolicy::default();
        rules.max_characters = 12;
        let cues = segment(&words, 10., &rules).unwrap();
        assert_eq!(
            cues.iter().map(|c| c.text.as_str()).collect::<Vec<_>>(),
            clauses
        );
        assert_eq!(cues.last().unwrap().word_span.end_word, words.len());
        for cue in cues {
            assert_eq!(cue.start, words[cue.word_span.start_word].start);
            assert_eq!(cue.end, words[cue.word_span.end_word - 1].end);
        }
    }
    #[test]
    fn clause_boundaries_preserve_numbers_speakers_and_empty_input() {
        let rules = SegmentationPolicy::default();
        for (left, right) in [("1,", "000"), ("12:", "30")] {
            let words = [word(left, 0., 0.3), word(right, 0.3, 0.6)];
            assert_eq!(segment(&words, 1., &rules).unwrap().len(), 1);
        }
        let words = [word("先看这里，", 0., 0.6), word("然后继续", 0.6, 1.2)];
        assert_eq!(segment(&words, 2., &rules).unwrap().len(), 2);
        let mut words = [word("hello", 0., 0.3), word("world", 0.3, 0.6)];
        words[1].speaker = Some("second".into());
        assert_eq!(segment(&words, 1., &rules).unwrap().len(), 2);
        assert!(segment(&[], 1., &rules).unwrap().is_empty());
    }
    #[test]
    fn one_semantic_unit_has_multiple_captions_without_changing_words() {
        let input = input();
        let p = plan(input.clone()).unwrap();
        assert_eq!(p.semantic_units.len(), 1);
        assert_eq!(p.captions.len(), 2);
        assert_eq!(p.captions[0].text, "持续的");
        assert_eq!(p.captions[1].text, "内容价值");
        assert!(p.captions.iter().all(|c| c.semantic_index == 0));
        assert_eq!(to_value(p.words).unwrap(), to_value(input.words).unwrap());
        assert_eq!(p.layouts.len(), 1);
    }
    #[test]
    fn caption_changes_do_not_rewrite_intent_keyword_or_semantic_anchors() {
        let mut i = input();
        let mut e = i.template.elements[0].clone();
        e.intents.clear();
        e.timing.anchor = Anchor::SemanticStart;
        e.binding = Binding::Keyword;
        i.template.elements = vec![e];
        let a = plan(i.clone()).unwrap();
        assert_eq!(a.elements.len(), 1);
        assert_eq!(a.elements[0].content, "内容价值");
        i.caption_spans = vec![WordSpan {
            start_word: 0,
            end_word: 4,
        }];
        let b = plan(i).unwrap();
        assert_eq!(b.captions.len(), 1);
        assert_eq!(
            to_value(&a.semantic_units).unwrap(),
            to_value(&b.semantic_units).unwrap()
        );
        assert_eq!(to_value(a.elements).unwrap(), to_value(b.elements).unwrap());
    }
    #[test]
    fn measured_gaps_change_captions_but_not_semantic_units() {
        let mut i = input();
        i.words = vec![word("内容", 0., 0.2), word("价值", 0.7, 0.9)];
        i.semantic_units[0].end_word = 2;
        i.semantic_units[0].keyword = None;
        let a = plan(i.clone()).unwrap();
        assert_eq!(a.captions.len(), 2);
        i.quiet_gap_seconds = Some(vec![0.]);
        let b = plan(i.clone()).unwrap();
        assert_eq!(b.captions.len(), 1);
        assert_eq!(
            to_value(&a.semantic_units).unwrap(),
            to_value(&b.semantic_units).unwrap()
        );
        for gaps in [vec![], vec![0.6], vec![-0.1], vec![f64::NAN]] {
            i.quiet_gap_seconds = Some(gaps);
            assert!(plan(i.clone()).is_err());
        }
    }
    #[test]
    fn rejects_invalid_content_relations_and_preserves_measured_atomic_words() {
        let original = input();
        let mut i = original.clone();
        i.semantic_units[0].end_word = 3;
        assert!(plan(i).is_err());
        let mut i = original.clone();
        i.semantic_units[0].keyword = Some(WordSpan {
            start_word: 0,
            end_word: 5,
        });
        assert!(plan(i).is_err());
        let mut i = original.clone();
        i.caption_spans = vec![WordSpan {
            start_word: 0,
            end_word: 3,
        }];
        assert!(plan(i).is_err());
        let mut i = original;
        i.words[1].start = 0.2;
        assert!(plan(i).is_err());
        let cues = segment(
            &[word("不可分割对齐单元", 0., 6.)],
            7.,
            &SegmentationPolicy::default(),
        )
        .unwrap();
        assert_eq!(cues.len(), 1);
        assert_eq!(cues[0].end, 6.);
        assert!(
            cues[0]
                .warnings
                .contains(&"aligned_word_exceeds_phrase_duration".into())
        );
    }
    #[test]
    fn asset_binding_is_independent_of_role_and_sound_does_not_consume_visual_budget() {
        let mut i = input();
        i.template.visual_rhythm.max_accents_per_cue = 2;
        i.template.bind("sfx", "click");
        i.template.bind("music", "bed");
        let original_slots = to_value(&i.template.resource_slots).unwrap();
        for e in &mut i.template.elements {
            if e.features.representation == Representation::Audio {
                e.features.role = Some(Role::Emphasis);
                e.features.accent = true;
            }
        }
        let p = plan(i.clone()).unwrap();
        assert!(!p.sounds.is_empty());
        assert!(
            p.elements
                .iter()
                .all(|e| e.features.representation != Representation::Audio)
        );
        assert!(
            p.elements
                .iter()
                .any(|e| e.features.representation == Representation::Text)
        );
        i.template.bind("sfx", "other-click");
        assert_eq!(to_value(i.template.resource_slots).unwrap(), original_slots);
    }
    #[test]
    fn sound_cooldown_uses_actual_time_order() {
        let mut i = input();
        i.words = vec![word("观点", 0.2, 3.)];
        i.duration_seconds = 3.5;
        i.semantic_units.clear();
        i.template.bind("sfx", "click");
        let mut e = i
            .template
            .elements
            .iter()
            .find(|e| e.id == "sfx")
            .unwrap()
            .clone();
        e.intents.clear();
        e.timing.anchor = Anchor::CueStart;
        let mut late = e.clone();
        late.id = "late".into();
        late.priority = 100;
        late.timing.offset_seconds = 2.;
        i.template.elements = vec![e, late];
        let p = plan(i).unwrap();
        assert_eq!(
            p.sounds.iter().map(|s| s.start).collect::<Vec<_>>(),
            vec![0.2, 2.2]
        );
    }
    #[test]
    fn transitions_reference_actual_layout_instances_and_entrances_do_not_become_transitions() {
        let mut i = input();
        i.semantic_units = vec![
            SemanticUnit {
                start_word: 0,
                end_word: 2,
                intent: Intent::Neutral,
                keyword: None,
                rationale: "setup".into(),
            },
            SemanticUnit {
                start_word: 2,
                end_word: 4,
                intent: Intent::Emphasis,
                keyword: None,
                rationale: "point".into(),
            },
        ];
        i.template.layouts.truncate(1);
        let mut second = i.template.layouts[0].clone();
        second.id = "second".into();
        second.intents = vec![Intent::Emphasis];
        i.template.layouts[0].intents = vec![Intent::Neutral];
        i.template.layouts.push(second);
        i.template.layout_entrances.push(LayoutEntrance {
            layout_id: "second".into(),
            effect: TransitionKind::Wipe,
            duration_seconds: 0.2,
        });
        assert!(plan(i.clone()).unwrap().transitions.is_empty());
        i.template.transition_rules.push(TransitionRule {
            id: "pair".into(),
            from_layout_id: i.template.layouts[0].id.clone(),
            to_layout_id: "second".into(),
            effect: TransitionKind::Cut,
            duration_seconds: 0.,
        });
        let p = plan(i).unwrap();
        assert_eq!(p.transitions.len(), 1);
        assert_eq!(p.transitions[0].from_instance_id, p.layouts[0].instance_id);
        assert_eq!(p.transitions[0].to_instance_id, p.layouts[1].instance_id);
    }
    #[test]
    fn legacy_input_normalizes_only_at_boundary_and_retains_receipt_identity() {
        let old =
            super::super::seed::from_observation(super::super::seed::observations().remove(0))
                .unwrap();
        let source = json!({"template":old,"words":[{"text":"test","start":0.,"end":1.,"speaker":null,"emphasis":0.}],"durationSeconds":2.,"title":"test","translations":[],"phraseSpecs":[]});
        let mut i: PlanInput = serde_json::from_value(source.clone()).unwrap();
        assert_eq!(i.hash_input().unwrap(), source);
        let normalized = to_value(&i).unwrap();
        assert!(normalized.get("phraseSpecs").is_none());
        assert_eq!(
            normalized["template"]["schemaVersion"],
            "moirai.template.v2"
        );
        i.title = "changed".into();
        assert_eq!(i.hash_input().unwrap()["title"], "changed");
        assert_eq!(
            i.hash_input().unwrap()["template"]["schemaVersion"],
            "moirai.template.v2"
        );
    }
    #[test]
    fn automatic_phrase_preservation_is_opt_in_and_respects_hard_boundaries() {
        let words: Vec<_> = ["we", "can", "find", "a", "better", "way"]
            .iter()
            .enumerate()
            .map(|(i, t)| word(t, i as f64 * 0.2, (i + 1) as f64 * 0.2))
            .collect();
        let phrase = LayoutPhrase {
            word_span: WordSpan {
                start_word: 1,
                end_word: 3,
            },
        };
        let mut rules = SegmentationPolicy {
            max_characters: 10,
            max_phrase_seconds: 5.,
            ..Default::default()
        };
        let plain = spans(&words, 0, 6, &rules, None, &[]);
        assert_eq!(
            to_value(spans(&words, 0, 6, &rules, None, &[phrase.clone()])).unwrap(),
            to_value(&plain).unwrap()
        );
        rules.preserve_layout_phrases = true;
        let protected = spans(&words, 0, 6, &rules, None, &[phrase.clone()]);
        assert!(
            protected
                .iter()
                .any(|s| s.start_word <= 1 && s.end_word >= 3)
        );
        assert!(
            protected
                .iter()
                .all(|s| text(&words[s.start_word..s.end_word]).chars().count() <= 10)
        );
        let gaps = [0., 0.5, 0., 0., 0.];
        let paused = spans(&words, 0, 6, &rules, Some(&gaps), &[phrase.clone()]);
        assert!(paused.iter().any(|s| s.end_word == 2));
        let mut speaker = words.clone();
        speaker[2].speaker = Some("other".into());
        assert!(
            spans(&speaker, 0, 6, &rules, None, &[phrase.clone()])
                .iter()
                .any(|s| s.end_word == 2)
        );
        rules.max_characters = 4;
        assert_eq!(
            to_value(spans(&words, 0, 6, &rules, None, &[phrase])).unwrap(),
            to_value(spans(&words, 0, 6, &rules, None, &[])).unwrap()
        );
    }
    #[test]
    fn explicit_caption_spans_ignore_phrase_policy_and_word_times_are_preserved() {
        let mut i = input();
        i.template.segmentation.preserve_layout_phrases = true;
        i.layout_phrases = vec![LayoutPhrase {
            word_span: WordSpan {
                start_word: 1,
                end_word: 3,
            },
        }];
        i.caption_spans = vec![
            WordSpan {
                start_word: 0,
                end_word: 2,
            },
            WordSpan {
                start_word: 2,
                end_word: 4,
            },
        ];
        let original = i.words.clone();
        let p = plan(i).unwrap();
        assert_eq!(p.captions.len(), 2);
        assert_eq!(p.captions[0].word_span.end_word, 2);
        for c in &p.captions {
            assert_eq!(c.start, original[c.word_span.start_word].start);
            assert_eq!(c.end, original[c.word_span.end_word - 1].end);
        }
        assert!(
            p.warnings
                .iter()
                .any(|w| w.starts_with("layout_phrase_crosses_caption:"))
        );
    }
}
