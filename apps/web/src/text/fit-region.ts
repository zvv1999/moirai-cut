import { setCanvasLetterSpacing, type TextCanvasContext } from "./layout";
import {
	measureTextLayout,
	resolveTextLayout,
	type TextLayoutParams,
} from "./primitives";

import { balanceMeasuredLines } from "./balance-lines";

const words = new Intl.Segmenter(undefined, { granularity: "word" });

// Glyph measurement belongs to the renderer; Rust supplies the region and line budget.
export function fitTextRegion({
	text,
	canvasHeight,
	ctx,
	maxWidth,
	maxHeight,
	maxLines,
}: {
	text: TextLayoutParams;
	canvasHeight: number;
	ctx: TextCanvasContext;
	maxWidth: number;
	maxHeight: number;
	maxLines: number;
}): TextLayoutParams {
	let paragraphOffset = 0;
	const paragraphs = text.content.split(/\r\n?|\n/).map(content => {
		const start = paragraphOffset;
		paragraphOffset += content.length;
		paragraphOffset += text.content.slice(paragraphOffset, paragraphOffset + 2) === "\r\n" ? 2 : 1;
		return { content, start };
	});
	const lineLimit = Math.max(maxLines, paragraphs.length);
	const candidate = (scale: number, balance = false) => {
		const result = { ...text, fontSize: text.fontSize * scale };
		const resolved = resolveTextLayout({ text: result, canvasHeight });
		ctx.save();
		ctx.font = resolved.fontString;
		setCanvasLetterSpacing({ ctx, letterSpacingPx: resolved.letterSpacing });
		try {
			result.content = paragraphs
				.flatMap(({content: paragraph, start: paragraphStart}) => {
					let segments: string[] = [];
					// Opening punctuation travels with the next word; closing punctuation
					// travels with the previous word. Measure each group before wrapping.
					let opening = "";
					for (const { segment } of words.segment(paragraph)) {
						if (/^[\p{Ps}\p{Pi}]+$/u.test(segment)) {
							opening += segment;
						} else if (opening) {
							if (!segment.trim()) opening += segment;
							else {
								segments.push(opening + segment);
								opening = "";
							}
						} else if (/^\p{P}+$/u.test(segment) && segments.length > 0) {
							segments[segments.length - 1] += segment;
						} else segments.push(segment);
					}
					// Preserve incomplete user text as well as balanced punctuation.
					if (opening) {
						if (segments.length) segments[segments.length - 1] += opening;
						else segments.push(opening);
					}
					const widths = new Map<string, number>();
					const measure = (value: string) => {
						let width = widths.get(value);
						if (width === undefined) {
							width = ctx.measureText(value).width;
							widths.set(value, width);
						}
						return width;
					};
					// These are static content hints, independent of animated highlight ranges.
					const phrases = text.layoutPhrases?.content === text.content
						? text.layoutPhrases.ranges.filter(r => r.start >= paragraphStart
							&& r.end <= paragraphStart + paragraph.length
							&& measure(text.content.slice(r.start, r.end)) <= maxWidth)
						: [];
					if (phrases.length) {
						const grouped: string[][] = [];
						let offset = paragraphStart;
						for (const segment of segments) {
							if (grouped.length && phrases.some(r => r.start < offset && offset < r.end))
								grouped[grouped.length - 1].push(segment);
							else grouped.push([segment]);
							offset += segment.length;
						}
						// Attached punctuation can make one group wider than its hint.
						// Release only that group; other valid phrases still govern wrapping.
						segments = grouped.flatMap(parts => {
							const joined = parts.join("");
							return measure(joined) <= maxWidth ? [joined] : parts;
						});
					}
					const wrap = (width: number) => {
						const lines: string[] = [];
						let line = "";
						for (const segment of segments) {
							const next = line + segment;
							if (
								line.trim() &&
								segment.trim() &&
								measure(next.trimEnd()) > width
							) {
								lines.push(line.trimEnd());
								line = segment.trimStart();
							} else line = next;
						}
						lines.push(line.trimEnd());
						return lines;
					};
					let lines = wrap(maxWidth);
					// Line-length balance is independent of the edge used to align glyphs.
					if (!balance || lines.length < 2)
						return lines;
					const balanced = balanceMeasuredLines(segments, lines.length, maxWidth, measure);
					if (balanced) return balanced;
					// Narrow the wrapping width without adding lines or changing the chosen font.
					const count = lines.length;
					let low = 0,
						high = maxWidth;
					for (let i = 0; i < 12; i++) {
						const mid = (low + high) / 2;
						const next = wrap(mid);
						if (
							next.length <= count &&
							next.every((line) => measure(line) <= maxWidth)
						) {
							high = mid;
							lines = next;
						} else low = mid;
					}
					return lines;
				})
				.join("\n");
		} finally {
			ctx.restore();
		}
		return result;
	};
	const fits = (value: TextLayoutParams) => {
		const layout = measureTextLayout({ text: value, canvasHeight, ctx });
		return (
			layout.lines.length <= lineLimit &&
			layout.block.maxWidth <= maxWidth &&
			(maxHeight <= 0 || layout.block.height <= maxHeight)
		);
	};
	const full = candidate(1);
	if (fits(full)) return candidate(1, true);
	let low = 0,
		high = 1;
	let best = candidate(0.0001);
	for (let i = 0; i < 18; i++) {
		const mid = (low + high) / 2,
			value = candidate(mid);
		if (fits(value)) {
			low = mid;
			best = value;
		} else high = mid;
	}
	const balanced = candidate(best.fontSize / text.fontSize, true);
	return fits(balanced) ? balanced : best;
}
