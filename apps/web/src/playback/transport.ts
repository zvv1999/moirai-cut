import type { FrameRate } from "opencut-wasm";
import {
	addMediaTime,
	clampMediaTime,
	mediaTime,
	mediaTimeFromSeconds,
	TICKS_PER_SECOND,
	type MediaTime,
	ZERO_MEDIA_TIME,
} from "@/wasm";

export const PLAYBACK_RATES = [0.25, 0.5, 1, 1.5, 2] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export const PREVIEW_QUALITIES = ["full", "balanced", "performance"] as const;
export type PreviewQuality = (typeof PREVIEW_QUALITIES)[number];

export function isPlaybackRate(value: number): value is PlaybackRate {
	return PLAYBACK_RATES.some((rate) => rate === value);
}

export function isPreviewQuality(value: string): value is PreviewQuality {
	return PREVIEW_QUALITIES.some((quality) => quality === value);
}

export function getTicksPerFrame({ fps }: { fps: FrameRate }): MediaTime {
	return mediaTime({
		ticks: Math.round((TICKS_PER_SECOND * fps.denominator) / fps.numerator),
	});
}

function roundToFrame({
	time,
	fps,
}: {
	time: MediaTime;
	fps: FrameRate;
}): MediaTime {
	const frameIndex = Math.round(
		(time * fps.numerator) / (TICKS_PER_SECOND * fps.denominator),
	);
	return mediaTime({
		ticks: Math.round(
			(frameIndex * TICKS_PER_SECOND * fps.denominator) / fps.numerator,
		),
	});
}

export function getFrameStepTarget({
	currentTime,
	direction,
	duration,
	fps,
}: {
	currentTime: MediaTime;
	direction: -1 | 1;
	duration: MediaTime;
	fps: FrameRate;
}): MediaTime {
	const frameAlignedTime = roundToFrame({ time: currentTime, fps });
	const frameDelta = getTicksPerFrame({ fps });
	const target = mediaTime({
		ticks: frameAlignedTime + direction * frameDelta,
	});
	return clampMediaTime({
		time: target,
		min: ZERO_MEDIA_TIME,
		max: duration,
	});
}

export function resolvePlaybackAdvance({
	startTime,
	elapsedMilliseconds,
	playbackRate,
	duration,
	fps,
	loopEnabled,
}: {
	startTime: MediaTime;
	elapsedMilliseconds: number;
	playbackRate: PlaybackRate;
	duration: MediaTime;
	fps: FrameRate;
	loopEnabled: boolean;
}): {
	time: MediaTime;
	ended: boolean;
	wrapped: boolean;
} {
	if (duration <= ZERO_MEDIA_TIME) {
		return { time: ZERO_MEDIA_TIME, ended: true, wrapped: false };
	}

	const elapsed = mediaTimeFromSeconds({
		seconds: (Math.max(0, elapsedMilliseconds) * playbackRate) / 1_000,
	});
	const rawTime = addMediaTime({ a: startTime, b: elapsed });

	if (rawTime >= duration) {
		if (!loopEnabled) {
			return { time: duration, ended: true, wrapped: false };
		}

		const wrappedTime = mediaTime({ ticks: rawTime % duration });
		return {
			time: roundToFrame({ time: wrappedTime, fps }),
			ended: false,
			wrapped: true,
		};
	}

	return {
		time: roundToFrame({ time: rawTime, fps }),
		ended: false,
		wrapped: false,
	};
}

export function getPreviewFrameStep({
	quality,
}: {
	quality: PreviewQuality;
}): 1 | 2 | 4 {
	switch (quality) {
		case "balanced":
			return 2;
		case "performance":
			return 4;
		case "full":
			return 1;
	}
}
