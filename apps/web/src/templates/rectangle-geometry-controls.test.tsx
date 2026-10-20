import { expect, test } from "bun:test";
import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RectangleGeometryControls } from "./rectangle-geometry-controls";
import type { RectangleGeometry } from "./types";

function control(tree: ReactNode, label: string): Record<string, any> {
	let found: Record<string, any> | undefined;
	function visit(node: ReactNode) {
		Children.forEach(node, child => {
			if (!isValidElement<Record<string, any>>(child)) return;
			if (child.props["aria-label"] === label) found = child.props;
			visit(child.props.children);
		});
	}
	visit(tree);
	if (!found) throw new Error(label);
	return found;
}

test("rectangle geometry exposes native units and keeps invalid numeric input out of drafts", () => {
	let value: RectangleGeometry | undefined;
	const tree = () => RectangleGeometryControls({ value, eligible: true, onChange: next => { value = next; } });
	const field = control(tree(), "矩形圆角半径百分比");
	expect(field.value).toBe(0);
	expect([field.min, field.max]).toEqual([0, 50]);
	field.onChange({ target: { valueAsNumber: 12.5 } });
	expect(value).toEqual({ cornerRadius: 12.5 });
	control(tree(), "矩形圆角半径百分比").onChange({ target: { valueAsNumber: NaN } });
	expect(value).toEqual({ cornerRadius: 12.5 });
	control(tree(), "矩形圆角半径百分比").onChange({ target: { valueAsNumber: 0 } });
	expect(value).toEqual({ cornerRadius: 0 });
	control(tree(), "清除矩形圆角").onClick();
	expect(value).toBeUndefined();
	const markup = renderToStaticMarkup(<RectangleGeometryControls eligible onChange={() => {}} />);
	expect(markup).toContain("实际矩形短边");
	expect(markup).toContain("50% 为胶囊形");
});

test("incompatible geometry stays visible and can be explicitly removed", () => {
	let cleared = false;
	const tree = RectangleGeometryControls({ value: { cornerRadius: 18 }, eligible: false, onChange: next => { cleared = next === undefined; } });
	expect(control(tree, "矩形圆角半径百分比").disabled).toBe(true);
	expect(control(tree, "清除矩形圆角").disabled).not.toBe(true);
	control(tree, "清除矩形圆角").onClick();
	expect(cleared).toBe(true);
	const markup = renderToStaticMarkup(<RectangleGeometryControls eligible={false} value={{ cornerRadius: 18 }} disabled onChange={() => {}} />);
	expect(markup).toContain('<fieldset disabled="">');
	expect(markup).not.toContain('type="color"');
});
