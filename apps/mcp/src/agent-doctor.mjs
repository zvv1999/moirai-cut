#!/usr/bin/env bun
import { fetchAgentSnapshot, printAgentSnapshot } from "./agent-cli.mjs";

const base = process.env.OPENCUT_BASE_URL?.trim() || "http://127.0.0.1:3000";

try {
	const snapshot = await fetchAgentSnapshot(base);
	printAgentSnapshot(snapshot);
	process.exit(snapshot.blocking.length === 0 ? 0 : 1);
} catch (error) {
	console.error(
		`无法连接 OneCut：${error instanceof Error ? error.message : String(error)}`,
	);
	console.error("先运行：bun run agent:up");
	process.exit(1);
}
