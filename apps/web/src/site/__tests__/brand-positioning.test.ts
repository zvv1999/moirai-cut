import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SITE_INFO } from "../brand";

describe("Moirai Cut positioning", () => {
	test("defines the shared editable loop instead of an AI black box", () => {
		expect(SITE_INFO.title).toBe("Moirai Cut");
		expect(SITE_INFO.description).toContain("visible, editable loop");

		const hero = readFileSync(
			fileURLToPath(
				new URL("../../components/landing/hero.tsx", import.meta.url),
			),
			"utf8",
		);
		expect(hero).toContain("FROM BLACK BOX");
		expect(hero).toContain("TO SHARED TIMELINE");
		expect(hero).toContain("Prompt. Edit. Preview. Refine. Render locally.");
		expect(hero).toContain("Agents propose. You direct.");
	});
});
