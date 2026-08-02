import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const root = join(import.meta.dir, "..");
const skillDir = join(root, ".agents", "skills", "moirai-cut-create");
const skillPath = join(skillDir, "SKILL.md");
const toolMapPath = join(skillDir, "references", "tool-map.md");
const evalsPath = join(skillDir, "evals", "evals.json");

describe("moirai-cut-create project skill", () => {
	test("ships as a discoverable project skill with realistic triggers", () => {
		expect(existsSync(skillPath)).toBe(true);
		const skill = readFileSync(skillPath, "utf8");
		expect(skill).toMatch(/^---\nname: moirai-cut-create\n/m);
		expect(skill).toContain("从素材到可编辑成片");
		expect(skill).toContain("完整首剪");
		expect(skill).toContain("不要用于单个参数微调");
	});

	test("encodes the complete reversible edit, inspection, QC, and export loop", () => {
		const protocol = `${readFileSync(skillPath, "utf8")}\n${readFileSync(toolMapPath, "utf8")}`;
		for (const tool of [
			"get_active_project",
			"read_agent_context",
			"read_project",
			"build_media_catalog",
			"read_media_catalog",
			"inspect_media_scenes",
			"inspect_timeline_range",
			"save_media_analysis",
			"analyze_audio",
			"edit_project",
			"lint_cut",
			"wait_for_sync",
			"render_frames",
			"start_export",
			"get_export",
		]) {
			expect(protocol).toContain(tool);
		}
		expect(protocol).toContain("baseRevision");
		expect(protocol).toContain("idempotencyKey");
		expect(protocol).toContain("draft");
		expect(protocol).toContain("可编辑、可撤销");
		expect(protocol).not.toContain("delete_project");
		expect(protocol).not.toContain("delete_media");
	});

	test("includes representative one-call evaluations", () => {
		const evals = JSON.parse(readFileSync(evalsPath, "utf8"));
		expect(evals.skill_name).toBe("moirai-cut-create");
		expect(evals.evals).toHaveLength(3);
		for (const entry of evals.evals) {
			expect(entry.prompt.length).toBeGreaterThan(12);
			expect(entry.expected_output).toContain("可编辑");
			expect(entry.assertions.length).toBeGreaterThanOrEqual(4);
		}
	});
});
