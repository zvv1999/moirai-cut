export type VoiceOverPhase =
	| "ready"
	| "counting"
	| "recording"
	| "processing"
	| "error";

export interface VoiceOverState {
	phase: VoiceOverPhase;
	countInSeconds: number;
	countInRemaining: number;
	level: number;
	elapsedSeconds: number;
	error: string | null;
}

export type VoiceOverEvent =
	| { type: "arm" }
	| { type: "tick" }
	| { type: "level"; value: number }
	| { type: "elapsed"; value: number }
	| { type: "stop" }
	| { type: "ready" }
	| { type: "error"; message: string };

export function createVoiceOverState({
	countInSeconds,
}: {
	countInSeconds: number;
}): VoiceOverState {
	const safeCount = Math.max(0, Math.min(10, Math.floor(countInSeconds)));
	return {
		phase: "ready",
		countInSeconds: safeCount,
		countInRemaining: safeCount,
		level: 0,
		elapsedSeconds: 0,
		error: null,
	};
}

export function advanceVoiceOverState({
	state,
	event,
}: {
	state: VoiceOverState;
	event: VoiceOverEvent;
}): VoiceOverState {
	switch (event.type) {
		case "arm":
			return {
				...state,
				phase: state.countInSeconds > 0 ? "counting" : "recording",
				countInRemaining: state.countInSeconds,
				elapsedSeconds: 0,
				error: null,
			};
		case "tick": {
			if (state.phase !== "counting") return state;
			const remaining = Math.max(0, state.countInRemaining - 1);
			return {
				...state,
				countInRemaining: remaining,
				phase: remaining === 0 ? "recording" : "counting",
			};
		}
		case "level":
			return {
				...state,
				level: Math.max(0, Math.min(1, event.value)),
			};
		case "elapsed":
			return { ...state, elapsedSeconds: Math.max(0, event.value) };
		case "stop":
			return state.phase === "recording"
				? { ...state, phase: "processing", level: 0 }
				: state;
		case "ready":
			return createVoiceOverState({
				countInSeconds: state.countInSeconds,
			});
		case "error":
			return { ...state, phase: "error", error: event.message, level: 0 };
	}
}

export function buildVoiceOverFilename({
	takeNumber,
	mimeType,
}: {
	takeNumber: number;
	mimeType: string;
}): string {
	const extension = mimeType.includes("ogg")
		? "ogg"
		: mimeType.includes("mp4")
			? "m4a"
			: "webm";
	return `Voice-over Take ${String(Math.max(1, takeNumber)).padStart(
		3,
		"0",
	)}.${extension}`;
}

export function chooseVoiceOverMimeType({
	supported,
}: {
	supported: (mimeType: string) => boolean;
}): string {
	return (
		[
			"audio/webm;codecs=opus",
			"audio/mp4;codecs=mp4a.40.2",
			"audio/ogg;codecs=opus",
			"audio/webm",
		].find(supported) ?? ""
	);
}
