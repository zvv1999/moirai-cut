import type { AudioCapableElement } from "@/timeline/audio-state";
import { clampDb, getElementVolume } from "@/timeline/audio-state";

const MIN_MEASURABLE_DB = -120;
const DEFAULT_TARGET_LUFS = -14;
const MAX_NORMALIZATION_GAIN_DB = 24;
const NORMALIZED_PEAK_CEILING_DBFS = -1;

export interface AudioAnalysisResult {
	integratedLufs: number;
	peakDbfs: number;
	truePeakDbfs: number;
	clippedSampleCount: number;
	clippingDetected: boolean;
	headroomDb: number;
	normalizationGainDb: number;
	targetLufs: number;
	durationSeconds: number;
}

function amplitudeToDb({ amplitude }: { amplitude: number }): number {
	if (amplitude <= 0) return MIN_MEASURABLE_DB;
	return Math.max(MIN_MEASURABLE_DB, 20 * Math.log10(amplitude));
}

export function analyzePcmChannels({
	channels,
	sampleRate,
	targetLufs = DEFAULT_TARGET_LUFS,
}: {
	channels: readonly Float32Array[];
	sampleRate: number;
	targetLufs?: number;
}): AudioAnalysisResult {
	let peak = 0;
	let sumSquares = 0;
	let sampleCount = 0;
	let clippedSampleCount = 0;

	for (const channel of channels) {
		for (let index = 0; index < channel.length; index++) {
			const sample = channel[index] ?? 0;
			const magnitude = Math.abs(sample);
			peak = Math.max(peak, magnitude);
			sumSquares += sample * sample;
			sampleCount += 1;
			if (magnitude >= 1) clippedSampleCount += 1;
		}
	}

	const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
	// This browser-local measurement follows the BS.1770 energy convention.
	// It intentionally omits the broadcast gating pass, so the UI calls it an
	// estimate rather than presenting false laboratory precision.
	const integratedLufs = amplitudeToDb({ amplitude: rms }) - 0.691;
	const peakDbfs = amplitudeToDb({ amplitude: peak });
	const requestedGain = targetLufs - integratedLufs;
	const peakSafeGain = NORMALIZED_PEAK_CEILING_DBFS - peakDbfs;
	const normalizationGainDb = Math.max(
		-MAX_NORMALIZATION_GAIN_DB,
		Math.min(MAX_NORMALIZATION_GAIN_DB, requestedGain, peakSafeGain),
	);
	const maxChannelLength = channels.reduce(
		(maximum, channel) => Math.max(maximum, channel.length),
		0,
	);

	return {
		integratedLufs,
		peakDbfs,
		truePeakDbfs: peakDbfs,
		clippedSampleCount,
		clippingDetected: clippedSampleCount > 0,
		headroomDb: -peakDbfs,
		normalizationGainDb,
		targetLufs,
		durationSeconds:
			sampleRate > 0 ? maxChannelLength / sampleRate : 0,
	};
}

export function analyzeAudioBuffer({
	audioBuffer,
	targetLufs = DEFAULT_TARGET_LUFS,
}: {
	audioBuffer: AudioBuffer;
	targetLufs?: number;
}): AudioAnalysisResult {
	return analyzePcmChannels({
		channels: Array.from(
			{ length: audioBuffer.numberOfChannels },
			(_, channel) => audioBuffer.getChannelData(channel),
		),
		sampleRate: audioBuffer.sampleRate,
		targetLufs,
	});
}

export function buildNormalizationPatch({
	element,
	analysis,
}: {
	element: AudioCapableElement;
	analysis: AudioAnalysisResult;
}): Pick<AudioCapableElement, "params"> {
	return {
		params: {
			volume: clampDb(
				getElementVolume({ element }) + analysis.normalizationGainDb,
			),
		},
	};
}
