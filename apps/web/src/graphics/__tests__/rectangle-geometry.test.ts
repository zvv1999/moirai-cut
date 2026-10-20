import { expect, test } from "bun:test";
import { createCanvas, Path2D } from "@napi-rs/canvas";
import { rectangleGraphicDefinition } from "../definitions/rectangle";
import { GraphicNode } from "@/services/renderer/nodes/graphic-node";
import type { ParamValues } from "@/params";

function withCanvas<T>(run: () => T): T {
	const oldPath = globalThis.Path2D, oldCanvas = globalThis.OffscreenCanvas;
	globalThis.Path2D = Path2D as unknown as typeof globalThis.Path2D;
	globalThis.OffscreenCanvas = class {
		constructor(width: number, height: number) { return createCanvas(width, height); }
	} as unknown as typeof OffscreenCanvas;
	try { return run(); }
	finally { globalThis.Path2D = oldPath; globalThis.OffscreenCanvas = oldCanvas; }
}
function source(params: ParamValues) {
	const canvas = createCanvas(512, 512), ctx = canvas.getContext("2d");
	rectangleGraphicDefinition.render({ ctx: ctx as unknown as CanvasRenderingContext2D, params: { fill: "#fff", ...params }, width: 512, height: 512 });
	return canvas;
}
function project(params: ParamValues, width: number, height: number) {
	const canvas = createCanvas(width, height), ctx = canvas.getContext("2d");
	ctx.drawImage(source(params), 0, 0, width, height);
	return ctx.getImageData(0, 0, width, height).data;
}
const alpha = (p: Uint8ClampedArray, width: number, x: number, y: number) => p[(y * width + x) * 4 + 3];

test("design rectangles stay rounded boards or capsules after the actual square-source stretch", () => withCanvas(() => {
	for (const [width, height] of [[320, 100], [100, 320], [200, 200]]) {
		for (const percent of [8, 25, 50]) {
			const actual = project({ cornerRadius: percent, rectangleAspectRatio: width / height }, width, height);
			// Independent target-space path: it never goes through the template source.
			const reference = createCanvas(width, height), ctx = reference.getContext("2d"), path = new Path2D();
			path.roundRect(0, 0, width, height, Math.min(width, height) * percent / 100);
			ctx.fillStyle = "white"; ctx.fill(path);
			const expected = ctx.getImageData(0, 0, width, height).data;
			let difference = 0;
			for (let i = 3; i < expected.length; i += 4) difference += Math.abs(actual[i] - expected[i]);
			expect(difference / (255 * width * height)).toBeLessThan(0.004);
			expect(alpha(actual, width, width / 2, height / 2)).toBe(255);
			expect(alpha(actual, width, 0, 0)).toBe(0);
		}
	}
	const capsule = project({ cornerRadius: 50, rectangleAspectRatio: 3.2 }, 320, 100);
	// The long top edge is straight; an ellipse cannot pass this check.
	expect(alpha(capsule, 320, 75, 1)).toBeGreaterThan(240);
	expect(alpha(capsule, 320, 245, 1)).toBeGreaterThan(240);
	expect(alpha(capsule, 320, 1, 1)).toBe(0);
}));

test("omitted geometry preserves legacy rectangle pixels including its rounded outline", () => withCanvas(() => {
	for (const percent of [0, 12, 50]) {
		const old = createCanvas(512, 512), ctx = old.getContext("2d"), path = new Path2D();
		path.roundRect(5, 5, 502, 502, 502 * percent / 100);
		ctx.fillStyle = "#fcebd4"; ctx.fill(path); ctx.strokeStyle = "#123456"; ctx.lineWidth = 10; ctx.stroke(path);
		const current = source({ fill: "#fcebd4", stroke: "#123456", strokeWidth: 10, cornerRadius: percent });
		expect(current.getContext("2d").getImageData(0, 0, 512, 512).data).toEqual(ctx.getImageData(0, 0, 512, 512).data);
	}
}));

test("outline mode, intentional deformation and malformed geometry remain distinct", () => withCanvas(() => {
	for (const [width, height] of [[320, 100], [100, 320]]) {
		const params = { cornerRadius: 50, rectangleAspectRatio: width / height, fill: "#00000000", stroke: "#fff", strokeWidth: 12 };
		const outlined = project(params, width, height);
		expect(alpha(outlined, width, width / 2, height / 2)).toBe(0);
		expect(alpha(outlined, width, width / 2, 1)).toBeGreaterThan(0);
		expect(alpha(outlined, width, 0, 0)).toBe(0);
	}
	// A later independent X scale deforms the design; it does not rewrite radius.
	expect(project({ cornerRadius: 50, rectangleAspectRatio: 4 }, 200, 100))
		.not.toEqual(project({ cornerRadius: 50, rectangleAspectRatio: 2 }, 200, 100));
	for (const aspect of [0, -1, NaN, Infinity, "2"]) {
		expect(() => source({ cornerRadius: 20, rectangleAspectRatio: aspect })).toThrow("aspect ratio");
	}
}));

test("shared preview/export cache redraws an aspect change and keeps the last valid source on error", () => withCanvas(() => {
	const node = new GraphicNode({ definitionId: "rectangle" } as GraphicNode["params"]);
	const params = { cornerRadius: 50, rectangleAspectRatio: 3.2, fill: "#fff" };
	const a = node.getSource({ resolvedParams: params });
	expect(a.width).toBe(512); expect(a.height).toBe(512);
	expect(node.getSource({ resolvedParams: params })).toBe(a);
	const b = node.getSource({ resolvedParams: { ...params, rectangleAspectRatio: 0.5 } });
	expect(b).not.toBe(a);
	expect(() => node.getSource({ resolvedParams: { ...params, rectangleAspectRatio: 0 } })).toThrow();
	expect(node.getSource({ resolvedParams: { ...params, rectangleAspectRatio: 0.5 } })).toBe(b);
}));
