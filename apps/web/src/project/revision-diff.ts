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

interface RevisionElement {
	id: string;
	name: string;
	sceneId: string;
	trackId: string;
	startTime: number | null;
	comparable: string;
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
