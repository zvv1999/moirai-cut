import { expect, test } from "bun:test";
import { resolveFontWeight, resolveTextLayout } from "./primitives";
import { buildTextLayoutParamsFromElement } from "./measure-element";
import type { TextElement } from "@/timeline";

test("compiled numeric weight reaches canvas font without collapsing", () => {
	for (const weight of ["100", "400", "550", "600", "800", "900", "normal", "bold"] as const) {
		const element = {params:{content:"Text",fontWeight:weight,fontFamily:"Arial",fontSize:15}} as unknown as TextElement;
		const text = buildTextLayoutParamsFromElement({element});
		expect(text.fontWeight).toBe(weight);
		const layout = resolveTextLayout({text,canvasHeight:900});
		expect(JSON.stringify(layout)).toContain(` ${weight} `);
	}
});

test("invalid weights fall back and legacy weights remain supported", () => {
	for (const value of [null, "900px", "heavy", 50, 901, NaN, 500.5]) expect(resolveFontWeight(value)).toBe("normal");
	expect(resolveFontWeight(800)).toBe("800");
	expect(resolveFontWeight("bold")).toBe("bold");
});
