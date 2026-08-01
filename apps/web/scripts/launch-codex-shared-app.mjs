#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const DEFAULT_APP_SERVER_URL = "ws://127.0.0.1:48721";
const DEFAULT_OPENCUT_URL = "http://127.0.0.1:3000";
const DEFAULT_CODEX_APP_BINARY =
	"/Applications/ChatGPT.app/Contents/MacOS/ChatGPT";
const READY_TIMEOUT_MS = 12_000;

function loopbackWebSocketUrl(value) {
	const url = new URL(value);
	if (
		url.protocol !== "ws:" ||
		!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
	) {
		throw new Error("共享 Codex app-server 必须使用本机 ws:// 地址。");
	}
	return url;
}

function healthUrl(value) {
	const url = loopbackWebSocketUrl(value);
	url.protocol = "http:";
	url.pathname = "/readyz";
	url.search = "";
	url.hash = "";
	return url.toString();
}

async function isReady(value) {
	try {
		const response = await fetch(healthUrl(value), {
			cache: "no-store",
			signal: AbortSignal.timeout(800),
		});
		return response.ok;
	} catch {
		return false;
	}
}

async function ensureOpenCutStartedHost({ appServerUrl, openCutUrl }) {
	if (await isReady(appServerUrl)) return;
	try {
		await fetch(new URL("/api/codex/capabilities", openCutUrl), {
			cache: "no-store",
			signal: AbortSignal.timeout(READY_TIMEOUT_MS),
		});
	} catch {
		// The readiness loop below provides one actionable error for every failure.
	}
	const deadline = Date.now() + READY_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (await isReady(appServerUrl)) return;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(
		`OneCut 未能启动共享 Codex 宿主。请先确认 ${openCutUrl} 正常运行。`,
	);
}

async function main() {
	if (process.platform !== "darwin") {
		throw new Error("此启动器目前只用于 macOS Codex/ChatGPT 桌面 App。");
	}
	const appServerUrl =
		process.env.OPENCUT_CODEX_APP_SERVER_URL?.trim() || DEFAULT_APP_SERVER_URL;
	const openCutUrl =
		process.env.OPENCUT_BASE_URL?.trim() ||
		process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
		DEFAULT_OPENCUT_URL;
	const appBinary =
		process.env.OPENCUT_CODEX_DESKTOP_BIN?.trim() || DEFAULT_CODEX_APP_BINARY;
	loopbackWebSocketUrl(appServerUrl);

	await ensureOpenCutStartedHost({ appServerUrl, openCutUrl });
	const runningProcesses = spawnSync("/bin/ps", ["-ax", "-o", "command="], {
		encoding: "utf8",
	}).stdout;
	if (
		typeof runningProcesses === "string" &&
		runningProcesses.split("\n").some((command) => command.trim() === appBinary)
	) {
		throw new Error(
			"Codex/ChatGPT 桌面 App 已在运行。请先正常退出 App，再重新执行本命令完成共享宿主切换。",
		);
	}
	if (!existsSync(appBinary)) {
		throw new Error(`找不到 Codex/ChatGPT 桌面 App：${appBinary}`);
	}

	const child = spawn(appBinary, [], {
		detached: true,
		env: {
			...process.env,
			CODEX_APP_SERVER_WS_URL: appServerUrl,
		},
		stdio: "ignore",
	});
	child.unref();
	console.log(`Codex App 已连接 OneCut 共享宿主：${appServerUrl}`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
