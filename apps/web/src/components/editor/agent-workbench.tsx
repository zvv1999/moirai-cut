"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	buildAgentContextSnapshot,
	buildElementContextReferences,
	buildMediaContextReferences,
	buildTimelineRangeReference,
	resolveAgentContextTarget,
} from "@/agent/context-references";
import { useAgentContextStore } from "@/agent/context-store";
import { CodexSseDecoder } from "@/agent/codex-sse";
import { toMediaTime, toSeconds } from "@/agent/time";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { useEditor } from "@/editor/use-editor";

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
}

interface ChatMessage {
	id: string;
	role: "user" | "assistant" | "error";
	content: string;
	referenceCount?: number;
	streaming?: boolean;
}

const AGENT_REQUEST_PRESETS = [
	"收紧这段剪辑",
	"统一字幕样式",
	"将所选素材重命名为主角",
] as const;

let messageSequence = 0;

function nextMessageId(): string {
	messageSequence += 1;
	return `codex-message-${messageSequence}`;
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

async function sendCodexTurn({
	projectId,
	message,
	context,
	sessionId,
	onSession,
	onDelta,
}: {
	projectId: string;
	message: string;
	context: string;
	sessionId: string | null;
	onSession(sessionId: string): void;
	onDelta(delta: string): void;
}): Promise<CodexChatResult> {
	const response = await fetch("/api/codex/chat", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			projectId,
			message,
			context,
			...(sessionId ? { sessionId } : {}),
		}),
	});
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
			if (
				event.event === "session" &&
				"sessionId" in value &&
				typeof value.sessionId === "string"
			) {
				onSession(value.sessionId);
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

export function AgentWorkbench() {
	const editor = useEditor();
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
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [sending, setSending] = useState(false);
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [codexConnection, setCodexConnection] =
		useState<CodexConnection | null>(null);
	const [codexSettingsOpen, setCodexSettingsOpen] = useState(false);
	const [codexChecking, setCodexChecking] = useState(true);
	const [referencePickerOpen, setReferencePickerOpen] = useState(false);
	const [followSelection, setFollowSelection] = useState(true);
	const [referencePickerTab, setReferencePickerTab] = useState<
		"timeline" | "library"
	>("timeline");
	const [referenceSearch, setReferenceSearch] = useState("");
	const [rangeStartInput, setRangeStartInput] = useState("");
	const [rangeEndInput, setRangeEndInput] = useState("");
	const followedSelectionKey = useRef("");

	const refreshCodexConnection = useCallback(async () => {
		setCodexChecking(true);
		try {
			setCodexConnection(await fetchCodexConnection());
		} catch {
			setCodexConnection(unavailableCodexConnection());
		} finally {
			setCodexChecking(false);
		}
	}, []);

	useEffect(() => {
		let active = true;
		void fetchCodexConnection()
			.then((connection) => {
				if (active) setCodexConnection(connection);
			})
			.catch(() => {
				if (active) setCodexConnection(unavailableCodexConnection());
			})
			.finally(() => {
				if (active) setCodexChecking(false);
			});
		return () => {
			active = false;
		};
	}, []);

	const semanticState = editor.agent.getState();
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
	const semanticTextCount = semanticState.tracks.reduce(
		(total, track) =>
			total +
			track.elements.filter((element) => element.type === "text").length,
		0,
	);
	const semanticKeyframeCount = semanticState.tracks.reduce(
		(total, track) =>
			total +
			track.elements.reduce(
				(elementTotal, element) =>
					elementTotal +
					Object.values(element.animations ?? {}).reduce(
						(channelTotal, keys) => channelTotal + keys.length,
						0,
					),
				0,
			),
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

	const submitToCodex = async (nextRequest = request) => {
		const normalizedRequest = nextRequest.trim();
		if (!normalizedRequest || sending) return;
		if (!semanticState.projectId) {
			toast.error("当前没有可交给 Codex 的工程");
			return;
		}
		const referenceCount = contextSnapshot.references.length;
		const assistantMessageId = nextMessageId();
		setMessages((current) => [
			...current,
			{
				id: nextMessageId(),
				role: "user",
				content: normalizedRequest,
				...(referenceCount > 0 ? { referenceCount } : {}),
			},
			{
				id: assistantMessageId,
				role: "assistant",
				content: "",
				streaming: true,
			},
		]);
		setRequest("");
		setSending(true);
		try {
			const result = await sendCodexTurn({
				projectId: semanticState.projectId,
				message: normalizedRequest,
				context: contextSnapshot.promptContext,
				sessionId,
				onSession: setSessionId,
				onDelta: (delta) => {
					setMessages((current) =>
						current.map((message) =>
							message.id === assistantMessageId
								? { ...message, content: `${message.content}${delta}` }
								: message,
						),
					);
				},
			});
			setSessionId(result.sessionId);
			setMessages((current) =>
				current.map((message) =>
					message.id === assistantMessageId
						? {
								...message,
								content: result.message,
								streaming: false,
							}
						: message,
				),
			);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Codex 会话请求失败。";
			setMessages((current) =>
				current.map((item) =>
					item.id === assistantMessageId
						? {
								...item,
								role: "error",
								content: message,
								streaming: false,
							}
						: item,
				),
			);
			toast.error("Codex 会话失败", { description: message });
		} finally {
			setSending(false);
		}
	};

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
					error instanceof Error ? error.message : "Codex Path 已失效。",
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
			className="flex h-[min(78vh,760px)] min-h-[560px] flex-col overflow-hidden bg-[#111315]"
			aria-label="智能剪辑工作台"
		>
			<header className="flex h-14 shrink-0 items-center justify-between border-b border-white/8 px-5">
				<div className="flex items-center gap-3">
					<span className="relative flex size-8 items-center justify-center rounded-lg bg-cyan-400 text-sm font-black text-slate-950">
						AI
						<span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-[#111315] bg-emerald-400" />
					</span>
					<div>
						<div className="text-sm font-semibold tracking-tight">智能剪辑</div>
						<div className="text-[10px] text-slate-400">
							Codex 直接理解并执行
						</div>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						aria-label="选中即引用"
						aria-pressed={followSelection}
						onClick={() => setFollowSelection((enabled) => !enabled)}
						className={`flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[9px] transition-colors ${
							followSelection
								? "border-cyan-400/25 bg-cyan-400/8 text-cyan-200"
								: "border-white/10 text-slate-500 hover:text-slate-200"
						}`}
						title="打开后继续点击时间轴素材，会自动加入本轮上下文"
					>
						<span
							className={`size-1.5 rounded-full ${
								followSelection ? "bg-cyan-300" : "bg-slate-600"
							}`}
						/>
						选中即引用
					</button>
					<button
						type="button"
						aria-label="配置 Codex 连接"
						aria-expanded={codexSettingsOpen}
						className="flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.035] px-2.5 py-1 text-[10px] text-slate-300 transition hover:border-cyan-400/35 hover:text-white"
						onClick={() => setCodexSettingsOpen((open) => !open)}
					>
						<span
							className={`size-1.5 rounded-full ${codexStatusClass}`}
							aria-hidden="true"
						/>
						{codexStatusLabel}
					</button>
					<div className="rounded-full border border-white/8 bg-white/[0.035] px-2.5 py-1 font-mono text-[10px] text-slate-400">
						{sessionId ? `会话 ${sessionId.slice(-8)}` : selectedLabel}
					</div>
				</div>
			</header>

			{codexSettingsOpen ? (
				<section
					aria-label="Codex 连接设置"
					className="shrink-0 border-b border-white/8 bg-[#16191c] px-5 py-4"
				>
					<div className="mb-3 flex items-start justify-between gap-4">
						<div>
							<h3 className="text-xs font-semibold text-slate-100">
								Codex 连接
							</h3>
							<p className="mt-0.5 text-[10px] text-slate-500">
								当前使用 ChatGPT/Codex 桌面应用内置 CLI。
							</p>
						</div>
						<button
							type="button"
							className="rounded-md border border-white/10 px-2.5 py-1 text-[10px] text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:opacity-50"
							disabled={codexChecking}
							onClick={() => void refreshCodexConnection()}
						>
							{codexChecking ? "检测中…" : "重新检测"}
						</button>
					</div>
					<div className="grid grid-cols-2 gap-2">
						<div className="rounded-lg border border-cyan-400/35 bg-cyan-400/[0.06] px-3 py-2">
							<div className="flex items-center justify-between">
								<span className="text-[11px] font-medium text-cyan-200">
									Path 模式
								</span>
								<span className="rounded bg-cyan-400/12 px-1.5 py-0.5 text-[8px] text-cyan-300">
									当前
								</span>
							</div>
							<p className="mt-1 text-[9px] text-slate-500">
								复用桌面登录，无需 API Key
							</p>
						</div>
						<div
							aria-disabled="true"
							className="rounded-lg border border-white/6 bg-black/15 px-3 py-2 opacity-45"
						>
							<div className="flex items-center justify-between">
								<span className="text-[11px] font-medium text-slate-300">
									API 模式
								</span>
								<span className="text-[8px] text-slate-500">待接入</span>
							</div>
							<p className="mt-1 text-[9px] text-slate-600">
								使用服务端 API Key
							</p>
						</div>
					</div>
					<label className="mt-3 block">
						<span className="mb-1 block text-[9px] font-medium tracking-[0.1em] text-slate-500 uppercase">
							Codex Path
						</span>
						<input
							aria-label="Codex Path"
							readOnly
							value={
								codexConnection?.path ??
								"/Applications/ChatGPT.app/Contents/Resources/codex"
							}
							className="h-8 w-full rounded-md border border-white/8 bg-black/25 px-2.5 font-mono text-[10px] text-slate-300 outline-none"
						/>
					</label>
					<div className="mt-2 flex items-center justify-between gap-3 text-[9px]">
						<span className="min-w-0 truncate text-slate-500">
							{codexConnection?.message ?? "正在检测桌面内置 Codex CLI…"}
						</span>
						<span className="shrink-0 font-mono text-slate-500">
							{codexConnection?.version ?? "—"}
						</span>
					</div>
				</section>
			) : null}

			<div
				role="log"
				aria-label="智能剪辑对话记录"
				aria-live="polite"
				className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5"
			>
				<div className="flex max-w-[82%] items-start gap-2.5">
					<span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-cyan-400 text-[9px] font-black text-slate-950">
						AI
					</span>
					<div className="rounded-2xl rounded-tl-sm border border-white/8 bg-white/[0.045] px-3.5 py-3 text-xs leading-relaxed text-slate-200">
						<p>
							本会话由 Codex 直接处理。告诉我你想怎么剪，我会直接操作当前工程。
						</p>
						<p className="mt-1 text-[10px] text-slate-500">
							可用“＋”从时间线或素材库精确引用上下文。
						</p>
						<div className="mt-2 flex flex-wrap gap-1.5">
							{AGENT_REQUEST_PRESETS.map((preset) => (
								<button
									key={preset}
									type="button"
									disabled={sending}
									className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-300 disabled:opacity-40"
									onClick={() => void submitToCodex(preset)}
								>
									{preset}
								</button>
							))}
						</div>
					</div>
				</div>

				{visibleReferences.length > 0 ? (
					<div
						className="ml-8 max-w-[84%] rounded-xl border border-cyan-400/15 bg-cyan-400/[0.035] p-2.5"
						aria-label="Codex 上下文引用"
					>
						<div className="mb-2 flex items-center justify-between gap-2">
							<span className="text-[9px] font-semibold tracking-[0.14em] text-cyan-300 uppercase">
								已引用 {visibleReferences.length} 项上下文
							</span>
							<div className="flex items-center gap-2">
								<button
									type="button"
									className="text-[9px] text-slate-400 hover:text-slate-100"
									onClick={() => void copyContext()}
								>
									复制上下文
								</button>
								<button
									type="button"
									className="text-[9px] text-slate-400 hover:text-slate-100"
									onClick={() => void copyContextJson()}
								>
									复制 JSON
								</button>
								<button
									type="button"
									className="text-[9px] text-slate-500 hover:text-red-300"
									onClick={clearReferences}
								>
									清空
								</button>
							</div>
						</div>
						<ul className="space-y-1">
							{visibleReferences.map((reference) => (
								<li
									key={reference.uri}
									className="flex min-w-0 items-center gap-1 rounded-lg border border-white/7 bg-black/20 px-2 py-1.5"
								>
									<button
										type="button"
										className="min-w-0 flex-1 text-left"
										onClick={() => revealReference(reference.uri)}
										title={reference.uri}
									>
										<span className="block truncate text-[9px] font-medium">
											{reference.label}
										</span>
										<span className="block truncate font-mono text-[7px] text-slate-600">
											{reference.uri}
										</span>
									</button>
									<button
										type="button"
										className="shrink-0 px-1 text-[11px] opacity-35 hover:opacity-100"
										onClick={() => removeReference(reference.uri)}
										aria-label={`移除引用 ${reference.label}`}
									>
										×
									</button>
								</li>
							))}
						</ul>
					</div>
				) : null}

				<div className="ml-8 flex max-w-[84%] flex-wrap gap-x-2 gap-y-1 rounded-lg border border-white/6 bg-white/[0.025] px-2.5 py-2 font-mono text-[8px] text-slate-500">
					<span>{semanticState.media.length} 个媒体</span>
					<span>{semanticState.tracks.length} 条轨道</span>
					<span>{semanticElementCount} 个素材</span>
					<span>{semanticTextCount} 个文本</span>
					<span>{semanticKeyframeCount} 个关键帧</span>
					<span>{semanticState.bookmarks.length} 个标记</span>
				</div>

				{messages.map((message) =>
					message.role === "user" ? (
						<div
							key={message.id}
							className="ml-auto max-w-[78%] rounded-2xl rounded-tr-sm bg-cyan-400 px-3.5 py-2.5 text-xs leading-relaxed text-slate-950"
						>
							<p className="whitespace-pre-wrap">{message.content}</p>
							{message.referenceCount ? (
								<p className="mt-1 text-[8px] opacity-60">
									附带 {message.referenceCount} 项 Codex Path
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
										: "bg-cyan-400 text-slate-950"
								}`}
							>
								{message.role === "error" ? "!" : "AI"}
							</span>
							<div
								className={`whitespace-pre-wrap rounded-2xl rounded-tl-sm border px-3.5 py-3 text-xs leading-relaxed ${
									message.role === "error"
										? "border-red-500/25 bg-red-500/8 text-red-200"
										: "border-white/8 bg-white/[0.045] text-slate-200"
								}`}
							>
								{message.streaming && !message.content ? (
									<span className="flex items-center gap-2 text-cyan-200">
										<span className="flex gap-1">
											<span className="size-1 animate-bounce rounded-full bg-cyan-300" />
											<span className="size-1 animate-bounce rounded-full bg-cyan-300 [animation-delay:120ms]" />
											<span className="size-1 animate-bounce rounded-full bg-cyan-300 [animation-delay:240ms]" />
										</span>
										Codex 正在处理
									</span>
								) : (
									<>
										{message.content}
										{message.streaming ? (
											<span
												className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-cyan-300 align-middle"
												aria-label="Codex 正在流式回复"
											/>
										) : null}
									</>
								)}
							</div>
						</div>
					),
				)}
			</div>

			{referencePickerOpen ? (
				<section
					className="mx-4 mb-2 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#181b1e] shadow-xl"
					aria-label="上下文选择器"
				>
					<div className="flex items-center justify-between border-b border-white/8 px-3 py-2">
						<div>
							<div className="text-[11px] font-semibold">添加上下文</div>
							<div className="text-[9px] text-slate-500">
								选择后会以 Codex Path 随消息发送
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
				className="shrink-0 border-t border-white/8 bg-[#151719] px-4 py-3"
				onSubmit={(event) => {
					event.preventDefault();
					void submitToCodex();
				}}
			>
				{visibleReferences.length > 0 ? (
					<div className="mb-2 flex items-center gap-1.5 overflow-x-auto">
						{visibleReferences.map((reference) => (
							<button
								key={reference.uri}
								type="button"
								className="shrink-0 rounded-full border border-cyan-400/20 bg-cyan-400/[0.06] px-2 py-1 text-[9px] text-cyan-200"
								onClick={() => removeReference(reference.uri)}
								title={`移除 ${reference.label}`}
							>
								@
								{reference.kind === "media"
									? "素材库"
									: reference.kind === "range"
										? "片段"
										: "时间线"}{" "}
								{reference.label} ×
							</button>
						))}
					</div>
				) : null}
				<div className="flex items-end gap-2 rounded-xl border border-white/10 bg-black/20 p-2 focus-within:border-cyan-400/35">
					<button
						type="button"
						aria-label="添加上下文引用"
						aria-pressed={referencePickerOpen}
						className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-lg transition ${
							referencePickerOpen
								? "bg-cyan-400 text-slate-950"
								: "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
						}`}
						onClick={() => setReferencePickerOpen((open) => !open)}
					>
						+
					</button>
					<textarea
						aria-label="描述智能剪辑需求"
						className="max-h-28 min-h-8 flex-1 resize-none bg-transparent px-1 py-1.5 text-xs leading-relaxed text-slate-100 outline-none placeholder:text-slate-600"
						value={request}
						rows={1}
						disabled={sending}
						onChange={(event) => setRequest(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								void submitToCodex();
							}
						}}
						placeholder={
							sending ? "Codex 正在处理当前消息…" : "描述你想要的剪辑效果…"
						}
					/>
					<button
						type="submit"
						aria-label="发送智能剪辑需求"
						disabled={!request.trim() || sending}
						className="flex h-8 shrink-0 items-center rounded-lg bg-cyan-400 px-3 text-[10px] font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-30"
					>
						{sending ? "处理中" : "发送"}
					</button>
				</div>
				<div className="mt-1.5 flex items-center justify-between px-1 text-[8px] text-slate-600">
					<span>Enter 发送 · Shift + Enter 换行</span>
					<span>本会话由 Codex 直接处理 · 不运行本地计划或质检</span>
				</div>
			</form>
		</section>
	);
}
