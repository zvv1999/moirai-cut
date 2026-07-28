import type {
	CompoundClipChild,
	ElementRef,
	SceneTracks,
	TimelineElement,
	TimelineTrack,
} from "@/timeline/types";
import type { MediaTime } from "@/wasm";

export type CompoundClipPlan =
	| {
			available: true;
			trackId: string;
			startTime: MediaTime;
			duration: MediaTime;
			elementIds: string[];
	  }
	| { available: false; reason: string };

export function planCompoundClip({
	tracks,
	selection,
}: {
	tracks: SceneTracks;
	selection: ElementRef[];
}): CompoundClipPlan {
	if (selection.length < 2) {
		return { available: false, reason: "Select at least two visual clips" };
	}
	const selected = selection.flatMap((ref) => {
		const track = allTracks(tracks).find((candidate) => candidate.id === ref.trackId);
		const element = track?.elements.find(
			(candidate) => candidate.id === ref.elementId,
		);
		return track && element ? [{ track, element }] : [];
	});
	if (
		selected.length !== selection.length ||
		new Set(selected.map(({ track }) => track.id)).size !== 1 ||
		selected.some(
			({ element }) => element.type !== "video" && element.type !== "image",
		)
	) {
		return {
			available: false,
			reason: "Compound clips require visual clips on one track",
		};
	}
	if (selected[0].track.locked) {
		return { available: false, reason: "Unlock the track before nesting clips" };
	}

	const ordered = [...selected].sort(
		(first, second) =>
			(first.element.startTime as number) - (second.element.startTime as number),
	);
	const startTime = ordered[0].element.startTime;
	const endTime = Math.max(
		...ordered.map(
			({ element }) =>
				(element.startTime as number) + (element.duration as number),
		),
	) as MediaTime;
	return {
		available: true,
		trackId: ordered[0].track.id,
		startTime,
		duration: ((endTime as number) - (startTime as number)) as MediaTime,
		elementIds: ordered.map(({ element }) => element.id),
	};
}

export function createCompoundClip({
	tracks,
	selection,
	compoundId,
	name,
}: {
	tracks: SceneTracks;
	selection: ElementRef[];
	compoundId: string;
	name: string;
}): SceneTracks {
	const plan = planCompoundClip({ tracks, selection });
	if (!plan.available) throw new Error(plan.reason);
	const track = allTracks(tracks).find(
		(candidate) => candidate.id === plan.trackId,
	);
	const ordered = plan.elementIds.flatMap((elementId) => {
		const element = track?.elements.find((candidate) => candidate.id === elementId);
		return element ? [element] : [];
	});
	if (!track || ordered.length !== plan.elementIds.length) {
		throw new Error("Compound clip selection changed before it was created");
	}

	const children: CompoundClipChild[] = ordered.map((element) => ({
		originalTrackId: track.id,
		relativeStartTime: ((element.startTime as number) -
			(plan.startTime as number)) as MediaTime,
		element: cloneElement(element),
	}));
	const first = ordered[0];
	const container: TimelineElement = {
		...first,
		id: compoundId,
		name: normalizeCompoundName(name),
		startTime: plan.startTime,
		duration: plan.duration,
		trimStart: 0 as MediaTime,
		trimEnd: 0 as MediaTime,
		sourceDuration: plan.duration,
		groupId: undefined,
		linkGroupId: undefined,
		transitionIn: undefined,
		animations: undefined,
		compound: { id: compoundId, children },
	};
	return mapTracks(tracks, (candidate) =>
		candidate.id === track.id
			? withElements(
					candidate,
					sortElements([
						...candidate.elements.filter(
							(element) => !plan.elementIds.includes(element.id),
						),
						container,
					]),
				)
			: candidate,
	);
}

export function breakApartCompoundClip({
	tracks,
	compoundId,
}: {
	tracks: SceneTracks;
	compoundId: string;
}): SceneTracks {
	const located = allTracks(tracks)
		.flatMap((track) =>
			track.elements.map((element) => ({ track, element })),
		)
		.find(({ element }) => element.compound?.id === compoundId);
	if (!located?.element.compound) {
		throw new Error(`Compound clip ${compoundId} was not found`);
	}
	if (located.track.locked) {
		throw new Error("Unlock the track before breaking apart a compound clip");
	}
	const restored = located.element.compound.children.map((child) => ({
		...cloneElement(child.element),
		startTime: ((located.element.startTime as number) +
			(child.relativeStartTime as number)) as MediaTime,
	}));
	return mapTracks(tracks, (track) =>
		track.id === located.track.id
			? withElements(
					track,
					sortElements([
						...track.elements.filter(
							(element) => element.id !== located.element.id,
						),
						...restored,
					]),
				)
			: track,
	);
}

export function updateCompoundChild({
	tracks,
	compoundId,
	childElementId,
	patch,
}: {
	tracks: SceneTracks;
	compoundId: string;
	childElementId: string;
	patch: { name?: string; relativeStartTime?: MediaTime };
}): SceneTracks {
	let found = false;
	const next = mapTracks(tracks, (track) =>
		withElements(
			track,
			track.elements.map((element) => {
				if (element.compound?.id !== compoundId) return element;
				const children = element.compound.children.map((child) => {
					if (child.element.id !== childElementId) return child;
					found = true;
					return {
						...child,
						...(patch.relativeStartTime !== undefined
							? {
									relativeStartTime: Math.max(
										0,
										patch.relativeStartTime as number,
									) as MediaTime,
								}
							: {}),
						element: {
							...child.element,
							...(patch.name !== undefined
								? { name: normalizeCompoundName(patch.name) }
								: {}),
						},
					};
				});
				return {
					...element,
					compound: { ...element.compound, children },
				};
			}),
		),
	);
	if (!found) {
		throw new Error(`Nested clip ${childElementId} was not found`);
	}
	return next;
}

export function expandCompoundElements({
	elements,
}: {
	elements: TimelineElement[];
}): TimelineElement[] {
	const expanded: TimelineElement[] = [];
	for (const element of elements) {
		if (!element.compound) {
			expanded.push(element);
			continue;
		}
		for (const child of element.compound.children) {
			const childElement = {
				...cloneElement(child.element),
				startTime: ((element.startTime as number) +
					(child.relativeStartTime as number)) as MediaTime,
			};
			expanded.push(
				...expandCompoundElements({
					elements: [childElement],
				}),
			);
		}
	}
	return sortElements(expanded);
}

function normalizeCompoundName(name: string): string {
	const normalized = name.trim();
	return normalized || "Compound clip";
}

function cloneElement<T extends TimelineElement>(element: T): T {
	return {
		...element,
		...(element.compound
			? {
					compound: {
						...element.compound,
						children: element.compound.children.map((child) => ({
							...child,
							element: cloneElement(child.element),
						})),
					},
				}
			: {}),
	} as T;
}

function allTracks(tracks: SceneTracks): TimelineTrack[] {
	return [...tracks.overlay, tracks.main, ...tracks.audio];
}

function mapTracks(
	tracks: SceneTracks,
	update: (track: TimelineTrack) => TimelineTrack,
): SceneTracks {
	return {
		overlay: tracks.overlay.map((track) => update(track)) as SceneTracks["overlay"],
		main: update(tracks.main) as SceneTracks["main"],
		audio: tracks.audio.map(
			(track) => update(track) as SceneTracks["audio"][number],
		),
	};
}

function withElements(
	track: TimelineTrack,
	elements: TimelineElement[],
): TimelineTrack {
	return { ...track, elements } as TimelineTrack;
}

function sortElements(elements: TimelineElement[]): TimelineElement[] {
	return [...elements].sort(
		(first, second) =>
			(first.startTime as number) - (second.startTime as number),
	);
}
