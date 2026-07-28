import type { ExportDraft } from "@/export/workflow";

export type ExportQueueStatus =
	| "pending"
	| "running"
	| "completed"
	| "failed"
	| "cancelled";

export interface ExportQueueItem {
	id: string;
	label: string;
	options: ExportDraft;
	projectRevision: number;
	status: ExportQueueStatus;
	progress: number;
	attempts: number;
	createdAt: string;
	updatedAt: string;
	outputName: string | null;
	sizeBytes: number | null;
	error: string | null;
}

function cloneOptions(options: ExportDraft): ExportDraft {
	return {
		...options,
		fps: { ...options.fps },
		...(options.range ? { range: { ...options.range } } : {}),
	};
}

export class ExportQueue {
	private items: ExportQueueItem[] = [];
	private listeners = new Set<() => void>();
	private createId: () => string;
	private now: () => string;

	constructor({
		createId = () => crypto.randomUUID(),
		now = () => new Date().toISOString(),
	}: {
		createId?: () => string;
		now?: () => string;
	} = {}) {
		this.createId = createId;
		this.now = now;
	}

	enqueue({
		label,
		options,
		projectRevision,
	}: {
		label: string;
		options: ExportDraft;
		projectRevision: number;
	}): ExportQueueItem {
		const timestamp = this.now();
		const item: ExportQueueItem = {
			id: this.createId(),
			label,
			options: cloneOptions(options),
			projectRevision,
			status: "pending",
			progress: 0,
			attempts: 1,
			createdAt: timestamp,
			updatedAt: timestamp,
			outputName: null,
			sizeBytes: null,
			error: null,
		};
		this.items.push(item);
		this.publish();
		return this.clone(item);
	}

	list(): ExportQueueItem[] {
		return this.items.map((item) => this.clone(item));
	}

	get({ id }: { id: string }): ExportQueueItem | null {
		const item = this.items.find((candidate) => candidate.id === id);
		return item ? this.clone(item) : null;
	}

	nextPending(): ExportQueueItem | null {
		const item = this.items.find((candidate) => candidate.status === "pending");
		return item ? this.clone(item) : null;
	}

	start({ id }: { id: string }): ExportQueueItem | null {
		return this.patch({
			id,
			allowed: new Set(["pending"]),
			update: {
				status: "running",
				progress: 0,
				error: null,
			},
		});
	}

	update({
		id,
		progress,
	}: {
		id: string;
		progress: number;
	}): ExportQueueItem | null {
		return this.patch({
			id,
			allowed: new Set(["running"]),
			update: { progress: Math.max(0, Math.min(1, progress)) },
		});
	}

	complete({
		id,
		outputName,
		sizeBytes,
	}: {
		id: string;
		outputName: string;
		sizeBytes: number;
	}): ExportQueueItem | null {
		return this.patch({
			id,
			allowed: new Set(["running"]),
			update: {
				status: "completed",
				progress: 1,
				outputName,
				sizeBytes,
				error: null,
			},
		});
	}

	fail({ id, error }: { id: string; error: string }): ExportQueueItem | null {
		return this.patch({
			id,
			allowed: new Set(["running"]),
			update: { status: "failed", error },
		});
	}

	cancel({ id }: { id: string }): ExportQueueItem | null {
		return this.patch({
			id,
			allowed: new Set(["pending", "running"]),
			update: { status: "cancelled", error: null },
		});
	}

	retry({ id }: { id: string }): ExportQueueItem | null {
		const item = this.items.find((candidate) => candidate.id === id);
		if (!item || (item.status !== "failed" && item.status !== "cancelled")) {
			return item ? this.clone(item) : null;
		}
		item.status = "pending";
		item.progress = 0;
		item.attempts += 1;
		item.updatedAt = this.now();
		item.outputName = null;
		item.sizeBytes = null;
		item.error = null;
		this.publish();
		return this.clone(item);
	}

	clearCompleted(): void {
		this.items = this.items.filter((item) => item.status !== "completed");
		this.publish();
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private patch({
		id,
		allowed,
		update,
	}: {
		id: string;
		allowed: Set<ExportQueueStatus>;
		update: Partial<ExportQueueItem>;
	}): ExportQueueItem | null {
		const item = this.items.find((candidate) => candidate.id === id);
		if (!item || !allowed.has(item.status)) {
			return item ? this.clone(item) : null;
		}
		Object.assign(item, update, { updatedAt: this.now() });
		this.publish();
		return this.clone(item);
	}

	private clone(item: ExportQueueItem): ExportQueueItem {
		return { ...item, options: cloneOptions(item.options) };
	}

	private publish(): void {
		for (const listener of this.listeners) listener();
	}
}

export const exportQueue = new ExportQueue();
