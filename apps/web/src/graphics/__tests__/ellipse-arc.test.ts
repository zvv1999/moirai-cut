import { expect, test } from "bun:test";
import { createCanvas, Path2D } from "@napi-rs/canvas";
import {
	ellipseGraphicDefinition,
	ellipseArcState,
} from "../definitions/ellipse";
import { resolveGraphicParamsAtTime } from "@/animation/graphic-param-channel";
import type { ParamValues } from "@/params";
import type { ElementAnimations } from "@/animation/types";
import { GraphicNode } from "@/services/renderer/nodes/graphic-node";

const base: ParamValues = {
	fill: "#00000000",
	stroke: "#ffbe38",
	strokeWidth: 16,
	strokeAlign: "center",
};
function draw(params: ParamValues = {}, width = 200, height = 200) {
	const canvas = createCanvas(width, height),
		ctx = canvas.getContext("2d");
	const old = globalThis.Path2D;
	globalThis.Path2D = Path2D as unknown as typeof globalThis.Path2D;
	try {
		ellipseGraphicDefinition.render({
			ctx: ctx as unknown as CanvasRenderingContext2D,
			params: { ...base, ...params },
			width,
			height,
		});
	} finally {
		globalThis.Path2D = old;
	}
	return { canvas, ctx, pixels: ctx.getImageData(0, 0, width, height).data };
}
function mass(pixels: Uint8ClampedArray) {
	let sum = 0;
	for (let i = 3; i < pixels.length; i += 4) sum += pixels[i];
	return sum;
}
function alpha(image: ReturnType<typeof draw>, x: number, y: number) {
	return image.pixels[(y * image.canvas.width + x) * 4 + 3];
}

test("ellipse reveal draws clockwise portions, not whole-ring opacity", () => {
	const zero = draw({ strokeReveal: 0, strokeCap: "round" });
	expect(mass(zero.pixels)).toBe(0);
	const quarter = draw({ strokeReveal: 0.25 });
	expect(alpha(quarter, 165, 165)).toBeGreaterThan(240);
	expect(alpha(quarter, 35, 165)).toBe(0);
	expect(alpha(quarter, 35, 35)).toBe(0);
	expect(alpha(quarter, 165, 35)).toBe(0);
	const half = draw({ strokeReveal: 0.5 }),
		full = draw({ strokeReveal: 1 });
	expect(alpha(half, 35, 165)).toBeGreaterThan(240);
	expect(alpha(half, 35, 35)).toBe(0);
	expect(mass(quarter.pixels) / mass(full.pixels)).toBeCloseTo(0.25, 2);
	expect(mass(half.pixels) / mass(full.pixels)).toBeCloseTo(0.5, 2);
});
test("ellipse arcs cross zero continuously without a fill wedge or closing chord", () => {
	const arc = draw({
		arcStart: -45,
		arcSweep: 90,
		strokeReveal: 1,
		strokeCap: "butt",
	});
	expect(alpha(arc, 192, 100)).toBeGreaterThan(240);
	expect(alpha(arc, 100, 100)).toBe(0);
	expect(alpha(arc, 165, 100)).toBe(0);
	expect(alpha(arc, 8, 100)).toBe(0);
	expect(mass(arc.pixels) / mass(draw().pixels)).toBeCloseTo(0.25, 2);
});
test("round and butt caps differ at open ends but complete-circle output has no cap knot", () => {
	const flat = draw({ arcStart: 0, arcSweep: 90, strokeCap: "butt" }),
		round = draw({ arcStart: 0, arcSweep: 90, strokeCap: "round" });
	expect(alpha(flat, 192, 95)).toBe(0);
	expect(alpha(round, 192, 95)).toBeGreaterThan(240);
	expect(mass(round.pixels)).toBeGreaterThan(mass(flat.pixels));
	expect(
		draw({ arcStart: -35, arcSweep: 360, strokeReveal: 1, strokeCap: "round" })
			.pixels,
	).toEqual(draw({ strokeCap: "butt" }).pixels);
});
test("full legacy filled ellipse preserves old pixels and zero-width paths leave no dot", () => {
	const old = createCanvas(200, 200),
		ctx = old.getContext("2d");
	const path = new Path2D();
	path.ellipse(100, 100, 92, 92, 0, 0, Math.PI * 2);
	ctx.fillStyle = "#556677";
	ctx.fill(path);
	ctx.strokeStyle = "#ffbe38";
	ctx.lineWidth = 16;
	ctx.stroke(path);
	expect(draw({ fill: "#556677" }).pixels).toEqual(
		ctx.getImageData(0, 0, 200, 200).data,
	);
	expect(
		mass(
			draw({
				strokeWidth: 0,
				arcSweep: 250,
				strokeReveal: 0.4,
				strokeCap: "round",
			}).pixels,
		),
	).toBe(0);
});
test("open arcs reject filled and aligned-area modes rather than drawing a silent fallback", () => {
	for (const params of [
		{ arcSweep: 180, fill: "#fff" },
		{ strokeReveal: 0.5, strokeAlign: "inside" },
		{ arcSweep: 180, strokeAlign: "outside" },
		{ arcStart: NaN },
		{ arcSweep: -10 },
		{ arcSweep: 361 },
		{ strokeReveal: Infinity },
	] as ParamValues[]) {
		expect(ellipseArcState({ ...base, ...params }).issue).not.toBeNull();
		expect(() => draw(params)).toThrow();
	}
	expect(draw({ strokeReveal: 1.02 }).pixels).toEqual(draw().pixels);
	expect(mass(draw({ strokeReveal: -0.02 }).pixels)).toBe(0);
});
test("ellipse can stretch either axis with thick strokes while open geometry stays clipped to canvas", () => {
	for (const [width, height] of [
		[320, 100],
		[100, 320],
	]) {
		const arc = draw(
			{ arcSweep: 270, strokeWidth: 40, strokeCap: "round" },
			width,
			height,
		);
		expect(mass(arc.pixels)).toBeGreaterThan(0);
		expect(alpha(arc, width / 2, height / 2)).toBe(0);
		const empty = draw({ strokeReveal: 0, strokeWidth: 64 }, width, height);
		expect(mass(empty.pixels)).toBe(0);
	}
});
test("canonical graphic keyframes resolve after JSON reload to different actual arc pixels", () => {
	const animations = JSON.parse(
		JSON.stringify({
			"params.strokeReveal": {
				keys: [
					{
						id: "a",
						time: 0,
						value: 0,
						segmentToNext: "linear",
						tangentMode: "broken",
					},
					{
						id: "b",
						time: 120000,
						value: 1,
						segmentToNext: "linear",
						tangentMode: "broken",
					},
				],
			},
		}),
	) as ElementAnimations;
	const renderAt = (time: number) =>
		draw(
			resolveGraphicParamsAtTime({
				params: { ...base, strokeReveal: 1 },
				definitions: ellipseGraphicDefinition.params,
				animations,
				localTime: time,
			}),
		);
	expect(mass(renderAt(0).pixels)).toBe(0);
	expect(
		mass(renderAt(30000).pixels) / mass(renderAt(120000).pixels),
	).toBeCloseTo(0.25, 2);
	const keys = ellipseGraphicDefinition.params.filter((p) =>
		["arcStart", "arcSweep", "strokeCap", "strokeReveal"].includes(p.key),
	);
	expect(keys).toHaveLength(4);
	expect(keys.find((p) => p.key === "strokeReveal")?.keyframable).not.toBe(
		false,
	);
	expect(
		keys
			.filter((p) => p.key !== "strokeReveal")
			.every((p) => p.keyframable === false),
	).toBe(true);
});

test("shared preview/export graphic source cache tracks reveal and retains source-space stretch semantics", () => {
	const oldCanvas = globalThis.OffscreenCanvas,
		oldPath = globalThis.Path2D;
	globalThis.OffscreenCanvas = class {
		constructor(width: number, height: number) {
			return createCanvas(width, height);
		}
	} as unknown as typeof OffscreenCanvas;
	globalThis.Path2D = Path2D as unknown as typeof globalThis.Path2D;
	try {
		const node = new GraphicNode({
			definitionId: "ellipse",
		} as GraphicNode["params"]);
		const full = node.getSource({
			resolvedParams: { ...base, strokeReveal: 1 },
		});
		expect(full.width).toBe(512);
		expect(full.height).toBe(512);
		expect(
			node.getSource({ resolvedParams: { ...base, strokeReveal: 1 } }),
		).toBe(full);
		const partial = node.getSource({
			resolvedParams: { ...base, strokeReveal: 0.25 },
		});
		expect(partial).not.toBe(full);
		for (const [width, height] of [
			[320, 100],
			[100, 320],
		]) {
			const composed = createCanvas(width, height),
				ctx = composed.getContext("2d");
			ctx.drawImage(
				partial as unknown as Parameters<typeof ctx.drawImage>[0],
				0,
				0,
				width,
				height,
			);
			const quarterMass = mass(ctx.getImageData(0, 0, width, height).data);
			ctx.clearRect(0, 0, width, height);
			ctx.drawImage(
				full as unknown as Parameters<typeof ctx.drawImage>[0],
				0,
				0,
				width,
				height,
			);
			expect(
				quarterMass / mass(ctx.getImageData(0, 0, width, height).data),
			).toBeCloseTo(0.25, 2);
		}
	} finally {
		globalThis.OffscreenCanvas = oldCanvas;
		globalThis.Path2D = oldPath;
	}
});

test("failed arc rendering never returns or caches an empty or stale graphic surface", () => {
	const oldCanvas = globalThis.OffscreenCanvas, oldPath = globalThis.Path2D;
	globalThis.OffscreenCanvas = class {
		constructor(width: number, height: number) { return createCanvas(width, height); }
	} as unknown as typeof OffscreenCanvas;
	globalThis.Path2D = Path2D as unknown as typeof globalThis.Path2D;
	try {
		const node = new GraphicNode({ definitionId: "ellipse" } as GraphicNode["params"]);
		const valid = { ...base, arcSweep: 325, strokeReveal: .5 };
		const before = node.getSource({ resolvedParams: valid });
		const invalid = { ...valid, fill: "#ffffff" };
		for (let attempt = 0; attempt < 2; attempt++) {
			expect(() => node.getSource({ resolvedParams: invalid })).toThrow("透明填充");
		}
		expect(node.getSource({ resolvedParams: valid })).toBe(before);
		globalThis.OffscreenCanvas = class {
			constructor() { throw new Error("test canvas allocation failure"); }
		} as unknown as typeof OffscreenCanvas;
		expect(() => node.getSource({ resolvedParams: { ...valid, strokeReveal: .75 } })).toThrow("test canvas allocation failure");
		expect(node.getSource({ resolvedParams: valid })).toBe(before);
	} finally {
		globalThis.OffscreenCanvas = oldCanvas;
		globalThis.Path2D = oldPath;
	}
});
