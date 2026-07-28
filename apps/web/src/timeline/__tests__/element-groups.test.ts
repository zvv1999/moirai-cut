import { describe, expect, test } from "bun:test";
import {
	expandElementSelectionRelations,
	planElementRelationUpdate,
} from "@/timeline/element-groups";

const tracks = [
	{
		id: "visual",
		elements: [
			{
				id: "video-a",
				type: "video",
				startTime: 0,
				duration: 20,
				groupId: "story-group",
				linkGroupId: "av-link",
			},
			{
				id: "video-b",
				type: "image",
				startTime: 20,
				duration: 20,
				groupId: "story-group",
			},
		],
	},
	{
		id: "audio",
		elements: [
			{
				id: "audio-a",
				type: "audio",
				startTime: 0,
				duration: 20,
				linkGroupId: "av-link",
			},
		],
	},
	{
		id: "text",
		elements: [
			{ id: "title", type: "text", startTime: 0, duration: 10 },
		],
	},
];

describe("timeline element groups and links", () => {
	test("expands related selection transitively across group and A/V link", () => {
		expect(
			expandElementSelectionRelations({
				tracks,
				elements: [{ trackId: "visual", elementId: "video-b" }],
			}),
		).toEqual([
			{ trackId: "visual", elementId: "video-a" },
			{ trackId: "visual", elementId: "video-b" },
			{ trackId: "audio", elementId: "audio-a" },
		]);
	});

	test("plans one shared group id and toggles the same group back off", () => {
		const selection = [
			{ trackId: "visual", elementId: "video-a" },
			{ trackId: "visual", elementId: "video-b" },
		];
		const group = planElementRelationUpdate({
			tracks: tracks.map((track) => ({
				...track,
				elements: track.elements.map((element) => ({
					...element,
					groupId: undefined,
					linkGroupId: undefined,
				})),
			})),
			selection,
			kind: "group",
			relationId: "new-group",
		});
		expect(group).toMatchObject({
			available: true,
			action: "group",
			updates: [
				{ elementId: "video-a", patch: { groupId: "new-group" } },
				{ elementId: "video-b", patch: { groupId: "new-group" } },
			],
		});

		expect(
			planElementRelationUpdate({
				tracks,
				selection,
				kind: "group",
				relationId: "unused",
			}),
		).toMatchObject({
			available: true,
			action: "ungroup",
			updates: [
				{ elementId: "video-a", patch: { groupId: undefined } },
				{ elementId: "video-b", patch: { groupId: undefined } },
			],
		});
	});

	test("links an overlapping visual and audio selection", () => {
		expect(
			planElementRelationUpdate({
				tracks: tracks.map((track) => ({
					...track,
					elements: track.elements.map((element) => ({
						...element,
						groupId: undefined,
						linkGroupId: undefined,
					})),
				})),
				selection: [
					{ trackId: "visual", elementId: "video-a" },
					{ trackId: "audio", elementId: "audio-a" },
				],
				kind: "link",
				relationId: "new-link",
			}),
		).toMatchObject({
			available: true,
			action: "link",
			updates: [
				{ elementId: "video-a", patch: { linkGroupId: "new-link" } },
				{ elementId: "audio-a", patch: { linkGroupId: "new-link" } },
			],
		});
	});

	test("refuses a link without both overlapping visual and audio media", () => {
		expect(
			planElementRelationUpdate({
				tracks,
				selection: [
					{ trackId: "visual", elementId: "video-a" },
					{ trackId: "text", elementId: "title" },
				],
				kind: "link",
				relationId: "bad-link",
			}),
		).toEqual({
			available: false,
			action: "link",
			reason: "Select overlapping visual and audio clips",
			updates: [],
		});
	});
});
