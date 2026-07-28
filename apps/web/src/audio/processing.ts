import type { AudioCapableElement } from "@/timeline/audio-state";

const MIN_PROCESSING_GAIN_DB = -24;
const MAX_PROCESSING_GAIN_DB = 24;

export interface AudioProcessingSettings {
	noiseReduction: boolean;
	voiceEnhance: boolean;
	channelBalance: number;
	gainDb: number;
}

function readBoolean({
	value,
	fallback,
}: {
	value: unknown;
	fallback: boolean;
}): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function readNumber({
	value,
	fallback,
	min,
	max,
}: {
	value: unknown;
	fallback: number;
	min: number;
	max: number;
}): number {
	return typeof value === "number" && Number.isFinite(value)
		? Math.max(min, Math.min(max, value))
		: fallback;
}

export function getAudioProcessingSettings({
	element,
}: {
	element: AudioCapableElement;
}): AudioProcessingSettings {
	return {
		noiseReduction: readBoolean({
			value: element.params.audioNoiseReduction,
			fallback: false,
		}),
		voiceEnhance: readBoolean({
			value: element.params.audioVoiceEnhance,
			fallback: false,
		}),
		channelBalance: readNumber({
			value: element.params.audioChannelBalance,
			fallback: 0,
			min: -1,
			max: 1,
		}),
		gainDb: readNumber({
			value: element.params.audioProcessingGainDb,
			fallback: 0,
			min: MIN_PROCESSING_GAIN_DB,
			max: MAX_PROCESSING_GAIN_DB,
		}),
	};
}

export function applyAudioProcessingFrame({
	frame,
	settings,
}: {
	frame: readonly [number, number];
	settings: AudioProcessingSettings;
}): [number, number] {
	const inputLeft = frame[0];
	const inputRight = frame[1];
	const gate = settings.noiseReduction ? 0.012 : 0;
	const voiceGain = settings.voiceEnhance ? 1.08 : 1;
	const gain = 10 ** (settings.gainDb / 20) * voiceGain;
	const balance = Math.max(-1, Math.min(1, settings.channelBalance));
	const leftBalance = balance > 0 ? 1 - balance : 1;
	const rightBalance = balance < 0 ? 1 + balance : 1;
	const denoise = (sample: number) =>
		Math.abs(sample) < gate ? 0 : sample;

	return [
		denoise(inputLeft) * gain * leftBalance,
		denoise(inputRight) * gain * rightBalance,
	];
}

export function createAudioProcessingChain({
	audioContext,
	destination,
	element,
}: {
	audioContext: AudioContext;
	destination: AudioNode;
	element: AudioCapableElement;
}): { input: GainNode; disconnect: () => void } {
	const settings = getAudioProcessingSettings({ element });
	const input = audioContext.createGain();
	const nodes: AudioNode[] = [input];
	let tail: AudioNode = input;

	if (settings.noiseReduction) {
		const highPass = audioContext.createBiquadFilter();
		highPass.type = "highpass";
		highPass.frequency.value = 80;
		highPass.Q.value = 0.7;
		tail.connect(highPass);
		tail = highPass;
		nodes.push(highPass);
	}

	if (settings.voiceEnhance) {
		const presence = audioContext.createBiquadFilter();
		presence.type = "peaking";
		presence.frequency.value = 3_000;
		presence.Q.value = 0.85;
		presence.gain.value = 3.5;
		tail.connect(presence);
		tail = presence;
		nodes.push(presence);

		const compressor = audioContext.createDynamicsCompressor();
		compressor.threshold.value = -24;
		compressor.knee.value = 12;
		compressor.ratio.value = 3;
		compressor.attack.value = 0.008;
		compressor.release.value = 0.14;
		tail.connect(compressor);
		tail = compressor;
		nodes.push(compressor);
	}

	const panner = audioContext.createStereoPanner();
	panner.pan.value = settings.channelBalance;
	tail.connect(panner);
	tail = panner;
	nodes.push(panner);

	const gain = audioContext.createGain();
	gain.gain.value = 10 ** (settings.gainDb / 20);
	tail.connect(gain);
	gain.connect(destination);
	nodes.push(gain);

	return {
		input,
		disconnect: () => {
			for (const node of nodes) node.disconnect();
		},
	};
}
