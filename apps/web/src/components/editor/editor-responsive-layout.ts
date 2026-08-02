export type EditorWorkspaceMode = "studio" | "focus";
export type EditorSurface = "assets" | "preview" | "properties";

/**
 * Below this width three resizable columns stop being useful. This commonly
 * happens when Moirai Cut shares the screen with Codex or Claude, or when the
 * in-editor Agent dock is open.
 */
export const EDITOR_FOCUS_MODE_WIDTH = 1040;

export function resolveEditorWorkspaceMode(
	workspaceWidth: number,
): EditorWorkspaceMode {
	if (!Number.isFinite(workspaceWidth) || workspaceWidth <= 0) return "studio";
	return workspaceWidth < EDITOR_FOCUS_MODE_WIDTH ? "focus" : "studio";
}

export function resolveVisibleEditorSurfaces({
	mode,
	activeSurface,
}: {
	mode: EditorWorkspaceMode;
	activeSurface: EditorSurface;
}): EditorSurface[] {
	return mode === "studio"
		? ["assets", "preview", "properties"]
		: [activeSurface];
}
