use crate::domain::{Recipe, Shot, Source, TICKS, id};
use anyhow::{Context, Result, bail, ensure};
use serde_json::Value;
use std::{
    fs::{self, File},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

#[derive(Clone)]
pub struct Media {
    pub ffmpeg: String,
    pub ffprobe: String,
    pub root: PathBuf,
}

impl Media {
    pub fn run(&self, tool: &str, args: &[String], timeout: u64) -> Result<String> {
        let dir = self.root.join("process");
        fs::create_dir_all(&dir)?;
        let name = id();
        let out = dir.join(format!("{name}.out"));
        let err = dir.join(format!("{name}.err"));
        let result = (|| {
            let mut child = Command::new(tool)
                .args(args)
                .stdin(Stdio::null())
                .stdout(File::create(&out)?)
                .stderr(File::create(&err)?)
                .spawn()
                .context("无法启动视频工具")?;
            let start = Instant::now();
            loop {
                if let Some(status) = child.try_wait()? {
                    if !status.success() {
                        let message = fs::read_to_string(&err).unwrap_or_default();
                        let tail: String = message
                            .chars()
                            .rev()
                            .take(1800)
                            .collect::<String>()
                            .chars()
                            .rev()
                            .collect();
                        bail!("视频处理失败: {}", tail);
                    }
                    return Ok(fs::read_to_string(&out)?);
                }
                if start.elapsed() > Duration::from_secs(timeout) {
                    let _ = child.kill();
                    let _ = child.wait();
                    bail!("视频处理超时，可重试");
                }
                thread::sleep(Duration::from_millis(100));
            }
        })();
        let _ = fs::remove_file(out);
        let _ = fs::remove_file(err);
        result
    }
    pub fn probe(&self, path: &Path) -> Result<Value> {
        let args = strings(&[
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            &path.to_string_lossy(),
        ]);
        Ok(serde_json::from_str(&self.run(
            &self.ffprobe,
            &args,
            60,
        )?)?)
    }
    pub fn source(
        &self,
        path: &Path,
        name: String,
        product: String,
        batch: String,
        sha256: String,
        source_id: String,
    ) -> Result<Source> {
        let p = self.probe(path)?;
        let stream = p["streams"]
            .as_array()
            .and_then(|s| s.iter().find(|s| s["codec_type"] == "video"))
            .context("文件没有视频轨道")?;
        let duration = p["format"]["duration"]
            .as_str()
            .unwrap_or("0")
            .parse::<f64>()?;
        ensure!(
            duration.is_finite() && (0.2..=3600.0).contains(&duration),
            "首版支持 0.2 秒至 60 分钟的单条视频"
        );
        let rate = stream["avg_frame_rate"]
            .as_str()
            .unwrap_or("30/1")
            .split('/')
            .collect::<Vec<_>>();
        let fps = rate[0].parse::<f64>().unwrap_or(30.0)
            / rate.get(1).unwrap_or(&"1").parse::<f64>().unwrap_or(1.0);
        let rotation = stream["side_data_list"]
            .as_array()
            .and_then(|s| s.iter().find_map(|v| v["rotation"].as_i64()))
            .unwrap_or(0) as i32;
        let mut width = stream["width"].as_u64().context("无效视频尺寸")? as u32;
        let mut height = stream["height"].as_u64().context("无效视频尺寸")? as u32;
        if rotation.rem_euclid(180) == 90 {
            std::mem::swap(&mut width, &mut height);
        }
        ensure!(
            width >= 2 && height >= 2 && width <= 16384 && height <= 16384,
            "视频尺寸不受支持"
        );
        Ok(Source {
            id: source_id,
            name,
            product,
            batch,
            sha256,
            path: path.to_string_lossy().into(),
            duration_ticks: (duration * TICKS as f64).round() as i64,
            width,
            height,
            fps: if fps.is_finite() && fps > 0.0 {
                fps
            } else {
                30.0
            },
            color_transfer: stream["color_transfer"]
                .as_str()
                .unwrap_or("unknown")
                .into(),
            rotation,
            status: "queued".into(),
            nas_relative_path: None,
            error: None,
            created_at: crate::domain::now(),
        })
    }
    pub fn source_dir(&self, id: &str) -> PathBuf {
        self.root.join("sources").join(id)
    }
    pub fn verify_original(&self, source: &Source) -> Result<()> {
        ensure!(
            crate::storage::hash(Path::new(&source.path))? == source.sha256,
            "上传分镜文件校验失败"
        );
        self.run(
            &self.ffmpeg,
            &strings(&[
                "-v",
                "error",
                "-xerror",
                "-i",
                &source.path,
                "-map",
                "0:v:0",
                "-map",
                "0:a?",
                "-f",
                "null",
                "-",
            ]),
            3600,
        )?;
        Ok(())
    }
    pub fn prepare(&self, source: &Source) -> Result<()> {
        let dir = self.source_dir(&source.id);
        fs::create_dir_all(&dir)?;
        let target = dir.join("preview.mp4");
        if !target.exists() {
            let temp = dir.join("preview.tmp.mp4");
            self.run(&self.ffmpeg, &strings(&["-y", "-v", "error", "-i", &source.path, "-map", "0:v:0", "-map", "0:a:0?", "-vf", "scale=640:960:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "25", "-c:a", "aac", "-movflags", "+faststart", &temp.to_string_lossy()]), 3600)?;
            fs::rename(temp, &target)?;
        }
        self.poster(&target, &dir.join("poster.jpg"))?;
        Ok(())
    }
    pub fn poster(&self, input: &Path, output: &Path) -> Result<()> {
        self.run(
            &self.ffmpeg,
            &strings(&[
                "-y",
                "-v",
                "error",
                "-i",
                &input.to_string_lossy(),
                "-frames:v",
                "1",
                "-vf",
                "scale=360:640:force_original_aspect_ratio=decrease",
                "-update",
                "1",
                &output.to_string_lossy(),
            ]),
            60,
        )?;
        Ok(())
    }
    pub fn analysis_clip(
        &self,
        source: &Source,
        start: f64,
        duration: f64,
        output: &Path,
    ) -> Result<()> {
        let (width, height) = analysis_dimensions(source);
        let filters = format!(
            "fps=4,scale={width}:{height}:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black"
        );
        self.run(
            &self.ffmpeg,
            &strings(&[
                "-y",
                "-v",
                "error",
                "-ss",
                &start.to_string(),
                "-i",
                &source.path,
                "-t",
                &duration.to_string(),
                "-an",
                "-vf",
                &filters,
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-crf",
                "27",
                "-pix_fmt",
                "yuv420p",
                "-map_metadata",
                "-1",
                "-metadata:s:v:0",
                "rotate=0",
                "-movflags",
                "+faststart",
                &output.to_string_lossy(),
            ]),
            300,
        )?;
        self.verify_analysis_proxy(source, output)?;
        Ok(())
    }
    pub fn verify_analysis_proxy(&self, source: &Source, output: &Path) -> Result<()> {
        let probe = self.probe(output)?;
        let video = probe["streams"]
            .as_array()
            .and_then(|streams| {
                streams
                    .iter()
                    .find(|stream| stream["codec_type"] == "video")
            })
            .context("分析代理缺少视频轨道")?;
        let (width, height) = analysis_dimensions(source);
        ensure!(
            video["width"].as_u64() == Some(u64::from(width))
                && video["height"].as_u64() == Some(u64::from(height)),
            "分析代理必须为 {width}×{height}，拒绝发送非 720p 视频"
        );
        ensure!(
            video["sample_aspect_ratio"] == "1:1",
            "分析代理像素比例必须为 1:1"
        );
        Ok(())
    }
    pub fn frame(&self, source: &Source, seconds: f64, output: &Path) -> Result<()> {
        self.run(
            &self.ffmpeg,
            &strings(&[
                "-y",
                "-v",
                "error",
                "-ss",
                &seconds.to_string(),
                "-i",
                &source.path,
                "-frames:v",
                "1",
                "-vf",
                "scale=480:720:force_original_aspect_ratio=decrease",
                "-update",
                "1",
                &output.to_string_lossy(),
            ]),
            60,
        )?;
        Ok(())
    }
    pub fn frame_times(&self, source: &Source) -> Result<Vec<i64>> {
        let raw = self.run(
            &self.ffprobe,
            &strings(&[
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_frames",
                "-show_entries",
                "frame=best_effort_timestamp_time",
                "-of",
                "json",
                &source.path,
            ]),
            300,
        )?;
        let parsed: Value = serde_json::from_str(&raw)?;
        let mut pts = parsed["frames"]
            .as_array()
            .context("无法读取帧时间")?
            .iter()
            .filter_map(|f| {
                f["best_effort_timestamp_time"]
                    .as_str()?
                    .parse::<f64>()
                    .ok()
            })
            .map(|s| (s * TICKS as f64).round() as i64)
            .collect::<Vec<_>>();
        ensure!(!pts.is_empty(), "没有可用视频帧");
        let first = pts[0];
        for p in &mut pts {
            *p -= first;
        }
        pts.push(source.duration_ticks);
        pts.sort_unstable();
        pts.dedup();
        Ok(pts)
    }
    pub fn render(&self, shot: &Shot, source: &Source) -> Result<(PathBuf, Vec<String>)> {
        if shot.recipe.crop_mode == "vertical" {
            ensure!(
                source.width >= 32 && source.height >= 32,
                "原片尺寸过小，无法生成竖屏裁切"
            );
        }
        ensure!(
            !["smpte2084", "arib-std-b67"].contains(&source.color_transfer.as_str()),
            "HDR 素材需先指定色彩转换配置，首版不自动转换"
        );
        let dir = self
            .root
            .join("shots")
            .join(&shot.id)
            .join(format!("r{}", shot.revision));
        fs::create_dir_all(&dir)?;
        let output = dir.join("master.mp4");
        let temp = dir.join("master.tmp.mp4");
        let brightness = if shot.recipe.color_mode == "auto" {
            self.exposure(source, shot.start_ticks, shot.end_ticks)?
        } else {
            shot.recipe.brightness
        };
        let mut filters = filter_graph(shot, source, brightness);
        if shot.recipe.color_mode == "adaptive" || crate::manual_color::enabled(&shot.recipe) {
            let lut = if shot.recipe.color_mode == "adaptive" {
                crate::manual_color::apply_to(
                    self.adaptive_lut(source, shot.start_ticks, shot.end_ticks)?,
                    &shot.recipe,
                )
            } else {
                crate::manual_color::lut(&shot.recipe)
            };
            let path = dir.join("color.cube");
            fs::write(&path, lut.cube())?;
            let escaped = path
                .to_string_lossy()
                .replace('\\', "\\\\")
                .replace('\'', "'\\\\\''")
                .replace(':', "\\:");
            filters = format!("lut3d=file='{escaped}':interp=trilinear,{filters}");
        }
        self.run(
            &self.ffmpeg,
            &strings(&[
                "-y",
                "-v",
                "error",
                "-ss",
                &(shot.start_ticks as f64 / TICKS as f64).to_string(),
                "-i",
                &source.path,
                "-t",
                &((shot.end_ticks - shot.start_ticks) as f64 / TICKS as f64).to_string(),
                "-map",
                "0:v:0",
                "-map",
                "0:a:0?",
                "-vf",
                &filters,
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "18",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-map_metadata",
                "-1",
                "-metadata:s:v:0",
                "rotate=0",
                "-movflags",
                "+faststart",
                &temp.to_string_lossy(),
            ]),
            3600,
        )?;
        let p = self.probe(&temp)?;
        let duration = p["format"]["duration"]
            .as_str()
            .context("输出时长缺失")?
            .parse::<f64>()?;
        let expected = (shot.end_ticks - shot.start_ticks) as f64 / TICKS as f64;
        ensure!(
            (duration - expected).abs() <= (2.0 / source.fps).max(0.2),
            "输出时长校验失败"
        );
        self.run(
            &self.ffmpeg,
            &strings(&[
                "-v",
                "error",
                "-xerror",
                "-i",
                &temp.to_string_lossy(),
                "-f",
                "null",
                "-",
            ]),
            3600,
        )?;
        fs::rename(&temp, &output)?;
        self.poster(&output, &dir.join("poster.jpg"))?;
        let mut issues = vec![];
        if shot.recipe.crop_mode == "vertical" {
            issues.push("请确认竖屏裁切保留完整产品与动作".into());
        }
        if source.color_transfer == "unknown" {
            issues.push("原片未声明色彩传递函数，请核对实物颜色".into());
        }
        if shot.input_mode == "frames" {
            issues.push("分析使用抽帧，必须播放确认动作完整性".into());
        }
        fs::write(
            dir.join("render.json"),
            serde_json::to_vec_pretty(
                &serde_json::json!({"schemaVersion":"moirai.render.v1","shotRevision":shot.revision,"filters":filters,"measuredBrightnessCorrection":brightness,"durationSeconds":duration,"decodeCheck":"passed"}),
            )?,
        )?;
        Ok((output, issues))
    }
    pub(crate) fn exposure(
        &self,
        source: &Source,
        start_ticks: i64,
        end_ticks: i64,
    ) -> Result<f64> {
        let raw = self.run(
            &self.ffmpeg,
            &strings(&[
                "-v",
                "error",
                "-ss",
                &(start_ticks as f64 / TICKS as f64).to_string(),
                "-i",
                &source.path,
                "-t",
                &((end_ticks - start_ticks) as f64 / TICKS as f64).to_string(),
                "-an",
                "-vf",
                "fps=1,scale=64:64,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-",
                "-f",
                "null",
                "/dev/null",
            ]),
            300,
        )?;
        let values = raw
            .lines()
            .filter_map(|l| {
                l.strip_prefix("lavfi.signalstats.YAVG=")?
                    .parse::<f64>()
                    .ok()
            })
            .collect::<Vec<_>>();
        if values.is_empty() {
            return Ok(0.0);
        }
        let mean = values.iter().sum::<f64>() / values.len() as f64;
        Ok(if mean < 45.0 {
            0.025
        } else if mean > 220.0 {
            -0.025
        } else {
            0.0
        })
    }
}
pub fn analysis_dimensions(source: &Source) -> (u32, u32) {
    if source.height > source.width {
        (720, 1280)
    } else {
        (1280, 720)
    }
}
pub fn strings(args: &[&str]) -> Vec<String> {
    args.iter().map(|s| s.to_string()).collect()
}
pub fn filter_graph(shot: &Shot, source: &Source, brightness: f64) -> String {
    let r = &shot.recipe;
    let mut filters = vec![];
    match r.rotation {
        90 => filters.push("transpose=1".into()),
        180 => filters.push("hflip,vflip".into()),
        270 => filters.push("transpose=2".into()),
        _ => {}
    }
    if r.crop_mode == "vertical" {
        let g = frame_geometry(r, source).expect("validated render geometry");
        filters.push(format!(
            "crop={}:{}:{}:{}",
            g.crop_width, g.crop_height, g.crop_x, g.crop_y
        ));
    }
    if r.flip_horizontal {
        filters.push("hflip".into());
    }
    if r.flip_vertical {
        filters.push("vflip".into());
    }
    if r.push_in_end_scale() > 1.0 {
        let g = frame_geometry(r, source).expect("validated render geometry");
        let duration = (shot.end_ticks - shot.start_ticks) as f64 / TICKS as f64;
        let zoom = format!("1+({}-1)*clip(in_time/{duration},0,1)", r.push_in_end_scale());
        // Normalize variable-rate inputs before zoompan so one output frame per input preserves timing.
        let fps = source.fps;
        filters.push(format!(
            "setpts=PTS-STARTPTS,fps={fps},scale=iw*2:ih*2,zoompan=z='{zoom}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s={}x{}:fps={fps}",
            g.crop_width, g.crop_height
        ));
    }
    if r.color_mode == "auto" || r.color_mode == "manual" && !crate::manual_color::enabled(r) {
        filters.push(format!(
            "eq=brightness={}:contrast={}:saturation={}",
            brightness,
            if r.color_mode == "auto" {
                1.0
            } else {
                r.contrast
            },
            if r.color_mode == "auto" {
                1.0
            } else {
                r.saturation
            }
        ));
    }
    filters.push("scale=w='min(iw,1080)':h='min(ih,1920)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1".into());
    filters.join(",")
}

#[cfg(test)]
mod mirror_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn mirrors_apply_to_the_rotated_cropped_output_without_changing_geometry() {
        let source: Source = serde_json::from_value(json!({
            "id":"s","name":"test.mp4","path":"test.mp4","product":"","batch":"",
            "sha256":"test","durationTicks":240000,"width":1280,"height":720,
            "fps":30,"colorTransfer":"bt709","rotation":0,"status":"review","createdAt":0
        }))
        .unwrap();
        let mut shot: Shot = serde_json::from_value(json!({
            "id":"shot","sourceId":"s","revision":1,"name":"test","startTicks":0,
            "endTicks":240000,"description":"","tags":[],"roles":[],"unsupportedClaims":[],
            "evidence":"","recipe":Recipe::default(),"status":"review","qualityIssues":[],
            "analysisRunId":"test","modelId":"test","inputMode":"video","createdAt":0
        }))
        .unwrap();
        shot.recipe.rotation = 90;
        shot.recipe.color_mode = "manual".into();
        shot.recipe.crop_mode = "vertical".into();
        shot.recipe.crop_y = 0.25;
        let original_geometry =
            serde_json::to_value(frame_geometry(&shot.recipe, &source).unwrap()).unwrap();
        for (horizontal, vertical, expected) in [
            (true, false, ",hflip,eq="),
            (false, true, ",vflip,eq="),
            (true, true, ",hflip,vflip,eq="),
        ] {
            shot.recipe.flip_horizontal = horizontal;
            shot.recipe.flip_vertical = vertical;
            let filters = filter_graph(&shot, &source, 0.0);
            assert!(filters.starts_with("transpose=1,crop="));
            assert!(filters.contains(expected));
            assert_eq!(
                serde_json::to_value(frame_geometry(&shot.recipe, &source).unwrap()).unwrap(),
                original_geometry
            );
        }
    }
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameGeometry {
    pub width: u32,
    pub height: u32,
    pub crop_width: u32,
    pub crop_height: u32,
    pub crop_x: u32,
    pub crop_y: u32,
}

// Preview and export use the same even-pixel crop rectangle after rotation.
pub fn frame_geometry(recipe: &Recipe, source: &Source) -> Result<FrameGeometry> {
    recipe.validate()?;
    let (width, height) = if recipe.rotation % 180 == 90 {
        (source.height, source.width)
    } else {
        (source.width, source.height)
    };
    ensure!(width > 0 && height > 0, "原片尺寸无效");
    let (crop_width, crop_height) = if recipe.crop_mode == "vertical" {
        ensure!(
            width >= 32 && height >= 32,
            "原片尺寸过小，无法生成竖屏裁切"
        );
        let units = (width / 9).min(height / 16) / 2 * 2;
        (units * 9, units * 16)
    } else {
        (width, height)
    };
    Ok(FrameGeometry {
        width,
        height,
        crop_width,
        crop_height,
        crop_x: ((width - crop_width) as f64 * recipe.crop_x).round() as u32 / 2 * 2,
        crop_y: ((height - crop_height) as f64 * recipe.crop_y).round() as u32 / 2 * 2,
    })
}
