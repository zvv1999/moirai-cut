#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { existsSync, openSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchAgentSnapshot, printAgentSnapshot } from "./agent-cli.mjs";

const HERE = path.dirname(fileURLToPath(new URL(import.meta.url)));
const REPO = path.resolve(HERE, "..", "..", "..");
const WEB_ENV = path.join(REPO, "apps", "web", ".env.local");
const DEV_LOG = path.join(tmpdir(), "opencut-dev.log");
const envText = existsSync(WEB_ENV) ? readFileSync(WEB_ENV, "utf8") : "";
const configuredBase =
	process.env.OPENCUT_BASE_URL?.trim() ||
	envText.match(/^NEXT_PUBLIC_SITE_URL=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "") ||
	"http://127.0.0.1:3000";
const BASE = configuredBase.replace("localhost", "127.0.0.1");
const noOpen =
	process.argv.includes("--no-open") || process.env.OPENCUT_NO_OPEN === "1";

const sleep = (milliseconds) =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

async function reachable() {
	try {
		const response = await fetch(`${BASE}/api/health`, {
			signal: AbortSignal.timeout(2_000),
			cache: "no-store",
		});
		return response.ok;
	} catch {
		return false;
	}
}

async function openBrowser(url) {
	if (noOpen) return;
	const command =
		process.platform === "darwin"
			? { binary: "open", args: [url] }
			: process.platform === "win32"
				? { binary: "cmd", args: ["/c", "start", "", url] }
				: { binary: "xdg-open", args: [url] };
	const child = spawn(command.binary, command.args, {
		detached: true,
		stdio: "ignore",
	});
	child.unref();
}

let running = await reachable();
if (!running) {
	console.log(`正在启动 OpenCut（日志：${DEV_LOG}）…`);
	const log = openSync(DEV_LOG, "a");
	const child = spawn(process.execPath, ["run", "dev:web"], {
		cwd: REPO,
		detached: true,
		env: process.env,
		stdio: ["ignore", log, log],
	});
	child.unref();
	for (let attempt = 0; attempt < 60 && !running; attempt += 1) {
		await sleep(1_000);
		running = await reachable();
		if ((attempt + 1) % 10 === 0 && !running) {
			console.log(`仍在准备依赖和编译… ${attempt + 1}s`);
		}
	}
}

if (!running) {
	console.error(`OpenCut 未能启动，请查看 ${DEV_LOG}`);
	process.exit(1);
}

try {
	const snapshot = await fetchAgentSnapshot(BASE);
	printAgentSnapshot(snapshot);
	console.log(`\n已就绪：${BASE}/projects`);
	await openBrowser(`${BASE}/projects`);
} catch (error) {
	console.error(
		`OpenCut 已启动，但环境检查失败：${
			error instanceof Error ? error.message : String(error)
		}`,
	);
	console.error(`请查看 ${DEV_LOG}`);
	process.exit(1);
}
