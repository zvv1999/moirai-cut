import { expect, test } from "bun:test";
import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EllipseArcControls, ShapeGeometryControls } from "./ellipse-arc-controls";
import { ElementMotion, strokeRevealKeys } from "./element-motion";
import type { EllipseArc } from "./types";

function control(tree: ReactNode, label: string): Record<string, any> {
	let found: Record<string, any> | undefined;
	function visit(node: ReactNode) { Children.forEach(node, child => {
		if (!isValidElement<Record<string, any>>(child)) return;
		if (child.props["aria-label"] === label) found = child.props;
		visit(child.props.children);
	}); }
	visit(tree);
	if (!found) throw new Error(label);
	return found;
}

test("arc geometry edits preserve the other axes and cannot leave NaN in the draft", () => {
	let value: EllipseArc | undefined = { startDegrees: -35, sweepDegrees: 325, cap: "round" };
	const tree = () => EllipseArcControls({ value, eligible: true, onChange: next => { value = next; } });
	control(tree(), "起始角度").onChange({ target: { valueAsNumber: 45 } });
	expect(value).toEqual({ startDegrees: 45, sweepDegrees: 325, cap: "round" });
	control(tree(), "顺时针扫过角度").onChange({ target: { valueAsNumber: NaN } });
	expect(value?.sweepDegrees).toBe(325);
	control(tree(), "设置椭圆弧线").onChange({ target: { checked: false } });
	expect(value).toBeUndefined();
});

test("incompatible saved geometry remains visible and can be cleared", () => {
	const value: EllipseArc = { startDegrees: -35, sweepDegrees: 325, cap: "round" };
	let removed = false;
	const tree = EllipseArcControls({ value, eligible: false, onChange: next => { removed = next === undefined; } });
	expect(control(tree, "设置椭圆弧线").disabled).toBe(false);
	expect(control(tree, "起始角度").disabled).toBe(true);
	expect(control(tree, "弧线端点").value).toBe("round");
	control(tree, "设置椭圆弧线").onChange({ target: { checked: false } });
	expect(removed).toBe(true);
});

test("stroke reveal is offered only for eligible layers and keeps invalid existing tracks removable", () => {
	const props = { representation: "ellipse", motions: [], onChange() {}, onEntrance() {} };
	expect(renderToStaticMarkup(<ElementMotion {...props} allowStrokeReveal/>)).toContain('value="stroke_reveal"');
	expect(renderToStaticMarkup(<ElementMotion {...props}/>)).not.toContain('value="stroke_reveal"');
	const html = renderToStaticMarkup(<ElementMotion {...props} representation="text" motions={[{ property: "stroke_reveal", keys: [{ time: 0, value: 0, easing: "linear" }, { time: 1, value: 1, easing: "linear" }] }]}/>);
	expect(html).toContain("移除描边显现动画轨道");
	expect(html).toContain('value="overshoot" disabled=""');
});


test("new stroke reveal has strictly ordered keys even when entrance phase is zero",()=>{
    for(const enterEnd of [0,.15,1,NaN]) {
        const timing={enterEnd,exitStart:.8,enterSeconds:0,exitSeconds:.1,coverage:{minExitFrames:1,minPostFrames:2}};
        const before=structuredClone(timing),keys=strokeRevealKeys(timing);
        expect(keys.map(key=>key.value)).toEqual([0,1,1]);
        expect(keys[0].time).toBe(0);expect(keys[2].time).toBe(1);
        expect(keys[1].time).toBeGreaterThan(0);expect(keys[1].time).toBeLessThan(1);
        expect(timing).toEqual(before);
    }
});

test("styleless outlined ellipse exposes geometry with native default stroke and explicit zero stays disabled",()=>{
 const element={features:{representation:"ellipse",outline:true}} as Parameters<typeof ShapeGeometryControls>[0]["element"];
 const props={element,onOutline(){},onArc(){}};
 const html=renderToStaticMarkup(<ShapeGeometryControls {...props}/>);
 expect(html).toContain('aria-label="图形仅描边"');
 expect(html).toContain('aria-label="设置椭圆弧线"');
 expect(html).not.toContain('disabled=""');
 expect(html).not.toContain('type="color"');
 expect(renderToStaticMarkup(<ShapeGeometryControls {...props} strokeWidth={0}/>)).toContain('disabled=""');
});
