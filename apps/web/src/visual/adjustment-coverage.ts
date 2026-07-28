export type AdjustmentCompatibleKind =
	| "video"
	| "image"
	| "text"
	| "sticker"
	| "graphic";

export interface AdjustmentSpan {
	id: string;
	trackIndex: number;
	start: number;
	end: number;
}

export interface AdjustmentCandidate extends AdjustmentSpan {
	kind: AdjustmentCompatibleKind | "audio" | "effect";
}

const COMPATIBLE_KINDS = new Set<AdjustmentCandidate["kind"]>([
	"video",
	"image",
	"text",
	"sticker",
	"graphic",
]);

export function resolveAdjustmentCoverage({
	adjustment,
	candidates,
}: {
	adjustment: AdjustmentSpan;
	candidates: AdjustmentCandidate[];
}): string[] {
	return candidates
		.filter(
			(candidate) =>
				candidate.trackIndex > adjustment.trackIndex &&
				COMPATIBLE_KINDS.has(candidate.kind) &&
				candidate.start < adjustment.end &&
				candidate.end > adjustment.start,
		)
		.map((candidate) => candidate.id);
}
