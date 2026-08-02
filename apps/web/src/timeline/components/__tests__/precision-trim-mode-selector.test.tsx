import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PrecisionTrimModeSelectorView } from "@/timeline/components/precision-trim-mode-selector";

test("precision trim tools remain visible, named, and stateful", () => {
	const markup = renderToStaticMarkup(
		<PrecisionTrimModeSelectorView
			activeMode="roll"
			availability={{
				standard: { available: true },
				ripple: { available: true },
				roll: { available: true },
				slip: { available: false, reason: "No source handles" },
				slide: { available: false, reason: "Needs both neighbours" },
			}}
			onSelect={() => {}}
		/>,
	);

	expect(markup).toContain('role="group"');
	expect(markup).toContain('aria-label="精确修剪工具"');
	expect(markup).toContain('aria-label="普通修剪"');
	expect(markup).toContain('aria-label="联动修剪"');
	expect(markup).toContain('aria-label="滚动编辑"');
	expect(markup).toContain('aria-label="滑移编辑: No source handles"');
	expect(markup).toContain('aria-label="滑动编辑: Needs both neighbours"');
	expect(markup).toContain('aria-pressed="true"');
	expect(markup).toContain("disabled");
});
