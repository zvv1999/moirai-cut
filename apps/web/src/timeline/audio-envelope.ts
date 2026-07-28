import { getElementKeyframes } from "@/animation";
import { resolveNumberAtTime } from "@/animation/values";
import { getLinePosFromDb } from "@/timeline/audio-display";
import type { AudioCapableElement } from "@/timeline/audio-state";
import { TICKS_PER_SECOND } from "@/wasm";

export const AUDIO_FADE_IN_PARAM = "audioFadeIn";
export const AUDIO_FADE_OUT_PARAM = "audioFadeOut";

export interface VolumeEnvelopePoint {
	kind: "boundary" | "keyframe";
	keyframeId?: string;
	time: number;
	valueDb: number;
	xPercent: number;
	yPercent: number;
}

function finiteSeconds(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value)
		? Math.max(0, value)
		: 0;
}

export function getAudioFadeDurations({
	element,
}: {
	element: AudioCapableElement;
}): {
	fadeInSeconds: number;
	fadeOutSeconds: number;
} {
	const durationSeconds = Math.max(0, element.duration / TICKS_PER_SECOND);
	const fadeInSeconds = Math.min(
		durationSeconds,
		finiteSeconds(element.params[AUDIO_FADE_IN_PARAM]),
	);
	const fadeOutSeconds = Math.min(
		Math.max(0, durationSeconds - fadeInSeconds),
		finiteSeconds(element.params[AUDIO_FADE_OUT_PARAM]),
	);

	return { fadeInSeconds, fadeOutSeconds };
}

export function setAudioFadeDuration<TElement extends AudioCapableElement>({
	element,
	side,
	seconds,
}: {
	element: TElement;
	side: "in" | "out";
	seconds: number;
}): TElement {
	const durationSeconds = Math.max(0, element.duration / TICKS_PER_SECOND);
	const current = getAudioFadeDurations({ element });
	const other = side === "in" ? current.fadeOutSeconds : current.fadeInSeconds;
	const nextSeconds = Math.min(
		Math.max(0, durationSeconds - other),
		finiteSeconds(seconds),
	);
	const key = side === "in" ? AUDIO_FADE_IN_PARAM : AUDIO_FADE_OUT_PARAM;

	return {
		...element,
		params: {
			...element.params,
			[key]: nextSeconds,
		},
	};
}

export function resolveAudioFadeGain({
	durationSeconds,
	localTimeSeconds,
	fadeInSeconds,
	fadeOutSeconds,
}: {
	durationSeconds: number;
	localTimeSeconds: number;
	fadeInSeconds: number;
	fadeOutSeconds: number;
}): number {
	const safeDuration = Math.max(0, durationSeconds);
	const safeTime = Math.min(safeDuration, Math.max(0, localTimeSeconds));
	const fadeInGain =
		fadeInSeconds > 0 ? Math.min(1, safeTime / fadeInSeconds) : 1;
	const timeFromEnd = Math.max(0, safeDuration - safeTime);
	const fadeOutGain =
		fadeOutSeconds > 0 ? Math.min(1, timeFromEnd / fadeOutSeconds) : 1;
	return fadeInGain * fadeOutGain;
}

export function buildVolumeEnvelopePoints({
	element,
}: {
	element: AudioCapableElement;
}): VolumeEnvelopePoint[] {
	const duration = element.duration;
	if (duration <= 0) return [];

	const keyframes = getElementKeyframes({ animations: element.animations })
		.filter(
			(keyframe) =>
				keyframe.propertyPath === "volume" &&
				typeof keyframe.value === "number",
		)
		.sort((left, right) => left.time - right.time);
	if (keyframes.length === 0) return [];

	const boundaryPoint = (time: number): VolumeEnvelopePoint => {
		const valueDb = resolveNumberAtTime({
			baseValue:
				typeof element.params.volume === "number" ? element.params.volume : 0,
			animations: element.animations,
			propertyPath: "volume",
			localTime: time,
		});
		return {
			kind: "boundary",
			time,
			valueDb,
			xPercent: (time / duration) * 100,
			yPercent: getLinePosFromDb({ db: valueDb }),
		};
	};

	const points: VolumeEnvelopePoint[] = [];
	if (keyframes[0]?.time !== 0) {
		points.push(boundaryPoint(0));
	}

	for (const keyframe of keyframes) {
		const valueDb = typeof keyframe.value === "number" ? keyframe.value : 0;
		points.push({
			kind: "keyframe",
			keyframeId: keyframe.id,
			time: keyframe.time,
			valueDb,
			xPercent: (keyframe.time / duration) * 100,
			yPercent: getLinePosFromDb({ db: valueDb }),
		});
	}

	if (keyframes[keyframes.length - 1]?.time !== duration) {
		points.push(boundaryPoint(duration));
	}

	return points;
}
