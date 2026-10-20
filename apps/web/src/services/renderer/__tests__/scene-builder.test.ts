import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/media/types";
import type { SceneTracks } from "@/timeline";
import { mediaTimeFromSeconds } from "@/wasm";
import { buildScene } from "../scene-builder";
import { VideoNode } from "../nodes/video-node";
import type { AnyBaseNode } from "../nodes/base-node";

test("render origins retain instance identity and nested group clocks for preview and export", () => {
	const base = { startTime: 1, duration: 200, trimStart: 0, trimEnd: 0, name: "layer", params: {"template.elementId": "keyword", "template.instanceId": "occurrence-2", "template.textLayoutLeft":-14,"template.textLayoutTop":-30,"template.textLayoutWidth":600,"template.textLayoutHeight":60} };
	const leaves = [
		{...base, id:"text", type:"text"},
		{...base, id:"graphic", type:"graphic", definitionId:"rectangle"},
		{...base, id:"sticker", type:"sticker", stickerId:"sparkle"},
		{...base, id:"video", type:"video", mediaId:"video-media"},
		{...base, id:"image", type:"image", mediaId:"image-media"},
		{...base, id:"effect", type:"effect", effectType:"blur"},
	];
	const track = (id: string, elements: unknown[]) => ({id, name:id, type:"graphic", elements});
	const nested = {...base, id:"inner", type:"graphic", definitionId:"rectangle", startTime:30, trimStart:2, renderGroup:{timeOrigin:10, tracks:[track("leaf-track",leaves)]}};
	const outer = {...base, id:"outer", type:"graphic", definitionId:"rectangle", startTime:100, trimStart:5, renderGroup:{timeOrigin:20, tracks:[track("inner-track",[nested])]}};
	const tracks = {main:track("main",[outer]),overlay:[track("second",[...leaves])],audio:[]} as unknown as SceneTracks;
	const before=JSON.stringify(tracks);
	for(const isPreview of [true,false]) {
		const scene=buildScene({tracks,canvasSize:{width:720,height:720},duration:mediaTimeFromSeconds({seconds:1}),background:{type:"color",color:"black"},isPreview,mediaAssets:[videoAsset(),{...videoAsset(),id:"image-media",type:"image"}]});
		const all:AnyBaseNode[]=[];
		const visit=(node:AnyBaseNode)=>{all.push(node);node.children.forEach(visit);};
		visit(scene);
		for(const leaf of leaves) {
			const instances=all.filter(node=>node.source?.elementId===leaf.id);
			expect(instances).toHaveLength(2);
			const nestedNode=instances.find(node=>node.source?.groupPath.length===2)!;
			expect(nestedNode.source).toEqual({elementId:leaf.id,trackId:"leaf-track",groupPath:["outer","inner"],sceneTimeOffset:93,templateElementId:"keyword",templateInstanceId:"occurrence-2",...(leaf.type==="text"?{textLayoutBox:{left:-14,top:-30,width:600,height:60}}:{})});
			expect(instances.find(node=>node!==nestedNode)?.source?.sceneTimeOffset).toBe(0);
		}
		expect(all.find(node=>node.source?.elementId==="inner")?.source?.sceneTimeOffset).toBe(75);
		expect(scene.source).toBeUndefined();
		expect(all.find(node=>node.constructor.name==="ColorNode")?.source).toBeUndefined();
	}
	expect(JSON.stringify(tracks)).toBe(before);
});

function legacyTrimmedVideoTracks({
	sourceDuration,
}: {
	sourceDuration?: ReturnType<typeof mediaTimeFromSeconds>;
} = {}): SceneTracks {
	return {
		overlay: [],
		main: {
			id: "main-track",
			name: "Main Track",
			type: "video",
			muted: false,
			hidden: false,
			elements: [
				{
					id: "video-element",
					name: "05-摇酒仪式",
					type: "video",
					mediaId: "video-media",
					startTime: mediaTimeFromSeconds({ seconds: 6.5 }),
					duration: mediaTimeFromSeconds({ seconds: 4.7 }),
					trimStart: mediaTimeFromSeconds({ seconds: 0.5 }),
					trimEnd: mediaTimeFromSeconds({ seconds: 7.808 }),
					...(sourceDuration === undefined ? {} : { sourceDuration }),
					params: {},
				},
			],
		},
		audio: [],
	};
}

function videoAsset({
	duration = 13.008333,
}: {
	duration?: number | null;
} = {}): MediaAsset {
	return {
		id: "video-media",
		name: "微信视频.mp4",
		type: "video",
		file: new File(["video"], "微信视频.mp4", { type: "video/mp4" }),
		url: "blob:video",
		...(duration == null ? {} : { duration }),
		width: 1920,
		height: 1080,
	};
}

describe("preview scene video source timing", () => {
	test("recovers source duration from media metadata for legacy trimmed clips", () => {
		const asset = videoAsset();
		const scene = buildScene({
			canvasSize: { width: 1080, height: 1920 },
			tracks: legacyTrimmedVideoTracks(),
			mediaAssets: [asset],
			duration: mediaTimeFromSeconds({ seconds: 47.7 }),
			background: { type: "color", color: "#000000" },
			isPreview: true,
		});

		const videoNode = scene.children.find(
			(node): node is VideoNode => node instanceof VideoNode,
		);

		expect(videoNode?.params.sourceDuration).toBe(
			mediaTimeFromSeconds({ seconds: asset.duration! }),
		);
	});

	test("preserves an explicit clip source duration", () => {
		const sourceDuration = mediaTimeFromSeconds({ seconds: 20 });
		const scene = buildScene({
			canvasSize: { width: 1080, height: 1920 },
			tracks: legacyTrimmedVideoTracks({ sourceDuration }),
			mediaAssets: [videoAsset()],
			duration: mediaTimeFromSeconds({ seconds: 47.7 }),
			background: { type: "color", color: "#000000" },
		});

		const videoNode = scene.children.find(
			(node): node is VideoNode => node instanceof VideoNode,
		);

		expect(videoNode?.params.sourceDuration).toBe(sourceDuration);
	});

	test("falls back to the stored trim equation when media duration is unavailable", () => {
		const tracks = legacyTrimmedVideoTracks();
		const element = tracks.main.elements[0]!;
		const scene = buildScene({
			canvasSize: { width: 1080, height: 1920 },
			tracks,
			mediaAssets: [videoAsset({ duration: null })],
			duration: mediaTimeFromSeconds({ seconds: 47.7 }),
			background: { type: "color", color: "#000000" },
		});

		const videoNode = scene.children.find(
			(node): node is VideoNode => node instanceof VideoNode,
		);

		expect(videoNode?.params.sourceDuration).toBe(
			element.trimStart + element.duration + element.trimEnd,
		);
	});
});
