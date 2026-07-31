import { describe, expect, test } from "bun:test";
import {
	scoreAgentReadiness,
	type AgentDoctorCheck,
} from "@/server/agent-doctor";

describe("Agent setup doctor", () => {
	test("requires editing runtime, media tools, a provider and MCP for full readiness", () => {
		const checks: AgentDoctorCheck[] = [
			{ id: "web", label: "OpenCut 服务", status: "pass", detail: "ready" },
			{ id: "projects", label: "工程目录", status: "pass", detail: "writable" },
			{ id: "runtime", label: "Agent 运行时", status: "pass", detail: "bun" },
			{ id: "media", label: "媒体工具", status: "pass", detail: "ffmpeg" },
			{ id: "provider", label: "Agent", status: "pass", detail: "codex" },
			{ id: "mcp", label: "工程工具", status: "pass", detail: "installed" },
		];

		expect(scoreAgentReadiness(checks)).toEqual({
			score: 100,
			ready: true,
			blocking: [],
		});
	});

	test("returns actionable blockers instead of a generic OK", () => {
		const checks: AgentDoctorCheck[] = [
			{ id: "web", label: "OpenCut 服务", status: "pass", detail: "ready" },
			{
				id: "projects",
				label: "工程目录",
				status: "fail",
				detail: "not writable",
			},
			{ id: "runtime", label: "Agent 运行时", status: "pass", detail: "bun" },
			{
				id: "media",
				label: "媒体工具",
				status: "warning",
				detail: "ffmpeg missing",
			},
			{
				id: "provider",
				label: "Agent",
				status: "fail",
				detail: "not installed",
			},
			{
				id: "mcp",
				label: "工程工具",
				status: "warning",
				detail: "not installed",
			},
		];

		const result = scoreAgentReadiness(checks);

		expect(result.score).toBeLessThan(70);
		expect(result.ready).toBe(false);
		expect(result.blocking).toEqual(["projects", "provider"]);
	});
});
