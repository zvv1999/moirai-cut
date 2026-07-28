import { describe, expect, test } from "bun:test";
import type { KeyboardShortcut } from "../use-keyboard-shortcuts-help";
import {
	filterKeyboardShortcuts,
	getDisplayShortcutForAction,
} from "../shortcut-management";

const shortcuts: KeyboardShortcut[] = [
	{
		id: "split",
		action: "split",
		description: "Split at playhead",
		category: "editing",
		keys: ["S"],
	},
	{
		id: "toggle-play",
		action: "toggle-play",
		description: "Play / pause",
		category: "playback",
		keys: ["Space"],
	},
];

describe("shortcut management", () => {
	test("finds shortcuts by command, category, action id, or current key", () => {
		expect(
			filterKeyboardShortcuts({ shortcuts, query: "playhead" }).map(
				(shortcut) => shortcut.action,
			),
		).toEqual(["split"]);
		expect(
			filterKeyboardShortcuts({ shortcuts, query: "playback" }).map(
				(shortcut) => shortcut.action,
			),
		).toEqual(["toggle-play"]);
		expect(
			filterKeyboardShortcuts({ shortcuts, query: "toggle-play" }).map(
				(shortcut) => shortcut.action,
			),
		).toEqual(["toggle-play"]);
		expect(
			filterKeyboardShortcuts({ shortcuts, query: "space" }).map(
				(shortcut) => shortcut.action,
			),
		).toEqual(["toggle-play"]);
	});

	test("renders the current binding instead of the action default", () => {
		const current = new Map([
			["x", "split"],
			["space", "toggle-play"],
		] as const);

		expect(
			getDisplayShortcutForAction({
				action: "split",
				keybindings: current,
			}),
		).toBe("X");
		expect(
			getDisplayShortcutForAction({
				action: "delete-selected",
				keybindings: current,
			}),
		).toBe("");
	});
});
