import type { ParseSubtitleResult, SubtitleCue } from "./types";

const TIMESTAMP_LINE =
	/^(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})(.*)$/;

function toSeconds({
	hours,
	minutes,
	seconds,
	milliseconds,
}: {
	hours?: string;
	minutes: string;
	seconds: string;
	milliseconds: string;
}): number {
	return (
		Number(hours ?? 0) * 3600 +
		Number(minutes) * 60 +
		Number(seconds) +
		Number(milliseconds) / 1000
	);
}

export function parseVtt({ input }: { input: string }): ParseSubtitleResult {
	const normalized = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
	if (!normalized) {
		return { captions: [], skippedCueCount: 0, warnings: [] };
	}
	const blocks = normalized.split(/\n{2,}/);
	const captions: SubtitleCue[] = [];
	let skippedCueCount = 0;
	let ignoredStyling = false;

	for (const block of blocks) {
		const lines = block.split("\n").map((line) => line.trim());
		if (lines[0]?.startsWith("WEBVTT") || lines[0] === "NOTE") continue;
		const timestampIndex = lines.findIndex((line) => TIMESTAMP_LINE.test(line));
		if (timestampIndex < 0) {
			if (lines.some(Boolean)) skippedCueCount += 1;
			continue;
		}
		const match = lines[timestampIndex].match(TIMESTAMP_LINE);
		if (!match) {
			skippedCueCount += 1;
			continue;
		}
		const startTime = toSeconds({
			hours: match[1],
			minutes: match[2],
			seconds: match[3],
			milliseconds: match[4],
		});
		const endTime = toSeconds({
			hours: match[5],
			minutes: match[6],
			seconds: match[7],
			milliseconds: match[8],
		});
		const rawText = lines.slice(timestampIndex + 1).join("\n").trim();
		if (!rawText || endTime <= startTime) {
			skippedCueCount += 1;
			continue;
		}
		const voiceMatch = rawText.match(/^<v(?:\.[^ >]+)*\s+([^>]+)>([\s\S]*)$/i);
		const speaker = voiceMatch?.[1]?.trim();
		const voiceText = voiceMatch?.[2] ?? rawText;
		const text = voiceText
			.replace(/<\/v>\s*$/i, "")
			.replace(/<[^>]+>/g, "")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&amp;/g, "&")
			.trim();
		if (!text) {
			skippedCueCount += 1;
			continue;
		}
		ignoredStyling ||= Boolean(match[9]?.trim()) || /<[^>]+>/.test(rawText);
		captions.push({
			text,
			...(speaker ? { speaker } : {}),
			startTime,
			duration: endTime - startTime,
		});
	}

	return {
		captions,
		skippedCueCount,
		warnings: ignoredStyling
			? ["Ignored unsupported WebVTT cue settings and inline styling."]
			: [],
	};
}
