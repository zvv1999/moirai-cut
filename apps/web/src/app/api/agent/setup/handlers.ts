import { NextResponse } from "next/server";
import {
	discoverAgentProviders,
	installOpenCutMcp,
	type AgentProviderId,
	type OpenCutMcpInstallResult,
} from "@/server/agent-deployment";
import {
	getAgentSettingsStore,
	type AgentEndpointAuth,
	type AgentEndpointMode,
	type AgentEndpointSnapshot,
	type AgentSettingsStore,
	validateAgentBinaryPath,
} from "@/server/agent-settings";
import {
	runAgentDoctor,
	type AgentDoctorSnapshot,
} from "@/server/agent-doctor";
import { resolveOpenCutMcpRuntime } from "@/server/opencut-mcp-runtime";

export type AgentSetupSnapshot = AgentDoctorSnapshot & {
	endpoints: AgentEndpointSnapshot;
};

export interface AgentSetupApiService {
	inspect(): Promise<AgentSetupSnapshot>;
	installMcp(provider: AgentProviderId): Promise<OpenCutMcpInstallResult>;
	configureProvider(
		provider: AgentProviderId,
		binary: string,
	): Promise<AgentSetupSnapshot>;
	selectProvider(provider: AgentProviderId): Promise<AgentSetupSnapshot>;
	configureEndpoint(input: {
		baseUrl: string;
		auth: AgentEndpointAuth;
		credential?: string;
	}): Promise<AgentSetupSnapshot>;
	selectEndpoint(mode: AgentEndpointMode): Promise<AgentSetupSnapshot>;
}

function createAgentSetupService({
	settingsStore = getAgentSettingsStore(),
}: {
	settingsStore?: AgentSettingsStore;
} = {}): AgentSetupApiService {
	const inspect = async () => {
		const [runtime, settings, endpoints] = await Promise.all([
			resolveOpenCutMcpRuntime(),
			settingsStore.read(),
			settingsStore.endpointSnapshot(),
		]);
		const discovery = await discoverAgentProviders({
			settings,
			customEndpointProviders: (["codex", "claude"] as const).filter(
				(provider) =>
					endpoints[provider].mode === "custom" &&
					Boolean(endpoints[provider].custom?.hasCredential),
			),
		});
		return { ...(await runAgentDoctor({ runtime, discovery })), endpoints };
	};
	return {
		inspect,
		async installMcp(provider) {
			const [runtime, settings] = await Promise.all([
				resolveOpenCutMcpRuntime(),
				settingsStore.read(),
			]);
			const discovery = await discoverAgentProviders({ settings });
			const connection = discovery.providers.find(
				(candidate) =>
					candidate.provider === provider && candidate.status === "ready",
			);
			if (!connection) {
				throw new Error(
					`${provider === "codex" ? "Codex" : "Claude"} 未登录，无法安装 MCP。`,
				);
			}
			return installOpenCutMcp({
				provider,
				binary: connection.binary,
				runtime,
			});
		},
		async configureProvider(provider, binary) {
			const normalized = validateAgentBinaryPath({ provider, binary });
			const discovery = await discoverAgentProviders({
				candidates: [{ provider, binary: normalized, source: "configured" }],
				preferredProvider: provider,
			});
			const connection = discovery.providers.find(
				(candidate) => candidate.provider === provider,
			);
			if (
				!connection ||
				connection.status === "invalid" ||
				!connection.executable
			) {
				throw new Error(
					`${provider === "codex" ? "Codex" : "Claude"} 路径无法执行。`,
				);
			}
			await settingsStore.configureProvider({ provider, binary: normalized });
			return inspect();
		},
		async selectProvider(provider) {
			const current = await inspect();
			const connection = current.providers.find(
				(candidate) => candidate.provider === provider,
			);
			if (connection?.status !== "ready") {
				throw new Error(
					`${provider === "codex" ? "Codex" : "Claude"} 尚未登录，不能设为当前对话 Agent。`,
				);
			}
			await settingsStore.selectProvider(provider);
			return inspect();
		},
		async configureEndpoint(input) {
			await settingsStore.configureEndpoint(input);
			return inspect();
		},
		async selectEndpoint(mode) {
			await settingsStore.selectEndpointMode({ mode });
			return inspect();
		},
	};
}

function isLoopbackHostname(hostname: string): boolean {
	return (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "[::1]" ||
		hostname === "::1"
	);
}

function isAllowedMutationRequest(request: Request): boolean {
	const target = new URL(request.url);
	const origin = request.headers.get("origin");
	if (!origin) return isLoopbackHostname(target.hostname);
	try {
		const source = new URL(origin);
		const targetIsLocalBinding =
			isLoopbackHostname(target.hostname) ||
			target.hostname === "0.0.0.0" ||
			target.hostname === "[::]";
		return (
			targetIsLocalBinding &&
			isLoopbackHostname(source.hostname) &&
			source.protocol === target.protocol &&
			source.port === target.port
		);
	} catch {
		return false;
	}
}

type AgentSetupMutation =
	| { action: "install-mcp"; provider: AgentProviderId }
	| { action: "select-provider"; provider: AgentProviderId }
	| {
			action: "configure-provider";
			provider: AgentProviderId;
			binary: string;
	  }
	| {
			action: "configure-endpoint";
			baseUrl: string;
			auth: AgentEndpointAuth;
			credential?: string;
	  }
	| {
			action: "select-endpoint";
			mode: AgentEndpointMode;
	  };

function parseSetupRequest(value: unknown): AgentSetupMutation | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	if (record.action === "install-mcp" || record.action === "select-provider") {
		if (record.provider !== "codex" && record.provider !== "claude") {
			return null;
		}
		if (
			Object.keys(record).some((key) => key !== "action" && key !== "provider")
		) {
			return null;
		}
		return { action: record.action, provider: record.provider };
	}
	if (record.action === "select-endpoint") {
		if (
			(record.mode !== "native" && record.mode !== "custom") ||
			Object.keys(record).some(
				(key) => key !== "action" && key !== "mode" && key !== "provider",
			)
		) {
			return null;
		}
		return {
			action: "select-endpoint",
			mode: record.mode,
		};
	}
	if (record.action === "configure-endpoint") {
		const auth = record.auth;
		const credential = record.credential;
		if (
			typeof record.baseUrl !== "string" ||
			record.baseUrl.length > 2_048 ||
			(auth !== "api-key" && auth !== "bearer") ||
			(credential !== undefined &&
				(typeof credential !== "string" || credential.length > 8_192)) ||
			Object.keys(record).some(
				(key) =>
					!new Set([
						"action",
						"provider",
						"baseUrl",
						"model",
						"auth",
						"credential",
					]).has(key),
			)
		) {
			return null;
		}
		return {
			action: "configure-endpoint",
			baseUrl: record.baseUrl,
			auth,
			...(typeof credential === "string" ? { credential } : {}),
		};
	}
	if (
		record.action !== "configure-provider" ||
		(record.provider !== "codex" && record.provider !== "claude") ||
		typeof record.binary !== "string" ||
		Object.keys(record).some(
			(key) => key !== "action" && key !== "provider" && key !== "binary",
		)
	) {
		return null;
	}
	return {
		action: "configure-provider",
		provider: record.provider,
		binary: record.binary,
	};
}

export function createAgentSetupRouteHandlers({
	service = createAgentSetupService(),
}: {
	service?: AgentSetupApiService;
} = {}) {
	return {
		async GET(_request?: Request) {
			try {
				const snapshot = await service.inspect();
				return NextResponse.json(snapshot, {
					headers: { "cache-control": "no-store, max-age=0" },
				});
			} catch (error) {
				return NextResponse.json(
					{
						error:
							error instanceof Error
								? error.message
								: "无法完成 Agent 环境检查。",
					},
					{ status: 500 },
				);
			}
		},
		async POST(request: Request) {
			if (!isAllowedMutationRequest(request)) {
				return NextResponse.json(
					{ error: "Agent 配置只能从本机 Moirai Cut 发起。" },
					{ status: 403 },
				);
			}
			let body: unknown;
			try {
				body = await request.json();
			} catch {
				return NextResponse.json(
					{ error: "请求内容不是有效 JSON。" },
					{ status: 400 },
				);
			}
			const input = parseSetupRequest(body);
			if (!input) {
				return NextResponse.json(
					{ error: "Agent 配置请求无效。" },
					{ status: 400 },
				);
			}
			try {
				const result =
					input.action === "install-mcp"
						? await service.installMcp(input.provider)
						: input.action === "select-provider"
							? await service.selectProvider(input.provider)
							: input.action === "configure-provider"
								? await service.configureProvider(input.provider, input.binary)
								: input.action === "configure-endpoint"
									? await service.configureEndpoint({
											baseUrl: input.baseUrl,
											auth: input.auth,
											...(input.credential
												? { credential: input.credential }
												: {}),
										})
									: await service.selectEndpoint(input.mode);
				return NextResponse.json(result);
			} catch (error) {
				return NextResponse.json(
					{
						error:
							error instanceof Error
								? error.message
								: "Moirai Cut MCP 安装失败。",
					},
					{ status: 500 },
				);
			}
		},
	};
}

export const { GET, POST } = createAgentSetupRouteHandlers();
