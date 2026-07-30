import { randomUUID } from "node:crypto";
import type {
	CodexChatEvent,
	CodexChatInput,
	CodexChatService,
	CodexToolProfile,
} from "@/server/codex-chat";

const MAX_RETAINED_EVENTS = 2_000;
const COMPLETED_RUN_RETENTION_MS = 2 * 60 * 60 * 1_000;

export type CodexRunStatus = "running" | "completed" | "failed" | "interrupted";

export interface SequencedCodexRunEvent {
	runId: string;
	sequence: number;
	event: CodexChatEvent;
}

export interface CodexRunSnapshot {
	runId: string;
	projectId: string;
	conversationId: string | null;
	status: CodexRunStatus;
	sessionId: string | null;
	turnId: string | null;
	lastSequence: number;
	error: string | null;
	createdAt: number;
	updatedAt: number;
}

export type CodexRunService = Pick<
	CodexChatService,
	"stream" | "steer" | "interrupt" | "compact"
>;

interface MutableCodexRun extends CodexRunSnapshot {
	input: CodexChatInput;
	events: SequencedCodexRunEvent[];
	listeners: Set<() => void>;
	completion: Promise<void>;
	resolveCompletion: () => void;
}

function terminal(status: CodexRunStatus): boolean {
	return status !== "running";
}

function publicSnapshot(run: MutableCodexRun): CodexRunSnapshot {
	return {
		runId: run.runId,
		projectId: run.projectId,
		conversationId: run.conversationId,
		status: run.status,
		sessionId: run.sessionId,
		turnId: run.turnId,
		lastSequence: run.lastSequence,
		error: run.error,
		createdAt: run.createdAt,
		updatedAt: run.updatedAt,
	};
}

export class CodexRunManager {
	private readonly runs = new Map<string, MutableCodexRun>();

	constructor(
		private readonly options: {
			service: CodexRunService;
			createId: () => string;
			now: () => number;
		},
	) {}

	private prune(): void {
		const cutoff = this.options.now() - COMPLETED_RUN_RETENTION_MS;
		for (const [runId, run] of this.runs) {
			if (terminal(run.status) && run.updatedAt < cutoff) {
				this.runs.delete(runId);
			}
		}
	}

	start(input: CodexChatInput): CodexRunSnapshot {
		this.prune();
		const runId = this.options.createId();
		if (this.runs.has(runId)) {
			throw new Error(`Codex run already exists: ${runId}`);
		}
		const now = this.options.now();
		let resolveCompletion = () => {};
		const completion = new Promise<void>((resolve) => {
			resolveCompletion = resolve;
		});
		const run: MutableCodexRun = {
			runId,
			projectId: input.projectId,
			conversationId: input.conversationId ?? null,
			status: "running",
			sessionId: input.sessionId ?? null,
			turnId: null,
			lastSequence: 0,
			error: null,
			createdAt: now,
			updatedAt: now,
			input,
			events: [],
			listeners: new Set(),
			completion,
			resolveCompletion,
		};
		this.runs.set(runId, run);
		void this.execute(run);
		return publicSnapshot(run);
	}

	private push({
		run,
		event,
	}: {
		run: MutableCodexRun;
		event: CodexChatEvent;
	}): void {
		run.lastSequence += 1;
		run.updatedAt = this.options.now();
		if (event.type === "session") run.sessionId = event.sessionId;
		if (event.type === "turn") {
			run.sessionId = event.sessionId;
			run.turnId = event.turnId;
		}
		if (event.type === "done" && run.status === "running") {
			run.status = "completed";
		}
		if (event.type === "error") {
			if (run.status === "running") {
				run.status = "failed";
				run.error = event.message;
			}
		}
		run.events.push({
			runId: run.runId,
			sequence: run.lastSequence,
			event,
		});
		if (run.events.length > MAX_RETAINED_EVENTS) {
			run.events.splice(0, run.events.length - MAX_RETAINED_EVENTS);
		}
		for (const listener of run.listeners) listener();
		run.listeners.clear();
	}

	private async execute(run: MutableCodexRun): Promise<void> {
		try {
			for await (const event of this.options.service.stream({
				input: run.input,
			})) {
				this.push({ run, event });
			}
			if (run.status === "running") {
				this.push({
					run,
					event: {
						type: "error",
						message: "Codex 任务结束，但没有返回完成消息。",
					},
				});
			}
		} catch (error) {
			if (run.status === "running") {
				this.push({
					run,
					event: {
						type: "error",
						message:
							error instanceof Error ? error.message : "Codex 后台任务失败。",
					},
				});
			}
		} finally {
			run.updatedAt = this.options.now();
			run.resolveCompletion();
			for (const listener of run.listeners) listener();
			run.listeners.clear();
		}
	}

	get(runId: string): CodexRunSnapshot | null {
		const run = this.runs.get(runId);
		return run ? publicSnapshot(run) : null;
	}

	async *subscribe({
		runId,
		afterSequence = 0,
		signal,
	}: {
		runId: string;
		afterSequence?: number;
		signal?: AbortSignal;
	}): AsyncIterable<SequencedCodexRunEvent> {
		const run = this.runs.get(runId);
		if (!run) throw new Error("Codex 后台任务不存在或已过期。");
		let cursor = afterSequence;
		for (;;) {
			if (signal?.aborted) return;
			const pending = run.events.filter((event) => event.sequence > cursor);
			if (pending.length > 0) {
				for (const event of pending) {
					cursor = event.sequence;
					yield event;
				}
				continue;
			}
			if (terminal(run.status)) return;
			await new Promise<void>((resolve) => {
				const wake = () => {
					signal?.removeEventListener("abort", wake);
					run.listeners.delete(wake);
					resolve();
				};
				run.listeners.add(wake);
				signal?.addEventListener("abort", wake, { once: true });
				if (
					run.events.some((event) => event.sequence > cursor) ||
					terminal(run.status) ||
					signal?.aborted
				) {
					wake();
				}
			});
		}
	}

	async waitForCompletion(runId: string): Promise<void> {
		const run = this.runs.get(runId);
		if (!run) throw new Error("Codex 后台任务不存在或已过期。");
		await run.completion;
	}

	private activeRun(runId: string): MutableCodexRun {
		const run = this.runs.get(runId);
		if (!run) throw new Error("Codex 后台任务不存在或已过期。");
		if (!run.sessionId) throw new Error("Codex 会话尚未建立。");
		return run;
	}

	async steer({
		runId,
		message,
	}: {
		runId: string;
		message: string;
	}): Promise<void> {
		const run = this.activeRun(runId);
		const activeSessionId = run.sessionId;
		if (!activeSessionId || !run.turnId || run.status !== "running") {
			throw new Error("当前没有可追加指令的 Codex 任务。");
		}
		await this.options.service.steer({
			sessionId: activeSessionId,
			turnId: run.turnId,
			message,
			toolProfile: run.input.toolProfile,
		});
	}

	async interrupt({ runId }: { runId: string }): Promise<void> {
		const run = this.activeRun(runId);
		const activeSessionId = run.sessionId;
		if (!activeSessionId || !run.turnId || run.status !== "running") {
			throw new Error("当前没有可停止的 Codex 任务。");
		}
		await this.options.service.interrupt({
			sessionId: activeSessionId,
			turnId: run.turnId,
			toolProfile: run.input.toolProfile,
		});
		run.status = "interrupted";
		run.updatedAt = this.options.now();
	}

	async compact({ runId }: { runId: string }): Promise<void> {
		const run = this.activeRun(runId);
		const activeSessionId = run.sessionId;
		if (!activeSessionId) throw new Error("Codex 会话尚未建立。");
		await this.options.service.compact({
			sessionId: activeSessionId,
			toolProfile: run.input.toolProfile,
		});
	}

	async compactSession({
		sessionId,
		toolProfile = "edit",
	}: {
		sessionId: string;
		toolProfile?: CodexToolProfile;
	}): Promise<void> {
		await this.options.service.compact({ sessionId, toolProfile });
	}
}

export function createCodexRunManager({
	service,
	createId = randomUUID,
	now = Date.now,
}: {
	service: CodexRunService;
	createId?: () => string;
	now?: () => number;
}): CodexRunManager {
	return new CodexRunManager({ service, createId, now });
}
