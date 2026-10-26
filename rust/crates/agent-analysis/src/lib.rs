mod audio;
mod review;
mod timeline;
use serde_json::Value;

pub fn execute(input: Value) -> Result<Value, String> {
    match input["command"].as_str() {
        Some("inspect") => timeline::inspect(&input),
        Some("uses") => Ok(timeline::uses(&input["document"])),
        Some("rhythm") => audio::rhythm(&input),
        Some("review_plan") => review::plan(&input),
        Some("review_decision") => review::decision(&input),
        _ => Err("Unknown analysis command".into()),
    }
}
