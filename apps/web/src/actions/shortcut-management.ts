import type { ShortcutKey } from "@/actions/keybinding";
import type { TActionWithOptionalArgs } from "@/actions/types";
import {
	formatShortcutKey,
	type KeyboardShortcut,
} from "@/actions/use-keyboard-shortcuts-help";

export function filterKeyboardShortcuts({
	shortcuts,
	query,
}: {
	shortcuts: KeyboardShortcut[];
	query: string;
}): KeyboardShortcut[] {
	const normalized = query.trim().toLocaleLowerCase();
	if (!normalized) return shortcuts;

	return shortcuts.filter((shortcut) =>
		[
			shortcut.description,
			shortcut.category,
			shortcut.action,
			...shortcut.keys,
		].some((value) => value.toLocaleLowerCase().includes(normalized)),
	);
}

export function getDisplayShortcutForAction({
	action,
	keybindings,
}: {
	action: TActionWithOptionalArgs;
	keybindings: ReadonlyMap<ShortcutKey, TActionWithOptionalArgs>;
}): string {
	for (const [key, mappedAction] of keybindings) {
		if (mappedAction === action) {
			return formatShortcutKey({ key }).replaceAll("+", " ");
		}
	}

	return "";
}
