#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(new URL(import.meta.url)));
const REPO = path.resolve(HERE, "..", "..", "..");
const WEB_DIR = path.join(REPO, "apps", "web");
const ENV_FILE = path.join(WEB_DIR, ".env.local");
const ENV_EXAMPLE = path.join(WEB_DIR, ".env.example");
const legacyProjectsDir = path.join(homedir(), "OpenCutProjects");
const projectsDir =
	process.env.ONECUT_PROJECTS_DIR?.trim() ||
	process.env.OPENCUT_PROJECTS_DIR?.trim() ||
	(existsSync(legacyProjectsDir)
		? legacyProjectsDir
		: path.join(homedir(), "OneCutProjects"));

function ensureEnvironment() {
	let current = existsSync(ENV_FILE)
		? readFileSync(ENV_FILE, "utf8")
		: readFileSync(ENV_EXAMPLE, "utf8");
	current = current.replace(/^NODE_ENV=.*(?:\r?\n)?/m, "");
	const upsert = (name, value) => {
		const expression = new RegExp(`^${name}=.*$`, "m");
		if (expression.test(current)) {
			current = current.replace(expression, `${name}=${value}`);
		} else {
			current = `${current.trimEnd()}\n${name}=${value}\n`;
		}
	};
	upsert("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:3000");
	upsert("NEXT_PUBLIC_OPENCUT_PROJECT_FILES", "1");
	upsert("ONECUT_PROJECTS_DIR", JSON.stringify(projectsDir));
	upsert("OPENCUT_PROJECTS_DIR", JSON.stringify(projectsDir));
	upsert("OPENCUT_CODEX_APP_SERVER_URL", "ws://127.0.0.1:48721");
	writeFileSync(ENV_FILE, `${current.trimEnd()}\n`, "utf8");
	console.log(`已检查 ${path.relative(REPO, ENV_FILE)}`);
	mkdirSync(projectsDir, { recursive: true });
	console.log(`工程目录：${projectsDir}`);
}

ensureEnvironment();

if (!existsSync(path.join(REPO, "node_modules"))) {
	console.log("正在安装依赖…");
	const installed = spawnSync(process.execPath, ["install"], {
		cwd: REPO,
		stdio: "inherit",
	});
	if (installed.status !== 0) process.exit(installed.status ?? 1);
}

const started = spawnSync(process.execPath, ["run", "agent:up"], {
	cwd: REPO,
	stdio: "inherit",
});
process.exit(started.status ?? 0);
