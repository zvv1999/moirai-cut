import {
	createClaudeChatService,
	type ClaudeChatInput,
	type ClaudeChatService,
} from "@/server/claude-chat";
import { discoverAgentProviders } from "@/server/agent-deployment";
import { getAgentSettingsStore } from "@/server/agent-settings";
import type { AgentEndpointRuntime } from "@/server/agent-settings";
import {
	claudeMcpConfig,
	resolveOpenCutMcpRuntime,
} from "@/server/opencut-mcp-runtime";

function isChatInput(value: unknown): value is ClaudeChatInput {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const input = value as Record<string, unknown>;
	return (
		typeof input.projectId === "string" &&
		input.projectId.length > 0 &&
		typeof input.message === "string" &&
		input.message.length > 0 &&
		input.message.length <= 100_000 &&
		typeof input.messageId === "string" &&
		typeof input.context === "string" &&
		input.context.length <= 500_000 &&
		typeof input.conversationId === "string" &&
		(input.sessionId === undefined || typeof input.sessionId === "string") &&
		(input.model === undefined || typeof input.model === "string") &&
		(input.effort === undefined ||
			input.effort === "low" ||
			input.effort === "medium" ||
			input.effort === "high" ||
			input.effort === "max") &&
		(input.mode === undefined || input.mode === "edit" || input.mode === "plan")
	);
}

function sse(event: string, value: unknown): Uint8Array {
	return new TextEncoder().encode(
		`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`,
	);
}

export function createClaudeChatRouteHandlers({
	service,
	resolveBinary = async () => {
		const store = getAgentSettingsStore();
		const [settings, endpoint] = await Promise.all([
			store.read(),
			store.runtimeEndpoint("claude"),
		]);
		const discovery = await discoverAgentProviders({
			settings,
			customEndpointProviders: endpoint.mode === "custom" ? ["claude"] : [],
		});
		const connection = discovery.providers.find(
			(provider) =>
				provider.provider === "claude" &&
				(endpoint.mode === "custom"
					? provider.executable
					: provider.status === "ready"),
		);
		return connection?.binary ?? null;
	},
	resolveEndpoint = async () =>
		getAgentSettingsStore().runtimeEndpoint("claude"),
}: {
	service?: ClaudeChatService;
	resolveBinary?: () => Promise<string | null>;
	resolveEndpoint?: () => Promise<AgentEndpointRuntime>;
} = {}) {
	return {
		async POST(request: Request) {
			let body: unknown;
			try {
				body = await request.json();
			} catch {
				return Response.json(
					{ error: { message: "请求内容不是有效 JSON。" } },
					{ status: 400 },
				);
			}
			if (!isChatInput(body)) {
				return Response.json(
					{ error: { message: "Claude 会话参数无效。" } },
					{ status: 400 },
				);
			}
			const binary = await resolveBinary();
			if (!binary) {
				return Response.json(
					{
						error: {
							message: "Claude Code 尚未安装或登录，请先在智能剪辑设置中配置。",
						},
					},
					{ status: 503 },
				);
			}
			const chatService =
				service ??
				createClaudeChatService({
					mcpConfig: claudeMcpConfig(await resolveOpenCutMcpRuntime()),
					endpoint: await resolveEndpoint(),
				});
			const sessionAbort = new AbortController();
			const abortSession = () => sessionAbort.abort();
			request.signal.addEventListener("abort", abortSession, { once: true });
			const stream = new ReadableStream<Uint8Array>({
				async start(controller) {
					try {
						for await (const event of chatService.stream({
							binary,
							request: body,
							signal: sessionAbort.signal,
						})) {
							if (event.type === "protocol") {
								controller.enqueue(sse("protocol", event.frame));
							} else if (event.type === "native") {
								controller.enqueue(sse("native", { event: event.event }));
							} else if (event.type === "session") {
								controller.enqueue(
									sse("session", { sessionId: event.sessionId }),
								);
							} else if (event.type === "delta") {
								controller.enqueue(sse("delta", { delta: event.delta }));
							} else if (event.type === "done") {
								controller.enqueue(
									sse("done", {
										sessionId: event.sessionId,
										message: event.message,
									}),
								);
							} else {
								controller.enqueue(sse("error", { message: event.message }));
							}
						}
					} catch (error) {
						if (!sessionAbort.signal.aborted) {
							controller.enqueue(
								sse("error", {
									message:
										error instanceof Error
											? error.message
											: "Claude Code 会话失败。",
								}),
							);
						}
					} finally {
						request.signal.removeEventListener("abort", abortSession);
						if (!sessionAbort.signal.aborted) controller.close();
					}
				},
				cancel() {
					abortSession();
				},
			});
			return new Response(stream, {
				headers: {
					"cache-control": "no-cache, no-transform",
					connection: "keep-alive",
					"content-type": "text/event-stream; charset=utf-8",
				},
			});
		},
	};
}

export const { POST } = createClaudeChatRouteHandlers();
