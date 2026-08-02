export interface PreviewPrewarmElement {
	type: string;
	mediaId?: string;
	startSeconds: number;
	durationSeconds: number;
}

export function selectVideoPrewarmCandidates({
	elements,
	currentTime,
	lookaheadSeconds,
	maxCandidates,
}: {
	elements: PreviewPrewarmElement[];
	currentTime: number;
	lookaheadSeconds: number;
	maxCandidates: number;
}): string[] {
	const windowEnd = currentTime + Math.max(0, lookaheadSeconds);
	const seen = new Set<string>();
	const candidates = elements
		.filter(
			(element) =>
				element.type === "video" &&
				typeof element.mediaId === "string" &&
				element.startSeconds + element.durationSeconds >=
					currentTime &&
				element.startSeconds <= windowEnd,
		)
		.sort(
			(left, right) =>
				left.startSeconds - right.startSeconds ||
				(left.mediaId ?? "").localeCompare(right.mediaId ?? ""),
		);
	const result: string[] = [];
	for (const candidate of candidates) {
		const mediaId = candidate.mediaId;
		if (!mediaId || seen.has(mediaId)) {
			continue;
		}
		seen.add(mediaId);
		result.push(mediaId);
		if (result.length >= Math.max(0, maxCandidates)) {
			break;
		}
	}
	return result;
}
