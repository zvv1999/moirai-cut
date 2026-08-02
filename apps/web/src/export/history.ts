import type { ExportDraft } from "@/export/workflow";

export type ExportHistoryStatus = "completed" | "failed" | "cancelled";

export interface ExportHistoryEntry {
	id: string;
	projectId: string;
	projectRevision: number;
	label: string;
	options: ExportDraft;
	status: ExportHistoryStatus;
	destinationName: string | null;
	sizeBytes: number | null;
	error: string | null;
	available: boolean;
	createdAt: string;
}

export interface ExportHistoryInput {
	projectId: string;
	projectRevision: number;
	label: string;
	options: ExportDraft;
	status: ExportHistoryStatus;
	destinationName: string | null;
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

function cloneEntry(entry: ExportHistoryEntry): ExportHistoryEntry {
	return { ...entry, options: cloneOptions(entry.options) };
}

export class ExportHistoryStore {
	private entries: ExportHistoryEntry[];
	private maxEntries: number;
	private createId: () => string;
	private now: () => string;
	private listeners = new Set<() => void>();

	constructor({
		maxEntries = 50,
		createId = () => crypto.randomUUID(),
		now = () => new Date().toISOString(),
		initial = [],
	}: {
		maxEntries?: number;
		createId?: () => string;
		now?: () => string;
		initial?: ExportHistoryEntry[];
	} = {}) {
		this.maxEntries = maxEntries;
		this.createId = createId;
		this.now = now;
		this.entries = initial.slice(0, maxEntries).map(cloneEntry);
	}

	record(input: ExportHistoryInput): ExportHistoryEntry {
		const entry: ExportHistoryEntry = {
			...input,
			id: this.createId(),
			options: cloneOptions(input.options),
			// A completed encode is not necessarily on disk yet: the browser mirrors
			// large buffers asynchronously. Availability becomes true only after a
			// directory reconciliation confirms the exact destination exists.
			available: false,
			createdAt: this.now(),
		};
		this.entries.unshift(entry);
		this.entries = this.entries.slice(0, this.maxEntries);
		this.publish();
		return cloneEntry(entry);
	}

	list(): ExportHistoryEntry[] {
		return this.entries.map(cloneEntry);
	}

	reconcileAvailability({
		availableNames,
	}: {
		availableNames: Set<string>;
	}): void {
		this.entries = this.entries.map((entry) => ({
			...entry,
			available:
				entry.status === "completed" &&
				entry.destinationName !== null &&
				availableNames.has(entry.destinationName),
		}));
		this.publish();
	}

	rerun({
		id,
	}: {
		id: string;
	}): { label: string; options: ExportDraft } | null {
		const entry = this.entries.find((candidate) => candidate.id === id);
		return entry
			? { label: entry.label, options: cloneOptions(entry.options) }
			: null;
	}

	serialize(): string {
		return JSON.stringify(this.entries);
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private publish(): void {
		for (const listener of this.listeners) listener();
	}
}

const STORAGE_KEY = "opencut.export-history.v1";
let browserStore: ExportHistoryStore | null = null;

function parseStoredHistory(value: string | null): ExportHistoryEntry[] {
	if (!value) return [];
	try {
		const parsed: unknown = JSON.parse(value);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(entry): entry is ExportHistoryEntry =>
				typeof entry === "object" &&
				entry !== null &&
				"id" in entry &&
				typeof entry.id === "string" &&
				"projectId" in entry &&
				typeof entry.projectId === "string" &&
				"label" in entry &&
				typeof entry.label === "string" &&
				"options" in entry &&
				typeof entry.options === "object" &&
				entry.options !== null,
		);
	} catch {
		return [];
	}
}

export function getBrowserExportHistory(): ExportHistoryStore {
	if (browserStore) return browserStore;
	const initial =
		typeof window === "undefined"
			? []
			: parseStoredHistory(window.localStorage.getItem(STORAGE_KEY));
	browserStore = new ExportHistoryStore({ initial });
	if (typeof window !== "undefined") {
		browserStore.subscribe(() => {
			window.localStorage.setItem(
				STORAGE_KEY,
				browserStore?.serialize() ?? "[]",
			);
		});
	}
	return browserStore;
}
