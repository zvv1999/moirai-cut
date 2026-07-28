import type { ElementRef } from "@/timeline/types";

export type ElementRelationKind = "group" | "link";

interface RelationElement {
	id: string;
	type: string;
	startTime: number;
	duration: number;
	groupId?: string;
	linkGroupId?: string;
}

interface RelationTrack {
	id: string;
	elements: RelationElement[];
}

interface ResolvedRelationElement {
	ref: ElementRef;
	element: RelationElement;
}

export interface ElementRelationUpdate {
	trackId: string;
	elementId: string;
	patch: {
		groupId?: string;
		linkGroupId?: string;
	};
}

export interface ElementRelationPlan {
	available: boolean;
	action: "group" | "ungroup" | "link" | "unlink";
	reason?: string;
	updates: ElementRelationUpdate[];
}

function isSameRef({
	left,
	right,
}: {
	left: ElementRef;
	right: ElementRef;
}): boolean {
	return left.trackId === right.trackId && left.elementId === right.elementId;
}

function resolveElements({
	tracks,
	selection,
}: {
	tracks: RelationTrack[];
	selection: ElementRef[];
}): ResolvedRelationElement[] {
	return tracks.flatMap((track) =>
		track.elements.flatMap((element) =>
			selection.some((ref) =>
				isSameRef({
					left: ref,
					right: { trackId: track.id, elementId: element.id },
				}),
			)
				? [{ ref: { trackId: track.id, elementId: element.id }, element }]
				: [],
		),
	);
}

export function expandElementSelectionRelations({
	tracks,
	elements,
}: {
	tracks: RelationTrack[];
	elements: ElementRef[];
}): ElementRef[] {
	const allElements = tracks.flatMap((track) =>
		track.elements.map((element) => ({
			ref: { trackId: track.id, elementId: element.id },
			element,
		})),
	);
	const selectedIds = new Set(
		elements.map((element) => `${element.trackId}:${element.elementId}`),
	);
	const groupIds = new Set<string>();
	const linkGroupIds = new Set<string>();

	let changed = true;
	while (changed) {
		changed = false;
		for (const item of allElements) {
			const key = `${item.ref.trackId}:${item.ref.elementId}`;
			const isRelated =
				selectedIds.has(key) ||
				(!!item.element.groupId && groupIds.has(item.element.groupId)) ||
				(!!item.element.linkGroupId &&
					linkGroupIds.has(item.element.linkGroupId));
			if (!isRelated) continue;

			if (!selectedIds.has(key)) {
				selectedIds.add(key);
				changed = true;
			}
			if (item.element.groupId && !groupIds.has(item.element.groupId)) {
				groupIds.add(item.element.groupId);
				changed = true;
			}
			if (
				item.element.linkGroupId &&
				!linkGroupIds.has(item.element.linkGroupId)
			) {
				linkGroupIds.add(item.element.linkGroupId);
				changed = true;
			}
		}
	}

	return allElements
		.filter(({ ref }) => selectedIds.has(`${ref.trackId}:${ref.elementId}`))
		.map(({ ref }) => ref);
}

function hasVisualAudioOverlap({
	elements,
}: {
	elements: ResolvedRelationElement[];
}): boolean {
	if (
		elements.some(
			({ element }) => !["video", "image", "audio"].includes(element.type),
		)
	) {
		return false;
	}
	const visuals = elements.filter(({ element }) =>
		["video", "image"].includes(element.type),
	);
	const audio = elements.filter(({ element }) => element.type === "audio");
	return visuals.some(({ element: visual }) =>
		audio.some(({ element: audioElement }) => {
			const overlapStart = Math.max(visual.startTime, audioElement.startTime);
			const overlapEnd = Math.min(
				visual.startTime + visual.duration,
				audioElement.startTime + audioElement.duration,
			);
			return overlapEnd > overlapStart;
		}),
	);
}

export function planElementRelationUpdate({
	tracks,
	selection,
	kind,
	relationId,
}: {
	tracks: RelationTrack[];
	selection: ElementRef[];
	kind: ElementRelationKind;
	relationId: string;
}): ElementRelationPlan {
	const resolved = resolveElements({ tracks, selection });
	const action = kind === "group" ? "group" : "link";
	if (resolved.length < 2) {
		return {
			available: false,
			action,
			reason:
				kind === "group"
					? "Select at least two clips"
					: "Select overlapping visual and audio clips",
			updates: [],
		};
	}

	const relationKey = kind === "group" ? "groupId" : "linkGroupId";
	const currentId = resolved[0]?.element[relationKey];
	const hasOneSharedRelation =
		!!currentId &&
		resolved.every(({ element }) => element[relationKey] === currentId);
	if (hasOneSharedRelation) {
		return {
			available: true,
			action: kind === "group" ? "ungroup" : "unlink",
			updates: resolved.map(({ ref }) => ({
				...ref,
				patch: { [relationKey]: undefined },
			})),
		};
	}

	if (kind === "link" && !hasVisualAudioOverlap({ elements: resolved })) {
		return {
			available: false,
			action: "link",
			reason: "Select overlapping visual and audio clips",
			updates: [],
		};
	}

	return {
		available: true,
		action,
		updates: resolved.map(({ ref }) => ({
			...ref,
			patch: { [relationKey]: relationId },
		})),
	};
}
