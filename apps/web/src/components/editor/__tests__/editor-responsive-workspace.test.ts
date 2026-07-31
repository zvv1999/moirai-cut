import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	resolveEditorWorkspaceMode,
	resolveVisibleEditorSurfaces,
} from "../editor-responsive-layout";

const editorPageSource = readFileSync(
	fileURLToPath(
		new URL("../../../app/editor/[project_id]/page.tsx", import.meta.url),
	),
	"utf8",
);
const globalStyles = readFileSync(
	fileURLToPath(new URL("../../../app/globals.css", import.meta.url)),
	"utf8",
);

describe("编辑器多栏工作区", () => {
	test("完整窗口保留素材、预览和属性三面板", () => {
		expect(resolveEditorWorkspaceMode(1440)).toBe("studio");
		expect(
			resolveVisibleEditorSurfaces({
				mode: "studio",
				activeSurface: "preview",
			}),
		).toEqual(["assets", "preview", "properties"]);
	});

	test("Codex 双栏和三栏窗口切换为单面板专注模式", () => {
		expect(resolveEditorWorkspaceMode(960)).toBe("focus");
		expect(resolveEditorWorkspaceMode(640)).toBe("focus");
		expect(
			resolveVisibleEditorSurfaces({
				mode: "focus",
				activeSurface: "properties",
			}),
		).toEqual(["properties"]);
	});

	test("尚未测量宽度时保持稳定的完整布局", () => {
		expect(resolveEditorWorkspaceMode(0)).toBe("studio");
		expect(resolveEditorWorkspaceMode(Number.NaN)).toBe("studio");
	});

	test("工作区公开响应式模式与素材、画面、属性切换入口", () => {
		expect(editorPageSource).toContain("ResizeObserver");
		expect(editorPageSource).toContain('data-editor-layout-mode={workspaceMode}');
		expect(editorPageSource).toContain('aria-label="切换到素材面板"');
		expect(editorPageSource).toContain('aria-label="切换到预览画面"');
		expect(editorPageSource).toContain('aria-label="切换到属性面板"');
	});

	test("暗色工作台为继承文字和原生下拉提供明确的高对比颜色", () => {
		expect(globalStyles).toContain("color: var(--foreground);");
		expect(globalStyles).toContain("color-scheme: dark;");
		expect(globalStyles).toContain(
			":where(.editor-studio-shell) :where(select option)",
		);
		expect(globalStyles).toContain("background-color: var(--popover);");
	});
});
