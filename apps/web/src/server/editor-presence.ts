const ACTIVE_WINDOW_MS = 45_000;
const MAX_CONTEXT_BYTES = 128 * 1024;

interface EditorPresenceRecord {
	projectId: string;
	sceneId: string | null;
	revision: number | null;
	lastSeen: number;
	context: unknown | null;
}

const editors = new Map<string, EditorPresenceRecord>();

function compactContext({
	projectId,
	context,
}: {
	projectId: string;
	context: unknown;
}): unknown | null {
	const encoded = JSON.stringify(context ?? null);
	if (encoded.length > MAX_CONTEXT_BYTES) {
		throw new Error("智能剪辑上下文过大，无法发布编辑器状态。");
	}
	if (
		typeof context !== "object" ||
		context === null ||
		!("schemaVersion" in context) ||
		context.schemaVersion !== "opencut.agent-context.v1" ||
		!("project" in context) ||
		typeof context.project !== "object" ||
		context.project === null ||
		!("id" in context.project) ||
		context.project.id !== projectId
	) {
		return null;
	}
	return context;
}

export function recordEditorPresence({
	projectId,
	sceneId,
	revision,
	context,
	now = Date.now(),
}: {
	projectId: string;
	sceneId?: string | null;
	revision?: number | null;
	context?: unknown;
	now?: number;
}): void {
	const previous = editors.get(projectId);
	editors.set(projectId, {
		projectId,
		sceneId: sceneId ?? previous?.sceneId ?? null,
		revision: revision ?? previous?.revision ?? null,
		lastSeen: now,
		context:
			context === undefined
				? (previous?.context ?? null)
				: compactContext({ projectId, context }),
	});
}

export function removeEditorPresence(projectId: string): void {
	editors.delete(projectId);
}

export function getActiveEditor({
	now = Date.now(),
}: {
	now?: number;
} = {}):
	| {
			active: true;
			projectId: string;
			sceneId: string | null;
			revision: number | null;
			lastSeen: number;
			context: unknown | null;
	  }
	| { active: false } {
	let freshest: EditorPresenceRecord | null = null;
	for (const record of editors.values()) {
		if (now - record.lastSeen >= ACTIVE_WINDOW_MS) continue;
		if (!freshest || record.lastSeen > freshest.lastSeen) freshest = record;
	}
	return freshest ? { active: true, ...freshest } : { active: false };
}

export function clearEditorPresenceForTests(): void {
	editors.clear();
}
