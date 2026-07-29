import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(
	fileURLToPath(new URL("../agent-badge.tsx", import.meta.url)),
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
});
