"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	BrainCircuit,
	Check,
	ArrowUp,
	ChevronDown,
	CircleStop,
	FilePenLine,
	ListChecks,
	PanelLeftClose,
	Plus,
	SearchCheck,
	Settings2,
	Sparkles,
	TerminalSquare,
	Wrench,
} from "lucide-react";
import { toast } from "sonner";
import {
	buildAgentContextSnapshot,
	buildElementContextReferences,
	buildMediaContextReferences,
	buildTimelineRangeReference,
	resolveAgentContextTarget,
} from "@/agent/context-references";
import { useAgentContextStore } from "@/agent/context-store";
import {
	buildAgentProcessSteps,
	type AgentProcessStep,
	visibleAgentProcessSteps,
} from "@/agent/agent-process-feed";
import {
	fetchCodexConversation,
	isProviderNativeEvent,
	mergeCodexConversationMessages,
	persistCodexConversation,
	synchronizeCodexConversationMessages,
	type CodexConversationMessage as ChatMessage,
	type CodexConversationThread,
	type CodexProtocolFrame,
	type ProviderNativeEvent,
} from "@/agent/codex-conversation";
import {
	CODEX_PERFORMANCE_PRESETS,
	DEFAULT_CODEX_PERFORMANCE_MODE,
	getCodexPerformancePreset,
	type CodexPerformanceMode,
	type CodexToolProfile,
	type CodexVerificationMode,
	type CodexVisualMode,
} from "@/agent/codex-performance";
import {
	clearExternalAgentConsent,
	hasExternalAgentConsent,
	storeExternalAgentConsent,
} from "@/agent/external-agent-consent";
import { CodexSseDecoder } from "@/agent/codex-sse";
import { toMediaTime, toSeconds } from "@/agent/time";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { useEditor } from "@/editor/use-editor";
import { shouldSubmitAgentComposer } from "./agent-composer-keyboard";
import {
	AgentSetupPanel,
	isAgentSetupSnapshot,
	type AgentSetupSnapshot,
} from "./agent-setup-panel";

type AgentProviderId = "codex" | "claude";

interface CodexConnection {
	provider: "path";
	path: string;
	status: "ready" | "login-required" | "unavailable" | "invalid";
	executable: boolean;
	authenticated: boolean;
	version: string | null;
	message: string;
}

interface CodexChatResult {
	sessionId: string;
	message: string;
	runId: string;
}

interface CodexModelCapability {
	id: string;
	label: string;
	description: string | null;
	efforts: string[];
	defaultEffort: string | null;
	inputModalities: string[];
	isDefault: boolean;
}

interface CodexCapabilities {
	models: CodexModelCapability[];
	modes: Array<{
		id: "default" | "plan";
		label: string;
		defaultEffort: string | null;
	}>;
	skills: Array<{
		name: string;
		description: string | null;
		enabled: boolean;
	}>;
	toolProfiles: Array<{
		id: "edit" | "verify" | "full";
		label: string;
		description: string;
	}>;
}

interface AgentModelOption {
	id: string;
	label: string;
}

interface AgentModelCatalogResponse {
	source: "gateway" | "native";
	models: AgentModelOption[];
	fetchedAt: string;
}

interface CodexRunSnapshot {
	runId: string;
	status: "running" | "completed" | "failed" | "interrupted";
	sessionId: string | null;
	turnId: string | null;
	lastSequence: number;
}

interface CodexTurnOptions {
	conversationId: string;
	model: string;
	effort: string;
	mode: "default" | "plan";
	toolProfile: CodexToolProfile;
	visualMode: CodexVisualMode;
	verificationMode: CodexVerificationMode;
}

interface ClaudeTurnOptions {
	conversationId: string;
	model: string;
	effort: "low" | "medium" | "high" | "max";
	mode: "edit" | "plan";
}

interface CodexStreamHandlers {
	onRun(run: CodexRunSnapshot): void;
	onSession(sessionId: string): void;
	onTurn(turnId: string): void;
	onSequence(sequence: number): void;
	onDelta(delta: string): void;
	onProtocol(frame: CodexProtocolFrame): void;
	onNative(event: ProviderNativeEvent): void;
}

const DEFAULT_PERFORMANCE_PRESET = getCodexPerformancePreset(
	DEFAULT_CODEX_PERFORMANCE_MODE,
);

const DEFAULT_CODEX_OPTIONS = {
	model: "gpt-5.6-sol",
	effort: DEFAULT_PERFORMANCE_PRESET.effort,
	mode: "default",
	toolProfile: DEFAULT_PERFORMANCE_PRESET.toolProfile,
	visualMode: DEFAULT_PERFORMANCE_PRESET.visualMode,
	verificationMode: DEFAULT_PERFORMANCE_PRESET.verificationMode,
} as const;

const NATIVE_CLAUDE_MODELS: AgentModelOption[] = [
	{ id: "sonnet", label: "Sonnet" },
	{ id: "opus", label: "Opus" },
	{ id: "haiku", label: "Haiku" },
];

function preferredAgentModel(
	models: AgentModelOption[],
	current: string,
): AgentModelOption | null {
	const normalizedCurrent = current.trim().toLocaleLowerCase();
	return (
		models.find((model) => model.id === current) ??
		(normalizedCurrent
			? models.find((model) =>
					model.id.toLocaleLowerCase().includes(normalizedCurrent),
				)
			: undefined) ??
		models[0] ??
		null
	);
}

const FULL_CREATION_SKILL_NAME = "moirai-cut-create";
const FULL_CREATION_REQUEST =
	"使用 $moirai-cut-create 完成当前工程的一版完整可编辑首剪：理解素材与声音、生成时间线、完成预览质检，并导出本地审阅版。保留现有工程的可编辑与可撤销能力。";
const FULL_CREATION_STAGES = [
	"理解素材",
	"生成时间线",
	"预览质检",
	"本地导出",
] as const;

const MOTION_DESIGN_SKILL_NAME = "moirai-cut-motion-design";
const MOTION_DESIGN_REQUEST =
	"使用 $moirai-cut-motion-design，根据当前工程或选区的画面、声音和文字层级，升级字幕与 MG 动效；直接写入可编辑关键帧并完成代表帧质检。若当前 Provider 未自动发现 Skill，请读取 .agents/skills/moirai-cut-motion-design/SKILL.md 后执行。";
const AGENT_REQUEST_PRESETS = [
	{ label: "收紧这段剪辑", request: "收紧这段剪辑" },
	{ label: "升级字幕与 MG 动效", request: MOTION_DESIGN_REQUEST },
	{ label: "将所选素材重命名为主角", request: "将所选素材重命名为主角" },
] as const;

function nextMessageId(): string {
	return crypto.randomUUID();
}

function timestampNow(): number {
	return Date.now();
}

function shouldFollowConversationTail(element: HTMLElement): boolean {
	return element.scrollHeight - element.clientHeight - element.scrollTop <= 96;
}

function isCodexConnection(value: unknown): value is CodexConnection {
	return (
		typeof value === "object" &&
		value !== null &&
		"provider" in value &&
		value.provider === "path" &&
		"path" in value &&
		typeof value.path === "string" &&
		"status" in value &&
		(value.status === "ready" ||
			value.status === "login-required" ||
			value.status === "unavailable" ||
			value.status === "invalid") &&
		"executable" in value &&
		typeof value.executable === "boolean" &&
		"authenticated" in value &&
		typeof value.authenticated === "boolean" &&
		"version" in value &&
		(typeof value.version === "string" || value.version === null) &&
		"message" in value &&
		typeof value.message === "string"
	);
}

function unavailableCodexConnection(): CodexConnection {
	return {
		provider: "path",
		path: "/Applications/ChatGPT.app/Contents/Resources/codex",
		status: "unavailable",
		executable: false,
		authenticated: false,
		version: null,
		message: "无法读取 Codex 连接状态，请检查本地服务。",
	};
}

async function fetchCodexConnection(): Promise<CodexConnection> {
	const response = await fetch("/api/codex/config");
	if (!response.ok) {
		throw new Error(`Codex config check failed: ${response.status}`);
	}
	const value: unknown = await response.json();
	if (!isCodexConnection(value)) {
		throw new Error("Codex config response is invalid");
	}
	return value;
}

async function fetchAgentSetup(): Promise<AgentSetupSnapshot> {
	const response = await fetch("/api/agent/setup", { cache: "no-store" });
	if (!response.ok) {
		throw new Error(`Agent setup check failed: ${response.status}`);
	}
	const value: unknown = await response.json();
	if (!isAgentSetupSnapshot(value)) {
		throw new Error("Agent setup response is invalid");
	}
	return value;
}

function isCodexCapabilities(value: unknown): value is CodexCapabilities {
	return (
		typeof value === "object" &&
		value !== null &&
		"models" in value &&
		Array.isArray(value.models) &&
		"modes" in value &&
		Array.isArray(value.modes) &&
		"skills" in value &&
		Array.isArray(value.skills) &&
		"toolProfiles" in value &&
		Array.isArray(value.toolProfiles)
	);
}

function isCodexMode(value: string): value is "default" | "plan" {
	return value === "default" || value === "plan";
}

function isCodexToolProfile(
	value: string,
): value is "edit" | "verify" | "full" {
	return value === "edit" || value === "verify" || value === "full";
}

async function fetchCodexCapabilities(): Promise<CodexCapabilities> {
	const response = await fetch("/api/codex/capabilities");
	if (!response.ok) {
		throw new Error(`Codex capabilities failed: ${response.status}`);
	}
	const value: unknown = await response.json();
	if (!isCodexCapabilities(value)) {
		throw new Error("Codex capabilities response is invalid");
	}
	return value;
}

function isAgentModelCatalogResponse(
	value: unknown,
): value is AgentModelCatalogResponse {
	return (
		typeof value === "object" &&
		value !== null &&
		"source" in value &&
		(value.source === "gateway" || value.source === "native") &&
		"models" in value &&
		Array.isArray(value.models) &&
		value.models.every(
			(model) =>
				typeof model === "object" &&
				model !== null &&
				"id" in model &&
				typeof model.id === "string" &&
				"label" in model &&
				typeof model.label === "string",
		) &&
		"fetchedAt" in value &&
		typeof value.fetchedAt === "string"
	);
}

async function fetchAgentModels(refresh = false): Promise<AgentModelOption[]> {
	const response = refresh
		? await fetch("/api/agent/models?refresh=1", { cache: "no-store" })
		: await fetch("/api/agent/models", { cache: "no-store" });
	const value: unknown = await response.json();
	if (!response.ok) {
		throw new Error(
			typeof value === "object" &&
				value !== null &&
				"error" in value &&
				typeof value.error === "string"
				? value.error
				: "无法读取网关模型目录",
		);
	}
	if (!isAgentModelCatalogResponse(value)) {
		throw new Error("网关模型目录响应无效");
	}
	return value.models;
}

function apiErrorMessage(value: unknown): string | null {
	if (
		typeof value === "object" &&
		value !== null &&
		"error" in value &&
		typeof value.error === "object" &&
		value.error !== null &&
		"message" in value.error &&
		typeof value.error.message === "string"
	) {
		return value.error.message;
	}
	return null;
}

function isCodexProtocolFrame(value: unknown): value is CodexProtocolFrame {
	if (!value || typeof value !== "object") return false;
	if (
		!("id" in value) ||
		typeof value.id !== "string" ||
		!("method" in value) ||
		typeof value.method !== "string" ||
		!("threadId" in value) ||
		typeof value.threadId !== "string" ||
		!("status" in value) ||
		(value.status !== "started" &&
			value.status !== "streaming" &&
			value.status !== "completed" &&
			value.status !== "failed" &&
			value.status !== "info") ||
		!("title" in value) ||
		typeof value.title !== "string"
	) {
		return false;
	}
	return (
		(!("turnId" in value) || typeof value.turnId === "string") &&
		(!("itemId" in value) || typeof value.itemId === "string") &&
		(!("itemType" in value) || typeof value.itemType === "string") &&
		(!("detail" in value) || typeof value.detail === "string") &&
		(!("append" in value) || typeof value.append === "boolean")
	);
}

function upsertProtocolFrame({
	frames,
	incoming,
}: {
	frames: CodexProtocolFrame[] | undefined;
	incoming: CodexProtocolFrame;
}): CodexProtocolFrame[] {
	const current = frames ?? [];
	const index = current.findIndex((frame) => frame.id === incoming.id);
	if (index < 0) return [...current, incoming];
	const previous = current[index];
	const detail =
		incoming.append && incoming.detail
			? `${previous?.detail ?? ""}${incoming.detail}`.slice(-8_000)
			: incoming.detail;
	const next = current.slice();
	next[index] = {
		...previous,
		...incoming,
		...(detail === undefined ? {} : { detail }),
	};
	return next;
}

function upsertProviderNativeEvent({
	events,
	incoming,
}: {
	events: ProviderNativeEvent[] | undefined;
	incoming: ProviderNativeEvent;
}): ProviderNativeEvent[] {
	const current = events ?? [];
	const index = current.findIndex((event) => event.id === incoming.id);
	if (index < 0) return [...current, incoming];
	const next = current.slice();
	next[index] = incoming;
	return next;
}

function ProcessStepGlyph({ step }: { step: AgentProcessStep }) {
	const iconClass = "size-3";
	if (step.kind === "thinking") return <BrainCircuit className={iconClass} />;
	if (step.kind === "plan") return <ListChecks className={iconClass} />;
	if (step.kind === "tool") return <Wrench className={iconClass} />;
	if (step.kind === "command") return <TerminalSquare className={iconClass} />;
	if (step.kind === "change") return <FilePenLine className={iconClass} />;
	if (step.kind === "verification")
		return <SearchCheck className={iconClass} />;
	return step.status === "completed" ? (
		<Check className={iconClass} />
	) : (
		<Sparkles className={iconClass} />
	);
}

function processStepDetailLabel(step: AgentProcessStep): string {
	if (step.kind === "thinking") return "思考摘要";
	if (step.kind === "plan") return "执行计划";
	if (step.kind === "tool") return "调用详情";
	if (step.kind === "command") return "执行输出";
	if (step.kind === "change") return "变更内容";
	if (step.kind === "verification") return "验证证据";
	return "过程信息";
}

function AgentProcessFeed({
	frames,
	events,
	streaming,
	provider,
}: {
	frames: CodexProtocolFrame[];
	events: ProviderNativeEvent[];
	streaming: boolean;
	provider: AgentProviderId;
}) {
	const steps = buildAgentProcessSteps({
		protocol: frames,
		nativeEvents: events,
	});
	const visibleSteps = visibleAgentProcessSteps({
		steps,
		streaming,
		provider,
	});
	const processFeedRef = useRef<HTMLDivElement>(null);
	const latestStep = visibleSteps.at(-1);
	const active = streaming;

	useEffect(() => {
		const frame = requestAnimationFrame(() => {
			processFeedRef.current?.scrollTo({
				top: processFeedRef.current.scrollHeight,
				behavior: streaming ? "smooth" : "auto",
			});
		});
		return () => cancelAnimationFrame(frame);
	}, [latestStep?.detail, latestStep?.status, visibleSteps.length, streaming]);

	if (visibleSteps.length === 0) return null;

	return (
		<details
			aria-label="智能剪辑工作过程"
			className="group/process mb-3"
			onToggle={(event) => {
				if (!event.currentTarget.open) return;
				requestAnimationFrame(() => {
					processFeedRef.current?.scrollTo({
						top: processFeedRef.current.scrollHeight,
						behavior: "auto",
					});
				});
			}}
		>
			<summary
				aria-label="查看完整工作过程"
				aria-live="polite"
				className="flex cursor-pointer list-none items-center gap-2 py-1.5 text-[10px] outline-none transition hover:text-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400/25 [&::-webkit-details-marker]:hidden"
			>
				<span
					aria-hidden="true"
					className={`w-3 shrink-0 text-center font-mono text-[11px] ${
						active
							? "motion-safe:animate-pulse text-cyan-300"
							: "text-emerald-400/70"
					}`}
				>
					{active ? "✳" : "✓"}
				</span>
				<span
					className={`min-w-0 flex-1 truncate ${
						active
							? "motion-safe:animate-pulse text-slate-400"
							: "text-slate-500"
					}`}
				>
					{latestStep?.title}
				</span>
				<ChevronDown className="size-3 shrink-0 text-slate-700 transition-transform group-open/process:rotate-180" />
			</summary>
			<div
				ref={processFeedRef}
				role="log"
				aria-label="实时工作步骤"
				className="mt-1 max-h-52 overflow-y-auto overscroll-contain border-l border-white/7 pl-2 [scrollbar-color:rgba(148,163,184,0.18)_transparent] [scrollbar-width:thin]"
			>
				<ol>
					{visibleSteps.map((step, index) => {
						const latest = index === visibleSteps.length - 1;
						const breathing = latest && active && step.status === "active";
						return (
							<li
								key={step.id}
								aria-current={latest ? "step" : undefined}
								className={`relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 py-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 ${
									latest ? "text-slate-200" : "text-slate-500"
								}`}
							>
								{index < visibleSteps.length - 1 ? (
									<span className="absolute top-7 bottom-[-0.5rem] left-[0.72rem] w-px bg-gradient-to-b from-white/10 to-transparent" />
								) : null}
								<span
									className={`relative flex size-6 items-center justify-center rounded-full border ${
										step.status === "failed"
											? "border-red-400/25 bg-red-400/8 text-red-300"
											: breathing
												? "border-cyan-300/30 bg-cyan-300/8 text-cyan-200 shadow-[0_0_18px_rgba(103,232,249,0.12)]"
												: step.status === "completed"
													? "border-emerald-400/18 bg-emerald-400/6 text-emerald-300"
													: "border-white/8 bg-white/[0.025] text-slate-500"
									}`}
								>
									{breathing ? (
										<span className="absolute inset-0 motion-safe:animate-ping rounded-full border border-cyan-300/20" />
									) : null}
									<ProcessStepGlyph step={step} />
								</span>
								<div className="min-w-0 pt-0.5">
									<p
										className={`text-[10px] leading-4 ${latest ? "font-medium text-slate-200" : "text-slate-500"}`}
									>
										{step.title}
									</p>
									{step.detail ? (
										<div className="mt-1">
											<p className="mb-0.5 text-[7px] tracking-[0.1em] text-slate-700 uppercase">
												{processStepDetailLabel(step)}
											</p>
											<p className="whitespace-pre-wrap break-words text-[9px] leading-[1.55] text-slate-500">
												{step.detail}
											</p>
										</div>
									) : null}
								</div>
							</li>
						);
					})}
				</ol>
			</div>
		</details>
	);
}

async function sendCodexTurn({
	projectId,
	message,
	messageId,
	context,
	sessionId,
	options,
	onRun,
	onSession,
	onTurn,
	onSequence,
	onDelta,
	onProtocol,
	onNative,
}: {
	projectId: string;
	message: string;
	messageId: string;
	context: string;
	sessionId: string | null;
	options: CodexTurnOptions;
	onRun(run: CodexRunSnapshot): void;
	onSession(sessionId: string): void;
	onTurn(turnId: string): void;
	onSequence(sequence: number): void;
	onDelta(delta: string): void;
	onProtocol(frame: CodexProtocolFrame): void;
	onNative(event: ProviderNativeEvent): void;
}): Promise<CodexChatResult> {
	const response = await fetch("/api/codex/chat", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			projectId,
			message,
			messageId,
			context,
			conversationId: options.conversationId,
			model: options.model,
			effort: options.effort,
			mode: options.mode,
			toolProfile: options.toolProfile,
			visualMode: options.visualMode,
			verificationMode: options.verificationMode,
			...(sessionId ? { sessionId } : {}),
		}),
	});
	return consumeCodexStream({
		response,
		onRun,
		onSession,
		onTurn,
		onSequence,
		onDelta,
		onProtocol,
		onNative,
	});
}

async function sendClaudeTurn({
	projectId,
	message,
	messageId,
	context,
	sessionId,
	options,
	onRun,
	onSession,
	onTurn,
	onSequence,
	onDelta,
	onProtocol,
	onNative,
	signal,
}: {
	projectId: string;
	message: string;
	messageId: string;
	context: string;
	sessionId: string | null;
	options: ClaudeTurnOptions;
	onRun(run: CodexRunSnapshot): void;
	onSession(sessionId: string): void;
	onTurn(turnId: string): void;
	onSequence(sequence: number): void;
	onDelta(delta: string): void;
	onProtocol(frame: CodexProtocolFrame): void;
	onNative(event: ProviderNativeEvent): void;
	signal?: AbortSignal;
}): Promise<CodexChatResult> {
	const response = await fetch("/api/claude/chat", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			projectId,
			message,
			messageId,
			context,
			conversationId: options.conversationId,
			model: options.model,
			effort: options.effort,
			mode: options.mode,
			...(sessionId ? { sessionId } : {}),
		}),
		...(signal ? { signal } : {}),
	});
	return consumeCodexStream({
		response,
		onRun,
		onSession,
		onTurn,
		onSequence,
		onDelta,
		onProtocol,
		onNative,
		providerLabel: "Claude Code",
	});
}

async function consumeCodexStream({
	response,
	onRun,
	onSession,
	onTurn,
	onSequence,
	onDelta,
	onProtocol,
	onNative,
	providerLabel = "Codex",
}: {
	response: Response;
	onRun(run: CodexRunSnapshot): void;
	onSession(sessionId: string): void;
	onTurn(turnId: string): void;
	onSequence(sequence: number): void;
	onDelta(delta: string): void;
	onProtocol(frame: CodexProtocolFrame): void;
	onNative(event: ProviderNativeEvent): void;
	providerLabel?: string;
}): Promise<CodexChatResult> {
	if (!response.ok) {
		const value: unknown = await response.json();
		throw new Error(
			apiErrorMessage(value) ?? `${providerLabel} 会话请求失败。`,
		);
	}
	if (!response.body) {
		throw new Error(`浏览器没有返回 ${providerLabel} 流式响应。`);
	}
	const reader = response.body.getReader();
	const textDecoder = new TextDecoder();
	const sseDecoder = new CodexSseDecoder();
	let completed: CodexChatResult | null = null;
	let activeRunId = "";

	for (;;) {
		const chunk = await reader.read();
		if (chunk.done) break;
		for (const event of sseDecoder.push(
			textDecoder.decode(chunk.value, { stream: true }),
		)) {
			let value: unknown;
			try {
				value = JSON.parse(event.data);
			} catch {
				continue;
			}
			if (!value || typeof value !== "object") continue;
			const eventSequence = event.id ? Number.parseInt(event.id, 10) : NaN;
			if (Number.isInteger(eventSequence) && eventSequence >= 0) {
				onSequence(eventSequence);
			}
			if (
				event.event === "run" &&
				"runId" in value &&
				typeof value.runId === "string" &&
				"status" in value &&
				(value.status === "running" ||
					value.status === "completed" ||
					value.status === "failed" ||
					value.status === "interrupted") &&
				"lastSequence" in value &&
				typeof value.lastSequence === "number"
			) {
				activeRunId = value.runId;
				onRun({
					runId: value.runId,
					status: value.status,
					sessionId:
						"sessionId" in value && typeof value.sessionId === "string"
							? value.sessionId
							: null,
					turnId:
						"turnId" in value && typeof value.turnId === "string"
							? value.turnId
							: null,
					lastSequence: value.lastSequence,
				});
				continue;
			}
			if ("runId" in value && typeof value.runId === "string") {
				activeRunId = value.runId;
			}
			if ("sequence" in value && typeof value.sequence === "number") {
				onSequence(value.sequence);
			}
			if (
				event.event === "session" &&
				"sessionId" in value &&
				typeof value.sessionId === "string"
			) {
				onSession(value.sessionId);
				continue;
			}
			if (
				event.event === "turn" &&
				"turnId" in value &&
				typeof value.turnId === "string"
			) {
				onTurn(value.turnId);
				if ("sessionId" in value && typeof value.sessionId === "string") {
					onSession(value.sessionId);
				}
				continue;
			}
			if (
				event.event === "delta" &&
				"delta" in value &&
				typeof value.delta === "string"
			) {
				onDelta(value.delta);
				continue;
			}
			if (event.event === "protocol" && isCodexProtocolFrame(value)) {
				onProtocol(value);
				continue;
			}
			if (
				event.event === "native" &&
				"event" in value &&
				isProviderNativeEvent(value.event)
			) {
				onNative(value.event);
				continue;
			}
			if (
				event.event === "done" &&
				"sessionId" in value &&
				typeof value.sessionId === "string" &&
				"message" in value &&
				typeof value.message === "string"
			) {
				completed = {
					sessionId: value.sessionId,
					message: value.message,
					runId: activeRunId,
				};
				continue;
			}
			if (
				event.event === "error" &&
				"message" in value &&
				typeof value.message === "string"
			) {
				throw new Error(value.message);
			}
		}
	}
	if (!completed) {
		throw new Error(`${providerLabel} 流式响应在完成前中断。`);
	}
	return completed;
}

async function reconnectCodexRun({
	runId,
	afterSequence,
	handlers,
}: {
	runId: string;
	afterSequence: number;
	handlers: CodexStreamHandlers;
}): Promise<CodexChatResult> {
	const response = await fetch(
		`/api/codex/chat?runId=${encodeURIComponent(runId)}&after=${afterSequence}`,
		{ cache: "no-store" },
	);
	return consumeCodexStream({ response, ...handlers });
}

async function runCodexAction(
	action:
		| { action: "steer"; runId: string; message: string }
		| { action: "interrupt"; runId: string }
		| {
				action: "compact";
				runId?: string;
				sessionId?: string;
				toolProfile?: "edit" | "verify" | "full";
		  },
): Promise<void> {
	const response = await fetch("/api/codex/chat", {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(action),
	});
	if (!response.ok) {
		const value: unknown = await response.json();
		throw new Error(apiErrorMessage(value) ?? "Codex 会话操作失败。");
	}
}

interface AgentWorkbenchProps {
	onClose?: () => void;
}

export function AgentWorkbench({ onClose }: AgentWorkbenchProps) {
	const editor = useEditor();
	const semanticState = editor.agent.getState();
	const projectId = semanticState.projectId;
	const selectedElements = useEditor((instance) =>
		instance.selection.getSelectedElements(),
	);
	const playheadSeconds = useEditor(
		(instance) => toSeconds(instance.playback.getCurrentTime()) ?? 0,
	);
	const timelineDurationSeconds = useEditor(
		(instance) => toSeconds(instance.timeline.getTotalDuration()) ?? 0,
	);
	const pinnedReferences = useAgentContextStore((store) => store.references);
	const addReferences = useAgentContextStore((store) => store.addReferences);
	const removeReference = useAgentContextStore(
		(store) => store.removeReference,
	);
	const clearReferences = useAgentContextStore(
		(store) => store.clearReferences,
	);
	const requestRevealMedia = useAssetsPanelStore(
		(store) => store.requestRevealMedia,
	);

	const [request, setRequest] = useState("");
	const [conversations, setConversations] = useState<CodexConversationThread[]>(
		[],
	);
	const [activeConversationId, setActiveConversationId] = useState<
		string | null
	>(null);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [sending, setSending] = useState(false);
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [hydratedConversationProjectId, setHydratedConversationProjectId] =
		useState<string | null>(null);
	const conversationHydrated =
		hydratedConversationProjectId === semanticState.projectId;
	const [codexConnection, setCodexConnection] =
		useState<CodexConnection | null>(null);
	const [agentSetup, setAgentSetup] = useState<AgentSetupSnapshot | null>(null);
	const [agentProvider, setAgentProvider] = useState<AgentProviderId>("codex");
	const [codexSettingsOpen, setCodexSettingsOpen] = useState(false);
	const [quickConfigOpen, setQuickConfigOpen] = useState(false);
	const [codexChecking, setCodexChecking] = useState(true);
	const [codexCapabilities, setCodexCapabilities] =
		useState<CodexCapabilities | null>(null);
	const [codexModel, setCodexModel] = useState<string>(
		DEFAULT_CODEX_OPTIONS.model,
	);
	const [codexEffort, setCodexEffort] = useState<string>(
		DEFAULT_CODEX_OPTIONS.effort,
	);
	const [codexMode, setCodexMode] = useState<"default" | "plan">(
		DEFAULT_CODEX_OPTIONS.mode,
	);
	const [codexPerformanceMode, setCodexPerformanceMode] =
		useState<CodexPerformanceMode>(DEFAULT_CODEX_PERFORMANCE_MODE);
	const [codexToolProfile, setCodexToolProfile] = useState<CodexToolProfile>(
		DEFAULT_CODEX_OPTIONS.toolProfile,
	);
	const [codexVisualMode, setCodexVisualMode] = useState<CodexVisualMode>(
		DEFAULT_CODEX_OPTIONS.visualMode,
	);
	const [codexVerificationMode, setCodexVerificationMode] =
		useState<CodexVerificationMode>(DEFAULT_CODEX_OPTIONS.verificationMode);
	const [claudeModel, setClaudeModel] = useState("sonnet");
	const [gatewayModels, setGatewayModels] = useState<AgentModelOption[]>([]);
	const [gatewayModelsLoading, setGatewayModelsLoading] = useState(false);
	const [gatewayModelsError, setGatewayModelsError] = useState<string | null>(
		null,
	);
	const [claudeEffort, setClaudeEffort] = useState<
		"low" | "medium" | "high" | "max"
	>("high");
	const [claudeMode, setClaudeMode] = useState<"edit" | "plan">("edit");
	const [activeRunId, setActiveRunId] = useState<string | null>(null);
	const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
	const [activeRunSequence, setActiveRunSequence] = useState(0);
	const [referencePickerOpen, setReferencePickerOpen] = useState(false);
	const [followSelection, setFollowSelection] = useState(true);
	const [referencePickerTab, setReferencePickerTab] = useState<
		"timeline" | "library"
	>("timeline");
	const [referenceSearch, setReferenceSearch] = useState("");
	const [rangeStartInput, setRangeStartInput] = useState("");
	const [rangeEndInput, setRangeEndInput] = useState("");
	const [agentDataConsent, setAgentDataConsent] = useState(false);
	const [consentOpen, setConsentOpen] = useState(false);
	const [pendingConsentRequest, setPendingConsentRequest] = useState<
		string | null
	>(null);
	const followedSelectionKey = useRef("");
	const reconnectingRunId = useRef<string | null>(null);
	const claudeAbortController = useRef<AbortController | null>(null);
	const conversationRevision = useRef(-1);
	const conversationChannel = useRef<BroadcastChannel | null>(null);
	const conversationLogRef = useRef<HTMLDivElement | null>(null);
	const quickConfigRef = useRef<HTMLDivElement | null>(null);
	const followConversationTail = useRef(true);
	const conversationHydratedRef = useRef(false);
	const activeConversationIdRef = useRef<string | null>(null);
	const latestConversation = useRef<{
		conversationId: string | null;
		provider: AgentProviderId;
		sessionId: string | null;
		messages: ChatMessage[];
	}>({
		conversationId: null,
		provider: "codex",
		sessionId: null,
		messages: [],
	});

	useEffect(() => {
		setAgentDataConsent(hasExternalAgentConsent(window.localStorage));
	}, []);

	useEffect(() => {
		const endpoint = agentSetup?.endpoints[agentProvider];
		if (endpoint?.mode !== "custom" || !endpoint.custom?.hasCredential) {
			setGatewayModels([]);
			setGatewayModelsError(null);
			return;
		}
		let active = true;
		setGatewayModelsLoading(true);
		setGatewayModelsError(null);
		void fetchAgentModels()
			.then((models) => {
				if (!active) return;
				setGatewayModels(models);
				if (agentProvider === "claude") {
					setClaudeModel(
						(current) => preferredAgentModel(models, current)?.id ?? current,
					);
				} else {
					setCodexModel(
						(current) => preferredAgentModel(models, current)?.id ?? current,
					);
				}
			})
			.catch((nextError) => {
				if (!active) return;
				setGatewayModels([]);
				setGatewayModelsError(
					nextError instanceof Error
						? nextError.message
						: "无法读取网关模型目录",
				);
			})
			.finally(() => {
				if (active) setGatewayModelsLoading(false);
			});
		return () => {
			active = false;
		};
	}, [agentProvider, agentSetup]);

	useEffect(() => {
		if (!quickConfigOpen) return;
		// 点击外部关闭快捷配置；Escape 提供等价的键盘退出路径。
		const closeFromOutside = (event: PointerEvent) => {
			if (
				event.target instanceof Node &&
				!quickConfigRef.current?.contains(event.target)
			) {
				setQuickConfigOpen(false);
			}
		};
		const closeFromKeyboard = (event: KeyboardEvent) => {
			if (event.key === "Escape") setQuickConfigOpen(false);
		};
		document.addEventListener("pointerdown", closeFromOutside);
		document.addEventListener("keydown", closeFromKeyboard);
		return () => {
			document.removeEventListener("pointerdown", closeFromOutside);
			document.removeEventListener("keydown", closeFromKeyboard);
		};
	}, [quickConfigOpen]);

	useEffect(() => {
		let active = true;
		void Promise.allSettled([
			fetchCodexConnection(),
			fetchCodexCapabilities(),
			fetchAgentSetup(),
		]).then(([connectionResult, capabilitiesResult, setupResult]) => {
			if (!active) return;
			if (connectionResult.status === "fulfilled") {
				setCodexConnection(connectionResult.value);
			} else {
				setCodexConnection(unavailableCodexConnection());
			}
			if (capabilitiesResult.status === "fulfilled") {
				const capabilities = capabilitiesResult.value;
				setCodexCapabilities(capabilities);
				const preferred =
					capabilities.models.find((model) => model.isDefault) ??
					capabilities.models.find(
						(model) => model.id === DEFAULT_CODEX_OPTIONS.model,
					) ??
					capabilities.models[0];
				if (preferred) {
					setCodexModel(preferred.id);
					setCodexEffort(
						preferred.efforts.includes(DEFAULT_CODEX_OPTIONS.effort)
							? DEFAULT_CODEX_OPTIONS.effort
							: (preferred.defaultEffort ??
									preferred.efforts[0] ??
									DEFAULT_CODEX_OPTIONS.effort),
					);
				}
			}
			if (setupResult.status === "fulfilled") {
				setAgentSetup(setupResult.value);
				if (setupResult.value.activeProvider) {
					setAgentProvider(setupResult.value.activeProvider);
				}
			}
			setCodexChecking(false);
		});
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		latestConversation.current = {
			conversationId: activeConversationId,
			provider: agentProvider,
			sessionId,
			messages,
		};
		activeConversationIdRef.current = activeConversationId;
	}, [activeConversationId, agentProvider, messages, sessionId]);
	useEffect(() => {
		conversationHydratedRef.current = conversationHydrated;
	}, [conversationHydrated]);
	useEffect(() => {
		if (!projectId) return;

		let active = true;
		const controller = new AbortController();
		conversationRevision.current = -1;
		conversationHydratedRef.current = false;

		const applyConversation = (
			conversation: NonNullable<
				Awaited<ReturnType<typeof fetchCodexConversation>>
			>,
		) => {
			const initialConversation = conversationRevision.current < 0;
			if (
				!active ||
				(!initialConversation &&
					conversation.revision <= conversationRevision.current)
			) {
				return;
			}
			conversationRevision.current = conversation.revision;
			setConversations(conversation.conversations);
			const currentId = activeConversationIdRef.current;
			const target =
				conversation.conversations.find(
					(candidate) => candidate.id === currentId,
				) ?? conversation.conversations[0];
			if (!target) {
				activeConversationIdRef.current = null;
				setActiveConversationId(null);
				setMessages([]);
				setSessionId(null);
				return;
			}
			const local = latestConversation.current;
			const switching = local.conversationId !== target.id;
			const targetProvider = target.provider ?? "codex";
			activeConversationIdRef.current = target.id;
			setActiveConversationId(target.id);
			setAgentProvider(targetProvider);
			setMessages((current) =>
				initialConversation || switching
					? target.messages
					: synchronizeCodexConversationMessages({
							current,
							incoming: target.messages,
							hasActiveRun: current.some(
								(message) => message.streaming && Boolean(message.runId),
							),
						}),
			);
			setSessionId(
				switching ? target.sessionId : (target.sessionId ?? local.sessionId),
			);
		};
		const refreshConversation = async ({
			synchronizeNative = true,
		}: {
			synchronizeNative?: boolean;
		} = {}): Promise<boolean> => {
			try {
				const conversation = await fetchCodexConversation({
					projectId,
					conversationId: activeConversationIdRef.current,
					revision: conversationRevision.current,
					synchronizeNative,
					signal: controller.signal,
				});
				if (conversation) applyConversation(conversation);
				return true;
			} catch (error) {
				if (!controller.signal.aborted) {
					console.error("Failed to refresh Codex conversation", error);
				}
				return false;
			}
		};
		let nativeRefreshInFlight: Promise<boolean> | null = null;
		const hydrateConversation = async ({
			synchronizeNative = true,
		}: {
			synchronizeNative?: boolean;
		} = {}) => {
			const refresh =
				synchronizeNative && nativeRefreshInFlight
					? nativeRefreshInFlight
					: refreshConversation({ synchronizeNative });
			if (synchronizeNative && !nativeRefreshInFlight) {
				nativeRefreshInFlight = refresh;
			}
			const refreshed = await refresh;
			if (synchronizeNative && nativeRefreshInFlight === refresh) {
				nativeRefreshInFlight = null;
			}
			if (refreshed && active) {
				setHydratedConversationProjectId(projectId);
			}
		};

		const channel =
			typeof BroadcastChannel === "undefined"
				? null
				: new BroadcastChannel(`opencut:codex-conversation:${projectId}`);
		conversationChannel.current = channel;
		if (channel) {
			channel.onmessage = () => {
				void hydrateConversation({ synchronizeNative: false });
			};
		}
		const refreshWhenVisible = () => {
			if (document.visibilityState === "visible") {
				void hydrateConversation();
			}
		};
		const timer = setInterval(() => {
			if (document.visibilityState === "visible") {
				void hydrateConversation();
			}
		}, 15_000);
		document.addEventListener("visibilitychange", refreshWhenVisible);
		window.addEventListener("focus", refreshWhenVisible);
		void hydrateConversation({ synchronizeNative: false }).then(() => {
			if (active) void hydrateConversation();
		});

		return () => {
			active = false;
			clearInterval(timer);
			document.removeEventListener("visibilitychange", refreshWhenVisible);
			window.removeEventListener("focus", refreshWhenVisible);
			controller.abort();
			channel?.close();
			if (conversationChannel.current === channel) {
				conversationChannel.current = null;
			}
			if (conversationHydratedRef.current) {
				const latest = latestConversation.current;
				if (latest.conversationId) {
					void persistCodexConversation({
						projectId,
						conversationId: latest.conversationId,
						provider: latest.provider,
						sessionId: latest.sessionId,
						messages: latest.messages,
					}).catch(() => {});
				}
			}
		};
	}, [projectId]);
	useEffect(() => {
		const log = conversationLogRef.current;
		if (!log || !followConversationTail.current) return;
		const frame = requestAnimationFrame(() => {
			log.scrollTo({
				top: log.scrollHeight,
				behavior: sending ? "auto" : "smooth",
			});
		});
		return () => cancelAnimationFrame(frame);
	}, [messages, sending]);
	useEffect(() => {
		if (!projectId || !activeConversationId || !conversationHydrated) return;
		const controller = new AbortController();
		const timer = setTimeout(() => {
			void persistCodexConversation({
				projectId,
				conversationId: activeConversationId,
				provider: agentProvider,
				sessionId,
				messages,
				signal: controller.signal,
			})
				.then((conversation) => {
					conversationRevision.current = Math.max(
						conversationRevision.current,
						conversation.revision,
					);
					setConversations(conversation.conversations);
					const active = conversation.conversations.find(
						(candidate) => candidate.id === activeConversationId,
					);
					if (
						active &&
						activeConversationIdRef.current === activeConversationId
					) {
						setMessages((current) =>
							mergeCodexConversationMessages({
								current,
								incoming: active.messages,
							}),
						);
						setSessionId(active.sessionId);
					}
					conversationChannel.current?.postMessage({
						revision: conversation.revision,
					});
				})
				.catch((error) => {
					if (!controller.signal.aborted) {
						console.error("Failed to persist Codex conversation", error);
					}
				});
		}, 120);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	}, [
		activeConversationId,
		agentProvider,
		conversationHydrated,
		messages,
		projectId,
		sessionId,
	]);
	const visibleReferences = pinnedReferences.filter(
		(reference) =>
			reference.projectId === semanticState.projectId &&
			reference.sceneId === semanticState.sceneId,
	);
	useEffect(() => {
		if (!followSelection) return;
		if (selectedElements.length === 0) {
			followedSelectionKey.current = "";
			return;
		}
		const selectionKey = selectedElements
			.map(({ trackId, elementId }) => `${trackId}:${elementId}`)
			.sort()
			.join("|");
		if (selectionKey === followedSelectionKey.current) return;
		followedSelectionKey.current = selectionKey;
		const references = buildElementContextReferences({
			state: editor.agent.getState(),
			selectedElements,
		});
		if (references.length > 0) addReferences(references);
	}, [addReferences, editor, followSelection, selectedElements]);

	useEffect(() => {
		if (!followSelection) followedSelectionKey.current = "";
	}, [followSelection]);

	const contextSnapshot = buildAgentContextSnapshot({
		state: semanticState,
		pinnedReferences: visibleReferences,
		selectedElements,
		playheadSeconds,
	});
	const semanticElementCount = semanticState.tracks.reduce(
		(total, track) => total + track.elementCount,
		0,
	);
	const normalizedReferenceSearch = referenceSearch.trim().toLocaleLowerCase();
	const filteredTimelineTracks = semanticState.tracks
		.map((track) => ({
			...track,
			elements: track.elements.filter((element) => {
				if (!normalizedReferenceSearch) return true;
				return [
					element.name,
					element.type,
					element.id,
					element.mediaId ?? "",
					track.name ?? "",
					track.type,
				]
					.join(" ")
					.toLocaleLowerCase()
					.includes(normalizedReferenceSearch);
			}),
		}))
		.filter((track) => track.elements.length > 0);
	const filteredTimelineElements = filteredTimelineTracks.flatMap((track) =>
		track.elements.map((element) => ({
			trackId: track.id,
			elementId: element.id,
		})),
	);
	const filteredMedia = semanticState.media.filter((asset) => {
		if (!normalizedReferenceSearch) return true;
		return [asset.name, asset.type, asset.id]
			.join(" ")
			.toLocaleLowerCase()
			.includes(normalizedReferenceSearch);
	});

	const selectedLabel =
		visibleReferences.length > 0
			? `已引用 ${visibleReferences.length} 项`
			: selectedElements.length === 0
				? "未选择素材"
				: `已选 ${selectedElements.length} 个素材`;
	const activeProviderConnection = agentSetup?.providers.find(
		(provider) => provider.provider === agentProvider,
	);
	const activeProviderLabel =
		agentProvider === "claude" ? "Claude Code" : "Codex";
	const codexStatusLabel = codexChecking
		? "检测中"
		: activeProviderConnection?.status === "ready"
			? `${activeProviderLabel} 已连接`
			: activeProviderConnection?.status === "login-required"
				? "需要登录"
				: "连接异常";
	const codexStatusClass =
		activeProviderConnection?.status === "ready"
			? "bg-emerald-400"
			: activeProviderConnection?.status === "login-required"
				? "bg-amber-400"
				: codexChecking
					? "bg-slate-500"
					: "bg-red-400";
	const activeConversation =
		conversations.find(
			(conversation) => conversation.id === activeConversationId,
		) ?? null;
	const usingCustomEndpoint =
		agentSetup?.endpoints[agentProvider]?.mode === "custom";
	const activeModelOptions: AgentModelOption[] = usingCustomEndpoint
		? gatewayModels
		: agentProvider === "claude"
			? NATIVE_CLAUDE_MODELS
			: (codexCapabilities?.models.map((model) => ({
					id: model.id,
					label: model.label || model.id,
				})) ?? []);
	const currentModel = agentProvider === "claude" ? claudeModel : codexModel;
	const selectedActiveModel =
		activeModelOptions.find((model) => model.id === currentModel) ?? null;
	const selectedCodexModel =
		codexCapabilities?.models.find((model) => model.id === codexModel) ?? null;
	const fullCreationSkillReady =
		agentProvider === "codex" &&
		(codexCapabilities?.skills.some(
			(skill) => skill.enabled && skill.name === FULL_CREATION_SKILL_NAME,
		) ??
			false);
	const motionDesignSkillReady =
		agentProvider === "claude" ||
		(codexCapabilities?.skills.some(
			(skill) => skill.enabled && skill.name === MOTION_DESIGN_SKILL_NAME,
		) ??
			false);
	const availableEfforts = selectedCodexModel?.efforts.length
		? selectedCodexModel.efforts
		: ["low", "medium", "high", "xhigh", "max", "ultra"];
	const applyPerformanceMode = (mode: CodexPerformanceMode) => {
		const preset = getCodexPerformancePreset(mode);
		setCodexPerformanceMode(mode);
		setCodexEffort(
			availableEfforts.includes(preset.effort)
				? preset.effort
				: (selectedCodexModel?.defaultEffort ??
						availableEfforts[0] ??
						preset.effort),
		);
		setCodexToolProfile(preset.toolProfile);
		setCodexVisualMode(preset.visualMode);
		setCodexVerificationMode(preset.verificationMode);
	};
	const chooseCodexModel = (nextModel: string) => {
		setCodexModel(nextModel);
		const capability = codexCapabilities?.models.find(
			(model) => model.id === nextModel,
		);
		if (capability && !capability.efforts.includes(codexEffort)) {
			setCodexEffort(
				capability.defaultEffort ?? capability.efforts[0] ?? "high",
			);
		}
	};

	const persistCurrentConversation = () => {
		const latest = latestConversation.current;
		if (!projectId || !latest.conversationId) return;
		void persistCodexConversation({
			projectId,
			conversationId: latest.conversationId,
			provider: latest.provider,
			sessionId: latest.sessionId,
			messages: latest.messages,
		}).catch(() => {});
	};

	const selectConversation = (conversation: CodexConversationThread) => {
		if (sending || conversation.id === activeConversationId) return;
		persistCurrentConversation();
		followConversationTail.current = true;
		activeConversationIdRef.current = conversation.id;
		latestConversation.current = {
			conversationId: conversation.id,
			provider: conversation.provider ?? "codex",
			sessionId: conversation.sessionId,
			messages: conversation.messages,
		};
		setActiveConversationId(conversation.id);
		setAgentProvider(conversation.provider ?? "codex");
		setSessionId(conversation.sessionId);
		setMessages(conversation.messages);
		setActiveRunId(null);
		setActiveTurnId(null);
		setActiveRunSequence(0);
		setRequest("");
	};

	const createConversation = (
		provider: AgentProviderId = agentProvider,
	): string | null => {
		if (!conversationHydrated || sending) return null;
		persistCurrentConversation();
		followConversationTail.current = true;
		const conversationId = crypto.randomUUID();
		const now = timestampNow();
		const conversation: CodexConversationThread = {
			id: conversationId,
			title: "新对话",
			provider,
			sessionId: null,
			messages: [],
			createdAt: now,
			updatedAt: now,
		};
		activeConversationIdRef.current = conversationId;
		latestConversation.current = {
			conversationId,
			provider,
			sessionId: null,
			messages: [],
		};
		setConversations((current) => [conversation, ...current].slice(0, 50));
		setActiveConversationId(conversationId);
		setAgentProvider(provider);
		setSessionId(null);
		setMessages([]);
		setActiveRunId(null);
		setActiveTurnId(null);
		setActiveRunSequence(0);
		setRequest("");
		return conversationId;
	};

	const switchAgentProvider = (provider: AgentProviderId) => {
		if (provider === agentProvider) return;
		setAgentSetup((current) =>
			current ? { ...current, activeProvider: provider } : current,
		);
		if (messages.length > 0 || sessionId) {
			createConversation(provider);
			return;
		}
		setAgentProvider(provider);
		setSessionId(null);
		if (activeConversationId) {
			setConversations((current) =>
				current.map((conversation) =>
					conversation.id === activeConversationId
						? { ...conversation, provider, sessionId: null }
						: conversation,
				),
			);
			latestConversation.current = {
				...latestConversation.current,
				provider,
				sessionId: null,
			};
		}
	};

	const switchAgentEndpoint = (provider: AgentProviderId) => {
		if (provider !== agentProvider) {
			switchAgentProvider(provider);
			return;
		}
		if (messages.length > 0 || sessionId) {
			createConversation(provider);
		} else {
			setSessionId(null);
		}
		void fetchAgentSetup()
			.then(setAgentSetup)
			.catch(() => {});
		if (provider === "claude") return;
		setCodexChecking(true);
		void fetchCodexCapabilities()
			.then((capabilities) => {
				setCodexCapabilities(capabilities);
				const preferred =
					capabilities.models.find((model) => model.isDefault) ??
					capabilities.models[0];
				if (!preferred) return;
				setCodexModel(preferred.id);
				setCodexEffort(
					preferred.defaultEffort ??
						preferred.efforts[0] ??
						DEFAULT_CODEX_OPTIONS.effort,
				);
			})
			.catch(() => {})
			.finally(() => setCodexChecking(false));
	};

	const streamHandlersFor = (assistantMessageId: string) => ({
		onRun: (run: CodexRunSnapshot) => {
			setActiveRunId(run.runId);
			setActiveRunSequence(run.lastSequence);
			if (run.sessionId) setSessionId(run.sessionId);
			if (run.turnId) setActiveTurnId(run.turnId);
			setMessages((current) =>
				current.map((message) =>
					message.id === assistantMessageId
						? {
								...message,
								runId: run.runId,
								runSequence: Math.max(
									message.runSequence ?? 0,
									run.lastSequence,
								),
								updatedAt: Math.max(timestampNow(), message.updatedAt + 1),
							}
						: message,
				),
			);
		},
		onSession: setSessionId,
		onTurn: (turnId: string) => {
			setActiveTurnId(turnId);
			setMessages((current) =>
				current.map((message) =>
					message.id === assistantMessageId
						? {
								...message,
								turnId,
								updatedAt: Math.max(timestampNow(), message.updatedAt + 1),
							}
						: message,
				),
			);
		},
		onSequence: (sequence: number) => {
			setActiveRunSequence(sequence);
			setMessages((current) =>
				current.map((message) =>
					message.id === assistantMessageId
						? {
								...message,
								runSequence: Math.max(message.runSequence ?? 0, sequence),
								updatedAt: Math.max(timestampNow(), message.updatedAt + 1),
							}
						: message,
				),
			);
		},
		onDelta: (delta: string) => {
			setMessages((current) =>
				current.map((message) =>
					message.id === assistantMessageId
						? {
								...message,
								content: `${message.content}${delta}`,
								updatedAt: Math.max(timestampNow(), message.updatedAt + 1),
							}
						: message,
				),
			);
		},
		onProtocol: (frame: CodexProtocolFrame) => {
			setMessages((current) =>
				current.map((message) =>
					message.id === assistantMessageId
						? {
								...message,
								protocol: upsertProtocolFrame({
									frames: message.protocol,
									incoming: frame,
								}),
								updatedAt: Math.max(timestampNow(), message.updatedAt + 1),
							}
						: message,
				),
			);
		},
		onNative: (event: ProviderNativeEvent) => {
			setMessages((current) =>
				current.map((message) =>
					message.id === assistantMessageId
						? {
								...message,
								nativeEvents: upsertProviderNativeEvent({
									events: message.nativeEvents,
									incoming: event,
								}),
								updatedAt: Math.max(timestampNow(), message.updatedAt + 1),
							}
						: message,
				),
			);
		},
	});

	const completeAssistantMessage = ({
		assistantMessageId,
		result,
	}: {
		assistantMessageId: string;
		result: CodexChatResult;
	}) => {
		setSessionId(result.sessionId);
		setMessages((current) =>
			current.map((message) =>
				message.id === assistantMessageId
					? {
							...message,
							content: result.message,
							streaming: false,
							runId: result.runId || message.runId,
							updatedAt: Math.max(timestampNow(), message.updatedAt + 1),
						}
					: message,
			),
		);
		setActiveRunId(null);
		setActiveTurnId(null);
	};

	const failAssistantMessage = useCallback(
		({
			assistantMessageId,
			error,
			notify = true,
		}: {
			assistantMessageId: string;
			error: unknown;
			notify?: boolean;
		}) => {
			const failure =
				error instanceof Error
					? error.message
					: `${activeProviderLabel} 会话请求失败。`;
			setMessages((current) =>
				current.map((item) =>
					item.id === assistantMessageId
						? {
								...item,
								role: "error",
								content: failure,
								streaming: false,
								updatedAt: Math.max(timestampNow(), item.updatedAt + 1),
							}
						: item,
				),
			);
			setActiveRunId(null);
			setActiveTurnId(null);
			if (notify) {
				toast.error(`${activeProviderLabel} 会话失败`, {
					description: failure,
				});
			}
		},
		[activeProviderLabel],
	);

	const submitToCodex = async (
		nextRequest = request,
		consentGrantedForThisTurn = false,
	) => {
		const normalizedRequest = nextRequest.trim();
		const isFullCreationRequest = normalizedRequest === FULL_CREATION_REQUEST;
		if (!normalizedRequest) return;
		if (!agentDataConsent && !consentGrantedForThisTurn) {
			setPendingConsentRequest(normalizedRequest);
			setConsentOpen(true);
			return;
		}
		followConversationTail.current = true;
		if (!conversationHydrated) {
			toast("正在同步智能剪辑历史，请稍候");
			return;
		}
		if (!semanticState.projectId) {
			toast.error(`当前没有可交给 ${activeProviderLabel} 的工程`);
			return;
		}
		if (activeProviderConnection?.status !== "ready") {
			toast.error(`${activeProviderLabel} 尚未就绪`, {
				description: "请先在智能剪辑设置中配置路径并完成登录。",
			});
			return;
		}
		if (sending) {
			if (agentProvider === "claude") {
				toast("Claude Code 正在处理，请等待完成或先停止当前任务");
				return;
			}
			if (!activeRunId) return;
			const createdAt = timestampNow();
			setMessages((current) => [
				...current,
				{
					id: nextMessageId(),
					role: "user",
					content: normalizedRequest,
					createdAt,
					updatedAt: createdAt,
				},
			]);
			setRequest("");
			try {
				await runCodexAction({
					action: "steer",
					runId: activeRunId,
					message: normalizedRequest,
				});
				toast.success("已追加到当前任务");
			} catch (error) {
				toast.error("追加指令失败", {
					description: error instanceof Error ? error.message : "请稍后重试。",
				});
			}
			return;
		}
		const targetConversationId =
			activeConversationIdRef.current ?? createConversation();
		if (!targetConversationId) return;
		const referenceCount = contextSnapshot.references.length;
		const createdAt = timestampNow();
		const userMessageId = nextMessageId();
		const assistantMessageId = nextMessageId();
		setMessages((current) => [
			...current,
			{
				id: userMessageId,
				role: "user",
				content: normalizedRequest,
				...(referenceCount > 0 ? { referenceCount } : {}),
				createdAt,
				updatedAt: createdAt,
			},
			{
				id: assistantMessageId,
				role: "assistant",
				content: "",
				streaming: true,
				protocol: [],
				createdAt: createdAt + 1,
				updatedAt: createdAt + 1,
			},
		]);
		setRequest("");
		setSending(true);
		try {
			const shared = {
				projectId: semanticState.projectId,
				message: normalizedRequest,
				messageId: userMessageId,
				context: contextSnapshot.promptContext,
				sessionId,
				...streamHandlersFor(assistantMessageId),
			};
			const result =
				agentProvider === "claude"
					? await (() => {
							const controller = new AbortController();
							claudeAbortController.current = controller;
							return sendClaudeTurn({
								...shared,
								options: {
									conversationId: targetConversationId,
									model: claudeModel,
									effort: claudeEffort,
									mode: claudeMode,
								},
								signal: controller.signal,
							});
						})()
					: await sendCodexTurn({
							...shared,
							options: {
								conversationId: targetConversationId,
								model: codexModel,
								effort: codexEffort,
								mode: isFullCreationRequest ? "default" : codexMode,
								toolProfile: isFullCreationRequest
									? "verify"
									: codexToolProfile,
								visualMode: isFullCreationRequest ? "auto" : codexVisualMode,
								verificationMode: isFullCreationRequest
									? "full"
									: codexVerificationMode,
							},
						});
			completeAssistantMessage({ assistantMessageId, result });
		} catch (error) {
			if (!(error instanceof DOMException && error.name === "AbortError")) {
				failAssistantMessage({ assistantMessageId, error });
			}
		} finally {
			claudeAbortController.current = null;
			setSending(false);
		}
	};

	const stopCodexRun = async () => {
		if (agentProvider === "claude") {
			claudeAbortController.current?.abort();
			setMessages((current) =>
				current.map((message) =>
					message.streaming
						? {
								...message,
								content: message.content || "已停止 Claude Code 当前处理。",
								streaming: false,
								updatedAt: Math.max(timestampNow(), message.updatedAt + 1),
							}
						: message,
				),
			);
			setSending(false);
			return;
		}
		if (!activeRunId) return;
		try {
			await runCodexAction({
				action: "interrupt",
				runId: activeRunId,
			});
			setMessages((current) =>
				current.map((message) =>
					message.streaming && message.runId === activeRunId
						? {
								...message,
								content:
									message.content ||
									"已停止当前处理，可继续在本会话中发起新任务。",
								streaming: false,
								updatedAt: Math.max(timestampNow(), message.updatedAt + 1),
							}
						: message,
				),
			);
			setSending(false);
			setActiveRunId(null);
			setActiveTurnId(null);
		} catch (error) {
			toast.error("停止失败", {
				description: error instanceof Error ? error.message : "请稍后重试。",
			});
		}
	};

	const allowExternalAgentAndContinue = () => {
		if (!storeExternalAgentConsent({ storage: window.localStorage })) {
			toast.error("无法保存数据授权", {
				description: "请允许此站点使用本地存储后重试。",
			});
			return;
		}
		const pendingRequest = pendingConsentRequest;
		setAgentDataConsent(true);
		setPendingConsentRequest(null);
		setConsentOpen(false);
		if (pendingRequest) void submitToCodex(pendingRequest, true);
	};

	const declineExternalAgent = () => {
		setPendingConsentRequest(null);
		setConsentOpen(false);
	};

	const resetExternalAgentConsent = () => {
		if (!clearExternalAgentConsent(window.localStorage)) {
			toast.error("无法重置数据授权");
			return;
		}
		setAgentDataConsent(false);
		toast.success("数据授权已重置", {
			description: "下次发送智能剪辑请求前会再次确认。",
		});
	};

	const compactCodexContext = async () => {
		if (!activeRunId && !sessionId) {
			toast("当前会话还没有可压缩的上下文");
			return;
		}
		try {
			if (activeRunId) {
				await runCodexAction({
					action: "compact",
					runId: activeRunId,
					toolProfile: codexToolProfile,
				});
			} else if (sessionId) {
				await runCodexAction({
					action: "compact",
					sessionId,
					toolProfile: codexToolProfile,
				});
			}
			toast.success("上下文压缩已启动");
		} catch (error) {
			toast.error("压缩上下文失败", {
				description: error instanceof Error ? error.message : "请稍后重试。",
			});
		}
	};

	useEffect(() => {
		if (!conversationHydrated || sending) return;
		const pending = messages.findLast(
			(message) => message.streaming && Boolean(message.runId),
		);
		if (!pending?.runId || reconnectingRunId.current === pending.runId) {
			return;
		}
		reconnectingRunId.current = pending.runId;
		setSending(true);
		setActiveRunId(pending.runId);
		setActiveRunSequence(pending.runSequence ?? 0);
		void reconnectCodexRun({
			runId: pending.runId,
			afterSequence: pending.runSequence ?? 0,
			handlers: streamHandlersFor(pending.id),
		})
			.then((result) => {
				completeAssistantMessage({
					assistantMessageId: pending.id,
					result,
				});
			})
			.catch((error) => {
				failAssistantMessage({
					assistantMessageId: pending.id,
					error,
				});
			})
			.finally(() => {
				reconnectingRunId.current = null;
				setSending(false);
			});
	}, [conversationHydrated, failAssistantMessage, messages, sending]);

	const toggleTimelineElementReference = ({
		trackId,
		elementId,
	}: {
		trackId: string;
		elementId: string;
	}) => {
		const [reference] = buildElementContextReferences({
			state: editor.agent.getState(),
			selectedElements: [{ trackId, elementId }],
		});
		if (!reference) return;
		if (visibleReferences.some((item) => item.uri === reference.uri)) {
			removeReference(reference.uri);
			return;
		}
		addReferences([reference]);
	};

	const toggleMediaReference = (mediaId: string) => {
		const [reference] = buildMediaContextReferences({
			state: editor.agent.getState(),
			mediaIds: [mediaId],
		});
		if (!reference) return;
		if (visibleReferences.some((item) => item.uri === reference.uri)) {
			removeReference(reference.uri);
			return;
		}
		addReferences([reference]);
	};

	const pinSelectedElements = () => {
		const references = buildElementContextReferences({
			state: editor.agent.getState(),
			selectedElements,
		});
		if (references.length === 0) {
			toast.error("请先在时间线上选择素材");
			return;
		}
		addReferences(references);
		toast.success(`已引用 ${references.length} 个素材给 Codex`);
	};

	const pinTimelineRange = () => {
		const current = editor.agent.getState();
		const selected = buildElementContextReferences({
			state: current,
			selectedElements,
		});
		const selectedStart = Math.min(
			...selected.map((reference) => reference.startSeconds),
		);
		const selectedEnd = Math.max(
			...selected.map((reference) => reference.endSeconds),
		);
		const startSeconds =
			selected.length > 0 ? selectedStart : Math.max(0, playheadSeconds - 2.5);
		const endSeconds =
			selected.length > 0
				? selectedEnd
				: Math.min(timelineDurationSeconds, playheadSeconds + 2.5);
		if (
			timelineDurationSeconds <= 0 ||
			!Number.isFinite(startSeconds) ||
			!Number.isFinite(endSeconds) ||
			endSeconds <= startSeconds
		) {
			toast.error("当前播放头附近没有可引用的时间片段");
			return;
		}
		const reference = buildTimelineRangeReference({
			state: current,
			startSeconds,
			endSeconds,
		});
		addReferences([reference]);
		setRangeStartInput(startSeconds.toFixed(3));
		setRangeEndInput(endSeconds.toFixed(3));
		toast.success("已引用时间片段给 Codex");
	};

	const pinExactTimelineRange = () => {
		if (!rangeStartInput.trim() || !rangeEndInput.trim()) {
			toast.error("请输入开始和结束时间");
			return;
		}
		const startSeconds = Number(rangeStartInput);
		const endSeconds = Number(rangeEndInput);
		if (
			!Number.isFinite(startSeconds) ||
			!Number.isFinite(endSeconds) ||
			startSeconds < 0 ||
			endSeconds <= startSeconds ||
			endSeconds > timelineDurationSeconds
		) {
			toast.error("时间段无效", {
				description: `请输入 0–${timelineDurationSeconds.toFixed(3)} 秒内的有效范围。`,
			});
			return;
		}
		addReferences([
			buildTimelineRangeReference({
				state: editor.agent.getState(),
				startSeconds,
				endSeconds,
			}),
		]);
		toast.success(
			`已引用 ${startSeconds.toFixed(2)}–${endSeconds.toFixed(2)} 秒`,
		);
	};

	const pinFilteredResults = () => {
		const references =
			referencePickerTab === "timeline"
				? buildElementContextReferences({
						state: editor.agent.getState(),
						selectedElements: filteredTimelineElements,
					})
				: buildMediaContextReferences({
						state: editor.agent.getState(),
						mediaIds: filteredMedia.map((asset) => asset.id),
					});
		if (references.length === 0) {
			toast.error("当前筛选没有可引用内容");
			return;
		}
		addReferences(references);
		toast.success(`已引用 ${references.length} 项筛选结果`);
	};

	const revealReference = (uri: string) => {
		try {
			const target = resolveAgentContextTarget({
				state: editor.agent.getState(),
				uri,
			});
			if (target.kind === "media") {
				requestRevealMedia(target.mediaId);
				toast.success("已在素材库定位引用");
				return;
			}
			editor.selection.setSelectedElements({
				elements: target.selectedElements,
			});
			editor.playback.seek({
				time: toMediaTime("context seek", target.seekSeconds),
			});
			toast.success("已定位 Agent 引用");
		} catch (error) {
			toast.error("无法定位此引用", {
				description:
					error instanceof Error ? error.message : "Agent 运行环境已失效。",
			});
		}
	};

	const copyContext = async () => {
		try {
			await navigator.clipboard.writeText(contextSnapshot.promptContext);
			toast.success("Agent 上下文已复制");
		} catch {
			toast.error("复制失败，请检查浏览器剪贴板权限");
		}
	};

	const copyContextJson = async () => {
		try {
			await navigator.clipboard.writeText(contextSnapshot.contextJson);
			toast.success("Agent JSON 已复制");
		} catch {
			toast.error("复制失败，请检查浏览器剪贴板权限");
		}
	};

	return (
		<section
			className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#111315]"
			aria-label="智能剪辑协作侧栏"
		>
			{consentOpen ? (
				<div
					className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
					role="dialog"
					aria-modal="true"
					aria-labelledby="external-agent-consent-title"
				>
					<div className="w-full max-w-sm rounded-2xl border border-white/12 bg-[#1a1c1f] p-4 shadow-2xl">
						<h2
							id="external-agent-consent-title"
							className="text-sm font-semibold text-slate-100"
						>
							发送给外部 Agent 前请确认
						</h2>
						<p className="mt-2 text-[10px] leading-relaxed text-slate-400">
							点击允许后，当前提示词、工程名称以及你引用的素材、时间轴元素和时间段会发送给所选
							Agent。开启画面识别时，还会发送选区的抽样帧。Agent 可通过 Moirai
							Cut MCP 读取和修改当前工程。
						</p>
						<p className="mt-2 rounded-lg border border-cyan-400/15 bg-cyan-400/[0.04] px-2.5 py-2 text-[9px] leading-relaxed text-cyan-100/80">
							未引用的原始媒体不会随本条消息直接上传。授权仅保存在当前浏览器，可随时在设置中重置。
						</p>
						<div className="mt-4 flex justify-end gap-2">
							<button
								type="button"
								onClick={declineExternalAgent}
								className="rounded-lg px-3 py-2 text-[10px] text-slate-400 transition hover:bg-white/[0.05] hover:text-slate-100"
							>
								暂不发送
							</button>
							<button
								type="button"
								onClick={allowExternalAgentAndContinue}
								className="rounded-lg bg-cyan-300 px-3 py-2 text-[10px] font-semibold text-slate-950 transition hover:bg-cyan-200"
							>
								允许并继续
							</button>
						</div>
					</div>
				</div>
			) : null}
			<header className="flex h-13 shrink-0 items-center gap-3 border-b border-white/8 px-4">
				<div className="flex min-w-0 flex-1 items-center gap-2.5">
					<span className="relative flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#e6e8eb] text-[10px] font-black text-[#111315]">
						AI
						<span
							className={`absolute -right-0.5 -bottom-0.5 size-2 rounded-full border-2 border-[#111315] ${codexStatusClass}`}
						/>
					</span>
					<div className="min-w-0">
						<div className="text-[13px] font-semibold tracking-tight text-slate-100">
							智能剪辑
						</div>
						<select
							aria-label="切换智能剪辑会话"
							value={activeConversationId ?? ""}
							disabled={sending || !conversationHydrated}
							onChange={(event) => {
								const conversation = conversations.find(
									(candidate) => candidate.id === event.target.value,
								);
								if (conversation) selectConversation(conversation);
							}}
							className="block h-4 max-w-64 appearance-none truncate bg-transparent pr-4 text-[9px] text-slate-500 outline-none disabled:opacity-50"
							title={activeConversation?.title ?? "新对话"}
						>
							{conversations.length === 0 ? (
								<option value="">新对话</option>
							) : null}
							{conversations.map((conversation) => (
								<option key={conversation.id} value={conversation.id}>
									{conversation.provider === "claude"
										? "Claude · "
										: "Codex · "}
									{conversation.title}
								</option>
							))}
						</select>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						aria-label="新建智能剪辑会话"
						disabled={!conversationHydrated || sending}
						onClick={() => createConversation()}
						className="flex size-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-slate-100 disabled:opacity-30"
						title="新对话"
					>
						<Plus className="size-3.5" />
					</button>
					<button
						type="button"
						aria-label="打开智能剪辑设置"
						aria-expanded={codexSettingsOpen}
						onClick={() => {
							setQuickConfigOpen(false);
							setCodexSettingsOpen((open) => !open);
						}}
						className={`flex size-7 items-center justify-center rounded-lg transition ${
							codexSettingsOpen
								? "bg-white/[0.08] text-slate-100"
								: "text-slate-400 hover:bg-white/[0.06] hover:text-slate-100"
						}`}
						title={codexStatusLabel}
					>
						<Settings2 className="size-3.5" />
					</button>
					{onClose ? (
						<button
							type="button"
							aria-label="收起智能剪辑侧栏"
							onClick={onClose}
							className="flex size-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-slate-100"
							title="收起侧栏"
						>
							<PanelLeftClose className="size-3.5" />
						</button>
					) : null}
				</div>
			</header>

			{codexSettingsOpen ? (
				<section
					aria-label="智能剪辑设置"
					className="absolute right-3 top-13 z-20 max-h-[calc(100%-4rem)] w-[min(320px,calc(100%-1.5rem))] overflow-y-auto rounded-xl border border-white/10 bg-[#1a1c1f] p-3 shadow-2xl"
				>
					<AgentSetupPanel
						compact
						onProviderChange={switchAgentProvider}
						onEndpointChange={switchAgentEndpoint}
					/>
					{usingCustomEndpoint ? (
						<div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-black/15 px-2.5 py-2">
							<span className="min-w-0 truncate text-[8px] text-slate-500">
								{gatewayModelsLoading
									? "正在读取网关模型目录…"
									: gatewayModelsError
										? gatewayModelsError
										: `已发现 ${gatewayModels.length} 个模型 · Codex / Claude 共用`}
							</span>
							<button
								type="button"
								disabled={gatewayModelsLoading}
								onClick={() => {
									setGatewayModelsLoading(true);
									setGatewayModelsError(null);
									void fetchAgentModels(true)
										.then(setGatewayModels)
										.catch((nextError) =>
											setGatewayModelsError(
												nextError instanceof Error
													? nextError.message
													: "无法读取网关模型目录",
											),
										)
										.finally(() => setGatewayModelsLoading(false));
								}}
								className="shrink-0 rounded px-1.5 py-1 text-[8px] text-cyan-300 hover:bg-cyan-400/8 disabled:opacity-40"
							>
								刷新
							</button>
						</div>
					) : null}
					{agentProvider === "codex" ? (
						<>
							<label className="mt-3 block">
								<span className="mb-1 block text-[9px] text-slate-500">
									响应模式
								</span>
								<select
									aria-label="响应模式"
									value={codexPerformanceMode}
									disabled={sending}
									onChange={(event) => {
										const mode = event.target.value;
										if (
											mode === "fast" ||
											mode === "balanced" ||
											mode === "director"
										) {
											applyPerformanceMode(mode);
										}
									}}
									className="h-8 w-full rounded-md border border-white/8 bg-black/25 px-2 text-[10px] text-slate-200 outline-none focus:border-cyan-400/40 disabled:opacity-50"
								>
									{CODEX_PERFORMANCE_PRESETS.map((preset) => (
										<option key={preset.id} value={preset.id}>
											{preset.label} · {preset.description}
										</option>
									))}
								</select>
							</label>
							<div className="mt-3 grid grid-cols-2 gap-2">
								<label className="block">
									<span className="mb-1 block text-[9px] text-slate-500">
										模型
									</span>
									<select
										aria-label="Codex 模型"
										value={codexModel}
										disabled={sending}
										onChange={(event) => chooseCodexModel(event.target.value)}
										className="h-8 w-full rounded-md border border-white/8 bg-black/25 px-2 text-[10px] text-slate-200 outline-none focus:border-cyan-400/40 disabled:opacity-50"
									>
										{activeModelOptions.length ? (
											activeModelOptions.map((model) => (
												<option key={model.id} value={model.id}>
													{model.label}
												</option>
											))
										) : (
											<option value={codexModel}>{codexModel}</option>
										)}
									</select>
								</label>
								<label className="block">
									<span className="mb-1 block text-[9px] text-slate-500">
										模式
									</span>
									<select
										aria-label="Codex 协作模式"
										value={codexMode}
										disabled={sending}
										onChange={(event) => {
											if (isCodexMode(event.target.value)) {
												setCodexMode(event.target.value);
											}
										}}
										className="h-8 w-full rounded-md border border-white/8 bg-black/25 px-2 text-[10px] text-slate-200 outline-none focus:border-cyan-400/40 disabled:opacity-50"
									>
										<option value="default">执行模式</option>
										<option value="plan">规划模式</option>
									</select>
								</label>
							</div>
						</>
					) : (
						<div className="mt-3 grid grid-cols-2 gap-2">
							<label className="block">
								<span className="mb-1 block text-[9px] text-slate-500">
									模型
								</span>
								<select
									aria-label="Claude 模型"
									value={claudeModel}
									disabled={sending}
									onChange={(event) => setClaudeModel(event.target.value)}
									className="h-8 w-full rounded-md border border-white/8 bg-black/25 px-2 text-[10px] text-slate-200 outline-none focus:border-cyan-400/40 disabled:opacity-50"
								>
									{activeModelOptions.length ? (
										activeModelOptions.map((model) => (
											<option key={model.id} value={model.id}>
												{model.label}
											</option>
										))
									) : (
										<option value={claudeModel}>{claudeModel}</option>
									)}
								</select>
							</label>
							<label className="block">
								<span className="mb-1 block text-[9px] text-slate-500">
									模式
								</span>
								<select
									aria-label="Claude 协作模式"
									value={claudeMode}
									disabled={sending}
									onChange={(event) =>
										setClaudeMode(
											event.target.value === "plan" ? "plan" : "edit",
										)
									}
									className="h-8 w-full rounded-md border border-white/8 bg-black/25 px-2 text-[10px] text-slate-200 outline-none focus:border-cyan-400/40 disabled:opacity-50"
								>
									<option value="edit">执行模式</option>
									<option value="plan">规划模式</option>
								</select>
							</label>
							<label className="col-span-2 block">
								<span className="mb-1 block text-[9px] text-slate-500">
									推理强度
								</span>
								<select
									aria-label="Claude 推理强度"
									value={claudeEffort}
									disabled={sending}
									onChange={(event) => {
										const effort = event.target.value;
										if (
											effort === "low" ||
											effort === "medium" ||
											effort === "high" ||
											effort === "max"
										) {
											setClaudeEffort(effort);
										}
									}}
									className="h-8 w-full rounded-md border border-white/8 bg-black/25 px-2 text-[10px] text-slate-200 outline-none focus:border-cyan-400/40 disabled:opacity-50"
								>
									<option value="low">低</option>
									<option value="medium">中</option>
									<option value="high">高</option>
									<option value="max">最高</option>
								</select>
							</label>
						</div>
					)}
					<details className="group mt-3 border-t border-white/7 pt-2">
						<summary className="cursor-pointer list-none py-1 text-[10px] text-slate-400 outline-none transition hover:text-slate-100 [&::-webkit-details-marker]:hidden">
							高级设置
						</summary>
						{agentProvider === "codex" ? (
							<div className="mt-2 grid grid-cols-2 gap-2">
								<label className="block">
									<span className="mb-1 block text-[9px] text-slate-500">
										推理强度
									</span>
									<select
										aria-label="Codex 推理强度"
										value={codexEffort}
										disabled={sending}
										onChange={(event) => setCodexEffort(event.target.value)}
										className="h-8 w-full rounded-md border border-white/8 bg-black/25 px-2 text-[10px] text-slate-200 outline-none focus:border-cyan-400/40 disabled:opacity-50"
									>
										{availableEfforts.map((effort) => (
											<option key={effort} value={effort}>
												{effort}
											</option>
										))}
									</select>
								</label>
								<label className="block">
									<span className="mb-1 block text-[9px] text-slate-500">
										工具档位
									</span>
									<select
										aria-label="Codex 工具档位"
										value={codexToolProfile}
										disabled={sending}
										onChange={(event) => {
											if (isCodexToolProfile(event.target.value)) {
												setCodexToolProfile(event.target.value);
											}
										}}
										className="h-8 w-full rounded-md border border-white/8 bg-black/25 px-2 text-[10px] text-slate-200 outline-none focus:border-cyan-400/40 disabled:opacity-50"
									>
										<option value="edit">专注剪辑</option>
										<option value="verify">剪辑与验收</option>
										<option value="full">完整能力</option>
									</select>
								</label>
							</div>
						) : null}
						<div className="mt-2 space-y-1">
							<button
								type="button"
								aria-label="选中即引用"
								aria-pressed={followSelection}
								onClick={() => setFollowSelection((enabled) => !enabled)}
								className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[9px] text-slate-400 transition hover:bg-white/[0.04]"
							>
								<span>选中时间轴素材时自动引用</span>
								<span
									className={`h-4 w-7 rounded-full p-0.5 transition ${
										followSelection ? "bg-cyan-400" : "bg-white/10"
									}`}
								>
									<span
										className={`block size-3 rounded-full bg-white transition ${
											followSelection ? "translate-x-3" : ""
										}`}
									/>
								</span>
							</button>
							<button
								type="button"
								aria-pressed={codexVisualMode === "auto"}
								onClick={() =>
									setCodexVisualMode((current) =>
										current === "auto" ? "off" : "auto",
									)
								}
								className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[9px] text-slate-400 transition hover:bg-white/[0.04]"
							>
								<span>自动识别选区画面</span>
								<span className="text-slate-500">
									{codexVisualMode === "auto" ? "开启" : "关闭"}
								</span>
							</button>
							<button
								type="button"
								aria-pressed={codexVerificationMode !== "off"}
								onClick={() =>
									setCodexVerificationMode((current) =>
										current === "off" ? "full" : "off",
									)
								}
								className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[9px] text-slate-400 transition hover:bg-white/[0.04]"
							>
								<span>修改后自动复核</span>
								<span className="text-slate-500">
									{codexVerificationMode === "full"
										? "完整"
										: codexVerificationMode === "basic"
											? "轻量"
											: "关闭"}
								</span>
							</button>
						</div>
						<div className="mt-2 flex flex-wrap items-center gap-1 border-t border-white/7 pt-2">
							{visibleReferences.length > 0 ? (
								<>
									<button
										type="button"
										onClick={() => void copyContext()}
										className="rounded px-2 py-1 text-[9px] text-slate-500 hover:bg-white/[0.05] hover:text-slate-200"
									>
										复制上下文
									</button>
									<button
										type="button"
										onClick={() => void copyContextJson()}
										className="rounded px-2 py-1 text-[9px] text-slate-500 hover:bg-white/[0.05] hover:text-slate-200"
									>
										复制 JSON
									</button>
									<button
										type="button"
										onClick={clearReferences}
										className="rounded px-2 py-1 text-[9px] text-slate-500 hover:bg-white/[0.05] hover:text-red-300"
									>
										清空引用
									</button>
								</>
							) : null}
							{agentProvider === "codex" ? (
								<button
									type="button"
									disabled={!sessionId}
									onClick={() => void compactCodexContext()}
									className="ml-auto rounded px-2 py-1 text-[9px] text-slate-500 hover:bg-white/[0.05] hover:text-slate-200 disabled:opacity-30"
								>
									压缩上下文
								</button>
							) : null}
						</div>
						<div className="mt-2 flex items-center justify-between border-t border-white/7 pt-2 text-[9px] text-slate-500">
							<span>外部 Agent 数据授权</span>
							<button
								type="button"
								disabled={!agentDataConsent}
								onClick={resetExternalAgentConsent}
								className="rounded px-2 py-1 text-slate-400 transition hover:bg-white/[0.05] hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
							>
								{agentDataConsent ? "重置数据授权" : "发送前会确认"}
							</button>
						</div>
						<p className="mt-1 text-right text-[8px] text-slate-600">
							{agentProvider === "codex"
								? `${codexCapabilities?.skills.filter((skill) => skill.enabled).length ?? 0} 个可用技能 · ${codexConnection?.version ?? "版本未知"}`
								: `Claude Code · ${activeProviderConnection?.version ?? "版本未知"}`}
						</p>
					</details>
				</section>
			) : null}

			<div
				ref={conversationLogRef}
				role="log"
				aria-label="智能剪辑对话记录"
				aria-live="polite"
				onScroll={(event) => {
					followConversationTail.current = shouldFollowConversationTail(
						event.currentTarget,
					);
				}}
				className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5"
			>
				{!conversationHydrated ? (
					<div className="flex h-full items-center justify-center gap-2 text-[10px] text-slate-500">
						<span className="size-1.5 animate-pulse rounded-full bg-cyan-300" />
						正在同步工程会话…
					</div>
				) : messages.length === 0 ? (
					<div className="flex h-full min-h-64 flex-col justify-center px-4 py-5">
						<div className="text-center">
							<span className="mx-auto mb-3 flex size-9 items-center justify-center rounded-xl border border-white/8 bg-white/[0.035] text-slate-300">
								<Sparkles className="size-4" />
							</span>
							<h3 className="text-sm font-medium text-slate-100">想怎么剪？</h3>
							<p className="mt-1 text-[10px] leading-relaxed text-slate-500">
								从完整首剪开始，或直接修改当前选择。
							</p>
						</div>

						<section className="mt-4 overflow-hidden rounded-xl border border-cyan-300/18 bg-[linear-gradient(145deg,rgba(34,211,238,0.075),rgba(255,255,255,0.018)_52%,rgba(255,255,255,0.01))] text-left shadow-[0_16px_48px_rgba(0,0,0,0.16)]">
							<div className="h-px bg-gradient-to-r from-cyan-300/80 via-cyan-300/20 to-transparent" />
							<div className="p-3.5">
								<div className="flex items-center justify-between gap-3">
									<span className="text-[9px] font-semibold tracking-[0.12em] text-cyan-200 uppercase">
										完整创作 Skill
									</span>
									<span
										className={`flex items-center gap-1 text-[8px] ${
											fullCreationSkillReady
												? "text-emerald-300"
												: "text-amber-200/75"
										}`}
									>
										<span
											className={`size-1.5 rounded-full ${
												fullCreationSkillReady
													? "bg-emerald-400"
													: "bg-amber-300"
											}`}
										/>
										{fullCreationSkillReady
											? "技能已就绪"
											: "重启 Agent 后可用"}
									</span>
								</div>
								<h4 className="mt-2 text-[12px] font-semibold text-slate-100">
									从当前素材完成一版可编辑首剪
								</h4>
								<p className="mt-1 text-[9px] leading-relaxed text-slate-500">
									Agent 在当前工程里工作；你可以随时拖动、裁切、撤销并继续对话。
								</p>
								<ol className="mt-3 grid grid-cols-2 gap-1.5">
									{FULL_CREATION_STAGES.map((stage, index) => (
										<li
											key={stage}
											className="flex items-center gap-1.5 rounded-md border border-white/6 bg-black/15 px-2 py-1.5 text-[8px] text-slate-400"
										>
											<span className="font-mono text-cyan-300/80">
												{String(index + 1).padStart(2, "0")}
											</span>
											{stage}
										</li>
									))}
								</ol>
								<button
									type="button"
									aria-label="使用完整创作 Skill"
									disabled={sending || !conversationHydrated}
									onClick={() => void submitToCodex(FULL_CREATION_REQUEST)}
									className="mt-3 flex h-8 w-full items-center justify-center gap-2 rounded-lg bg-[#e6e8eb] text-[10px] font-semibold text-[#111315] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
								>
									开始完整创作
									<ArrowUp className="size-3" />
								</button>
							</div>
						</section>

						<div className="mt-4 text-center">
							<p className="text-[8px] font-medium tracking-[0.12em] text-slate-600 uppercase">
								快速修改 · {selectedLabel}
							</p>
							<div className="mt-2 flex flex-wrap justify-center gap-1.5">
								{AGENT_REQUEST_PRESETS.map((preset) => (
									<button
										key={preset.label}
										type="button"
										disabled={sending}
										className="rounded-full border border-white/8 px-2.5 py-1 text-[9px] text-slate-400 transition hover:border-white/15 hover:bg-white/[0.04] hover:text-slate-100 disabled:opacity-40"
										title={
											preset.request === MOTION_DESIGN_REQUEST
												? motionDesignSkillReady
													? "按当前画面与节奏直接生成可编辑动效"
													: "重启 Agent 后自动发现；当前会显式读取项目 Skill"
												: undefined
										}
										onClick={() => void submitToCodex(preset.request)}
									>
										{preset.label}
									</button>
								))}
							</div>
						</div>
					</div>
				) : (
					messages.map((message) =>
						message.role === "user" ? (
							<div
								key={message.id}
								className="ml-auto max-w-[78%] rounded-2xl bg-[#2c2f33] px-3.5 py-2.5 text-xs leading-relaxed text-slate-100"
							>
								<p className="whitespace-pre-wrap">{message.content}</p>
								{message.referenceCount ? (
									<p className="mt-1 text-[8px] text-slate-500">
										已引用 {message.referenceCount} 项上下文
									</p>
								) : null}
							</div>
						) : (
							<div
								key={message.id}
								className="flex max-w-[86%] items-start gap-2.5"
							>
								<span
									className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-[9px] font-black ${
										message.role === "error"
											? "bg-red-500 text-white"
											: "border border-white/10 bg-[#e6e8eb] text-[#111315]"
									}`}
								>
									{message.role === "error" ? "!" : "AI"}
								</span>
								<div
									className={`min-w-0 flex-1 px-1 py-1 text-xs leading-relaxed ${
										message.role === "error"
											? "rounded-xl border border-red-500/25 bg-red-500/8 px-3 py-2 text-red-200"
											: "text-slate-200"
									}`}
								>
									<AgentProcessFeed
										frames={message.protocol ?? []}
										events={message.nativeEvents ?? []}
										streaming={message.streaming === true}
										provider={agentProvider}
									/>
									{message.content ? (
										<p className="whitespace-pre-wrap">
											{message.content}
											{message.streaming ? (
												<span
													className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-cyan-300 align-middle"
													aria-label={`${activeProviderLabel} 正在流式回复`}
												/>
											) : null}
										</p>
									) : null}
								</div>
							</div>
						),
					)
				)}
			</div>

			{referencePickerOpen ? (
				<section
					className="absolute right-4 bottom-24 left-4 z-10 max-h-[55%] overflow-hidden rounded-xl border border-white/10 bg-[#181b1e] shadow-2xl"
					aria-label="上下文选择器"
				>
					<div className="flex items-center justify-between border-b border-white/8 px-3 py-2">
						<div>
							<div className="text-[11px] font-semibold">添加上下文</div>
							<div className="text-[9px] text-slate-500">
								选择后会随消息发送给智能剪辑
							</div>
						</div>
						<button
							type="button"
							className="px-1 text-sm text-slate-500 hover:text-slate-100"
							onClick={() => setReferencePickerOpen(false)}
							aria-label="关闭上下文选择器"
						>
							×
						</button>
					</div>
					<div className="flex gap-1 border-b border-white/8 px-3 pt-2">
						<button
							type="button"
							aria-label="选择时间轴素材"
							aria-pressed={referencePickerTab === "timeline"}
							className={`border-b-2 px-3 pb-2 text-[10px] font-medium ${
								referencePickerTab === "timeline"
									? "border-cyan-400 text-cyan-300"
									: "border-transparent text-slate-500 hover:text-slate-200"
							}`}
							onClick={() => setReferencePickerTab("timeline")}
						>
							时间轴素材 · {semanticElementCount}
						</button>
						<button
							type="button"
							aria-label="选择素材库元素"
							aria-pressed={referencePickerTab === "library"}
							className={`border-b-2 px-3 pb-2 text-[10px] font-medium ${
								referencePickerTab === "library"
									? "border-cyan-400 text-cyan-300"
									: "border-transparent text-slate-500 hover:text-slate-200"
							}`}
							onClick={() => setReferencePickerTab("library")}
						>
							素材库 · {semanticState.media.length}
						</button>
						<div className="ml-auto flex items-start gap-1 pb-1">
							<button
								type="button"
								className="rounded border border-cyan-400/20 bg-cyan-400/[0.05] px-2 py-1 text-[9px] text-cyan-200 hover:bg-cyan-400/10"
								onClick={pinFilteredResults}
							>
								引用筛选结果
							</button>
							<button
								type="button"
								className="rounded border border-white/8 px-2 py-1 text-[9px] text-slate-400 hover:text-slate-100"
								onClick={pinSelectedElements}
							>
								引用当前选择
							</button>
							<button
								type="button"
								className="rounded border border-white/8 px-2 py-1 text-[9px] text-slate-400 hover:text-slate-100"
								onClick={pinTimelineRange}
							>
								引用播放头片段
							</button>
						</div>
					</div>
					<div className="grid grid-cols-[minmax(0,1fr)_64px_12px_64px_auto] items-center gap-1.5 border-b border-white/8 px-3 py-2">
						<input
							type="search"
							aria-label="搜索可引用内容"
							value={referenceSearch}
							onChange={(event) => setReferenceSearch(event.target.value)}
							placeholder="搜索名称、类型或 ID"
							className="h-7 min-w-0 rounded-md border border-white/8 bg-black/20 px-2 text-[9px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-400/35"
						/>
						<input
							type="number"
							min="0"
							step="0.001"
							aria-label="引用开始时间（秒）"
							value={rangeStartInput}
							onChange={(event) => setRangeStartInput(event.target.value)}
							placeholder="开始"
							className="h-7 rounded-md border border-white/8 bg-black/20 px-2 font-mono text-[9px] text-slate-200 outline-none focus:border-cyan-400/35"
						/>
						<span className="text-center text-[9px] text-slate-600">–</span>
						<input
							type="number"
							min="0"
							max={timelineDurationSeconds}
							step="0.001"
							aria-label="引用结束时间（秒）"
							value={rangeEndInput}
							onChange={(event) => setRangeEndInput(event.target.value)}
							placeholder="结束"
							className="h-7 rounded-md border border-white/8 bg-black/20 px-2 font-mono text-[9px] text-slate-200 outline-none focus:border-cyan-400/35"
						/>
						<button
							type="button"
							onClick={pinExactTimelineRange}
							className="h-7 rounded-md border border-white/10 px-2 text-[9px] text-slate-300 hover:border-cyan-400/35 hover:text-cyan-200"
						>
							引用精确时间段
						</button>
					</div>
					<div className="max-h-48 overflow-y-auto p-2">
						{referencePickerTab === "timeline" ? (
							<div className="space-y-2">
								{filteredTimelineTracks.map((track) =>
									track.elements.length > 0 ? (
										<div key={track.id}>
											<div className="px-1 pb-1 text-[8px] font-semibold tracking-[0.12em] text-slate-600 uppercase">
												{track.name ?? track.type} · {track.elements.length}
											</div>
											<div className="grid grid-cols-2 gap-1">
												{track.elements.map((element) => {
													const selected = visibleReferences.some(
														(reference) =>
															reference.kind === "element" &&
															reference.trackId === track.id &&
															reference.elementId === element.id,
													);
													return (
														<button
															key={element.id}
															type="button"
															aria-pressed={selected}
															className={`flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left ${
																selected
																	? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
																	: "border-white/6 bg-black/15 text-slate-300 hover:border-white/15"
															}`}
															onClick={() =>
																toggleTimelineElementReference({
																	trackId: track.id,
																	elementId: element.id,
																})
															}
														>
															<span
																className={`flex size-3.5 shrink-0 items-center justify-center rounded border text-[8px] ${
																	selected
																		? "border-cyan-300 bg-cyan-300 text-slate-950"
																		: "border-white/15 text-transparent"
																}`}
															>
																✓
															</span>
															<span className="min-w-0 flex-1">
																<span className="block truncate text-[10px] font-medium">
																	{element.name}
																</span>
																<span className="block font-mono text-[8px] text-slate-600">
																	{element.startTimeSeconds?.toFixed(2) ?? "—"}s
																	{" · "}
																	{element.type}
																</span>
															</span>
														</button>
													);
												})}
											</div>
										</div>
									) : null,
								)}
							</div>
						) : (
							<div className="grid grid-cols-2 gap-1">
								{filteredMedia.map((asset) => {
									const selected = visibleReferences.some(
										(reference) =>
											reference.kind === "media" &&
											reference.mediaId === asset.id,
									);
									return (
										<button
											key={asset.id}
											type="button"
											aria-pressed={selected}
											className={`flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left ${
												selected
													? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
													: "border-white/6 bg-black/15 text-slate-300 hover:border-white/15"
											}`}
											onClick={() => toggleMediaReference(asset.id)}
										>
											<span
												className={`flex size-3.5 shrink-0 items-center justify-center rounded border text-[8px] ${
													selected
														? "border-cyan-300 bg-cyan-300 text-slate-950"
														: "border-white/15 text-transparent"
												}`}
											>
												✓
											</span>
											<span className="min-w-0 flex-1">
												<span className="block truncate text-[10px] font-medium">
													{asset.name}
												</span>
												<span className="block text-[8px] text-slate-600">
													{asset.type}
													{asset.durationSeconds === null
														? ""
														: ` · ${asset.durationSeconds.toFixed(1)}s`}
												</span>
											</span>
										</button>
									);
								})}
							</div>
						)}
					</div>
				</section>
			) : null}

			<form
				className="shrink-0 bg-[#111315] px-4 pt-2 pb-4"
				onSubmit={(event) => {
					event.preventDefault();
					void submitToCodex();
				}}
			>
				<div className="rounded-2xl border border-white/10 bg-[#1a1c1f] p-2 shadow-[0_10px_32px_rgba(0,0,0,0.24)] transition focus-within:border-white/20">
					{visibleReferences.length > 0 ? (
						<div className="flex items-center gap-1.5 overflow-x-auto px-1 pb-1.5">
							{visibleReferences.map((reference) => (
								<div
									key={reference.uri}
									className="flex shrink-0 items-center rounded-full border border-white/8 bg-white/[0.045] text-[9px] text-slate-300"
								>
									<button
										type="button"
										className="max-w-44 truncate py-1 pl-2"
										onClick={() => revealReference(reference.uri)}
										title={`定位 ${reference.label}`}
									>
										@
										{reference.kind === "media"
											? "素材库"
											: reference.kind === "range"
												? "片段"
												: "时间线"}{" "}
										{reference.label}
									</button>
									<button
										type="button"
										aria-label={`移除引用 ${reference.label}`}
										className="px-1.5 py-1 text-slate-600 hover:text-slate-200"
										onClick={() => removeReference(reference.uri)}
									>
										×
									</button>
								</div>
							))}
						</div>
					) : null}
					<textarea
						aria-label="描述智能剪辑需求"
						className="max-h-28 min-h-12 w-full resize-none bg-transparent px-2 py-1.5 text-xs leading-relaxed text-slate-100 outline-none placeholder:text-slate-600"
						value={request}
						rows={2}
						disabled={!conversationHydrated}
						onChange={(event) => setRequest(event.target.value)}
						onKeyDown={(event) => {
							if (
								shouldSubmitAgentComposer({
									key: event.key,
									shiftKey: event.shiftKey,
									isComposing: event.nativeEvent.isComposing,
									keyCode: event.nativeEvent.keyCode,
								})
							) {
								event.preventDefault();
								void submitToCodex();
							}
						}}
						placeholder={
							!conversationHydrated
								? "正在同步工程会话…"
								: sending
									? agentProvider === "claude"
										? "Claude Code 正在处理…"
										: "继续补充当前任务…"
									: "描述你想要的剪辑效果…"
						}
					/>
					<div className="mt-1 flex items-center justify-between gap-2">
						<div className="flex min-w-0 items-center gap-1">
							<button
								type="button"
								aria-label="添加上下文引用"
								aria-pressed={referencePickerOpen}
								className={`flex size-7 shrink-0 items-center justify-center rounded-lg transition ${
									referencePickerOpen
										? "bg-white/12 text-slate-100"
										: "text-slate-400 hover:bg-white/[0.06] hover:text-slate-100"
								}`}
								onClick={() => {
									setQuickConfigOpen(false);
									setReferencePickerOpen((open) => !open);
								}}
							>
								<Plus className="size-3.5" />
							</button>
							<div ref={quickConfigRef} className="relative min-w-0">
								{quickConfigOpen ? (
									<section
										aria-label="快捷模式配置"
										className="absolute bottom-[calc(100%+0.65rem)] left-0 z-30 w-72 max-w-[calc(100vw-3rem)] rounded-xl border border-white/10 bg-[#1a1d20] p-3 shadow-[0_18px_55px_rgba(0,0,0,0.5)]"
									>
										<div className="flex items-start justify-between gap-3">
											<div>
												<p className="text-[11px] font-semibold text-slate-100">
													模型与模式
												</p>
												<p className="mt-0.5 text-[8px] text-slate-500">
													用于下一条智能剪辑消息
												</p>
											</div>
											<span className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[8px] text-slate-400">
												{activeProviderLabel}
											</span>
										</div>
										<div className="mt-3 grid grid-cols-2 gap-2">
											<label className="col-span-2 block">
												<span className="mb-1 block text-[8px] text-slate-500">
													模型
												</span>
												<select
													aria-label="快捷模型"
													value={
														agentProvider === "claude"
															? claudeModel
															: codexModel
													}
													disabled={sending}
													onChange={(event) => {
														if (agentProvider === "claude") {
															setClaudeModel(event.target.value);
														} else {
															chooseCodexModel(event.target.value);
														}
													}}
													className="h-8 w-full rounded-md border border-white/8 bg-black/25 px-2 text-[10px] text-slate-200 outline-none focus:border-cyan-400/40 disabled:opacity-50"
												>
													{activeModelOptions.length ? (
														activeModelOptions.map((model) => (
															<option key={model.id} value={model.id}>
																{model.label}
															</option>
														))
													) : (
														<option value={currentModel}>{currentModel}</option>
													)}
												</select>
											</label>
											<label className="block">
												<span className="mb-1 block text-[8px] text-slate-500">
													模式
												</span>
												<select
													aria-label="快捷协作模式"
													value={
														agentProvider === "claude" ? claudeMode : codexMode
													}
													disabled={sending}
													onChange={(event) => {
														if (agentProvider === "claude") {
															setClaudeMode(
																event.target.value === "plan" ? "plan" : "edit",
															);
														} else if (isCodexMode(event.target.value)) {
															setCodexMode(event.target.value);
														}
													}}
													className="h-8 w-full rounded-md border border-white/8 bg-black/25 px-2 text-[10px] text-slate-200 outline-none focus:border-cyan-400/40 disabled:opacity-50"
												>
													<option
														value={
															agentProvider === "claude" ? "edit" : "default"
														}
													>
														执行
													</option>
													<option value="plan">规划</option>
												</select>
											</label>
											<label className="block">
												<span className="mb-1 block text-[8px] text-slate-500">
													推理强度
												</span>
												<select
													aria-label="快捷推理强度"
													value={
														agentProvider === "claude"
															? claudeEffort
															: codexEffort
													}
													disabled={sending}
													onChange={(event) => {
														if (agentProvider === "claude") {
															const effort = event.target.value;
															if (
																effort === "low" ||
																effort === "medium" ||
																effort === "high" ||
																effort === "max"
															) {
																setClaudeEffort(effort);
															}
														} else {
															setCodexEffort(event.target.value);
														}
													}}
													className="h-8 w-full rounded-md border border-white/8 bg-black/25 px-2 text-[10px] text-slate-200 outline-none focus:border-cyan-400/40 disabled:opacity-50"
												>
													{agentProvider === "claude" ? (
														<>
															<option value="low">低</option>
															<option value="medium">中</option>
															<option value="high">高</option>
															<option value="max">最高</option>
														</>
													) : (
														availableEfforts.map((effort) => (
															<option key={effort} value={effort}>
																{effort}
															</option>
														))
													)}
												</select>
											</label>
										</div>
										<div className="mt-3 flex items-center justify-between border-t border-white/7 pt-2">
											<span className="text-[8px] text-slate-600">
												设置自动应用 · 点击外部关闭快捷配置
											</span>
											<button
												type="button"
												onClick={() => {
													setQuickConfigOpen(false);
													setCodexSettingsOpen(true);
												}}
												className="rounded-md px-2 py-1 text-[8px] text-cyan-300 transition hover:bg-cyan-400/8"
											>
												更多设置
											</button>
										</div>
									</section>
								) : null}
								<button
									type="button"
									aria-label="切换模型与模式"
									aria-expanded={quickConfigOpen}
									disabled={sending}
									onClick={() => {
										setReferencePickerOpen(false);
										setCodexSettingsOpen(false);
										setQuickConfigOpen((open) => !open);
									}}
									className={`flex min-w-0 max-w-52 items-center gap-1 rounded-md px-1.5 py-1 text-[9px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
										quickConfigOpen
											? "bg-white/[0.08] text-slate-200"
											: "text-slate-500 hover:bg-white/[0.05] hover:text-slate-300"
									}`}
									title={
										activeTurnId
											? `任务 ${activeTurnId} · 已接收 ${activeRunSequence} 个事件`
											: "切换模型与模式"
									}
								>
									<span className="min-w-0 truncate">
										{agentProvider === "claude"
											? `Claude · ${selectedActiveModel?.label ?? claudeModel} · ${claudeMode === "plan" ? "规划" : "执行"}`
											: `${selectedActiveModel?.label ?? selectedCodexModel?.label ?? codexModel} · ${codexMode === "plan" ? "规划" : "执行"}`}
									</span>
									<ChevronDown
										className={`size-2.5 shrink-0 transition-transform ${quickConfigOpen ? "rotate-180" : ""}`}
									/>
								</button>
							</div>
						</div>
						<div className="flex items-center gap-1.5">
							{sending ? (
								<button
									type="button"
									aria-label="停止处理"
									onClick={() => void stopCodexRun()}
									className="flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-red-300"
									title="停止处理"
								>
									<CircleStop className="size-3.5" />
								</button>
							) : null}
							<button
								type="submit"
								aria-label="发送智能剪辑需求"
								disabled={!conversationHydrated || !request.trim()}
								className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#e6e8eb] text-[#111315] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-25"
								title={sending ? "追加到当前任务" : "发送"}
							>
								<ArrowUp className="size-3.5" />
							</button>
						</div>
					</div>
				</div>
			</form>
		</section>
	);
}
