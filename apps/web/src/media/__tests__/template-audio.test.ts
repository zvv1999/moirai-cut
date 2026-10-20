import { expect, test } from "bun:test";
import { collectAudioMixSources, createTimelineAudioBuffer } from "@/media/audio";
import type { SceneTracks } from "@/timeline";
import { mediaTimeFromSeconds } from "@/wasm";

const duration = mediaTimeFromSeconds({ seconds: 1 });
function tracks(): SceneTracks {
	return {
		main: { id: "main", type: "video", name: "Main", elements: [], muted: false, hidden: false },
		overlay: [],
		audio: [{ id: "music", type: "audio", name: "Music", muted: false, elements: [{
			id: "sound", name: "Verified music", type: "audio", sourceType: "library",
			sourceUrl: "/api/footage/templates/sounds/test/audio?sha256=test",
			startTime: mediaTimeFromSeconds({ seconds: 0 }), duration,
			trimStart: mediaTimeFromSeconds({ seconds: 0 }), trimEnd: mediaTimeFromSeconds({ seconds: 0 }),
			params: { volume: -22, "template.soundSha256": "test" },
		}] }],
	};
}

test("template sound fetch failures cannot silently produce a silent export", async () => {
	const previous = globalThis.fetch;
	try {
		globalThis.fetch = Object.assign(async () => new Response("hash mismatch", { status: 400 }), { preconnect: previous.preconnect });
		await expect(collectAudioMixSources({ tracks: tracks(), mediaAssets: [] })).rejects.toThrow("模板声音加载失败");
		await expect(createTimelineAudioBuffer({
			tracks: tracks(), mediaAssets: [], duration, audioContext: {} as AudioContext,
		})).rejects.toThrow("模板声音加载失败");
	} finally { globalThis.fetch = previous; }
});

test("library WAV sources preserve their actual MIME type", async () => {
	const previous = globalThis.fetch;
	try {
		globalThis.fetch = Object.assign(async () => new Response(new Uint8Array([1, 2]), { headers: { "content-type": "audio/wav" } }), { preconnect: previous.preconnect });
		const sources = await collectAudioMixSources({ tracks: tracks(), mediaAssets: [] });
		expect(sources).toHaveLength(1);
		expect(sources[0].file.type).toBe("audio/wav");
	} finally { globalThis.fetch = previous; }
});
