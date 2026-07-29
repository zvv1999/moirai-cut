import { NextResponse } from "next/server";
import {
	createCodexChatService,
	type CodexChatEvent,
	type CodexChatInput,
	type CodexChatService,
} from "@/server/codex-chat";

export const runtime = "nodejs";
export const maxDuration = 360;

export type CodexChatApiService = Pick<CodexChatService, "stream">;

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
		value.context.length > 200_000 ||
		("sessionId" in value &&
			value.sessionId !== undefined &&
			(typeof value.sessionId !== "string" ||
				!value.sessionId.trim() ||
				value.sessionId.length > 200))
	) {
		return null;
	}
	return {
		projectId: value.projectId.trim(),
		message: value.message.trim(),
		context: value.context,
		...("sessionId" in value &&
		typeof value.sessionId === "string" &&
		value.sessionId.trim()
			? { sessionId: value.sessionId.trim() }
			: {}),
	};
}

function eventPayload(event: CodexChatEvent): Record<string, unknown> {
	const { type: _type, ...payload } = event;
	return payload;
}

function encodeSse({
	event,
	data,
}: {
	event: string;
	data: Record<string, unknown>;
}): Uint8Array {
	return new TextEncoder().encode(
		`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
	);
}

export function createCodexChatRouteHandlers({
	service,
}: {
	service: CodexChatApiService;
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

			const abortController = new AbortController();
			request.signal.addEventListener(
				"abort",
				() => abortController.abort(),
				{ once: true },
			);
			const encoder = new TextEncoder();
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(encoder.encode(": connected\n\n"));
					void (async () => {
						try {
							for await (const event of service.stream(input, {
								signal: abortController.signal,
							})) {
								controller.enqueue(
									encodeSse({
										event: event.type,
										data: eventPayload(event),
									}),
								);
							}
						} catch (error) {
							controller.enqueue(
								encodeSse({
									event: "error",
									data: {
										message:
											error instanceof Error
												? error.message
												: "Codex 会话失败。",
									},
								}),
							);
						} finally {
							controller.close();
						}
					})();
				},
				cancel() {
					abortController.abort();
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
		},
	};
}

const handlers = createCodexChatRouteHandlers({
	service: createCodexChatService(),
});

export const POST = handlers.POST;
