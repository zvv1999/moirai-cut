"use client";

import { useEffect, useRef, useState } from "react";
import {
	ArrowUp,
	CircleStop,
	PanelLeftClose,
	Plus,
	Settings2,
	Sparkles,
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
	fetchCodexConversation,
	mergeCodexConversationMessages,
	persistCodexConversation,
	synchronizeCodexConversationMessages,
	type CodexConversationMessage as ChatMessage,
	type CodexConversationThread,
	type CodexProtocolFrame,
	type CodexProtocolStatus,
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
import { CodexSseDecoder } from "@/agent/codex-sse";
import { toMediaTime, toSeconds } from "@/agent/time";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { useEditor } from "@/editor/use-editor";
import { AgentSetupPanel } from "./agent-setup-panel";

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

interface CodexStreamHandlers {
	onRun(run: CodexRunSnapshot): void;
	onSession(sessionId: string): void;
	onTurn(turnId: string): void;
	onSequence(sequence: number): void;
	onDelta(delta: string): void;
	onProtocol(frame: CodexProtocolFrame): void;
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

const AGENT_REQUEST_PRESETS = [
	"收紧这段剪辑",
	"统一字幕样式",
	"将所选素材重命名为主角",
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

function protocolStatusClass(status: CodexProtocolStatus): string {
	if (status === "failed") return "bg-red-400";
	if (status === "completed") return "bg-emerald-400";
	if (status === "info") return "bg-slate-500";
	return "bg-cyan-300";
}

function protocolActivityLabel(frame: CodexProtocolFrame): string {
	const active = frame.status === "started" || frame.status === "streaming";
	if (frame.status === "failed") return "处理遇到问题";
	if (frame.itemType === "reasoning" || frame.method.includes("reasoning")) {
		return active ? "正在理解剪辑需求" : "已理解剪辑需求";
	}
	if (frame.itemType === "plan" || frame.method.includes("plan")) {
		return active ? "正在规划剪辑步骤" : "已规划剪辑步骤";
	}
	if (frame.itemType === "mcpToolCall" || frame.method.includes("mcpServer")) {
		return active ? "正在处理当前工程" : "已处理当前工程";
	}
	if (frame.itemType === "commandExecution") {
		return active ? "正在执行剪辑操作" : "已执行剪辑操作";
	}
	if (frame.itemType === "fileChange") {
		return active ? "正在应用工程修改" : "已应用工程修改";
	}
	if (frame.itemType === "verification") {
		return active ? "正在验证编辑结果" : "验证证据已生成";
	}
	if (frame.itemType === "approval") {
		return active ? "正在确认操作权限" : "操作权限已确认";
	}
	if (frame.itemType === "agentMessage") {
		return active ? "正在生成回复" : "回复已生成";
	}
	if (frame.itemType === "userMessage") return "已接收剪辑需求";
	if (
		frame.title === "Codex 会话已恢复" ||
		frame.title === "Codex 会话已连接"
	) {
		return "智能剪辑已连接";
	}
	if (
		frame.title === "OneCut MCP 已就绪" ||
		frame.title === "OpenCut MCP 已就绪"
	) {
		return "工程工具已就绪";
	}
	return frame.title.replaceAll("Codex", "智能剪辑");
}

function VerificationEvidence({
	frame,
}: {
	frame: CodexProtocolFrame | undefined;
}) {
	if (!frame?.detail) return null;
	const evidence = frame.detail;
	return (
		<details className="mt-2 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.035] px-2.5 py-2">
			<summary className="cursor-pointer text-[9px] font-medium text-emerald-300">
				验证证据
			</summary>
			<p className="mt-1 whitespace-pre-wrap text-[9px] leading-relaxed text-slate-500">
				{evidence}
			</p>
		</details>
	);
}

function CodexActivityLine({ frames }: { frames: CodexProtocolFrame[] }) {
	const latestFrame = frames.at(-1);
	if (!latestFrame) return null;
	const previousFrames = frames.slice(-6, -1);
	const verificationFrame = [...frames]
		.reverse()
		.find((frame) => frame.itemType === "verification");
	const active =
		latestFrame.status === "started" || latestFrame.status === "streaming";
	const line = (
		<div
			key={`${latestFrame.id}:${latestFrame.status}:${latestFrame.title}`}
			className="flex min-w-0 items-center gap-2 py-1.5 text-[10px] text-slate-400 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-200"
			aria-live="polite"
		>
			<span className="relative flex size-3 shrink-0 items-center justify-center">
				{active ? (
					<span className="size-3 animate-spin rounded-full border border-white/15 border-t-cyan-300" />
				) : (
					<>
						<span
							className={`absolute size-2 rounded-full opacity-20 ${protocolStatusClass(latestFrame.status)}`}
						/>
						<span
							className={`relative size-1.5 rounded-full ${protocolStatusClass(latestFrame.status)}`}
						/>
					</>
				)}
			</span>
			<span className="min-w-0 flex-1 truncate">
				{protocolActivityLabel(latestFrame)}
			</span>
		</div>
	);

	return (
		<section aria-label="智能剪辑处理过程" className="mb-2">
			{previousFrames.length === 0 ? (
				line
			) : (
				<details className="group">
					<summary
						aria-label="查看之前的处理步骤"
						className="flex cursor-pointer list-none items-center gap-1 rounded-md outline-none transition hover:bg-white/[0.025] focus-visible:ring-1 focus-visible:ring-cyan-400/35 [&::-webkit-details-marker]:hidden"
					>
						<div className="min-w-0 flex-1">{line}</div>
						<span className="mr-1 text-[8px] text-slate-600 transition group-open:rotate-180">
							⌄
						</span>
					</summary>
					<ol className="ml-1.5 border-l border-white/7 py-1 pl-3">
						{previousFrames.map((frame) => (
							<li
								key={frame.id}
								className="flex min-w-0 items-center gap-2 py-1 text-[9px] text-slate-600"
							>
								<span
									className={`size-1 shrink-0 rounded-full ${protocolStatusClass(frame.status)}`}
								/>
								<span className="truncate">{protocolActivityLabel(frame)}</span>
							</li>
						))}
					</ol>
				</details>
			)}
			<VerificationEvidence frame={verificationFrame} />
		</section>
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
}: {
	response: Response;
	onRun(run: CodexRunSnapshot): void;
	onSession(sessionId: string): void;
	onTurn(turnId: string): void;
	onSequence(sequence: number): void;
	onDelta(delta: string): void;
	onProtocol(frame: CodexProtocolFrame): void;
}): Promise<CodexChatResult> {
	if (!response.ok) {
		const value: unknown = await response.json();
		throw new Error(apiErrorMessage(value) ?? "Codex 会话请求失败。");
	}
	if (!response.body) {
		throw new Error("浏览器没有返回 Codex 流式响应。");
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
		throw new Error("Codex 流式响应在完成前中断。");
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
	const [codexSettingsOpen, setCodexSettingsOpen] = useState(false);
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
	const followedSelectionKey = useRef("");
	const reconnectingRunId = useRef<string | null>(null);
	const conversationRevision = useRef(-1);
	const conversationChannel = useRef<BroadcastChannel | null>(null);
	const conversationLogRef = useRef<HTMLDivElement | null>(null);
	const followConversationTail = useRef(true);
	const conversationHydratedRef = useRef(false);
	const activeConversationIdRef = useRef<string | null>(null);
	const latestConversation = useRef<{
		conversationId: string | null;
		sessionId: string | null;
		messages: ChatMessage[];
	}>({ conversationId: null, sessionId: null, messages: [] });

	useEffect(() => {
		let active = true;
		void Promise.allSettled([
			fetchCodexConnection(),
			fetchCodexCapabilities(),
		]).then(([connectionResult, capabilitiesResult]) => {
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
			setCodexChecking(false);
		});
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		latestConversation.current = {
			conversationId: activeConversationId,
			sessionId,
			messages,
		};
		activeConversationIdRef.current = activeConversationId;
	}, [activeConversationId, messages, sessionId]);
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
			activeConversationIdRef.current = target.id;
			setActiveConversationId(target.id);
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
	const codexStatusLabel = codexChecking
		? "检测中"
		: codexConnection?.status === "ready"
			? "Codex 已连接"
			: codexConnection?.status === "login-required"
				? "需要登录"
				: "连接异常";
	const codexStatusClass =
		codexConnection?.status === "ready"
			? "bg-emerald-400"
			: codexConnection?.status === "login-required"
				? "bg-amber-400"
				: codexChecking
					? "bg-slate-500"
					: "bg-red-400";
	const activeConversation =
		conversations.find(
			(conversation) => conversation.id === activeConversationId,
		) ?? null;
	const selectedCodexModel =
		codexCapabilities?.models.find((model) => model.id === codexModel) ?? null;
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

	const persistCurrentConversation = () => {
		const latest = latestConversation.current;
		if (!projectId || !latest.conversationId) return;
		void persistCodexConversation({
			projectId,
			conversationId: latest.conversationId,
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
			sessionId: conversation.sessionId,
			messages: conversation.messages,
		};
		setActiveConversationId(conversation.id);
		setSessionId(conversation.sessionId);
		setMessages(conversation.messages);
		setActiveRunId(null);
		setActiveTurnId(null);
		setActiveRunSequence(0);
		setRequest("");
	};

	const createConversation = (): string | null => {
		if (!conversationHydrated || sending) return null;
		persistCurrentConversation();
		followConversationTail.current = true;
		const conversationId = crypto.randomUUID();
		const now = timestampNow();
		const conversation: CodexConversationThread = {
			id: conversationId,
			title: "新对话",
			sessionId: null,
			messages: [],
			createdAt: now,
			updatedAt: now,
		};
		activeConversationIdRef.current = conversationId;
		latestConversation.current = {
			conversationId,
			sessionId: null,
			messages: [],
		};
		setConversations((current) => [conversation, ...current].slice(0, 50));
		setActiveConversationId(conversationId);
		setSessionId(null);
		setMessages([]);
		setActiveRunId(null);
		setActiveTurnId(null);
		setActiveRunSequence(0);
		setRequest("");
		return conversationId;
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

	const failAssistantMessage = ({
		assistantMessageId,
		error,
		notify = true,
	}: {
		assistantMessageId: string;
		error: unknown;
		notify?: boolean;
	}) => {
		const failure =
			error instanceof Error ? error.message : "Codex 会话请求失败。";
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
			toast.error("Codex 会话失败", { description: failure });
		}
	};

	const submitToCodex = async (nextRequest = request) => {
		const normalizedRequest = nextRequest.trim();
		if (!normalizedRequest) return;
		followConversationTail.current = true;
		if (!conversationHydrated) {
			toast("正在同步智能剪辑历史，请稍候");
			return;
		}
		if (!semanticState.projectId) {
			toast.error("当前没有可交给 Codex 的工程");
			return;
		}
		if (sending) {
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
			const result = await sendCodexTurn({
				projectId: semanticState.projectId,
				message: normalizedRequest,
				messageId: userMessageId,
				context: contextSnapshot.promptContext,
				sessionId,
				options: {
					conversationId: targetConversationId,
					model: codexModel,
					effort: codexEffort,
					mode: codexMode,
					toolProfile: codexToolProfile,
					visualMode: codexVisualMode,
					verificationMode: codexVerificationMode,
				},
				...streamHandlersFor(assistantMessageId),
			});
			completeAssistantMessage({ assistantMessageId, result });
		} catch (error) {
			failAssistantMessage({ assistantMessageId, error });
		} finally {
			setSending(false);
		}
	};

	const stopCodexRun = async () => {
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
	}, [conversationHydrated, messages, sending]);

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
			toast.success("已定位 Codex 引用");
		} catch (error) {
			toast.error("无法定位此引用", {
				description:
					error instanceof Error ? error.message : "Codex 运行环境已失效。",
			});
		}
	};

	const copyContext = async () => {
		try {
			await navigator.clipboard.writeText(contextSnapshot.promptContext);
			toast.success("Codex 上下文已复制");
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
			aria-label="智能剪辑工作台"
		>
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
						onClick={() => setCodexSettingsOpen((open) => !open)}
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
					<AgentSetupPanel compact />
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
							<span className="mb-1 block text-[9px] text-slate-500">模型</span>
							<select
								aria-label="Codex 模型"
								value={codexModel}
								disabled={sending}
								onChange={(event) => {
									const nextModel = event.target.value;
									setCodexModel(nextModel);
									const capability = codexCapabilities?.models.find(
										(model) => model.id === nextModel,
									);
									if (capability && !capability.efforts.includes(codexEffort)) {
										setCodexEffort(
											capability.defaultEffort ??
												capability.efforts[0] ??
												"high",
										);
									}
								}}
								className="h-8 w-full rounded-md border border-white/8 bg-black/25 px-2 text-[10px] text-slate-200 outline-none focus:border-cyan-400/40 disabled:opacity-50"
							>
								{codexCapabilities?.models.length ? (
									codexCapabilities.models.map((model) => (
										<option key={model.id} value={model.id}>
											{model.label || model.id}
										</option>
									))
								) : (
									<option value={codexModel}>{codexModel}</option>
								)}
							</select>
						</label>
						<label className="block">
							<span className="mb-1 block text-[9px] text-slate-500">模式</span>
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
					<details className="group mt-3 border-t border-white/7 pt-2">
						<summary className="cursor-pointer list-none py-1 text-[10px] text-slate-400 outline-none transition hover:text-slate-100 [&::-webkit-details-marker]:hidden">
							高级设置
						</summary>
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
							<button
								type="button"
								disabled={!sessionId}
								onClick={() => void compactCodexContext()}
								className="ml-auto rounded px-2 py-1 text-[9px] text-slate-500 hover:bg-white/[0.05] hover:text-slate-200 disabled:opacity-30"
							>
								压缩上下文
							</button>
						</div>
						<p className="mt-1 text-right text-[8px] text-slate-600">
							{codexCapabilities?.skills.filter((skill) => skill.enabled)
								.length ?? 0}{" "}
							个可用技能 · {codexConnection?.version ?? "版本未知"}
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
					<div className="flex h-full min-h-64 flex-col items-center justify-center px-8 text-center">
						<span className="mb-3 flex size-9 items-center justify-center rounded-xl border border-white/8 bg-white/[0.035] text-slate-300">
							<Sparkles className="size-4" />
						</span>
						<h3 className="text-sm font-medium text-slate-100">想怎么剪？</h3>
						<p className="mt-1 max-w-72 text-[10px] leading-relaxed text-slate-500">
							选中时间轴内容后直接描述修改，Codex 会读取当前工程并执行。
						</p>
						<p className="mt-1 text-[9px] text-slate-600">{selectedLabel}</p>
						<div className="mt-4 flex flex-wrap justify-center gap-1.5">
							{AGENT_REQUEST_PRESETS.map((preset) => (
								<button
									key={preset}
									type="button"
									disabled={sending}
									className="rounded-full border border-white/8 px-2.5 py-1 text-[9px] text-slate-400 transition hover:border-white/15 hover:bg-white/[0.04] hover:text-slate-100 disabled:opacity-40"
									onClick={() => void submitToCodex(preset)}
								>
									{preset}
								</button>
							))}
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
									{message.protocol && message.protocol.length > 0 ? (
										<CodexActivityLine frames={message.protocol} />
									) : message.streaming ? (
										<div className="mb-2 flex items-center gap-2 text-[9px] text-slate-500">
											<span className="size-1.5 animate-pulse rounded-full bg-cyan-300" />
											正在准备工程上下文…
										</div>
									) : null}
									{message.content ? (
										<p className="whitespace-pre-wrap">
											{message.content}
											{message.streaming ? (
												<span
													className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-cyan-300 align-middle"
													aria-label="Codex 正在流式回复"
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
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								void submitToCodex();
							}
						}}
						placeholder={
							!conversationHydrated
								? "正在同步工程会话…"
								: sending
									? "继续补充当前任务…"
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
								onClick={() => setReferencePickerOpen((open) => !open)}
							>
								<Plus className="size-3.5" />
							</button>
							<span
								className="min-w-0 truncate px-1 text-[9px] text-slate-500"
								title={
									activeTurnId
										? `任务 ${activeTurnId} · 已接收 ${activeRunSequence} 个事件`
										: undefined
								}
							>
								{selectedCodexModel?.label ?? codexModel} ·{" "}
								{codexMode === "plan" ? "规划" : "执行"}
							</span>
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
