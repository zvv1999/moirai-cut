import type { TextCanvasContext, TextBlockMeasurement } from "@/text/layout";
import { DEFAULTS } from "@/timeline/defaults";
import { clamp } from "@/utils/math";
import { CORNER_RADIUS_MAX, CORNER_RADIUS_MIN } from "./background";
import {
	drawTextDecoration,
	getTextBackgroundRect,
	measureTextBlock,
	setCanvasLetterSpacing,
} from "./layout";
import { FONT_SIZE_SCALE_REFERENCE } from "./typography";
import type { VisualAppearance } from "@/visual/appearance";
import { highlightLineRanges, type TextHighlight } from "./highlight";

export type TextAlign = "left" | "center" | "right";
export type TextFontWeight = "normal" | "bold" | `${number}`;

export function resolveFontWeight(value: unknown): TextFontWeight {
	if (value === "normal" || value === "bold") return value;
	if ((typeof value === "string" && /^\d{3}$/.test(value)) || typeof value === "number") {
		const weight = Number(value);
		if (Number.isInteger(weight) && weight >= 100 && weight <= 900) return String(weight) as `${number}`;
	}
	return "normal";
}
export type TextFontStyle = "normal" | "italic";
export type TextDecoration = "none" | "underline" | "line-through";

export interface TextLayoutParams {
	content: string;
	layoutPhrases?: { content: string; ranges: { start: number; end: number }[] };
	highlight?: TextHighlight;
	fontSize: number;
	fontFamily: string;
	fontWeight: TextFontWeight;
	fontStyle: TextFontStyle;
	textAlign: TextAlign;
	textDecoration?: TextDecoration;
	letterSpacing?: number;
	lineHeight?: number;
}

export interface ResolvedTextLayout {
	scaledFontSize: number;
	fontString: string;
	letterSpacing: number;
	lineHeightPx: number;
	fontSizeRatio: number;
	textAlign: TextAlign;
	textDecoration: TextDecoration;
}

export interface MeasuredTextLayout extends ResolvedTextLayout {
	highlight?: TextHighlight;
	lines: string[];
	lineMetrics: TextMetrics[];
	block: TextBlockMeasurement;
}

export interface ResolvedTextBackgroundLike {
	enabled: boolean;
	color: string;
	opacity?: number;
	paddingX: number;
	paddingY: number;
	offsetX: number;
	offsetY: number;
	cornerRadius: number;
}

export function quoteFontFamily({ fontFamily }: { fontFamily: string }): string {
	return `"${fontFamily.replace(/"/g, '\\"')}"`;
}

export function buildTextFontString({
	fontFamily,
	fontWeight,
	fontStyle,
	scaledFontSize,
}: {
	fontFamily: string;
	fontWeight: TextFontWeight;
	fontStyle: TextFontStyle;
	scaledFontSize: number;
}): string {
	return `${fontStyle} ${fontWeight} ${scaledFontSize}px ${quoteFontFamily({ fontFamily })}, sans-serif`;
}

export function resolveTextLayout({
	text,
	canvasHeight,
}: {
	text: TextLayoutParams;
	canvasHeight: number;
}): ResolvedTextLayout {
	const scaledFontSize =
		text.fontSize * (canvasHeight / FONT_SIZE_SCALE_REFERENCE);
	const fontWeight = resolveFontWeight(text.fontWeight);
	const fontStyle = text.fontStyle === "italic" ? "italic" : "normal";
	const letterSpacing = text.letterSpacing ?? DEFAULTS.text.letterSpacing;
	const lineHeightPx =
		scaledFontSize * (text.lineHeight ?? DEFAULTS.text.lineHeight);
	const fontSizeRatio = text.fontSize / 15;

	return {
		scaledFontSize,
		fontString: buildTextFontString({
			fontFamily: text.fontFamily,
			fontWeight,
			fontStyle,
			scaledFontSize,
		}),
		letterSpacing,
		lineHeightPx,
		fontSizeRatio,
		textAlign: text.textAlign,
		textDecoration: text.textDecoration ?? "none",
	};
}

export function measureTextLayout({
	text,
	canvasHeight,
	ctx,
}: {
	text: TextLayoutParams;
	canvasHeight: number;
	ctx: TextCanvasContext;
}): MeasuredTextLayout {
	const resolvedLayout = resolveTextLayout({ text, canvasHeight });
	const lines = text.content.split("\n");

	ctx.save();
	ctx.font = resolvedLayout.fontString;
	ctx.textBaseline = "middle";
	setCanvasLetterSpacing({
		ctx,
		letterSpacingPx: resolvedLayout.letterSpacing,
	});
	const lineMetrics = lines.map((line) => ctx.measureText(line));
	ctx.restore();

	const block = measureTextBlock({
		lineMetrics,
		lineHeightPx: resolvedLayout.lineHeightPx,
	});

	return {
		...resolvedLayout,
		highlight: text.highlight,
		lines,
		lineMetrics,
		block,
	};
}

export function drawMeasuredTextLayout({
	ctx,
	layout,
	textColor,
	background,
	backgroundColor,
	textBaseline = "middle",
	appearance,
}: {
	ctx: TextCanvasContext;
	layout: MeasuredTextLayout;
	textColor: string;
	background?: ResolvedTextBackgroundLike | null;
	backgroundColor?: string;
	textBaseline?: CanvasTextBaseline;
	appearance?: Pick<VisualAppearance, "shadow" | "stroke">;
}): void {
	ctx.font = layout.fontString;
	ctx.textAlign = layout.textAlign;
	ctx.textBaseline = textBaseline;
	ctx.fillStyle = textColor;
	setCanvasLetterSpacing({ ctx, letterSpacingPx: layout.letterSpacing });

	drawMeasuredTextBackground({
		ctx,
		layout,
		background,
		backgroundColor,
	});
	ctx.fillStyle = textColor;

	ctx.save();
	if (appearance?.shadow.enabled) {
		ctx.shadowColor = appearance.shadow.color;
		ctx.shadowBlur = appearance.shadow.blur;
		ctx.shadowOffsetX = appearance.shadow.offsetX;
		ctx.shadowOffsetY = appearance.shadow.offsetY;
	}
	const highlights = highlightLineRanges(layout.lines, layout.highlight);
	for (let index = 0; index < layout.lines.length; index++) {
		const lineY = index * layout.lineHeightPx - layout.block.visualCenterOffset;
		const selected = highlights[index];
		const localStroke = layout.highlight?.stroke;
		if (selected && localStroke) {
			const line = layout.lines[index];
			const width = layout.lineMetrics[index].width;
			const origin = layout.textAlign === "center" ? -width / 2 : layout.textAlign === "right" ? -width : 0;
			const spans = [[0, selected.start, appearance?.stroke], [selected.start, selected.end, localStroke], [selected.end, line.length, appearance?.stroke]] as const;
			ctx.save();
			ctx.textAlign = "left";
			ctx.lineJoin = "round";
			for (const [start, end, stroke] of spans) {
				if (end <= start || !stroke || stroke.width <= 0) continue;
				ctx.strokeStyle = stroke.color;
				ctx.lineWidth = stroke.width * 2;
				ctx.strokeText(line.slice(start, end), origin + ctx.measureText(line.slice(0, start)).width, lineY);
			}
			ctx.restore();
		} else if (appearance && appearance.stroke.width > 0) {
			ctx.strokeStyle = appearance.stroke.color;
			ctx.lineWidth = appearance.stroke.width * 2;
			ctx.lineJoin = "round";
			ctx.strokeText(layout.lines[index], 0, lineY);
		}
		// When outlined, the outer stroke already casts the glyph shadow.
		ctx.save();
		if (appearance && appearance.stroke.width > 0) ctx.shadowColor = "transparent";
		const range = highlights[index];
		ctx.fillStyle = textColor;
		if (range && layout.highlight && layout.lineMetrics[index].width > 0) {
			const line = layout.lines[index];
			const width = layout.lineMetrics[index].width;
			const origin = layout.textAlign === "center" ? -width / 2 : layout.textAlign === "right" ? -width : 0;
			const start = Math.min(1, ctx.measureText(line.slice(0, range.start)).width / width);
			const end = Math.max(start, Math.min(1, ctx.measureText(line.slice(0, range.end)).width / width));
			// Hard color stops avoid fragment shaping or double-painted glyphs.
			const fill = ctx.createLinearGradient(origin, 0, origin + width, 0);
			for (const [at, color] of [[0, textColor], [start, textColor], [start, layout.highlight.color],
				[end, layout.highlight.color], [end, textColor], [1, textColor]] as const) fill.addColorStop(at, color);
			ctx.fillStyle = fill;
		}
		if (selected && localStroke && layout.highlight) {
			const line = layout.lines[index], width = layout.lineMetrics[index].width;
			const origin = layout.textAlign === "center" ? -width / 2 : layout.textAlign === "right" ? -width : 0;
			ctx.textAlign = "left";
			for (const [start, end, color] of [[0, selected.start, textColor], [selected.start, selected.end, layout.highlight.color], [selected.end, line.length, textColor]] as const) {
				ctx.fillStyle = color;
				ctx.fillText(line.slice(start, end), origin + ctx.measureText(line.slice(0, start)).width, lineY);
			}
		} else ctx.fillText(layout.lines[index], 0, lineY);
		ctx.restore();
		drawTextDecoration({
			ctx,
			textDecoration: layout.textDecoration,
			lineWidth: layout.lineMetrics[index].width,
			lineY,
			metrics: layout.lineMetrics[index],
			scaledFontSize: layout.scaledFontSize,
			textAlign: layout.textAlign,
		});
	}
	ctx.restore();
}

export function drawMeasuredTextBackground({
	ctx,
	layout,
	background,
	backgroundColor,
}: {
	ctx: TextCanvasContext;
	layout: MeasuredTextLayout;
	background?: ResolvedTextBackgroundLike | null;
	backgroundColor?: string;
}): void {
	if (
		background?.enabled &&
		backgroundColor &&
		backgroundColor !== "transparent" &&
		layout.block.height > 0
	) {
		const backgroundRect = getTextBackgroundRect({
			textAlign: layout.textAlign,
			block: layout.block,
			background: {
				...background,
				color: backgroundColor,
			},
			fontSizeRatio: layout.fontSizeRatio,
		});
		if (backgroundRect) {
			const p =
				clamp({
					value: background.cornerRadius,
					min: CORNER_RADIUS_MIN,
					max: CORNER_RADIUS_MAX,
				}) / 100;
			const radius =
				(Math.min(backgroundRect.width, backgroundRect.height) / 2) * p;
			ctx.save();
			ctx.globalAlpha *= Math.max(0, Math.min(1, background.opacity ?? 1));
			ctx.fillStyle = backgroundColor;
			ctx.beginPath();
			ctx.roundRect(
				backgroundRect.left,
				backgroundRect.top,
				backgroundRect.width,
				backgroundRect.height,
				radius,
			);
			ctx.fill();
			ctx.restore();
		}
	}
}

export function strokeMeasuredTextLayout({
	ctx,
	layout,
	strokeColor,
	strokeWidth,
	textBaseline = "middle",
}: {
	ctx: TextCanvasContext;
	layout: MeasuredTextLayout;
	strokeColor: string;
	strokeWidth: number;
	textBaseline?: CanvasTextBaseline;
}): void {
	ctx.font = layout.fontString;
	ctx.textAlign = layout.textAlign;
	ctx.textBaseline = textBaseline;
	ctx.strokeStyle = strokeColor;
	ctx.lineWidth = strokeWidth;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	setCanvasLetterSpacing({ ctx, letterSpacingPx: layout.letterSpacing });

	for (let index = 0; index < layout.lines.length; index++) {
		const lineY = index * layout.lineHeightPx - layout.block.visualCenterOffset;
		ctx.strokeText(layout.lines[index], 0, lineY);
	}
}
