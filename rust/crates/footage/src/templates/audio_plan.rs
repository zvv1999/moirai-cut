use super::{
    model::{MediaUse, Representation, Role, Template},
    rhythm::{PlacedElement, Word},
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GainPoint {
    /// Seconds relative to this sound instance, not the source file or project.
    pub time: f64,
    pub value_db: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SoundInstance {
    pub instance_id: String,
    pub element_id: String,
    pub z: i32,
    pub role: Option<Role>,
    pub resource_id: String,
    pub sound_id: String,
    pub media_use: MediaUse,
    pub start: f64,
    pub end: f64,
    /// Linear interpolation in dB. This is attenuation, not loudness normalization.
    pub gain: Vec<GainPoint>,
}

fn music_gain(start: f64, end: f64, words: &[Word], template: &Template) -> Vec<GainPoint> {
    music_gain_ranges(
        start,
        end,
        words.iter().map(|w| (w.start, w.end)).collect(),
        template,
    )
}
fn music_gain_ranges(
    start: f64,
    end: f64,
    mut ranges: Vec<(f64, f64)>,
    template: &Template,
) -> Vec<GainPoint> {
    let rules = &template.mix;
    let attack = rules.music_duck_attack_seconds;
    let release = rules.music_duck_release_seconds;
    let base = rules.music_gain_db;
    let duck = (base + rules.music_duck_db).max(-60.);
    let mut spans: Vec<(f64, f64)> = vec![];
    // Hold attenuation through brief inter-word pauses instead of pumping on every syllable.
    ranges.sort_by(|a, b| a.0.total_cmp(&b.0));
    for (a, b) in ranges {
        if let Some(last) = spans.last_mut()
            && a - last.1 <= attack + release
        {
            last.1 = last.1.max(b);
        } else {
            spans.push((a, b));
        }
    }
    let mut points = vec![(start, base), (end, base)];
    for (a, b) in spans {
        let knots = [
            (a - attack, base),
            (a, duck),
            (b, duck),
            (b + release, base),
        ];
        for pair in knots.windows(2) {
            let (x0, y0) = pair[0];
            let (x1, y1) = pair[1];
            let lo = x0.max(start);
            let hi = x1.min(end);
            if lo <= hi {
                for time in [lo, hi] {
                    let value = y0 + (y1 - y0) * ((time - x0) / (x1 - x0));
                    points.push((time, value));
                }
            }
        }
    }
    points.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.total_cmp(&b.1)));
    points.dedup_by(|a, b| a.0 == b.0);
    points
        .into_iter()
        .map(|(time, value_db)| GainPoint {
            time: time - start,
            value_db,
        })
        .collect()
}

pub fn plan(elements: &[PlacedElement], words: &[Word], template: &Template) -> Vec<SoundInstance> {
    plan_with_events(elements, words, template, &[])
}
pub fn plan_with_events(
    elements: &[PlacedElement],
    words: &[Word],
    template: &Template,
    events: &[super::sound_events::SoundEvent],
) -> Vec<SoundInstance> {
    elements
        .iter()
        .filter_map(|e| {
            let music = e.features.media_use == Some(MediaUse::Music);
            if e.features.representation != Representation::Audio {
                return None;
            }
            let resource_id = e.resource_id.as_ref()?;
            Some(SoundInstance {
                instance_id: e.instance_id.clone(),
                element_id: e.element_id.clone(),
                z: e.z,
                role: e.features.role.clone(),
                resource_id: resource_id.clone(),
                sound_id: template.asset_id(resource_id)?.into(),
                media_use: e.features.media_use.clone()?,
                start: e.start,
                end: e.end,
                gain: if music {
                    if events.is_empty() {
                        music_gain(e.start, e.end, words, template)
                    } else {
                        let ranges = words
                            .iter()
                            .map(|w| (w.start, w.end))
                            .chain(
                                events
                                    .iter()
                                    .filter(|s| {
                                        s.kind == super::composition::SoundEventKind::Speech
                                            && s.end > s.start
                                    })
                                    .map(|s| (s.start, s.end)),
                            )
                            .collect();
                        music_gain_ranges(e.start, e.end, ranges, template)
                    }
                } else {
                    vec![
                        GainPoint {
                            time: 0.,
                            value_db: template.mix.effect_gain_db,
                        },
                        GainPoint {
                            time: e.end - e.start,
                            value_db: template.mix.effect_gain_db,
                        },
                    ]
                },
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn word(start: f64, end: f64) -> Word {
        Word {
            text: "speech".into(),
            start,
            end,
            speaker: None,
            emphasis: 0.,
        }
    }
    #[test]
    fn ducks_at_speech_preserves_short_pauses_and_recovers_in_long_pauses() {
        let t = super::super::seed::templates().unwrap().remove(0);
        let points = music_gain(0., 5., &[word(1., 2.), word(2.1, 3.), word(4., 4.5)], &t);
        for time in [1., 3., 4., 4.5] {
            assert_eq!(
                points.iter().find(|p| p.time == time).unwrap().value_db,
                -32.
            );
        }
        assert!(!points.iter().any(|p| p.time > 1. && p.time < 3.));
        assert!(
            points
                .iter()
                .any(|p| p.time > 3. && p.time < 4. && p.value_db == -22.)
        );
        assert_eq!(points.first().unwrap().value_db, -22.);
        assert_eq!(points.last().unwrap().value_db, -22.);
        assert!(points.windows(2).all(|p| p[0].time < p[1].time));
    }
    #[test]
    fn clips_envelopes_in_speech_and_during_attack_without_resetting_gain() {
        let t = super::super::seed::templates().unwrap().remove(0);
        let words = [word(1., 3.)];
        let during = music_gain(2., 2.5, &words, &t);
        assert!(during.iter().all(|p| p.value_db == -32.));
        assert_eq!(during.last().unwrap().time, 0.5);
        let attack = music_gain(0.96, 1.5, &words, &t);
        assert!((attack[0].value_db + 27.).abs() < 1e-8);
        let silent = music_gain(0., 2., &[], &t);
        assert_eq!(silent.len(), 2);
        assert!(silent.iter().all(|p| p.value_db == -22.));
    }
}
