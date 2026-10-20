import { BaseNode } from "./base-node";
import type { TextElement } from "@/timeline";
import type { CanvasEffectTreatment, EffectPass } from "@/effects/types";
import type { BlendMode, Transform } from "@/rendering";
import {
	drawMeasuredTextBackground,
	drawMeasuredTextLayout,
} from "@/text/primitives";
import type { MeasuredTextElement } from "@/text/measure-element";
import type { VisualAppearance } from "@/visual/appearance";

export type TextNodeParams = TextElement & {
	transform: Transform;
	opacity: number;
	blendMode?: BlendMode;
	canvasCenter: { x: number; y: number };
	canvasHeight: number;
	textBaseline?: CanvasTextBaseline;
	appearance: VisualAppearance;
};

export interface ResolvedTextNodeState {
	transform: Transform;
	opacity: number;
	textColor: string;
	backgroundColor: string;
	effectPasses: EffectPass[][];
	canvasEffects: CanvasEffectTreatment[];
	measuredText: MeasuredTextElement;
}

export class TextNode extends BaseNode<TextNodeParams, ResolvedTextNodeState> {}

export function renderTextToContext({
	node,
	ctx,
}: {
	node: TextNode;
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}): void {
	const resolved = node.resolved;
	if (!resolved) {
		return;
	}

	const x = resolved.transform.position.x + node.params.canvasCenter.x;
	const y = resolved.transform.position.y + node.params.canvasCenter.y;
	const baseline = node.params.textBaseline ?? "middle";

	ctx.save();
	if (node.params.params["clip.enabled"] === true) {
		const p = node.params.params;
		ctx.beginPath();
		ctx.rect(Number(p["clip.x"] ?? 0), Number(p["clip.y"] ?? 0), Math.max(0, Number(p["clip.width"] ?? 100)), Math.max(0, Number(p["clip.height"] ?? 100)));
		ctx.clip();
	}
	ctx.translate(x, y);
	if (resolved.transform.basis) {
		ctx.transform(...resolved.transform.basis, 0, 0);
	} else {
	if (resolved.transform.rotate) {
		ctx.rotate((resolved.transform.rotate * Math.PI) / 180);
	}
	ctx.scale(resolved.transform.scaleX, resolved.transform.scaleY);
	}

	if (resolved.measuredText.bilingual) {
		const bilingual = resolved.measuredText.bilingual;
		drawMeasuredTextBackground({
			ctx,
			layout: resolved.measuredText,
			background: resolved.measuredText.resolvedBackground,
			backgroundColor: resolved.backgroundColor,
		});
		ctx.save();
		ctx.translate(0, bilingual.primaryOffsetY);
		drawMeasuredTextLayout({
			ctx,
			layout: bilingual.primary,
			textColor: resolved.textColor,
			textBaseline: baseline,
			appearance: node.params.appearance,
		});
		ctx.restore();
		ctx.save();
		ctx.translate(0, bilingual.secondaryOffsetY);
		drawMeasuredTextLayout({
			ctx,
			layout: bilingual.secondary,
			textColor: bilingual.secondaryColor,
			textBaseline: baseline,
			appearance: node.params.appearance,
		});
		ctx.restore();
	} else {
		drawMeasuredTextLayout({
			ctx,
			layout: resolved.measuredText,
			textColor: resolved.textColor,
			background: resolved.measuredText.resolvedBackground,
			backgroundColor: resolved.backgroundColor,
			textBaseline: baseline,
			appearance: node.params.appearance,
		});
	}

	ctx.restore();
}
