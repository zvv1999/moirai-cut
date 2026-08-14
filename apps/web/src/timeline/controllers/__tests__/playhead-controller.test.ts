import { describe, expect, test } from "bun:test";
import {
	PlayheadController,
	type PlayheadConfigRef,
} from "@/timeline/controllers/playhead-controller";
import type { SceneTracks } from "@/timeline";
import { mediaTime } from "@/wasm";

const SECOND = 120_000;

const emptyTracks: SceneTracks = {
	overlay: [],
	main: {
		id: "main",
		name: "Main",
		type: "video",
		muted: false,
		hidden: false,
		elements: [],
	},
	audio: [],
};

describe("PlayheadController", () => {
	test("honors global and Shift bypasses while retaining frame snapping", () => {
		const seeks: number[] = [];
		let shiftHeld = false;
		const ruler = {
			getBoundingClientRect: () => ({ left: 0 }),
		} as HTMLDivElement;
		const configRef: PlayheadConfigRef = {
			current: {
				zoomLevel: 1,
				duration: mediaTime({ ticks: 10 * SECOND }),
				snappingEnabled: false,
				getActiveProjectFps: () => ({ numerator: 30, denominator: 1 }),
				isShiftHeld: () => shiftHeld,
				getIsPlaying: () => false,
				getRulerEl: () => ruler,
				getRulerScrollEl: () => null,
				getTracksScrollEl: () => null,
				getPlayheadEl: () => null,
				getSceneTracks: () => emptyTracks,
				getSceneBookmarks: () => [
					{ id: "nearby-marker", time: mediaTime({ ticks: SECOND }) },
				],
				seek: (time) => seeks.push(time),
				setScrubbing: () => {},
				setTimelineViewState: () => {},
			},
		};
		const controller = new PlayheadController({ configRef });
		const scrubController = controller as unknown as {
			scrub: (input: {
				event: { clientX: number };
				isElementSnappingEnabled: boolean;
			}) => void;
		};
		const scrub = () =>
			scrubController.scrub({
				event: { clientX: 51 },
				isElementSnappingEnabled: true,
			});

		scrub();

		// 51 px = 1.02 s. At 30 fps that is 124,000 ticks; the marker is 120,000.
		expect(seeks).toEqual([124_000]);

		configRef.current.snappingEnabled = true;
		scrub();
		expect(seeks).toEqual([124_000, 120_000]);

		shiftHeld = true;
		scrub();
		expect(seeks).toEqual([124_000, 120_000, 124_000]);
	});
});
