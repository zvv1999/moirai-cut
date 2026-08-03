import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
	buildClaudeProcessEnvironment,
	buildClaudeCommand,
	createClaudeChatService,
	createClaudeSessionPool,
	decodeClaudeStreamMessage,
	encodeClaudeUserMessage,
} from "@/server/claude-chat";

describe("Claude Code browser chat", () => {
	test("builds a resumable long-lived stream-json command with the Moirai Cut MCP enabled", () => {
		const command = buildClaudeCommand({
			sessionId: "019fb406-76ae-70a2-be88-204b762c7468",
			model: "sonnet",
			effort: "high",
			mode: "edit",
			mcpConfig: '{"mcpServers":{"opencut":{}}}',
		});

		expect(command).toEqual(
			expect.arrayContaining([
				"-p",
				"--input-format",
				"stream-json",
				"--output-format",
				"stream-json",
				"--include-partial-messages",
				"--resume",
				"019fb406-76ae-70a2-be88-204b762c7468",
				"--model",
				"sonnet",
				"--effort",
				"high",
				"--permission-mode",
				"acceptEdits",
				"--allowedTools",
				"mcp__opencut__*",
				"--mcp-config",
				'{"mcpServers":{"opencut":{}}}',
				"--strict-mcp-config",
			]),
		);
		expect(command).not.toContain("tighten this edit");
	});

	test("encodes each browser turn as one Claude stream-json user message", () => {
		expect(JSON.parse(encodeClaudeUserMessage("tighten this edit"))).toEqual({
			type: "user",
			message: {
				role: "user",
				content: [{ type: "text", text: "tighten this edit" }],
			},
		});
	});

	test("reuses one Claude process for consecutive turns in the same conversation", async () => {
		let spawnCount = 0;
		const writtenMessages: unknown[] = [];
		const children: Array<{ killed: boolean }> = [];
		const spawnProcess = () => {
			spawnCount += 1;
			const child = new EventEmitter() as EventEmitter & {
				stdin: PassThrough;
				stdout: PassThrough;
				stderr: PassThrough;
				exitCode: number | null;
				killed: boolean;
				kill(signal?: NodeJS.Signals): boolean;
			};
			child.stdin = new PassThrough();
			child.stdout = new PassThrough();
			child.stderr = new PassThrough();
			child.exitCode = null;
			child.killed = false;
			child.kill = () => {
				if (child.killed) return false;
				child.killed = true;
				child.exitCode = 0;
				child.stdin.end();
				child.stdout.end();
				child.stderr.end();
				queueMicrotask(() => child.emit("close", 0));
				return true;
			};
			let turn = 0;
			child.stdin.on("data", (chunk: Buffer) => {
				turn += 1;
				writtenMessages.push(JSON.parse(chunk.toString("utf8")));
				queueMicrotask(() => {
					if (turn === 1) {
						child.stdout.write(
							`${JSON.stringify({ type: "system", subtype: "init", session_id: "claude-session" })}\n`,
						);
					}
					child.stdout.write(
						`${JSON.stringify({
							type: "stream_event",
							event: {
								type: "content_block_delta",
								delta: { type: "text_delta", text: `reply-${turn}` },
							},
						})}\n`,
					);
					child.stdout.write(
						`${JSON.stringify({
							type: "result",
							subtype: "success",
							is_error: false,
							result: `reply-${turn}`,
							session_id: "claude-session",
						})}\n`,
					);
				});
			});
			children.push(child);
			return child;
		};
		const pool = createClaudeSessionPool({ idleTimeoutMs: 60_000 });
		const serviceOptions = {
			pool,
			spawnProcess,
			cwd: "/workspace",
			mcpConfig: '{"mcpServers":{"opencut":{}}}',
		};
		const request = {
			projectId: "project-1",
			message: "first",
			messageId: "message-1",
			context: "context",
			conversationId: "conversation-1",
		};
		const collect = async (
			stream: AsyncIterable<unknown>,
		): Promise<unknown[]> => {
			const events: unknown[] = [];
			for await (const event of stream) events.push(event);
			return events;
		};

		const first = await collect(
			createClaudeChatService(serviceOptions).stream({
				binary: "/mock/claude",
				request,
			}),
		);
		const second = await collect(
			createClaudeChatService(serviceOptions).stream({
				binary: "/mock/claude",
				request: {
					...request,
					message: "second",
					messageId: "message-2",
					sessionId: "claude-session",
				},
			}),
		);

		expect(spawnCount).toBe(1);
		expect(writtenMessages).toHaveLength(2);
		expect(first).toContainEqual(
			expect.objectContaining({ type: "done", message: "reply-1" }),
		);
		expect(second).toContainEqual(
			expect.objectContaining({ type: "done", message: "reply-2" }),
		);
		pool.closeAll();
		expect(children[0]?.killed).toBe(true);
	});

	test("maps Claude stream-json messages to the shared browser event contract", () => {
		const initPayload = {
			type: "system",
			subtype: "init",
			session_id: "claude-session",
		};
		const initEvents = decodeClaudeStreamMessage(initPayload);
		expect(initEvents[0]).toMatchObject({
			type: "native",
			event: {
				provider: "claude",
				transport: "stream-json",
				name: "system/init",
				payload: initPayload,
			},
		});
		expect(initEvents.slice(1)).toEqual([
			{ type: "session", sessionId: "claude-session" },
		]);

		const deltaPayload = {
			type: "stream_event",
			event: {
				type: "content_block_delta",
				delta: { type: "text_delta", text: "正在重排" },
			},
		};
		const deltaEvents = decodeClaudeStreamMessage(deltaPayload);
		expect(deltaEvents[0]).toMatchObject({
			type: "native",
			event: expect.objectContaining({
				provider: "claude",
				transport: "stream-json",
				name: "stream_event/content_block_delta",
				payload: deltaPayload,
			}),
		});
		expect(deltaEvents.slice(1)).toEqual([
			{ type: "delta", delta: "正在重排" },
		]);

		const retryPayload = {
			type: "system",
			subtype: "api_retry",
			attempt: 2,
			max_retries: 10,
			error_status: 503,
			session_id: "claude-session",
		};
		const retryEvents = decodeClaudeStreamMessage(retryPayload);
		expect(retryEvents[0]).toMatchObject({
			type: "native",
			event: expect.objectContaining({ payload: retryPayload }),
		});
		expect(retryEvents.slice(1)).toEqual([
			expect.objectContaining({
				type: "protocol",
				frame: expect.objectContaining({
					status: "streaming",
					title: "Claude 服务繁忙，正在重试 2/10",
				}),
			}),
		]);

		const toolPayload = {
			type: "assistant",
			message: {
				content: [{ type: "tool_use", name: "mcp__opencut__edit_project" }],
			},
		};
		const toolEvents = decodeClaudeStreamMessage(toolPayload);
		expect(toolEvents[0]).toMatchObject({
			type: "native",
			event: expect.objectContaining({ payload: toolPayload }),
		});
		expect(toolEvents.slice(1)).toEqual([
			expect.objectContaining({
				type: "protocol",
				frame: expect.objectContaining({ title: "正在修改工程" }),
			}),
		]);

		const resultPayload = {
			type: "result",
			subtype: "success",
			is_error: false,
			result: "重排完成",
			session_id: "claude-session",
		};
		const resultEvents = decodeClaudeStreamMessage(resultPayload);
		expect(resultEvents[0]).toMatchObject({
			type: "native",
			event: expect.objectContaining({ payload: resultPayload }),
		});
		expect(resultEvents.slice(1)).toEqual([
			{
				type: "done",
				sessionId: "claude-session",
				message: "重排完成",
			},
		]);

		const unknownPayload = {
			type: "provider_extension",
			detail: { futureField: true },
		};
		expect(decodeClaudeStreamMessage(unknownPayload)).toEqual([
			expect.objectContaining({
				type: "native",
				event: expect.objectContaining({
					name: "provider_extension",
					payload: unknownPayload,
				}),
			}),
		]);
	});

	test("maps an Anthropic-compatible gateway to the Claude CLI environment", () => {
		const environment = buildClaudeProcessEnvironment({
			base: { PATH: "/usr/bin" },
			endpoint: {
				mode: "custom",
				baseUrl: "https://gateway.example.com/v1",
				auth: "bearer",
				credential: "gateway-token",
			},
		});

		expect(environment).toEqual(
			expect.objectContaining({
				PATH: "/usr/bin",
				ANTHROPIC_BASE_URL: "https://gateway.example.com",
				ANTHROPIC_AUTH_TOKEN: "gateway-token",
			}),
		);
		expect(environment.ANTHROPIC_API_KEY).toBeUndefined();
	});
});
