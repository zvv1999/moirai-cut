import { expect, test } from "bun:test";
import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MotionCoverageControls } from "./motion-coverage-controls";
import { ExitSamplingPanel, ObservedFrameSamplingPanel } from "./exit-sampling";
import { formatPlanWarning } from "./plan-warning";
import type { ExitSampling, MotionTiming, ObservedFrameSampling } from "./types";

function control(tree: ReactNode, name: string): Record<string, any> {
	let result: Record<string, any> | undefined;
	function visit(node: ReactNode) {
		Children.forEach(node, child => {
			if (!isValidElement<Record<string, any>>(child)) return;
			if (child.props["aria-label"] === name) result = child.props;
			visit(child.props.children);
		});
	}
	visit(tree);
	if (!result) throw new Error(`Missing ${name}`);
	return result;
}

test("editing explicit sampling requirements preserves motion phases and removes only coverage when disabled", () => {
	const original: MotionTiming = { enterEnd: .3, exitStart: .9, enterSeconds: .12, exitSeconds: .06 };
	let timing = original;
	const tree = () => MotionCoverageControls({ timing, onChange: next => { timing = next; } });
	expect(control(tree(), "动效要求退场采样").checked).toBe(false);
	expect(timing).toEqual(original);
	control(tree(), "动效要求退场采样").onChange({ target: { checked: true } });
	expect(timing.coverage).toEqual({ minExitFrames: 1, minPostFrames: 1 });
	control(tree(), "动效结束后至少帧数").onChange({ target: { valueAsNumber: 4 } });
	expect(timing).toEqual({ ...original, coverage: { minExitFrames: 1, minPostFrames: 4 } });
	for (const value of [NaN, -1, 121, 1.5]) control(tree(), "动效结束后至少帧数").onChange({ target: { valueAsNumber: value } });
	expect(timing.coverage?.minPostFrames).toBe(4);
	control(tree(), "动效要求退场采样").onChange({ target: { checked: false } });
	expect(timing).toEqual(original);
	expect("coverage" in timing).toBe(false);
});

test("actual frame timestamp evidence is bound to the output file and never implies visual disappearance", () => {
	const value: ObservedFrameSampling = { basis: "decoded_video_frame_pts", status: "passed", outputSha256: "current", timebase: 120000, framesObserved: 370, lastFrameTicks: 1476000, records: [], pixelDisappearanceVerified: false, listened: false };
	const current = renderToStaticMarkup(<ObservedFrameSamplingPanel value={value} previewSha256="current"/>);
	expect(current).toContain("已读取当前成片 370 帧");
	expect(current).toContain("是否消失仍需观看");
	const stale = renderToStaticMarkup(<ObservedFrameSamplingPanel value={value} previewSha256="replacement"/>);
	expect(stale).toContain('role="alert"');
	expect(stale).not.toContain("帧数满足要求");
	expect(renderToStaticMarkup(<ObservedFrameSamplingPanel previewSha256="current" requested/>)).toContain("尚未测量");
	expect(renderToStaticMarkup(<ObservedFrameSamplingPanel value={{ basis: value.basis, outputSha256: "current", status: "not_measured", reason: "probe failed" }} previewSha256="current"/>)).toContain("未测量");
});

test("an explicit post-frame requirement is possible for a motion without an exit interval", () => {
	let timing: MotionTiming = { enterEnd: .2, exitStart: .8, enterSeconds: .1, exitSeconds: 0 };
	const tree = MotionCoverageControls({ timing, label: "整组动效", onChange: next => { timing = next; } });
	control(tree, "整组动效要求退场采样").onChange({ target: { checked: true } });
	expect(timing.coverage).toEqual({ minExitFrames: 0, minPostFrames: 1 });
});

test("native counts display as prediction and an ancestor clipping warning remains visible", () => {
	const value: ExitSampling = { basis: "predicted_frame_sampling", status: "warning", records: [{ elementId: "a", templateElementId: "headline", groupPath: ["group"], exitStartTicks: 1476648, effectiveEndTicks: 1481448, lastFrameTicks: 1476000, exitFrames: 0, postFrames: 0, required: { minExitFrames: 1, minPostFrames: 1 }, findings: ["insufficient_exit_frames", "insufficient_post_frames", "ancestor_or_export_clip"] }] };
	const html = renderToStaticMarkup(<ExitSamplingPanel value={value} />);
	expect(html).toContain("需要调整");
	expect(html).toContain("按输出帧率和显示区间预测");
	expect(html).toContain("父组或导出区间提前结束");
	expect(html).toContain("退场区间 0 / 要求 1 帧");
	expect(html).not.toContain("验收通过");
	expect(formatPlanWarning(`exit_sampling:${JSON.stringify(value.records[0])}`)).toContain("不是成片实测结果");
	expect(formatPlanWarning(`exit_sampling:${JSON.stringify({ basis: value.basis, record: value.records[0] })}`)).toContain("预计退场 0 / 要求 1 帧");
	expect(renderToStaticMarkup(<ExitSamplingPanel value={{ ...value, status: "not_requested", records: [] }} />)).toBe("");
	expect(renderToStaticMarkup(<ExitSamplingPanel />)).toBe("");
});
