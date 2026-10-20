use super::model::{Motion, MotionKey, MotionTiming};
use anyhow::{Result, ensure};

pub fn validate(timing: &MotionTiming) -> Result<()> {
    ensure!(
        (0.0..=1.0).contains(&timing.enter_end)
            && (0.0..=1.0).contains(&timing.exit_start)
            && timing.enter_end < timing.exit_start
            && (0.0..=30.0).contains(&timing.enter_seconds)
            && (0.0..=30.0).contains(&timing.exit_seconds)
            && (timing.enter_end > 0. || timing.enter_seconds == 0.)
            && (timing.exit_start < 1. || timing.exit_seconds == 0.),
        "invalid motion phase timing"
    );
    if let Some(c) = &timing.coverage {
        ensure!(
            c.min_exit_frames <= 120
                && c.min_post_frames <= 120
                && (c.min_exit_frames > 0 || c.min_post_frames > 0)
                && (c.min_exit_frames == 0 || timing.exit_seconds > 0.),
            "invalid motion sampling coverage"
        );
    }
    Ok(())
}

/// Shared phase compression for compilation and frame-grid diagnostics.
/// Callers validate the timing and positive duration before calling.
pub fn resolved_phase_seconds(timing: &MotionTiming, duration: f64) -> (f64, f64) {
    let total = timing.enter_seconds + timing.exit_seconds;
    let scale = if total > duration {
        duration / total
    } else {
        1.
    };
    (timing.enter_seconds * scale, timing.exit_seconds * scale)
}

/// Reify an authored phase clock after the instance's final event/lifecycle bounds are known.
pub fn resolve(motion: &Motion, timing: &MotionTiming, duration: f64) -> Result<Motion> {
    validate(timing)?;
    ensure!(
        duration.is_finite() && duration > 0.,
        "motion instance duration must be positive"
    );
    let (enter, exit) = resolved_phase_seconds(timing, duration);
    let hold = (duration - enter - exit).max(0.);
    let mut keys: Vec<MotionKey> = Vec::with_capacity(motion.keys.len());
    for key in &motion.keys {
        let seconds = if key.time <= timing.enter_end && timing.enter_end > 0. {
            key.time / timing.enter_end * enter
        } else if key.time >= timing.exit_start && timing.exit_start < 1. {
            duration - exit + (key.time - timing.exit_start) / (1. - timing.exit_start) * exit
        } else if timing.exit_start > timing.enter_end {
            enter + (key.time - timing.enter_end) / (timing.exit_start - timing.enter_end) * hold
        } else {
            enter
        };
        let mut resolved = key.clone();
        resolved.time = (seconds / duration).clamp(0., 1.);
        // Collapsed holds use the last boundary; zero-length exits end with the held value.
        if let Some(previous) = keys
            .last_mut()
            .filter(|previous| (previous.time - resolved.time).abs() < 1e-12)
        {
            if !(exit == 0. && resolved.time == 1.) {
                *previous = resolved;
            }
        } else {
            keys.push(resolved);
        }
    }
    Ok(Motion {
        property: motion.property.clone(),
        keys,
    })
}

#[cfg(test)]
mod tests {
    use super::super::model::{Easing, MotionProperty};
    use super::*;
    fn motion() -> Motion {
        Motion {
            property: MotionProperty::Opacity,
            keys: vec![
                MotionKey {
                    time: 0.,
                    value: 0.,
                    easing: Easing::EaseOut,
                },
                MotionKey {
                    time: 0.2,
                    value: 1.,
                    easing: Easing::Linear,
                },
                MotionKey {
                    time: 0.8,
                    value: 1.,
                    easing: Easing::EaseIn,
                },
                MotionKey {
                    time: 1.,
                    value: 0.,
                    easing: Easing::Linear,
                },
            ],
        }
    }
    #[test]
    fn entrance_and_exit_keep_seconds_while_hold_follows_duration() {
        let timing = MotionTiming {
            coverage: None,
            enter_end: 0.2,
            exit_start: 0.8,
            enter_seconds: 0.2,
            exit_seconds: 0.15,
        };
        for duration in [0.5, 1., 4., 12.] {
            let result = resolve(&motion(), &timing, duration).unwrap();
            let seconds: Vec<_> = result.keys.iter().map(|key| key.time * duration).collect();
            for (actual, expected) in seconds.iter().zip([0., 0.2, duration - 0.15, duration]) {
                assert!((actual - expected).abs() < 1e-9);
            }
        }
    }
    #[test]
    fn short_instances_compress_phases_without_duplicate_or_outside_keys() {
        let timing = MotionTiming {
            coverage: None,
            enter_end: 0.2,
            exit_start: 0.8,
            enter_seconds: 0.2,
            exit_seconds: 0.2,
        };
        let result = resolve(&motion(), &timing, 0.1).unwrap();
        assert_eq!(
            result.keys.iter().map(|key| key.time).collect::<Vec<_>>(),
            vec![0., 0.5, 1.]
        );
        assert!(matches!(result.keys[1].easing, Easing::EaseIn));
        let zero = MotionTiming {
            coverage: None,
            enter_seconds: 0.,
            exit_seconds: 0.,
            ..timing
        };
        let result = resolve(&motion(), &zero, 2.).unwrap();
        assert_eq!(
            result.keys.iter().map(|key| key.time).collect::<Vec<_>>(),
            vec![0., 1.]
        );
        assert!(result.keys.iter().all(|key| key.value == 1.));
        assert!(resolve(&motion(), &zero, 0.).is_err());
        assert!(
            validate(&MotionTiming {
                coverage: None,
                enter_seconds: f64::NAN,
                ..zero
            })
            .is_err()
        );
    }
}
