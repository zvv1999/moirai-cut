use std::io::{self, Read};

fn main() {
    let result = (|| {
        let mut input = String::new();
        io::stdin()
            .take(32 * 1024 * 1024 + 1)
            .read_to_string(&mut input)
            .map_err(|e| e.to_string())?;
        if input.len() > 32 * 1024 * 1024 {
            return Err("Export request is too large".into());
        }
        moirai_project_export::execute(serde_json::from_str(&input).map_err(|e| e.to_string())?)
    })();
    match result {
        Ok(value) => println!("{value}"),
        Err(error) => {
            println!("{}", serde_json::json!({"error": error}));
            std::process::exit(1);
        }
    }
}
