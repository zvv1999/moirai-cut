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

export const chromaKeyEffectDefinition: EffectDefinition = {
	type: "chroma-key",
	name: "色度抠图",
	keywords: [
		"色度抠图",
		"绿幕",
		"去色",
		"green screen",
		"key",
		"remove color",
		"background",
	],
	params: [
		{
			key: "keyColor",
			label: "吸取颜色",
			type: "color",
			default: "#00ff00",
		},
		{
			key: "similarity",
			label: "相似度",
			type: "number",
			default: 20,
			min: 0,
			max: 100,
			step: 1,
		},
		{
			key: "softness",
			label: "边缘柔化",
			type: "number",
			default: 10,
			min: 0,
			max: 100,
			step: 1,
		},
		{
			key: "spill",
			label: "溢色抑制",
			type: "number",
			default: 50,
			min: 0,
			max: 100,
			step: 1,
		},
	],
	renderer: {
		passes: [],
		canvasTreatment: (params) => ({
			chromaKey: {
				keyColor:
					typeof params.keyColor === "string" ? params.keyColor : "#00ff00",
				similarity:
					numberValue({ params, key: "similarity", fallback: 20 }) / 100,
				softness: numberValue({ params, key: "softness", fallback: 10 }) / 100,
				spill: numberValue({ params, key: "spill", fallback: 50 }) / 100,
			},
		}),
	},
};
