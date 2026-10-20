import { expect, test } from "bun:test";
import { Children, isValidElement, type ReactNode } from "react";
import { SizeBindingControls } from "./size-binding-controls";
import type { TextSizeBinding } from "./types";

function control(tree: ReactNode, name: string): Record<string, any> {
	let found: Record<string, any> | undefined;
	function visit(node: ReactNode) {
		Children.forEach(node, child => {
			if (!isValidElement<Record<string, any>>(child)) return;
			if (child.props["aria-label"] === name) found = child.props;
			visit(child.props.children);
		});
	}
	visit(tree);
	if (!found) throw new Error(`Missing control ${name}`);
	return found;
}

test("changing one size axis preserves the other axis and clearing both restores authored size", () => {
	let state: TextSizeBinding | undefined = { width: { factor: 1.2, padding: .025 }, height: { factor: 1, padding: .01 } };
	const tree = () => SizeBindingControls({ label: "圈线", value: state, eligible: true, onChange: value => { state = value; } });
	control(tree(), "圈线宽度倍数").onChange({ target: { valueAsNumber: 1.45 } });
	expect(state).toEqual({ width: { factor: 1.45, padding: .025 }, height: { factor: 1, padding: .01 } });
	control(tree(), "圈线跟随文字宽度").onChange({ target: { checked: false } });
	expect(state).toEqual({ height: { factor: 1, padding: .01 } });
	control(tree(), "圈线跟随文字高度").onChange({ target: { checked: false } });
	expect(state).toBeUndefined();
});

test("unsupported existing binding remains visible and can be removed without inventing new values", () => {
	let state: TextSizeBinding | undefined = { width: { factor: 1.7, padding: .02 } };
	const tree = SizeBindingControls({ label: "图层", value: state, eligible: false, onChange: value => { state = value; } });
	expect(control(tree, "图层宽度倍数").value).toBe(1.7);
	expect(control(tree, "图层宽度倍数").disabled).toBe(true);
	expect(control(tree, "图层跟随文字高度").disabled).toBe(true);
	expect(control(tree, "图层跟随文字宽度").disabled).toBe(false);
	control(tree, "图层跟随文字宽度").onChange({ target: { checked: false } });
	expect(state).toBeUndefined();
});

test("temporarily empty numeric input does not replace saved padding with NaN", () => {
	const state = { height: { factor: 1, padding: .015 } };
	let changed = false;
	const tree = SizeBindingControls({ label: "图层", value: state, eligible: true, onChange: () => { changed = true; } });
	control(tree, "图层高度每侧留白").onChange({ target: { valueAsNumber: NaN } });
	expect(changed).toBe(false);
});
