import type { EffectDefinition } from "@/effects/types";
import type { ParamValues } from "@/params";

function numberValue({
	params,
	key,
	fallback,
}: {
	params: ParamValues;
	key: string;
	fallback: number;
}): number {
	const value = params[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function qualityValue(params: ParamValues): "fast" | "balanced" | "precise" {
	const value = params.quality;
	return value === "fast" || value === "precise" ? value : "balanced";
}

export const backgroundRemovalEffectDefinition: EffectDefinition = {
	type: "background-removal",
	name: "Background Removal",
	keywords: ["cutout", "subject", "remove background", "segmentation"],
	params: [
		{
			key: "quality",
			label: "Quality",
			type: "select",
			default: "balanced",
			keyframable: false,
			options: [
				{ value: "fast", label: "Fast" },
				{ value: "balanced", label: "Balanced" },
				{ value: "precise", label: "Precise" },
			],
		},
		{
			key: "threshold",
			label: "Background Range",
			type: "number",
			default: 25,
			min: 0,
			max: 100,
			step: 1,
		},
		{
			key: "softness",
			label: "Edge Softness",
			type: "number",
			default: 5,
			min: 0,
			max: 100,
			step: 1,
		},
	],
	renderer: {
		passes: [],
		canvasTreatment: (params) => ({
			backgroundRemoval: {
				quality: qualityValue(params),
				threshold:
					numberValue({ params, key: "threshold", fallback: 25 }) / 100,
				softness: numberValue({ params, key: "softness", fallback: 5 }) / 100,
			},
		}),
	},
};
