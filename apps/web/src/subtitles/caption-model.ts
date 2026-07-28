import type { TranscriptionWord } from "@/transcription/types";
import type { ParamValues } from "@/params";
import type {
	SceneTracks,
	TextElement,
	TimelineElement,
} from "@/timeline";
import {
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
} from "@/wasm";
import type { SubtitleStyleOverrides } from "./types";

export interface EditableCaptionCue {
	id: string;
	trackId: string;
	name: string;
	primaryText: string;
	secondaryText: string;
	speaker: string;
	wordTimings: TranscriptionWord[];
	styleId: string | null;
	styleDetached: boolean;
	style?: SubtitleStyleOverrides;
	secondaryStyle?: SubtitleStyleOverrides;
	startTime: number;
	duration: number;
	positionY: number;
}

function readString({
	element,
	key,
	fallback = "",
}: {
	element: TextElement;
	key: string;
	fallback?: string;
}): string {
	const value = element.params[key];
	return typeof value === "string" ? value : fallback;
}

function readWordTimings({ element }: { element: TextElement }): TranscriptionWord[] {
	const serialized = readString({ element, key: "caption.wordTimings" });
	if (!serialized) return [];
	try {
		const parsed: unknown = JSON.parse(serialized);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(value): value is TranscriptionWord =>
				typeof value === "object" &&
				value !== null &&
				"word" in value &&
				typeof value.word === "string" &&
				"start" in value &&
				typeof value.start === "number" &&
				"end" in value &&
				typeof value.end === "number",
		);
	} catch {
		return [];
	}
}

function readSerializedStyle({
	element,
	key,
}: {
	element: TextElement;
	key: string;
}): SubtitleStyleOverrides | undefined {
	const serialized = readString({ element, key });
	if (!serialized) return undefined;
	try {
		const parsed: unknown = JSON.parse(serialized);
		return typeof parsed === "object" && parsed !== null
			? (parsed as SubtitleStyleOverrides)
			: undefined;
	} catch {
		return undefined;
	}
}

export function isCaptionTextElement({
	element,
}: {
	element: TextElement;
}): boolean {
	return (
		element.params["caption.enabled"] === true ||
		/^Caption(?:\s|$)/i.test(element.name)
	);
}

export function createCaptionWordTimings({
	text,
	startTime,
	duration,
}: {
	text: string;
	startTime: number;
	duration: number;
}): TranscriptionWord[] {
	const words = text.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return [];
	const step = Math.max(0.01, duration / words.length);
	return words.map((word, index) => ({
		word,
		start: Math.round((startTime + step * index) * 1000) / 1000,
		end:
			Math.round(
				(index === words.length - 1
					? startTime + duration
					: startTime + step * (index + 1)) * 1000,
			) / 1000,
	}));
}

export function collectCaptionCues({
	tracks,
}: {
	tracks: SceneTracks;
}): EditableCaptionCue[] {
	const cues: EditableCaptionCue[] = [];
	for (const track of tracks.overlay) {
		if (track.type !== "text") continue;
		for (const element of track.elements) {
			if (!isCaptionTextElement({ element })) continue;
			const primaryText = readString({
				element,
				key: "caption.primaryText",
				fallback: readString({ element, key: "content" }),
			});
			const rawStyleId = readString({ element, key: "caption.styleId" });
			const positionY = element.params["transform.positionY"];
			cues.push({
				id: element.id,
				trackId: track.id,
				name: element.name,
				primaryText,
				secondaryText: readString({
					element,
					key: "caption.secondaryText",
				}),
				speaker: readString({ element, key: "caption.speaker" }),
				wordTimings: readWordTimings({ element }),
				styleId: rawStyleId || null,
				styleDetached: element.params["caption.styleDetached"] === true,
				style: readSerializedStyle({
					element,
					key: "caption.inlineStyle",
				}),
				secondaryStyle: readSerializedStyle({
					element,
					key: "caption.secondaryStyle",
				}),
				startTime: mediaTimeToSeconds({ time: element.startTime }),
				duration: mediaTimeToSeconds({ time: element.duration }),
				positionY: typeof positionY === "number" ? positionY : 0,
			});
		}
	}
	return cues.sort(
		(left, right) =>
			left.startTime - right.startTime ||
			left.trackId.localeCompare(right.trackId) ||
			left.id.localeCompare(right.id),
	);
}

function replaceAllLiteral({
	input,
	search,
	replace,
}: {
	input: string;
	search: string;
	replace: string;
}): string {
	if (!search) return input;
	return input.split(search).join(replace);
}

export function applyCaptionBulkEdit({
	cues,
	search = "",
	replace = "",
	timingOffsetSeconds = 0,
	selectedCueIds,
}: {
	cues: EditableCaptionCue[];
	search?: string;
	replace?: string;
	timingOffsetSeconds?: number;
	selectedCueIds?: string[];
}): {
	cues: EditableCaptionCue[];
	changedCueCount: number;
} {
	const selected = selectedCueIds ? new Set(selectedCueIds) : null;
	let previousStart = 0;
	let changedCueCount = 0;
	const nextCues = cues.map((cue) => {
		if (selected && !selected.has(cue.id)) {
			previousStart = Math.max(previousStart, cue.startTime);
			return cue;
		}
		const primaryText = replaceAllLiteral({
			input: cue.primaryText,
			search,
			replace,
		});
		const secondaryText = replaceAllLiteral({
			input: cue.secondaryText,
			search,
			replace,
		});
		const unclampedStart = cue.startTime + timingOffsetSeconds;
		const startTime = Math.max(0, previousStart, unclampedStart);
		const appliedOffset = startTime - cue.startTime;
		const wordTimings = cue.wordTimings.map((word) => ({
			...word,
			start: Math.max(0, word.start + appliedOffset),
			end: Math.max(0, word.end + appliedOffset),
		}));
		const changed =
			primaryText !== cue.primaryText ||
			secondaryText !== cue.secondaryText ||
			startTime !== cue.startTime;
		if (changed) changedCueCount += 1;
		previousStart = startTime;
		return {
			...cue,
			primaryText,
			secondaryText,
			startTime,
			wordTimings,
		};
	});
	return { cues: nextCues, changedCueCount };
}

export interface CaptionSpellingIssue {
	cueId: string;
	kind: "double-space" | "repeated-word";
	message: string;
}

export function reviewCaptionSpelling({
	cues,
}: {
	cues: EditableCaptionCue[];
}): CaptionSpellingIssue[] {
	const issues: CaptionSpellingIssue[] = [];
	for (const cue of cues) {
		if (/\s{2,}/.test(cue.primaryText) || /\s{2,}/.test(cue.secondaryText)) {
			issues.push({
				cueId: cue.id,
				kind: "double-space",
				message: "Contains repeated whitespace",
			});
		}
		if (
			/\b([\p{L}\p{N}]+)\s+\1\b/iu.test(cue.primaryText) ||
			/\b([\p{L}\p{N}]+)\s+\1\b/iu.test(cue.secondaryText)
		) {
			issues.push({
				cueId: cue.id,
				kind: "repeated-word",
				message: "Contains an adjacent repeated word",
			});
		}
	}
	return issues;
}

function normalizeSpelling({ input }: { input: string }): string {
	return input
		.replace(/\b([\p{L}\p{N}]+)(\s+)\1\b/giu, "$1")
		.replace(/[ \t]{2,}/g, " ")
		.trim();
}

export function applyCaptionSpellingFixes({
	cues,
	selectedCueIds,
}: {
	cues: EditableCaptionCue[];
	selectedCueIds?: string[];
}): {
	cues: EditableCaptionCue[];
	changedCueCount: number;
} {
	const selected = selectedCueIds ? new Set(selectedCueIds) : null;
	let changedCueCount = 0;
	const next = cues.map((cue) => {
		if (selected && !selected.has(cue.id)) return cue;
		const primaryText = normalizeSpelling({ input: cue.primaryText });
		const secondaryText = normalizeSpelling({ input: cue.secondaryText });
		if (
			primaryText === cue.primaryText &&
			secondaryText === cue.secondaryText
		) {
			return cue;
		}
		changedCueCount += 1;
		return { ...cue, primaryText, secondaryText };
	});
	return { cues: next, changedCueCount };
}

export function buildCaptionStyleParamPatch({
	style,
	styleId,
	detached = false,
}: {
	style: SubtitleStyleOverrides;
	styleId?: string | null;
	detached?: boolean;
}): ParamValues {
	const params: ParamValues = {
		"caption.styleId": styleId ?? "",
		"caption.styleDetached": detached,
		"caption.inlineStyle": JSON.stringify(style),
	};
	if (style.fontSize !== undefined) params.fontSize = style.fontSize;
	if (style.fontFamily !== undefined) params.fontFamily = style.fontFamily;
	if (style.color !== undefined) params.color = style.color;
	if (style.textAlign !== undefined) params.textAlign = style.textAlign;
	if (style.fontWeight !== undefined) params.fontWeight = style.fontWeight;
	if (style.fontStyle !== undefined) params.fontStyle = style.fontStyle;
	if (style.textDecoration !== undefined) {
		params.textDecoration = style.textDecoration;
	}
	if (style.letterSpacing !== undefined) {
		params.letterSpacing = style.letterSpacing;
	}
	if (style.lineHeight !== undefined) params.lineHeight = style.lineHeight;
	if (style.background?.enabled !== undefined) {
		params["background.enabled"] = style.background.enabled;
	}
	if (style.background?.color !== undefined) {
		params["background.color"] = style.background.color;
	}
	return params;
}

export function buildCaptionElementPatch({
	cue,
}: {
	cue: EditableCaptionCue;
}): Partial<TimelineElement> {
	const content = cue.secondaryText
		? `${cue.primaryText}\n${cue.secondaryText}`
		: cue.primaryText;
	return {
		name: cue.name,
		startTime: mediaTimeFromSeconds({ seconds: cue.startTime }),
		duration: mediaTimeFromSeconds({ seconds: cue.duration }),
		params: {
			content,
			"caption.enabled": true,
			"caption.primaryText": cue.primaryText,
			"caption.secondaryText": cue.secondaryText,
			"caption.speaker": cue.speaker,
			"caption.wordTimings": JSON.stringify(cue.wordTimings),
			"caption.styleId": cue.styleId ?? "",
			"caption.styleDetached": cue.styleDetached,
			"caption.inlineStyle": cue.style ? JSON.stringify(cue.style) : "",
			"caption.secondaryStyle": cue.secondaryStyle
				? JSON.stringify(cue.secondaryStyle)
				: "",
		},
	};
}
