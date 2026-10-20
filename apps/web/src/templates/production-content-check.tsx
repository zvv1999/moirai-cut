"use client";
import { Button } from "@/components/ui/button";
import type { Plan } from "./types";

export type ContentReviewGroup = {
	templateId: string;
	templateName: string;
	inputId: string;
	inputTitle: string;
	issues: NonNullable<Plan["contentIssues"]>;
};

/** Display native diagnostics with explicit destinations; no keyword inference. */
export function ProductionContentCheck({ groups, disabled, onReview, onContinue }: {
	groups: ContentReviewGroup[];
	disabled: boolean;
	onReview: (inputId: string, semanticIndex: number) => void;
	onContinue: () => void;
}) {
	const count = groups.reduce((sum, group) => sum + group.issues.length, 0);
	return <section className="tp-content-check" aria-label="重点文字确认">
		<h3>有 {count} 处重点文字待确认</h3>
		<p>未标注的段落不会显示重点花字。可以先选重点，也可以保留当前标注，先看整体效果。</p>
		<div className="tp-content-check-groups">
			{groups.map(group => <div key={`${group.templateId}:${group.inputId}`} className="tp-content-check-group">
				<div><strong>{group.inputTitle}</strong><small>{group.templateName} · {group.issues.length} 段未标注</small></div>
				<Button variant="outline" disabled={disabled} onClick={() => onReview(group.inputId, group.issues[0].semanticIndex)}>去选重点</Button>
				<details>
					<summary>查看这 {group.issues.length} 段</summary>
					<ol>{group.issues.map(issue => <li key={issue.semanticIndex}>
						<Button variant="link" disabled={disabled} onClick={() => onReview(group.inputId, issue.semanticIndex)}>第 {issue.semanticIndex + 1} 段 · 选择重点</Button>
					</li>)}</ol>
				</details>
			</div>)}
		</div>
		<Button disabled={disabled} onClick={onContinue}>按当前标注生成预览</Button>
	</section>;
}
