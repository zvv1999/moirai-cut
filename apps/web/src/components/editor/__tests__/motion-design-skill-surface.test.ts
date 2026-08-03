import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
	new URL("../agent-workbench.tsx", import.meta.url),
	"utf8",
);

describe("字幕与 MG 创作 Skill 入口", () => {
	test("offers a concise one-click motion-design action", () => {
		expect(source).toContain(
			'MOTION_DESIGN_SKILL_NAME = "moirai-cut-motion-design"',
		);
		expect(source).toContain("升级字幕与 MG 动效");
		expect(source).toContain("$moirai-cut-motion-design");
		expect(source).toContain("motionDesignSkillReady");
	});
});
