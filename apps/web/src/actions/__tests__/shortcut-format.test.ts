import { describe, expect, test } from "bun:test";
import { formatShortcutKey } from "../use-keyboard-shortcuts-help";

describe("formatShortcutKey", () => {
	test("capitalizes single-letter editing shortcuts", () => {
		expect(formatShortcutKey({ key: "s" })).toBe("S");
	});

	test("keeps Backspace as a single correctly-cased key name", () => {
		expect(formatShortcutKey({ key: "backspace" })).toBe("Backspace");
	});
});
