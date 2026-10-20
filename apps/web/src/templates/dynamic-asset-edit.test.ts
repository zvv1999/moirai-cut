import { expect, test } from "bun:test";
import { requestDynamicAssetLayerEdit } from "./dynamic-asset-edit";

test("geometry edits submit the complete local draft and preserve native responses", async () => {
	const definition = { id: "draft", name: "Unsaved title", styles: [{ fill: "#ffcc00" }], layers: [{ id: "shape", motions: [{ property: "opacity" }] }] };
	const result = { definition: { ...definition, rectangleGeometry: { cornerRadius: 18 } }, selectedLayerId: "shape" };
	const operation = { kind: "rectangle_geometry", layerId: "shape", rectangleGeometry: { cornerRadius: 18 } };
	const edited = await requestDynamicAssetLayerEdit({
		definition, operation, current: () => definition,
		api: async <R,>(path: string, body?: unknown) => {
			expect(path).toBe("/dynamic-assets/layers");
			expect(body).toEqual({ definition, operation });
			return result as R;
		},
	});
	expect(edited).toEqual(result);
});

test("late geometry receipts cannot replace a changed or switched draft", async () => {
	const submitted = { id: "draft", name: "before" };
	for (const newer of [{ id: "draft", name: "typed while pending" }, { id: "another", name: "different selection" }, null]) {
		let current: typeof submitted | null = submitted;
		await expect(requestDynamicAssetLayerEdit({
			definition: submitted,
			operation: { kind: "rectangle_geometry", layerId: "shape", rectangleGeometry: null },
			current: () => current,
			api: async <R,>() => {
				current = newer;
				return { definition: submitted, selectedLayerId: "shape" } as R;
			},
		})).rejects.toThrow("已保留当前修改");
		expect(Object.is(current, newer)).toBe(true);
	}
});

test("native validation rejection preserves the current draft and surfaces its error", async () => {
	const definition = { id: "draft", rectangleGeometry: { cornerRadius: 18 }, name: "Unsaved title" };
	await expect(requestDynamicAssetLayerEdit({
		definition, operation: { kind: "rectangle_geometry", layerId: "shape", rectangleGeometry: { cornerRadius: 51 } }, current: () => definition,
		api: async () => { throw new Error("rectangle radius must be between 0 and 50"); },
	})).rejects.toThrow("between 0 and 50");
	expect(definition.rectangleGeometry.cornerRadius).toBe(18);
});
