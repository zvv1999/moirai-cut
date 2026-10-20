import type { ParamDefinition } from "@/params";
import { applyAlignedStroke } from "../stroke";
import { STROKE_ALIGN_PARAM, type GraphicStrokeAlign } from "./shared";
import type { GraphicDefinition } from "../types";

interface RectangleParams {
	fill: string;
	stroke: string;
	strokeWidth: number;
	strokeAlign: GraphicStrokeAlign;
	cornerRadius: number;
	gridEnabled: boolean;
	gridSpacing: number;
	gridColor: string;
	gridWidth: number;
}

const RECTANGLE_PARAMS: ParamDefinition<keyof RectangleParams & string>[] = [
	{key:"gridEnabled",label:"网格",type:"boolean",default:false},
	{key:"gridSpacing",label:"网格间距",type:"number",default:32,min:4,max:256,step:1,dependencies:[{param:"gridEnabled",equals:true}]},
	{key:"gridWidth",label:"网格线宽",type:"number",default:1,min:0.1,max:8,step:0.1,dependencies:[{param:"gridEnabled",equals:true}]},
	{key:"gridColor",label:"网格颜色",type:"color",default:"#303030",dependencies:[{param:"gridEnabled",equals:true}]},
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
		key: "cornerRadius",
		label: "Corner radius",
		type: "number",
		default: 0,
		min: 0,
		max: 50,
		step: 1,
		shortLabel: "R",
	},
];

export const rectangleGraphicDefinition: GraphicDefinition = {
	id: "rectangle",
	name: "Rectangle",
	keywords: ["rectangle", "square", "box"],
	params: RECTANGLE_PARAMS,
	render({ ctx, params, width, height }) {
		const fill = String(params.fill ?? "#ffffff");
		const stroke = String(params.stroke ?? "#000000");
		const strokeWidth = Math.max(0, Number(params.strokeWidth ?? 0));
		const strokeAlign = (params.strokeAlign ?? "center") as GraphicStrokeAlign;
		const inset = strokeAlign === "center" ? strokeWidth / 2 : 0;
		const drawWidth = Math.max(1, width - inset * 2);
		const drawHeight = Math.max(1, height - inset * 2);
		const radiusPercent = Math.max(0, Number(params.cornerRadius ?? 0));
		const radius =
			(Math.min(drawWidth, drawHeight) / 2) * Math.min(radiusPercent, 50) / 50;
		// Native templates declare the design rectangle's pixel aspect ratio.
		// Compensate its fixed square source before the compositor stretches it;
		// later independent transform animation intentionally still deforms it.
		const aspect = params.rectangleAspectRatio;
		let corner: { x: number; y: number } | undefined;
		if (aspect !== undefined) {
			if (typeof aspect !== "number" || !Number.isFinite(aspect) || aspect <= 0) {
				throw new Error("Rectangle design aspect ratio must be positive and finite");
			}
			const sourceScaleX = aspect * height / width;
			const designRadius = Math.min(drawWidth * sourceScaleX, drawHeight)
				* Math.min(radiusPercent, 50) / 100;
			corner = { x: designRadius / sourceScaleX, y: designRadius };
		}

		ctx.clearRect(0, 0, width, height);
		const path = new Path2D();
		if (corner && corner.x > 0 && corner.y > 0) {
			// Explicit elliptical arcs also work in canvas backends that accept
			// only numeric roundRect radii. Each corner becomes circular on screen.
			const { x: rx, y: ry } = corner;
			const right = inset + drawWidth, bottom = inset + drawHeight;
			path.moveTo(inset + rx, inset);
			path.lineTo(right - rx, inset);
			path.ellipse(right - rx, inset + ry, rx, ry, 0, -Math.PI / 2, 0);
			path.lineTo(right, bottom - ry);
			path.ellipse(right - rx, bottom - ry, rx, ry, 0, 0, Math.PI / 2);
			path.lineTo(inset + rx, bottom);
			path.ellipse(inset + rx, bottom - ry, rx, ry, 0, Math.PI / 2, Math.PI);
			path.lineTo(inset, inset + ry);
			path.ellipse(inset + rx, inset + ry, rx, ry, 0, Math.PI, Math.PI * 1.5);
			path.closePath();
		} else {
			path.roundRect(inset, inset, drawWidth, drawHeight, aspect === undefined ? radius : 0);
		}
		ctx.fillStyle = fill;
		ctx.fill(path);
		if (params.gridEnabled === true) {
			const spacing = Math.max(4, Number(params.gridSpacing ?? 32));
			ctx.save();ctx.clip(path);ctx.strokeStyle=String(params.gridColor??"#303030");ctx.lineWidth=Math.max(0.1,Number(params.gridWidth??1));ctx.beginPath();
			for(let x=0;x<=width;x+=spacing){ctx.moveTo(x,0);ctx.lineTo(x,height);}
			for(let y=0;y<=height;y+=spacing){ctx.moveTo(0,y);ctx.lineTo(width,y);}
			ctx.stroke();ctx.restore();
		}

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
