import type { MouseEvent as ReactMouseEvent } from "react";
import { BASE_TIMELINE_PIXELS_PER_SECOND } from "@/timeline/scale";
import {
	addMediaTime,
	maxMediaTime,
	type MediaTime,
	mediaTime,
	minMediaTime,
	subMediaTime,
	TICKS_PER_SECOND,
	ZERO_MEDIA_TIME,
} from "@/wasm";
import {
	computeGroupResize,
	type GroupResizeMember,
	type GroupResizeResult,
	type GroupResizeUpdate,
	type ResizeSide,
} from "@/timeline/group-resize";
import {
	buildTimelineSnapPoints,
	getTimelineSnapThresholdInTicks,
	resolveTimelineSnap,
	type SnapPoint,
} from "@/timeline/snapping";
import { getElementEdgeSnapPoints } from "@/timeline/element-snap-source";
import { getPlayheadSnapPoints } from "@/timeline/playhead-snap-source";
import { getAnimationKeyframeSnapPointsForTimeline } from "@/timeline/animation-snap-points";
import {
	isRetimableElement,
	type SceneTracks,
	type TimelineElement,
	type TimelineTrack,
} from "@/timeline";
import type { ElementRef } from "@/timeline/types";
import type { FrameRate } from "opencut-wasm";
import {
	buildPrecisionTrimPlan,
	type PrecisionTrimMode,
} from "@/timeline/precision-trim";
import {
	buildResizeFeedback,
	buildRippleResizePreview,
	type DirectManipulationFeedback,
	type ResizePreviewUpdate,
} from "@/timeline/direct-manipulation-feedback";

// --- Session ---

interface ResizeSession {
	kind: "active";
	side: ResizeSide;
	startX: number;
	fps: FrameRate;
	mode: PrecisionTrimMode;
	trackId: string;
	elementId: string;
	members: GroupResizeMember[];
	result: GroupResizeResult | null;
	requestedDeltaTime: MediaTime;
	snapPoint: SnapPoint | null;
	rippleShiftedElementCount: number;
}

type Session = { kind: "idle" } | ResizeSession;

// --- Config ---

export interface ResizeConfig {
	zoomLevel: number;
	snappingEnabled: boolean;
	isShiftHeld: () => boolean;
	getSceneTracks: () => SceneTracks;
	getCurrentPlayheadTime: () => MediaTime;
	getActiveProjectFps: () => FrameRate | null;
	getTrimMode: () => PrecisionTrimMode;
	selectedElements: ElementRef[];
	discardPreview: () => void;
	previewElements: (updates: ResizePreviewUpdate[]) => void;
	commitElements: (updates: GroupResizeUpdate[]) => void;
	onSnapPointChange?: (snapPoint: SnapPoint | null) => void;
}

export interface ResizeConfigRef {
	readonly current: ResizeConfig;
}

export type ResizeView =
	| { readonly kind: "idle" }
	| {
			readonly kind: "resizing";
			readonly feedback: DirectManipulationFeedback;
			readonly mode: PrecisionTrimMode;
			readonly side: ResizeSide;
	  };

const IDLE_RESIZE_VIEW: ResizeView = { kind: "idle" };

// --- Pure helpers ---

export function buildResizeMembers({
	tracks,
	selectedElements,
}: {
	tracks: SceneTracks;
	selectedElements: ElementRef[];
}): GroupResizeMember[] {
	const selectedElementIds = new Set(
		selectedElements.map((el) => el.elementId),
	);
	const trackMap = new Map(
		[...tracks.overlay, tracks.main, ...tracks.audio].map((track) => [
			track.id,
			track,
		]),
	);

	return selectedElements.flatMap(({ trackId, elementId }) => {
		const track = trackMap.get(trackId);
		const element = track?.elements.find((el) => el.id === elementId);
		if (!track || !element) return [];

		const otherElements = track.elements.filter(
			(el) => !selectedElementIds.has(el.id),
		);
		const leftNeighborBound = otherElements
			.filter(
				(el) =>
					addMediaTime({ a: el.startTime, b: el.duration }) <=
					element.startTime,
			)
			.reduce<MediaTime | null>((bound, el) => {
				const elementEnd = addMediaTime({
					a: el.startTime,
					b: el.duration,
				});
				return bound === null
					? elementEnd
					: maxMediaTime({ a: bound, b: elementEnd });
			}, null);
		const rightNeighborBound = otherElements
			.filter(
				(el) =>
					el.startTime >= addMediaTime({ a: element.startTime, b: element.duration }),
			)
			.reduce<MediaTime | null>(
				(bound, el) =>
					bound === null
						? el.startTime
						: minMediaTime({ a: bound, b: el.startTime }),
				null,
			);

		return [
			{
				trackId,
				elementId,
				startTime: element.startTime,
				duration: element.duration,
				trimStart: element.trimStart,
				trimEnd: element.trimEnd,
				sourceDuration: element.sourceDuration,
				retime: isRetimableElement(element) ? element.retime : undefined,
				leftNeighborBound,
				rightNeighborBound,
			},
		];
	});
}

function hasResizeChanges({
	members,
	result,
}: {
	members: GroupResizeMember[];
	result: GroupResizeResult;
}): boolean {
	return result.updates.some((update) => {
		const member = members.find((m) => m.elementId === update.elementId);
		return (
			member?.trimStart !== update.patch.trimStart ||
			member?.trimEnd !== update.patch.trimEnd ||
			member?.startTime !== update.patch.startTime ||
			member?.duration !== update.patch.duration
		);
	});
}

// --- Controller ---

export class ResizeController {
	private session: Session = { kind: "idle" };
	private readonly subscribers = new Set<() => void>();
	private readonly configRef: ResizeConfigRef;

	constructor(deps: { configRef: ResizeConfigRef }) {
		this.configRef = deps.configRef;
		this.onResizeStart = this.onResizeStart.bind(this);
		this.handleMouseMove = this.handleMouseMove.bind(this);
		this.handleMouseUp = this.handleMouseUp.bind(this);
	}

	private get config(): ResizeConfig {
		return this.configRef.current;
	}

	get isResizing(): boolean {
		return this.session.kind === "active";
	}

	get view(): ResizeView {
		if (this.session.kind !== "active") return IDLE_RESIZE_VIEW;
		return {
			kind: "resizing",
			mode: this.session.mode,
			side: this.session.side,
			feedback: buildResizeFeedback({
				mode: this.session.mode,
				side: this.session.side,
				requestedDeltaTime: this.session.requestedDeltaTime,
				result: this.session.result,
				snapPoint: this.session.snapPoint,
				rippleShiftedElementCount: this.session.rippleShiftedElementCount,
			}),
		};
	}

	subscribe(fn: () => void): () => void {
		this.subscribers.add(fn);
		return () => this.subscribers.delete(fn);
	}

	cancel(): void {
		this.config.discardPreview();
		this.finishSession();
	}

	destroy(): void {
		this.deactivate();
		this.subscribers.clear();
	}

	onResizeStart({
		event,
		element,
		track,
		side,
	}: {
		event: ReactMouseEvent;
		element: TimelineElement;
		track: TimelineTrack;
		side: ResizeSide;
	}): void {
		event.stopPropagation();
		event.preventDefault();

		// UI should prevent this, but be explicit: a new resize start
		// means the previous one is abandoned, not silently replaced.
		if (this.session.kind === "active") this.cancel();

		const fps = this.config.getActiveProjectFps();
		if (!fps) return;

		const ref = { trackId: track.id, elementId: element.id };
		const activeSelection = this.config.selectedElements.some(
			(el) => el.trackId === track.id && el.elementId === element.id,
		)
			? this.config.selectedElements
			: [ref];

		const mode = this.config.getTrimMode();
		const members = buildResizeMembers({
			tracks: this.config.getSceneTracks(),
			selectedElements:
				mode === "standard" || mode === "ripple"
					? activeSelection
					: [ref],
		});
		if (members.length === 0) return;

		this.config.discardPreview();

		this.session = {
			kind: "active",
			side,
			startX: event.clientX,
			fps,
			mode,
			trackId: track.id,
			elementId: element.id,
			members,
			result: null,
			requestedDeltaTime: ZERO_MEDIA_TIME,
			snapPoint: null,
			rippleShiftedElementCount: 0,
		};
		this.activate();
		this.notify();
	}

	private activate(): void {
		document.addEventListener("mousemove", this.handleMouseMove);
		document.addEventListener("mouseup", this.handleMouseUp);
	}

	private deactivate(): void {
		document.removeEventListener("mousemove", this.handleMouseMove);
		document.removeEventListener("mouseup", this.handleMouseUp);
	}

	private notify(): void {
		for (const fn of this.subscribers) fn();
	}

	private finishSession(): void {
		this.session = { kind: "idle" };
		this.deactivate();
		this.config.onSnapPointChange?.(null);
		this.notify();
	}

	private snappedDelta({
		session,
		rawDeltaTime,
	}: {
		session: ResizeSession;
		rawDeltaTime: MediaTime;
	}): MediaTime {
		const { snappingEnabled, isShiftHeld, zoomLevel } = this.config;

		if (!snappingEnabled || isShiftHeld()) {
			this.config.onSnapPointChange?.(null);
			session.snapPoint = null;
			return rawDeltaTime;
		}

		const tracks = this.config.getSceneTracks();
		const playheadTime = this.config.getCurrentPlayheadTime();
		const excludeElementIds = new Set(session.members.map((m) => m.elementId));

		const snapPoints = buildTimelineSnapPoints({
			sources: [
				() => getElementEdgeSnapPoints({ tracks, excludeElementIds }),
				() => getPlayheadSnapPoints({ playheadTime }),
				() =>
					getAnimationKeyframeSnapPointsForTimeline({
						tracks,
						excludeElementIds,
					}),
			],
		});
		const maxSnapDistance = getTimelineSnapThresholdInTicks({ zoomLevel });

		let closestSnapPoint: SnapPoint | null = null;
		let closestSnapDistance = Infinity;
		let deltaTime = rawDeltaTime;

		for (const member of session.members) {
			const baseEdgeTime =
				session.side === "left"
					? member.startTime
					: addMediaTime({ a: member.startTime, b: member.duration });
			const snapResult = resolveTimelineSnap({
				targetTime: addMediaTime({ a: baseEdgeTime, b: rawDeltaTime }),
				snapPoints,
				maxSnapDistance,
			});
			if (
				snapResult.snapPoint &&
				snapResult.snapDistance < closestSnapDistance
			) {
				closestSnapDistance = snapResult.snapDistance;
				closestSnapPoint = snapResult.snapPoint;
				deltaTime = subMediaTime({ a: snapResult.snappedTime, b: baseEdgeTime });
			}
		}

		this.config.onSnapPointChange?.(closestSnapPoint);
		session.snapPoint = closestSnapPoint;
		return deltaTime;
	}

	private handleMouseMove({ clientX }: MouseEvent): void {
		if (this.session.kind !== "active") return;
		const session = this.session;

		const rawDeltaTime = mediaTime({
			ticks: Math.round(
				((clientX - session.startX) /
					(BASE_TIMELINE_PIXELS_PER_SECOND * this.config.zoomLevel)) *
					TICKS_PER_SECOND,
			),
		});
		const deltaTime =
			session.mode === "slip"
				? rawDeltaTime
				: this.snappedDelta({ session, rawDeltaTime });
		if (session.mode === "slip") {
			this.config.onSnapPointChange?.(null);
			session.snapPoint = null;
		}
		const result =
			session.mode === "standard" || session.mode === "ripple"
				? computeGroupResize({
						members: session.members,
						side: session.side,
						deltaTime,
						fps: session.fps,
					})
				: this.buildPrecisionResult({ session, deltaTime });

		session.result = result;
		session.requestedDeltaTime = rawDeltaTime;
		const preview =
			session.mode === "ripple"
				? buildRippleResizePreview({
						tracks: this.config.getSceneTracks(),
						updates: result.updates,
					})
				: {
						updates: result.updates,
						shiftedElementCount: 0,
						totalShift: ZERO_MEDIA_TIME,
					};
		session.rippleShiftedElementCount = preview.shiftedElementCount;
		this.config.previewElements(preview.updates);
	}

	private buildPrecisionResult({
		session,
		deltaTime,
	}: {
		session: ResizeSession;
		deltaTime: MediaTime;
	}): GroupResizeResult {
		const tracks = this.config.getSceneTracks();
		const track = [
			...tracks.overlay,
			tracks.main,
			...tracks.audio,
		].find((candidate) => candidate.id === session.trackId);
		if (!track) {
			return { deltaTime: mediaTime({ ticks: 0 }), updates: [] };
		}
		const plan = buildPrecisionTrimPlan({
			mode: session.mode,
			side: session.side,
			trackId: session.trackId,
			elementId: session.elementId,
			elements: track.elements.map((element) => ({
				...element,
				retime: isRetimableElement(element) ? element.retime : undefined,
			})),
			deltaTime,
			fps: session.fps,
		});
		return {
			deltaTime: plan.appliedDelta,
			updates: plan.updates,
		};
	}

	private handleMouseUp(): void {
		if (this.session.kind !== "active") return;
		const session = this.session;

		this.config.discardPreview();

		if (
			session.result &&
			hasResizeChanges({ members: session.members, result: session.result })
		) {
			this.config.commitElements(session.result.updates);
		}

		this.finishSession();
	}
}
