import { randomUUID } from "node:crypto";
import {
	mkdir,
	readFile,
	rename,
	unlink,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type {
	CodexConversationMessage,
	CodexProjectConversation,
	CodexProtocolFrame,
} from "@/agent/codex-conversation";
import { isCodexProjectConversation } from "@/agent/codex-conversation";

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_MESSAGES = 500;
const MAX_MESSAGE_CONTENT = 200_000;
const MAX_PROTOCOL_FRAMES = 200;
const MAX_DETAIL_LENGTH = 20_000;

export interface MergeCodexConversationInput {
	projectId: string;
	sessionId?: string | null;
	messages: unknown[];
}

function assertProjectId(projectId: string): void {
	if (!SAFE_ID.test(projectId)) {
		throw new Error(`Unsafe project id: ${JSON.stringify(projectId)}`);
	}
}

function assertShortString({
	value,
	label,
	maxLength,
	allowEmpty = false,
}: {
	value: string;
	label: string;
	maxLength: number;
	allowEmpty?: boolean;
}): void {
	if ((!allowEmpty && !value) || value.length > maxLength) {
		throw new Error(`${label} is invalid`);
	}
}

function assertProtocolFrame(
	frame: unknown,
): asserts frame is CodexProtocolFrame {
	if (
		!frame ||
		typeof frame !== "object" ||
		Array.isArray(frame) ||
		!("id" in frame) ||
		typeof frame.id !== "string" ||
		!("method" in frame) ||
		typeof frame.method !== "string" ||
		!("threadId" in frame) ||
		typeof frame.threadId !== "string" ||
		!("status" in frame) ||
		!("title" in frame) ||
		typeof frame.title !== "string"
	) {
		throw new Error("message protocol is invalid");
	}
	assertShortString({
		value: frame.id,
		label: "protocol id",
		maxLength: 300,
	});
	assertShortString({
		value: frame.method,
		label: "protocol method",
		maxLength: 300,
	});
	assertShortString({
		value: frame.threadId,
		label: "protocol thread id",
		maxLength: 300,
	});
	assertShortString({
		value: frame.title,
		label: "protocol title",
		maxLength: 500,
	});
	if (
		frame.status !== "started" &&
		frame.status !== "streaming" &&
		frame.status !== "completed" &&
		frame.status !== "failed" &&
		frame.status !== "info"
	) {
		throw new Error("protocol status is invalid");
	}
	if (
		"turnId" in frame &&
		frame.turnId !== undefined &&
		typeof frame.turnId !== "string"
	) {
		throw new Error("protocol turn id is invalid");
	}
	if (
		"itemId" in frame &&
		frame.itemId !== undefined &&
		typeof frame.itemId !== "string"
	) {
		throw new Error("protocol item id is invalid");
	}
	if (
		"itemType" in frame &&
		frame.itemType !== undefined &&
		typeof frame.itemType !== "string"
	) {
		throw new Error("protocol item type is invalid");
	}
	if (
		"append" in frame &&
		frame.append !== undefined &&
		typeof frame.append !== "boolean"
	) {
		throw new Error("protocol append state is invalid");
	}
	if (
		"detail" in frame &&
		frame.detail !== undefined &&
		(typeof frame.detail !== "string" ||
			frame.detail.length > MAX_DETAIL_LENGTH)
	) {
		throw new Error("protocol detail is too large");
	}
}

function assertMessage(
	message: unknown,
): asserts message is CodexConversationMessage {
	if (!message || typeof message !== "object" || Array.isArray(message)) {
		throw new Error("message is invalid");
	}
	if (
		!("id" in message) ||
		typeof message.id !== "string" ||
		!("role" in message) ||
		!("content" in message) ||
		typeof message.content !== "string" ||
		!("createdAt" in message) ||
		typeof message.createdAt !== "number" ||
		!("updatedAt" in message) ||
		typeof message.updatedAt !== "number"
	) {
		throw new Error("message is invalid");
	}
	assertShortString({
		value: message.id,
		label: "message id",
		maxLength: 300,
	});
	if (
		message.role !== "user" &&
		message.role !== "assistant" &&
		message.role !== "error"
	) {
		throw new Error("message role is invalid");
	}
	if (message.content.length > MAX_MESSAGE_CONTENT) {
		throw new Error("message content is invalid or too large");
	}
	if (
		!Number.isFinite(message.createdAt) ||
		message.createdAt < 0 ||
		!Number.isFinite(message.updatedAt) ||
		message.updatedAt < message.createdAt
	) {
		throw new Error("message timestamp is invalid");
	}
	if (
		"referenceCount" in message &&
		message.referenceCount !== undefined &&
		(typeof message.referenceCount !== "number" ||
			!Number.isInteger(message.referenceCount) ||
			message.referenceCount < 0 ||
			message.referenceCount > 10_000)
	) {
		throw new Error("message reference count is invalid");
	}
	if (
		"streaming" in message &&
		message.streaming !== undefined &&
		typeof message.streaming !== "boolean"
	) {
		throw new Error("message streaming state is invalid");
	}
	const protocol =
		"protocol" in message && message.protocol !== undefined
			? message.protocol
			: undefined;
	if (protocol !== undefined && !Array.isArray(protocol)) {
		throw new Error("message protocol is invalid");
	}
	if (protocol && protocol.length > MAX_PROTOCOL_FRAMES) {
		throw new Error("message protocol is too large");
	}
	for (const frame of protocol ?? []) {
		assertProtocolFrame(frame);
	}
}

function emptyConversation(projectId: string): CodexProjectConversation {
	return {
		schemaVersion: "opencut.codex-conversation.v1",
		projectId,
		revision: 0,
		sessionId: null,
		messages: [],
		updatedAt: 0,
	};
}

function conversationsEqual({
	left,
	right,
}: {
	left: CodexProjectConversation;
	right: Omit<CodexProjectConversation, "revision" | "updatedAt">;
}): boolean {
	return (
		left.sessionId === right.sessionId &&
		JSON.stringify(left.messages) === JSON.stringify(right.messages)
	);
}

export class CodexConversationStore {
	readonly rootDirectory: string;
	private readonly queues = new Map<string, Promise<void>>();
	private readonly now: () => number;

	constructor({
		rootDirectory,
		now = Date.now,
	}: {
		rootDirectory: string;
		now?: () => number;
	}) {
		this.rootDirectory = rootDirectory;
		this.now = now;
	}

	private filePath(projectId: string): string {
		return path.join(
			this.rootDirectory,
			projectId,
			"agent",
			"codex-conversation.json",
		);
	}

	private async readUnlocked(projectId: string): Promise<CodexProjectConversation> {
		try {
			const value: unknown = JSON.parse(
				await readFile(this.filePath(projectId), "utf8"),
			);
			if (
				!isCodexProjectConversation(value) ||
				value.projectId !== projectId
			) {
				throw new Error("Stored Codex conversation is invalid");
			}
			return value;
		} catch (error) {
			if (
				error &&
				typeof error === "object" &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				return emptyConversation(projectId);
			}
			throw error;
		}
	}

	private async locked<T>({
		projectId,
		work,
	}: {
		projectId: string;
		work: () => Promise<T>;
	}): Promise<T> {
		const previous = this.queues.get(projectId) ?? Promise.resolve();
		let release: (() => void) | undefined;
		const current = new Promise<void>((resolve) => {
			release = resolve;
		});
		const queued = previous.catch(() => {}).then(() => current);
		this.queues.set(projectId, queued);
		await previous.catch(() => {});
		try {
			return await work();
		} finally {
			release?.();
			if (this.queues.get(projectId) === queued) {
				this.queues.delete(projectId);
			}
		}
	}

	async read(projectId: string): Promise<CodexProjectConversation> {
		assertProjectId(projectId);
		return this.locked({
			projectId,
			work: () => this.readUnlocked(projectId),
		});
	}

	async merge(
		input: MergeCodexConversationInput,
	): Promise<CodexProjectConversation> {
		assertProjectId(input.projectId);
		if (!Array.isArray(input.messages) || input.messages.length > MAX_MESSAGES) {
			throw new Error("messages must be a bounded array");
		}
		const normalizedMessages: CodexConversationMessage[] = [];
		for (const message of input.messages) {
			assertMessage(message);
			normalizedMessages.push(message);
		}
		if (
			input.sessionId !== undefined &&
			input.sessionId !== null &&
			(typeof input.sessionId !== "string" ||
				!input.sessionId ||
				input.sessionId.length > 300)
		) {
			throw new Error("session id is invalid");
		}

		return this.locked({
			projectId: input.projectId,
			work: async () => {
				const current = await this.readUnlocked(input.projectId);
				const byId = new Map(
					current.messages.map((message) => [message.id, message]),
				);
				for (const message of normalizedMessages) {
					const existing = byId.get(message.id);
					if (!existing || message.updatedAt >= existing.updatedAt) {
						byId.set(message.id, message);
					}
				}
				const messages = [...byId.values()]
					.sort(
						(left, right) =>
							left.createdAt - right.createdAt ||
							left.id.localeCompare(right.id),
					)
					.slice(-MAX_MESSAGES);
				const sessionId =
					input.sessionId === undefined ? current.sessionId : input.sessionId;
				const candidate = {
					schemaVersion: "opencut.codex-conversation.v1" as const,
					projectId: input.projectId,
					sessionId,
					messages,
				};
				if (conversationsEqual({ left: current, right: candidate })) {
					return current;
				}

				const conversation: CodexProjectConversation = {
					...candidate,
					revision: current.revision + 1,
					updatedAt: this.now(),
				};
				const destination = this.filePath(input.projectId);
				const directory = path.dirname(destination);
				await mkdir(directory, { recursive: true });
				const temporary = path.join(
					directory,
					`.codex-conversation.${randomUUID()}.tmp`,
				);
				try {
					await writeFile(
						temporary,
						`${JSON.stringify(conversation, null, 2)}\n`,
						"utf8",
					);
					await rename(temporary, destination);
				} catch (error) {
					await unlink(temporary).catch(() => {});
					throw error;
				}
				return conversation;
			},
		});
	}
}

export function createCodexConversationStore({
	rootDirectory = path.join(homedir(), "OpenCutProjects"),
	now,
}: {
	rootDirectory?: string;
	now?: () => number;
} = {}): CodexConversationStore {
	return new CodexConversationStore({ rootDirectory, ...(now ? { now } : {}) });
}

let sharedRoot: string | null = null;
let sharedStore: CodexConversationStore | null = null;

export function getCodexConversationStore(): CodexConversationStore {
	const rootDirectory =
		process.env.OPENCUT_PROJECTS_DIR?.trim() ||
		path.join(homedir(), "OpenCutProjects");
	if (!sharedStore || sharedRoot !== rootDirectory) {
		sharedRoot = rootDirectory;
		sharedStore = createCodexConversationStore({ rootDirectory });
	}
	return sharedStore;
}
