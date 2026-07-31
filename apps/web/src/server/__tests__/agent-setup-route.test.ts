import { describe, expect, test } from "bun:test";
import {
	createAgentSetupRouteHandlers,
	type AgentSetupApiService,
} from "@/app/api/agent/setup/handlers";

const snapshot = {
	checkedAt: "2026-07-31T00:00:00.000Z",
	score: 80,
	ready: true,
	blocking: [],
	recommendedProvider: "codex" as const,
	providers: [],
	checks: [],
};

describe("Agent setup API", () => {
	test("returns a no-store diagnostic snapshot", async () => {
		const service: AgentSetupApiService = {
			inspect: async () => snapshot,
			installMcp: async () => {
				throw new Error("not used");
			},
		};
		const { GET } = createAgentSetupRouteHandlers({ service });

		const response = await GET(
			new Request("http://127.0.0.1:3000/api/agent/setup"),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toContain("no-store");
		expect(await response.json()).toEqual(snapshot);
	});

	test("installs MCP only for a discovered provider on a local origin", async () => {
		const calls: string[] = [];
		const service: AgentSetupApiService = {
			inspect: async () => snapshot,
			installMcp: async (provider) => {
				calls.push(provider);
				return {
					provider,
					changed: true,
					verified: true,
					message: "installed",
				};
			},
		};
		const { POST } = createAgentSetupRouteHandlers({ service });

		const response = await POST(
			new Request("http://127.0.0.1:3000/api/agent/setup", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://127.0.0.1:3000",
				},
				body: JSON.stringify({ action: "install-mcp", provider: "claude" }),
			}),
		);

		expect(response.status).toBe(200);
		expect(calls).toEqual(["claude"]);
		expect(await response.json()).toEqual(
			expect.objectContaining({ verified: true, provider: "claude" }),
		);
	});

	test("rejects remote mutation and arbitrary executable input", async () => {
		let installs = 0;
		const service: AgentSetupApiService = {
			inspect: async () => snapshot,
			installMcp: async () => {
				installs += 1;
				throw new Error("not expected");
			},
		};
		const { POST } = createAgentSetupRouteHandlers({ service });
		const remote = await POST(
			new Request("https://editor.example.com/api/agent/setup", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "https://evil.example",
				},
				body: JSON.stringify({
					action: "install-mcp",
					provider: "codex",
					binary: "/tmp/arbitrary-command",
				}),
			}),
		);
		const invalid = await POST(
			new Request("http://localhost:3000/api/agent/setup", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					action: "install-mcp",
					provider: "unknown",
				}),
			}),
		);

		expect(remote.status).toBe(403);
		expect(invalid.status).toBe(400);
		expect(installs).toBe(0);
	});
});
