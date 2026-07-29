import type {
	ParamDefinition,
	ParamValue,
	ParamValues,
} from "@/params";
import { MIN_TRANSFORM_SCALE } from "@/animation/transform";
import type { BlendMode } from "@/rendering";
import type {
	ElementType,
	TimelineElement,
} from "@/timeline";
import { DEFAULTS } from "@/timeline/defaults";
import { VOLUME_DB_MAX, VOLUME_DB_MIN } from "@/timeline/audio-constants";
import {
	AUDIO_FADE_IN_PARAM,
	AUDIO_FADE_OUT_PARAM,
	getAudioFadeDurations,
	setAudioFadeDuration,
} from "@/timeline/audio-envelope";
import {
	CORNER_RADIUS_MAX,
	CORNER_RADIUS_MIN,
} from "@/text/background";

export type ElementParamDefinition<TKey extends string = string> =
	ParamDefinition<TKey> & {
		read?: ({ element }: { element: TimelineElement }) => ParamValue | null;
		write?: ({
			element,
			value,
		}: {
			element: TimelineElement;
			value: ParamValue;
		}) => TimelineElement;
	};

export function buildDefaultParamValues(
	params: readonly ParamDefinition[],
): ParamValues {
	const values: ParamValues = {};
	for (const param of params) {
		values[param.key] = param.default;
	}
	return values;
}

export class DefinitionRegistry<TKey extends string, TDefinition> {
	private definitions = new Map<TKey, TDefinition>();
	private entityName: string;

	constructor(entityName: string) {
		this.entityName = entityName;
	}

	register({
		key,
		definition,
	}: {
		key: TKey;
		definition: TDefinition;
	}): void {
		this.definitions.set(key, definition);
	}

	has(key: TKey): boolean {
		return this.definitions.has(key);
	}

	get(key: TKey): TDefinition {
		const def = this.definitions.get(key);
		if (!def) {
			throw new Error(`Unknown ${this.entityName}: ${key}`);
		}
		return def;
	}

	getAll(): TDefinition[] {
		return Array.from(this.definitions.values());
	}
}

const BLEND_MODE_OPTIONS: Array<{ value: BlendMode; label: string }> = [
	{ value: "normal", label: "正常" },
	{ value: "darken", label: "变暗" },
	{ value: "multiply", label: "正片叠底" },
	{ value: "color-burn", label: "颜色加深" },
	{ value: "lighten", label: "变亮" },
	{ value: "screen", label: "滤色" },
	{ value: "plus-lighter", label: "线性减淡" },
	{ value: "color-dodge", label: "颜色减淡" },
	{ value: "overlay", label: "叠加" },
	{ value: "soft-light", label: "柔光" },
	{ value: "hard-light", label: "强光" },
	{ value: "difference", label: "差值" },
	{ value: "exclusion", label: "排除" },
	{ value: "hue", label: "色相" },
	{ value: "saturation", label: "饱和度" },
	{ value: "color", label: "颜色" },
	{ value: "luminosity", label: "明度" },
];

const visualElementParams: ElementParamDefinition[] = [
	{
		key: "transform.positionX",
		label: "位置 X",
		type: "number",
		default: DEFAULTS.element.transform.position.x,
		min: -100_000,
		step: 1,
		shortLabel: "X",
	},
	{
		key: "transform.positionY",
		label: "位置 Y",
		type: "number",
		default: DEFAULTS.element.transform.position.y,
		min: -100_000,
		step: 1,
		shortLabel: "Y",
	},
	{
		key: "transform.scaleX",
		label: "缩放 X",
		type: "number",
		default: DEFAULTS.element.transform.scaleX,
		min: MIN_TRANSFORM_SCALE,
		step: 0.01,
		displayMultiplier: 100,
		shortLabel: "X",
	},
	{
		key: "transform.scaleY",
		label: "缩放 Y",
		type: "number",
		default: DEFAULTS.element.transform.scaleY,
		min: MIN_TRANSFORM_SCALE,
		step: 0.01,
		displayMultiplier: 100,
		shortLabel: "Y",
	},
	{
		key: "transform.rotate",
		label: "旋转",
		type: "number",
		default: DEFAULTS.element.transform.rotate,
		min: -360,
		max: 360,
		step: 1,
		shortLabel: "°",
	},
	{
		key: "opacity",
		label: "不透明度",
		type: "number",
		default: DEFAULTS.element.opacity,
		min: 0,
		max: 1,
		step: 0.01,
		displayMultiplier: 100,
		shortLabel: "%",
	},
	{
		key: "blendMode",
		label: "混合模式",
		type: "select",
		default: DEFAULTS.element.blendMode,
		keyframable: false,
		options: BLEND_MODE_OPTIONS,
	},
];

const mediaGeometryParams: ElementParamDefinition[] = [
	{
		key: "geometry.mirrorX",
		label: "水平翻转",
		type: "boolean",
		default: false,
		keyframable: false,
	},
	{
		key: "geometry.mirrorY",
		label: "垂直翻转",
		type: "boolean",
		default: false,
		keyframable: false,
	},
	...(["left", "right", "top", "bottom"] as const).map(
		(side): ElementParamDefinition => ({
			key: `crop.${side}`,
			label: {
				left: "左侧",
				right: "右侧",
				top: "顶部",
				bottom: "底部",
			}[side],
			type: "number",
			default: 0,
			min: 0,
			max: 49.5,
			step: 0.5,
		}),
	),
	{
		key: "geometry.cornerRadius",
		label: "圆角",
		type: "number",
		default: 0,
		min: 0,
		max: 50,
		step: 1,
	},
	{
		key: "geometry.shadow.enabled",
		label: "阴影",
		type: "boolean",
		default: false,
		keyframable: false,
	},
	{
		key: "geometry.shadow.color",
		label: "阴影颜色",
		type: "color",
		default: "#00000080",
		dependencies: [{ param: "geometry.shadow.enabled", equals: true }],
	},
	{
		key: "geometry.shadow.blur",
		label: "阴影模糊",
		type: "number",
		default: 0,
		min: 0,
		max: 200,
		step: 1,
		dependencies: [{ param: "geometry.shadow.enabled", equals: true }],
	},
	{
		key: "geometry.shadow.offsetX",
		label: "阴影 X",
		type: "number",
		default: 0,
		min: -500,
		max: 500,
		step: 1,
		dependencies: [{ param: "geometry.shadow.enabled", equals: true }],
	},
	{
		key: "geometry.shadow.offsetY",
		label: "阴影 Y",
		type: "number",
		default: 8,
		min: -500,
		max: 500,
		step: 1,
		dependencies: [{ param: "geometry.shadow.enabled", equals: true }],
	},
	{
		key: "geometry.stroke.width",
		label: "描边宽度",
		type: "number",
		default: 0,
		min: 0,
		max: 200,
		step: 1,
	},
	{
		key: "geometry.stroke.color",
		label: "描边颜色",
		type: "color",
		default: "#ffffff",
	},
];

const audioElementParams: ElementParamDefinition[] = [
	{
		key: "volume",
		label: "音量",
		type: "number",
		default: DEFAULTS.element.volume,
		min: VOLUME_DB_MIN,
		max: VOLUME_DB_MAX,
		step: 0.01,
	},
	{
		key: AUDIO_FADE_IN_PARAM,
		label: "淡入",
		type: "number",
		default: 0,
		min: 0,
		max: 60,
		step: 0.01,
		keyframable: false,
		read: ({ element }) =>
			element.type === "audio" || element.type === "video"
				? getAudioFadeDurations({ element }).fadeInSeconds
				: 0,
		write: ({ element, value }) =>
			(element.type === "audio" || element.type === "video") &&
			typeof value === "number"
				? setAudioFadeDuration({ element, side: "in", seconds: value })
				: element,
	},
	{
		key: AUDIO_FADE_OUT_PARAM,
		label: "淡出",
		type: "number",
		default: 0,
		min: 0,
		max: 60,
		step: 0.01,
		keyframable: false,
		read: ({ element }) =>
			element.type === "audio" || element.type === "video"
				? getAudioFadeDurations({ element }).fadeOutSeconds
				: 0,
		write: ({ element, value }) =>
			(element.type === "audio" || element.type === "video") &&
			typeof value === "number"
				? setAudioFadeDuration({ element, side: "out", seconds: value })
				: element,
	},
	{
		key: "muted",
		label: "静音",
		type: "boolean",
		default: false,
		keyframable: false,
	},
];

const textElementParams: ElementParamDefinition[] = [
	{
		key: "content",
		label: "内容",
		type: "text",
		default: "Default text",
		keyframable: false,
	},
	{
		key: "fontFamily",
		label: "字体",
		type: "font",
		default: "Arial",
		keyframable: false,
	},
	{
		key: "fontSize",
		label: "字号",
		type: "number",
		default: 15,
		min: 1,
		step: 1,
	},
	{
		key: "color",
		label: "颜色",
		type: "color",
		default: "#ffffff",
	},
	{
		key: "textAlign",
		label: "对齐",
		type: "select",
		default: "center",
		keyframable: false,
		options: [
			{ value: "left", label: "左对齐" },
			{ value: "center", label: "居中" },
			{ value: "right", label: "右对齐" },
		],
	},
	{
		key: "fontWeight",
		label: "字重",
		type: "select",
		default: "normal",
		keyframable: false,
		options: [
			{ value: "normal", label: "常规" },
			{ value: "bold", label: "粗体" },
		],
	},
	{
		key: "fontStyle",
		label: "字形",
		type: "select",
		default: "normal",
		keyframable: false,
		options: [
			{ value: "normal", label: "常规" },
			{ value: "italic", label: "斜体" },
		],
	},
	{
		key: "textDecoration",
		label: "装饰",
		type: "select",
		default: "none",
		keyframable: false,
		options: [
			{ value: "none", label: "无" },
			{ value: "underline", label: "下划线" },
			{ value: "line-through", label: "删除线" },
		],
	},
	{
		key: "letterSpacing",
		label: "字间距",
		type: "number",
		default: DEFAULTS.text.letterSpacing,
		min: -100,
		step: 0.1,
	},
	{
		key: "lineHeight",
		label: "行距",
		type: "number",
		default: DEFAULTS.text.lineHeight,
		min: 0.1,
		step: 0.1,
	},
	{
		key: "background.enabled",
		label: "背景",
		type: "boolean",
		default: DEFAULTS.text.background.enabled,
		keyframable: false,
	},
	{
		key: "background.color",
		label: "背景颜色",
		type: "color",
		default: DEFAULTS.text.background.color,
		dependencies: [{ param: "background.enabled", equals: true }],
	},
	{
		key: "background.cornerRadius",
		label: "背景圆角",
		type: "number",
		default: DEFAULTS.text.background.cornerRadius,
		min: CORNER_RADIUS_MIN,
		max: CORNER_RADIUS_MAX,
		step: 1,
		dependencies: [{ param: "background.enabled", equals: true }],
	},
	{
		key: "background.paddingX",
		label: "水平边距",
		type: "number",
		default: DEFAULTS.text.background.paddingX,
		min: 0,
		step: 1,
		dependencies: [{ param: "background.enabled", equals: true }],
	},
	{
		key: "background.paddingY",
		label: "垂直边距",
		type: "number",
		default: DEFAULTS.text.background.paddingY,
		min: 0,
		step: 1,
		dependencies: [{ param: "background.enabled", equals: true }],
	},
	{
		key: "background.offsetX",
		label: "背景 X",
		type: "number",
		default: DEFAULTS.text.background.offsetX,
		min: -100_000,
		step: 1,
		dependencies: [{ param: "background.enabled", equals: true }],
	},
	{
		key: "background.offsetY",
		label: "背景 Y",
		type: "number",
		default: DEFAULTS.text.background.offsetY,
		min: -100_000,
		step: 1,
		dependencies: [{ param: "background.enabled", equals: true }],
	},
];

export const elementParamRegistry = new DefinitionRegistry<
	ElementType,
	readonly ElementParamDefinition[]
>("element params");

elementParamRegistry.register({
	key: "video",
	definition: [
		...visualElementParams,
		...mediaGeometryParams,
		...audioElementParams,
	],
});
elementParamRegistry.register({
	key: "image",
	definition: [...visualElementParams, ...mediaGeometryParams],
});
elementParamRegistry.register({
	key: "text",
	definition: [...textElementParams, ...visualElementParams],
});
elementParamRegistry.register({
	key: "sticker",
	definition: visualElementParams,
});
elementParamRegistry.register({
	key: "graphic",
	definition: [...visualElementParams, ...mediaGeometryParams],
});
elementParamRegistry.register({ key: "audio", definition: audioElementParams });
elementParamRegistry.register({ key: "effect", definition: [] });

export function getElementParams({
	element,
}: {
	element: TimelineElement;
}): readonly ElementParamDefinition[] {
	return elementParamRegistry.has(element.type)
		? elementParamRegistry.get(element.type)
		: [];
}

export function getBuiltInElementParams({
	type,
}: {
	type: ElementType;
}): readonly ElementParamDefinition[] {
	return elementParamRegistry.has(type) ? elementParamRegistry.get(type) : [];
}

export function getElementParam({
	element,
	key,
}: {
	element: TimelineElement;
	key: string;
}): ElementParamDefinition | null {
	return (
		getElementParams({ element }).find((param) => param.key === key) ?? null
	);
}

export function readElementParamValue({
	element,
	param,
}: {
	element: TimelineElement;
	param: ElementParamDefinition;
}): ParamValue | null {
	if (param.read) {
		return param.read({ element });
	}
	if ("params" in element) {
		return element.params[param.key] ?? param.default;
	}
	return null;
}

export function writeElementParamValue({
	element,
	param,
	value,
}: {
	element: TimelineElement;
	param: ElementParamDefinition;
	value: ParamValue;
}): TimelineElement {
	if (param.write) {
		return param.write({ element, value });
	}
	if ("params" in element) {
		return {
			...element,
			params: {
				...element.params,
				[param.key]: value,
			},
		};
	}
	return element;
}

export function buildElementParamValues({
	element,
}: {
	element: TimelineElement;
}): ParamValues {
	const values: ParamValues = {};
	for (const param of getElementParams({ element })) {
		const value = readElementParamValue({ element, param });
		if (value !== null) {
			values[param.key] = value;
		}
	}
	return values;
}
