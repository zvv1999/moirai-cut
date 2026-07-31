import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const readSource = (relativePath: string) =>
	readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

describe("Agent setup surface", () => {
	test("offers the two user-facing entry modes without exposing a raw binary path", () => {
		const setup = readSource("../agent-setup-panel.tsx");
		const workbench = readSource("../agent-workbench.tsx");

		expect(setup).toContain("在 OpenCut 中使用");
		expect(setup).toContain("在 Codex / Claude 中使用");
		expect(setup).toContain("安装 OpenCut MCP");
		expect(setup).toContain("重新检测");
		expect(workbench).toContain("<AgentSetupPanel");
		expect(workbench).not.toContain("Codex Path");
	});

	test("turns first-run onboarding into an environment readiness flow", () => {
		const onboarding = readSource("../onboarding.tsx");

		expect(onboarding).toContain("<AgentSetupPanel");
		expect(onboarding).toContain("开始创作");
		expect(onboarding).toContain("稍后配置");
		expect(onboarding).not.toContain("Discord");
	});
});
