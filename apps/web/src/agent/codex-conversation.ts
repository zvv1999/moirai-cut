export type CodexProtocolStatus =
	"started" | "streaming" | "completed" | "failed" | "info";

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

export type ProviderNativePayload =
	| null
	| boolean
	| number
	| string
	| ProviderNativePayload[]
	| { [key: string]: ProviderNativePayload };

export interface ProviderNativeEvent {
	id: string;
	provider: string;
	transport: string;
	name: string;
	payload: ProviderNativePayload;
	raw?: string;
}

export interface CodexConversationMessage {
	id: string;
	role: "user" | "assistant" | "error";
	content: string;
	referenceCount?: number;
	streaming?: boolean;
	protocol?: CodexProtocolFrame[];
	nativeEvents?: ProviderNativeEvent[];
	runId?: string;
	turnId?: string;
	runSequence?: number;
	createdAt: number;
	updatedAt: number;
}

export interface CodexConversationThread {
	id: string;
	title: string;
	provider?: "codex" | "claude";
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

export function synchronizeCodexConversationMessages({
	current,
	incoming,
	hasActiveRun,
}: {
	current: CodexConversationMessage[];
	incoming: CodexConversationMessage[];
	hasActiveRun: boolean;
}): CodexConversationMessage[] {
	if (hasActiveRun) {
		return mergeCodexConversationMessages({ current, incoming });
	}
	return incoming.length === current.length &&
		incoming.every((message, index) => message === current[index])
		? current
		: incoming;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProviderNativePayload(
	value: unknown,
	seen = new WeakSet<object>(),
): value is ProviderNativePayload {
	if (
		value === null ||
		typeof value === "boolean" ||
		typeof value === "string"
	) {
		return true;
	}
	if (typeof value === "number") return Number.isFinite(value);
	if (typeof value !== "object") return false;
	if (seen.has(value)) return false;
	seen.add(value);
	if (Array.isArray(value)) {
		return value.every((item) => isProviderNativePayload(item, seen));
	}
	return Object.values(value).every((item) =>
		isProviderNativePayload(item, seen),
	);
}

export function isProviderNativeEvent(
	value: unknown,
): value is ProviderNativeEvent {
	if (!isRecord(value)) return false;
	return (
		typeof value.id === "string" &&
		typeof value.provider === "string" &&
		value.provider.length > 0 &&
		typeof value.transport === "string" &&
		value.transport.length > 0 &&
		typeof value.name === "string" &&
		"payload" in value &&
		isProviderNativePayload(value.payload) &&
		(value.raw === undefined || typeof value.raw === "string")
	);
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
		(value.nativeEvents === undefined ||
			(Array.isArray(value.nativeEvents) &&
				value.nativeEvents.every(isProviderNativeEvent))) &&
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
		(value.provider === undefined ||
			value.provider === "codex" ||
			value.provider === "claude") &&
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

function historyUrl({
	projectId,
	conversationId,
	synchronizeNative = true,
}: {
	projectId: string;
	conversationId?: string;
	synchronizeNative?: boolean;
}): string {
	const base = `/api/codex/history/${encodeURIComponent(projectId)}`;
	const query = [
		conversationId
			? `conversationId=${encodeURIComponent(conversationId)}`
			: null,
		synchronizeNative ? null : "syncNative=0",
	].filter((part): part is string => part !== null);
	return query.length > 0 ? `${base}?${query.join("&")}` : base;
}

async function conversationFromResponse(
	response: Response,
): Promise<CodexProjectConversation | null> {
	if (response.status === 304) return null;
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
	revision,
	synchronizeNative = true,
	signal,
}: {
	projectId: string;
	conversationId?: string | null;
	revision?: number;
	synchronizeNative?: boolean;
	signal?: AbortSignal;
}): Promise<CodexProjectConversation | null> {
	const response = await fetch(
		historyUrl({
			projectId,
			conversationId: conversationId?.trim() || undefined,
			synchronizeNative,
		}),
		{
			cache: "no-store",
			...(revision !== undefined && revision >= 0
				? { headers: { "if-none-match": `"opencut-codex-${revision}"` } }
				: {}),
			...(signal ? { signal } : {}),
		},
	);
	return conversationFromResponse(response);
}

export async function persistCodexConversation({
	projectId,
	conversationId,
	provider,
	title,
	sessionId,
	messages,
	signal,
}: {
	projectId: string;
	conversationId: string;
	provider?: "codex" | "claude";
	title?: string;
	sessionId: string | null;
	messages: CodexConversationMessage[];
	signal?: AbortSignal;
}): Promise<CodexProjectConversation> {
	const response = await fetch(historyUrl({ projectId }), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			conversationId,
			...(provider ? { provider } : {}),
			...(title ? { title } : {}),
			sessionId,
			messages,
		}),
		...(signal ? { signal } : {}),
	});
	const conversation = await conversationFromResponse(response);
	if (!conversation) {
		throw new Error("智能剪辑历史写入未返回工程会话。");
	}
	return conversation;
}
