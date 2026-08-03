import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAgentSettingsStore } from "@/server/agent-settings";

describe("Agent provider settings", () => {
	test("persists configured binaries and the selected conversation provider", async () => {
		const directory = await mkdtemp(
			path.join(tmpdir(), "moirai-agent-settings-"),
		);
		const filePath = path.join(directory, "agent-settings.json");
		const store = createAgentSettingsStore({ filePath });

		await store.configureProvider({
			provider: "claude",
			binary: "/Users/test/.local/bin/claude",
		});
		await store.selectProvider("claude");

		expect(await store.read()).toEqual({
			schemaVersion: "moirai-cut.agent-settings.v1",
			activeProvider: "claude",
			binaries: { claude: "/Users/test/.local/bin/claude" },
		});
		expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(
			expect.objectContaining({ activeProvider: "claude" }),
		);
	});

	test("rejects relative paths and binaries belonging to another provider", async () => {
		const directory = await mkdtemp(
			path.join(tmpdir(), "moirai-agent-settings-"),
		);
		const store = createAgentSettingsStore({
			filePath: path.join(directory, "agent-settings.json"),
		});

		await expect(
			store.configureProvider({ provider: "claude", binary: "claude" }),
		).rejects.toThrow("absolute");
		await expect(
			store.configureProvider({
				provider: "claude",
				binary: "/Users/test/bin/codex",
			}),
		).rejects.toThrow("Claude");
	});

	test("stores one third-party gateway for Codex and Claude without a model", async () => {
		const directory = await mkdtemp(
			path.join(tmpdir(), "moirai-agent-settings-"),
		);
		const filePath = path.join(directory, "agent-settings.json");
		const credentialsFilePath = path.join(directory, "agent-credentials.json");
		const store = createAgentSettingsStore({ filePath, credentialsFilePath });

		await store.configureEndpoint({
			baseUrl: "https://gateway.example.com/v1",
			auth: "api-key",
			credential: "super-secret-token",
		});

		expect(await store.endpointSnapshot()).toEqual({
			codex: {
				mode: "custom",
				custom: {
					baseUrl: "https://gateway.example.com/v1",
					auth: "api-key",
					hasCredential: true,
				},
			},
			claude: {
				mode: "custom",
				custom: {
					baseUrl: "https://gateway.example.com/v1",
					auth: "api-key",
					hasCredential: true,
				},
			},
		});
		expect(await store.runtimeEndpoint("codex")).toEqual(
			expect.objectContaining({ baseUrl: "https://gateway.example.com/v1" }),
		);
		expect(await store.runtimeEndpoint("claude")).toEqual(
			expect.objectContaining({ baseUrl: "https://gateway.example.com/v1" }),
		);
		expect(await readFile(filePath, "utf8")).not.toContain(
			"super-secret-token",
		);
		expect(await readFile(credentialsFilePath, "utf8")).toContain(
			"super-secret-token",
		);
		expect((await stat(credentialsFilePath)).mode & 0o777).toBe(0o600);
	});

	test("keeps a custom endpoint while switching back to native authentication", async () => {
		const directory = await mkdtemp(
			path.join(tmpdir(), "moirai-agent-settings-"),
		);
		const store = createAgentSettingsStore({
			filePath: path.join(directory, "agent-settings.json"),
			credentialsFilePath: path.join(directory, "agent-credentials.json"),
		});

		await store.configureEndpoint({
			baseUrl: "http://127.0.0.1:4000",
			auth: "bearer",
			credential: "local-gateway-token",
		});
		await store.selectEndpointMode({ mode: "native" });

		expect((await store.endpointSnapshot()).claude).toEqual({
			mode: "native",
			custom: expect.objectContaining({
				baseUrl: "http://127.0.0.1:4000",
				hasCredential: true,
			}),
		});
		expect((await store.runtimeEndpoint("claude")).mode).toBe("native");
	});

	test("migrates a legacy provider-specific endpoint into the shared runtime", async () => {
		const directory = await mkdtemp(
			path.join(tmpdir(), "moirai-agent-settings-"),
		);
		const filePath = path.join(directory, "agent-settings.json");
		const endpointsFilePath = path.join(directory, "agent-endpoints.json");
		const credentialsFilePath = path.join(directory, "agent-credentials.json");
		await writeFile(
			endpointsFilePath,
			JSON.stringify({
				schemaVersion: "moirai-cut.agent-endpoints.v1",
				providers: {
					codex: { mode: "native", custom: null },
					claude: {
						mode: "custom",
						custom: {
							baseUrl: "https://legacy.example.com",
							model: "legacy-model-is-not-persisted-again",
							auth: "api-key",
						},
					},
				},
			}),
		);
		await writeFile(
			credentialsFilePath,
			JSON.stringify({
				schemaVersion: "moirai-cut.agent-credentials.v1",
				credentials: { claude: "legacy-secret" },
			}),
		);
		const store = createAgentSettingsStore({
			filePath,
			endpointsFilePath,
			credentialsFilePath,
		});

		const snapshot = await store.endpointSnapshot();
		expect(snapshot.codex).toEqual(snapshot.claude);
		expect(snapshot.codex).toEqual({
			mode: "custom",
			custom: {
				baseUrl: "https://legacy.example.com",
				auth: "api-key",
				hasCredential: true,
			},
		});
		expect(await store.runtimeEndpoint("codex")).toEqual(
			expect.objectContaining({ credential: "legacy-secret" }),
		);
	});

	test("rejects insecure remote endpoints and credentials containing line breaks", async () => {
		const directory = await mkdtemp(
			path.join(tmpdir(), "moirai-agent-settings-"),
		);
		const store = createAgentSettingsStore({
			filePath: path.join(directory, "agent-settings.json"),
			credentialsFilePath: path.join(directory, "agent-credentials.json"),
		});

		await expect(
			store.configureEndpoint({
				baseUrl: "http://gateway.example.com/v1",
				auth: "api-key",
				credential: "secret",
			}),
		).rejects.toThrow("HTTPS");
		await expect(
			store.configureEndpoint({
				baseUrl: "https://gateway.example.com",
				auth: "bearer",
				credential: "secret\nheader-injection",
			}),
		).rejects.toThrow("credential");
	});
});
