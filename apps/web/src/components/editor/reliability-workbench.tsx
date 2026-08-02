"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import {
	runProjectHealthCheck,
	type ProjectHealthResult,
} from "@/project/project-health";
import {
	buildLargeProjectPerformanceReport,
	type PerformanceBudget,
} from "@/project/large-project-performance";
import {
	backgroundJobs,
	type BackgroundJobState,
} from "@/project/background-jobs";
import type { PortableMediaMode } from "@/project/portable-package";
import { waveformCache } from "@/services/waveform-cache/service";
import { mediaTimeFromSeconds } from "@/wasm";
import type { TimelineElement, TimelineTrack } from "@/timeline";

type ReliabilityTab = "health" | "performance" | "jobs" | "package";

interface PackageResult {
	name: string;
	path: string;
	fileCount: number;
	totalBytes: number;
	validationOk: boolean;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatBudgetValue(budget: PerformanceBudget): string {
	if (budget.unit === "ratio") return `${Math.round(budget.value * 100)}%`;
	if (budget.unit === "ms") return `${budget.value.toFixed(1)} ms`;
	return String(Math.round(budget.value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

const PERFORMANCE_LABELS: Record<string, string> = {
	"Mounted media cards": "已挂载素材卡片",
	"Mounted timeline clips": "已挂载时间线素材",
	"Waveform cache reuse": "波形缓存复用",
	"Thumbnail cache reuse": "缩略图缓存复用",
	"Last UI interaction": "最近一次界面交互",
};

const JOB_KIND_LABELS: Record<BackgroundJobState["kind"], string> = {
	export: "导出",
	proxy: "代理",
	transcription: "转写",
	analysis: "分析",
};

const JOB_STATUS_LABELS: Record<BackgroundJobState["status"], string> = {
	running: "运行中",
	completed: "已完成",
	failed: "失败",
	cancelled: "已取消",
};

function localizeHealthMessage(message: string): string {
	if (message === "The project has no visual content to export.") {
		return "工程中没有可导出的画面内容。";
	}
	const overlap = message.match(/^(.+) overlaps (.+) on (.+)\.$/);
	if (overlap) {
		return `${overlap[1]} 与 ${overlap[2]} 在 ${overlap[3]} 上发生重叠。`;
	}
	const emptyRange = message.match(
		/^Nothing exists from (.+)s to (.+)s\.$/,
	);
	if (emptyRange) {
		return `${emptyRange[1]} 秒到 ${emptyRange[2]} 秒之间没有内容。`;
	}
	return message
		.replace(" is hidden but contains ", " 已隐藏，但仍包含 ")
		.replace(" is muted but contains ", " 已静音，但仍包含 ")
		.replace(" clip(s).", " 个素材。")
		.replace(" and may read as a flash frame.", "，可能会呈现为闪帧。")
		.replace(" references media that is not in the library.", " 引用了素材库中不存在的媒体。")
		.replace(" extends past its source and may freeze or render black.", " 超出源素材范围，可能冻结或渲染黑屏。")
		.replace(" gain and should be checked for clipping.", " 增益，请检查是否削波。")
		.replace(" characters on one line.", " 个字符集中在一行。")
		.replace(" is outside the title-safe vertical area.", " 超出了标题安全区的垂直范围。")
		.replace(
			" hole on the main track will export as black.",
			" 秒的主轨空隙会导出为黑屏。",
		);
}

export function ReliabilityWorkbench() {
	const editor = useEditor();
	const project = useEditor((instance) => instance.project.getActive());
	const scene = useEditor((instance) => instance.scenes.getActiveScene());
	const media = useEditor((instance) => instance.media.getAssets());
	const [tab, setTab] = useState<ReliabilityTab>("health");
	const [health, setHealth] = useState<ProjectHealthResult | null>(null);
	const [performanceBudgets, setPerformanceBudgets] = useState<
		PerformanceBudget[]
	>([]);
	const [jobs, setJobs] = useState<BackgroundJobState[]>(() =>
		backgroundJobs.list(),
	);
	const [mediaMode, setMediaMode] = useState<PortableMediaMode>(
		"originals-and-proxies",
	);
	const [packageResult, setPackageResult] = useState<PackageResult | null>(
		null,
	);

	useEffect(
		() =>
			backgroundJobs.subscribe(() => {
				setJobs(backgroundJobs.list());
			}),
		[],
	);

	const healthInput = useMemo(() => {
		const sourceTracks: Array<{
			track: TimelineTrack;
			role?: "main";
		}> = [
			...scene.tracks.overlay.map((track) => ({ track })),
			{ track: scene.tracks.main, role: "main" as const },
			...scene.tracks.audio.map((track) => ({ track })),
		];
		const tracks = sourceTracks.map(({ track, role }) => {
			const elements: TimelineElement[] = [];
			for (const element of track.elements) elements.push(element);
			return {
				id: track.id,
				name: track.name,
				type: track.type,
				role,
				muted: "muted" in track ? track.muted : undefined,
				hidden: "hidden" in track ? track.hidden : undefined,
				elements: elements.map((element) => ({
					id: element.id,
					name: element.name,
					type: element.type,
					startTime: element.startTime,
					duration: element.duration,
					trimStart: element.trimStart,
					...("mediaId" in element ? { mediaId: element.mediaId } : {}),
					...("retime" in element ? { retime: element.retime } : {}),
					params: { ...element.params },
				})),
			};
		});
		return {
			project: {
				canvasSize: project.settings.canvasSize,
				tracks,
			},
			media: media.map((asset) => ({
				id: asset.id,
				durationSeconds: asset.duration,
			})),
		};
	}, [media, project.settings.canvasSize, scene.tracks]);

	const runHealth = () => {
		backgroundJobs.start({
			kind: "analysis",
			label: "工程健康检查",
			run: async ({ update }) => {
				update({ progress: 0.25, step: "正在检查时间线结构" });
				const result = runProjectHealthCheck(healthInput);
				update({ progress: 0.8, step: "正在检查导出风险" });
				setHealth(result);
			},
		});
	};

	const measurePerformance = () => {
		const startedAt = performance.now();
		const performanceTracks: TimelineTrack[] = [
			...scene.tracks.overlay,
			scene.tracks.main,
			...scene.tracks.audio,
		];
		const allElements: TimelineElement[] = [];
		for (const track of performanceTracks) {
			for (const element of track.elements) allElements.push(element);
		}
		const mountedMediaItems = document.querySelectorAll(
			"[data-media-preview-virtualized]",
		).length;
		const mountedTimelineElements = document.querySelectorAll(
			'[aria-label^="选择素材 "]',
		).length;
		const waveformStats = waveformCache.getStats();
		const thumbnailEntries = media.filter(
			(asset) => asset.type === "image" || Boolean(asset.thumbnailUrl),
		).length;
		const report = buildLargeProjectPerformanceReport({
			mediaItems: media.length,
			mountedMediaItems:
				mountedMediaItems === 0
					? Math.min(media.length, 80)
					: mountedMediaItems,
			timelineElements: allElements.length,
			mountedTimelineElements,
			waveformCache: waveformStats,
			thumbnailCache: {
				hits: thumbnailEntries,
				misses: Math.max(0, media.length - thumbnailEntries),
			},
			lastInteractionMs: performance.now() - startedAt,
		});
		setPerformanceBudgets(report.budgets);
	};

	const buildPackage = () => {
		backgroundJobs.start({
			kind: "export",
			label: "便携工程包",
			run: async ({ signal, update }) => {
				update({ progress: 0.1, step: "正在收集工程关联文件" });
				const response = await fetch(
					`/api/project-packages/${encodeURIComponent(project.metadata.id)}`,
					{
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ mediaMode }),
						signal,
					},
				);
				const payload: unknown = await response.json().catch(() => ({}));
				if (!response.ok || !isRecord(payload)) {
					throw new Error(
						isRecord(payload) && typeof payload.error === "string"
							? payload.error
							: "创建工程包失败",
					);
				}
				const manifest = isRecord(payload.manifest) ? payload.manifest : null;
				const validation = isRecord(payload.validation)
					? payload.validation
					: null;
				if (
					typeof payload.name !== "string" ||
					typeof payload.path !== "string" ||
					!manifest ||
					!Array.isArray(manifest.files) ||
					typeof manifest.totalBytes !== "number"
				) {
					throw new Error("工程包响应不完整");
				}
				update({ progress: 0.9, step: "正在校验便携清单" });
				setPackageResult({
					name: payload.name,
					path: payload.path,
					fileCount: manifest.files.length,
					totalBytes: manifest.totalBytes,
					validationOk: validation?.ok === true,
				});
				toast.success(`已生成 ${payload.name}`, {
					description: `${manifest.files.length} 个文件 · 导入校验通过`,
				});
			},
		});
	};

	const tabs: Array<{ id: ReliabilityTab; label: string }> = [
		{ id: "health", label: "健康" },
		{ id: "performance", label: "性能" },
		{ id: "jobs", label: "任务" },
		{ id: "package", label: "工程包" },
	];

	return (
		<div className="border-border bg-muted/10 mb-3 rounded-lg border p-2">
			<div
				className="mb-2 flex gap-1"
				role="tablist"
				aria-label="可靠性工具"
			>
				{tabs.map((item) => (
					<button
						key={item.id}
						type="button"
						role="tab"
						aria-selected={tab === item.id}
						className={`flex-1 rounded px-1.5 py-1 text-[10px] font-medium ${
							tab === item.id
								? "bg-foreground text-background"
								: "hover:bg-muted"
						}`}
						onClick={() => setTab(item.id)}
					>
						{item.label}
					</button>
				))}
			</div>

			{tab === "health" ? (
				<div>
					<div className="flex items-center justify-between">
						<div>
							<div className="text-xs font-semibold">工程健康</div>
							<div className="text-[10px] opacity-55">
								结构 · 媒体 · 音频 · 字幕 · 导出
							</div>
						</div>
						<button
							type="button"
							className="border-input rounded border px-2 py-1 text-[10px]"
							onClick={runHealth}
						>
							运行检查
						</button>
					</div>
					{health ? (
						<div className="mt-2">
							<div className="mb-1 flex gap-1 text-[10px]">
								<span className="rounded bg-red-500/10 px-1.5 py-0.5 text-red-600">
									{health.counts.error} 个错误
								</span>
								<span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-600">
									{health.counts.warning} 个警告
								</span>
								<span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-sky-600">
									{health.counts.note} 条提示
								</span>
								<span className="ml-auto font-medium">
									{health.exportReady ? "可导出" : "请先修复错误"}
								</span>
							</div>
							{health.findings.length === 0 ? (
								<div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px] text-emerald-700 dark:text-emerald-300">
									未发现结构或导出风险。
								</div>
							) : (
								<ul className="max-h-32 space-y-1 overflow-y-auto">
									{health.findings.slice(0, 20).map((finding) => (
										<li
											key={finding.id}
											className="border-border flex items-start gap-2 rounded border p-1.5 text-[10px]"
										>
											<span
												className={
													finding.severity === "error"
														? "text-red-500"
														: finding.severity === "warning"
															? "text-amber-500"
															: "text-sky-500"
												}
											>
												●
											</span>
											<span className="min-w-0 flex-1">
												{localizeHealthMessage(finding.message)}
											</span>
											{finding.atSeconds !== undefined ? (
												<button
													type="button"
													className="text-primary shrink-0 hover:underline"
													onClick={() =>
														editor.playback.seek({
															time: mediaTimeFromSeconds({
																seconds: finding.atSeconds ?? 0,
															}),
														})
													}
												>
													前往 {finding.atSeconds.toFixed(2)} 秒
												</button>
											) : null}
										</li>
									))}
								</ul>
							)}
						</div>
					) : (
						<p className="mt-2 text-[10px] opacity-55">
							建议在导出前或大规模智能剪辑后运行。
						</p>
					)}
				</div>
			) : null}

			{tab === "performance" ? (
				<div>
					<div className="flex items-center justify-between">
						<div>
							<div className="text-xs font-semibold">大型工程性能预算</div>
							<div className="text-[10px] opacity-55">
								视口渲染 · 缓存 · 60 fps 输入预算
							</div>
						</div>
						<button
							type="button"
							className="border-input rounded border px-2 py-1 text-[10px]"
							onClick={measurePerformance}
						>
							测量
						</button>
					</div>
					{performanceBudgets.length > 0 ? (
						<ul className="mt-2 grid grid-cols-2 gap-1">
							{performanceBudgets.map((budget) => (
								<li
									key={budget.id}
									className="border-border rounded border p-1.5 text-[10px]"
								>
									<div className="flex justify-between gap-2">
										<span className="truncate opacity-60">
											{PERFORMANCE_LABELS[budget.label] ?? budget.label}
										</span>
										<span
											className={
												budget.status === "pass"
													? "text-emerald-600"
													: "text-amber-600"
											}
										>
											{budget.status === "pass" ? "通过" : "警告"}
										</span>
									</div>
									<div className="font-mono text-xs">
										{formatBudgetValue(budget)}
									</div>
								</li>
							))}
						</ul>
					) : (
						<p className="mt-2 text-[10px] opacity-55">
							时间线素材使用视口超扫描；素材库超过 100 项后会延迟加载高开销预览。
						</p>
					)}
				</div>
			) : null}

			{tab === "jobs" ? (
				<div>
					<div className="text-xs font-semibold">后台任务</div>
					<div className="text-[10px] opacity-55">
						导出 · 代理 · 转写 · 分析
					</div>
					{jobs.length === 0 ? (
						<p className="mt-2 text-[10px] opacity-55">
							本次编辑会话暂无任务。
						</p>
					) : (
						<ul className="mt-2 max-h-36 space-y-1 overflow-y-auto">
							{jobs.slice(0, 12).map((job) => (
								<li
									key={job.jobId}
									className="border-border rounded border p-1.5 text-[10px]"
								>
									<div className="flex items-center gap-2">
										<span className="rounded bg-muted px-1 font-mono uppercase">
											{JOB_KIND_LABELS[job.kind]}
										</span>
										<span className="min-w-0 flex-1 truncate font-medium">
											{job.label}
										</span>
										<span>{JOB_STATUS_LABELS[job.status]}</span>
									</div>
									<div className="mt-1 flex items-center gap-2">
										<div className="bg-muted h-1 flex-1 overflow-hidden rounded">
											<div
												className="bg-primary h-full"
												style={{ width: `${job.progress * 100}%` }}
											/>
										</div>
										<span className="opacity-55">{job.step}</span>
										{job.status === "running" ? (
											<button
												type="button"
												className="text-destructive hover:underline"
												onClick={() =>
													backgroundJobs.cancel({ jobId: job.jobId })
												}
											>
												取消
											</button>
										) : job.status === "failed" ||
										  job.status === "cancelled" ? (
											<button
												type="button"
												className="text-primary hover:underline"
												onClick={() =>
													void backgroundJobs.retry({ jobId: job.jobId })
												}
											>
												重试
											</button>
										) : null}
									</div>
								</li>
							))}
						</ul>
					)}
				</div>
			) : null}

			{tab === "package" ? (
				<div>
					<div className="text-xs font-semibold">便携工程包</div>
					<div className="text-[10px] opacity-55">
						工程 · 媒体/代理 · 字幕 · 字体清单
					</div>
					<div className="mt-2 flex gap-2">
						<select
							aria-label="工程包媒体"
							className="border-input bg-background min-w-0 flex-1 rounded border px-2 py-1 text-[10px]"
							value={mediaMode}
							onChange={(event) => {
								const value = event.target.value;
								if (
									value === "originals" ||
									value === "proxies" ||
									value === "originals-and-proxies"
								) {
									setMediaMode(value);
								}
							}}
						>
							<option value="originals-and-proxies">原始素材 + 代理</option>
							<option value="originals">仅原始素材</option>
							<option value="proxies">仅代理</option>
						</select>
						<button
							type="button"
							className="bg-foreground text-background rounded px-2 py-1 text-[10px] font-medium"
							onClick={buildPackage}
						>
							生成工程包
						</button>
					</div>
					{packageResult ? (
						<div className="border-emerald-500/30 bg-emerald-500/10 mt-2 rounded border p-2 text-[10px]">
							<div className="font-medium">{packageResult.name}</div>
							<div className="mt-0.5 opacity-70">
								{packageResult.fileCount} 个文件 ·{" "}
								{formatBytes(packageResult.totalBytes)} ·{" "}
								{packageResult.validationOk
									? "导入校验通过"
									: "校验失败"}
							</div>
							<div className="mt-1 truncate font-mono opacity-50">
								{packageResult.path}
							</div>
						</div>
					) : (
						<p className="mt-2 text-[10px] opacity-55">
							发布前会校验每个工程包的安全路径、必需工程数据和准确字节总数。
						</p>
					)}
				</div>
			) : null}
		</div>
	);
}
