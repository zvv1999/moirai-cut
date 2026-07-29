import { describe, expect, test } from "bun:test";
import { getActionDefinition } from "../definitions";

describe("keyframe keyboard movement", () => {
	test("exposes one-frame keyframe nudges as configurable shortcuts", () => {
		expect(
			getActionDefinition({ action: "nudge-keyframes-backward" }),
		).toMatchObject({
			description: "将所选关键帧向后移动一帧",
			defaultShortcuts: ["alt+left"],
		});
		expect(
			getActionDefinition({ action: "nudge-keyframes-forward" }),
		).toMatchObject({
			description: "将所选关键帧向前移动一帧",
			defaultShortcuts: ["alt+right"],
		});
	});
});
