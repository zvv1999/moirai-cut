import { describe, expect, test } from "bun:test";
import { getActionDefinition } from "../definitions";

describe("keyframe keyboard movement", () => {
	test("exposes one-frame keyframe nudges as configurable shortcuts", () => {
		expect(
			getActionDefinition({ action: "nudge-keyframes-backward" }),
		).toMatchObject({
			description: "Nudge selected keyframes backward one frame",
			defaultShortcuts: ["alt+left"],
		});
		expect(
			getActionDefinition({ action: "nudge-keyframes-forward" }),
		).toMatchObject({
			description: "Nudge selected keyframes forward one frame",
			defaultShortcuts: ["alt+right"],
		});
	});
});
