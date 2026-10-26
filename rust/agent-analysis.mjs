// Process adapter only; media and review decisions live in the Rust crate.
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let build;
export async function agentAnalysis(input, { signal } = {}) {
	const binary =
		process.env.MOIRAI_AGENT_ANALYSIS_BIN ??
		path.join(
			repo,
			`target/debug/moirai-agent-analysis${process.platform === "win32" ? ".exe" : ""}`,
		);
	if (!process.env.MOIRAI_AGENT_ANALYSIS_BIN) {
		const cargoName = process.platform === "win32" ? "cargo.exe" : "cargo";
		const localCargo = path.join(
			process.env.CARGO_HOME ?? path.join(homedir(), ".cargo"),
			"bin",
			cargoName,
		);
		build ??= promisify(execFile)(
			process.env.CARGO ?? (existsSync(localCargo) ? localCargo : cargoName),
			["build", "--quiet", "-p", "moirai-agent-analysis"],
			{ cwd: repo, timeout: 180000 },
		).catch((error) => {
			build = undefined;
			throw error;
		});
		await build;
	}
	signal?.throwIfAborted();
	return new Promise((resolve, reject) => {
		const child = spawn(binary, [], {
			cwd: repo,
			signal,
			timeout: 30000,
			stdio: ["pipe", "pipe", "pipe"],
		});
		let output = "",
			stderr = "";
		child.stdout.on("data", (chunk) => {
			output += chunk;
			if (output.length > 16 * 1024 * 1024) {
				child.kill();
				reject(new Error("Analysis response too large"));
			}
		});
		child.stderr.on("data", (chunk) => {
			stderr = (stderr + chunk).slice(-4000);
		});
		child.on("error", reject);
		child.on("close", (code) => {
			try {
				const value = JSON.parse(output);
				if (code || value.error) reject(new Error(value.error ?? stderr));
				else resolve(value);
			} catch {
				reject(new Error(stderr || "Invalid media analysis response"));
			}
		});
		child.stdin.on("error", () => {});
		child.stdin.end(JSON.stringify(input));
	});
}
