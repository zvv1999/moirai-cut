export interface RecoverySessionStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export interface RecoveryCandidate {
	projectId: string;
	interruptedAt: string;
	openingRevision: number;
	recoveryRevision: number;
}

interface RecoverySessionRecord {
	projectId: string;
	sessionId: string;
	status: "open" | "clean";
	startedAt: string;
	openingRevision: number;
	lastSavedRevision: number;
}

const keyFor = (projectId: string) => `opencut:recovery:${projectId}`;

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseRecord(value: string | null): RecoverySessionRecord | null {
	if (value === null) return null;
	try {
		const record: unknown = JSON.parse(value);
		if (
			!isRecord(record) ||
			typeof record.projectId !== "string" ||
			typeof record.sessionId !== "string" ||
			(record.status !== "open" && record.status !== "clean") ||
			typeof record.startedAt !== "string" ||
			typeof record.openingRevision !== "number" ||
			typeof record.lastSavedRevision !== "number"
		) {
			return null;
		}
		return {
			projectId: record.projectId,
			sessionId: record.sessionId,
			status: record.status,
			startedAt: record.startedAt,
			openingRevision: record.openingRevision,
			lastSavedRevision: record.lastSavedRevision,
		};
	} catch {
		return null;
	}
}

function writeRecord({
	storage,
	record,
}: {
	storage: RecoverySessionStorage;
	record: RecoverySessionRecord;
}): void {
	storage.setItem(keyFor(record.projectId), JSON.stringify(record));
}

export function beginRecoverySession({
	storage,
	projectId,
	currentRevision,
	sessionId,
	now,
}: {
	storage: RecoverySessionStorage;
	projectId: string;
	currentRevision: number;
	sessionId: string;
	now: string;
}): RecoveryCandidate | null {
	const previous = parseRecord(storage.getItem(keyFor(projectId)));
	const candidate =
		previous?.status === "open" &&
		previous.sessionId !== sessionId &&
		previous.lastSavedRevision > previous.openingRevision &&
		currentRevision >= previous.lastSavedRevision
			? {
					projectId,
					interruptedAt: previous.startedAt,
					openingRevision: previous.openingRevision,
					recoveryRevision: previous.lastSavedRevision,
				}
			: null;

	writeRecord({
		storage,
		record: {
			projectId,
			sessionId,
			status: "open",
			startedAt: now,
			openingRevision: currentRevision,
			lastSavedRevision: currentRevision,
		},
	});
	return candidate;
}

export function markRecoverySessionSaved({
	storage,
	projectId,
	sessionId,
	revision,
}: {
	storage: RecoverySessionStorage;
	projectId: string;
	sessionId: string;
	revision: number;
}): void {
	const record = parseRecord(storage.getItem(keyFor(projectId)));
	if (!record || record.sessionId !== sessionId) return;
	writeRecord({
		storage,
		record: {
			...record,
			lastSavedRevision: Math.max(record.lastSavedRevision, revision),
		},
	});
}

export function markRecoverySessionClean({
	storage,
	projectId,
	sessionId,
}: {
	storage: RecoverySessionStorage;
	projectId: string;
	sessionId: string;
}): void {
	const record = parseRecord(storage.getItem(keyFor(projectId)));
	if (!record || record.sessionId !== sessionId) return;
	writeRecord({ storage, record: { ...record, status: "clean" } });
}
