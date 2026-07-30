import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
	buildCodexAppServerArgs,
	buildCodexPrompt,
	codexDesktopRefreshUrls,
	CodexAppServerRpcClient,
	createCodexChatService,
	type CodexAppServerConnection,
	type CodexAppServerSubscription,
	type CodexRuntimeConfig,
} from "@/server/codex-chat";

const runtime: CodexRuntimeConfig = {
	binary: "/Applications/ChatGPT.app/Contents/Resources/codex",
	repoRoot: "/workspace/opencut-classic",
	mcpServerPath: "/workspace/opencut-classic/apps/mcp/src/server.mjs",
	projectFilesDir: "/workspace/opencut-projects",
	baseUrl: "http://127.0.0.1:3000",
	disabledMcpServers: [
		"localcut",
		"node_repl",
		"computer-use",
		"openaiDeveloperDocs",
		"chanjing",
		"opencut",
	],
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readyOpenCutStatus(): unknown {
	return {
		data: [
			{
				name: "opencut",
				serverInfo: { name: "opencut", version: "1.0.0" },
				tools: {
					read_project: { name: "read_project" },
					edit_project: { name: "edit_project" },
					inspect_timeline_range: { name: "inspect_timeline_range" },
				},
				resources: [],
				resourceTemplates: [],
				authStatus: "notRequired",
			},
		],
		nextCursor: null,
	};
}

function projectSummary({
	projectId = "project-1",
	projectName = "地坛 × Reed",
	revision = 7,
}: {
	projectId?: string;
	projectName?: string;
	revision?: number;
} = {}): unknown {
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify({
					projectId,
					projectName,
					revision,
					scene: { id: "main", durationSeconds: 31 },
					tracks: [{ id: "video", elementCount: 4 }],
				}),
			},
		],
		isError: false,
	};
}

function subscriptionOf({
	notifications,
	onClose = () => {},
}: {
	notifications: unknown[];
	onClose?: () => void;
}): CodexAppServerSubscription {
	return {
		async *[Symbol.asyncIterator]() {
			for (const notification of notifications) yield notification;
		},
		close: onClose,
	};
}

function appServerProcess() {
	const stdin = new PassThrough();
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	const process = Object.assign(new EventEmitter(), {
		stdin,
		stdout,
		stderr,
	});
	const writes: Array<Record<string, unknown>> = [];
	let buffer = "";
	stdin.on("data", (chunk: Buffer) => {
		buffer += chunk.toString("utf8");
		for (;;) {
			const newline = buffer.indexOf("\n");
			if (newline < 0) break;
			const line = buffer.slice(0, newline);
			buffer = buffer.slice(newline + 1);
			const message: unknown = JSON.parse(line);
			if (!isRecord(message)) {
				throw new Error("Expected a JSON-RPC object.");
			}
			writes.push(message);
		}
	});
	return {
		process,
		stdout,
		stderr,
		writes,
	};
}

async function waitForWrite({
	writes,
	count,
}: {
	writes: Array<Record<string, unknown>>;
	count: number;
}): Promise<void> {
	for (let attempt = 0; attempt < 100 && writes.length < count; attempt += 1) {
		await Bun.sleep(1);
	}
	expect(writes.length).toBeGreaterThanOrEqual(count);
}

function initializeOptOutMethods(
	write: Record<string, unknown> | undefined,
): unknown[] {
	if (!write || typeof write.params !== "object" || write.params === null) {
		return [];
	}
	if (
		!("capabilities" in write.params) ||
		typeof write.params.capabilities !== "object" ||
		write.params.capabilities === null ||
		!("optOutNotificationMethods" in write.params.capabilities) ||
		!Array.isArray(write.params.capabilities.optOutNotificationMethods)
	) {
		return [];
	}
	return write.params.capabilities.optOutNotificationMethods;
}

describe("Codex app-server JSON-RPC client", () => {
	test("performs the handshake and dispatches thread notifications", async () => {
		const fake = appServerProcess();
		const client = new CodexAppServerRpcClient(fake.process);
		const initialized = client.initialize();

		await waitForWrite({ writes: fake.writes, count: 1 });
		expect(fake.writes[0]).toMatchObject({
			id: 1,
			method: "initialize",
		});
		const optOutMethods = initializeOptOutMethods(fake.writes[0]);
		expect(optOutMethods).not.toContain("item/reasoning/summaryTextDelta");
		expect(optOutMethods).not.toContain("item/commandExecution/outputDelta");
		expect(optOutMethods).toContain("item/reasoning/textDelta");
		fake.stdout.write('{"id":1,"result":{"userAgent":"test"}}\n');
		await initialized;
		await waitForWrite({ writes: fake.writes, count: 2 });
		expect(fake.writes[1]).toEqual({ method: "initialized" });

		const subscription = client.subscribe("thread-1");
		const iterator = subscription[Symbol.asyncIterator]();
		const notification = iterator.next();
		fake.stdout.write(
			`${JSON.stringify({
				method: "item/agentMessage/delta",
				params: {
					threadId: "thread-1",
					turnId: "turn-1",
					delta: "流",
				},
			})}\n`,
		);
		expect(await notification).toEqual({
			done: false,
			value: {
				method: "item/agentMessage/delta",
				params: {
					threadId: "thread-1",
					turnId: "turn-1",
					delta: "流",
				},
			},
		});

		subscription.close();
		expect(await iterator.next()).toEqual({
			done: true,
			value: undefined,
		});
	});

	test("rejects RPC errors and closes pending work when the process exits", async () => {
		const fake = appServerProcess();
		const client = new CodexAppServerRpcClient(fake.process);
		const rejectedRequest = client.request({
			method: "thread/start",
			params: {},
		});

		await waitForWrite({ writes: fake.writes, count: 1 });
		fake.stdout.write(
			'{"id":1,"error":{"code":-32603,"message":"上游拒绝"}}\n',
		);
		expect(rejectedRequest).rejects.toThrow("上游拒绝");

		const subscription = client.subscribe("thread-2");
		const notification = subscription[Symbol.asyncIterator]().next();
		const pendingRequest = client.request({
			method: "turn/start",
			params: {},
		});
		await waitForWrite({ writes: fake.writes, count: 2 });
		fake.stderr.write("Codex 连接中断");
		fake.process.emit("close", 7);

		expect(pendingRequest).rejects.toThrow("Codex 连接中断");
		expect(notification).rejects.toThrow("Codex 连接中断");
		expect(client.isOpen).toBe(false);
		expect(
			client.request({ method: "thread/start", params: {} }),
		).rejects.toThrow("Codex app-server 未连接");
	});

	test("answers OpenCut MCP approval elicitations without blocking the turn", async () => {
		const fake = appServerProcess();
		const client = new CodexAppServerRpcClient(fake.process);
		const subscription = client.subscribe("thread-1");
		const approvalEvent = subscription[Symbol.asyncIterator]().next();

		fake.stdout.write(
			`${JSON.stringify({
				id: "elicitation-1",
				method: "mcpServer/elicitation/request",
				params: {
					threadId: "thread-1",
					turnId: "turn-1",
					serverName: "opencut",
					mode: "openai/form",
					message: "Allow OpenCut to edit the project?",
					requestedSchema: {},
					_meta: {
						codex_approval_kind: "mcp_tool_call",
						persist: ["session"],
					},
				},
			})}\n`,
		);

		await waitForWrite({ writes: fake.writes, count: 1 });
		expect(fake.writes[0]).toEqual({
			id: "elicitation-1",
			result: {
				action: "accept",
				content: null,
				_meta: { persist: "session" },
			},
		});
		expect(await approvalEvent).toMatchObject({
			done: false,
			value: {
				id: "elicitation-1",
				method: "mcpServer/elicitation/request",
				params: {
					threadId: "thread-1",
					turnId: "turn-1",
					serverName: "opencut",
				},
			},
		});
		subscription.close();
	});

	test("declines non-approval MCP elicitations instead of hanging", async () => {
		const fake = appServerProcess();
		new CodexAppServerRpcClient(fake.process);

		fake.stdout.write(
			`${JSON.stringify({
				id: 17,
				method: "mcpServer/elicitation/request",
				params: {
					threadId: "thread-1",
					turnId: "turn-1",
					serverName: "another-server",
					mode: "form",
					message: "Enter a secret",
					requestedSchema: { type: "object" },
					_meta: null,
				},
			})}\n`,
		);

		await waitForWrite({ writes: fake.writes, count: 1 });
		expect(fake.writes[0]).toEqual({
			id: 17,
			result: {
				action: "decline",
				content: null,
				_meta: null,
			},
		});
	});
});

describe("Codex desktop refresh", () => {
	test("forces the open desktop task route to reload before reopening it", () => {
		expect(
			codexDesktopRefreshUrls("019fb29a-6b2a-7661-b946-1cf7d2158711"),
		).toEqual([
			"codex://threads/new",
			"codex://threads/019fb29a-6b2a-7661-b946-1cf7d2158711",
		]);
	});
});

describe("Codex direct Smart Edit streaming chat", () => {
	test("starts Codex app-server so agent message deltas are available", () => {
		const args = buildCodexAppServerArgs({ runtime });

		expect(args.slice(0, 2)).toEqual(["app-server", "--stdio"]);
		expect(args).toContain('approval_policy="never"');
		expect(args).toContain('sandbox_mode="read-only"');
		expect(args).toContain('mcp_servers.opencut.command="bun"');
		expect(args).toContain(
			'mcp_servers.opencut.args=["/workspace/opencut-classic/apps/mcp/src/server.mjs"]',
		);
		expect(args).toContain("mcp_servers.localcut.enabled=false");
		expect(args).toContain("mcp_servers.node_repl.enabled=false");
		expect(args).toContain("mcp_servers.computer-use.enabled=false");
		expect(args).toContain("mcp_servers.opencut.enabled=true");
		expect(args).not.toContain("mcp_servers.opencut.enabled=false");
		expect(args).not.toContain("mcp_servers={}");
		expect(args).not.toContain("exec");
		expect(args).not.toContain("--json");
	});

	test("offers focused, verification, and full App tool profiles without ever enabling LocalCut", () => {
		const verificationArgs = buildCodexAppServerArgs({
			runtime,
			toolProfile: "verify",
		});
		const fullArgs = buildCodexAppServerArgs({
			runtime,
			toolProfile: "full",
		});

		expect(verificationArgs).toContain("mcp_servers.localcut.enabled=false");
		expect(verificationArgs).toContain("mcp_servers.chanjing.enabled=false");
		expect(verificationArgs).not.toContain(
			"mcp_servers.node_repl.enabled=false",
		);
		expect(verificationArgs).not.toContain(
			"mcp_servers.computer-use.enabled=false",
		);
		expect(verificationArgs).not.toContain(
			"mcp_servers.openaiDeveloperDocs.enabled=false",
		);
		expect(fullArgs).toContain("mcp_servers.localcut.enabled=false");
		expect(fullArgs).not.toContain("mcp_servers.chanjing.enabled=false");
		expect(fullArgs).not.toContain("mcp_servers.node_repl.enabled=false");
	});

	test("prompts Codex to execute or plan through OpenCut with native verification semantics", () => {
		const prompt = buildCodexPrompt({
			projectId: "project-1",
			message: "统一字幕样式",
			context: "opencut://project/project-1/scene/main/track/text",
			projectSnapshot: '{"projectId":"project-1","revision":7}',
			verificationMode: "full",
		});

		expect(prompt).toContain("project-1");
		expect(prompt).toContain("统一字幕样式");
		expect(prompt).toContain(
			"opencut://project/project-1/scene/main/track/text",
		);
		expect(prompt).toContain("直接执行");
		expect(prompt).toContain("系统会在本轮完成后自动核对工程 revision");
		expect(prompt).toContain("当前回合可能收到用户追加指令");
		expect(prompt).toContain("使用 read_project 和 edit_project");
		expect(prompt).toContain("inspect_timeline_range");
		expect(prompt).toContain("inspect_media_scenes");
		expect(prompt).toContain("save_media_analysis");
		expect(prompt).toContain(
			"不要调用 status、get_context、open_editor、reveal_context",
		);
		expect(prompt).toContain(
			"不要读取、调用或套用 LocalCut、localcut-native-video",
		);
		expect(prompt).toContain("OpenCut MCP 已由系统验证就绪");
		expect(prompt).toContain("当前工程摘要已由系统预读");
		expect(prompt).toContain('{"projectId":"project-1","revision":7}');
		expect(prompt).toContain("不要声称没有 OpenCut 工具");
		expect(prompt).toContain("不要自行连接或启动 MCP");
		expect(prompt).not.toContain("优先使用 get_context");
		expect(prompt).not.toContain("至少需要两个字幕素材");
		expect(
			buildCodexPrompt({
				projectId: "project-1",
				message: "先给方案",
				context: "",
				projectSnapshot: "{}",
				mode: "plan",
			}),
		).toContain("不要调用 edit_project 修改工程");
	});

	test("discovers the native model, effort, collaboration mode, and skill catalog", async () => {
		const calls: Array<{ method: string; params: unknown }> = [];
		const connection: CodexAppServerConnection = {
			request: async ({ method, params }) => {
				calls.push({ method, params });
				if (method === "model/list") {
					return {
						data: [
							{
								id: "gpt-5.6-sol",
								model: "gpt-5.6-sol",
								displayName: "GPT-5.6-Sol",
								defaultReasoningEffort: "low",
								supportedReasoningEfforts: [
									{ reasoningEffort: "low", description: "Fast" },
									{ reasoningEffort: "xhigh", description: "Deep" },
								],
								inputModalities: ["text", "image"],
								isDefault: true,
							},
						],
						nextCursor: null,
					};
				}
				if (method === "collaborationMode/list") {
					return {
						data: [
							{
								name: "Plan",
								mode: "plan",
								model: null,
								reasoning_effort: "medium",
							},
							{
								name: "Default",
								mode: "default",
								model: null,
								reasoning_effort: null,
							},
						],
					};
				}
				if (method === "skills/list") {
					return {
						data: [
							{
								cwd: runtime.repoRoot,
								skills: [
									{
										name: "openai-docs",
										description: "Read official OpenAI docs",
										enabled: true,
									},
								],
								errors: [],
							},
						],
					};
				}
				throw new Error(`unexpected method ${method}`);
			},
			subscribe: () => subscriptionOf({ notifications: [] }),
		};
		const service = createCodexChatService({
			runtime,
			connect: async () => connection,
		});

		const capabilities = await service.capabilities({ toolProfile: "edit" });

		expect(calls.map((call) => call.method)).toEqual([
			"model/list",
			"collaborationMode/list",
			"skills/list",
		]);
		expect(capabilities.models[0]).toMatchObject({
			id: "gpt-5.6-sol",
			label: "GPT-5.6-Sol",
			efforts: ["low", "xhigh"],
			inputModalities: ["text", "image"],
			isDefault: true,
		});
		expect(capabilities.modes).toEqual([
			{ id: "plan", label: "Plan", defaultEffort: "medium" },
			{ id: "default", label: "Default", defaultEffort: null },
		]);
		expect(capabilities.skills).toEqual([
			{
				name: "openai-docs",
				description: "Read official OpenAI docs",
				enabled: true,
			},
		]);
		expect(capabilities.toolProfiles.map((profile) => profile.id)).toEqual([
			"edit",
			"verify",
			"full",
		]);
	});

	test("sends native multimodal range frames and App model settings into the turn", async () => {
		const calls: Array<{ method: string; params: unknown }> = [];
		const connection: CodexAppServerConnection = {
			request: async ({ method, params }) => {
				calls.push({ method, params });
				if (method === "thread/start") {
					return { thread: { id: "thread-vision" } };
				}
				if (method === "thread/name/set") return {};
				if (method === "mcpServerStatus/list") {
					return readyOpenCutStatus();
				}
				if (method === "mcpServer/tool/call") {
					if (!isRecord(params)) throw new Error("invalid MCP request");
					if (params.tool === "read_project") return projectSummary();
					if (params.tool === "inspect_timeline_range") {
						return {
							content: [
								{ type: "text", text: '{"samples":[1,2,3]}' },
								{
									type: "image",
									data: "aW1hZ2U=",
									mimeType: "image/jpeg",
								},
							],
							isError: false,
						};
					}
				}
				if (method === "turn/start") {
					return { turn: { id: "turn-vision" } };
				}
				throw new Error(`unexpected method ${method}`);
			},
			subscribe: () =>
				subscriptionOf({
					notifications: [
						{
							method: "turn/completed",
							params: {
								threadId: "thread-vision",
								turn: {
									id: "turn-vision",
									status: "completed",
									error: null,
									items: [
										{
											type: "agentMessage",
											id: "message-vision",
											text: "已识别选区",
										},
									],
								},
							},
						},
					],
				}),
		};
		const service = createCodexChatService({
			runtime,
			connect: async () => connection,
		});
		const context = [
			"<opencut-agent-context-json>",
			JSON.stringify({
				schemaVersion: "opencut.agent-context.v1",
				project: { id: "project-1", sceneId: "main" },
				references: [
					{
						kind: "range",
						projectId: "project-1",
						sceneId: "main",
						startSeconds: 1,
						endSeconds: 3,
					},
				],
				timelineElements: [],
				media: [],
			}),
			"</opencut-agent-context-json>",
		].join("\n");

		for await (const _event of service.stream({
			input: {
				projectId: "project-1",
				message: "看画面后重新剪辑",
				context,
				model: "gpt-5.6-sol",
				effort: "xhigh",
				mode: "default",
				toolProfile: "verify",
				visualMode: "auto",
			},
		})) {
			// consume the native stream
		}

		const inspection = calls.find(
			(call) =>
				call.method === "mcpServer/tool/call" &&
				isRecord(call.params) &&
				call.params.tool === "inspect_timeline_range",
		);
		expect(inspection?.params).toMatchObject({
			server: "opencut",
			tool: "inspect_timeline_range",
			arguments: {
				projectId: "project-1",
				sceneId: "main",
				startSeconds: 1,
				endSeconds: 3,
			},
		});
		const turnStart = calls.find((call) => call.method === "turn/start");
		expect(turnStart?.params).toMatchObject({
			threadId: "thread-vision",
			model: "gpt-5.6-sol",
			effort: "xhigh",
			collaborationMode: {
				mode: "default",
				settings: {
					model: "gpt-5.6-sol",
					reasoning_effort: "xhigh",
					developer_instructions: null,
				},
			},
		});
		const turnInput =
			isRecord(turnStart?.params) && Array.isArray(turnStart.params.input)
				? turnStart.params.input
				: [];
		expect(turnInput).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "image",
					url: "data:image/jpeg;base64,aW1hZ2U=",
				}),
			]),
		);
	});

	test("steers, interrupts, and compacts native App turns", async () => {
		const calls: Array<{ method: string; params: unknown }> = [];
		const connection: CodexAppServerConnection = {
			request: async ({ method, params }) => {
				calls.push({ method, params });
				if (method === "turn/steer") return { turnId: "turn-1" };
				return {};
			},
			subscribe: () => subscriptionOf({ notifications: [] }),
		};
		const service = createCodexChatService({
			runtime,
			connect: async () => connection,
		});

		await service.steer({
			sessionId: "thread-1",
			turnId: "turn-1",
			message: "把开头再缩短半秒",
			toolProfile: "verify",
		});
		await service.interrupt({
			sessionId: "thread-1",
			turnId: "turn-1",
			toolProfile: "verify",
		});
		await service.compact({
			sessionId: "thread-1",
			toolProfile: "verify",
		});

		expect(calls).toEqual([
			{
				method: "turn/steer",
				params: {
					threadId: "thread-1",
					expectedTurnId: "turn-1",
					input: [{ type: "text", text: "把开头再缩短半秒" }],
				},
			},
			{
				method: "turn/interrupt",
				params: { threadId: "thread-1", turnId: "turn-1" },
			},
			{
				method: "thread/compact/start",
				params: { threadId: "thread-1" },
			},
		]);
	});

	test("reads the authoritative App thread as clean browser conversation messages", async () => {
		const calls: Array<{ method: string; params: unknown }> = [];
		const connection: CodexAppServerConnection = {
			request: async ({ method, params }) => {
				calls.push({ method, params });
				if (method !== "thread/read") {
					throw new Error(`unexpected method ${method}`);
				}
				return {
					thread: {
						id: "thread-shared",
						name: "收紧开场",
						createdAt: 100,
						updatedAt: 120,
						turns: [
							{
								id: "turn-browser",
								status: "completed",
								startedAt: 101,
								completedAt: 110,
								items: [
									{
										id: "user-native",
										clientId: "user-browser",
										type: "userMessage",
										content: [{ type: "text", text: "收紧开场" }],
									},
									{
										id: "assistant-native",
										type: "agentMessage",
										phase: "final_answer",
										text: "已把开场缩短一秒。",
									},
								],
							},
							{
								id: "turn-app",
								status: "completed",
								startedAt: 111,
								completedAt: 120,
								items: [
									{
										id: "user-app",
										clientId: null,
										type: "userMessage",
										content: [
											{
												type: "text",
												text: [
													"<codex_delegation>",
													"<source_thread_id>thread-source</source_thread_id>",
													"<input>再快一点</input>",
													"</codex_delegation>",
												].join("\n"),
											},
										],
									},
									{
										id: "assistant-app",
										type: "agentMessage",
										phase: "final_answer",
										text: "已继续压缩停顿。",
									},
								],
							},
						],
					},
				};
			},
			subscribe: () => subscriptionOf({ notifications: [] }),
		};
		const service = createCodexChatService({
			runtime,
			connect: async () => connection,
		});

		const history = await service.readThread({
			sessionId: "thread-shared",
		});

		expect(calls).toEqual([
			{
				method: "thread/read",
				params: { threadId: "thread-shared", includeTurns: true },
			},
		]);
		expect(history).toEqual({
			sessionId: "thread-shared",
			title: "收紧开场",
			createdAt: 100_000,
			updatedAt: 120_000,
			messages: [
				{
					id: "user-browser",
					role: "user",
					content: "收紧开场",
					turnId: "turn-browser",
					createdAt: 101_000,
					updatedAt: 110_000,
				},
				{
					id: "assistant-native",
					role: "assistant",
					content: "已把开场缩短一秒。",
					turnId: "turn-browser",
					streaming: false,
					createdAt: 101_001,
					updatedAt: 110_001,
				},
				{
					id: "user-app",
					role: "user",
					content: "再快一点",
					turnId: "turn-app",
					createdAt: 111_000,
					updatedAt: 120_000,
				},
				{
					id: "assistant-app",
					role: "assistant",
					content: "已继续压缩停顿。",
					turnId: "turn-app",
					streaming: false,
					createdAt: 111_001,
					updatedAt: 120_001,
				},
			],
		});
	});

	test("forks a legacy hidden thread into a user-visible App task", async () => {
		const calls: Array<{ method: string; params: unknown }> = [];
		const connection: CodexAppServerConnection = {
			request: async ({ method, params }) => {
				calls.push({ method, params });
				if (method === "thread/resume") {
					return {
						thread: {
							id: "thread-hidden",
							threadSource: null,
							turns: [],
						},
					};
				}
				if (method === "thread/fork") {
					return {
						thread: {
							id: "thread-visible",
							threadSource: "user",
							turns: [],
						},
					};
				}
				if (method === "thread/name/set") return {};
				if (method === "mcpServerStatus/list") return readyOpenCutStatus();
				if (method === "mcpServer/tool/call") return projectSummary();
				if (method === "turn/start") return { turn: { id: "turn-visible" } };
				throw new Error(`unexpected method ${method}`);
			},
			subscribe: (threadId) => {
				expect(threadId).toBe("thread-visible");
				return subscriptionOf({
					notifications: [
						{
							method: "turn/completed",
							params: {
								threadId,
								turn: {
									id: "turn-visible",
									status: "completed",
									error: null,
									items: [
										{
											type: "agentMessage",
											id: "assistant-visible",
											text: "已继续编辑",
										},
									],
								},
							},
						},
					],
				});
			},
		};
		const service = createCodexChatService({
			runtime,
			connect: async () => connection,
		});

		const events = [];
		for await (const event of service.stream({
			input: {
				projectId: "project-1",
				conversationId: "conversation-1",
				sessionId: "thread-hidden",
				message: "继续调整",
				context: "",
			},
		})) {
			events.push(event);
		}

		expect(events[0]).toEqual({
			type: "session",
			sessionId: "thread-visible",
		});
		expect(calls[1]).toMatchObject({
			method: "thread/fork",
			params: {
				threadId: "thread-hidden",
				threadSource: "user",
				cwd: runtime.repoRoot,
				runtimeWorkspaceRoots: [runtime.repoRoot, runtime.projectFilesDir],
			},
		});
		expect(calls[4]).toEqual({
			method: "thread/name/set",
			params: {
				threadId: "thread-visible",
				name: "地坛 × Reed",
			},
		});
	});

	test("streams each Codex token delta before the authoritative completed message", async () => {
		const calls: Array<{ method: string; params: unknown }> = [];
		let closed = false;
		const connection: CodexAppServerConnection = {
			request: async ({ method, params }) => {
				calls.push({ method, params });
				if (method === "thread/start") {
					return { thread: { id: "thread-project-1" } };
				}
				if (method === "thread/name/set") return {};
				if (method === "mcpServerStatus/list") {
					return readyOpenCutStatus();
				}
				if (method === "mcpServer/tool/call") {
					return projectSummary();
				}
				if (method === "turn/start") {
					return { turn: { id: "turn-1" } };
				}
				throw new Error(`unexpected method ${method}`);
			},
			subscribe: (threadId) => {
				expect(threadId).toBe("thread-project-1");
				return subscriptionOf({
					notifications: [
						{
							method: "item/agentMessage/delta",
							params: {
								threadId,
								turnId: "turn-1",
								itemId: "message-1",
								delta: "已",
							},
						},
						{
							method: "item/agentMessage/delta",
							params: {
								threadId,
								turnId: "turn-1",
								itemId: "message-1",
								delta: "完成",
							},
						},
						{
							method: "turn/completed",
							params: {
								threadId,
								turn: {
									id: "turn-1",
									status: "completed",
									error: null,
									items: [
										{
											type: "agentMessage",
											id: "message-1",
											text: "已完成",
										},
									],
								},
							},
						},
					],
					onClose: () => {
						closed = true;
					},
				});
			},
		};
		const service = createCodexChatService({
			runtime,
			connect: async () => connection,
		});

		const events = [];
		for await (const event of service.stream({
			input: {
				projectId: "project-1",
				message: "统一字幕样式",
				context: "引用 A",
			},
		})) {
			events.push(event);
		}

		expect(events).toEqual([
			{ type: "session", sessionId: "thread-project-1" },
			{
				type: "protocol",
				id: "thread:thread-project-1",
				method: "thread/start",
				threadId: "thread-project-1",
				status: "completed",
				title: "Codex 会话已连接",
			},
			{
				type: "protocol",
				id: "mcp:thread-project-1:opencut",
				method: "mcpServerStatus/list",
				threadId: "thread-project-1",
				itemType: "mcpToolCall",
				status: "completed",
				title: "OpenCut MCP 已就绪",
				detail: "read_project · edit_project · inspect_timeline_range",
			},
			{
				type: "protocol",
				id: "context:thread-project-1:project-1",
				method: "mcpServer/tool/call",
				threadId: "thread-project-1",
				itemType: "mcpToolCall",
				status: "completed",
				title: "当前工程上下文已载入",
				detail: "project-1 · revision 7",
			},
			{
				type: "turn",
				sessionId: "thread-project-1",
				turnId: "turn-1",
			},
			{
				type: "protocol",
				id: "turn:turn-1",
				method: "turn/start",
				threadId: "thread-project-1",
				turnId: "turn-1",
				status: "started",
				title: "开始处理",
			},
			{ type: "delta", delta: "已" },
			{ type: "delta", delta: "完成" },
			{
				type: "protocol",
				id: "turn:turn-1",
				method: "turn/completed",
				threadId: "thread-project-1",
				turnId: "turn-1",
				status: "completed",
				title: "处理完成",
			},
			{
				type: "done",
				sessionId: "thread-project-1",
				message: "已完成",
			},
		]);
		expect(calls.map((call) => call.method)).toEqual([
			"thread/start",
			"mcpServerStatus/list",
			"mcpServer/tool/call",
			"thread/name/set",
			"turn/start",
		]);
		expect(calls[0]?.params).toMatchObject({
			threadSource: "user",
			serviceName: "opencut_smart_edit",
		});
		expect(JSON.stringify(calls[0]?.params)).toContain("project-1");
		expect(calls[1]).toEqual({
			method: "mcpServerStatus/list",
			params: {
				threadId: "thread-project-1",
				detail: "toolsAndAuthOnly",
				limit: 100,
			},
		});
		expect(calls[2]).toEqual({
			method: "mcpServer/tool/call",
			params: {
				threadId: "thread-project-1",
				server: "opencut",
				tool: "read_project",
				arguments: { projectId: "project-1", detail: "summary" },
			},
		});
		expect(calls[3]).toEqual({
			method: "thread/name/set",
			params: {
				threadId: "thread-project-1",
				name: "地坛 × Reed",
			},
		});
		expect(calls[4]?.params).toMatchObject({
			input: [{ type: "text", text: "统一字幕样式" }],
			additionalContext: {
				"opencut.smart_edit": {
					kind: "application",
				},
			},
		});
		expect(JSON.stringify(calls[4]?.params)).toContain("引用 A");
		expect(JSON.stringify(calls[4]?.params)).toContain('\\"revision\\":7');
		expect(closed).toBe(true);
	});

	test("uses the configured App workspace cwd while keeping OpenCut roots available", async () => {
		const calls: Array<{ method: string; params: unknown }> = [];
		const groupedRuntime = {
			...runtime,
			appWorkspaceRoot: "/workspace",
		} as CodexRuntimeConfig & { appWorkspaceRoot: string };
		const connection: CodexAppServerConnection = {
			request: async ({ method, params }) => {
				calls.push({ method, params });
				if (method === "thread/start") {
					return { thread: { id: "thread-grouped" } };
				}
				if (method === "thread/name/set") return {};
				if (method === "mcpServerStatus/list") return readyOpenCutStatus();
				if (method === "mcpServer/tool/call") return projectSummary();
				if (method === "turn/start") return { turn: { id: "turn-grouped" } };
				throw new Error(`unexpected method ${method}`);
			},
			subscribe: (threadId) =>
				subscriptionOf({
					notifications: [
						{
							method: "turn/completed",
							params: {
								threadId,
								turn: {
									id: "turn-grouped",
									status: "completed",
									error: null,
									items: [
										{
											type: "agentMessage",
											id: "assistant-grouped",
											text: "已归入工作区",
										},
									],
								},
							},
						},
					],
				}),
		};
		const service = createCodexChatService({
			runtime: groupedRuntime,
			connect: async () => connection,
		});

		for await (const _event of service.stream({
			input: {
				projectId: "project-1",
				message: "检查工作区归类",
				context: "",
			},
		})) {
			// Consume the completed turn.
		}

		expect(calls[0]).toMatchObject({
			method: "thread/start",
			params: {
				cwd: "/workspace",
				runtimeWorkspaceRoots: [
					"/workspace",
					runtime.repoRoot,
					runtime.projectFilesDir,
				],
			},
		});
	});

	test("fails before starting a turn when the current session has no OpenCut MCP", async () => {
		const calls: Array<{ method: string; params: unknown }> = [];
		const connection: CodexAppServerConnection = {
			request: async ({ method, params }) => {
				calls.push({ method, params });
				if (method === "thread/start") {
					return { thread: { id: "thread-1" } };
				}
				if (method === "thread/name/set") return {};
				if (method === "mcpServerStatus/list") {
					return { data: [], nextCursor: null };
				}
				throw new Error(`unexpected method ${method}`);
			},
			subscribe: () => subscriptionOf({ notifications: [] }),
		};
		const service = createCodexChatService({
			runtime,
			connect: async () => connection,
		});

		const consume = async () => {
			for await (const _event of service.stream({
				input: {
					projectId: "project-1",
					message: "重排当前选区",
					context: "21.3-29.0s",
				},
			})) {
				// Consume until the preflight fails.
			}
		};

		expect(consume()).rejects.toThrow("OpenCut MCP 未就绪");
		expect(calls.map((call) => call.method)).toEqual([
			"thread/start",
			"mcpServerStatus/list",
		]);
	});

	test("forwards native Codex reasoning, plan, MCP and command lifecycle frames", async () => {
		const connection: CodexAppServerConnection = {
			request: async ({ method }) => {
				if (method === "thread/start") {
					return { thread: { id: "thread-1" } };
				}
				if (method === "mcpServerStatus/list") {
					return readyOpenCutStatus();
				}
				if (method === "mcpServer/tool/call") {
					return projectSummary();
				}
				return { turn: { id: "turn-1" } };
			},
			subscribe: (threadId) =>
				subscriptionOf({
					notifications: [
						{
							method: "item/reasoning/summaryTextDelta",
							params: {
								threadId,
								turnId: "turn-1",
								itemId: "reasoning-1",
								summaryIndex: 0,
								delta: "先读取工程结构。",
							},
						},
						{
							method: "turn/plan/updated",
							params: {
								threadId,
								turnId: "turn-1",
								explanation: "执行剪辑",
								plan: [
									{ step: "读取工程", status: "completed" },
									{ step: "修改时间线", status: "inProgress" },
								],
							},
						},
						{
							id: "elicitation-1",
							method: "mcpServer/elicitation/request",
							params: {
								threadId,
								turnId: "turn-1",
								serverName: "opencut",
								message: "允许 OpenCut 读取工程？",
								_meta: {
									codex_approval_kind: "mcp_tool_call",
								},
							},
						},
						{
							method: "item/started",
							params: {
								threadId,
								turnId: "turn-1",
								item: {
									type: "mcpToolCall",
									id: "tool-1",
									server: "opencut",
									tool: "read_project",
									status: "inProgress",
									arguments: { projectId: "project-1" },
								},
							},
						},
						{
							method: "item/mcpToolCall/progress",
							params: {
								threadId,
								turnId: "turn-1",
								itemId: "tool-1",
								message: "正在读取工程",
							},
						},
						{
							method: "item/completed",
							params: {
								threadId,
								turnId: "turn-1",
								item: {
									type: "mcpToolCall",
									id: "tool-1",
									server: "opencut",
									tool: "read_project",
									status: "completed",
									arguments: { projectId: "project-1" },
									result: {
										content: [{ type: "text", text: "读取完成" }],
									},
									error: null,
								},
							},
						},
						{
							method: "item/started",
							params: {
								threadId,
								turnId: "turn-1",
								item: {
									type: "commandExecution",
									id: "command-1",
									command: "git status --short",
									cwd: "/workspace/opencut-classic",
									status: "inProgress",
								},
							},
						},
						{
							method: "item/commandExecution/outputDelta",
							params: {
								threadId,
								turnId: "turn-1",
								itemId: "command-1",
								delta: " M timeline.json\n",
							},
						},
						{
							method: "item/completed",
							params: {
								threadId,
								turnId: "turn-1",
								item: {
									type: "commandExecution",
									id: "command-1",
									command: "git status --short",
									cwd: "/workspace/opencut-classic",
									status: "completed",
									aggregatedOutput: " M timeline.json\n",
									exitCode: 0,
								},
							},
						},
						{
							method: "turn/completed",
							params: {
								threadId,
								turn: {
									id: "turn-1",
									status: "completed",
									error: null,
									durationMs: 820,
									items: [
										{
											type: "agentMessage",
											id: "message-1",
											text: "已完成",
										},
									],
								},
							},
						},
					],
				}),
		};
		const service = createCodexChatService({
			runtime,
			connect: async () => connection,
		});

		const events = [];
		for await (const event of service.stream({
			input: {
				projectId: "project-1",
				message: "读取并修改",
				context: "",
			},
		})) {
			events.push(event);
		}

		expect(events).toContainEqual({
			type: "protocol",
			id: "reasoning-1",
			method: "item/reasoning/summaryTextDelta",
			threadId: "thread-1",
			turnId: "turn-1",
			itemId: "reasoning-1",
			itemType: "reasoning",
			status: "streaming",
			title: "分析",
			detail: "先读取工程结构。",
			append: true,
		});
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "protocol",
				id: "turn-1:plan",
				method: "turn/plan/updated",
				itemType: "plan",
				title: "更新执行计划",
				detail: expect.stringContaining("修改时间线"),
			}),
		);
		expect(events).toContainEqual({
			type: "protocol",
			id: "request:elicitation-1",
			method: "mcpServer/elicitation/request",
			threadId: "thread-1",
			turnId: "turn-1",
			itemType: "approval",
			status: "completed",
			title: "OpenCut 调用已授权",
			detail: "允许 OpenCut 读取工程？",
		});
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "protocol",
				id: "tool-1",
				method: "item/started",
				itemType: "mcpToolCall",
				status: "started",
				title: "OpenCut · read_project",
				detail: expect.stringContaining('"projectId": "project-1"'),
			}),
		);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "protocol",
				id: "tool-1",
				method: "item/completed",
				status: "completed",
				title: "OpenCut · read_project",
				detail: expect.stringContaining("读取完成"),
			}),
		);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "protocol",
				id: "command-1",
				method: "item/commandExecution/outputDelta",
				itemType: "commandExecution",
				status: "streaming",
				title: "运行命令",
				detail: " M timeline.json\n",
				append: true,
			}),
		);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "protocol",
				id: "turn:turn-1",
				method: "turn/completed",
				status: "completed",
				title: "处理完成",
				detail: "耗时 820ms",
			}),
		);
	});

	test("resumes the exact browser-held Codex session instead of relying on server memory", async () => {
		const calls: Array<{ method: string; params: unknown }> = [];
		const connection: CodexAppServerConnection = {
			request: async ({ method, params }) => {
				calls.push({ method, params });
				if (method === "thread/resume") {
					return { thread: { id: "thread-existing" } };
				}
				if (method === "mcpServerStatus/list") {
					return readyOpenCutStatus();
				}
				if (method === "mcpServer/tool/call") {
					return projectSummary();
				}
				return { turn: { id: "turn-2" } };
			},
			subscribe: (threadId) =>
				subscriptionOf({
					notifications: [
						{
							method: "turn/completed",
							params: {
								threadId,
								turn: {
									id: "turn-2",
									status: "completed",
									error: null,
									items: [
										{
											type: "agentMessage",
											id: "message-2",
											text: "继续完成",
										},
									],
								},
							},
						},
					],
				}),
		};
		const service = createCodexChatService({
			runtime,
			connect: async () => connection,
		});

		const events = [];
		for await (const event of service.stream({
			input: {
				projectId: "project-1",
				message: "继续",
				context: "",
				sessionId: "thread-existing",
			},
		})) {
			events.push(event);
		}

		expect(calls[0]).toEqual({
			method: "thread/resume",
			params: expect.objectContaining({ threadId: "thread-existing" }),
		});
		expect(events.at(-1)).toEqual({
			type: "done",
			sessionId: "thread-existing",
			message: "继续完成",
		});
	});

	test("isolates cached native sessions for different conversations in the same project", async () => {
		const calls: Array<{ method: string; params: unknown }> = [];
		let nextThread = 0;
		let nextTurn = 0;
		const turnByThread = new Map<string, string>();
		const connection: CodexAppServerConnection = {
			request: async ({ method, params }) => {
				calls.push({ method, params });
				if (method === "thread/start") {
					nextThread += 1;
					return { thread: { id: `thread-${nextThread}` } };
				}
				if (method === "thread/resume") {
					if (!isRecord(params) || typeof params.threadId !== "string") {
						throw new Error("invalid thread/resume request");
					}
					return { thread: { id: params.threadId, threadSource: "user" } };
				}
				if (method === "thread/name/set") return {};
				if (method === "mcpServerStatus/list") return readyOpenCutStatus();
				if (method === "mcpServer/tool/call") return projectSummary();
				if (method === "turn/start") {
					if (!isRecord(params) || typeof params.threadId !== "string") {
						throw new Error("invalid turn/start request");
					}
					nextTurn += 1;
					const turnId = `turn-${nextTurn}`;
					turnByThread.set(params.threadId, turnId);
					return { turn: { id: turnId } };
				}
				throw new Error(`unexpected method ${method}`);
			},
			subscribe: (threadId) => ({
				async *[Symbol.asyncIterator]() {
					await Promise.resolve();
					const turnId = turnByThread.get(threadId);
					if (!turnId) throw new Error(`missing turn for ${threadId}`);
					yield {
						method: "turn/completed",
						params: {
							threadId,
							turn: {
								id: turnId,
								status: "completed",
								error: null,
								items: [
									{
										type: "agentMessage",
										id: `message-${turnId}`,
										text: `完成 ${threadId}`,
									},
								],
							},
						},
					};
				},
				close() {},
			}),
		};
		const service = createCodexChatService({
			runtime,
			connect: async () => connection,
		});

		for (const conversationId of ["conversation-a", "conversation-b"]) {
			for await (const _event of service.stream({
				input: {
					projectId: "project-1",
					conversationId,
					message: `处理 ${conversationId}`,
					context: "",
				},
			})) {
				// Consume the complete native turn.
			}
		}

		expect(
			calls
				.filter((call) => call.method.startsWith("thread/"))
				.map((call) => call.method),
		).toEqual([
			"thread/start",
			"thread/name/set",
			"thread/start",
			"thread/name/set",
		]);
	});

	test("resumes the cached native session only for the same conversation", async () => {
		const calls: Array<{ method: string; params: unknown }> = [];
		let nextTurn = 0;
		const turnByThread = new Map<string, string>();
		const connection: CodexAppServerConnection = {
			request: async ({ method, params }) => {
				calls.push({ method, params });
				if (method === "thread/start") {
					return { thread: { id: "thread-conversation-a" } };
				}
				if (method === "thread/resume") {
					return {
						thread: {
							id: "thread-conversation-a",
							threadSource: "user",
						},
					};
				}
				if (method === "thread/name/set") return {};
				if (method === "mcpServerStatus/list") return readyOpenCutStatus();
				if (method === "mcpServer/tool/call") return projectSummary();
				if (method === "turn/start") {
					if (!isRecord(params) || typeof params.threadId !== "string") {
						throw new Error("invalid turn/start request");
					}
					nextTurn += 1;
					const turnId = `turn-${nextTurn}`;
					turnByThread.set(params.threadId, turnId);
					return { turn: { id: turnId } };
				}
				throw new Error(`unexpected method ${method}`);
			},
			subscribe: (threadId) => ({
				async *[Symbol.asyncIterator]() {
					await Promise.resolve();
					const turnId = turnByThread.get(threadId);
					if (!turnId) throw new Error(`missing turn for ${threadId}`);
					yield {
						method: "turn/completed",
						params: {
							threadId,
							turn: {
								id: turnId,
								status: "completed",
								error: null,
								items: [
									{
										type: "agentMessage",
										id: `message-${turnId}`,
										text: "已继续同一会话",
									},
								],
							},
						},
					};
				},
				close() {},
			}),
		};
		const service = createCodexChatService({
			runtime,
			connect: async () => connection,
		});

		for (let attempt = 0; attempt < 2; attempt += 1) {
			for await (const _event of service.stream({
				input: {
					projectId: "project-1",
					conversationId: "conversation-a",
					message: "继续同一会话",
					context: "",
				},
			})) {
				// Consume the complete native turn.
			}
		}

		expect(
			calls
				.filter((call) =>
					["thread/start", "thread/resume"].includes(call.method),
				)
				.map((call) => call.method),
		).toEqual(["thread/start", "thread/resume"]);
		expect(calls.find((call) => call.method === "thread/resume")).toEqual({
			method: "thread/resume",
			params: expect.objectContaining({ threadId: "thread-conversation-a" }),
		});
	});

	test("refreshes the desktop project when each browser turn starts and completes without blocking chat", async () => {
		const syncCalls: string[] = [];
		const syncObservedCompletedTurn: boolean[] = [];
		const syncObservedPersistedTurn: boolean[] = [];
		let nativeTurnCompleted = false;
		let nextTurn = 0;
		const turnByThread = new Map<string, string>();
		const persistedTurns = new Set<string>();
		const connection: CodexAppServerConnection = {
			request: async ({ method, params }) => {
				if (method === "thread/start" || method === "thread/resume") {
					return {
						thread: {
							id: "thread-desktop-project",
							threadSource: "user",
						},
					};
				}
				if (method === "thread/name/set") return {};
				if (method === "mcpServerStatus/list") return readyOpenCutStatus();
				if (method === "mcpServer/tool/call") return projectSummary();
				if (method === "turn/start") {
					if (!isRecord(params) || typeof params.threadId !== "string") {
						throw new Error("invalid turn/start request");
					}
					nextTurn += 1;
					const turnId = `turn-desktop-${nextTurn}`;
					turnByThread.set(params.threadId, turnId);
					return { turn: { id: turnId } };
				}
				if (method === "thread/read") {
					if (!isRecord(params) || typeof params.threadId !== "string") {
						throw new Error("invalid thread/read request");
					}
					const persistedTurnId = turnByThread.get(params.threadId);
					if (!persistedTurnId) {
						throw new Error(`missing turn for ${params.threadId}`);
					}
					persistedTurns.add(persistedTurnId);
					return {
						thread: {
							id: params.threadId,
							turns: [{ id: persistedTurnId, status: "completed", items: [] }],
						},
					};
				}
				throw new Error(`unexpected method ${method}`);
			},
			subscribe: (threadId) => ({
				async *[Symbol.asyncIterator]() {
					await Promise.resolve();
					const turnId = turnByThread.get(threadId);
					if (!turnId) throw new Error(`missing turn for ${threadId}`);
					nativeTurnCompleted = true;
					yield {
						method: "turn/completed",
						params: {
							threadId,
							turn: {
								id: turnId,
								status: "completed",
								error: null,
								items: [
									{
										type: "agentMessage",
										id: `message-${turnId}`,
										text: "桌面归组不影响回复",
									},
								],
							},
						},
					};
				},
				close() {},
			}),
		};
		const service = createCodexChatService({
			runtime,
			connect: async () => connection,
			syncThreadToDesktop: async (threadId) => {
				syncCalls.push(threadId);
				syncObservedCompletedTurn.push(nativeTurnCompleted);
				const turnId = turnByThread.get(threadId);
				syncObservedPersistedTurn.push(
					typeof turnId === "string" && persistedTurns.has(turnId),
				);
				throw new Error("desktop app is unavailable");
			},
		});

		for (let attempt = 0; attempt < 2; attempt += 1) {
			nativeTurnCompleted = false;
			const events = [];
			for await (const event of service.stream({
				input: {
					projectId: "project-1",
					conversationId: "conversation-desktop-project",
					message: "验证桌面工程归组",
					context: "",
				},
			})) {
				events.push(event);
			}
			expect(events.at(-1)).toEqual({
				type: "done",
				sessionId: "thread-desktop-project",
				message: "桌面归组不影响回复",
			});
		}

		expect(syncCalls).toEqual([
			"thread-desktop-project",
			"thread-desktop-project",
			"thread-desktop-project",
			"thread-desktop-project",
		]);
		expect(syncObservedCompletedTurn).toEqual([true, true, true, true]);
		expect(syncObservedPersistedTurn).toEqual([true, true, true, true]);
	});

	test("does not hold back native events while desktop refresh is still pending", async () => {
		let releaseDesktop = () => {};
		const desktopBarrier = new Promise<void>((resolve) => {
			releaseDesktop = resolve;
		});
		const connection: CodexAppServerConnection = {
			request: async ({ method, params }) => {
				if (method === "thread/start") {
					return { thread: { id: "thread-nonblocking", threadSource: "user" } };
				}
				if (method === "thread/name/set") return {};
				if (method === "mcpServerStatus/list") return readyOpenCutStatus();
				if (method === "mcpServer/tool/call") return projectSummary();
				if (method === "turn/start") return { turn: { id: "turn-nonblocking" } };
				if (method === "thread/read") {
					return {
						thread: {
							id:
								isRecord(params) && typeof params.threadId === "string"
									? params.threadId
									: "thread-nonblocking",
							turns: [{ id: "turn-nonblocking", status: "inProgress" }],
						},
					};
				}
				throw new Error(`unexpected method ${method}`);
			},
			subscribe: (threadId) =>
				subscriptionOf({
					notifications: [
						{
							method: "item/agentMessage/delta",
							params: {
								threadId,
								turnId: "turn-nonblocking",
								delta: "流式",
							},
						},
						{
							method: "turn/completed",
							params: {
								threadId,
								turn: {
									id: "turn-nonblocking",
									status: "completed",
									error: null,
									items: [
										{
											type: "agentMessage",
											id: "message-nonblocking",
											text: "流式完成",
										},
									],
								},
							},
						},
					],
				}),
		};
		const service = createCodexChatService({
			runtime,
			connect: async () => connection,
			syncThreadToDesktop: async () => desktopBarrier,
		});
		const iterator = service
			.stream({
				input: {
					projectId: "project-1",
					message: "立即回复",
					context: "",
				},
			})
			[Symbol.asyncIterator]();

		for (let index = 0; index < 6; index += 1) {
			await iterator.next();
		}
		const nextEventPromise = iterator.next();
		const result = await Promise.race([
			nextEventPromise.then((next) => next.value),
			new Promise<"blocked">((resolve) =>
				setTimeout(() => resolve("blocked"), 50),
			),
		]);
		releaseDesktop();
		await nextEventPromise;

		expect(result).toEqual({ type: "delta", delta: "流式" });
	});

	test("reuses MCP capability validation and unchanged thread names across turns", async () => {
		const calls: string[] = [];
		let turnNumber = 0;
		const connection: CodexAppServerConnection = {
			request: async ({ method }) => {
				calls.push(method);
				if (method === "thread/start" || method === "thread/resume") {
					return { thread: { id: "thread-warm", threadSource: "user" } };
				}
				if (method === "thread/name/set") return {};
				if (method === "mcpServerStatus/list") return readyOpenCutStatus();
				if (method === "mcpServer/tool/call") return projectSummary();
				if (method === "turn/start") {
					turnNumber += 1;
					return { turn: { id: `turn-warm-${turnNumber}` } };
				}
				throw new Error(`unexpected method ${method}`);
			},
			subscribe: (threadId) => ({
				async *[Symbol.asyncIterator]() {
					await Promise.resolve();
					yield {
						method: "turn/completed",
						params: {
							threadId,
							turn: {
								id: `turn-warm-${turnNumber}`,
								status: "completed",
								error: null,
								items: [
									{
										type: "agentMessage",
										id: `message-warm-${turnNumber}`,
										text: "完成",
									},
								],
							},
						},
					};
				},
				close() {},
			}),
		};
		const service = createCodexChatService({
			runtime,
			connect: async () => connection,
		});

		for (let index = 0; index < 2; index += 1) {
			for await (const _event of service.stream({
				input: {
					projectId: "project-1",
					conversationId: "conversation-warm",
					message: "继续",
					context: "",
				},
			})) {
				// Consume the complete turn.
			}
		}

		expect(calls.filter((method) => method === "mcpServerStatus/list")).toHaveLength(
			1,
		);
		expect(calls.filter((method) => method === "thread/name/set")).toHaveLength(
			1,
		);
		expect(
			calls.filter((method) => method === "mcpServer/tool/call"),
		).toHaveLength(2);
	});

	test("basic verification checks the resulting revision without rendering frames", async () => {
		const calledTools: string[] = [];
		let projectRead = 0;
		const connection: CodexAppServerConnection = {
			request: async ({ method, params }) => {
				if (method === "thread/start") {
					return { thread: { id: "thread-basic", threadSource: "user" } };
				}
				if (method === "thread/name/set") return {};
				if (method === "mcpServerStatus/list") {
					const status = readyOpenCutStatus() as {
						data: Array<{ tools: Record<string, unknown> }>;
					};
					status.data[0]!.tools.wait_for_sync = { name: "wait_for_sync" };
					status.data[0]!.tools.render_frames = { name: "render_frames" };
					return status;
				}
				if (method === "mcpServer/tool/call") {
					if (!isRecord(params) || typeof params.tool !== "string") {
						throw new Error("invalid tool call");
					}
					calledTools.push(params.tool);
					if (params.tool === "read_project") {
						projectRead += 1;
						return projectSummary({ revision: projectRead === 1 ? 7 : 8 });
					}
					throw new Error(`unexpected tool ${params.tool}`);
				}
				if (method === "turn/start") return { turn: { id: "turn-basic" } };
				throw new Error(`unexpected method ${method}`);
			},
			subscribe: (threadId) =>
				subscriptionOf({
					notifications: [
						{
							method: "turn/completed",
							params: {
								threadId,
								turn: {
									id: "turn-basic",
									status: "completed",
									error: null,
									items: [
										{
											type: "agentMessage",
											id: "message-basic",
											text: "已修改",
										},
									],
								},
							},
						},
					],
				}),
		};
		const service = createCodexChatService({
			runtime,
			connect: async () => connection,
		});
		const events = [];

		for await (const event of service.stream({
			input: {
				projectId: "project-1",
				message: "修改并轻量复核",
				context: "",
				verificationMode: "basic",
			},
		})) {
			events.push(event);
		}

		expect(calledTools).toEqual(["read_project", "read_project"]);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "protocol",
				title: "工程修改已确认",
				detail: "revision 7 → 8",
			}),
		);
	});

	test("refreshes the desktop project when a browser turn is interrupted", async () => {
		const syncCalls: string[] = [];
		const connection: CodexAppServerConnection = {
			request: async ({ method, params }) => {
				if (method === "thread/start") {
					return {
						thread: {
							id: "thread-interrupted",
							threadSource: "user",
						},
					};
				}
				if (method === "thread/name/set") return {};
				if (method === "mcpServerStatus/list") return readyOpenCutStatus();
				if (method === "mcpServer/tool/call") return projectSummary();
				if (method === "turn/start") {
					return { turn: { id: "turn-interrupted" } };
				}
				if (method === "thread/read") {
					return {
						thread: {
							id:
								isRecord(params) && typeof params.threadId === "string"
									? params.threadId
									: "thread-interrupted",
							turns: [
								{
									id: "turn-interrupted",
									status: "interrupted",
									items: [],
								},
							],
						},
					};
				}
				throw new Error(`unexpected method ${method}`);
			},
			subscribe: (threadId) =>
				subscriptionOf({
					notifications: [
						{
							method: "turn/completed",
							params: {
								threadId,
								turn: {
									id: "turn-interrupted",
									status: "interrupted",
									error: null,
									items: [],
								},
							},
						},
					],
				}),
		};
		const service = createCodexChatService({
			runtime,
			connect: async () => connection,
			syncThreadToDesktop: async (threadId) => {
				syncCalls.push(threadId);
			},
		});

		const consume = async () => {
			for await (const _event of service.stream({
				input: {
					projectId: "project-1",
					conversationId: "conversation-interrupted",
					message: "处理中断后仍同步到桌面",
					context: "",
				},
			})) {
				// Consume until the interrupted native turn terminates the stream.
			}
		};

		expect(consume()).rejects.toThrow("Codex 本轮处理已中断");
		expect(syncCalls).toEqual(["thread-interrupted", "thread-interrupted"]);
	});

	test("surfaces a failed Codex turn without replacing it with local validation", async () => {
		const connection: CodexAppServerConnection = {
			request: async ({ method }) => {
				if (method === "thread/start") {
					return { thread: { id: "thread-1" } };
				}
				if (method === "mcpServerStatus/list") {
					return readyOpenCutStatus();
				}
				if (method === "mcpServer/tool/call") {
					return projectSummary();
				}
				return { turn: { id: "turn-1" } };
			},
			subscribe: (threadId) =>
				subscriptionOf({
					notifications: [
						{
							method: "turn/completed",
							params: {
								threadId,
								turn: {
									id: "turn-1",
									status: "failed",
									error: { message: "Codex 上游不可用" },
									items: [],
								},
							},
						},
					],
				}),
		};
		const service = createCodexChatService({
			runtime,
			connect: async () => connection,
		});

		const consume = async () => {
			for await (const _event of service.stream({
				input: {
					projectId: "project-1",
					message: "继续",
					context: "",
				},
			})) {
				// Consume the stream so the failed completion is observed.
			}
		};

		expect(consume()).rejects.toThrow("Codex 上游不可用");
	});
});
