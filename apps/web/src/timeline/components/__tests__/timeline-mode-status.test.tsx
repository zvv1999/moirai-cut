import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TimelineModeStatusView } from "@/timeline/components/timeline-mode-status";

test("timeline edit modes expose persistent state, labels, and shortcuts", () => {
	const markup = renderToStaticMarkup(
		<TimelineModeStatusView
			snappingEnabled={true}
			snappingShortcut="N"
			rippleEditingEnabled={false}
			rippleEditingShortcut="R"
			sourceAudio={{
				status: "linked",
				label: "原声已连接",
				canToggle: true,
			}}
			sourceAudioShortcut="A"
			onToggleSnapping={() => {}}
			onToggleRippleEditing={() => {}}
			onToggleSourceAudio={() => {}}
		/>,
	);

	expect(markup).toContain('role="group"');
	expect(markup).toContain('aria-label="时间线编辑模式"');
	expect(markup).toContain('aria-label="自动吸附：开启 (N)"');
	expect(markup).toContain('aria-pressed="true"');
	expect(markup).toContain("吸附");
	expect(markup).toContain("开");
	expect(markup).toContain("<kbd");
	expect(markup).toContain(">N</kbd>");
	expect(markup).toContain('aria-label="联动编辑：关闭 (R)"');
	expect(markup).toContain("联动");
	expect(markup).toContain("关");
	expect(markup).toContain(">R</kbd>");
	expect(markup).toContain('aria-label="原声已连接 (A)"');
	expect(markup).toContain("原声");
	expect(markup).toContain("已连接");
	expect(markup).toContain(">A</kbd>");
});

test("source audio stays discoverable when the selection cannot use it", () => {
	const markup = renderToStaticMarkup(
		<TimelineModeStatusView
			snappingEnabled={false}
			snappingShortcut={null}
			rippleEditingEnabled={true}
			rippleEditingShortcut={null}
			sourceAudio={{
				status: "unavailable",
				label: "请选择一个视频素材以管理原声",
				canToggle: false,
			}}
			sourceAudioShortcut={null}
			onToggleSnapping={() => {}}
			onToggleRippleEditing={() => {}}
			onToggleSourceAudio={() => {}}
		/>,
	);

	expect(markup).toContain('aria-label="自动吸附：关闭"');
	expect(markup).toContain('aria-label="联动编辑：开启"');
	expect(markup).toContain("请选择一个视频素材以管理原声");
	expect(markup).toContain("不可用");
	expect(markup).toContain("disabled");
});
