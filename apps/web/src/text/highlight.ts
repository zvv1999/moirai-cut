import type { ParamValues } from "@/params";
import type { ElementAnimations } from "@/animation/types";
import { resolveAnimationPathValueAtTime } from "@/animation/resolve";

export interface TextHighlight {
	content: string;
	start: number;
	end: number;
	color: string;
	stroke?: { color: string; width: number };
}

export function readTextHighlight(
	params: ParamValues,
	animations?: ElementAnimations,
	localTime = 0,
): TextHighlight | undefined {
	if (params["text.highlightEnabled"] !== true) return;
	const encoded = resolveAnimationPathValueAtTime({
		animations,
		localTime,
		propertyPath: "text.highlightRange",
		fallbackValue:
			typeof params["text.highlightRange"] === "string"
				? params["text.highlightRange"]
				: "",
	});
	const color = params["text.highlightColor"];
	if (
		typeof encoded !== "string" ||
		typeof color !== "string" ||
		!/^#[\da-f]{6}$/i.test(color)
	)
		return;
	try {
		const range = JSON.parse(encoded);
		if (
			!range ||
			typeof range.content !== "string" ||
			range.content !== params.content ||
			!Number.isInteger(range.start) ||
			!Number.isInteger(range.end) ||
			range.start < 0 ||
			range.end <= range.start ||
			range.end > range.content.length
		)
			return;
		return {
			content: range.content,
			start: range.start,
			end: range.end,
			color,
			...(params["text.highlightStrokeEnabled"] === true &&
				typeof params["text.highlightStrokeColor"] === "string" &&
				typeof params["text.highlightStrokeWidth"] === "number"
				? { stroke: { color: String(params["text.highlightStrokeColor"]), width: Math.max(0, Math.min(30, Number(params["text.highlightStrokeWidth"]))) } } : {}),
		};
	} catch {
		return;
	}
}

// Wrapping may replace whitespace with line breaks. Match the rendered lines in
// source order, allowing only whitespace to disappear; edited text cannot inherit
// an old highlight range accidentally.
export function highlightLineRanges(
	lines: string[],
	highlight?: TextHighlight,
): Array<{ start: number; end: number } | null> {
	const empty = lines.map(() => null);
	if (!highlight) return empty;
	let cursor = 0;
	const ranges: Array<{ start: number; end: number } | null> = [];
	for (const line of lines) {
		const offset = highlight.content.indexOf(line, cursor);
		if (offset < cursor || highlight.content.slice(cursor, offset).trim())
			return empty;
		const start = Math.max(0, highlight.start - offset);
		const end = Math.min(line.length, highlight.end - offset);
		ranges.push(start < end ? { start, end } : null);
		cursor = offset + line.length;
	}
	return highlight.content.slice(cursor).trim() ? empty : ranges;
}
