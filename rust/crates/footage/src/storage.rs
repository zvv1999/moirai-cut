use anyhow::{Context, Result, ensure};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
};

pub fn hash(path: &Path) -> Result<String> {
    let mut file = File::open(path)?;
    let mut sha = Sha256::new();
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        let len = file.read(&mut buffer)?;
        if len == 0 {
            break;
        }
        sha.update(&buffer[..len]);
    }
    Ok(format!("{:x}", sha.finalize()))
}

pub fn verify_root(root: &Path, require_smb: bool) -> Result<()> {
    ensure!(root.is_dir(), "NAS 目录不可用，请挂载后重试");
    if require_smb {
        #[cfg(target_os = "macos")]
        {
            use std::{
                ffi::{CStr, CString},
                os::unix::ffi::OsStrExt,
            };
            let name = CString::new(root.as_os_str().as_bytes())?;
            let mut stat = std::mem::MaybeUninit::<libc::statfs>::uninit();
            ensure!(
                unsafe { libc::statfs(name.as_ptr(), stat.as_mut_ptr()) } == 0,
                "无法确认 NAS 挂载状态"
            );
            let stat = unsafe { stat.assume_init() };
            let kind = unsafe { CStr::from_ptr(stat.f_fstypename.as_ptr()) }.to_string_lossy();
            ensure!(
                kind == "smbfs",
                "NAS 路径不是 SMB 挂载，拒绝写入本地替代目录"
            );
        }
        #[cfg(target_os = "linux")]
        {
            use std::{ffi::CString, os::unix::ffi::OsStrExt};
            let name = CString::new(root.as_os_str().as_bytes())?;
            let mut stat = std::mem::MaybeUninit::<libc::statfs>::uninit();
            ensure!(
                unsafe { libc::statfs(name.as_ptr(), stat.as_mut_ptr()) } == 0,
                "无法确认 NAS 挂载状态"
            );
            let stat = unsafe { stat.assume_init() };
            ensure!(
                [0xff534d42_u64, 0xfe534d42].contains(&(stat.f_type as u64)),
                "NAS 路径不是 SMB 挂载"
            );
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        anyhow::bail!("当前平台尚未实现 SMB 挂载校验");
    }
    Ok(())
}

pub fn publish_file(
    root: &Path,
    relative: &Path,
    input: &Path,
    expected: &str,
    require_smb: bool,
) -> Result<PathBuf> {
    verify_root(root, require_smb)?;
    ensure!(
        relative
            .components()
            .all(|c| matches!(c, std::path::Component::Normal(_))),
        "归档路径无效"
    );
    let final_path = root.join(relative);
    let parent = final_path.parent().context("归档目录无效")?;
    fs::create_dir_all(parent)?;
    ensure!(
        parent.canonicalize()?.starts_with(root.canonicalize()?),
        "归档路径越界"
    );
    if final_path.exists() {
        ensure!(
            !fs::symlink_metadata(&final_path)?.file_type().is_symlink(),
            "归档文件不能是符号链接"
        );
        ensure!(
            hash(&final_path)? == expected,
            "NAS 上已有不同内容的同名文件"
        );
        return Ok(final_path);
    }
    let temporary = parent.join(format!(".{}.upload", crate::domain::id()));
    let result = (|| {
        let mut src = File::open(input)?;
        let mut dst = File::options()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        std::io::copy(&mut src, &mut dst)?;
        dst.flush()?;
        sync_destination(&dst, require_smb)?;
        drop(dst);
        ensure!(hash(&temporary)? == expected, "NAS 写入校验失败");
        verify_root(root, require_smb)?;
        fs::rename(&temporary, &final_path)?;
        ensure!(hash(&final_path)? == expected, "NAS 提交后校验失败");
        Ok(final_path.clone())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn sync_destination(file: &File, _require_smb: bool) -> Result<()> {
    #[cfg(target_os = "macos")]
    if _require_smb {
        use std::os::fd::AsRawFd;
        // Rust sync_all uses F_FULLFSYNC on macOS, a device-cache operation that
        // can stall SMB servers. fsync requests the remote filesystem flush.
        if unsafe { libc::fsync(file.as_raw_fd()) } != 0 {
            return Err(std::io::Error::last_os_error().into());
        }
        return Ok(());
    }
    file.sync_all()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn idempotent_publish_checks_content_and_rejects_escape() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("src");
        fs::write(&src, b"original").unwrap();
        let nas = dir.path().join("nas");
        fs::create_dir(&nas).unwrap();
        let sha = hash(&src).unwrap();
        let rel = Path::new("sources/id/original.mp4");
        publish_file(&nas, rel, &src, &sha, false).unwrap();
        publish_file(&nas, rel, &src, &sha, false).unwrap();
        fs::write(nas.join(rel), b"changed").unwrap();
        assert!(publish_file(&nas, rel, &src, &sha, false).is_err());
        assert!(publish_file(&nas, Path::new("../escape"), &src, &sha, false).is_err());
    }
}
