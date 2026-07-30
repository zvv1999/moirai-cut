import { describe, expect, test } from "bun:test";
import {
	CODEX_PERFORMANCE_PRESETS,
	DEFAULT_CODEX_PERFORMANCE_MODE,
	getCodexPerformancePreset,
} from "@/agent/codex-performance";

describe("Codex smart-edit performance presets", () => {
	test("uses a balanced default that avoids blocking visual and full verification work", () => {
		expect(DEFAULT_CODEX_PERFORMANCE_MODE).toBe("balanced");
		expect(getCodexPerformancePreset(DEFAULT_CODEX_PERFORMANCE_MODE)).toMatchObject(
			{
				effort: "high",
				toolProfile: "edit",
				visualMode: "off",
				verificationMode: "basic",
			},
		);
	});

	test("keeps fast and director modes as explicit quality/latency choices", () => {
		expect(CODEX_PERFORMANCE_PRESETS.map((preset) => preset.id)).toEqual([
			"fast",
			"balanced",
			"director",
		]);
		expect(getCodexPerformancePreset("fast")).toMatchObject({
			effort: "medium",
			verificationMode: "off",
		});
		expect(getCodexPerformancePreset("director")).toMatchObject({
			effort: "xhigh",
			toolProfile: "verify",
			visualMode: "auto",
			verificationMode: "full",
		});
	});
});
