use crate::{
    domain::{Source, TICKS, validate_range},
    media::{Media, strings},
};
use anyhow::{Context, Result, ensure};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, io::Write, path::PathBuf};

const VERSION: &str = "image-adaptive-3dlut-srgb-b491f6d-v1";

pub fn migrate_drafts(db: &rusqlite::Connection) -> Result<()> {
    use crate::{
        domain::{Job, Shot},
        store,
    };
    let jobs = store::list::<Job>(db, "job")?;
    for mut shot in store::list::<Shot>(db, "shot")? {
        if shot.direct_upload
            || shot.recipe.color_mode != "auto"
            || shot.status == "published"
            || shot.published_path.is_some()
            || jobs.iter().any(|job| {
                job.target_id == shot.id
                    && (["queued", "running"].contains(&job.status.as_str())
                        || job.kind == "publish" && job.status == "succeeded")
            })
        {
            continue;
        }
        shot.recipe.color_mode = "adaptive".into();
        shot.output_path = None;
        shot.output_sha256 = None;
        shot.revision += 1;
        store::put(db, "shot", &shot.id, &shot)?;
    }
    Ok(())
}

#[derive(Clone, Deserialize, Serialize)]
pub struct AdaptiveLut {
    pub size: usize,
    pub values: Vec<f32>,
}

impl AdaptiveLut {
    fn validate(&self) -> Result<()> {
        ensure!(
            self.size == 33
                && self.values.len() == 33 * 33 * 33 * 3
                && self.values.iter().all(|v| v.is_finite() && v.abs() < 32.0),
            "自动调色 LUT 无效"
        );
        Ok(())
    }

    pub fn cube(&self) -> String {
        let mut output = format!(
            "TITLE \"{VERSION}\"\nLUT_3D_SIZE {}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n",
            self.size
        );
        for rgb in self.values.chunks_exact(3) {
            output.push_str(&format!("{:.8} {:.8} {:.8}\n", rgb[0], rgb[1], rgb[2]));
        }
        output
    }
}

impl Media {
    pub fn adaptive_lut(&self, source: &Source, start: i64, end: i64) -> Result<AdaptiveLut> {
        validate_range(start, end, source.duration_ticks)?;
        ensure!(
            !["smpte2084", "arib-std-b67"].contains(&source.color_transfer.as_str()),
            "AI 自动调色暂不支持 HDR 素材，请先转换为 SDR"
        );
        let home = PathBuf::from(
            std::env::var_os("HOME")
                .or_else(|| std::env::var_os("USERPROFILE"))
                .context("无法定位本机模型目录")?,
        )
        .join(".moirai-cut");
        let model = home.join("models/image-adaptive-3dlut");
        let python = home.join(if cfg!(windows) {
            "lut-runtime/Scripts/python.exe"
        } else {
            "lut-runtime/bin/python"
        });
        ensure!(
            python.is_file()
                && model.join("classifier.pth").is_file()
                && model.join("LUTs.pth").is_file(),
            "AI 自动调色模型尚未安装，请运行 node scripts/footage/setup-lut.mjs"
        );
        let key = format!("{VERSION}:{}:{start}:{end}", source.sha256);
        let key = format!("{:x}", Sha256::digest(key.as_bytes()));
        let dir = self.root.join("adaptive-lut").join(key);
        fs::create_dir_all(&dir)?;
        let lock = fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .open(dir.join("lock"))?;
        lock.lock_exclusive()?;
        let cached = dir.join("lut.json");
        if cached.is_file() {
            let lut: AdaptiveLut = serde_json::from_slice(&fs::read(&cached)?)?;
            lut.validate()?;
            return Ok(lut);
        }
        // One fixed LUT per continuous shot prevents frame-to-frame color pumping.
        let mut frames = Vec::new();
        let result = (|| -> Result<AdaptiveLut> {
            for (index, fraction) in [0.2, 0.5, 0.8].into_iter().enumerate() {
                let time = (start as f64 + (end - start) as f64 * fraction) / TICKS as f64;
                let path = dir.join(format!("sample-{index}.rgb"));
                frames.push(path.clone());
                self.run(
                    &self.ffmpeg,
                    &strings(&[
                        "-y",
                        "-v",
                        "error",
                        "-ss",
                        &time.to_string(),
                        "-i",
                        &source.path,
                        "-frames:v",
                        "1",
                        "-vf",
                        "scale=256:256:flags=bilinear",
                        "-pix_fmt",
                        "rgb24",
                        "-f",
                        "rawvideo",
                        &path.to_string_lossy(),
                    ]),
                    60,
                )?;
                ensure!(
                    fs::metadata(&path)?.len() == 256 * 256 * 3,
                    "无法抽取自动调色参考帧"
                );
            }
            let mut args = vec![
                "-c".into(),
                include_str!("lut_inference.py").into(),
                model.to_string_lossy().into_owned(),
            ];
            args.extend(frames.iter().map(|p| p.to_string_lossy().into_owned()));
            let output = self
                .run(&python.to_string_lossy(), &args, 120)
                .context("AI 自动调色计算失败")?;
            let lut: AdaptiveLut =
                serde_json::from_str(&output).context("AI 自动调色返回无效结果")?;
            lut.validate()?;
            let temp = dir.join("lut.tmp.json");
            let mut file = fs::File::create(&temp)?;
            file.write_all(&serde_json::to_vec(&lut)?)?;
            file.sync_all()?;
            fs::rename(temp, cached)?;
            Ok(lut)
        })();
        for path in frames {
            let _ = fs::remove_file(path);
        }
        result
    }
}
