export interface ProjectRevisionSummary {
	revision: number;
	sceneCount: number;
	trackCount: number;
	elementCount: number;
	durationTicks: number | null;
}

export type RevisionElementChangeKind =
	| "added"
	| "removed"
	| "moved"
	| "renamed"
	| "changed";

export interface RevisionElementChange {
	kind: RevisionElementChangeKind;
	elementId: string;
	name: string;
	from?: {
		sceneId: string;
		trackId: string;
		startTime: number | null;
	};
	to?: {
		sceneId: string;
		trackId: string;
		startTime: number | null;
	};
	detail: string;
}

export interface ProjectRevisionDiff {
	fromRevision: number;
	toRevision: number;
	summary: Record<RevisionElementChangeKind, number>;
	changes: RevisionElementChange[];
}

export interface ProjectVersionDecision {
	revision: number;
	versionCreated: boolean;
}

interface RevisionElement {
	id: string;
	name: string;
	sceneId: string;
	trackId: string;
	startTime: number | null;
	comparable: string;
}

/**
 * Returns whether a save changes the project a user can meaningfully restore.
 *
 * The editor persists playhead/zoom state and generated thumbnails so the next
 * session can resume naturally. Those writes are useful, but they are not edit
 * versions. Timestamps and the server-owned revision are bookkeeping as well.
 */
export function hasVersionableProjectChanges({
	current,
	incoming,
}: {
	current: unknown;
	incoming: unknown;
}): boolean {
	return !versionValuesEqual({ current, incoming, path: [] });
}

export function decideProjectVersion({
	current,
	incoming,
}: {
	current: unknown | null;
	incoming: unknown;
}): ProjectVersionDecision {
	const currentRevision = finiteNumber(asRecord(current).revision) ?? 0;
	const versionCreated =
		current === null ||
		currentRevision <= 0 ||
		hasVersionableProjectChanges({ current, incoming });
	return {
		revision: versionCreated ? currentRevision + 1 : currentRevision,
		versionCreated,
	};
}

export function summarizeProjectRevision({
	document,
}: {
	document: unknown;
}): ProjectRevisionSummary {
	const project = asRecord(document);
	const scenes = asRecords(project.scenes);
	const tracks = scenes.flatMap((scene) => tracksOfScene(scene));
	return {
		revision: finiteNumber(project.revision) ?? 0,
		sceneCount: scenes.length,
		trackCount: tracks.length,
		elementCount: tracks.reduce(
			(total, track) => total + asRecords(track.elements).length,
			0,
		),
		durationTicks: finiteNumber(asRecord(project.metadata).duration),
	};
}

export function compareProjectRevisions({
	current,
	target,
}: {
	current: unknown;
	target: unknown;
}): ProjectRevisionDiff {
	const currentSummary = summarizeProjectRevision({ document: current });
	const targetSummary = summarizeProjectRevision({ document: target });
	const currentElements = new Map(
		indexElements(current).map((element) => [element.id, element]),
	);
	const targetElements = new Map(
		indexElements(target).map((element) => [element.id, element]),
	);
	const changes: RevisionElementChange[] = [];

	for (const targetElement of targetElements.values()) {
		const currentElement = currentElements.get(targetElement.id);
		if (!currentElement) {
			changes.push({
				kind: "added",
				elementId: targetElement.id,
				name: targetElement.name,
				to: locationOf(targetElement),
				detail: "Snapshot restores this clip",
			});
			continue;
		}
		if (
			currentElement.sceneId !== targetElement.sceneId ||
			currentElement.trackId !== targetElement.trackId ||
			currentElement.startTime !== targetElement.startTime
		) {
			changes.push({
				kind: "moved",
				elementId: targetElement.id,
				name: targetElement.name,
				from: locationOf(currentElement),
				to: locationOf(targetElement),
				detail: "Track or timeline position changes",
			});
		}
		if (currentElement.name !== targetElement.name) {
			changes.push({
				kind: "renamed",
				elementId: targetElement.id,
				name: targetElement.name,
				from: locationOf(currentElement),
				to: locationOf(targetElement),
				detail: `${currentElement.name} → ${targetElement.name}`,
			});
		}
		if (currentElement.comparable !== targetElement.comparable) {
			changes.push({
				kind: "changed",
				elementId: targetElement.id,
				name: targetElement.name,
				from: locationOf(currentElement),
				to: locationOf(targetElement),
				detail: "Duration, trim, parameters, effects, or animation changes",
			});
		}
	}

	for (const currentElement of currentElements.values()) {
		if (targetElements.has(currentElement.id)) continue;
		changes.push({
			kind: "removed",
			elementId: currentElement.id,
			name: currentElement.name,
			from: locationOf(currentElement),
			detail: "Snapshot removes this clip",
		});
	}

	const order: RevisionElementChangeKind[] = [
		"added",
		"removed",
		"moved",
		"renamed",
		"changed",
	];
	changes.sort(
		(first, second) =>
			order.indexOf(first.kind) - order.indexOf(second.kind) ||
			first.name.localeCompare(second.name) ||
			first.elementId.localeCompare(second.elementId),
	);
	const summary: Record<RevisionElementChangeKind, number> = {
		added: 0,
		removed: 0,
		moved: 0,
		renamed: 0,
		changed: 0,
	};
	for (const change of changes) summary[change.kind] += 1;
	return {
		fromRevision: currentSummary.revision,
		toRevision: targetSummary.revision,
		summary,
		changes,
	};
}

function indexElements(document: unknown): RevisionElement[] {
	const project = asRecord(document);
	return asRecords(project.scenes).flatMap((scene) => {
		const sceneId = String(scene.id ?? "");
		return tracksOfScene(scene).flatMap((track) =>
			asRecords(track.elements).map((element) => {
				const {
					id: _id,
					name: _name,
					startTime: _startTime,
					...rest
				} = element;
				return {
					id: String(element.id ?? ""),
					name: String(element.name ?? "Untitled clip"),
					sceneId,
					trackId: String(track.id ?? ""),
					startTime: finiteNumber(element.startTime),
					comparable: stableJson(rest),
				};
			}),
		);
	});
}

function tracksOfScene(scene: Record<string, unknown>): Record<string, unknown>[] {
	const tracks = asRecord(scene.tracks);
	return [
		...asRecords(tracks.overlay),
		...(tracks.main && typeof tracks.main === "object"
			? [asRecord(tracks.main)]
			: []),
		...asRecords(tracks.audio),
	];
}

function locationOf(element: RevisionElement) {
	return {
		sceneId: element.sceneId,
		trackId: element.trackId,
		startTime: element.startTime,
	};
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(stableJson).join(",")}]`;
	}
	if (isRecord(value)) {
		return `{${Object.keys(value)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value) ?? "undefined";
}

function versionValuesEqual({
	current,
	incoming,
	path,
}: {
	current: unknown;
	incoming: unknown;
	path: string[];
}): boolean {
	if (Object.is(current, incoming)) return true;
	if (Array.isArray(current) || Array.isArray(incoming)) {
		if (!Array.isArray(current) || !Array.isArray(incoming)) return false;
		if (current.length !== incoming.length) return false;
		return current.every((value, index) =>
			versionValuesEqual({
				current: value,
				incoming: incoming[index],
				path: [...path, String(index)],
			}),
		);
	}
	if (!isRecord(current) || !isRecord(incoming)) return false;

	const currentKeys = versionableKeys({ value: current, path });
	const incomingKeys = versionableKeys({ value: incoming, path });
	if (currentKeys.length !== incomingKeys.length) return false;
	const incomingKeySet = new Set(incomingKeys);
	return currentKeys.every(
		(key) =>
			incomingKeySet.has(key) &&
			versionValuesEqual({
				current: current[key],
				incoming: incoming[key],
				path: [...path, key],
			}),
	);
}

function versionableKeys({
	value,
	path,
}: {
	value: Record<string, unknown>;
	path: string[];
}): string[] {
	return Object.keys(value).filter((key) => {
		if (key === "updatedAt") return false;
		if (path.length === 0 && (key === "revision" || key === "timelineViewState")) {
			return false;
		}
		if (path.length === 1 && path[0] === "metadata" && key === "thumbnail") {
			return false;
		}
		return true;
	});
}

function asRecord(value: unknown): Record<string, unknown> {
	return isRecord(value) ? value : {};
}

function asRecords(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}
