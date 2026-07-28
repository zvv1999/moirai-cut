"use client";

import { useMemo } from "react";
import { useKeybindingsStore } from "@/actions/keybindings-store";
import {
	ACTIONS,
	isActionWithOptionalArgs,
	type TActionWithOptionalArgs,
} from "@/actions";
import {
	getPlatformAlternateKey,
	getPlatformSpecialKey,
} from "@/utils/platform";

export interface KeyboardShortcut {
	id: string;
	keys: string[];
	description: string;
	category: string;
	action: TActionWithOptionalArgs;
	icon?: React.ReactNode;
}

export function formatShortcutKey({ key }: { key: string }): string {
	const labels: Record<string, string> = {
		ctrl: getPlatformSpecialKey(),
		alt: getPlatformAlternateKey(),
		shift: "Shift",
		left: "←",
		right: "→",
		up: "↑",
		down: "↓",
		space: "Space",
		home: "Home",
		enter: "Enter",
		end: "End",
		delete: "Delete",
		backspace: "Backspace",
	};

	return key
		.split("+")
		.map(
			(part) => labels[part] ?? (part.length === 1 ? part.toUpperCase() : part),
		)
		.join("+");
}

export function useKeyboardShortcutsHelp() {
	const { keybindings } = useKeybindingsStore();

	const shortcuts = useMemo(() => {
		const actionToKeys = new Map<TActionWithOptionalArgs, string[]>();

		for (const [key, action] of keybindings) {
			const existing = actionToKeys.get(action);
			if (existing) {
				existing.push(formatShortcutKey({ key }));
			} else {
				actionToKeys.set(action, [formatShortcutKey({ key })]);
			}
		}

		const result: KeyboardShortcut[] = [];
		for (const action of Object.keys(ACTIONS)) {
			if (!isActionWithOptionalArgs(action)) continue;
			const keys = actionToKeys.get(action) ?? [];
			const actionDef = ACTIONS[action];
			result.push({
				id: action,
				keys,
				description: actionDef.description,
				category: actionDef.category,
				action,
			});
		}

		return result.sort((a, b) => {
			if (a.category !== b.category) {
				return a.category.localeCompare(b.category);
			}
			return a.description.localeCompare(b.description);
		});
	}, [keybindings]);

	return {
		shortcuts,
	};
}
