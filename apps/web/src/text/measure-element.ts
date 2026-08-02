import { CORNER_RADIUS_MIN } from "@/text/background";
import { DEFAULTS } from "@/timeline/defaults";
import type { TextElement } from "@/timeline";
import type { TextBackground } from "@/text/background";
import { resolveNumberAtTime } from "@/animation/values";
import {
	getTextVisualRect,
} from "./layout";
import {
	measureTextLayout,
	resolveTextLayout,
	type MeasuredTextLayout,
	type TextAlign,
	type TextDecoration,
	type TextFontStyle,
	type TextFontWeight,
	type TextLayoutParams,
} from "./primitives";

export interface ResolvedTextBackground extends TextBackground {
	paddingX: number;
	paddingY: number;
	offsetX: number;
	offsetY: number;
	cornerRadius: number;
}

export interface MeasuredTextElement extends MeasuredTextLayout {
	resolvedBackground: ResolvedTextBackground;
	visualRect: { left: number; top: number; width: number; height: number };
	bilingual?: {
		primary: MeasuredTextLayout;
		secondary: MeasuredTextLayout;
		primaryOffsetY: number;
		secondaryOffsetY: number;
		secondaryColor: string;
	};
}

let textMeasurementContext:
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D
	| null = null;

export function getTextMeasurementContext():
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D {
	if (textMeasurementContext) {
		return textMeasurementContext;
	}

	if (typeof OffscreenCanvas !== "undefined") {
		const canvas = new OffscreenCanvas(1, 1);
		const context = canvas.getContext("2d");
		if (context) {
			textMeasurementContext = context;
			return context;
		}
	}

	if (typeof document !== "undefined") {
		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d");
		if (context) {
			textMeasurementContext = context;
			return context;
		}
	}

	throw new Error("Failed to create text measurement context");
}

export function measureTextElement({
	element,
	canvasHeight,
	localTime,
	ctx,
}: {
	element: TextElement;
	canvasHeight: number;
	localTime: number;
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}): MeasuredTextElement {
	let text = buildTextLayoutParamsFromElement({ element });
	let measuredLayout = measureTextLayout({
		text,
		canvasHeight,
		ctx,
	});
	let bilingual: MeasuredTextElement["bilingual"];
	const primaryText = readStringParam({
		params: element.params,
		key: "caption.primaryText",
		fallback: "",
	});
	const secondaryText = readStringParam({
		params: element.params,
		key: "caption.secondaryText",
		fallback: "",
	});
	if (
		element.params["caption.enabled"] === true &&
		primaryText &&
		secondaryText
	) {
		const maxWidth = readNumberParam({
			params: element.params,
			key: "caption.maxWidth",
			fallback: canvasHeight * 1.42,
		});
		text = {
			...text,
			content: wrapCaptionText({
				text: primaryText,
				layout: text,
				canvasHeight,
				maxWidth,
				ctx,
			}),
		};
		const primary = measureTextLayout({ text, canvasHeight, ctx });
		const secondaryStyle = readSubtitleStyleParam({
			element,
			key: "caption.secondaryStyle",
		});
		const secondaryParams: TextLayoutParams = {
			...text,
			content: secondaryText,
			fontSize:
				secondaryStyle?.fontSize ?? Math.max(1, text.fontSize * 0.72),
			fontFamily: secondaryStyle?.fontFamily ?? text.fontFamily,
			fontWeight: secondaryStyle?.fontWeight ?? "normal",
			fontStyle: secondaryStyle?.fontStyle ?? text.fontStyle,
			textAlign: secondaryStyle?.textAlign ?? text.textAlign,
			textDecoration:
				secondaryStyle?.textDecoration ?? text.textDecoration,
			letterSpacing:
				secondaryStyle?.letterSpacing ?? text.letterSpacing,
			lineHeight: secondaryStyle?.lineHeight ?? text.lineHeight,
		};
		secondaryParams.content = wrapCaptionText({
			text: secondaryText,
			layout: secondaryParams,
			canvasHeight,
			maxWidth,
			ctx,
		});
		const secondary = measureTextLayout({
			text: secondaryParams,
			canvasHeight,
			ctx,
		});
		const gap = Math.max(2, primary.scaledFontSize * 0.16);
		const combinedHeight =
			primary.block.height + gap + secondary.block.height;
		const combinedBlock = {
			height: combinedHeight,
			maxWidth: Math.max(primary.block.maxWidth, secondary.block.maxWidth),
			visualCenterOffset: (combinedHeight - primary.lineHeightPx) / 2,
		};
		measuredLayout = {
			...primary,
			block: combinedBlock,
		};
		bilingual = {
			primary,
			secondary,
			primaryOffsetY:
				-combinedHeight / 2 + primary.block.height / 2,
			secondaryOffsetY:
				combinedHeight / 2 - secondary.block.height / 2,
			secondaryColor: secondaryStyle?.color ?? "#ffd27d",
		};
	}

	const bg = buildTextBackgroundFromElement({ element });
	const resolvedBackground: ResolvedTextBackground = {
		...bg,
		paddingX: resolveNumberAtTime({
			baseValue: bg.paddingX ?? DEFAULTS.text.background.paddingX,
			animations: element.animations,
			propertyPath: "background.paddingX",
			localTime,
		}),
		paddingY: resolveNumberAtTime({
			baseValue: bg.paddingY ?? DEFAULTS.text.background.paddingY,
			animations: element.animations,
			propertyPath: "background.paddingY",
			localTime,
		}),
		offsetX: resolveNumberAtTime({
			baseValue: bg.offsetX ?? DEFAULTS.text.background.offsetX,
			animations: element.animations,
			propertyPath: "background.offsetX",
			localTime,
		}),
		offsetY: resolveNumberAtTime({
			baseValue: bg.offsetY ?? DEFAULTS.text.background.offsetY,
			animations: element.animations,
			propertyPath: "background.offsetY",
			localTime,
		}),
		cornerRadius: resolveNumberAtTime({
			baseValue: bg.cornerRadius ?? CORNER_RADIUS_MIN,
			animations: element.animations,
			propertyPath: "background.cornerRadius",
			localTime,
		}),
	};

	const visualRect = getTextVisualRect({
		textAlign: text.textAlign,
		block: measuredLayout.block,
		background: resolvedBackground,
		fontSizeRatio: measuredLayout.fontSizeRatio,
	});

	return {
		...measuredLayout,
		resolvedBackground,
		visualRect,
		...(bilingual ? { bilingual } : {}),
	};
}

function wrapCaptionText({
	text,
	layout,
	canvasHeight,
	maxWidth,
	ctx,
}: {
	text: string;
	layout: TextLayoutParams;
	canvasHeight: number;
	maxWidth: number;
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}): string {
	const resolved = resolveTextLayout({ text: layout, canvasHeight });
	ctx.save();
	ctx.font = resolved.fontString;
	const paragraphs = text.trim().replace(/\r\n?/g, "\n").split("\n");
	const wrapped = paragraphs.map((paragraph) => {
		const words = paragraph.trim().split(/\s+/).filter(Boolean);
		if (words.length === 0) return "";
		const lines: string[] = [];
		let line = words[0];
		for (const word of words.slice(1)) {
			const candidate = `${line} ${word}`;
			if (ctx.measureText(candidate).width <= maxWidth) {
				line = candidate;
			} else {
				lines.push(line);
				line = word;
			}
		}
		lines.push(line);
		return lines.join("\n");
	});
	ctx.restore();
	return wrapped.join("\n");
}

function readSubtitleStyleParam({
	element,
	key,
}: {
	element: TextElement;
	key: string;
}): {
	fontSize?: number;
	fontFamily?: string;
	fontWeight?: TextFontWeight;
	fontStyle?: TextFontStyle;
	textAlign?: TextAlign;
	textDecoration?: TextDecoration;
	letterSpacing?: number;
	lineHeight?: number;
	color?: string;
} | null {
	const value = element.params[key];
	if (typeof value !== "string" || !value) return null;
	try {
		const parsed: unknown = JSON.parse(value);
		if (!isUnknownRecord(parsed)) return null;
		const record = parsed;
		return {
			...(typeof record.fontSize === "number"
				? { fontSize: record.fontSize }
				: {}),
			...(typeof record.fontFamily === "string"
				? { fontFamily: record.fontFamily }
				: {}),
			...(record.fontWeight === "normal" || record.fontWeight === "bold"
				? { fontWeight: record.fontWeight }
				: {}),
			...(record.fontStyle === "normal" || record.fontStyle === "italic"
				? { fontStyle: record.fontStyle }
				: {}),
			...(record.textAlign === "left" ||
			record.textAlign === "center" ||
			record.textAlign === "right"
				? { textAlign: record.textAlign }
				: {}),
			...(record.textDecoration === "none" ||
			record.textDecoration === "underline" ||
			record.textDecoration === "line-through"
				? { textDecoration: record.textDecoration }
				: {}),
			...(typeof record.letterSpacing === "number"
				? { letterSpacing: record.letterSpacing }
				: {}),
			...(typeof record.lineHeight === "number"
				? { lineHeight: record.lineHeight }
				: {}),
			...(typeof record.color === "string"
				? { color: record.color }
				: {}),
		};
	} catch {
		return null;
	}
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildTextLayoutParamsFromElement({
	element,
}: {
	element: TextElement;
}): TextLayoutParams {
	return {
		content: readStringParam({
			params: element.params,
			key: "content",
			fallback: "Default text",
		}),
		fontSize: readNumberParam({
			params: element.params,
			key: "fontSize",
			fallback: 15,
		}),
		fontFamily: readStringParam({
			params: element.params,
			key: "fontFamily",
			fallback: "Arial",
		}),
		fontWeight: readFontWeight({
			value: element.params.fontWeight,
			fallback: "normal",
		}),
		fontStyle: readFontStyle({
			value: element.params.fontStyle,
			fallback: "normal",
		}),
		textAlign: readTextAlign({
			value: element.params.textAlign,
			fallback: "center",
		}),
		textDecoration: readTextDecoration({
			value: element.params.textDecoration,
			fallback: "none",
		}),
		letterSpacing: readNumberParam({
			params: element.params,
			key: "letterSpacing",
			fallback: DEFAULTS.text.letterSpacing,
		}),
		lineHeight: readNumberParam({
			params: element.params,
			key: "lineHeight",
			fallback: DEFAULTS.text.lineHeight,
		}),
	};
}

export function buildTextBackgroundFromElement({
	element,
}: {
	element: TextElement;
}): TextBackground {
	return {
		enabled: readBooleanParam({
			params: element.params,
			key: "background.enabled",
			fallback: DEFAULTS.text.background.enabled,
		}),
		color: readStringParam({
			params: element.params,
			key: "background.color",
			fallback: DEFAULTS.text.background.color,
		}),
		cornerRadius: readNumberParam({
			params: element.params,
			key: "background.cornerRadius",
			fallback: DEFAULTS.text.background.cornerRadius,
		}),
		paddingX: readNumberParam({
			params: element.params,
			key: "background.paddingX",
			fallback: DEFAULTS.text.background.paddingX,
		}),
		paddingY: readNumberParam({
			params: element.params,
			key: "background.paddingY",
			fallback: DEFAULTS.text.background.paddingY,
		}),
		offsetX: readNumberParam({
			params: element.params,
			key: "background.offsetX",
			fallback: DEFAULTS.text.background.offsetX,
		}),
		offsetY: readNumberParam({
			params: element.params,
			key: "background.offsetY",
			fallback: DEFAULTS.text.background.offsetY,
		}),
	};
}

function readStringParam({
	params,
	key,
	fallback,
}: {
	params: TextElement["params"];
	key: string;
	fallback: string;
}): string {
	const value = params[key];
	return typeof value === "string" ? value : fallback;
}

function readNumberParam({
	params,
	key,
	fallback,
}: {
	params: TextElement["params"];
	key: string;
	fallback: number;
}): number {
	const value = params[key];
	return typeof value === "number" ? value : fallback;
}

function readBooleanParam({
	params,
	key,
	fallback,
}: {
	params: TextElement["params"];
	key: string;
	fallback: boolean;
}): boolean {
	const value = params[key];
	return typeof value === "boolean" ? value : fallback;
}

function readTextAlign({
	value,
	fallback,
}: {
	value: unknown;
	fallback: TextAlign;
}): TextAlign {
	return value === "left" || value === "center" || value === "right"
		? value
		: fallback;
}

function readFontWeight({
	value,
	fallback,
}: {
	value: unknown;
	fallback: TextFontWeight;
}): TextFontWeight {
	return value === "bold" || value === "normal" ? value : fallback;
}

function readFontStyle({
	value,
	fallback,
}: {
	value: unknown;
	fallback: TextFontStyle;
}): TextFontStyle {
	return value === "italic" || value === "normal" ? value : fallback;
}

function readTextDecoration({
	value,
	fallback,
}: {
	value: unknown;
	fallback: TextDecoration;
}): TextDecoration {
	return value === "none" || value === "underline" || value === "line-through"
		? value
		: fallback;
}
