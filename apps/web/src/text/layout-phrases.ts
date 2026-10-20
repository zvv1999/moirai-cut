import type { TextLayoutParams } from "./primitives";

/** Ignore stale or malformed content metadata after direct text edits. */
export function readLayoutPhrases(value: unknown, content: unknown): TextLayoutParams["layoutPhrases"] {
	if (typeof value !== "string" || typeof content !== "string") return undefined;
	try {
		const data = JSON.parse(value);
		if (!data || data.content !== content || !Array.isArray(data.ranges)) return undefined;
		let end = 0;
		for (const range of data.ranges) {
			if (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end)
				|| range.start < end || range.start >= range.end || range.end > content.length) return undefined;
			// A UTF-16 boundary cannot bisect a surrogate pair.
			for (const offset of [range.start, range.end]) {
				if (offset > 0 && offset < content.length && /[\uD800-\uDBFF]/u.test(content[offset - 1]) && /[\uDC00-\uDFFF]/u.test(content[offset])) return undefined;
			}
			end = range.end;
		}
		return data;
	} catch { return undefined; }
}
