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
			label: "Project health check",
			run: async ({ update }) => {
				update({ progress: 0.25, step: "Inspecting timeline structure" });
				const result = runProjectHealthCheck(healthInput);
				update({ progress: 0.8, step: "Checking export hazards" });
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
			'[aria-label^="Select clip "]',
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
			label: "Portable project package",
			run: async ({ signal, update }) => {
				update({ progress: 0.1, step: "Collecting project companions" });
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
							: "Package creation failed",
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
					throw new Error("Package response was incomplete");
				}
				update({ progress: 0.9, step: "Validating portable manifest" });
				setPackageResult({
					name: payload.name,
					path: payload.path,
					fileCount: manifest.files.length,
					totalBytes: manifest.totalBytes,
					validationOk: validation?.ok === true,
				});
				toast.success(`Built ${payload.name}`, {
					description: `${manifest.files.length} files · import validation passed`,
				});
			},
		});
	};

	const tabs: Array<{ id: ReliabilityTab; label: string }> = [
		{ id: "health", label: "Health" },
		{ id: "performance", label: "Performance" },
		{ id: "jobs", label: "Jobs" },
		{ id: "package", label: "Package" },
	];

	return (
		<div className="border-border bg-muted/10 mb-3 rounded-lg border p-2">
			<div
				className="mb-2 flex gap-1"
				role="tablist"
				aria-label="Reliability tools"
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
							<div className="text-xs font-semibold">Project health</div>
							<div className="text-[10px] opacity-55">
								Structure · media · audio · captions · export
							</div>
						</div>
						<button
							type="button"
							className="border-input rounded border px-2 py-1 text-[10px]"
							onClick={runHealth}
						>
							Run check
						</button>
					</div>
					{health ? (
						<div className="mt-2">
							<div className="mb-1 flex gap-1 text-[10px]">
								<span className="rounded bg-red-500/10 px-1.5 py-0.5 text-red-600">
									{health.counts.error} errors
								</span>
								<span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-600">
									{health.counts.warning} warnings
								</span>
								<span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-sky-600">
									{health.counts.note} notes
								</span>
								<span className="ml-auto font-medium">
									{health.exportReady ? "Export-ready" : "Fix errors first"}
								</span>
							</div>
							{health.findings.length === 0 ? (
								<div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px] text-emerald-700 dark:text-emerald-300">
									No structural or export hazards found.
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
											<span className="min-w-0 flex-1">{finding.message}</span>
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
													Go {finding.atSeconds.toFixed(2)}s
												</button>
											) : null}
										</li>
									))}
								</ul>
							)}
						</div>
					) : (
						<p className="mt-2 text-[10px] opacity-55">
							Run before export or after a large Agent edit.
						</p>
					)}
				</div>
			) : null}

			{tab === "performance" ? (
				<div>
					<div className="flex items-center justify-between">
						<div>
							<div className="text-xs font-semibold">Large-project budgets</div>
							<div className="text-[10px] opacity-55">
								Viewport rendering · caches · 60 fps input budget
							</div>
						</div>
						<button
							type="button"
							className="border-input rounded border px-2 py-1 text-[10px]"
							onClick={measurePerformance}
						>
							Measure
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
										<span className="truncate opacity-60">{budget.label}</span>
										<span
											className={
												budget.status === "pass"
													? "text-emerald-600"
													: "text-amber-600"
											}
										>
											{budget.status.toUpperCase()}
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
							Timeline clips use viewport overscan; libraries defer heavy
							previews above 100 items.
						</p>
					)}
				</div>
			) : null}

			{tab === "jobs" ? (
				<div>
					<div className="text-xs font-semibold">Background jobs</div>
					<div className="text-[10px] opacity-55">
						Export · proxy · transcription · analysis
					</div>
					{jobs.length === 0 ? (
						<p className="mt-2 text-[10px] opacity-55">
							No jobs in this editing session.
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
											{job.kind}
										</span>
										<span className="min-w-0 flex-1 truncate font-medium">
											{job.label}
										</span>
										<span>{job.status}</span>
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
												Cancel
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
												Retry
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
					<div className="text-xs font-semibold">Portable project package</div>
					<div className="text-[10px] opacity-55">
						Project · media/proxies · captions · font manifest
					</div>
					<div className="mt-2 flex gap-2">
						<select
							aria-label="Package media"
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
							<option value="originals-and-proxies">Originals + proxies</option>
							<option value="originals">Originals only</option>
							<option value="proxies">Proxies only</option>
						</select>
						<button
							type="button"
							className="bg-foreground text-background rounded px-2 py-1 text-[10px] font-medium"
							onClick={buildPackage}
						>
							Build package
						</button>
					</div>
					{packageResult ? (
						<div className="border-emerald-500/30 bg-emerald-500/10 mt-2 rounded border p-2 text-[10px]">
							<div className="font-medium">{packageResult.name}</div>
							<div className="mt-0.5 opacity-70">
								{packageResult.fileCount} files ·{" "}
								{formatBytes(packageResult.totalBytes)} ·{" "}
								{packageResult.validationOk
									? "import validation passed"
									: "validation failed"}
							</div>
							<div className="mt-1 truncate font-mono opacity-50">
								{packageResult.path}
							</div>
						</div>
					) : (
						<p className="mt-2 text-[10px] opacity-55">
							Every package is validated against safe paths, required project
							data, and exact byte totals before it is published.
						</p>
					)}
				</div>
			) : null}
		</div>
	);
}
