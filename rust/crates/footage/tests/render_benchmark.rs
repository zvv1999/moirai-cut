use moirai_footage::{
    domain::{Shot, Source},
    media::Media,
};
use rusqlite::{Connection, OpenFlags};

#[test]
#[ignore = "Requires FOOTAGE_BENCH_DB, FOOTAGE_BENCH_SHOT and FFmpeg executables"]
fn render_real_shot_with_decode_and_duration_checks() {
    let db = Connection::open_with_flags(
        std::env::var("FOOTAGE_BENCH_DB").unwrap(),
        OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .unwrap();
    let raw: String = db
        .query_row(
            "SELECT body FROM records WHERE kind='shot' AND id=?1",
            [std::env::var("FOOTAGE_BENCH_SHOT").unwrap()],
            |r| r.get(0),
        )
        .unwrap();
    let shot: Shot = serde_json::from_str(&raw).unwrap();
    let raw: String = db
        .query_row(
            "SELECT body FROM records WHERE kind='source' AND id=?1",
            [&shot.source_id],
            |r| r.get(0),
        )
        .unwrap();
    let source: Source = serde_json::from_str(&raw).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let media = Media {
        root: dir.path().into(),
        ffmpeg: std::env::var("MOIRAI_FFMPEG").unwrap(),
        ffprobe: std::env::var("MOIRAI_FFPROBE").unwrap(),
    };
    let start = std::time::Instant::now();
    let (path, _) = media.render(&shot, &source).unwrap();
    assert!(path.is_file());
    println!("render_with_qc_ms={}", start.elapsed().as_millis());
}

#[test]
#[ignore = "Requires FOOTAGE_BENCH_NAS staging directory and FOOTAGE_BENCH_FILE"]
fn publish_verified_file_to_isolated_nas_directory() {
    let root = std::env::var("FOOTAGE_BENCH_NAS").unwrap();
    let input = std::path::PathBuf::from(std::env::var("FOOTAGE_BENCH_FILE").unwrap());
    let dir = tempfile::tempdir_in(root).unwrap();
    let sha = moirai_footage::storage::hash(&input).unwrap();
    let start = std::time::Instant::now();
    moirai_footage::storage::publish_file(
        dir.path(),
        std::path::Path::new("test/master.mp4"),
        &input,
        &sha,
        true,
    )
    .unwrap();
    println!("nas_publish_with_checks_ms={}", start.elapsed().as_millis());
}
