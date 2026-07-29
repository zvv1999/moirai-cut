import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(
	fileURLToPath(new URL("../agent-badge.tsx", import.meta.url)),
	"utf8",
);
const workbenchSource = readFileSync(
	fileURLToPath(new URL("../agent-workbench.tsx", import.meta.url)),
	"utf8",
);
const envExampleSource = readFileSync(
	fileURLToPath(new URL("../../../../.env.example", import.meta.url)),
	"utf8",
);

describe("智能剪辑与工程历史分面", () => {
	test("提供两个独立且可访问的入口，不再使用合并入口", () => {
		expect(source).toContain('aria-label="打开智能剪辑"');
		expect(source).toContain('aria-label="打开工程历史"');
		expect(source).not.toContain("智能剪辑与工程历史");
		expect(source).not.toContain("打开工程快照和智能体活动");
	});

	test("使用单一分面状态，保证两个面板不会同时展开", () => {
		expect(source).toContain(
			'type AgentBadgeSurface = "smart-edit" | "project-history" | null;',
		);
		expect(source).toContain(
			"const [openSurface, setOpenSurface] = useState<AgentBadgeSurface>(null);",
		);
		expect(source).toContain('openSurface === "smart-edit"');
		expect(source).toContain('openSurface === "project-history"');
	});

	test("两个入口向辅助技术暴露当前展开状态", () => {
		expect(source).toContain(
			'aria-pressed={openSurface === "smart-edit"}',
		);
		expect(source).toContain(
			'aria-pressed={openSurface === "project-history"}',
		);
	});

	test("智能剪辑直接打开为可访问的对话框", () => {
		expect(source).toContain('<Dialog open={openSurface === "smart-edit"}');
		expect(source).toContain('aria-label="智能剪辑对话框"');
		expect(workbenchSource).toContain('role="log"');
		expect(workbenchSource).toContain('aria-label="智能剪辑对话记录"');
		expect(workbenchSource).toContain('aria-label="发送智能剪辑需求"');
	});

	test("对话框提供时间轴与素材库两类上下文选择器", () => {
		expect(workbenchSource).toContain('aria-label="添加上下文引用"');
		expect(workbenchSource).toContain('aria-label="选择时间轴素材"');
		expect(workbenchSource).toContain('aria-label="选择素材库元素"');
		expect(workbenchSource).toContain("buildMediaContextReferences");
	});

	test("对话框展示可配置的 Codex Path 连接状态", () => {
		expect(workbenchSource).toContain('fetch("/api/codex/config")');
		expect(workbenchSource).toContain('aria-label="配置 Codex 连接"');
		expect(workbenchSource).toContain('aria-label="Codex Path"');
		expect(workbenchSource).toContain("API 模式");
		expect(envExampleSource).toContain(
			"CODEX_BIN=/Applications/ChatGPT.app/Contents/Resources/codex",
		);
	});

	test("每条智能剪辑消息直接进入 Codex，不再经过本地计划和质检", () => {
		expect(workbenchSource).toContain('fetch("/api/codex/chat"');
		expect(workbenchSource).toContain("Codex 正在处理");
		expect(workbenchSource).toContain("本会话由 Codex 直接处理");
		expect(workbenchSource).toContain("response.body.getReader()");
		expect(workbenchSource).toContain('event.event === "delta"');
		expect(workbenchSource).toContain(
			"...(sessionId ? { sessionId } : {})",
		);
		expect(workbenchSource).not.toContain("compileSemanticEdit");
		expect(workbenchSource).not.toContain("计划需要处理");
		expect(workbenchSource).not.toContain("运行质检");
	});
});
