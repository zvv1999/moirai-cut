import { describe, expect, test } from "bun:test";
import type { SceneTracks } from "@/timeline";
import type { ScalarChannel } from "@/animation/types";
import type { MediaTime } from "@/wasm";
import {
	applyTimelineTransition,
	planTimelineTransition,
	removeTimelineTransition,
} from "@/timeline/transitions";

const TICKS_PER_SECOND = 120_000;
const mt = (value: number) => value as MediaTime;

function makeTracks(): SceneTracks {
	const tracks = {
		overlay: [],
		main: {
			id: "main",
			name: "Main",
			type: "video",
			muted: false,
			hidden: false,
			elements: [
				{
					id: "outgoing",
					name: "Outgoing",
					type: "video",
					mediaId: "media-a",
					startTime: 0,
					duration: 4 * TICKS_PER_SECOND,
					trimStart: 0,
					trimEnd: 0,
					params: { opacity: 1 },
					animations: {
						opacity: {
							keys: [
								{
									id: "user-opacity-key",
									time: TICKS_PER_SECOND,
									value: 0.8,
									segmentToNext: "linear",
									tangentMode: "flat",
								},
							],
						},
					},
				},
				{
					id: "incoming",
					name: "Incoming",
					type: "image",
					mediaId: "media-b",
					startTime: 4 * TICKS_PER_SECOND,
					duration: 4 * TICKS_PER_SECOND,
					trimStart: 0,
					trimEnd: 0,
					params: { opacity: 1 },
				},
			],
		},
		audio: [],
	};
	return tracks as unknown as SceneTracks;
}

describe("timeline transitions", () => {
	test("plans an addressable transition for two adjacent visual clips", () => {
		const result = planTimelineTransition({
			tracks: makeTracks(),
			selection: [
				{ trackId: "main", elementId: "outgoing" },
				{ trackId: "main", elementId: "incoming" },
			],
			duration: mt(60_000),
		});

		expect(result).toMatchObject({
			available: true,
			action: "add",
			from: { trackId: "main", elementId: "outgoing" },
			to: { trackId: "main", elementId: "incoming" },
			maxDuration: 480_000,
		});
	});

	test("explains invalid gaps and oversized overlaps before mutation", () => {
		const tracks = makeTracks();
		tracks.main.elements[1].startTime = mt(5 * TICKS_PER_SECOND);
		expect(
			planTimelineTransition({
				tracks,
				selection: [
					{ trackId: "main", elementId: "outgoing" },
					{ trackId: "main", elementId: "incoming" },
				],
				duration: mt(60_000),
			}),
		).toEqual({
			available: false,
			action: "add",
			reason: "所选素材必须首尾相接，共用一个剪辑点",
		});

		expect(
			planTimelineTransition({
				tracks: makeTracks(),
				selection: [
					{ trackId: "main", elementId: "outgoing" },
					{ trackId: "main", elementId: "incoming" },
				],
				duration: mt(600_000),
			}),
		).toMatchObject({
			available: false,
			reason: "转场时长超出了素材可用余量",
		});
	});

	test("adds a real cross dissolve on an overlay lane with stable metadata", () => {
		const result = applyTimelineTransition({
			tracks: makeTracks(),
			from: { trackId: "main", elementId: "outgoing" },
			to: { trackId: "main", elementId: "incoming" },
			type: "cross-dissolve",
			duration: mt(60_000),
			transitionId: "transition-1",
			overlayTrackId: "transition-lane",
		});

		expect(result.main.elements.map((element) => element.id)).toEqual([
			"outgoing",
		]);
		expect(result.overlay[0]).toMatchObject({
			id: "transition-lane",
			type: "video",
			elements: [
				{
					id: "incoming",
					startTime: 420_000,
					transitionIn: {
						id: "transition-1",
						type: "cross-dissolve",
						duration: 60_000,
						from: { trackId: "main", elementId: "outgoing" },
						originalTrackId: "main",
						originalStartTime: 480_000,
					},
				},
			],
		});
		expect(result.overlay[0].elements[0].animations?.opacity).toMatchObject({
			keys: [
				expect.objectContaining({ time: 0, value: 0 }),
				expect.objectContaining({ time: 60_000, value: 1 }),
			],
		});
	});

	test("replaces the transition and removes only its own keys before restoring the cut", () => {
		const original = makeTracks();
		const dissolved = applyTimelineTransition({
			tracks: original,
			from: { trackId: "main", elementId: "outgoing" },
			to: { trackId: "main", elementId: "incoming" },
			type: "cross-dissolve",
			duration: mt(60_000),
			transitionId: "transition-1",
			overlayTrackId: "transition-lane",
		});
		const replaced = applyTimelineTransition({
			tracks: dissolved,
			from: { trackId: "main", elementId: "outgoing" },
			to: { trackId: "transition-lane", elementId: "incoming" },
			type: "fade-through-black",
			duration: mt(96_000),
			transitionId: "transition-1",
			overlayTrackId: "transition-lane",
		});

		expect(replaced.overlay[0].elements[0].transitionIn).toMatchObject({
			type: "fade-through-black",
			duration: 96_000,
		});

		const restored = removeTimelineTransition({
			tracks: replaced,
			transitionId: "transition-1",
		});
		expect(restored.overlay).toEqual([]);
		expect(restored.main.elements.map((element) => element.id)).toEqual([
			"outgoing",
			"incoming",
		]);
		expect(restored.main.elements[1]).toMatchObject({
			startTime: 480_000,
			transitionIn: undefined,
		});
		const opacity = restored.main.elements[0].animations
			?.opacity as ScalarChannel | undefined;
		expect(opacity?.keys.map((key) => key.id)).toEqual(["user-opacity-key"]);
	});
});
