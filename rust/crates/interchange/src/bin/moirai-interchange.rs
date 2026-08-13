use std::{io::Read, path::PathBuf, process::ExitCode};

use interchange::{FcpxmlExportOptions, InterchangeError, export_fcpxml};
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum Command {
    ExportFcpxml,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    command: Command,
    project: Value,
    media_index: Value,
    media_root: PathBuf,
    options: FcpxmlExportOptions,
}

fn main() -> ExitCode {
    let mut source = String::new();
    if let Err(error) = std::io::stdin().read_to_string(&mut source) {
        return fail("invalid_request", format!("Cannot read stdin: {error}"));
    }
    let request: Request = match serde_json::from_str(&source) {
        Ok(request) => request,
        Err(error) => {
            return fail("invalid_request", format!("Request must be JSON: {error}"));
        }
    };

    let result = match request.command {
        Command::ExportFcpxml => export_fcpxml(
            &request.project,
            &request.media_index,
            &request.media_root,
            request.options,
        ),
    };
    match result {
        Ok(data) => write_envelope(json!({ "ok": true, "data": data }), ExitCode::SUCCESS),
        Err(error) => fail_interchange(error),
    }
}

fn fail_interchange(error: InterchangeError) -> ExitCode {
    write_envelope(
        json!({
            "ok": false,
            "error": {
                "code": error.code,
                "message": error.message,
            }
        }),
        ExitCode::from(2),
    )
}

fn fail(code: &str, message: String) -> ExitCode {
    write_envelope(
        json!({
            "ok": false,
            "error": { "code": code, "message": message }
        }),
        ExitCode::from(2),
    )
}

fn write_envelope(envelope: Value, status: ExitCode) -> ExitCode {
    match serde_json::to_string(&envelope) {
        Ok(serialized) => {
            println!("{serialized}");
            status
        }
        Err(_) => {
            println!(
                "{{\"ok\":false,\"error\":{{\"code\":\"serialization_failed\",\"message\":\"Cannot serialize response\"}}}}"
            );
            ExitCode::from(2)
        }
    }
}
