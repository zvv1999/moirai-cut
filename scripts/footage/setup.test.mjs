import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("fresh local setup validates dependencies and preserves portable configuration", () => {
	const home = mkdtempSync(path.join(tmpdir(), "moirai-setup-"));
	try {
		const configPath = path.join(home, "config.json");
		const env = {
			...process.env,
			HOME: home,
			USERPROFILE: home,
			MOIRAI_FOOTAGE_CONFIG: configPath,
		};
		const run = (...args) =>
			spawnSync(
				process.execPath,
				["scripts/footage/setup.mjs", "--config-only", ...args],
				{ env, encoding: "utf8" },
			);
		const unattended = run();
		assert.equal(unattended.status, 1);
		assert.match(unattended.stderr, /--local/);
		for (const [name, override] of [["ffmpeg", process.env.FFMPEG_PATH], ["ffprobe", process.env.FFPROBE_PATH]]) {
			if (spawnSync(override || name, ["-version"]).status !== 0) {
				const missingDependency = run("--local");
				assert.equal(missingDependency.status, 1);
				assert.match(missingDependency.stderr, /FFmpeg\/ffprobe/);
				return;
			}
		}
		const first = run("--local");
		assert.equal(first.status, 0, first.stderr);
		const contents = readFileSync(configPath, "utf8");
		const config = JSON.parse(contents);
		assert.equal(config.dataDir, path.join(home, ".moirai-cut/footage"));
		assert.equal(config.nasRoot, undefined);
		if (process.platform !== "win32")
			assert.equal(statSync(configPath).mode & 0o777, 0o600);
		assert.equal(run().status, 0);
		assert.equal(readFileSync(configPath, "utf8"), contents);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});
