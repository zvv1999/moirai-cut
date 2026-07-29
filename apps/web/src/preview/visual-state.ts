import type { MediaTime } from "@/wasm";
import type { TimelineTrack } from "@/timeline/types";

const VISUAL_TYPES = new Set(["video", "image", "text", "sticker", "graphic"]);

function isMediaTime(value: number): value is MediaTime {
	return Number.isInteger(value);
}

function addMediaTimes({ a, b }: { a: MediaTime; b: MediaTime }): MediaTime {
	const result = a + b;
	if (!isMediaTime(result)) {
		throw new Error(`Expected integer media time, received ${result}`);
	}
	return result;
}

export type PreviewVisualState =
	| {
			kind: "visible" | "before" | "gap" | "after";
			firstVisualTime: MediaTime;
			lastVisualTime: MediaTime;
	  }
	| {
			kind: "no-visuals";
			firstVisualTime: null;
			lastVisualTime: null;
	  };

export function getPreviewVisualState({
	tracks,
	time,
}: {
	tracks: readonly TimelineTrack[];
	time: MediaTime;
}): PreviewVisualState {
	const visualElements = tracks.flatMap((track) => {
		if (track.type === "audio" || track.hidden) {
			return [];
		}
		return track.elements.filter((element) => VISUAL_TYPES.has(element.type));
	});

	if (visualElements.length === 0) {
		return {
			kind: "no-visuals",
			firstVisualTime: null,
			lastVisualTime: null,
		};
	}

	const firstVisualTime = visualElements.reduce(
		(first, element) =>
			first < element.startTime ? first : element.startTime,
		visualElements[0].startTime,
	);
	const lastVisualTime = visualElements.reduce((last, element) => {
		const endTime = addMediaTimes({
			a: element.startTime,
			b: element.duration,
		});
		return last > endTime ? last : endTime;
	}, firstVisualTime);
	const hasActiveVisual = visualElements.some((element) => {
		const endTime = addMediaTimes({
			a: element.startTime,
			b: element.duration,
		});
		return time >= element.startTime && time < endTime;
	});

	if (hasActiveVisual) {
		return { kind: "visible", firstVisualTime, lastVisualTime };
	}
	if (time < firstVisualTime) {
		return { kind: "before", firstVisualTime, lastVisualTime };
	}
	if (time >= lastVisualTime) {
		return { kind: "after", firstVisualTime, lastVisualTime };
	}
	return { kind: "gap", firstVisualTime, lastVisualTime };
}
