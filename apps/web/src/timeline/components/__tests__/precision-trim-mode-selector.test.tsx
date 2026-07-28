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
	expect(markup).toContain('aria-label="Precision trim tools"');
	expect(markup).toContain('aria-label="Standard trim"');
	expect(markup).toContain('aria-label="Ripple trim"');
	expect(markup).toContain('aria-label="Roll edit"');
	expect(markup).toContain('aria-label="Slip edit: No source handles"');
	expect(markup).toContain('aria-label="Slide edit: Needs both neighbours"');
	expect(markup).toContain('aria-pressed="true"');
	expect(markup).toContain("disabled");
});
