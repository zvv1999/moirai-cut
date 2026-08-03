import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const root = join(import.meta.dir, "..");
const skillDir = join(root, ".agents", "skills", "moirai-cut-motion-design");
const skillPath = join(skillDir, "SKILL.md");
const stylePath = join(skillDir, "references", "style-system.md");
const evalsPath = join(skillDir, "evals", "evals.json");
const metadataPath = join(skillDir, "agents", "openai.yaml");

describe("moirai-cut-motion-design project skill", () => {
	test("ships as a discoverable one-call caption and MG design skill", () => {
		expect(existsSync(skillPath)).toBe(true);
		expect(existsSync(metadataPath)).toBe(true);
		const skill = readFileSync(skillPath, "utf8");
		expect(skill).toMatch(/^---\nname: moirai-cut-motion-design\n/m);
		expect(skill).toContain("字幕");
		expect(skill).toContain("MG");
		expect(skill).toContain("一次调用");
		expect(skill).toContain("不要套用固定模板");
	});

	test("turns project context into editable motion and verifies the rendered result", () => {
		const protocol = `${readFileSync(skillPath, "utf8")}\n${readFileSync(stylePath, "utf8")}`;
		for (const term of [
			"get_active_project",
			"read_agent_context",
			"read_project",
			"inspect_timeline_range",
			"analyze_audio",
			"element.setParams",
			"element.upsertKeyframe",
			"element.setKeyframeCurve",
			"edit_project",
			"wait_for_sync",
			"render_frames",
		]) {
			expect(protocol).toContain(term);
		}
		expect(protocol).toContain("title-safe");
		expect(protocol).toContain("4–7 个汉字/秒");
		expect(protocol).toContain("80–120ms");
		expect(protocol).toContain("每个节拍只保留一个主运动");
	});

	test("includes representative quality evals", () => {
		const evals = JSON.parse(readFileSync(evalsPath, "utf8"));
		expect(evals.skill_name).toBe("moirai-cut-motion-design");
		expect(evals.evals).toHaveLength(3);
		for (const entry of evals.evals) {
			expect(entry.prompt.length).toBeGreaterThan(12);
			expect(entry.expected_output).toContain("可编辑");
			expect(entry.assertions.length).toBeGreaterThanOrEqual(4);
		}
	});
});
