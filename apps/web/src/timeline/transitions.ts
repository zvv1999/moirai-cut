import type {
	ElementRef,
	OverlayTrack,
	SceneTracks,
	TimelineElement,
	TimelineTrack,
	TimelineTransition,
	TimelineTransitionType,
	TrackType,
} from "@/timeline/types";
import type {
	ElementAnimations,
	ScalarAnimationKey,
	ScalarChannel,
} from "@/animation/types";
import type { MediaTime } from "@/wasm";

const TRANSITION_KEY_PREFIX = "transition:";

export type TimelineTransitionPlan =
	| {
			available: true;
			action: "add" | "edit";
			from: ElementRef;
			to: ElementRef;
			maxDuration: MediaTime;
			transition?: TimelineTransition;
	  }
	| {
			available: false;
			action: "add";
			reason: string;
	  };

interface LocatedElement {
	track: TimelineTrack;
	element: TimelineElement;
}

const VISUAL_TYPES = new Set<TimelineElement["type"]>([
	"video",
	"image",
	"text",
	"sticker",
	"graphic",
]);

export function planTimelineTransition({
	tracks,
	selection,
	duration,
}: {
	tracks: SceneTracks;
	selection: ElementRef[];
	duration: MediaTime;
}): TimelineTransitionPlan {
	const selected = selection.flatMap((ref) => {
		const located = locateElement({ tracks, ref });
		return located ? [{ ref, ...located }] : [];
	});
	const existing = selected.find(({ element }) => element.transitionIn);
	if (existing?.element.transitionIn) {
		const transition = existing.element.transitionIn;
		return {
			available: true,
			action: "edit",
			from: transition.from,
			to: existing.ref,
			maxDuration: getMaximumDuration({
				from: locateElement({ tracks, ref: transition.from })?.element,
				to: existing.element,
			}),
			transition,
		};
	}

	if (selected.length !== 2) {
		return unavailable("Select two adjacent visual clips");
	}
	if (selected.some(({ element }) => !VISUAL_TYPES.has(element.type))) {
		return unavailable("Transitions require two visual clips");
	}
	if (selected[0].track.id !== selected[1].track.id) {
		return unavailable("Selected clips must share the same track");
	}

	const [from, to] = [...selected].sort(
		(first, second) =>
			(first.element.startTime as number) - (second.element.startTime as number),
	);
	const fromEnd =
		(from.element.startTime as number) + (from.element.duration as number);
	if (fromEnd !== (to.element.startTime as number)) {
		return unavailable("Selected clips must share one edit point without a gap");
	}
	const maxDuration = getMaximumDuration({
		from: from.element,
		to: to.element,
	});
	if (
		(duration as number) <= 0 ||
		(duration as number) >= (maxDuration as number)
	) {
		return unavailable("Transition duration exceeds the available clip handles");
	}

	return {
		available: true,
		action: "add",
		from: from.ref,
		to: to.ref,
		maxDuration,
	};
}

export function applyTimelineTransition({
	tracks,
	from,
	to,
	type,
	duration,
	transitionId,
	overlayTrackId,
}: {
	tracks: SceneTracks;
	from: ElementRef;
	to: ElementRef;
	type: TimelineTransitionType;
	duration: MediaTime;
	transitionId: string;
	overlayTrackId: string;
}): SceneTracks {
	const selectedIncoming = locateElement({ tracks, ref: to })?.element;
	const existingTransition = selectedIncoming?.transitionIn;
	const baseTracks = existingTransition
		? removeTimelineTransition({
				tracks,
				transitionId: existingTransition.id,
			})
		: cloneTracks(tracks);
	const restoredTo = existingTransition
		? {
				trackId: existingTransition.originalTrackId,
				elementId: to.elementId,
			}
		: to;
	const plan = planTimelineTransition({
		tracks: baseTracks,
		selection: [from, restoredTo],
		duration,
	});
	if (!plan.available) {
		throw new Error(plan.reason);
	}

	const outgoing = locateElement({ tracks: baseTracks, ref: plan.from });
	const incoming = locateElement({ tracks: baseTracks, ref: plan.to });
	if (!outgoing || !incoming) {
		throw new Error("Transition clips could not be resolved");
	}
	if (outgoing.track.locked || incoming.track.locked) {
		throw new Error("Unlock both tracks before adding a transition");
	}

	const incomingStart =
		((incoming.element.startTime as number) - (duration as number)) as MediaTime;
	const targetType = getTrackTypeForTransition(incoming.element);
	const existingLane = baseTracks.overlay.find(
		(track) =>
			track.type === targetType &&
			trackHasRoom({
				track,
				elementId: incoming.element.id,
				startTime: incomingStart,
				duration: incoming.element.duration,
			}),
	);
	const targetLaneId = existingLane?.id ?? overlayTrackId;
	const createdOverlayTrack = !existingLane;
	const transition: TimelineTransition = {
		id: transitionId,
		type,
		duration,
		from: plan.from,
		originalTrackId: incoming.track.id,
		originalStartTime: incoming.element.startTime,
		createdOverlayTrack,
	};

	let nextTracks = mapTracks(baseTracks, (track) =>
		withElements(
			track,
			track.elements
			.filter((element) => element.id !== incoming.element.id)
			.map((element) =>
				element.id === outgoing.element.id
					? applyOutgoingTransitionKeys({
							element,
							transition,
						})
					: element,
				),
		),
	);
	const transitionedIncoming = applyIncomingTransitionKeys({
		element: {
			...incoming.element,
			startTime: incomingStart,
			transitionIn: transition,
		},
		transition,
	});

	if (existingLane) {
		nextTracks = mapTracks(nextTracks, (track) =>
			track.id === targetLaneId
				? withElements(
						track,
						sortElements([
							...track.elements,
							transitionedIncoming,
						]),
					)
				: track,
		);
	} else {
		const lane = buildTransitionTrack({
			id: targetLaneId,
			type: targetType,
			element: transitionedIncoming,
		});
		nextTracks = {
			...nextTracks,
			overlay: [lane, ...nextTracks.overlay],
		};
	}

	return nextTracks;
}

export function removeTimelineTransition({
	tracks,
	transitionId,
}: {
	tracks: SceneTracks;
	transitionId: string;
}): SceneTracks {
	const located = allTracks(tracks)
		.flatMap((track) =>
			track.elements.map((element) => ({ track, element })),
		)
		.find(({ element }) => element.transitionIn?.id === transitionId);
	if (!located?.element.transitionIn) {
		throw new Error(`Transition ${transitionId} was not found`);
	}
	const transition = located.element.transitionIn;
	const restoredIncoming = {
		...removeTransitionKeys({
			element: located.element,
			transitionId,
		}),
		startTime: transition.originalStartTime,
		transitionIn: undefined,
	} as TimelineElement;

	let nextTracks = mapTracks(cloneTracks(tracks), (track) =>
		withElements(
			track,
			track.elements
			.filter((element) => element.id !== located.element.id)
			.map((element) =>
				element.id === transition.from.elementId
					? removeTransitionKeys({ element, transitionId })
					: element,
				),
		),
	);
	nextTracks = mapTracks(nextTracks, (track) =>
		track.id === transition.originalTrackId
			? withElements(
					track,
					sortElements([...track.elements, restoredIncoming]),
				)
			: track,
	);
	if (transition.createdOverlayTrack) {
		nextTracks = {
			...nextTracks,
			overlay: nextTracks.overlay.filter(
				(track) => track.id !== located.track.id || track.elements.length > 0,
			),
		};
	}
	return nextTracks;
}

function unavailable(reason: string): TimelineTransitionPlan {
	return { available: false, action: "add", reason };
}

function getMaximumDuration({
	from,
	to,
}: {
	from?: TimelineElement;
	to?: TimelineElement;
}): MediaTime {
	return Math.min(
		(from?.duration as number | undefined) ?? 0,
		(to?.duration as number | undefined) ?? 0,
	) as MediaTime;
}

function locateElement({
	tracks,
	ref,
}: {
	tracks: SceneTracks;
	ref: ElementRef;
}): LocatedElement | null {
	const track = allTracks(tracks).find((candidate) => candidate.id === ref.trackId);
	const element = track?.elements.find(
		(candidate) => candidate.id === ref.elementId,
	);
	return track && element ? { track, element } : null;
}

function allTracks(tracks: SceneTracks): TimelineTrack[] {
	return [...tracks.overlay, tracks.main, ...tracks.audio];
}

function cloneTracks(tracks: SceneTracks): SceneTracks {
	return {
		overlay: tracks.overlay.map((track) => ({
			...track,
			elements: track.elements.map((element) => ({ ...element })),
		})) as OverlayTrack[],
		main: {
			...tracks.main,
			elements: tracks.main.elements.map((element) => ({ ...element })),
		},
		audio: tracks.audio.map((track) => ({
			...track,
			elements: track.elements.map((element) => ({ ...element })),
		})),
	};
}

function mapTracks(
	tracks: SceneTracks,
	update: (track: TimelineTrack) => TimelineTrack,
): SceneTracks {
	return {
		overlay: tracks.overlay.map((track) => update(track)) as OverlayTrack[],
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

function getTrackTypeForTransition(element: TimelineElement): Exclude<
	TrackType,
	"audio"
> {
	if (element.type === "video" || element.type === "image") return "video";
	if (element.type === "text") return "text";
	if (element.type === "sticker" || element.type === "graphic") return "graphic";
	throw new Error("Transitions require a visual incoming clip");
}

function trackHasRoom({
	track,
	elementId,
	startTime,
	duration,
}: {
	track: OverlayTrack;
	elementId: string;
	startTime: MediaTime;
	duration: MediaTime;
}): boolean {
	const end = (startTime as number) + (duration as number);
	return !track.elements.some((element) => {
		if (element.id === elementId) return false;
		const elementEnd =
			(element.startTime as number) + (element.duration as number);
		return (startTime as number) < elementEnd && end > (element.startTime as number);
	});
}

function buildTransitionTrack({
	id,
	type,
	element,
}: {
	id: string;
	type: Exclude<TrackType, "audio">;
	element: TimelineElement;
}): OverlayTrack {
	const base = {
		id,
		name: "Transitions",
		locked: false,
		elements: [element],
	};
	if (type === "video") {
		return { ...base, type, muted: false, hidden: false } as OverlayTrack;
	}
	return { ...base, type, hidden: false } as OverlayTrack;
}

function applyIncomingTransitionKeys({
	element,
	transition,
}: {
	element: TimelineElement;
	transition: TimelineTransition;
}): TimelineElement {
	const half = Math.round((transition.duration as number) / 2) as MediaTime;
	const keys =
		transition.type === "fade-through-black"
			? [
					makeKey({ id: `${keyPrefix(transition.id)}in-0`, time: 0, value: 0 }),
					makeKey({
						id: `${keyPrefix(transition.id)}in-half`,
						time: half,
						value: 0,
					}),
					makeKey({
						id: `${keyPrefix(transition.id)}in-end`,
						time: transition.duration,
						value: 1,
					}),
				]
			: [
					makeKey({ id: `${keyPrefix(transition.id)}in-0`, time: 0, value: 0 }),
					makeKey({
						id: `${keyPrefix(transition.id)}in-end`,
						time: transition.duration,
						value: 1,
					}),
				];
	return setTransitionKeys({ element, transitionId: transition.id, keys });
}

function applyOutgoingTransitionKeys({
	element,
	transition,
}: {
	element: TimelineElement;
	transition: TimelineTransition;
}): TimelineElement {
	if (transition.type !== "fade-through-black") {
		return removeTransitionKeys({ element, transitionId: transition.id });
	}
	const transitionStart =
		((element.duration as number) - (transition.duration as number)) as MediaTime;
	const half =
		((transitionStart as number) +
			Math.round((transition.duration as number) / 2)) as MediaTime;
	return setTransitionKeys({
		element,
		transitionId: transition.id,
		keys: [
			makeKey({
				id: `${keyPrefix(transition.id)}out-start`,
				time: transitionStart,
				value: 1,
			}),
			makeKey({
				id: `${keyPrefix(transition.id)}out-half`,
				time: half,
				value: 0,
			}),
		],
	});
}

function keyPrefix(transitionId: string): string {
	return `${TRANSITION_KEY_PREFIX}${transitionId}:`;
}

function makeKey({
	id,
	time,
	value,
}: {
	id: string;
	time: MediaTime | 0;
	value: number;
}): ScalarAnimationKey {
	return {
		id,
		time: time as MediaTime,
		value,
		segmentToNext: "linear",
		tangentMode: "flat",
	};
}

function setTransitionKeys({
	element,
	transitionId,
	keys,
}: {
	element: TimelineElement;
	transitionId: string;
	keys: ScalarAnimationKey[];
}): TimelineElement {
	const animations = removeTransitionKeys({
		element,
		transitionId,
	}).animations;
	const opacity = animations?.opacity;
	const existingKeys =
		opacity && "keys" in opacity
			? (opacity as ScalarChannel).keys
			: [];
	return {
		...element,
		animations: {
			...animations,
			opacity: {
				...(opacity && "keys" in opacity ? opacity : {}),
				keys: [...existingKeys, ...keys].sort(
					(first, second) =>
						(first.time as number) - (second.time as number),
				),
			},
		},
	};
}

function removeTransitionKeys({
	element,
	transitionId,
}: {
	element: TimelineElement;
	transitionId: string;
}): TimelineElement {
	const opacity = element.animations?.opacity;
	if (!opacity || !("keys" in opacity)) return element;
	const keys = (opacity as ScalarChannel).keys.filter(
		(key) => !key.id.startsWith(keyPrefix(transitionId)),
	);
	const animations: ElementAnimations = {
		...element.animations,
		opacity: keys.length > 0 ? { ...opacity, keys } : undefined,
	};
	return { ...element, animations };
}

function sortElements(elements: TimelineElement[]): TimelineElement[] {
	return [...elements].sort(
		(first, second) =>
			(first.startTime as number) - (second.startTime as number),
	);
}
