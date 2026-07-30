import { NextResponse } from "next/server";
import {
	createCodexChatService,
	type CodexChatService,
} from "@/server/codex-chat";
import {
	type CodexConversationStore,
	getCodexConversationStore,
} from "@/server/codex-conversation";

interface RouteContext {
	params: Promise<{ projectId: string }>;
}

function json({
	value,
	status = 200,
}: {
	value: unknown;
	status?: number;
}): NextResponse {
	return NextResponse.json(value, {
		status,
		headers: { "cache-control": "no-store" },
	});
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isClientError(message: string): boolean {
	return (
		message.includes("Unsafe project id") ||
		message.includes("messages") ||
		message.includes("message ") ||
		message.includes("protocol ") ||
		message.includes("session id") ||
		message.includes("conversation id") ||
		message.includes("conversation title")
	);
}

export async function readSharedProjectConversation({
	projectId,
	conversationId,
	store = getCodexConversationStore(),
	codex = createCodexChatService(),
}: {
	projectId: string;
	conversationId: string;
	store?: CodexConversationStore;
	codex?: Pick<CodexChatService, "readThread">;
}) {
	const stored = await store.read(projectId);
	const conversation = stored.conversations.find(
		(candidate) => candidate.id === conversationId,
	);
	if (!conversation?.sessionId) return stored;
	try {
		const thread = await codex.readThread({
			sessionId: conversation.sessionId,
			toolProfile: "edit",
		});
		return store.synchronizeThread({
			projectId,
			conversationId,
			sessionId: thread.sessionId,
			title: thread.title,
			messages: thread.messages,
		});
	} catch (error) {
		console.warn("Failed to synchronize Codex App thread", {
			projectId,
			conversationId,
			message: messageOf(error),
		});
		return stored;
	}
}

// Next route handlers must use the framework's positional request/context API.
export async function GET(request: Request, { params }: RouteContext) {
	const { projectId } = await params;
	try {
		const conversationId = new URL(request.url).searchParams
			.get("conversationId")
			?.trim();
		return json({
			value: conversationId
				? await readSharedProjectConversation({
						projectId,
						conversationId,
					})
				: await getCodexConversationStore().read(projectId),
		});
	} catch (error) {
		const message = messageOf(error);
		return json({
			value: { error: message },
			status: isClientError(message) ? 400 : 500,
		});
	}
}

// Next route handlers must use the framework's positional request/context API.
export async function POST(request: Request, { params }: RouteContext) {
	const { projectId } = await params;
	try {
		const body: unknown = await request.json();
		if (!body || typeof body !== "object" || Array.isArray(body)) {
			throw new Error("messages payload is invalid");
		}
		if (!("messages" in body) || !Array.isArray(body.messages)) {
			throw new Error("messages must be an array");
		}
		if (
			!("conversationId" in body) ||
			typeof body.conversationId !== "string"
		) {
			throw new Error("conversation id is invalid");
		}
		let sessionId: string | null | undefined;
		if ("sessionId" in body) {
			const candidate = body.sessionId;
			if (candidate !== null && typeof candidate !== "string") {
				throw new Error("session id is invalid");
			}
			sessionId = candidate;
		}
		let title: string | undefined;
		if ("title" in body) {
			if (typeof body.title !== "string") {
				throw new Error("conversation title is invalid");
			}
			title = body.title;
		}
		return json({
			value: await getCodexConversationStore().merge({
				projectId,
				conversationId: body.conversationId,
				...(title !== undefined ? { title } : {}),
				...(sessionId !== undefined ? { sessionId } : {}),
				messages: body.messages,
			}),
		});
	} catch (error) {
		const message = messageOf(error);
		return json({
			value: { error: message },
			status: isClientError(message) ? 400 : 500,
		});
	}
}
