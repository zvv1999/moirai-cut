export type BackgroundJobKind =
	| "export"
	| "proxy"
	| "transcription"
	| "analysis";
export type BackgroundJobStatus =
	| "running"
	| "completed"
	| "failed"
	| "cancelled";

export interface BackgroundJobState {
	jobId: string;
	kind: BackgroundJobKind;
	label: string;
	status: BackgroundJobStatus;
	progress: number;
	step: string;
	attempts: number;
	createdAt: string;
	updatedAt: string;
	error: string | null;
}

interface BackgroundJobContext {
	signal: AbortSignal;
	update(update: { progress?: number; step?: string }): void;
}

interface BackgroundJobDefinition {
	kind: BackgroundJobKind;
	label: string;
	run(context: BackgroundJobContext): Promise<void>;
}

interface JobRecord {
	state: BackgroundJobState;
	definition: BackgroundJobDefinition;
	controller: AbortController;
	done: Promise<void>;
}

const MAX_HISTORY = 30;

export class BackgroundJobRegistry {
	private records = new Map<string, JobRecord>();
	private listeners = new Set<() => void>();

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

	private createId: () => string;
	private now: () => string;

	start(definition: BackgroundJobDefinition): {
		job: BackgroundJobState;
		done: Promise<void>;
	} {
		const jobId = this.createId();
		const timestamp = this.now();
		const record: JobRecord = {
			state: {
				jobId,
				kind: definition.kind,
				label: definition.label,
				status: "running",
				progress: 0,
				step: "Starting",
				attempts: 1,
				createdAt: timestamp,
				updatedAt: timestamp,
				error: null,
			},
			definition,
			controller: new AbortController(),
			done: Promise.resolve(),
		};
		this.records.set(jobId, record);
		this.prune();
		record.done = this.execute(record);
		this.publish();
		return { job: { ...record.state }, done: record.done };
	}

	get({ jobId }: { jobId: string }): BackgroundJobState | null {
		const state = this.records.get(jobId)?.state;
		return state ? { ...state } : null;
	}

	list(): BackgroundJobState[] {
		return [...this.records.values()]
			.map((record) => ({ ...record.state }))
			.reverse();
	}

	cancel({ jobId }: { jobId: string }): BackgroundJobState | null {
		const record = this.records.get(jobId);
		if (!record || record.state.status !== "running") {
			return record ? { ...record.state } : null;
		}
		record.controller.abort();
		this.patch({
			record,
			update: {
				status: "cancelled",
				step: "Cancelled",
			},
		});
		return { ...record.state };
	}

	async retry({
		jobId,
	}: {
		jobId: string;
	}): Promise<BackgroundJobState | null> {
		const record = this.records.get(jobId);
		if (
			!record ||
			(record.state.status !== "failed" && record.state.status !== "cancelled")
		) {
			return record ? { ...record.state } : null;
		}
		record.controller = new AbortController();
		record.state = {
			...record.state,
			status: "running",
			progress: 0,
			step: "Retrying",
			attempts: record.state.attempts + 1,
			updatedAt: this.now(),
			error: null,
		};
		this.publish();
		record.done = this.execute(record);
		await record.done;
		return { ...record.state };
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private async execute(record: JobRecord): Promise<void> {
		try {
			await record.definition.run({
				signal: record.controller.signal,
				update: ({ progress, step }) => {
					if (record.state.status !== "running") return;
					this.patch({
						record,
						update: {
							...(progress === undefined
								? {}
								: { progress: Math.max(0, Math.min(1, progress)) }),
							...(step === undefined ? {} : { step }),
						},
					});
				},
			});
			if (record.controller.signal.aborted) {
				if (record.state.status !== "cancelled") {
					this.patch({
						record,
						update: { status: "cancelled", step: "Cancelled" },
					});
				}
				return;
			}
			this.patch({
				record,
				update: {
					status: "completed",
					progress: 1,
					step: "Completed",
					error: null,
				},
			});
		} catch (error) {
			if (record.controller.signal.aborted) {
				this.patch({
					record,
					update: { status: "cancelled", step: "Cancelled" },
				});
				return;
			}
			this.patch({
				record,
				update: {
					status: "failed",
					step: "Failed",
					error: error instanceof Error ? error.message : String(error),
				},
			});
		}
	}

	private patch({
		record,
		update,
	}: {
		record: JobRecord;
		update: Partial<BackgroundJobState>;
	}): void {
		record.state = {
			...record.state,
			...update,
			updatedAt: this.now(),
		};
		this.publish();
	}

	private prune(): void {
		while (this.records.size > MAX_HISTORY) {
			const oldest = this.records.keys().next().value;
			if (oldest === undefined) return;
			this.records.delete(oldest);
		}
	}

	private publish(): void {
		for (const listener of this.listeners) listener();
	}
}

export const backgroundJobs = new BackgroundJobRegistry();
