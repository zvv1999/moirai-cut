"use client";

import {
	AppWindow,
	Check,
	CircleAlert,
	Download,
	LoaderCircle,
	Pencil,
	RefreshCw,
	Save,
	Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { endpointModeIntent, validateEndpointDraft } from "./agent-setup-form";
import { cn } from "@/utils/ui";

type AgentProviderId = "codex" | "claude";
type AgentEndpointMode = "native" | "custom";
type AgentEndpointAuth = "api-key" | "bearer";
type CheckStatus = "pass" | "warning" | "fail";

export interface AgentProvider {
	provider: AgentProviderId;
	label: string;
	source: "configured" | "environment" | "desktop" | "path";
	binary: string;
	status: "ready" | "login-required" | "unavailable" | "invalid";
	executable: boolean;
	authenticated: boolean;
	version: string | null;
	message: string;
	mcpInstalled: boolean;
	capabilities: {
		browserChat: boolean;
		mcp: boolean;
		sharedConversation: boolean;
	};
}

export interface AgentSetupSnapshot {
	checkedAt: string;
	score: number;
	ready: boolean;
	blocking: string[];
	recommendedProvider: AgentProviderId | null;
	activeProvider: AgentProviderId | null;
	endpoints: Record<
		AgentProviderId,
		{
			mode: AgentEndpointMode;
			custom: {
				baseUrl: string;
				auth: AgentEndpointAuth;
				hasCredential: boolean;
			} | null;
		}
	>;
	providers: AgentProvider[];
	checks: Array<{
		id: string;
		label: string;
		status: CheckStatus;
		detail: string;
		action?: string;
	}>;
}

interface AgentSetupPanelProps {
	compact?: boolean;
	onReadyChange?: (ready: boolean) => void;
	onProviderChange?: (provider: AgentProviderId) => void;
	onEndpointChange?: (provider: AgentProviderId) => void;
}

let cachedSnapshot: AgentSetupSnapshot | null = null;
let cachedAt = 0;
let pendingSnapshot: Promise<AgentSetupSnapshot> | null = null;
const CACHE_MILLISECONDS = 30_000;

export function isAgentSetupSnapshot(
	value: unknown,
): value is AgentSetupSnapshot {
	return (
		typeof value === "object" &&
		value !== null &&
		"score" in value &&
		typeof value.score === "number" &&
		"ready" in value &&
		typeof value.ready === "boolean" &&
		"providers" in value &&
		Array.isArray(value.providers) &&
		"endpoints" in value &&
		typeof value.endpoints === "object" &&
		value.endpoints !== null &&
		"activeProvider" in value &&
		(value.activeProvider === null ||
			value.activeProvider === "codex" ||
			value.activeProvider === "claude") &&
		"checks" in value &&
		Array.isArray(value.checks)
	);
}

async function requestSnapshot(force = false): Promise<AgentSetupSnapshot> {
	if (!force && cachedSnapshot && Date.now() - cachedAt < CACHE_MILLISECONDS) {
		return cachedSnapshot;
	}
	if (!force && pendingSnapshot) return pendingSnapshot;
	const request = fetch("/api/agent/setup", { cache: "no-store" }).then(
		async (response) => {
			const value: unknown = await response.json();
			if (!response.ok) {
				throw new Error(
					typeof value === "object" &&
						value !== null &&
						"error" in value &&
						typeof value.error === "string"
						? value.error
						: "环境检查失败",
				);
			}
			if (!isAgentSetupSnapshot(value)) {
				throw new Error("环境检查返回了无效数据");
			}
			cachedSnapshot = value;
			cachedAt = Date.now();
			return value;
		},
	);
	pendingSnapshot = request;
	try {
		return await request;
	} finally {
		pendingSnapshot = null;
	}
}

function sourceLabel(source: AgentProvider["source"]): string {
	if (source === "configured") return "手动配置";
	if (source === "desktop") return "桌面 App";
	if (source === "environment") return "已配置";
	return "本机 PATH";
}

function providerStatus(provider: AgentProvider): {
	label: string;
	className: string;
} {
	if (provider.status === "ready") {
		return {
			label: "已登录",
			className: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300",
		};
	}
	if (provider.status === "login-required") {
		return {
			label: "需要登录",
			className: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
		};
	}
	return {
		label: "未检测到",
		className: "bg-muted text-muted-foreground",
	};
}

function checkDot(status: CheckStatus): string {
	if (status === "pass") return "bg-emerald-500";
	if (status === "warning") return "bg-amber-400";
	return "bg-red-500";
}

export function AgentSetupPanel({
	compact = false,
	onReadyChange,
	onProviderChange,
	onEndpointChange,
}: AgentSetupPanelProps) {
	const [snapshot, setSnapshot] = useState<AgentSetupSnapshot | null>(
		cachedSnapshot,
	);
	const [loading, setLoading] = useState(!cachedSnapshot);
	const [installing, setInstalling] = useState<AgentProviderId | null>(null);
	const [mutating, setMutating] = useState<AgentProviderId | null>(null);
	const [editingProvider, setEditingProvider] =
		useState<AgentProviderId | null>(null);
	const [binaryInput, setBinaryInput] = useState("");
	const [editingEndpoint, setEditingEndpoint] = useState(false);
	const [endpointUrl, setEndpointUrl] = useState("");
	const [endpointAuth, setEndpointAuth] =
		useState<AgentEndpointAuth>("api-key");
	const [endpointCredential, setEndpointCredential] = useState("");
	const [endpointAttempted, setEndpointAttempted] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(
		async (force = false) => {
			setLoading(true);
			setError(null);
			try {
				const next = await requestSnapshot(force);
				setSnapshot(next);
				onReadyChange?.(next.ready);
			} catch (nextError) {
				setError(
					nextError instanceof Error ? nextError.message : "环境检查失败",
				);
			} finally {
				setLoading(false);
			}
		},
		[onReadyChange],
	);

	useEffect(() => {
		void refresh(false);
	}, [refresh]);

	const activeConnection = snapshot?.providers.find(
		(provider) => provider.provider === snapshot.activeProvider,
	);
	const activeEndpoint = snapshot?.activeProvider
		? snapshot.endpoints[snapshot.activeProvider]
		: null;

	useEffect(() => {
		const custom = activeEndpoint?.custom;
		setEndpointUrl(custom?.baseUrl ?? "");
		setEndpointAuth(custom?.auth ?? "api-key");
		setEndpointCredential("");
		setEndpointAttempted(false);
		setEditingEndpoint(false);
	}, [activeEndpoint, snapshot?.activeProvider]);
	const endpointValidation = useMemo(
		() =>
			validateEndpointDraft({
				baseUrl: endpointUrl,
				credential: endpointCredential,
				hasStoredCredential: Boolean(activeEndpoint?.custom?.hasCredential),
			}),
		[activeEndpoint?.custom?.hasCredential, endpointCredential, endpointUrl],
	);
	const browserReady = activeConnection?.status === "ready";
	const appReady = snapshot?.providers.some(
		(provider) => provider.status === "ready" && provider.mcpInstalled,
	);
	const allChecksPassed = snapshot?.checks.every(
		(check) => check.status === "pass",
	);
	const scoreTone = useMemo(() => {
		if (!snapshot) return "text-muted-foreground";
		if (snapshot.score >= 85) return "text-emerald-600 dark:text-emerald-300";
		if (snapshot.score >= 70) return "text-cyan-600 dark:text-cyan-300";
		return "text-amber-700 dark:text-amber-300";
	}, [snapshot]);

	const installMcp = async (provider: AgentProviderId) => {
		setInstalling(provider);
		setMessage(null);
		setError(null);
		try {
			const response = await fetch("/api/agent/setup", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ action: "install-mcp", provider }),
			});
			const value: unknown = await response.json();
			if (!response.ok) {
				throw new Error(
					typeof value === "object" &&
						value !== null &&
						"error" in value &&
						typeof value.error === "string"
						? value.error
						: "MCP 安装失败",
				);
			}
			setMessage(
				typeof value === "object" &&
					value !== null &&
					"message" in value &&
					typeof value.message === "string"
					? value.message
					: "Moirai Cut MCP 已安装。",
			);
			await refresh(true);
		} catch (nextError) {
			setError(nextError instanceof Error ? nextError.message : "MCP 安装失败");
		} finally {
			setInstalling(null);
		}
	};

	const mutateProvider = async (
		body:
			| { action: "select-provider"; provider: AgentProviderId }
			| {
					action: "configure-provider";
					provider: AgentProviderId;
					binary: string;
			  }
			| {
					action: "configure-endpoint";
					baseUrl: string;
					auth: AgentEndpointAuth;
					credential?: string;
			  }
			| {
					action: "select-endpoint";
					mode: AgentEndpointMode;
			  },
	) => {
		const affectedProvider =
			"provider" in body
				? body.provider
				: (snapshot?.activeProvider ?? "codex");
		setMutating(affectedProvider);
		setMessage(null);
		setError(null);
		try {
			const response = await fetch("/api/agent/setup", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
			const value: unknown = await response.json();
			if (!response.ok) {
				throw new Error(
					typeof value === "object" &&
						value !== null &&
						"error" in value &&
						typeof value.error === "string"
						? value.error
						: "Agent 配置失败",
				);
			}
			if (!isAgentSetupSnapshot(value)) {
				throw new Error("Agent 配置返回了无效数据");
			}
			cachedSnapshot = value;
			cachedAt = Date.now();
			setSnapshot(value);
			if (value.activeProvider) onProviderChange?.(value.activeProvider);
			setEditingProvider(null);
			if (
				body.action === "configure-endpoint" ||
				body.action === "select-endpoint"
			) {
				setEditingEndpoint(false);
				setEndpointCredential("");
				setEndpointAttempted(false);
				onEndpointChange?.(affectedProvider);
			}
			setMessage(
				body.action === "select-provider"
					? `已切换到 ${body.provider === "codex" ? "Codex" : "Claude Code"}。`
					: body.action === "configure-provider"
						? `${body.provider === "codex" ? "Codex" : "Claude Code"} 路径已验证并保存。`
						: body.action === "configure-endpoint"
							? "共享网关已保存，模型目录将自动更新。"
							: `已切换到${body.mode === "native" ? "本机账号" : "第三方端点"}。`,
			);
		} catch (nextError) {
			setError(
				nextError instanceof Error ? nextError.message : "Agent 配置失败",
			);
		} finally {
			setMutating(null);
		}
	};

	const requestEndpointMode = (mode: AgentEndpointMode) => {
		const provider = snapshot?.activeProvider;
		if (!provider || !activeEndpoint || mutating !== null) return;
		if (mode === activeEndpoint.mode) {
			if (editingEndpoint) {
				setEndpointAttempted(false);
				setEditingEndpoint(false);
			}
			return;
		}
		const intent = endpointModeIntent({
			mode,
			hasConfiguredCustom: Boolean(activeEndpoint.custom?.hasCredential),
		});
		setEndpointAttempted(false);
		setEditingEndpoint(intent.openEditor);
		if (intent.mutation) {
			void mutateProvider(intent.mutation);
		}
	};

	return (
		<section
			aria-label="Agent 部署与连接"
			className={cn(
				"min-w-0 overflow-hidden rounded-xl border border-border/80 bg-background/75 text-foreground",
				compact ? "mt-3 p-2.5" : "p-4",
			)}
		>
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="flex items-center gap-2">
						<Sparkles className="size-4 text-cyan-500" />
						<h3
							className={cn(
								"font-semibold",
								compact ? "text-[11px]" : "text-sm",
							)}
						>
							智能剪辑环境
						</h3>
						{snapshot ? (
							<span
								className={cn("text-xs font-semibold tabular-nums", scoreTone)}
							>
								{snapshot.score}%
							</span>
						) : null}
					</div>
					<p
						className={cn(
							"mt-1 text-muted-foreground",
							compact ? "text-[9px]" : "text-xs",
						)}
					>
						可复用本机登录，也可配置自己的第三方端点。
					</p>
				</div>
				<button
					type="button"
					disabled={loading}
					onClick={() => void refresh(true)}
					className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
				>
					<RefreshCw className={cn("size-3", loading && "animate-spin")} />
					重新检测
				</button>
			</div>

			{snapshot ? (
				<div className="mt-3 rounded-xl border border-border/70 bg-muted/20 p-2.5">
					<div className="flex items-center justify-between gap-3">
						<div>
							<p className="text-[10px] font-medium">选择对话 Agent</p>
							<p className="mt-0.5 text-[8px] text-muted-foreground">
								切换只影响新会话；当前任务会继续使用原 Agent。
							</p>
						</div>
						{mutating ? (
							<LoaderCircle className="size-3.5 animate-spin text-cyan-500" />
						) : null}
					</div>

					<div
						role="radiogroup"
						aria-label="当前对话 Agent"
						className="mt-2 grid grid-cols-2 gap-1.5"
					>
						{snapshot.providers.map((provider) => {
							const selected = snapshot.activeProvider === provider.provider;
							const endpoint = snapshot.endpoints[provider.provider];
							const status =
								endpoint.mode === "custom" && endpoint.custom?.hasCredential
									? "第三方端点"
									: provider.status === "ready"
										? "已登录"
										: provider.executable
											? "可配置"
											: "未安装";
							return (
								<button
									key={provider.provider}
									type="button"
									role="radio"
									aria-checked={selected}
									aria-label={`选择 ${provider.label}`}
									disabled={!provider.executable || mutating !== null}
									onClick={() => {
										if (selected) return;
										void mutateProvider({
											action: "select-provider",
											provider: provider.provider,
										});
									}}
									className={cn(
										"group flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition",
										selected
											? "border-cyan-500/45 bg-cyan-500/8 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.05)]"
											: "border-border/70 bg-background/55 hover:border-border hover:bg-background/80",
										"disabled:cursor-not-allowed disabled:opacity-40",
									)}
								>
									<span
										className={cn(
											"flex size-6 shrink-0 items-center justify-center rounded-md text-[9px] font-semibold",
											selected
												? "bg-cyan-500 text-slate-950"
												: "bg-muted text-muted-foreground",
										)}
									>
										{provider.provider === "codex" ? "CX" : "CL"}
									</span>
									<span className="min-w-0 flex-1">
										<span className="block truncate text-[10px] font-medium">
											{provider.provider === "claude" ? "Claude Code" : "Codex"}
										</span>
										<span className="block truncate text-[8px] text-muted-foreground">
											{status}
										</span>
									</span>
									<span
										className={cn(
											"size-2 rounded-full border",
											selected
												? "border-cyan-300 bg-cyan-300"
												: "border-border",
										)}
									/>
								</button>
							);
						})}
					</div>

					{snapshot.activeProvider && activeEndpoint ? (
						<div className="mt-3 border-t border-border/60 pt-2.5">
							<div className="mb-1.5 flex items-center justify-between gap-2">
								<span className="text-[9px] font-medium text-muted-foreground">
									运行方式
								</span>
								<span className="text-[8px] text-muted-foreground">
									{snapshot.activeProvider === "codex"
										? "Codex CLI"
										: "Claude Code CLI"}
								</span>
							</div>
							<div
								role="radiogroup"
								aria-label="运行方式"
								className="grid grid-cols-2 gap-1.5"
							>
								<button
									type="button"
									role="radio"
									aria-label="使用本机账号"
									aria-checked={
										!editingEndpoint && activeEndpoint.mode === "native"
									}
									disabled={mutating !== null}
									onClick={() => requestEndpointMode("native")}
									className={cn(
										"rounded-lg border px-2.5 py-2 text-left transition",
										!editingEndpoint && activeEndpoint.mode === "native"
											? "border-cyan-500/40 bg-cyan-500/7"
											: "border-border/70 bg-background/45 hover:bg-background/75",
									)}
								>
									<span className="block text-[10px] font-medium">
										本机账号
									</span>
									<span className="mt-0.5 block text-[8px] text-muted-foreground">
										复用现有登录
									</span>
								</button>
								<button
									type="button"
									role="radio"
									aria-label="使用第三方端点"
									aria-checked={
										editingEndpoint || activeEndpoint.mode === "custom"
									}
									disabled={mutating !== null}
									onClick={() => requestEndpointMode("custom")}
									className={cn(
										"rounded-lg border px-2.5 py-2 text-left transition",
										editingEndpoint || activeEndpoint.mode === "custom"
											? "border-cyan-500/40 bg-cyan-500/7"
											: "border-border/70 bg-background/45 hover:bg-background/75",
									)}
								>
									<span className="block text-[10px] font-medium">
										第三方端点
									</span>
									<span className="mt-0.5 block truncate text-[8px] text-muted-foreground">
										{activeEndpoint.custom?.hasCredential
											? "Codex 与 Claude 共用"
											: "使用自己的 API"}
									</span>
								</button>
							</div>

							{!editingEndpoint &&
							activeEndpoint.mode === "custom" &&
							activeEndpoint.custom ? (
								<div className="mt-2 flex min-w-0 items-center gap-2 rounded-lg border border-border/60 bg-background/45 px-2.5 py-2">
									<div className="min-w-0 flex-1">
										<p className="truncate text-[9px] font-medium">
											共享 Agent 网关
										</p>
										<p className="mt-0.5 truncate text-[8px] text-muted-foreground">
											{activeEndpoint.custom.baseUrl}
										</p>
									</div>
									<button
										type="button"
										onClick={() => {
											setEndpointAttempted(false);
											setEditingEndpoint(true);
										}}
										className="shrink-0 rounded-md px-2 py-1 text-[8px] text-cyan-700 hover:bg-cyan-500/10 dark:text-cyan-300"
									>
										编辑配置
									</button>
								</div>
							) : null}

							{editingEndpoint ? (
								<form
									aria-label="第三方端点配置"
									className="mt-2 rounded-xl border border-cyan-500/20 bg-background/65 p-2.5"
									onSubmit={(event) => {
										event.preventDefault();
										setEndpointAttempted(true);
										if (!endpointValidation.canSubmit) return;
										void mutateProvider({
											action: "configure-endpoint",
											baseUrl: endpointUrl.trim(),
											auth: endpointAuth,
											...(endpointCredential
												? { credential: endpointCredential }
												: {}),
										});
									}}
								>
									<div className="mb-2 flex items-start justify-between gap-2">
										<div>
											<p className="text-[10px] font-medium">
												配置共享 Agent 网关
											</p>
											<p className="mt-0.5 max-w-56 text-[8px] leading-relaxed text-muted-foreground">
												{
													"Codex 与 Claude 共用；需同时兼容 OpenAI Responses 兼容接口与 Anthropic Messages 兼容接口。"
												}
											</p>
										</div>
										<span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[8px] text-cyan-700 dark:text-cyan-300">
											本机保存
										</span>
									</div>
									<div className="grid gap-2">
										<label className="text-[8px] text-muted-foreground">
											Base URL
											<input
												value={endpointUrl}
												onChange={(event) => setEndpointUrl(event.target.value)}
												aria-invalid={Boolean(
													endpointAttempted &&
													endpointValidation.errors.baseUrl,
												)}
												aria-describedby="endpoint-base-url-error"
												placeholder="https://gateway.example.com/v1"
												className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-[9px] text-foreground outline-none focus:border-cyan-500/50 aria-invalid:border-red-500/60"
											/>
											{endpointAttempted &&
											endpointValidation.errors.baseUrl ? (
												<span
													id="endpoint-base-url-error"
													className="mt-1 block text-[8px] text-red-500"
												>
													{endpointValidation.errors.baseUrl}
												</span>
											) : null}
										</label>
										<label className="text-[8px] text-muted-foreground">
											认证方式
											<select
												value={endpointAuth}
												onChange={(event) =>
													setEndpointAuth(
														event.target.value as AgentEndpointAuth,
													)
												}
												className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-[9px] text-foreground"
											>
												<option value="api-key">API Key</option>
												<option value="bearer">Bearer Token</option>
											</select>
										</label>
										<label className="text-[8px] text-muted-foreground">
											{endpointAuth === "bearer" ? "访问令牌" : "API Key"}
											<input
												type="password"
												autoComplete="new-password"
												value={endpointCredential}
												onChange={(event) =>
													setEndpointCredential(event.target.value)
												}
												aria-invalid={Boolean(
													endpointAttempted &&
													endpointValidation.errors.credential,
												)}
												aria-describedby="endpoint-credential-error"
												placeholder={
													activeEndpoint.custom?.hasCredential
														? "已安全保存；留空保持不变"
														: "仅保存在本机"
												}
												className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-[9px] text-foreground outline-none focus:border-cyan-500/50 aria-invalid:border-red-500/60"
											/>
											{endpointAttempted &&
											endpointValidation.errors.credential ? (
												<span
													id="endpoint-credential-error"
													className="mt-1 block text-[8px] text-red-500"
												>
													{endpointValidation.errors.credential}
												</span>
											) : null}
										</label>
									</div>
									<p className="mt-2 text-[8px] leading-relaxed text-muted-foreground">
										密钥只保存在本机服务端，不会返回浏览器或写入命令行参数。
									</p>
									<div className="mt-2.5 flex justify-end gap-1.5">
										<button
											type="button"
											onClick={() => {
												setEndpointAttempted(false);
												setEditingEndpoint(false);
											}}
											className="rounded-md px-2.5 py-1.5 text-[8px] text-muted-foreground hover:bg-muted"
										>
											取消
										</button>
										<button
											type="submit"
											disabled={mutating !== null}
											className="inline-flex items-center gap-1 rounded-md bg-cyan-500 px-2.5 py-1.5 text-[8px] font-medium text-slate-950 transition hover:bg-cyan-400 disabled:opacity-40"
										>
											{mutating ? (
												<LoaderCircle className="size-2.5 animate-spin" />
											) : (
												<Save className="size-2.5" />
											)}
											保存并切换
										</button>
									</div>
								</form>
							) : null}
						</div>
					) : null}
				</div>
			) : null}

			{loading && !snapshot ? (
				<div className="flex min-h-28 items-center justify-center gap-2 text-xs text-muted-foreground">
					<LoaderCircle className="size-4 animate-spin" />
					正在检测 Codex、Claude 和媒体工具…
				</div>
			) : (
				<details className="group mt-2.5 border-t border-border/60 pt-2.5">
					<summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md px-1 py-1 text-[9px] text-muted-foreground transition hover:bg-muted/40 hover:text-foreground [&::-webkit-details-marker]:hidden">
						<span>高级设置与 MCP</span>
						<span className="text-[8px]">
							{appReady ? "工程工具已连接" : "路径、安装与环境检查"}
						</span>
					</summary>
					<div
						className={cn(
							"grid min-w-0 gap-2",
							compact ? "mt-2" : "mt-3 md:grid-cols-2",
						)}
					>
						<div className="min-w-0 rounded-lg border border-border/70 bg-muted/25 p-3">
							<div className="flex min-w-0 items-center justify-between gap-2">
								<div className="flex min-w-0 items-center gap-2">
									<Sparkles className="size-3.5 text-cyan-500" />
									<span className="min-w-0 text-xs leading-tight font-medium">
										在 Moirai Cut 中使用
									</span>
								</div>
								<span
									className={cn(
										"shrink-0 rounded-full px-2 py-0.5 text-[9px]",
										browserReady
											? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300"
											: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
									)}
								>
									{browserReady ? "可直接使用" : "需要可用 Agent"}
								</span>
							</div>
							<p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
								{browserReady
									? `已连接本机 ${activeConnection?.provider === "claude" ? "Claude Code" : "Codex"}，当前工程和选区会自动随消息发送。`
									: "安装并登录 Codex 或 Claude Code，也可以手动配置可执行文件路径。"}
							</p>
						</div>

						<div className="min-w-0 rounded-lg border border-border/70 bg-muted/25 p-3">
							<div className="flex min-w-0 items-center justify-between gap-2">
								<div className="flex min-w-0 items-center gap-2">
									<AppWindow className="size-3.5 text-cyan-500" />
									<span className="min-w-0 text-xs leading-tight font-medium">
										在 Codex / Claude 中使用
									</span>
								</div>
								<span
									className={cn(
										"shrink-0 rounded-full px-2 py-0.5 text-[9px]",
										appReady
											? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300"
											: "bg-muted text-muted-foreground",
									)}
								>
									{appReady ? "工程工具已连接" : "可安装 MCP"}
								</span>
							</div>
							<div className="mt-2 space-y-1.5">
								{snapshot?.providers.map((provider) => {
									const status = providerStatus(provider);
									const canInstall =
										provider.status === "ready" && !provider.mcpInstalled;
									return (
										<div key={provider.provider}>
											<div className="flex min-w-0 items-center gap-2 rounded-md bg-background/55 px-2 py-1.5">
												<div className="min-w-0 flex-1">
													<div className="flex items-center gap-1.5">
														<span className="text-[10px] font-medium">
															{provider.label}
														</span>
														<span
															className={cn(
																"rounded px-1.5 py-0.5 text-[8px]",
																status.className,
															)}
														>
															{provider.mcpInstalled
																? "MCP 已安装"
																: status.label}
														</span>
													</div>
													<p
														className={cn(
															"mt-0.5 truncate text-[8px] text-muted-foreground",
															compact && "max-w-28",
														)}
													>
														{sourceLabel(provider.source)}
														{provider.version ? ` · ${provider.version}` : ""}
													</p>
												</div>
												<div className="flex shrink-0 items-center gap-1">
													<button
														type="button"
														aria-label={`配置 ${provider.label} 路径`}
														onClick={() => {
															setEditingProvider(provider.provider);
															setBinaryInput(provider.binary);
														}}
														className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
														title="配置路径"
													>
														<Pencil className="size-3" />
													</button>
													{canInstall ? (
														<button
															type="button"
															aria-label={`为 ${provider.label} 安装 Moirai Cut MCP`}
															disabled={installing !== null}
															onClick={() => void installMcp(provider.provider)}
															className="inline-flex shrink-0 items-center gap-1 rounded-md border border-cyan-500/25 bg-cyan-500/8 px-2 py-1 text-[9px] text-cyan-700 transition hover:bg-cyan-500/15 disabled:opacity-50 dark:text-cyan-300"
														>
															{installing === provider.provider ? (
																<LoaderCircle className="size-3 animate-spin" />
															) : (
																<Download className="size-3" />
															)}
															{compact ? "安装" : "安装 Moirai Cut MCP"}
														</button>
													) : provider.mcpInstalled ? (
														<Check className="size-3.5 shrink-0 text-emerald-500" />
													) : null}
												</div>
											</div>
											{editingProvider === provider.provider ? (
												<div className="mt-1.5 rounded-md border border-border/70 bg-background/70 p-2">
													<label className="block text-[8px] text-muted-foreground">
														{provider.provider === "claude"
															? "Claude Code 路径"
															: "Codex 可执行文件路径"}
														<input
															aria-label={`${provider.provider === "claude" ? "Claude Code" : "Codex"} 路径`}
															value={binaryInput}
															onChange={(event) =>
																setBinaryInput(event.target.value)
															}
															placeholder={
																provider.provider === "claude"
																	? "/Users/you/.local/bin/claude"
																	: "/Applications/Codex.app/Contents/Resources/codex"
															}
															className="mt-1 h-7 w-full rounded border border-border bg-background px-2 text-[9px] text-foreground outline-none focus:border-cyan-500/50"
														/>
													</label>
													<div className="mt-1.5 flex justify-end gap-1">
														<button
															type="button"
															onClick={() => setEditingProvider(null)}
															className="rounded px-2 py-1 text-[8px] text-muted-foreground hover:bg-muted"
														>
															取消
														</button>
														<button
															type="button"
															disabled={
																!binaryInput.trim() || mutating !== null
															}
															onClick={() =>
																void mutateProvider({
																	action: "configure-provider",
																	provider: provider.provider,
																	binary: binaryInput,
																})
															}
															className="inline-flex items-center gap-1 rounded bg-cyan-500/12 px-2 py-1 text-[8px] text-cyan-700 hover:bg-cyan-500/20 disabled:opacity-40 dark:text-cyan-300"
														>
															<Save className="size-2.5" />
															验证并保存
														</button>
													</div>
												</div>
											) : null}
										</div>
									);
								})}
							</div>
						</div>
					</div>
					{snapshot ? (
						<div className="mt-2 border-t border-border/60 pt-2">
							<p className="mb-2 text-[9px] font-medium text-foreground/80">
								{allChecksPassed
									? "环境检查全部通过"
									: snapshot.ready
										? "浏览器已就绪 · App 连接可选"
										: "环境检查与修复建议"}
							</p>
							<div className="grid gap-1.5">
								{snapshot.checks.map((check) => (
									<div
										key={check.id}
										className="flex items-start gap-2 text-[9px] text-muted-foreground"
									>
										<span
											className={cn(
												"mt-1 size-1.5 shrink-0 rounded-full",
												checkDot(check.status),
											)}
										/>
										<span className="w-16 shrink-0 text-foreground/80">
											{check.label}
										</span>
										<span className="min-w-0 flex-1 break-all">
											{check.detail}
										</span>
									</div>
								))}
							</div>
						</div>
					) : null}
				</details>
			)}

			{message ? (
				<p className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-300">
					<Check className="size-3" />
					{message}
				</p>
			) : null}
			{error ? (
				<p className="mt-2 flex items-start gap-1.5 text-[10px] text-red-600 dark:text-red-300">
					<CircleAlert className="mt-0.5 size-3 shrink-0" />
					{error}
				</p>
			) : null}
		</section>
	);
}
