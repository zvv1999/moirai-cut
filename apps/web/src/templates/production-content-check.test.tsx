import { expect, test } from "bun:test";
import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductionContentCheck, type ContentReviewGroup } from "./production-content-check";

const groups: ContentReviewGroup[] = [
	{templateId: "note", templateName: "知识便笺", inputId: "long", inputTitle: "长视频", issues: Array.from({length: 37}, (_, semanticIndex) => ({code: "missing_keyword", semanticIndex, startWord: semanticIndex * 2, endWord: semanticIndex * 2 + 2, message: "尚未标注重点"}))},
	{templateId: "note", templateName: "知识便笺", inputId: "other", inputTitle: "另一段视频", issues: [{code: "missing_keyword", semanticIndex: 9, startWord: 20, endWord: 24, message: "尚未标注重点"}]},
];
function actions(tree: ReactNode): Record<string, any>[] {
	const result: Record<string, any>[] = [];
	function visit(node: ReactNode) { Children.forEach(node, child => {
		if (!isValidElement<Record<string, any>>(child)) return;
		if (child.props.onClick) result.push(child.props);
		visit(child.props.children);
	}); }
	visit(tree); return result;
}

test("long-input warnings stay grouped in closed details with one explicit continuation", () => {
	const html = renderToStaticMarkup(<ProductionContentCheck groups={groups} disabled={false} onReview={() => {}} onContinue={() => {}}/>);
	expect(html).toContain("有 38 处重点文字待确认");
	expect(html.match(/<details>/g)?.length).toBe(2);
	expect(html).not.toContain("<details open");
	expect(html).not.toContain('role="alert"');
	expect(html.match(/长视频/g)?.length).toBe(1);
	expect(html.match(/按当前标注生成预览/g)?.length).toBe(1);
	expect(html.indexOf("第 2 段")).toBeLessThan(html.indexOf("第 10 段"));
});

test("review actions preserve sample identity and exact semantic destination", () => {
	const visited: [string, number][] = []; let continued = false;
	const controls = actions(ProductionContentCheck({groups, disabled: false, onReview: (id, index) => visited.push([id, index]), onContinue: () => { continued = true; }}));
	controls[0].onClick();
	controls[10].onClick();
	controls[38].onClick();
	controls.at(-1)!.onClick();
	expect(visited).toEqual([["long", 0], ["long", 9], ["other", 9]]);
	expect(continued).toBe(true);
	expect(actions(ProductionContentCheck({groups, disabled: true, onReview() {}, onContinue() {}})).every(control => control.disabled)).toBe(true);
});
