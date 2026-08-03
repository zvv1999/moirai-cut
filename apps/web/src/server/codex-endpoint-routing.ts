import { createHash } from "node:crypto";
import {
	createCodexChatService,
	resolveCodexRuntimeConfig,
	syncCodexThreadToDesktop,
	type CodexChatService,
	type CodexRuntimeConfig,
} from "@/server/codex-chat";
import {
	getAgentSettingsStore,
	type AgentEndpointRuntime,
	type AgentSettingsStore,
} from "@/server/agent-settings";

export interface CodexEndpointTarget {
	key: string;
	endpoint: AgentEndpointRuntime;
	runtime: CodexRuntimeConfig;
}

// Bump this whenever the custom Codex app-server launch contract changes.
// The version is part of the loopback port identity so a healthy, older host
// cannot silently keep serving stale provider arguments after a hot deploy.
const CUSTOM_CODEX_HOST_REVISION = "responses-v1";

function targetDigest(input: unknown): string {
	return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function resolveCodexEndpointTarget({
	baseRuntime,
	binary,
	endpoint,
}: {
	baseRuntime: CodexRuntimeConfig;
	binary: string;
	endpoint: AgentEndpointRuntime;
}): CodexEndpointTarget {
	if (endpoint.mode === "native") {
		return {
			key: `native:${targetDigest({ binary, url: baseRuntime.sharedAppServerUrl })}`,
			endpoint,
			runtime: { ...baseRuntime, binary, endpoint },
		};
	}
	const digest = targetDigest({
		binary,
		endpoint,
		hostRevision: CUSTOM_CODEX_HOST_REVISION,
	});
	const port = 49_100 + (Number.parseInt(digest.slice(0, 8), 16) % 700);
	return {
		key: `custom:${CUSTOM_CODEX_HOST_REVISION}:${digest}`,
		endpoint,
		runtime: {
			...baseRuntime,
			binary,
			endpoint,
			sharedAppServerUrl: `ws://127.0.0.1:${port}`,
		},
	};
}

export async function resolveConfiguredCodexEndpointTarget({
	settingsStore = getAgentSettingsStore(),
	baseRuntime = resolveCodexRuntimeConfig(),
}: {
	settingsStore?: AgentSettingsStore;
	baseRuntime?: CodexRuntimeConfig;
} = {}): Promise<CodexEndpointTarget> {
	const [settings, endpoint] = await Promise.all([
		settingsStore.read(),
		settingsStore.runtimeEndpoint("codex"),
	]);
	return resolveCodexEndpointTarget({
		baseRuntime,
		binary: settings.binaries.codex ?? baseRuntime.binary,
		endpoint,
	});
}

export function createCodexEndpointRoutingService({
	resolveTarget = () => resolveConfiguredCodexEndpointTarget(),
	createService = (target) =>
		createCodexChatService({
			runtime: target.runtime,
			syncThreadToDesktop:
				target.endpoint.mode === "native"
					? (threadId) =>
							syncCodexThreadToDesktop({
								threadId,
								runtime: target.runtime,
							})
					: async () => {},
		}),
}: {
	resolveTarget?: () => Promise<CodexEndpointTarget>;
	createService?: (target: CodexEndpointTarget) => CodexChatService;
} = {}): CodexChatService {
	const services = new Map<string, CodexChatService>();
	const sessionServices = new Map<string, CodexChatService>();

	const current = async () => {
		const target = await resolveTarget();
		let service = services.get(target.key);
		if (!service) {
			service = createService(target);
			services.set(target.key, service);
		}
		return { target, service };
	};

	const forSession = async (sessionId: string) =>
		sessionServices.get(sessionId) ?? (await current()).service;

	return {
		async capabilities(input) {
			return (await current()).service.capabilities(input);
		},
		async steer(input) {
			return (await forSession(input.sessionId)).steer(input);
		},
		async interrupt(input) {
			return (await forSession(input.sessionId)).interrupt(input);
		},
		async compact(input) {
			return (await forSession(input.sessionId)).compact(input);
		},
		async readThread(input) {
			return (await forSession(input.sessionId)).readThread(input);
		},
		async *stream({ input, signal }) {
			const { service } = await current();
			for await (const event of service.stream({
				input,
				signal,
			})) {
				if (event.type === "session" || event.type === "done") {
					sessionServices.set(event.sessionId, service);
				}
				yield event;
			}
		},
	};
}
