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
	activeProvider: "codex" as const,
	endpoints: {
		codex: { mode: "native" as const, custom: null },
		claude: { mode: "native" as const, custom: null },
	},
	providers: [],
	checks: [],
};

describe("Agent setup API", () => {
	test("returns a no-store diagnostic snapshot", async () => {
		const service: AgentSetupApiService = {
			inspect: async () => snapshot,
			configureProvider: async () => snapshot,
			selectProvider: async () => snapshot,
			configureEndpoint: async () => snapshot,
			selectEndpoint: async () => snapshot,
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
			configureProvider: async () => snapshot,
			selectProvider: async () => snapshot,
			configureEndpoint: async () => snapshot,
			selectEndpoint: async () => snapshot,
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
			configureProvider: async () => snapshot,
			selectProvider: async () => snapshot,
			configureEndpoint: async () => snapshot,
			selectEndpoint: async () => snapshot,
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

	test("configures and selects a verified local provider", async () => {
		const calls: string[] = [];
		const service: AgentSetupApiService = {
			inspect: async () => snapshot,
			installMcp: async () => {
				throw new Error("not used");
			},
			configureProvider: async (provider, binary) => {
				calls.push(`configure:${provider}:${binary}`);
				return { ...snapshot, activeProvider: provider };
			},
			selectProvider: async (provider) => {
				calls.push(`select:${provider}`);
				return { ...snapshot, activeProvider: provider };
			},
			configureEndpoint: async () => snapshot,
			selectEndpoint: async () => snapshot,
		};
		const { POST } = createAgentSetupRouteHandlers({ service });
		const headers = {
			"content-type": "application/json",
			origin: "http://127.0.0.1:3000",
		};

		const configured = await POST(
			new Request("http://127.0.0.1:3000/api/agent/setup", {
				method: "POST",
				headers,
				body: JSON.stringify({
					action: "configure-provider",
					provider: "claude",
					binary: "/Users/test/.local/bin/claude",
				}),
			}),
		);
		const selected = await POST(
			new Request("http://127.0.0.1:3000/api/agent/setup", {
				method: "POST",
				headers,
				body: JSON.stringify({ action: "select-provider", provider: "claude" }),
			}),
		);

		expect(configured.status).toBe(200);
		expect(selected.status).toBe(200);
		expect(calls).toEqual([
			"configure:claude:/Users/test/.local/bin/claude",
			"select:claude",
		]);
	});

	test("accepts a loopback browser origin when Next is bound to 0.0.0.0", async () => {
		const calls: string[] = [];
		const service: AgentSetupApiService = {
			inspect: async () => snapshot,
			installMcp: async () => {
				throw new Error("not used");
			},
			configureProvider: async () => snapshot,
			configureEndpoint: async () => snapshot,
			selectEndpoint: async () => snapshot,
			selectProvider: async (provider) => {
				calls.push(provider);
				return { ...snapshot, activeProvider: provider };
			},
		};
		const { POST } = createAgentSetupRouteHandlers({ service });

		const response = await POST(
			new Request("http://0.0.0.0:3000/api/agent/setup", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://127.0.0.1:3000",
				},
				body: JSON.stringify({ action: "select-provider", provider: "claude" }),
			}),
		);

		expect(response.status).toBe(200);
		expect(calls).toEqual(["claude"]);
	});

	test("configures and switches a redacted third-party endpoint", async () => {
		const calls: unknown[] = [];
		const service: AgentSetupApiService = {
			inspect: async () => snapshot,
			installMcp: async () => {
				throw new Error("not used");
			},
			configureProvider: async () => snapshot,
			selectProvider: async () => snapshot,
			configureEndpoint: async (input) => {
				calls.push(input);
				return {
					...snapshot,
					endpoints: {
						codex: {
							mode: "custom" as const,
							custom: {
								baseUrl: input.baseUrl,
								auth: input.auth,
								hasCredential: true,
							},
						},
						claude: {
							mode: "custom" as const,
							custom: {
								baseUrl: input.baseUrl,
								auth: input.auth,
								hasCredential: true,
							},
						},
					},
				};
			},
			selectEndpoint: async (mode) => {
				calls.push({ mode });
				return snapshot;
			},
		};
		const { POST } = createAgentSetupRouteHandlers({ service });
		const headers = {
			"content-type": "application/json",
			origin: "http://127.0.0.1:3000",
		};

		const configured = await POST(
			new Request("http://127.0.0.1:3000/api/agent/setup", {
				method: "POST",
				headers,
				body: JSON.stringify({
					action: "configure-endpoint",
					baseUrl: "https://gateway.example.com",
					auth: "bearer",
					credential: "super-secret-token",
				}),
			}),
		);
		const selected = await POST(
			new Request("http://127.0.0.1:3000/api/agent/setup", {
				method: "POST",
				headers,
				body: JSON.stringify({
					action: "select-endpoint",
					mode: "native",
				}),
			}),
		);

		expect(configured.status).toBe(200);
		expect(selected.status).toBe(200);
		expect(JSON.stringify(await configured.json())).not.toContain(
			"super-secret-token",
		);
		expect(calls).toEqual([
			{
				baseUrl: "https://gateway.example.com",
				auth: "bearer",
				credential: "super-secret-token",
			},
			{ mode: "native" },
		]);
	});
});
