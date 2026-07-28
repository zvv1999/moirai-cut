export type MaskCombineMode = "add" | "intersect" | "subtract" | "exclude";

export interface MaskStackItem {
	id: string;
	combineMode?: MaskCombineMode;
	feather: number;
	inverted: boolean;
}

export interface MaskStackStep {
	id: string;
	compositeOperation:
		| "source-over"
		| "destination-in"
		| "destination-out"
		| "xor";
	inverted: boolean;
}

const COMPOSITE_BY_MODE: Record<
	MaskCombineMode,
	MaskStackStep["compositeOperation"]
> = {
	add: "source-over",
	intersect: "destination-in",
	subtract: "destination-out",
	exclude: "xor",
};

export function buildMaskStackPlan({
	masks,
}: {
	masks: MaskStackItem[];
}): { maxFeather: number; steps: MaskStackStep[] } {
	return {
		maxFeather: masks.reduce(
			(maximum, mask) =>
				Math.max(maximum, Number.isFinite(mask.feather) ? mask.feather : 0),
			0,
		),
		steps: masks.map((mask, index) => ({
			id: mask.id,
			compositeOperation:
				index === 0
					? "source-over"
					: COMPOSITE_BY_MODE[mask.combineMode ?? "add"],
			inverted: mask.inverted,
		})),
	};
}
