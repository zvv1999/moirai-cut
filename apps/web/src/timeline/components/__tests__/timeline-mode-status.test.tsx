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
				label: "Source audio linked",
				canToggle: true,
			}}
			sourceAudioShortcut="A"
			onToggleSnapping={() => {}}
			onToggleRippleEditing={() => {}}
			onToggleSourceAudio={() => {}}
		/>,
	);

	expect(markup).toContain('role="group"');
	expect(markup).toContain('aria-label="Timeline edit modes"');
	expect(markup).toContain('aria-label="Auto snapping: On (N)"');
	expect(markup).toContain('aria-pressed="true"');
	expect(markup).toContain("Snap");
	expect(markup).toContain("On");
	expect(markup).toContain("<kbd");
	expect(markup).toContain(">N</kbd>");
	expect(markup).toContain('aria-label="Ripple editing: Off (R)"');
	expect(markup).toContain("Ripple");
	expect(markup).toContain("Off");
	expect(markup).toContain(">R</kbd>");
	expect(markup).toContain('aria-label="Source audio linked (A)"');
	expect(markup).toContain("Audio");
	expect(markup).toContain("Linked");
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
				label: "Select one video clip to manage source audio",
				canToggle: false,
			}}
			sourceAudioShortcut={null}
			onToggleSnapping={() => {}}
			onToggleRippleEditing={() => {}}
			onToggleSourceAudio={() => {}}
		/>,
	);

	expect(markup).toContain('aria-label="Auto snapping: Off"');
	expect(markup).toContain('aria-label="Ripple editing: On"');
	expect(markup).toContain("Select one video clip to manage source audio");
	expect(markup).toContain("Unavailable");
	expect(markup).toContain("disabled");
});
