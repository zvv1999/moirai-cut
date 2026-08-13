use std::{
    io::Write,
    process::{Command, Stdio},
};

use serde_json::{Value, json};

fn run(input: &str) -> std::process::Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_moirai-interchange"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("interchange binary starts");
    child
        .stdin
        .take()
        .expect("stdin")
        .write_all(input.as_bytes())
        .expect("write request");
    child.wait_with_output().expect("wait for CLI")
}

#[test]
fn cli_exports_one_json_envelope_without_mixing_xml_into_stdout() {
    let media_root = std::env::temp_dir();
    let input = json!({
        "command": "export-fcpxml",
        "project": {
            "metadata": { "id": "cli-project", "name": "CLI XML", "duration": 120_000 },
            "revision": 4,
            "currentSceneId": "scene",
            "settings": {
                "fps": { "numerator": 25, "denominator": 1 },
                "canvasSize": { "width": 1920, "height": 1080 }
            },
            "scenes": [{
                "id": "scene", "name": "Main", "isMain": true, "bookmarks": [],
                "tracks": {
                    "main": { "id": "main", "name": "Main", "type": "video", "hidden": false, "muted": false, "elements": [] },
                    "overlay": [], "audio": []
                }
            }]
        },
        "mediaIndex": {},
        "mediaRoot": media_root,
        "options": {
            "expectedRevision": 4,
            "version": "1.10",
            "target": "jianying-desktop"
        }
    });

    let output = run(&input.to_string());
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    assert!(output.stderr.is_empty());
    let envelope: Value = serde_json::from_slice(&output.stdout).expect("one JSON stdout envelope");
    assert_eq!(envelope["ok"], true);
    assert!(envelope["data"]["document"]
        .as_str()
        .expect("document")
        .contains("<fcpxml version=\"1.10\">"));
    assert_eq!(envelope["data"]["report"]["source"]["revision"], 4);
}

#[test]
fn cli_fails_with_a_structured_error_and_never_prints_partial_xml() {
    let output = run("{ definitely-not-json");
    assert!(!output.status.success());
    let envelope: Value = serde_json::from_slice(&output.stdout).expect("structured error JSON");
    assert_eq!(envelope["ok"], false);
    assert_eq!(envelope["error"]["code"], "invalid_request");
    assert!(envelope.get("document").is_none());
    assert!(!String::from_utf8_lossy(&output.stdout).contains("<fcpxml"));
}
