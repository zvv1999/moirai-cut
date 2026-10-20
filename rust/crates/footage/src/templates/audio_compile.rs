use super::{
    audio_plan::{GainPoint, SoundInstance},
    model::MediaUse,
};
use crate::domain::{TICKS, id};
use anyhow::{Result, ensure};
use serde::Serialize;
use serde_json::{Value, json};

/// Resolved from the native sound catalog, never accepted from a compilation request.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioAsset {
    pub sha256: String,
    pub duration_seconds: f64,
}

fn tick(seconds: f64) -> i64 {
    (seconds * TICKS as f64).round() as i64
}

fn gain_at(points: &[GainPoint], time: f64) -> f64 {
    let right = points.partition_point(|p| p.time <= time);
    if right == 0 {
        return points[0].value_db;
    }
    if right == points.len() {
        return points[right - 1].value_db;
    }
    let a = &points[right - 1];
    let b = &points[right];
    a.value_db + (b.value_db - a.value_db) * (time - a.time) / (b.time - a.time)
}

pub fn compile(
    sound: &SoundInstance,
    asset: &AudioAsset,
    offset: f64,
    warnings: &mut Vec<String>,
) -> Result<Vec<Value>> {
    ensure!(
        asset.duration_seconds.is_finite() && asset.duration_seconds > 0.,
        "invalid sound duration"
    );
    ensure!(
        asset.sha256.len() == 64 && asset.sha256.bytes().all(|b| b.is_ascii_hexdigit()),
        "invalid sound hash"
    );
    ensure!(!sound.gain.is_empty(), "missing sound gain envelope");
    let source_duration = tick(asset.duration_seconds);
    ensure!(source_duration > 0, "sound shorter than one timeline tick");
    let requested_duration = tick(sound.end) - tick(sound.start);
    let music = sound.media_use == MediaUse::Music;
    let total = if music {
        requested_duration
    } else {
        requested_duration.min(source_duration)
    };
    ensure!(total > 0, "sound instance shorter than one timeline tick");
    let repeats = (total + source_duration - 1) / source_duration;
    ensure!(
        repeats <= 1000,
        "music would require more than 1000 repetitions; choose a longer source"
    );
    if repeats > 1 {
        warnings.push(format!(
            "music_loop_not_beat_aligned:{}:{repeats}",
            sound.instance_id
        ));
    }
    if !music && requested_duration != source_duration {
        warnings.push(format!("sound_duration_clamped:{}", sound.instance_id));
    }
    let mut output = vec![];
    let mut elapsed = 0;
    while elapsed < total {
        let duration = source_duration.min(total - elapsed);
        let from = elapsed as f64 / TICKS as f64;
        let to = (elapsed + duration) as f64 / TICKS as f64;
        let mut keys = vec![
            (0, gain_at(&sound.gain, from)),
            (duration, gain_at(&sound.gain, to)),
        ];
        for p in &sound.gain {
            let time = tick(p.time) - elapsed;
            if time > 0 && time < duration {
                keys.push((time, p.value_db));
            }
        }
        keys.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.total_cmp(&b.1)));
        keys.dedup_by_key(|p| p.0);
        let volume = keys[0].1;
        let keys: Vec<_> = keys.into_iter().map(|(time, value)| json!({
            "id":id(),"time":time,"value":value,"segmentToNext":"linear","tangentMode":"broken"
        })).collect();
        let seconds = duration as f64 / TICKS as f64;
        let fade_in = if music {
            if elapsed == 0 { 0.15 } else { 0.005 }
        } else {
            0.002_f64
        };
        let fade_out = if music && elapsed + duration == total {
            0.25_f64
        } else {
            0.005_f64
        };
        output.push(json!({"id":id(),"type":"audio","sourceType":"library",
            "sourceUrl":format!("/api/footage/templates/sounds/{}/audio?sha256={}", sound.sound_id, asset.sha256),
            "name":format!("{} / {}", sound.kind_name(), sound.instance_id),
            "startTime":tick(offset + sound.start)+elapsed,"duration":duration,
            "sourceDuration":source_duration,"trimStart":0,"trimEnd":source_duration-duration,"hidden":false,
            "params":{"volume":volume,"muted":false,"audioFadeIn":fade_in.min(seconds/2.),
                "audioFadeOut":fade_out.min(seconds/2.),"template.instanceId":sound.instance_id,
                "template.soundId":sound.sound_id,"template.soundSha256":asset.sha256,
                "template.resourceId":sound.resource_id},
            "animations":{"volume":{"keys":keys}}}));
        elapsed += duration;
    }
    Ok(output)
}

impl SoundInstance {
    fn kind_name(&self) -> &'static str {
        if self.media_use == MediaUse::Music {
            "Music"
        } else {
            "SFX"
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sound() -> SoundInstance {
        SoundInstance {
            instance_id: "music-1".into(),
            element_id: "music".into(),
            z: 0,
            role: None,
            resource_id: "music".into(),
            sound_id: "sound-1".into(),
            media_use: MediaUse::Music,
            start: 1.,
            end: 6.,
            gain: vec![
                GainPoint {
                    time: 0.,
                    value_db: -22.,
                },
                GainPoint {
                    time: 1.,
                    value_db: -32.,
                },
                GainPoint {
                    time: 4.,
                    value_db: -32.,
                },
                GainPoint {
                    time: 5.,
                    value_db: -22.,
                },
            ],
        }
    }
    fn asset() -> AudioAsset {
        AudioAsset {
            sha256: "a".repeat(64),
            duration_seconds: 2.,
        }
    }
    #[test]
    fn music_cycles_have_continuous_gain_and_exact_timeline_coverage() {
        let mut warnings = vec![];
        let clips = compile(&sound(), &asset(), 4., &mut warnings).unwrap();
        assert_eq!(clips.len(), 3);
        assert_eq!(clips[0]["startTime"], tick(5.));
        assert_eq!(clips[2]["startTime"], tick(9.));
        assert_eq!(clips[2]["duration"], tick(1.));
        assert_eq!(clips[2]["trimEnd"], tick(1.));
        assert_eq!(clips[1]["params"]["volume"], -32.);
        for pair in clips.windows(2) {
            assert_eq!(
                pair[0]["animations"]["volume"]["keys"]
                    .as_array()
                    .unwrap()
                    .last()
                    .unwrap()["value"],
                pair[1]["animations"]["volume"]["keys"][0]["value"]
            );
        }
        assert!(
            warnings
                .iter()
                .any(|w| w.starts_with("music_loop_not_beat_aligned"))
        );
    }
    #[test]
    fn effects_never_repeat_and_subtick_sources_are_rejected() {
        let mut s = sound();
        s.media_use = MediaUse::SoundEffect;
        let clips = compile(&s, &asset(), 0., &mut vec![]).unwrap();
        assert_eq!(clips.len(), 1);
        assert_eq!(clips[0]["duration"], tick(2.));
        let mut a = asset();
        a.duration_seconds = 0.1 / TICKS as f64;
        assert!(compile(&s, &a, 0., &mut vec![]).is_err());
    }
}
