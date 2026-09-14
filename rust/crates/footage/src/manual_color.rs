use crate::{adaptive_lut::AdaptiveLut, domain::Recipe};

pub fn enabled(r: &Recipe) -> bool {
    (r.brightness != 0.0 || r.contrast != 1.0 || r.saturation != 1.0)
        || [
            r.exposure,
            r.temperature,
            r.tint,
            r.highlights,
            r.shadows,
            r.whites,
            r.blacks,
            r.vibrance,
        ]
        .iter()
        .any(|v| *v != 0.0)
}

fn pixel(mut rgb: [f64; 3], r: &Recipe) -> [f64; 3] {
    // Exposure operates in linear light; the remaining controls operate in display RGB.
    for (i, c) in rgb.iter_mut().enumerate() {
        let linear = if *c <= 0.04045 {
            *c / 12.92
        } else {
            ((*c + 0.055) / 1.055).powf(2.4)
        };
        let gain = [
            r.temperature * 0.25 + r.tint * 0.12,
            -r.tint * 0.12,
            -r.temperature * 0.25 + r.tint * 0.12,
        ][i];
        let v = linear * 2.0_f64.powf(r.exposure + gain);
        *c = if v <= 0.0031308 {
            12.92 * v
        } else {
            1.055 * v.powf(1.0 / 2.4) - 0.055
        };
    }
    let luma = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
    let x = luma.clamp(0.0, 1.0);
    let smooth = |v: f64| {
        let t = v.clamp(0.0, 1.0);
        t * t * (3.0 - 2.0 * t)
    };
    let delta = 0.25
        * (r.shadows * (1.0 - smooth(x / 0.65)) * (x * 12.0).min(1.0)
            + r.highlights * smooth((x - 0.35) / 0.65) * ((1.0 - x) * 12.0).min(1.0))
        + 0.2 * (r.whites * x.powi(4) + r.blacks * (1.0 - x).powi(4));
    let y = (luma + delta) * (219.0 / 255.0) + 16.0 / 255.0;
    let adjusted = ((y - 0.5) * r.contrast + 0.5 + r.brightness).clamp(0.0, 1.0);
    let output = (adjusted - 16.0 / 255.0) * (255.0 / 219.0);
    let max = rgb.iter().copied().fold(0.0_f64, f64::max);
    let min = rgb.iter().copied().fold(1.0_f64, f64::min);
    let saturation = if max > 0.0 {
        ((max - min) / max).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let gain = r.saturation * (1.0 + r.vibrance * (1.0 - saturation));
    rgb.map(|c| (output + (c - luma) * gain).clamp(0.0, 1.0))
}

pub fn lut(r: &Recipe) -> AdaptiveLut {
    let size = 33;
    let mut values = Vec::with_capacity(size * size * size * 3);
    for b in 0..size {
        for g in 0..size {
            for red in 0..size {
                values.extend(
                    pixel([red as f64 / 32.0, g as f64 / 32.0, b as f64 / 32.0], r)
                        .map(|v| v as f32),
                );
            }
        }
    }
    AdaptiveLut { size, values }
}

pub fn apply_to(mut base: AdaptiveLut, recipe: &Recipe) -> AdaptiveLut {
    if enabled(recipe) {
        for rgb in base.values.chunks_exact_mut(3) {
            let adjusted = pixel([rgb[0] as f64, rgb[1] as f64, rgb[2] as f64], recipe);
            for (target, value) in rgb.iter_mut().zip(adjusted) {
                *target = value as f32;
            }
        }
    }
    base
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn adjustments_compose_after_base_in_both_modes() {
        let base = lut(&Recipe {
            exposure: 0.3,
            ..Default::default()
        });
        assert_eq!(
            apply_to(base.clone(), &Recipe::default()).values,
            base.values
        );
        let mut r = Recipe {
            temperature: 0.4,
            brightness: 0.03,
            ..Default::default()
        };
        let adjusted = apply_to(base.clone(), &r);
        assert_ne!(adjusted.values, base.values);
        for (input, actual) in base
            .values
            .chunks_exact(3)
            .zip(adjusted.values.chunks_exact(3))
        {
            let expected = pixel([input[0] as f64, input[1] as f64, input[2] as f64], &r);
            for i in 0..3 {
                assert!((actual[i] as f64 - expected[i]).abs() < 1e-6);
            }
        }
        r.color_mode = "preserve".into();
        assert!(enabled(&r));
        assert_eq!(apply_to(base, &r).values, adjusted.values);
    }
    #[test]
    fn old_recipe_defaults_and_parameter_validation() {
        let mut data = serde_json::to_value(Recipe::default()).unwrap();
        for key in [
            "exposure",
            "temperature",
            "tint",
            "highlights",
            "shadows",
            "whites",
            "blacks",
            "vibrance",
        ] {
            data.as_object_mut().unwrap().remove(key);
        }
        let r: Recipe = serde_json::from_value(data.clone()).unwrap();
        assert_eq!(r, Recipe::default());
        for key in [
            "exposure",
            "temperature",
            "tint",
            "highlights",
            "shadows",
            "whites",
            "blacks",
            "vibrance",
        ] {
            let mut invalid = data.clone();
            invalid[key] = serde_json::json!(3.0);
            assert!(
                serde_json::from_value::<Recipe>(invalid)
                    .unwrap()
                    .validate()
                    .is_err()
            );
        }
    }

    #[test]
    #[ignore = "requires ffmpeg"]
    fn cube_matches_ffmpeg_pixels() {
        use std::{fs, process::Command};
        let dir = tempfile::tempdir().unwrap();
        let r = Recipe {
            color_mode: "manual".into(),
            exposure: 0.5,
            temperature: 0.3,
            tint: -0.2,
            highlights: -0.4,
            shadows: 0.3,
            whites: 0.1,
            blacks: -0.1,
            vibrance: 0.5,
            ..Default::default()
        };
        fs::write(dir.path().join("color.cube"), lut(&r).cube()).unwrap();
        let samples = [
            [64u8, 96, 128],
            [180, 150, 120],
            [32, 40, 48],
            [210, 220, 230],
        ];
        fs::write(dir.path().join("in.rgb"), samples.concat()).unwrap();
        let status = Command::new(std::env::var("MOIRAI_FFMPEG").unwrap_or("ffmpeg".into()))
            .current_dir(dir.path())
            .args([
                "-v",
                "error",
                "-f",
                "rawvideo",
                "-pixel_format",
                "rgb24",
                "-video_size",
                "2x2",
                "-i",
                "in.rgb",
                "-vf",
                "lut3d=file=color.cube:interp=trilinear",
                "-frames:v",
                "1",
                "-f",
                "rawvideo",
                "-pix_fmt",
                "rgb24",
                "out.rgb",
            ])
            .status()
            .unwrap();
        assert!(status.success());
        let actual = fs::read(dir.path().join("out.rgb")).unwrap();
        for (sample, result) in samples.iter().zip(actual.chunks_exact(3)) {
            let expected = pixel(sample.map(|c| c as f64 / 255.0), &r);
            for channel in 0..3 {
                assert!((result[channel] as f64 - expected[channel] * 255.0).abs() < 3.0);
            }
        }
    }
    #[test]
    fn neutral_and_directional_controls() {
        let mut r = Recipe {
            color_mode: "manual".into(),
            ..Default::default()
        };
        assert!(!enabled(&r));
        for c in [0.0, 0.2, 0.5, 1.0] {
            assert!((pixel([c; 3], &r)[0] - c).abs() < 1e-6);
        }
        r.exposure = 1.0;
        assert!(pixel([0.3; 3], &r)[0] > 0.4);
        r.exposure = 0.0;
        r.temperature = 1.0;
        let warm = pixel([0.5; 3], &r);
        assert!(warm[0] > warm[2]);
        r.temperature = 0.0;
        r.shadows = 1.0;
        assert!(pixel([0.2; 3], &r)[0] > 0.2);
        assert!((pixel([0.9; 3], &r)[0] - 0.9).abs() < 1e-6);
        let cube = lut(&r);
        assert_eq!(cube.values.len(), 33 * 33 * 33 * 3);
        assert!(
            cube.values
                .iter()
                .all(|v| v.is_finite() && (0.0..=1.0).contains(v))
        );
    }
}
