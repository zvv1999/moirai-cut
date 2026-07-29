import { NextResponse } from "next/server";
import {
	createCodexChatService,
	type CodexChatInput,
	type CodexChatResult,
} from "@/server/codex-chat";

export const runtime = "nodejs";
export const maxDuration = 360;

export interface CodexChatApiService {
	send(input: CodexChatInput): Promise<CodexChatResult>;
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
	return {
		projectId: value.projectId.trim(),
		message: value.message.trim(),
		context: value.context,
	};
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
			try {
				return NextResponse.json({ data: await service.send(input) });
			} catch (error) {
				return NextResponse.json(
					{
						error: {
							code: "codex_chat_failed",
							message:
								error instanceof Error ? error.message : "Codex 会话失败。",
						},
					},
					{ status: 502 },
				);
			}
		},
	};
}

const handlers = createCodexChatRouteHandlers({
	service: createCodexChatService(),
});

export const POST = handlers.POST;
