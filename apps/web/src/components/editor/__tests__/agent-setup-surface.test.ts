import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const readSource = (relativePath: string) =>
	readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

describe("Agent setup surface", () => {
	test("requires informed consent before sending project context externally", () => {
		const workbench = readSource("../agent-workbench.tsx");

		expect(workbench).toContain("发送给外部 Agent 前请确认");
		expect(workbench).toContain("允许并继续");
		expect(workbench).toContain("暂不发送");
		expect(workbench).toContain("重置数据授权");
		expect(workbench).toContain("hasExternalAgentConsent");
	});

	test("offers the two user-facing entry modes without exposing a raw binary path", () => {
		const setup = readSource("../agent-setup-panel.tsx");
		const workbench = readSource("../agent-workbench.tsx");

		expect(setup).toContain("在 Moirai Cut 中使用");
		expect(setup).toContain("在 Codex / Claude 中使用");
		expect(setup).toContain("安装 Moirai Cut MCP");
		expect(setup).toContain("重新检测");
		expect(workbench).toContain("<AgentSetupPanel");
		expect(workbench).not.toContain("Codex Path");
	});

	test("configures and switches the active browser conversation provider", () => {
		const setup = readSource("../agent-setup-panel.tsx");
		const workbench = readSource("../agent-workbench.tsx");

		expect(setup).toContain('aria-label="当前对话 Agent"');
		expect(setup).toContain("Claude Code 路径");
		expect(setup).toContain('action: "configure-provider"');
		expect(setup).toContain('action: "select-provider"');
		expect(workbench).toContain('fetch("/api/claude/chat"');
		expect(workbench).toContain('agentProvider === "claude"');
		expect(workbench).toContain("conversation.provider");
	});

	test("configures one redacted gateway shared by both CLIs", () => {
		const setup = readSource("../agent-setup-panel.tsx");
		const workbench = readSource("../agent-workbench.tsx");

		expect(setup).toContain('role="radiogroup"');
		expect(setup).toContain('aria-label="运行方式"');
		expect(setup).toContain('aria-label="使用本机账号"');
		expect(setup).toContain('aria-label="使用第三方端点"');
		expect(setup).toContain("本机账号");
		expect(setup).toContain("第三方端点");
		expect(setup).toContain("Base URL");
		expect(setup).not.toContain("模型 ID");
		expect(setup).toContain("Codex 与 Claude 共用");
		expect(setup).toContain('type="password"');
		expect(setup).toContain('action: "configure-endpoint"');
		expect(setup).toContain('action: "select-endpoint"');
		expect(setup).toContain("密钥只保存在本机服务端");
		expect(setup).toContain("OpenAI Responses 兼容");
		expect(setup).toContain("Anthropic Messages 兼容");
		expect(setup).toContain("validateEndpointDraft");
		expect(workbench).toContain('fetch("/api/agent/models"');
		expect(workbench).not.toContain('<option value="sonnet">Sonnet</option>');
	});

	test("lets an installed signed-out CLI configure a gateway and hides advanced setup", () => {
		const setup = readSource("../agent-setup-panel.tsx");

		expect(setup).toContain("provider.executable");
		expect(setup).not.toContain('disabled={provider.status !== "ready"}');
		expect(setup).toContain("高级设置与 MCP");
	});

	test("turns first-run onboarding into an environment readiness flow", () => {
		const onboarding = readSource("../onboarding.tsx");

		expect(onboarding).toContain("<AgentSetupPanel");
		expect(onboarding).toContain("开始创作");
		expect(onboarding).toContain("稍后配置");
		expect(onboarding).not.toContain("Discord");
	});
});
