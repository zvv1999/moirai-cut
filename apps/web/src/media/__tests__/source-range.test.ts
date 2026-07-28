import { describe, expect, test } from "bun:test";
import {
	buildElementFromSourceRange,
	getDefaultSourceRange,
	resolveSourceOverwriteTarget,
	updateSourceRangePoint,
} from "@/media/source-range";
import type { MediaAsset } from "@/media/types";
import type { SceneTracks } from "@/timeline";
import { mediaTimeFromSeconds } from "@/wasm";

function asset({
	type = "video",
	duration = 12,
}: {
	type?: MediaAsset["type"];
	duration?: number;
} = {}): MediaAsset {
	return {
		id: "source",
		name: "Source.mov",
		type,
		duration,
		file: new File([], "Source.mov"),
		url: "blob:source",
	};
}

function tracks(): SceneTracks {
	return {
		overlay: [],
		main: {
			id: "main",
			name: "Main",
			type: "video",
			elements: [],
			muted: false,
			hidden: false,
		},
		audio: [
			{
				id: "audio",
				name: "Audio",
				type: "audio",
				elements: [],
				muted: false,
			},
		],
	};
}

describe("source media ranges", () => {
	test("defaults to the whole source and keeps crossed point edits valid", () => {
		const initial = getDefaultSourceRange({ asset: asset() });
		expect(initial).toEqual({ inPoint: 0, outPoint: 12 });

		const movedIn = updateSourceRangePoint({
			range: initial,
			point: "in",
			time: 10,
			duration: 12,
		});
		expect(movedIn).toEqual({ inPoint: 10, outPoint: 12 });

		const crossedOut = updateSourceRangePoint({
			range: movedIn,
			point: "out",
			time: 4,
			duration: 12,
		});
		expect(crossedOut.inPoint).toBeLessThan(crossedOut.outPoint);
		expect(crossedOut.outPoint).toBe(4);
	});

	test("builds a trimmed source clip with the original source duration", () => {
		const element = buildElementFromSourceRange({
			asset: asset(),
			range: { inPoint: 2.25, outPoint: 7.75 },
			startTime: mediaTimeFromSeconds({ seconds: 9 }),
		});

		expect(element.type).toBe("video");
		expect(element.startTime).toBe(mediaTimeFromSeconds({ seconds: 9 }));
		expect(element.duration).toBe(mediaTimeFromSeconds({ seconds: 5.5 }));
		expect(element.trimStart).toBe(mediaTimeFromSeconds({ seconds: 2.25 }));
		expect(element.trimEnd).toBe(mediaTimeFromSeconds({ seconds: 4.25 }));
		expect(element.sourceDuration).toBe(
			mediaTimeFromSeconds({ seconds: 12 }),
		);
	});

	test("chooses a compatible selected track, then a safe default", () => {
		const sceneTracks = tracks();
		expect(
			resolveSourceOverwriteTarget({
				tracks: sceneTracks,
				selectedElements: [{ trackId: "audio", elementId: "clip" }],
				mediaType: "audio",
			}),
		).toEqual({ trackId: "audio", reason: null });
		expect(
			resolveSourceOverwriteTarget({
				tracks: sceneTracks,
				selectedElements: [],
				mediaType: "video",
			}),
		).toEqual({ trackId: "main", reason: null });

		sceneTracks.main.locked = true;
		expect(
			resolveSourceOverwriteTarget({
				tracks: sceneTracks,
				selectedElements: [],
				mediaType: "video",
			}),
		).toEqual({
			trackId: null,
			reason: "Unlock a video track before overwriting",
		});
	});
});
