import { describe, expect, test } from "bun:test";
import {
	buildSeparatedAudioElement,
	findSeparatedAudioCompanion,
	planSourceAudioRecovery,
} from "@/timeline/audio-separation";
import type {
	AudioElement,
	SceneTracks,
	VideoElement,
} from "@/timeline";
import { mediaTimeFromSeconds, ZERO_MEDIA_TIME } from "@/wasm";

function video(): VideoElement {
	return {
		id: "video-1",
		type: "video",
		mediaId: "media-1",
		name: "Interview",
		startTime: ZERO_MEDIA_TIME,
		duration: mediaTimeFromSeconds({ seconds: 8 }),
		trimStart: mediaTimeFromSeconds({ seconds: 1 }),
		trimEnd: ZERO_MEDIA_TIME,
		isSourceAudioEnabled: false,
		params: { volume: -3, muted: false },
	};
}

function separatedAudio(): AudioElement {
	return {
		...buildSeparatedAudioElement({ sourceElement: video() }),
		id: "audio-1",
		params: {
			...buildSeparatedAudioElement({ sourceElement: video() }).params,
			volume: -6,
			audioVoiceEnhance: true,
		},
	};
}

function tracks(audio: AudioElement): SceneTracks {
	return {
		main: {
			id: "main",
			type: "video",
			name: "Main",
			elements: [video()],
		},
		overlay: [],
		audio: [
			{
				id: "audio-track",
				type: "audio",
				name: "Audio",
				elements: [audio],
			},
		],
	};
}

describe("source audio recovery", () => {
	test("finds only the generated companion and recovers its edits without duplicates", () => {
		const audio = separatedAudio();
		const companion = findSeparatedAudioCompanion({
			tracks: tracks(audio),
			sourceElement: video(),
		});
		expect(companion?.element.id).toBe("audio-1");

		const plan = planSourceAudioRecovery({
			sourceElement: video(),
			companion: audio,
		});
		expect(plan.ok).toBe(true);
		if (!plan.ok) return;
		expect(plan.recoveredElement.isSourceAudioEnabled).toBe(true);
		expect(plan.recoveredElement.params.volume).toBe(-6);
		expect(plan.recoveredElement.params.audioVoiceEnhance).toBe(true);
		expect(plan.removeCompanion).toBe(true);
	});

	test("refuses recovery after a separated clip drifts out of sync", () => {
		const audio = {
			...separatedAudio(),
			startTime: mediaTimeFromSeconds({ seconds: 0.5 }),
		};
		expect(
			planSourceAudioRecovery({
				sourceElement: video(),
				companion: audio,
			}),
		).toEqual({
			ok: false,
			reason: "Separated audio must be aligned before recovery",
		});
	});
});
