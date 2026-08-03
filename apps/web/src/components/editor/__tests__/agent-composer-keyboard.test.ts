import { describe, expect, test } from "bun:test";
import { shouldSubmitAgentComposer } from "@/components/editor/agent-composer-keyboard";

describe("Agent composer keyboard interaction", () => {
	test("submits a completed message with Enter", () => {
		expect(
			shouldSubmitAgentComposer({
				key: "Enter",
				shiftKey: false,
				isComposing: false,
				keyCode: 13,
			}),
		).toBe(true);
	});

	test("keeps Enter inside an active IME composition", () => {
		expect(
			shouldSubmitAgentComposer({
				key: "Enter",
				shiftKey: false,
				isComposing: true,
				keyCode: 13,
			}),
		).toBe(false);
	});

	test("keeps the Safari legacy IME Enter event with keyCode 229", () => {
		expect(
			shouldSubmitAgentComposer({
				key: "Enter",
				shiftKey: false,
				isComposing: false,
				keyCode: 229,
			}),
		).toBe(false);
	});

	test("keeps Shift+Enter as a line break", () => {
		expect(
			shouldSubmitAgentComposer({
				key: "Enter",
				shiftKey: true,
				isComposing: false,
				keyCode: 13,
			}),
		).toBe(false);
	});
});
