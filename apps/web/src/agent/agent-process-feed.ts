import type {
	CodexProtocolFrame,
	ProviderNativeEvent,
	ProviderNativePayload,
} from "@/agent/codex-conversation";

export type AgentProcessStepKind =
	| "thinking"
	| "plan"
	| "tool"
	| "command"
	| "change"
	| "verification"
	| "notice"
	| "error";

export type AgentProcessStepStatus = "active" | "completed" | "failed" | "info";

export interface AgentProcessStep {
	id: string;
	kind: AgentProcessStepKind;
	status: AgentProcessStepStatus;
	title: string;
	detail?: string;
	transient?: boolean;
}

export function agentStartupStep(
	provider: "codex" | "claude",
): AgentProcessStep {
	return {
		id: `${provider}:startup`,
		kind: "notice",
		status: "active",
		title: provider === "claude" ? "Claude Code 正在处理" : "Codex 正在处理",
		transient: true,
	};
}

export function visibleAgentProcessSteps({
	steps,
	streaming,
	provider,
}: {
	steps: AgentProcessStep[];
	streaming: boolean;
	provider: "codex" | "claude";
}): AgentProcessStep[] {
	const meaningful = steps.filter((step) => step.transient !== true);
	if (meaningful.length > 0 || !streaming) return meaningful;
	return [agentStartupStep(provider)];
}

const MAX_DETAIL_LENGTH = 1_200;
const SENSITIVE_FIELD =
	/(?:api[-_]?key|token|password|authorization|credential|secret)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimmed(value: string): string {
	const normalized = value.trim();
	return normalized.length <= MAX_DETAIL_LENGTH
		? normalized
		: `${normalized.slice(0, MAX_DETAIL_LENGTH)}\n…内容已截断`;
}

function redactSensitiveText(value: string): string {
	return value.replace(
		/((?:api[-_]?key|token|password|authorization|credential|secret)["']?\s*[:=]\s*["']?)([^"'\s,}\n]+)/gi,
		"$1[已隐藏]",
	);
}

function readableProviderText(value: string): string {
	const redacted = redactSensitiveText(value);
	if (/Output too large|<persisted-output>/i.test(redacted)) {
		return "工程数据已读取（内容较大，已使用摘要结果）";
	}
	if (/exceeds maximum allowed tokens/i.test(redacted)) {
		return "返回内容较大，正在分段读取";
	}
	if (/requires approval/i.test(redacted)) {
		return "该操作需要确认后继续";
	}
	return trimmed(redacted);
}

function inlineValue(value: unknown, key = ""): string {
	if (key && SENSITIVE_FIELD.test(key)) return "[已隐藏]";
	if (value === null || value === undefined) return "—";
	if (typeof value === "string") return readableProviderText(value);
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (Array.isArray(value)) {
		return value.map((item) => inlineValue(item)).join("、");
	}
	if (isRecord(value)) {
		return Object.entries(value)
			.map(
				([entryKey, entryValue]) =>
					`${entryKey}：${inlineValue(entryValue, entryKey)}`,
			)
			.join("；");
	}
	return String(value);
}

function readableValue(value: unknown): string {
	if (isRecord(value)) {
		return trimmed(
			Object.entries(value)
				.map(([key, entry]) => `${key}：${inlineValue(entry, key)}`)
				.join("\n"),
		);
	}
	if (Array.isArray(value)) {
		return trimmed(value.map((entry) => `• ${inlineValue(entry)}`).join("\n"));
	}
	return trimmed(inlineValue(value));
}

function stepStatus(frame: CodexProtocolFrame): AgentProcessStepStatus {
	if (frame.status === "failed") return "failed";
	if (frame.status === "completed") return "completed";
	if (frame.status === "started" || frame.status === "streaming") {
		return "active";
	}
	return "info";
}

function friendlyToolTitle(value: string): string {
	const normalized = value
		.replace(/^.*(?:Moirai Cut|OpenCut|opencut)\s*·\s*/i, "")
		.replace(/^mcp__(?:opencut|moirai_cut)__/i, "")
		.trim();
	if (/^Bash$/i.test(normalized)) return "运行命令";
	if (/^Read$/i.test(normalized)) return "读取工具结果";
	if (/^Grep$/i.test(normalized)) return "搜索工程信息";
	if (/^Glob$/i.test(normalized)) return "定位工程文件";
	if (/^ToolSearch$/i.test(normalized)) return "查找可用工程工具";
	if (normalized.includes("read_project")) return "读取当前工程";
	if (normalized.includes("edit_project")) return "修改时间线工程";
	if (normalized.includes("read_agent_context")) return "读取剪辑上下文";
	if (normalized.includes("read_media_catalog")) return "读取素材信息";
	if (normalized.includes("inspect_media_scenes")) return "识别素材场景";
	if (normalized.includes("inspect_timeline_range")) return "理解时间轴片段";
	if (normalized.includes("render_frames") || normalized.includes("render")) {
		return "检查预览画面";
	}
	if (normalized.includes("save_media_analysis")) return "保存素材理解";
	if (normalized.includes("export")) return "导出视频成片";
	if (normalized.includes("transcribe")) return "识别音频字幕";
	if (/正在(?:读取|修改|导出|检查|调用)/.test(normalized)) return normalized;
	const readable = normalized.replaceAll("_", " ").trim();
	return readable && readable !== "MCP 工具处理中"
		? `调用 ${readable}`
		: "调用工程工具";
}

function toolStepKind(value: string): AgentProcessStepKind {
	return /^Bash$/i.test(value.trim()) ? "command" : "tool";
}

function isGenericToolTitle(value: string): boolean {
	return [
		"工具调用完成",
		"工具调用失败",
		"正在调用工程工具",
		"调用工程工具",
		"正在准备工具参数",
	].includes(value);
}

function protocolStep(frame: CodexProtocolFrame): AgentProcessStep | null {
	const status = stepStatus(frame);
	const detail = frame.detail
		? trimmed(redactSensitiveText(frame.detail))
		: undefined;
	if (frame.status === "failed") {
		return {
			id: frame.id,
			kind: "error",
			status,
			title: "处理遇到问题",
			...(detail ? { detail } : {}),
		};
	}
	if (frame.itemType === "reasoning" || frame.method.includes("reasoning")) {
		return {
			id: frame.id,
			kind: "thinking",
			status,
			title: status === "active" ? "正在分析剪辑需求" : "剪辑思路已明确",
			...(detail ? { detail } : {}),
		};
	}
	if (frame.itemType === "plan" || frame.method.includes("plan")) {
		return {
			id: frame.id,
			kind: "plan",
			status,
			title: status === "active" ? "正在整理执行步骤" : "执行步骤已整理",
			...(detail ? { detail } : {}),
		};
	}
	if (
		frame.itemType === "mcpToolCall" ||
		frame.itemType === "toolCall" ||
		frame.itemType === "dynamicToolCall"
	) {
		return {
			id: frame.id,
			kind: "tool",
			status,
			title: friendlyToolTitle(frame.title || frame.method),
			...(detail ? { detail } : {}),
		};
	}
	if (frame.itemType === "commandExecution") {
		return {
			id: frame.id,
			kind: "command",
			status,
			title: status === "active" ? "正在执行操作" : "操作执行完成",
			...(detail ? { detail } : {}),
		};
	}
	if (frame.itemType === "fileChange") {
		return {
			id: frame.id,
			kind: "change",
			status,
			title: status === "active" ? "正在应用修改" : "修改已应用",
			...(detail ? { detail } : {}),
		};
	}
	if (frame.itemType === "verification") {
		return {
			id: frame.id,
			kind: "verification",
			status,
			title: status === "active" ? "正在检查编辑结果" : "编辑结果已检查",
			...(detail ? { detail } : {}),
		};
	}
	if (frame.itemType === "approval") {
		return {
			id: frame.id,
			kind: "notice",
			status,
			title: frame.title.replaceAll("Codex", "智能剪辑"),
			...(detail ? { detail } : {}),
		};
	}
	if (frame.method === "turn/started") {
		return { id: frame.id, kind: "notice", status, title: "开始处理当前工程" };
	}
	if (frame.method === "turn/completed") {
		return {
			id: frame.id,
			kind: status === "failed" ? "error" : "verification",
			status,
			title: status === "failed" ? "处理未完成" : "本轮处理完成",
			...(detail ? { detail } : {}),
		};
	}
	if (frame.itemType === "retry" || frame.method === "warning") {
		return {
			id: frame.id,
			kind: "notice",
			status,
			title: frame.title.replaceAll("Claude", "服务"),
			...(detail ? { detail } : {}),
		};
	}
	return null;
}

function contentBlocks(
	payload: ProviderNativePayload,
): Record<string, unknown>[] {
	if (!isRecord(payload) || !isRecord(payload.message)) return [];
	return Array.isArray(payload.message.content)
		? (payload.message.content.filter(isRecord) as Record<string, unknown>[])
		: [];
}

function resultText(value: unknown): string {
	if (typeof value === "string") return readableValue(value);
	if (Array.isArray(value)) {
		const text = value
			.filter(isRecord)
			.map((item) =>
				typeof item.text === "string" ? item.text : readableValue(item),
			)
			.filter(Boolean)
			.join("\n");
		return readableValue(text || value);
	}
	return readableValue(value);
}

function statusRank(status: AgentProcessStepStatus): number {
	if (status === "failed") return 4;
	if (status === "completed") return 3;
	if (status === "active") return 2;
	return 1;
}

function combineDetail(
	current: string | undefined,
	incoming: string | undefined,
) {
	if (!incoming) return current;
	if (!current || current === incoming) return incoming;
	if (incoming.includes(current)) return incoming;
	if (current.includes(incoming)) return current;
	return trimmed(`${current}\n\n${incoming}`);
}

export function buildAgentProcessSteps({
	protocol,
	nativeEvents,
}: {
	protocol: CodexProtocolFrame[];
	nativeEvents: ProviderNativeEvent[];
}): AgentProcessStep[] {
	const steps: AgentProcessStep[] = [];
	const indexes = new Map<string, number>();
	const claudeBlocks = new Map<number, string>();
	const upsert = (incoming: AgentProcessStep) => {
		const index = indexes.get(incoming.id);
		if (index === undefined) {
			indexes.set(incoming.id, steps.length);
			steps.push(incoming);
			return;
		}
		const current = steps[index];
		if (!current) return;
		const currentIsTool = current.kind === "tool" || current.kind === "command";
		const incomingIsTool =
			incoming.kind === "tool" || incoming.kind === "command";
		const preserveSpecificTool =
			currentIsTool && incomingIsTool && isGenericToolTitle(incoming.title);
		steps[index] = {
			...current,
			...incoming,
			kind: preserveSpecificTool ? current.kind : incoming.kind,
			title: preserveSpecificTool ? current.title : incoming.title,
			status:
				statusRank(incoming.status) >= statusRank(current.status)
					? incoming.status
					: current.status,
			detail: combineDetail(current.detail, incoming.detail),
		};
	};

	for (const event of nativeEvents) {
		if (!isRecord(event.payload)) continue;
		if (event.provider === "codex") {
			const method =
				typeof event.payload.method === "string"
					? event.payload.method
					: event.name;
			if (method === "thread/started") {
				upsert({
					id: event.id,
					kind: "notice",
					status: "completed",
					title: "Codex 任务已连接",
					transient: true,
				});
			}
			if (method === "turn/started") {
				upsert({
					id: event.id,
					kind: "notice",
					status: "active",
					title: "Codex 开始处理任务",
					transient: true,
				});
			}
			continue;
		}
		if (event.provider !== "claude") continue;
		const payload = event.payload;
		if (payload.type === "system" && payload.subtype === "init") {
			upsert({
				id: event.id,
				kind: "notice",
				status: "completed",
				title: "Claude Code 会话已初始化",
				transient: true,
			});
		}
		const blocks = contentBlocks(event.payload);
		for (const [blockIndex, block] of blocks.entries()) {
			if (block.type === "thinking") {
				const thinking =
					typeof block.thinking === "string"
						? block.thinking
						: typeof block.text === "string"
							? block.text
							: "";
				if (thinking.trim()) {
					upsert({
						id:
							typeof block.id === "string"
								? block.id
								: `claude:thinking:${blockIndex}`,
						kind: "thinking",
						status: "completed",
						title: "思考剪辑路径",
						detail: trimmed(redactSensitiveText(thinking)),
					});
				}
			}
			if (block.type === "tool_use" && typeof block.name === "string") {
				const id =
					typeof block.id === "string"
						? block.id
						: `${event.id}:tool:${blockIndex}`;
				upsert({
					id,
					kind: toolStepKind(block.name),
					status: "active",
					title: friendlyToolTitle(block.name),
					...(block.input === undefined
						? {}
						: { detail: `输入\n${readableValue(block.input)}` }),
				});
			}
			if (
				block.type === "tool_result" &&
				typeof block.tool_use_id === "string"
			) {
				upsert({
					id: block.tool_use_id,
					kind: "tool",
					status: block.is_error === true ? "failed" : "completed",
					title: block.is_error === true ? "工具调用失败" : "工具调用完成",
					detail: `结果\n${resultText(block.content)}`,
				});
			}
		}

		if (payload.type !== "stream_event" || !isRecord(payload.event)) continue;
		const streamEvent = payload.event;
		const blockIndex =
			typeof streamEvent.index === "number" ? streamEvent.index : 0;
		if (
			streamEvent.type === "content_block_start" &&
			isRecord(streamEvent.content_block)
		) {
			const block = streamEvent.content_block;
			const id =
				typeof block.id === "string"
					? block.id
					: block.type === "thinking"
						? `claude:thinking:${blockIndex}`
						: `claude:block:${blockIndex}`;
			claudeBlocks.set(blockIndex, id);
			if (block.type === "tool_use" && typeof block.name === "string") {
				upsert({
					id,
					kind: toolStepKind(block.name),
					status: "active",
					title: friendlyToolTitle(block.name),
				});
			}
		}
		if (
			streamEvent.type === "content_block_delta" &&
			isRecord(streamEvent.delta)
		) {
			const delta = streamEvent.delta;
			if (
				delta.type === "thinking_delta" &&
				typeof delta.thinking === "string"
			) {
				upsert({
					id: claudeBlocks.get(blockIndex) ?? `claude:thinking:${blockIndex}`,
					kind: "thinking",
					status: "active",
					title: "正在思考剪辑路径",
					detail: trimmed(redactSensitiveText(delta.thinking)),
				});
			}
			if (
				delta.type === "input_json_delta" &&
				typeof delta.partial_json === "string"
			) {
				const id = claudeBlocks.get(blockIndex);
				if (id) {
					upsert({
						id,
						kind: "tool",
						status: "active",
						title: "正在准备工具参数",
					});
				}
			}
		}
	}

	for (const frame of protocol) {
		if (
			(frame.method === "turn/started" || frame.method === "turn/start") &&
			nativeEvents.some(
				(event) => event.provider === "codex" && event.name === "turn/started",
			)
		) {
			continue;
		}
		const step = protocolStep(frame);
		if (step) upsert(step);
	}

	return steps.filter((step, index) => {
		const previous = steps[index - 1];
		return !(
			previous &&
			previous.kind === step.kind &&
			previous.status === step.status &&
			previous.title === step.title &&
			previous.detail === step.detail
		);
	});
}
