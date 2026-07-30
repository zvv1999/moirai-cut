export type CodexProtocolStatus =
	| "started"
	| "streaming"
	| "completed"
	| "failed"
	| "info";

export interface CodexProtocolFrame {
	id: string;
	method: string;
	threadId: string;
	turnId?: string;
	itemId?: string;
	itemType?: string;
	status: CodexProtocolStatus;
	title: string;
	detail?: string;
	append?: boolean;
}

export interface CodexConversationMessage {
	id: string;
	role: "user" | "assistant" | "error";
	content: string;
	referenceCount?: number;
	streaming?: boolean;
	protocol?: CodexProtocolFrame[];
	runId?: string;
	turnId?: string;
	runSequence?: number;
	createdAt: number;
	updatedAt: number;
}

export interface CodexConversationThread {
	id: string;
	title: string;
	sessionId: string | null;
	messages: CodexConversationMessage[];
	createdAt: number;
	updatedAt: number;
}

export interface CodexProjectConversation {
	schemaVersion: "opencut.codex-conversations.v2";
	projectId: string;
	revision: number;
	conversations: CodexConversationThread[];
	updatedAt: number;
}

export function mergeCodexConversationMessages({
	current,
	incoming,
}: {
	current: CodexConversationMessage[];
	incoming: CodexConversationMessage[];
}): CodexConversationMessage[] {
	const byId = new Map(current.map((message) => [message.id, message]));
	for (const message of incoming) {
		const existing = byId.get(message.id);
		if (!existing || message.updatedAt > existing.updatedAt) {
			byId.set(message.id, message);
		}
	}
	const merged = [...byId.values()].sort(
		(left, right) =>
			left.createdAt - right.createdAt || left.id.localeCompare(right.id),
	);
	return merged.length === current.length &&
		merged.every((message, index) => message === current[index])
		? current
		: merged;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProtocolFrame(value: unknown): value is CodexProtocolFrame {
	if (!isRecord(value)) return false;
	return (
		typeof value.id === "string" &&
		typeof value.method === "string" &&
		typeof value.threadId === "string" &&
		(value.status === "started" ||
			value.status === "streaming" ||
			value.status === "completed" ||
			value.status === "failed" ||
			value.status === "info") &&
		typeof value.title === "string" &&
		(value.turnId === undefined || typeof value.turnId === "string") &&
		(value.itemId === undefined || typeof value.itemId === "string") &&
		(value.itemType === undefined || typeof value.itemType === "string") &&
		(value.detail === undefined || typeof value.detail === "string") &&
		(value.append === undefined || typeof value.append === "boolean")
	);
}

function isConversationMessage(
	value: unknown,
): value is CodexConversationMessage {
	if (!isRecord(value)) return false;
	return (
		typeof value.id === "string" &&
		(value.role === "user" ||
			value.role === "assistant" ||
			value.role === "error") &&
		typeof value.content === "string" &&
		(value.referenceCount === undefined ||
			(typeof value.referenceCount === "number" &&
				Number.isInteger(value.referenceCount))) &&
		(value.streaming === undefined || typeof value.streaming === "boolean") &&
		(value.protocol === undefined ||
			(Array.isArray(value.protocol) &&
				value.protocol.every(isProtocolFrame))) &&
		(value.runId === undefined || typeof value.runId === "string") &&
		(value.turnId === undefined || typeof value.turnId === "string") &&
		(value.runSequence === undefined ||
			(typeof value.runSequence === "number" &&
				Number.isInteger(value.runSequence) &&
				value.runSequence >= 0)) &&
		typeof value.createdAt === "number" &&
		Number.isFinite(value.createdAt) &&
		typeof value.updatedAt === "number" &&
		Number.isFinite(value.updatedAt)
	);
}

function isConversationThread(
	value: unknown,
): value is CodexConversationThread {
	if (!isRecord(value)) return false;
	return (
		typeof value.id === "string" &&
		typeof value.title === "string" &&
		(value.sessionId === null || typeof value.sessionId === "string") &&
		Array.isArray(value.messages) &&
		value.messages.every(isConversationMessage) &&
		typeof value.createdAt === "number" &&
		Number.isFinite(value.createdAt) &&
		typeof value.updatedAt === "number" &&
		Number.isFinite(value.updatedAt)
	);
}

export function isCodexProjectConversation(
	value: unknown,
): value is CodexProjectConversation {
	if (!isRecord(value)) return false;
	return (
		value.schemaVersion === "opencut.codex-conversations.v2" &&
		typeof value.projectId === "string" &&
		typeof value.revision === "number" &&
		Number.isInteger(value.revision) &&
		value.revision >= 0 &&
		Array.isArray(value.conversations) &&
		value.conversations.every(isConversationThread) &&
		typeof value.updatedAt === "number" &&
		Number.isFinite(value.updatedAt)
	);
}

function historyUrl(projectId: string, conversationId?: string): string {
	const base = `/api/codex/history/${encodeURIComponent(projectId)}`;
	return conversationId
		? `${base}?conversationId=${encodeURIComponent(conversationId)}`
		: base;
}

async function conversationFromResponse(
	response: Response,
): Promise<CodexProjectConversation> {
	const value: unknown = await response.json();
	if (!response.ok) {
		const message =
			isRecord(value) && typeof value.error === "string"
				? value.error
				: "智能剪辑历史请求失败。";
		throw new Error(message);
	}
	if (!isCodexProjectConversation(value)) {
		throw new Error("智能剪辑历史响应格式无效。");
	}
	return value;
}

export async function fetchCodexConversation({
	projectId,
	conversationId,
	signal,
}: {
	projectId: string;
	conversationId?: string | null;
	signal?: AbortSignal;
}): Promise<CodexProjectConversation> {
	const response = await fetch(
		historyUrl(projectId, conversationId?.trim() || undefined),
		{
		cache: "no-store",
		...(signal ? { signal } : {}),
		},
	);
	return conversationFromResponse(response);
}

export async function persistCodexConversation({
	projectId,
	conversationId,
	title,
	sessionId,
	messages,
	signal,
}: {
	projectId: string;
	conversationId: string;
	title?: string;
	sessionId: string | null;
	messages: CodexConversationMessage[];
	signal?: AbortSignal;
}): Promise<CodexProjectConversation> {
	const response = await fetch(historyUrl(projectId), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			conversationId,
			...(title ? { title } : {}),
			sessionId,
			messages,
		}),
		...(signal ? { signal } : {}),
	});
	return conversationFromResponse(response);
}
