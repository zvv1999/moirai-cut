import type { EffectDefinition } from "@/effects/types";
import type { ParamValues } from "@/params";
import { buildVisualCssFilter } from "@/visual/appearance";

function readNumber({
	params,
	key,
}: {
	params: ParamValues;
	key: string;
}): number {
	const value = params[key];
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export const colorGradeEffectDefinition: EffectDefinition = {
	type: "color-grade",
	name: "Color & Tone",
	keywords: ["color", "grade", "exposure", "contrast", "lut", "tone"],
	params: [
		{
			key: "exposure",
			label: "Exposure",
			type: "number",
			default: 0,
			min: -3,
			max: 3,
			step: 0.05,
		},
		{
			key: "contrast",
			label: "Contrast",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
		},
		{
			key: "temperature",
			label: "Temperature",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
		},
		{
			key: "saturation",
			label: "Saturation",
			type: "number",
			default: 0,
			min: -100,
			max: 200,
			step: 1,
		},
		{
			key: "highlights",
			label: "Highlights",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
		},
		{
			key: "shadows",
			label: "Shadows",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
		},
		{
			key: "curve",
			label: "Tone Curve",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
		},
		{
			key: "lutStrength",
			label: "LUT Strength",
			type: "number",
			default: 100,
			min: 0,
			max: 100,
			step: 1,
		},
		{
			key: "lutSource",
			label: "LUT Source",
			type: "text",
			default: "",
			keyframable: false,
		},
	],
	renderer: {
		passes: [],
		canvasFilter: (params) =>
			buildVisualCssFilter({
				exposure: readNumber({ params, key: "exposure" }),
				contrast: readNumber({ params, key: "contrast" }),
				temperature: readNumber({ params, key: "temperature" }),
				saturation: readNumber({ params, key: "saturation" }),
				highlights: readNumber({ params, key: "highlights" }),
				shadows: readNumber({ params, key: "shadows" }),
				curve: readNumber({ params, key: "curve" }),
			}),
	},
};
