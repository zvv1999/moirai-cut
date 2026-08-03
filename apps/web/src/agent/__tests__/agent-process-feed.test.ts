import { describe, expect, test } from "bun:test";
import type {
	CodexProtocolFrame,
	ProviderNativeEvent,
} from "@/agent/codex-conversation";
import {
	agentStartupStep,
	buildAgentProcessSteps,
	visibleAgentProcessSteps,
} from "@/agent/agent-process-feed";

describe("Agent process feed", () => {
	test("uses Provider-native startup language before the first event arrives", () => {
		expect(agentStartupStep("claude")).toMatchObject({
			kind: "notice",
			status: "active",
			title: "Claude Code 正在处理",
			transient: true,
		});
		expect(agentStartupStep("codex")).toMatchObject({
			kind: "notice",
			status: "active",
			title: "Codex 正在处理",
			transient: true,
		});
	});

	test("turns Codex reasoning, plan and tool frames into readable work steps", () => {
		const protocol: CodexProtocolFrame[] = [
			{
				id: "reasoning-1",
				method: "item/reasoning/summaryTextDelta",
				threadId: "thread-1",
				itemType: "reasoning",
				status: "streaming",
				title: "分析",
				detail: "先读取工程结构，再确认字幕样式。",
			},
			{
				id: "plan-1",
				method: "turn/plan/updated",
				threadId: "thread-1",
				itemType: "plan",
				status: "streaming",
				title: "更新执行计划",
				detail: "✓ 读取工程\n→ 检查字幕",
			},
			{
				id: "tool-1",
				method: "item/completed",
				threadId: "thread-1",
				itemType: "mcpToolCall",
				status: "completed",
				title: "Moirai Cut · read_project",
				detail: '参数\n{\n  "projectId": "project-1"\n}\n\n结果\n读取完成',
			},
		];

		const steps = buildAgentProcessSteps({ protocol, nativeEvents: [] });

		expect(steps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "reasoning-1",
					kind: "thinking",
					title: "正在分析剪辑需求",
					detail: "先读取工程结构，再确认字幕样式。",
				}),
				expect.objectContaining({
					id: "plan-1",
					kind: "plan",
					title: "正在整理执行步骤",
				}),
				expect.objectContaining({
					id: "tool-1",
					kind: "tool",
					title: "读取当前工程",
					status: "completed",
				}),
			]),
		);
		expect(JSON.stringify(steps)).not.toContain("item/reasoning");
	});

	test("combines Claude thinking, tool use and tool result events", () => {
		const nativeEvents: ProviderNativeEvent[] = [
			{
				id: "native-thinking",
				provider: "claude",
				transport: "stream-json",
				name: "assistant/thinking",
				payload: {
					type: "assistant",
					message: {
						content: [
							{
								type: "thinking",
								thinking: "先读取工程，再对比所有字幕轨道。",
							},
						],
					},
				},
			},
			{
				id: "native-tool",
				provider: "claude",
				transport: "stream-json",
				name: "assistant/tool_use",
				payload: {
					type: "assistant",
					message: {
						content: [
							{
								type: "tool_use",
								id: "tool-1",
								name: "mcp__opencut__read_project",
								input: {
									projectId: "project-1",
									api_key: "must-not-render",
								},
							},
						],
					},
				},
			},
			{
				id: "native-result",
				provider: "claude",
				transport: "stream-json",
				name: "user/tool_result",
				payload: {
					type: "user",
					message: {
						content: [
							{
								type: "tool_result",
								tool_use_id: "tool-1",
								content: "工程包含 6 条字幕素材。",
							},
						],
					},
				},
			},
		];

		const steps = buildAgentProcessSteps({ protocol: [], nativeEvents });
		const thinking = steps.find((step) => step.kind === "thinking");
		const tool = steps.find((step) => step.id === "tool-1");

		expect(thinking).toMatchObject({
			title: "思考剪辑路径",
			detail: "先读取工程，再对比所有字幕轨道。",
		});
		expect(tool).toMatchObject({
			kind: "tool",
			title: "读取当前工程",
			status: "completed",
		});
		expect(tool?.detail).toContain("projectId：project-1");
		expect(tool?.detail).toContain("api_key：[已隐藏]");
		expect(tool?.detail).toContain("工程包含 6 条字幕素材");
		expect(tool?.detail).not.toContain("must-not-render");
	});

	test("ignores transport noise instead of rendering raw Provider event names", () => {
		const nativeEvents: ProviderNativeEvent[] = [
			{
				id: "system-init",
				provider: "claude",
				transport: "stream-json",
				name: "system/hook_started",
				payload: { type: "system", subtype: "hook_started" },
			},
		];

		expect(buildAgentProcessSteps({ protocol: [], nativeEvents })).toEqual([]);
	});

	test("keeps Provider lifecycle events transient instead of attaching them to completed replies", () => {
		const nativeEvents: ProviderNativeEvent[] = [
			{
				id: "claude-init",
				provider: "claude",
				transport: "stream-json",
				name: "system/init",
				payload: {
					type: "system",
					subtype: "init",
					session_id: "claude-session",
				},
			},
			{
				id: "codex-turn",
				provider: "codex",
				transport: "app-server-json-rpc",
				name: "turn/started",
				payload: {
					method: "turn/started",
					params: {
						threadId: "codex-thread",
						turn: { id: "codex-turn" },
					},
				},
			},
		];

		const steps = buildAgentProcessSteps({ protocol: [], nativeEvents });

		expect(steps).toEqual([
			expect.objectContaining({
				id: "claude-init",
				transient: true,
			}),
			expect.objectContaining({
				id: "codex-turn",
				transient: true,
			}),
		]);
		expect(
			visibleAgentProcessSteps({
				steps,
				streaming: false,
				provider: "claude",
			}),
		).toEqual([]);
		expect(
			visibleAgentProcessSteps({
				steps,
				streaming: true,
				provider: "claude",
			}),
		).toEqual([
			expect.objectContaining({
				title: "Claude Code 正在处理",
				transient: true,
			}),
		]);
	});

	test("preserves meaningful work after a lifecycle handshake finishes", () => {
		const steps = buildAgentProcessSteps({
			protocol: [
				{
					id: "tool-1",
					method: "item/completed",
					threadId: "thread-1",
					itemType: "mcpToolCall",
					status: "completed",
					title: "Moirai Cut · read_project",
				},
			],
			nativeEvents: [
				{
					id: "claude-init",
					provider: "claude",
					transport: "stream-json",
					name: "system/init",
					payload: {
						type: "system",
						subtype: "init",
						session_id: "claude-session",
					},
				},
			],
		});

		expect(
			visibleAgentProcessSteps({
				steps,
				streaming: false,
				provider: "claude",
			}),
		).toEqual([
			expect.objectContaining({
				id: "tool-1",
				title: "读取当前工程",
			}),
		]);
	});

	test("summarizes oversized results and collapses repeated Claude retries", () => {
		const makeToolCycle = (suffix: string): ProviderNativeEvent[] => [
			{
				id: `tool-${suffix}`,
				provider: "claude",
				transport: "stream-json",
				name: "assistant/tool_use",
				payload: {
					type: "assistant",
					message: {
						content: [
							{
								type: "tool_use",
								id: `bash-${suffix}`,
								name: "Bash",
								input: { command: "python inspect_project.py" },
							},
						],
					},
				},
			},
			{
				id: `result-${suffix}`,
				provider: "claude",
				transport: "stream-json",
				name: "user/tool_result",
				payload: {
					type: "user",
					message: {
						content: [
							{
								type: "tool_result",
								tool_use_id: `bash-${suffix}`,
								content:
									"Output too large. <persisted-output>70KB project payload</persisted-output>",
							},
						],
					},
				},
			},
		];

		const steps = buildAgentProcessSteps({
			protocol: [],
			nativeEvents: [...makeToolCycle("1"), ...makeToolCycle("2")],
		});

		expect(steps).toHaveLength(1);
		expect(steps[0]).toMatchObject({
			kind: "command",
			title: "运行命令",
			status: "completed",
		});
		expect(steps[0]?.detail).toContain(
			"工程数据已读取（内容较大，已使用摘要结果）",
		);
		expect(steps[0]?.detail).not.toContain("<persisted-output>");
	});
});
