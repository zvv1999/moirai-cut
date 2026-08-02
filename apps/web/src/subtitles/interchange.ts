import type { SubtitleCue } from "./types";

export type SubtitleExportFormat = "srt" | "vtt" | "ass";

export interface SerializedSubtitles {
	content: string;
	fileExtension: SubtitleExportFormat;
	mimeType: string;
	warnings: string[];
}

function formatClock({
	seconds,
	separator,
	hoursWidth = 2,
}: {
	seconds: number;
	separator: "," | ".";
	hoursWidth?: number;
}): string {
	const safe = Math.max(0, seconds);
	const totalMilliseconds = Math.round(safe * 1000);
	const hours = Math.floor(totalMilliseconds / 3_600_000);
	const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
	const wholeSeconds = Math.floor((totalMilliseconds % 60_000) / 1000);
	const milliseconds = totalMilliseconds % 1000;
	return `${String(hours).padStart(hoursWidth, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}${separator}${String(milliseconds).padStart(3, "0")}`;
}

function cueText({ cue }: { cue: SubtitleCue }): string {
	return cue.secondaryText ? `${cue.text}\n${cue.secondaryText}` : cue.text;
}

function serializeSrt({ captions }: { captions: SubtitleCue[] }): SerializedSubtitles {
	const content = captions
		.map((cue, index) => {
			const end = cue.startTime + cue.duration;
			return [
				String(index + 1),
				`${formatClock({ seconds: cue.startTime, separator: "," })} --> ${formatClock({ seconds: end, separator: "," })}`,
				cueText({ cue }),
			].join("\n");
		})
		.join("\n\n");
	const losesMetadata = captions.some(
		(cue) => cue.speaker || cue.style || cue.styleId || cue.styleDetached,
	);
	return {
		content: `${content}\n`,
		fileExtension: "srt",
		mimeType: "application/x-subrip",
		warnings: losesMetadata
			? ["SRT cannot preserve speaker or reusable style metadata."]
			: [],
	};
}

function serializeVtt({ captions }: { captions: SubtitleCue[] }): SerializedSubtitles {
	const body = captions
		.map((cue, index) => {
			const end = cue.startTime + cue.duration;
			const text = cueText({ cue });
			return [
				String(index + 1),
				`${formatClock({ seconds: cue.startTime, separator: "." })} --> ${formatClock({ seconds: end, separator: "." })}`,
				cue.speaker ? `<v ${cue.speaker}>${text}</v>` : text,
			].join("\n");
		})
		.join("\n\n");
	const losesStyle = captions.some(
		(cue) => cue.style || cue.styleId || cue.styleDetached,
	);
	return {
		content: `WEBVTT\n\n${body}\n`,
		fileExtension: "vtt",
		mimeType: "text/vtt",
		warnings: losesStyle
			? [
					"WebVTT export omits reusable style details that cannot be represented safely.",
				]
			: [],
	};
}

function assColor({ color }: { color?: string }): string {
	const match = color?.match(/^#([0-9a-f]{6})$/i);
	if (!match) return "&H00FFFFFF";
	const hex = match[1];
	return `&H00${hex.slice(4, 6)}${hex.slice(2, 4)}${hex.slice(0, 2)}`.toUpperCase();
}

function formatAssClock({ seconds }: { seconds: number }): string {
	const safe = Math.max(0, seconds);
	const totalCentiseconds = Math.round(safe * 100);
	const hours = Math.floor(totalCentiseconds / 360_000);
	const minutes = Math.floor((totalCentiseconds % 360_000) / 6_000);
	const wholeSeconds = Math.floor((totalCentiseconds % 6_000) / 100);
	const centiseconds = totalCentiseconds % 100;
	return `${hours}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function serializeAss({
	captions,
	canvasSize,
}: {
	captions: SubtitleCue[];
	canvasSize: { width: number; height: number };
}): SerializedSubtitles {
	const representative = captions.find((cue) => cue.style)?.style;
	const fontSize = Math.round(representative?.fontSize ?? 48);
	const primaryColor = assColor({ color: representative?.color });
	const dialogue = captions
		.map((cue) => {
			const text = cueText({ cue })
				.replace(/\n/g, "\\N")
				.replace(/,/g, "\\,");
			return `Dialogue: 0,${formatAssClock({ seconds: cue.startTime })},${formatAssClock({ seconds: cue.startTime + cue.duration })},Caption,,0,0,0,,${text}`;
		})
		.join("\n");
	const content = [
		"[Script Info]",
		"ScriptType: v4.00+",
		`PlayResX: ${canvasSize.width}`,
		`PlayResY: ${canvasSize.height}`,
		"",
		"[V4+ Styles]",
		"Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
		`Style: Caption,Arial,${fontSize},${primaryColor},&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,40,40,40,1`,
		"",
		"[Events]",
		"Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
		dialogue,
		"",
	].join("\n");
	const losesMetadata = captions.some(
		(cue) =>
			cue.speaker ||
			cue.secondaryText ||
			cue.styleDetached ||
			Boolean(cue.styleId),
	);
	return {
		content,
		fileExtension: "ass",
		mimeType: "text/x-ssa",
		warnings: losesMetadata
			? ["ASS export flattens speaker labels and detached per-cue styling."]
			: [],
	};
}

export function serializeSubtitles({
	format,
	captions,
	canvasSize = { width: 1920, height: 1080 },
}: {
	format: SubtitleExportFormat;
	captions: SubtitleCue[];
	canvasSize?: { width: number; height: number };
}): SerializedSubtitles {
	const sorted = [...captions].sort(
		(left, right) => left.startTime - right.startTime,
	);
	switch (format) {
		case "srt":
			return serializeSrt({ captions: sorted });
		case "vtt":
			return serializeVtt({ captions: sorted });
		case "ass":
			return serializeAss({ captions: sorted, canvasSize });
	}
}
