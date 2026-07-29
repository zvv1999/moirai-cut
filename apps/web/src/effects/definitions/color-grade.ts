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
	name: "色彩与影调",
	keywords: [
		"色彩",
		"调色",
		"曝光",
		"对比度",
		"color",
		"grade",
		"exposure",
		"contrast",
		"lut",
		"tone",
	],
	params: [
		{
			key: "exposure",
			label: "曝光",
			type: "number",
			default: 0,
			min: -3,
			max: 3,
			step: 0.05,
		},
		{
			key: "contrast",
			label: "对比度",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
		},
		{
			key: "temperature",
			label: "色温",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
		},
		{
			key: "saturation",
			label: "饱和度",
			type: "number",
			default: 0,
			min: -100,
			max: 200,
			step: 1,
		},
		{
			key: "highlights",
			label: "高光",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
		},
		{
			key: "shadows",
			label: "阴影",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
		},
		{
			key: "curve",
			label: "影调曲线",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
		},
		{
			key: "lutStrength",
			label: "LUT 强度",
			type: "number",
			default: 100,
			min: 0,
			max: 100,
			step: 1,
		},
		{
			key: "lutSource",
			label: "LUT 来源",
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
