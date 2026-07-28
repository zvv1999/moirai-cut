import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TimelineToolbarButton } from "../timeline-toolbar-button";

describe("TimelineToolbarButton", () => {
	test("gives icon-only controls an accessible name with their shortcut", () => {
		const html = renderToStaticMarkup(
			<TooltipProvider>
				<TimelineToolbarButton
					icon={<span>icon</span>}
					tooltip="Split element"
					shortcut="S"
				/>
			</TooltipProvider>,
		);

		expect(html).toContain('aria-label="Split element (S)"');
	});

	test("keeps disabled controls discoverable by assistive technology", () => {
		const html = renderToStaticMarkup(
			<TooltipProvider>
				<TimelineToolbarButton
					icon={<span>icon</span>}
					tooltip="Freeze frame (coming soon)"
					disabled
				/>
			</TooltipProvider>,
		);

		expect(html).toContain('aria-label="Freeze frame (coming soon)"');
		expect(html).toContain("disabled");
	});
});
