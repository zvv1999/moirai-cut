import {
	parseColorToLinearRgba,
	type ParamDefinition,
	type ParamValues,
} from "@/params";
import { applyAlignedStroke } from "../stroke";
import { STROKE_ALIGN_PARAM, type GraphicStrokeAlign } from "./shared";
import type { GraphicDefinition } from "../types";

interface EllipseParams {
	fill: string;
	stroke: string;
	strokeWidth: number;
	strokeAlign: GraphicStrokeAlign;
	arcStart: number;
	arcSweep: number;
	strokeCap: "round" | "butt";
	strokeReveal: number;
}

const ELLIPSE_PARAMS: ParamDefinition<keyof EllipseParams & string>[] = [
	{
		key: "fill",
		label: "Fill",
		type: "color",
		default: "#ffffff",
	},
	{
		key: "stroke",
		label: "Color",
		type: "color",
		default: "#000000",
		group: "stroke",
	},
	{
		key: "strokeWidth",
		label: "Width",
		type: "number",
		default: 0,
		min: 0,
		max: 64,
		step: 1,
		shortLabel: "W",
		group: "stroke",
	},
	STROKE_ALIGN_PARAM,
	{
		key: "arcStart",
		label: "起始角度",
		type: "number",
		default: 0,
		min: -360,
		max: 360,
		step: 1,
		shortLabel: "°",
		group: "stroke",
		keyframable: false,
	},
	{
		key: "arcSweep",
		label: "扫过角度",
		type: "number",
		default: 360,
		min: 0.01,
		max: 360,
		step: 0.1,
		shortLabel: "°",
		group: "stroke",
		keyframable: false,
	},
	{
		key: "strokeCap",
		label: "弧线端点",
		type: "select",
		default: "butt",
		group: "stroke",
		keyframable: false,
		options: [
			{ value: "butt", label: "平头" },
			{ value: "round", label: "圆头" },
		],
	},
	{
		key: "strokeReveal",
		label: "描边显现",
		type: "number",
		default: 1,
		min: 0,
		max: 1,
		step: 0.01,
		displayMultiplier: 100,
		shortLabel: "%",
		group: "stroke",
	},
];

/** Rendering capability only; authoring validation remains in Rust. */
export function ellipseArcState(params: ParamValues) {
	const start = Number(params.arcStart ?? 0),
		sweep = Number(params.arcSweep ?? 360),
		rawReveal = Number(params.strokeReveal ?? 1);
	// Easing curves can overshoot valid keys. Limit only the drawn progress.
	const reveal = Number.isFinite(rawReveal)
		? Math.max(0, Math.min(1, rawReveal))
		: 0;
	const partial = sweep < 360 || reveal < 1;
	let issue: string | null = null;
	if (
		!Number.isFinite(start) ||
		start < -360 ||
		start > 360 ||
		!Number.isFinite(sweep) ||
		sweep <= 0 ||
		sweep > 360 ||
		!Number.isFinite(rawReveal)
	)
		issue = "弧线角度或描边进度无效。";
	else if (
		params.strokeCap !== undefined &&
		params.strokeCap !== "round" &&
		params.strokeCap !== "butt"
	)
		issue = "弧线端点只支持平头或圆头。";
	else if (partial && (params.strokeAlign ?? "center") !== "center")
		issue = "开放弧线与描边显现仅支持中心描边，请调整描边对齐。";
	else if (
		partial &&
		parseColorToLinearRgba({ color: String(params.fill ?? "#ffffff") })?.a !== 0
	)
		issue = "开放弧线与描边显现仅支持透明填充，请先移除填充。";
	return { start, sweep, reveal, partial, issue };
}

export const ellipseGraphicDefinition: GraphicDefinition = {
	id: "ellipse",
	name: "Ellipse",
	keywords: ["ellipse", "circle", "oval"],
	params: ELLIPSE_PARAMS,
	render({ ctx, params, width, height }) {
		const arc = ellipseArcState(params);
		ctx.clearRect(0, 0, width, height);
		if (arc.issue) throw new Error(arc.issue);
		const fill = String(params.fill ?? "#ffffff");
		const stroke = String(params.stroke ?? "#000000");
		const strokeWidth = Math.max(0, Number(params.strokeWidth ?? 0));
		const strokeAlign = (params.strokeAlign ?? "center") as GraphicStrokeAlign;
		const inset = strokeAlign === "center" ? strokeWidth / 2 : 0;
		const centerX = width / 2;
		const centerY = height / 2;
		const radiusX = Math.max(1, width / 2 - inset);
		const radiusY = Math.max(1, height / 2 - inset);

		if (arc.partial) {
			if (arc.reveal <= 0 || strokeWidth <= 0 || !Number.isFinite(strokeWidth))
				return;
			const path = new Path2D();
			const start = (arc.start * Math.PI) / 180;
			path.ellipse(
				centerX,
				centerY,
				radiusX,
				radiusY,
				0,
				start,
				start + (arc.sweep * arc.reveal * Math.PI) / 180,
			);
			// Open paths cannot use closed-area inside/outside clipping or fill.
			ctx.save();
			ctx.lineCap = params.strokeCap === "round" ? "round" : "butt";
			ctx.strokeStyle = stroke;
			ctx.lineWidth = strokeWidth;
			ctx.stroke(path);
			ctx.restore();
			return;
		}
		const path = new Path2D();
		path.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
		ctx.fillStyle = fill;
		ctx.fill(path);

		if (strokeWidth > 0) {
			applyAlignedStroke({
				ctx,
				path,
				strokeWidth,
				strokeAlign,
				strokeColor: stroke,
			});
		}
	},
};
