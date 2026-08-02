import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(
	fileURLToPath(new URL("../agent-workbench.tsx", import.meta.url)),
	"utf8",
);

describe("full creation skill surface", () => {
	test("makes the complete editable first-cut workflow visible without skill syntax", () => {
		expect(source).toContain('FULL_CREATION_SKILL_NAME = "moirai-cut-create"');
		expect(source).toContain("完整创作 Skill");
		expect(source).toContain("从当前素材完成一版可编辑首剪");
		expect(source).toContain("理解素材");
		expect(source).toContain("生成时间线");
		expect(source).toContain("预览质检");
		expect(source).toContain("本地导出");
		expect(source).toContain('aria-label="使用完整创作 Skill"');
	});

	test("starts the project skill in execution mode and shows whether Codex found it", () => {
		expect(source).toContain("FULL_CREATION_REQUEST");
		expect(source).toContain("$moirai-cut-create");
		expect(source).toContain("submitToCodex(FULL_CREATION_REQUEST)");
		expect(source).toContain("fullCreationSkillReady");
		expect(source).toContain("技能已就绪");
		expect(source).toContain("重启 Agent 后可用");
	});
});
