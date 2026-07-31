"use client";

import {
	AppWindow,
	Check,
	CircleAlert,
	Download,
	LoaderCircle,
	RefreshCw,
	Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/utils/ui";

type AgentProviderId = "codex" | "claude";
type CheckStatus = "pass" | "warning" | "fail";

interface AgentProvider {
	provider: AgentProviderId;
	label: string;
	source: "environment" | "desktop" | "path";
	status: "ready" | "login-required" | "unavailable" | "invalid";
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

interface AgentSetupSnapshot {
	checkedAt: string;
	score: number;
	ready: boolean;
	blocking: string[];
	recommendedProvider: AgentProviderId | null;
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
}

let cachedSnapshot: AgentSetupSnapshot | null = null;
let cachedAt = 0;
let pendingSnapshot: Promise<AgentSetupSnapshot> | null = null;
const CACHE_MILLISECONDS = 30_000;

function isAgentSetupSnapshot(value: unknown): value is AgentSetupSnapshot {
	return (
		typeof value === "object" &&
		value !== null &&
		"score" in value &&
		typeof value.score === "number" &&
		"ready" in value &&
		typeof value.ready === "boolean" &&
		"providers" in value &&
		Array.isArray(value.providers) &&
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
}: AgentSetupPanelProps) {
	const [snapshot, setSnapshot] = useState<AgentSetupSnapshot | null>(
		cachedSnapshot,
	);
	const [loading, setLoading] = useState(!cachedSnapshot);
	const [installing, setInstalling] = useState<AgentProviderId | null>(null);
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

	const codex = snapshot?.providers.find(
		(provider) => provider.provider === "codex",
	);
	const browserReady = codex?.status === "ready";
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
					: "OpenCut MCP 已安装。",
			);
			await refresh(true);
		} catch (nextError) {
			setError(nextError instanceof Error ? nextError.message : "MCP 安装失败");
		} finally {
			setInstalling(null);
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
						自动复用本机登录，不需要再次填写账号。
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

			{loading && !snapshot ? (
				<div className="flex min-h-28 items-center justify-center gap-2 text-xs text-muted-foreground">
					<LoaderCircle className="size-4 animate-spin" />
					正在检测 Codex、Claude 和媒体工具…
				</div>
			) : (
				<div
					className={cn(
						"grid min-w-0 gap-2",
						compact ? "mt-2" : "mt-4 md:grid-cols-2",
					)}
				>
					<div className="min-w-0 rounded-lg border border-border/70 bg-muted/25 p-3">
						<div className="flex min-w-0 items-center justify-between gap-2">
							<div className="flex min-w-0 items-center gap-2">
								<Sparkles className="size-3.5 text-cyan-500" />
								<span className="min-w-0 text-xs leading-tight font-medium">
									在 OpenCut 中使用
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
								{browserReady ? "可直接使用" : "需要 Codex"}
							</span>
						</div>
						<p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
							{browserReady
								? "已连接本机 Codex，当前工程和选区会自动随消息发送。"
								: "安装并登录 Codex 后即可复用现有账号；API Key 模式将在独立服务版提供。"}
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
									<div
										key={provider.provider}
										className="flex min-w-0 items-center gap-2 rounded-md bg-background/55 px-2 py-1.5"
									>
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
													{provider.mcpInstalled ? "MCP 已安装" : status.label}
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
										{canInstall ? (
											<button
												type="button"
												aria-label={`为 ${provider.label} 安装 OpenCut MCP`}
												disabled={installing !== null}
												onClick={() => void installMcp(provider.provider)}
												className="inline-flex shrink-0 items-center gap-1 rounded-md border border-cyan-500/25 bg-cyan-500/8 px-2 py-1 text-[9px] text-cyan-700 transition hover:bg-cyan-500/15 disabled:opacity-50 dark:text-cyan-300"
											>
												{installing === provider.provider ? (
													<LoaderCircle className="size-3 animate-spin" />
												) : (
													<Download className="size-3" />
												)}
												{compact ? "安装" : "安装 OpenCut MCP"}
											</button>
										) : provider.mcpInstalled ? (
											<Check className="size-3.5 shrink-0 text-emerald-500" />
										) : null}
									</div>
								);
							})}
						</div>
					</div>
				</div>
			)}

			{snapshot ? (
				<details
					className={cn(
						"border-t border-border/70",
						compact ? "mt-2 pt-2" : "mt-3 pt-3",
					)}
				>
					<summary className="cursor-pointer list-none text-[10px] text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
						{allChecksPassed
							? "环境检查全部通过"
							: snapshot.ready
								? "浏览器已就绪 · App 连接可选"
								: "查看环境检查与修复建议"}
					</summary>
					<div className="mt-2 grid gap-1.5">
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
								<span className="min-w-0 flex-1 break-all">{check.detail}</span>
							</div>
						))}
					</div>
				</details>
			) : null}

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
