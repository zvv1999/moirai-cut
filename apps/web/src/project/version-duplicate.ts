function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function prepareRevisionDuplicate({
	snapshot,
	newProjectId,
	newName,
	now,
}: {
	snapshot: unknown;
	newProjectId: string;
	newName: string;
	now: string;
}): Record<string, unknown> {
	if (!isRecord(snapshot) || !isRecord(snapshot.metadata)) {
		throw new Error("Revision snapshot is missing project metadata");
	}
	if (!newProjectId.trim() || !newName.trim()) {
		throw new Error("Duplicate project id and name are required");
	}

	return {
		...snapshot,
		revision: 1,
		metadata: {
			...snapshot.metadata,
			id: newProjectId,
			name: newName.trim(),
			createdAt: now,
			updatedAt: now,
		},
	};
}
