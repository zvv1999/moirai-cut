import type { EditableCaptionCue } from "./caption-model";

export type CaptionQualityIssueKind =
	| "line-length"
	| "unsafe-placement"
	| "overlap"
	| "gap"
	| "unreadable-duration"
	| "out-of-bounds";

export interface CaptionQualityIssue {
	id: string;
	kind: CaptionQualityIssueKind;
	cueId: string;
	message: string;
}

export function auditCaptionCues({
	cues,
	timelineDurationSeconds,
	canvasHeight,
	maxLineCharacters = 42,
	maxGapSeconds = 4,
	minDurationSeconds = 0.7,
	maxCharactersPerSecond = 22,
}: {
	cues: EditableCaptionCue[];
	timelineDurationSeconds: number;
	canvasHeight: number;
	maxLineCharacters?: number;
	maxGapSeconds?: number;
	minDurationSeconds?: number;
	maxCharactersPerSecond?: number;
}): CaptionQualityIssue[] {
	const issues: CaptionQualityIssue[] = [];
	const add = ({
		cue,
		kind,
		message,
	}: {
		cue: EditableCaptionCue;
		kind: CaptionQualityIssueKind;
		message: string;
	}) => {
		issues.push({
			id: `${kind}:${cue.id}`,
			kind,
			cueId: cue.id,
			message,
		});
	};

	for (const cue of cues) {
		const longestLine = Math.max(
			0,
			...cue.primaryText.split("\n").map((line) => line.length),
			...cue.secondaryText.split("\n").map((line) => line.length),
		);
		if (longestLine > maxLineCharacters) {
			add({
				cue,
				kind: "line-length",
				message: `${longestLine} characters on one line`,
			});
		}
	}

	const safeVerticalOffset = canvasHeight * 0.42;
	for (const cue of cues) {
		if (Math.abs(cue.positionY) > safeVerticalOffset) {
			add({
				cue,
				kind: "unsafe-placement",
				message: "Caption is outside the title-safe vertical area",
			});
		}
	}

	for (let index = 1; index < cues.length; index += 1) {
		const previous = cues[index - 1];
		const cue = cues[index];
		const previousEnd = previous.startTime + previous.duration;
		if (cue.startTime < previousEnd) {
			add({
				cue,
				kind: "overlap",
				message: `Overlaps the previous cue by ${(previousEnd - cue.startTime).toFixed(2)}s`,
			});
		} else if (cue.startTime - previousEnd > maxGapSeconds) {
			add({
				cue,
				kind: "gap",
				message: `${(cue.startTime - previousEnd).toFixed(2)}s gap after the previous cue`,
			});
		}
	}

	for (const cue of cues) {
		const characterCount = `${cue.primaryText}${cue.secondaryText}`.length;
		const readingSpeed =
			cue.duration > 0 ? characterCount / cue.duration : Number.POSITIVE_INFINITY;
		if (
			cue.duration < minDurationSeconds ||
			readingSpeed > maxCharactersPerSecond
		) {
			add({
				cue,
				kind: "unreadable-duration",
				message: `${readingSpeed.toFixed(1)} characters per second`,
			});
		}
	}

	for (const cue of cues) {
		if (
			cue.startTime < 0 ||
			cue.startTime + cue.duration > timelineDurationSeconds
		) {
			add({
				cue,
				kind: "out-of-bounds",
				message: "Cue extends beyond the timeline bounds",
			});
		}
	}

	return issues;
}
