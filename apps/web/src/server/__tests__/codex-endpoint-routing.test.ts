import { describe, expect, test } from "bun:test";
import {
	createCodexEndpointRoutingService,
	resolveCodexEndpointTarget,
} from "@/server/codex-endpoint-routing";
import type {
	CodexChatInput,
	CodexChatService,
	CodexRuntimeConfig,
} from "@/server/codex-chat";

const baseRuntime: CodexRuntimeConfig = {
	binary: "/usr/local/bin/codex",
	repoRoot: "/workspace/opencut-classic",
	mcpServerPath: "/workspace/opencut-classic/apps/mcp/src/server.mjs",
	projectFilesDir: "/workspace/opencut-projects",
	baseUrl: "http://127.0.0.1:3000",
	sharedAppServerUrl: "ws://127.0.0.1:48721",
};

function mockService(label: string, calls: string[]): CodexChatService {
	return {
		async capabilities() {
			return { models: [], modes: [], skills: [], toolProfiles: [] };
		},
		async steer({ sessionId }) {
			calls.push(`${label}:steer:${sessionId}`);
		},
		async interrupt({ sessionId }) {
			calls.push(`${label}:interrupt:${sessionId}`);
		},
		async compact({ sessionId }) {
			calls.push(`${label}:compact:${sessionId}`);
		},
		async readThread({ sessionId }) {
			calls.push(`${label}:read:${sessionId}`);
			return {
				sessionId,
				title: label,
				messages: [],
				createdAt: 1,
				updatedAt: 1,
			};
		},
		async *stream({ input }) {
			calls.push(`${label}:stream:${input.model ?? "default"}`);
			yield { type: "session", sessionId: `${label}-session` };
			yield {
				type: "done",
				sessionId: `${label}-session`,
				message: label,
			};
		},
	};
}

describe("Codex endpoint routing", () => {
	test("creates an isolated app-server target for a custom Responses endpoint", () => {
		const target = resolveCodexEndpointTarget({
			baseRuntime,
			binary: "/opt/codex/bin/codex",
			endpoint: {
				mode: "custom",
				baseUrl: "https://gateway.example.com/v1",
				auth: "api-key",
				credential: "secret",
			},
		});

		expect(target.key).toStartWith("custom:");
		expect(target.runtime.binary).toBe("/opt/codex/bin/codex");
		expect(target.runtime.sharedAppServerUrl).not.toBe(
			baseRuntime.sharedAppServerUrl,
		);
		expect(target.runtime.endpoint).not.toHaveProperty("model");
		expect(target.key).not.toContain("secret");
	});

	test("versions the custom host identity with its Responses launch contract", () => {
		const target = resolveCodexEndpointTarget({
			baseRuntime,
			binary: "/opt/codex/bin/codex",
			endpoint: {
				mode: "custom",
				baseUrl: "https://gateway.example.com",
				auth: "api-key",
				credential: "secret",
			},
		});

		expect(target.key).toStartWith("custom:responses-v1:");
	});

	test("keeps session actions bound to the endpoint that created the session", async () => {
		const calls: string[] = [];
		const customTarget = resolveCodexEndpointTarget({
			baseRuntime,
			binary: baseRuntime.binary,
			endpoint: {
				mode: "custom",
				baseUrl: "https://gateway.example.com/v1",
				auth: "api-key",
				credential: "secret",
			},
		});
		let current = customTarget;
		const services = new Map<string, CodexChatService>();
		const router = createCodexEndpointRoutingService({
			resolveTarget: async () => current,
			createService: (target) => {
				const service = mockService(
					target.endpoint.mode === "custom" ? "custom" : "native",
					calls,
				);
				services.set(target.key, service);
				return service;
			},
		});
		const input: CodexChatInput = {
			projectId: "project-1",
			message: "edit",
			context: "",
			model: "stale-ui-model",
		};

		for await (const _event of router.stream({ input })) {
			// Drain the stream so its session binding is recorded.
		}
		current = resolveCodexEndpointTarget({
			baseRuntime,
			binary: baseRuntime.binary,
			endpoint: { mode: "native" },
		});
		await router.interrupt({
			sessionId: "custom-session",
			turnId: "turn-1",
		});

		expect(calls).toContain("custom:stream:stale-ui-model");
		expect(calls).toContain("custom:interrupt:custom-session");
		expect(services.size).toBe(1);
	});
});
