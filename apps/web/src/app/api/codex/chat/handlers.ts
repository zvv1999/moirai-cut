import { NextResponse } from "next/server";
import {
	createCodexChatService,
	syncCodexThreadToDesktop,
	type CodexChatInput,
	type CodexChatService,
	type CodexCollaborationMode,
	type CodexToolProfile,
	type CodexVerificationMode,
	type CodexVisualMode,
} from "@/server/codex-chat";
import {
	createCodexRunManager,
	type CodexRunManager,
	type CodexRunService,
} from "@/server/codex-run-manager";

export type CodexChatApiService = Pick<CodexChatService, "stream"> &
	Partial<Pick<CodexChatService, "steer" | "interrupt" | "compact">>;

const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max", "ultra"]);

function isMode(value: unknown): value is CodexCollaborationMode {
	return value === "default" || value === "plan";
}

function isToolProfile(value: unknown): value is CodexToolProfile {
	return value === "edit" || value === "verify" || value === "full";
}

function isVisualMode(value: unknown): value is CodexVisualMode {
	return value === "off" || value === "auto";
}

function isVerificationMode(value: unknown): value is CodexVerificationMode {
	return value === "off" || value === "basic" || value === "full";
}

function optionalString({
	value,
	maxLength,
}: {
	value: unknown;
	maxLength: number;
}): string | undefined | null {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
		return null;
	}
	return value.trim();
}

function chatInput(value: unknown): CodexChatInput | null {
	if (
		!value ||
		typeof value !== "object" ||
		!("projectId" in value) ||
		typeof value.projectId !== "string" ||
		!value.projectId.trim() ||
		!("message" in value) ||
		typeof value.message !== "string" ||
		!value.message.trim() ||
		value.message.length > 20_000 ||
		!("context" in value) ||
		typeof value.context !== "string" ||
		value.context.length > 200_000
	) {
		return null;
	}

	const sessionId = optionalString({
		value: "sessionId" in value ? value.sessionId : undefined,
		maxLength: 200,
	});
	const conversationId = optionalString({
		value: "conversationId" in value ? value.conversationId : undefined,
		maxLength: 200,
	});
	const messageId = optionalString({
		value: "messageId" in value ? value.messageId : undefined,
		maxLength: 300,
	});
	const model = optionalString({
		value: "model" in value ? value.model : undefined,
		maxLength: 100,
	});
	const effort = optionalString({
		value: "effort" in value ? value.effort : undefined,
		maxLength: 20,
	});
	const mode = "mode" in value ? value.mode : undefined;
	const toolProfile = "toolProfile" in value ? value.toolProfile : undefined;
	const visualMode = "visualMode" in value ? value.visualMode : undefined;
	const verificationMode =
		"verificationMode" in value ? value.verificationMode : undefined;

	if (
		sessionId === null ||
		conversationId === null ||
		messageId === null ||
		model === null ||
		effort === null ||
		(effort !== undefined && !EFFORTS.has(effort)) ||
		(mode !== undefined && !isMode(mode)) ||
		(toolProfile !== undefined && !isToolProfile(toolProfile)) ||
		(visualMode !== undefined && !isVisualMode(visualMode)) ||
		(verificationMode !== undefined && !isVerificationMode(verificationMode))
	) {
		return null;
	}

	return {
		projectId: value.projectId.trim(),
		message: value.message.trim(),
		context: value.context,
		...(sessionId ? { sessionId } : {}),
		...(conversationId ? { conversationId } : {}),
		...(messageId ? { messageId } : {}),
		...(model ? { model } : {}),
		...(effort ? { effort } : {}),
		...(isMode(mode) ? { mode } : {}),
		...(isToolProfile(toolProfile) ? { toolProfile } : {}),
		...(isVisualMode(visualMode) ? { visualMode } : {}),
		...(isVerificationMode(verificationMode) ? { verificationMode } : {}),
	};
}

function encodeSse({
	event,
	data,
	id,
}: {
	event: string;
	data: object;
	id?: number;
}): Uint8Array {
	return new TextEncoder().encode(
		`${id === undefined ? "" : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
	);
}

function asRunService(service: CodexChatApiService): CodexRunService {
	const unavailable = async () => {
		throw new Error("当前 Codex 连接不支持该会话操作。");
	};
	return {
		stream: service.stream,
		steer: service.steer ?? unavailable,
		interrupt: service.interrupt ?? unavailable,
		compact: service.compact ?? unavailable,
	};
}

function runStreamResponse({
	manager,
	runId,
	afterSequence,
	signal,
}: {
	manager: CodexRunManager;
	runId: string;
	afterSequence: number;
	signal: AbortSignal;
}): Response {
	const encoder = new TextEncoder();
	const subscriptionController = new AbortController();
	let cancelled = signal.aborted;
	const abortSubscription = () => {
		cancelled = true;
		subscriptionController.abort();
	};
	if (signal.aborted) {
		subscriptionController.abort();
	} else {
		signal.addEventListener("abort", abortSubscription, { once: true });
	}
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const snapshot = manager.get(runId);
			controller.enqueue(encoder.encode(": connected\n\n"));
			if (snapshot) {
				controller.enqueue(
					encodeSse({
						event: "run",
						data: snapshot,
					}),
				);
			}
			void (async () => {
				try {
					for await (const entry of manager.subscribe({
						runId,
						afterSequence,
						signal: subscriptionController.signal,
					})) {
						const { type, ...payload } = entry.event;
						controller.enqueue(
							encodeSse({
								event: type,
								id: entry.sequence,
								data: payload,
							}),
						);
					}
				} catch (error) {
					if (!subscriptionController.signal.aborted) {
						controller.enqueue(
							encodeSse({
								event: "error",
								data: {
									runId,
									message:
										error instanceof Error ? error.message : "Codex 会话失败。",
								},
							}),
						);
					}
				} finally {
					signal.removeEventListener("abort", abortSubscription);
					if (!cancelled) controller.close();
				}
			})();
		},
		cancel() {
			abortSubscription();
		},
	});

	return new Response(stream, {
		status: 200,
		headers: {
			"content-type": "text/event-stream; charset=utf-8",
			"cache-control": "no-cache, no-transform",
			connection: "keep-alive",
			"x-accel-buffering": "no",
		},
	});
}

function actionInput(value: unknown):
	| {
			action: "steer";
			runId: string;
			message: string;
	  }
	| { action: "interrupt"; runId: string }
	| {
			action: "compact";
			runId?: string;
			sessionId?: string;
			toolProfile?: CodexToolProfile;
	  }
	| null {
	if (!value || typeof value !== "object" || !("action" in value)) return null;
	const runId = optionalString({
		value: "runId" in value ? value.runId : undefined,
		maxLength: 200,
	});
	if (runId === null) return null;
	if (value.action === "steer") {
		const message = optionalString({
			value: "message" in value ? value.message : undefined,
			maxLength: 20_000,
		});
		return runId && message ? { action: "steer", runId, message } : null;
	}
	if (value.action === "interrupt") {
		return runId ? { action: "interrupt", runId } : null;
	}
	if (value.action !== "compact") return null;
	const sessionId = optionalString({
		value: "sessionId" in value ? value.sessionId : undefined,
		maxLength: 200,
	});
	const toolProfile = "toolProfile" in value ? value.toolProfile : undefined;
	if (
		sessionId === null ||
		(toolProfile !== undefined && !isToolProfile(toolProfile)) ||
		(!runId && !sessionId)
	) {
		return null;
	}
	return {
		action: "compact",
		...(runId ? { runId } : {}),
		...(sessionId ? { sessionId } : {}),
		...(isToolProfile(toolProfile) ? { toolProfile } : {}),
	};
}

export function createCodexChatRouteHandlers({
	service,
	manager = createCodexRunManager({ service: asRunService(service) }),
}: {
	service: CodexChatApiService;
	manager?: CodexRunManager;
}) {
	return {
		POST: async (request: Request) => {
			let body: unknown;
			try {
				body = await request.json();
			} catch {
				return NextResponse.json(
					{ error: { code: "codex_chat_request_invalid" } },
					{ status: 400 },
				);
			}
			const input = chatInput(body);
			if (!input) {
				return NextResponse.json(
					{ error: { code: "codex_chat_request_invalid" } },
					{ status: 400 },
				);
			}
			const run = manager.start(input);
			return runStreamResponse({
				manager,
				runId: run.runId,
				afterSequence: 0,
				signal: request.signal,
			});
		},
		GET: async (request: Request) => {
			const url = new URL(request.url);
			const runId = url.searchParams.get("runId")?.trim() ?? "";
			const afterValue = url.searchParams.get("after") ?? "0";
			const afterSequence = Number.parseInt(afterValue, 10);
			if (
				!runId ||
				runId.length > 200 ||
				!Number.isInteger(afterSequence) ||
				afterSequence < 0 ||
				!manager.get(runId)
			) {
				return NextResponse.json(
					{ error: { code: "codex_run_not_found" } },
					{ status: 404 },
				);
			}
			return runStreamResponse({
				manager,
				runId,
				afterSequence,
				signal: request.signal,
			});
		},
		PUT: async (request: Request) => {
			let body: unknown;
			try {
				body = await request.json();
			} catch {
				return NextResponse.json(
					{ error: { code: "codex_action_invalid" } },
					{ status: 400 },
				);
			}
			const action = actionInput(body);
			if (!action) {
				return NextResponse.json(
					{ error: { code: "codex_action_invalid" } },
					{ status: 400 },
				);
			}
			try {
				if (action.action === "steer") {
					await manager.steer(action);
				} else if (action.action === "interrupt") {
					await manager.interrupt(action);
				} else if (action.runId) {
					await manager.compact({ runId: action.runId });
				} else if (action.sessionId) {
					await manager.compactSession({
						sessionId: action.sessionId,
						toolProfile: action.toolProfile,
					});
				}
				return NextResponse.json({ ok: true });
			} catch (error) {
				return NextResponse.json(
					{
						error: {
							code: "codex_action_failed",
							message:
								error instanceof Error ? error.message : "Codex 会话操作失败。",
						},
					},
					{ status: 409 },
				);
			}
		},
	};
}

const service = createCodexChatService({
	syncThreadToDesktop: (threadId) => syncCodexThreadToDesktop({ threadId }),
});
const handlers = createCodexChatRouteHandlers({ service });

export const POST = handlers.POST;
export const GET = handlers.GET;
export const PUT = handlers.PUT;
