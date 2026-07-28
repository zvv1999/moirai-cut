import { describe, expect, test } from "bun:test";
import type { SceneTracks } from "@/timeline";
import { mediaTime } from "@/wasm";
import {
	breakApartCompoundClip,
	createCompoundClip,
	expandCompoundElements,
	planCompoundClip,
	updateCompoundChild,
} from "@/timeline/compound-clips";

const S = 120_000;
const mt = (value: number) => mediaTime({ ticks: value });

function makeTracks(): SceneTracks {
	return {
		overlay: [],
		main: {
			id: "main",
			name: "Main",
			type: "video",
			muted: false,
			hidden: false,
			elements: [
				{
					id: "clip-a",
					name: "Arrival",
					type: "video",
					mediaId: "media-a",
					startTime: mt(2 * S),
					duration: mt(2 * S),
					trimStart: mt(0),
					trimEnd: mt(0),
					params: {},
				},
				{
					id: "clip-b",
					name: "Detail",
					type: "image",
					mediaId: "media-b",
					startTime: mt(4 * S),
					duration: mt(3 * S),
					trimStart: mt(0),
					trimEnd: mt(0),
					params: {},
				},
			],
		},
		audio: [],
	} as SceneTracks;
}

describe("compound clips", () => {
	test("plans a chronological same-track nested sequence", () => {
		expect(
			planCompoundClip({
				tracks: makeTracks(),
				selection: [
					{ trackId: "main", elementId: "clip-b" },
					{ trackId: "main", elementId: "clip-a" },
				],
			}),
		).toMatchObject({
			available: true,
			trackId: "main",
			startTime: 2 * S,
			duration: 5 * S,
			elementIds: ["clip-a", "clip-b"],
		});
	});

	test("refuses cross-track or non-visual selections before mutation", () => {
		const tracks = makeTracks();
		tracks.audio.push({
			id: "audio",
			name: "Audio",
			type: "audio",
			muted: false,
			elements: [
				{
					id: "music",
					name: "Music",
					type: "audio",
					sourceType: "upload",
					mediaId: "music",
					startTime: mt(0),
					duration: mt(S),
					trimStart: mt(0),
					trimEnd: mt(0),
					params: {},
				},
			],
		});
		expect(
			planCompoundClip({
				tracks,
				selection: [
					{ trackId: "main", elementId: "clip-a" },
					{ trackId: "audio", elementId: "music" },
				],
			}),
		).toEqual({
			available: false,
			reason: "Compound clips require visual clips on one track",
		});
	});

	test("creates one container and expands children at their relative times", () => {
		const created = createCompoundClip({
			tracks: makeTracks(),
			selection: [
				{ trackId: "main", elementId: "clip-a" },
				{ trackId: "main", elementId: "clip-b" },
			],
			compoundId: "compound-1",
			name: "Opening ritual",
		});
		expect(created.main.elements).toHaveLength(1);
		expect(created.main.elements[0]).toMatchObject({
			id: "compound-1",
			name: "Opening ritual",
			startTime: 2 * S,
			duration: 5 * S,
			compound: {
				id: "compound-1",
				children: [
					{ relativeStartTime: 0, element: { id: "clip-a" } },
					{ relativeStartTime: 2 * S, element: { id: "clip-b" } },
				],
			},
		});
		expect(
			expandCompoundElements({ elements: created.main.elements }).map(
				(element) => [element.id, element.startTime],
			),
		).toEqual([
			["clip-a", mt(2 * S)],
			["clip-b", mt(4 * S)],
		]);
	});

	test("edits a nested child and breaks apart relative to a moved container", () => {
		const created = createCompoundClip({
			tracks: makeTracks(),
			selection: [
				{ trackId: "main", elementId: "clip-a" },
				{ trackId: "main", elementId: "clip-b" },
			],
			compoundId: "compound-1",
			name: "Opening ritual",
		});
		const moved = {
			...created,
			main: {
				...created.main,
				elements: created.main.elements.map((element) => ({
					...element,
					startTime: mt(10 * S),
				})),
			},
		};
		const edited = updateCompoundChild({
			tracks: moved,
			compoundId: "compound-1",
			childElementId: "clip-b",
			patch: { name: "Bottle detail", relativeStartTime: mt(3 * S) },
		});
		const restored = breakApartCompoundClip({
			tracks: edited,
			compoundId: "compound-1",
		});
		expect(restored.main.elements).toMatchObject([
			{ id: "clip-a", name: "Arrival", startTime: 10 * S },
			{ id: "clip-b", name: "Bottle detail", startTime: 13 * S },
		]);
	});
});
