import type { Bookmark } from "@/timeline/types";
import type { MediaTime } from "@/wasm";

interface MarkerElement {
	id: string;
	name: string;
	startTime: MediaTime;
	duration: MediaTime;
}

export function createTimelineMarker({
	id,
	time,
	name,
}: {
	id: string;
	time: MediaTime;
	name: string;
}): Bookmark {
	return {
		id,
		time,
		name,
		scope: "timeline",
	};
}

export function createClipMarker({
	id,
	trackId,
	element,
}: {
	id: string;
	trackId: string;
	element: MarkerElement;
}): Bookmark {
	return {
		id,
		time: element.startTime,
		duration: element.duration,
		name: element.name,
		scope: "clip",
		trackId,
		elementId: element.id,
	};
}

export function getAdjacentMarker({
	markers,
	time,
	direction,
}: {
	markers: Bookmark[];
	time: MediaTime;
	direction: "previous" | "next";
}): Bookmark | null {
	const ordered = [...markers].sort((left, right) => left.time - right.time);
	if (direction === "previous") {
		return [...ordered].reverse().find((marker) => marker.time < time) ?? null;
	}
	return ordered.find((marker) => marker.time > time) ?? null;
}

export function resolveMarkerAddress({
	markers,
	markerId,
	time,
}: {
	markers: Bookmark[];
	markerId?: string | null;
	time?: MediaTime | null;
}): Bookmark | null {
	if (markerId) {
		return markers.find((marker) => marker.id === markerId) ?? null;
	}
	if (time == null) return null;
	return markers.find((marker) => marker.time === time) ?? null;
}
