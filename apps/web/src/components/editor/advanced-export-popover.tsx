"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useEditor } from "@/editor/use-editor";
import { downloadBuffer, getExportMimeType } from "@/export";
import {
	EXPORT_PLATFORM_PRESETS,
	buildComponentExportPlan,
	buildExportEstimate,
	buildExportPreflight,
	createExportDraftFromPreset,
	detectExportCapabilities,
	estimateRemainingSeconds,
	exportDraftToOptions,
	validateExportDraft,
	type ComponentExportPlanItem,
	type ExportCapabilitySummary,
	type ExportDraft,
	type ExportPreflightResult,
	type ExportPresetId,
	type ExportRenderSample,
} from "@/export/workflow";
import { exportQueue, type ExportQueueItem } from "@/export/queue";
import {
	getBrowserExportHistory,
	type ExportHistoryEntry,
	type ExportHistoryStatus,
} from "@/export/history";
import { backgroundJobs } from "@/project/background-jobs";
import {
	runProjectHealthCheck,
	type ProjectHealthResult,
} from "@/project/project-health";
import type { TimelineElement, TimelineTrack } from "@/timeline";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";
import { extractTimelineAudio } from "@/media/mediabunny";
import { downloadBlob } from "@/utils/browser";
import {
	getCaptionExportCues,
	isolateAudioStemTracks,
	listAudioStemTracks,
} from "@/export/component-outputs";
import { collectCaptionCues } from "@/subtitles/caption-model";
import { serializeSubtitles } from "@/subtitles/interchange";
import {
	cancelNativeDeliveryJob,
	startNativeDeliveryJob,
	waitForNativeDeliveryJob,
} from "@/agent/native-delivery-jobs";
import {
	DELIVERY_PRESET_NAMES,
	formatNativeDeliveryResultSummary,
	type DeliveryPresetName,
} from "@/export/native-delivery-contract";

type ExportTab = "setup" | "preflight" | "components" | "queue" | "history";
type DeliverySelection = "browser" | DeliveryPresetName;

function isDeliverySelection(
	value: string,
): value is DeliverySelection {
	return (
		value === "browser" ||
		DELIVERY_PRESET_NAMES.some((preset) => preset === value)
	);
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds)) return "—";
	if (seconds < 60) return `${Math.ceil(seconds)}s`;
	const minutes = Math.floor(seconds / 60);
	return `${minutes}m ${Math.ceil(seconds % 60)}s`;
}

function safeDestinationName({
	projectName,
	label,
	draft,
}: {
	projectName: string;
	label: string;
	draft: ExportDraft;
}): string {
	const raw = `${projectName}-${label}`
		.normalize("NFKC")
		.replace(/[^\p{L}\p{N}_.-]+/gu, "-")
		.replace(/^[.-]+|[.-]+$/g, "");
	const base = [...raw]
		.slice(0, 130)
		.join("")
		.replace(/[.-]+$/g, "");
	return `${base || "export"}.${draft.format}`;
}

function numberFromInput({
	value,
	fallback,
}: {
	value: string;
	fallback: number;
}): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function AdvancedExportPopover({
	onOpenChange,
}: {
	onOpenChange: (open: boolean) => void;
}) {
	const editor = useEditor();
	const project = useEditor((instance) => instance.project.getActive());
	const scene = useEditor((instance) => instance.scenes.getActiveScene());
	const media = useEditor((instance) => instance.media.getAssets());
	const exportState = useEditor((instance) =>
		instance.project.getExportState(),
	);
	const durationSeconds = mediaTimeToSeconds({
		time: editor.timeline.getTotalDuration(),
	});
	const sourceSettings = useMemo(
		() => ({
			width: project.settings.canvasSize.width,
			height: project.settings.canvasSize.height,
			fps: project.settings.fps,
		}),
		[
			project.settings.canvasSize.height,
			project.settings.canvasSize.width,
			project.settings.fps,
		],
	);
	const [tab, setTab] = useState<ExportTab>("setup");
	const [draft, setDraft] = useState<ExportDraft>(() =>
		createExportDraftFromPreset({
			presetId: "source",
			source: sourceSettings,
		}),
	);
	const [capabilities, setCapabilities] =
		useState<ExportCapabilitySummary | null>(null);
	const [checkingCapabilities, setCheckingCapabilities] = useState(false);
	const [preflight, setPreflight] = useState<ExportPreflightResult | null>(
		null,
	);
	const [runningPreflight, setRunningPreflight] = useState(false);
	const [queueItems, setQueueItems] = useState<ExportQueueItem[]>(() =>
		exportQueue.list(),
	);
	const historyStore = useMemo(() => getBrowserExportHistory(), []);
	const [history, setHistory] = useState<ExportHistoryEntry[]>(() =>
		historyStore.list(),
	);
	const [runningQueue, setRunningQueue] = useState(false);
	const [deliverySelection, setDeliverySelection] =
		useState<DeliverySelection>("browser");
	const [elapsedSeconds, setElapsedSeconds] = useState(0);
	const currentJobIdRef = useRef<string | null>(null);
	const exportStartedAtRef = useRef<number | null>(null);

	useEffect(
		() =>
			exportQueue.subscribe(() => {
				setQueueItems(exportQueue.list());
			}),
		[],
	);

	useEffect(
		() =>
			historyStore.subscribe(() => {
				setHistory(historyStore.list());
			}),
		[historyStore],
	);

	useEffect(() => {
		if (!exportState.isExporting) {
			exportStartedAtRef.current = null;
			return;
		}
		if (exportStartedAtRef.current === null) {
			exportStartedAtRef.current = performance.now();
		}
		const timer = window.setInterval(() => {
			setElapsedSeconds(
				(performance.now() -
					(exportStartedAtRef.current ?? performance.now())) /
					1000,
			);
		}, 500);
		return () => window.clearInterval(timer);
	}, [exportState.isExporting]);

	const revision =
		editor.project.getKnownFileRevision(project.metadata.id) ??
		editor.agent.revision;
	const captionCues = useMemo(
		() => collectCaptionCues({ tracks: scene.tracks }),
		[scene.tracks],
	);
	const audioTracks = useMemo(
		() => listAudioStemTracks({ tracks: scene.tracks }),
		[scene.tracks],
	);
	const componentPlan = useMemo(
		() =>
			buildComponentExportPlan({
				captionCount: captionCues.length,
				audioTracks,
				range: draft.range,
				alphaAvailable:
					draft.format === "webm"
						? capabilities?.videoCodecSupported !== false
						: true,
			}),
		[audioTracks, capabilities?.videoCodecSupported, captionCues.length, draft],
	);
	const validationIssues = useMemo(
		() =>
			validateExportDraft({
				draft,
				...(capabilities ? { capabilities } : {}),
				timelineDurationSeconds: durationSeconds,
			}),
		[draft, capabilities, durationSeconds],
	);
	const estimate = useMemo(
		() => buildExportEstimate({ draft, durationSeconds }),
		[draft, durationSeconds],
	);
	const remainingSeconds = estimateRemainingSeconds({
		elapsedSeconds: exportState.isExporting ? elapsedSeconds : 0,
		progress: exportState.progress,
	});

	const healthInput = useMemo(() => {
		const sourceTracks: Array<{
			track: TimelineTrack;
			role?: "main";
		}> = [
			...scene.tracks.overlay.map((track) => ({ track })),
			{ track: scene.tracks.main, role: "main" as const },
			...scene.tracks.audio.map((track) => ({ track })),
		];
		return {
			project: {
				canvasSize: project.settings.canvasSize,
				tracks: sourceTracks.map(({ track, role }) => {
					const elements: TimelineElement[] = [...track.elements];
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
				}),
			},
			media: media.map((asset) => ({
				id: asset.id,
				durationSeconds: asset.duration,
			})),
		};
	}, [media, project.settings.canvasSize, scene.tracks]);

	const applyPreset = ({ presetId }: { presetId: ExportPresetId }) => {
		setDraft(createExportDraftFromPreset({ presetId, source: sourceSettings }));
		setCapabilities(null);
		setPreflight(null);
	};

	const patchDraft = ({ update }: { update: Partial<ExportDraft> }) => {
		setDraft((current) => ({ ...current, ...update }));
		const capabilityFields = new Set<string>([
			"format",
			"width",
			"height",
			"fps",
			"videoCodec",
			"videoBitrate",
			"includeAudio",
			"audioCodec",
			"audioBitrate",
			"hardwareAcceleration",
		]);
		if (Object.keys(update).some((key) => capabilityFields.has(key))) {
			setCapabilities(null);
		}
		setPreflight(null);
	};

	const refreshAvailability = async ({
		expectedName,
		attempts = 1,
	}: {
		expectedName?: string;
		attempts?: number;
	} = {}): Promise<boolean> => {
		for (let attempt = 0; attempt < attempts; attempt++) {
			try {
				const response = await fetch(
					`/api/exports/${encodeURIComponent(project.metadata.id)}`,
				);
				const payload: unknown = await response.json().catch(() => ({}));
				if (
					!response.ok ||
					!isRecord(payload) ||
					!Array.isArray(payload.files)
				) {
					return false;
				}
				const names = new Set(
					payload.files.flatMap((file) =>
						isRecord(file) && typeof file.name === "string" ? [file.name] : [],
					),
				);
				historyStore.reconcileAvailability({ availableNames: names });
				if (!expectedName || names.has(expectedName)) return true;
			} catch {
				// Availability is advisory; history remains useful for reruns offline.
			}
			if (attempt + 1 < attempts) {
				await new Promise((resolve) => window.setTimeout(resolve, 250));
			}
		}
		return false;
	};

	useEffect(() => {
		void refreshAvailability();
		// Availability changes only when the active project changes or a run ends.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [project.metadata.id]);

	const recordHistory = ({
		requestDraft,
		label,
		status,
		destinationName,
		sizeBytes,
		error,
	}: {
		requestDraft: ExportDraft;
		label: string;
		status: ExportHistoryStatus;
		destinationName: string | null;
		sizeBytes: number | null;
		error: string | null;
	}) => {
		historyStore.record({
			projectId: project.metadata.id,
			projectRevision: revision,
			label,
			options: requestDraft,
			status,
			destinationName,
			sizeBytes,
			error,
		});
	};

	const performVideoExport = async ({
		requestDraft,
		label,
		queueId,
	}: {
		requestDraft: ExportDraft;
		label: string;
		queueId?: string;
	}): Promise<boolean> => {
		const requestCapabilities = await detectExportCapabilities({
			draft: requestDraft,
		});
		const issues = validateExportDraft({
			draft: requestDraft,
			capabilities: requestCapabilities,
			timelineDurationSeconds: durationSeconds,
		});
		const blocking = issues.find((issue) => issue.severity === "error");
		if (blocking) {
			toast.error("Export settings need attention", {
				description: blocking.message,
			});
			if (queueId) {
				exportQueue.fail({ id: queueId, error: blocking.message });
			}
			recordHistory({
				requestDraft,
				label,
				status: "failed",
				destinationName: null,
				sizeBytes: null,
				error: blocking.message,
			});
			return false;
		}
		const destinationName = safeDestinationName({
			projectName: project.metadata.name,
			label,
			draft: requestDraft,
		});
		let completedBytes: number | null = null;
		let completedDestinationName = destinationName;
		let completedEncoderSummary = `浏览器编码 · ${requestDraft.hardwareAcceleration}`;
		let completedError: string | null = null;
		let cancelled = false;
		const handle = backgroundJobs.start({
			kind: "export",
			label,
			run: async ({ signal, update }) => {
				let nativeJobId: string | null = null;
				const cancel = () => {
					editor.project.cancelExport();
					if (nativeJobId) {
						cancelNativeDeliveryJob({ jobId: nativeJobId });
					}
				};
				signal.addEventListener("abort", cancel, { once: true });
				const unsubscribe = editor.project.subscribe(() => {
					const state = editor.project.getExportState();
					update({
						progress: state.progress,
						step: `Encoding ${Math.round(state.progress * 100)}%`,
					});
					if (queueId) {
						exportQueue.update({
							id: queueId,
							progress: state.progress,
						});
					}
				});
				try {
					const result = await editor.project.export({
						options: {
							...exportDraftToOptions({ draft: requestDraft }),
							destinationName,
						},
					});
					if (result.cancelled || signal.aborted) {
						cancelled = true;
						return;
					}
					if (!result.success || !result.buffer) {
						throw new Error(result.error || "Export did not produce a file");
					}
					if (deliverySelection === "browser") {
						update({ progress: 0.99, step: "Preparing download" });
						downloadBuffer({
							buffer: result.buffer,
							filename: destinationName,
							mimeType: getExportMimeType({
								format: requestDraft.format,
							}),
						});
						completedBytes = result.buffer.byteLength;
					} else {
						update({
							progress: 0.9,
							step: "保存高质量中间文件",
						});
						const saveResponse = await fetch(
							`/api/exports/${encodeURIComponent(project.metadata.id)}/${encodeURIComponent(destinationName)}`,
							{
								method: "PUT",
								headers: {
									"content-type": getExportMimeType({
										format: requestDraft.format,
									}),
								},
								body: result.buffer,
							},
						);
						if (!saveResponse.ok) {
							throw new Error("无法保存原生转码中间文件");
						}
						const nativeJob = startNativeDeliveryJob({
							projectId: project.metadata.id,
							sourceName: destinationName,
							preset: deliverySelection,
						});
						nativeJobId = nativeJob.id;
						update({
							progress: 0.94,
							step: `原生编码 ${deliverySelection}`,
						});
						const delivered = await waitForNativeDeliveryJob({
							jobId: nativeJob.id,
						});
						if (
							delivered.status !== "succeeded" ||
							!delivered.result
						) {
							throw new Error(
								delivered.error ??
									`原生编码状态：${delivered.status}`,
							);
						}
						completedDestinationName =
							delivered.result.outputName;
						completedBytes = delivered.result.sizeBytes;
						completedEncoderSummary =
							formatNativeDeliveryResultSummary({
								result: delivered.result,
							});
						const outputResponse = await fetch(
							`/api/exports/${encodeURIComponent(project.metadata.id)}/${encodeURIComponent(delivered.result.outputName)}`,
						);
						if (!outputResponse.ok) {
							throw new Error("原生交付文件读取失败");
						}
						downloadBlob({
							blob: await outputResponse.blob(),
							filename: delivered.result.outputName,
						});
					}
					if (queueId) {
						exportQueue.complete({
							id: queueId,
							outputName: completedDestinationName,
							sizeBytes: completedBytes,
						});
					}
				} catch (error) {
					completedError =
						error instanceof Error ? error.message : String(error);
					throw error;
				} finally {
					unsubscribe();
					signal.removeEventListener("abort", cancel);
				}
			},
		});
		currentJobIdRef.current = handle.job.jobId;
		await handle.done;
		currentJobIdRef.current = null;
		const finalJob = backgroundJobs.get({ jobId: handle.job.jobId });
		const succeeded =
			finalJob?.status === "completed" && completedBytes !== null;
		if (succeeded) {
			recordHistory({
				requestDraft,
				label,
				status: "completed",
				destinationName: completedDestinationName,
				sizeBytes: completedBytes,
				error: null,
			});
			toast.success(`已导出 ${completedDestinationName}`, {
				description: `${formatBytes(completedBytes ?? 0)} · ${completedEncoderSummary}`,
			});
			await refreshAvailability({
				expectedName: completedDestinationName,
				attempts: 24,
			});
			return true;
		}
		const status: ExportHistoryStatus =
			cancelled || finalJob?.status === "cancelled" ? "cancelled" : "failed";
		const error =
			completedError ??
			finalJob?.error ??
			(status === "cancelled" ? "Export cancelled" : "Export failed");
		if (queueId) {
			if (status === "cancelled") exportQueue.cancel({ id: queueId });
			else exportQueue.fail({ id: queueId, error });
		}
		recordHistory({
			requestDraft,
			label,
			status,
			destinationName: null,
			sizeBytes: null,
			error,
		});
		return false;
	};

	const runPreflight = async () => {
		setRunningPreflight(true);
		setTab("preflight");
		const checkedCapabilities = await detectExportCapabilities({ draft });
		setCapabilities(checkedCapabilities);
		const handle = backgroundJobs.start({
			kind: "analysis",
			label: "Export preflight",
			run: async ({ update }) => {
				update({ progress: 0.1, step: "Checking project structure" });
				const health: ProjectHealthResult = runProjectHealthCheck(healthInput);
				const lastFrame = Math.max(
					0,
					durationSeconds - draft.fps.denominator / draft.fps.numerator,
				);
				const sampleTimes = [0, durationSeconds / 2, lastFrame].filter(
					(value, index, values) =>
						values.findIndex(
							(candidate) => Math.abs(candidate - value) < 0.01,
						) === index,
				);
				const renderSamples: ExportRenderSample[] = [];
				for (let index = 0; index < sampleTimes.length; index++) {
					const atSeconds = sampleTimes[index];
					update({
						progress: 0.2 + (index / Math.max(1, sampleTimes.length)) * 0.7,
						step: `Rendering sample ${index + 1} of ${sampleTimes.length}`,
					});
					const result = await editor.renderer.renderFrame({
						time: mediaTimeFromSeconds({ seconds: atSeconds }),
					});
					renderSamples.push({
						atSeconds,
						success: result.success,
						...(!result.success ? { error: result.error } : {}),
					});
				}
				setPreflight(
					buildExportPreflight({
						health,
						renderSamples,
						encodingIssues: validateExportDraft({
							draft,
							capabilities: checkedCapabilities,
							timelineDurationSeconds: durationSeconds,
						}),
					}),
				);
			},
		});
		await handle.done;
		setRunningPreflight(false);
	};

	const checkCapabilities = async () => {
		setCheckingCapabilities(true);
		setCapabilities(await detectExportCapabilities({ draft }));
		setCheckingCapabilities(false);
	};

	const addToQueue = () => {
		const preset =
			EXPORT_PLATFORM_PRESETS.find(
				(candidate) => candidate.id === draft.presetId,
			)?.name ?? "Custom export";
		exportQueue.enqueue({
			label: draft.range ? `${preset} · selected range` : preset,
			options: draft,
			projectRevision: revision,
		});
		setTab("queue");
	};

	const runQueue = async () => {
		if (runningQueue) return;
		setRunningQueue(true);
		try {
			let next = exportQueue.nextPending();
			while (next) {
				const currentRevision =
					editor.project.getKnownFileRevision(project.metadata.id) ??
					editor.agent.revision;
				if (currentRevision !== next.projectRevision) {
					exportQueue.start({ id: next.id });
					exportQueue.fail({
						id: next.id,
						error: `Queued revision ${next.projectRevision}; current revision is ${currentRevision}`,
					});
				} else {
					exportQueue.start({ id: next.id });
					await performVideoExport({
						requestDraft: next.options,
						label: next.label,
						queueId: next.id,
					});
				}
				next = exportQueue.nextPending();
			}
		} finally {
			setRunningQueue(false);
		}
	};

	const exportAudio = async ({
		tracks,
		label,
		fileName,
	}: {
		tracks: typeof scene.tracks;
		label: string;
		fileName: string;
	}) => {
		const handle = backgroundJobs.start({
			kind: "export",
			label,
			run: async ({ update }) => {
				const blob = await extractTimelineAudio({
					tracks,
					mediaAssets: media,
					totalDuration: editor.timeline.getTotalDuration(),
					onProgress: (progress) =>
						update({
							progress: progress / 100,
							step: "Mixing timeline audio",
						}),
				});
				downloadBlob({ blob, filename: fileName });
			},
		});
		await handle.done;
	};

	const exportComponent = async ({
		item,
	}: {
		item: ComponentExportPlanItem;
	}) => {
		if (!item.available) {
			toast.error(item.reason ?? "This component is unavailable");
			return;
		}
		const safeProject =
			project.metadata.name.replace(/[<>:"/\\|?*]/g, "-").trim() || "opencut";
		if (item.kind === "still") {
			const result = await editor.renderer.saveSnapshot();
			if (!result.success) toast.error(result.error ?? "Snapshot failed");
			return;
		}
		if (item.kind === "captions") {
			const serialized = serializeSubtitles({
				format: "vtt",
				captions: getCaptionExportCues({
					cues: captionCues,
					styles: project.settings.captionStyles ?? [],
				}),
				canvasSize: project.settings.canvasSize,
			});
			downloadBlob({
				blob: new Blob([serialized.content], { type: serialized.mimeType }),
				filename: `${safeProject}-captions.${serialized.fileExtension}`,
			});
			toast.success(`Exported ${captionCues.length} caption cues`);
			return;
		}
		if (item.kind === "audio-mix") {
			await exportAudio({
				tracks: scene.tracks,
				label: "Export full audio mix",
				fileName: `${safeProject}-mix.wav`,
			});
			return;
		}
		if (item.kind === "audio-stem" && item.trackId) {
			await exportAudio({
				tracks: isolateAudioStemTracks({
					tracks: scene.tracks,
					targetTrackId: item.trackId,
				}),
				label: item.label,
				fileName: `${safeProject}-${item.label.replace(/\s+/g, "-")}.wav`,
			});
			return;
		}
		if (item.kind === "alpha-video") {
			const alphaDraft = createExportDraftFromPreset({
				presetId: "transparent-webm",
				source: sourceSettings,
			});
			await performVideoExport({
				requestDraft: {
					...alphaDraft,
					...(draft.range ? { range: { ...draft.range } } : {}),
				},
				label: "Transparent WebM",
			});
			return;
		}
		if (item.kind === "range-video" && draft.range) {
			await performVideoExport({
				requestDraft: { ...draft, range: { ...draft.range } },
				label: "Selected range",
			});
		}
	};

	const rerunHistory = async ({ entry }: { entry: ExportHistoryEntry }) => {
		const request = historyStore.rerun({ id: entry.id });
		if (!request) return;
		setDraft(request.options);
		setTab("history");
		await performVideoExport({
			requestDraft: request.options,
			label: `${request.label} rerun`,
		});
	};

	const cancelCurrent = () => {
		if (currentJobIdRef.current) {
			backgroundJobs.cancel({ jobId: currentJobIdRef.current });
		}
		editor.project.cancelExport();
	};

	const tabs: Array<{ id: ExportTab; label: string }> = [
		{ id: "setup", label: "Setup" },
		{ id: "preflight", label: "Preflight" },
		{ id: "components", label: "Components" },
		{ id: "queue", label: "Queue" },
		{ id: "history", label: "History" },
	];

	return (
		<div className="bg-background text-foreground flex max-h-[82vh] w-[42rem] flex-col overflow-hidden rounded-xl border shadow-2xl">
			<div className="border-border flex items-start justify-between border-b p-4">
				<div>
					<div className="text-sm font-semibold">Export workspace</div>
					<div className="text-muted-foreground text-[11px]">
						Editable presets · preflight · components · queue · history
					</div>
				</div>
				<button
					type="button"
					className="text-muted-foreground hover:text-foreground text-xs"
					onClick={() => onOpenChange(false)}
				>
					Close
				</button>
			</div>

			<div className="border-border grid grid-cols-5 gap-1 border-b p-2">
				{tabs.map((item) => (
					<button
						key={item.id}
						type="button"
						className={`rounded px-2 py-1.5 text-[11px] font-medium ${
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

			<div className="min-h-0 flex-1 overflow-y-auto p-4">
				{tab === "setup" ? (
					<div className="space-y-4">
						<section>
							<div className="mb-2 text-xs font-semibold">Platform presets</div>
							<div className="grid grid-cols-3 gap-2">
								{EXPORT_PLATFORM_PRESETS.map((preset) => (
									<button
										key={preset.id}
										type="button"
										className={`rounded-lg border p-2 text-left ${
											draft.presetId === preset.id
												? "border-primary bg-primary/5"
												: "border-border hover:bg-muted/60"
										}`}
										onClick={() => applyPreset({ presetId: preset.id })}
									>
										<div className="text-[11px] font-semibold">
											{preset.name}
										</div>
										<div className="text-muted-foreground mt-0.5 text-[9px]">
											{preset.description}
										</div>
									</button>
								))}
							</div>
							<p className="text-muted-foreground mt-1.5 text-[9px]">
								Presets are editable starting points. Every actual encoder value
								remains visible below.
							</p>
						</section>

						<section className="border-border rounded-lg border p-3">
							<div className="mb-3 flex items-center justify-between">
								<div>
									<div className="text-xs font-semibold">Encoding</div>
									<div className="text-muted-foreground text-[9px]">
										Container · resolution · FPS · codec · bitrate · hardware
									</div>
								</div>
								<Button
									size="sm"
									variant="outline"
									onClick={() => void checkCapabilities()}
									disabled={checkingCapabilities}
								>
									{checkingCapabilities ? "Checking…" : "Check support"}
								</Button>
							</div>
							<div className="grid grid-cols-4 gap-2">
								<label className="text-[10px]">
									<span className="mb-1 block opacity-60">Format</span>
									<select
										aria-label="Export format"
										className="bg-background border-input h-8 w-full rounded border px-2"
										value={draft.format}
										onChange={(event) => {
											const format =
												event.target.value === "webm" ? "webm" : "mp4";
											patchDraft({
												update: {
													format,
													videoCodec: format === "webm" ? "vp9" : "avc",
													audioCodec: format === "webm" ? "opus" : "aac",
													includeAlpha: format === "webm" && draft.includeAlpha,
												},
											});
										}}
									>
										<option value="mp4">MP4</option>
										<option value="webm">WebM</option>
									</select>
								</label>
								<label className="text-[10px]">
									<span className="mb-1 block opacity-60">
										交付编码
									</span>
									<select
										aria-label="原生交付编码"
										className="bg-background border-input h-8 w-full rounded border px-2"
										value={deliverySelection}
										onChange={(event) => {
											const value = event.target.value;
											setDeliverySelection(
												isDeliverySelection(value)
													? value
													: "browser",
											);
										}}
									>
										<option value="browser">浏览器直接导出</option>
										<option value="h264-mp4">H.264 MP4</option>
										<option value="hevc-mp4">HEVC MP4</option>
										<option value="hevc10-mp4">
											HEVC 10-bit MP4
										</option>
										<option value="h264-mov">H.264 MOV</option>
										<option value="hevc-mov">HEVC MOV</option>
										<option value="hevc10-mov">
											HEVC 10-bit MOV
										</option>
										<option value="h264-mov-pcm">
											H.264 MOV + PCM
										</option>
										<option value="hevc10-mov-pcm">
											HEVC 10-bit MOV + PCM
										</option>
										<option value="vp9-webm">VP9 WebM</option>
										<option value="av1-webm">AV1 WebM</option>
										<option value="wav-pcm">WAV PCM</option>
										<option value="m4a-aac">M4A AAC</option>
										<option value="mp3">MP3</option>
										<option value="flac">FLAC</option>
										<option value="ogg-opus">Ogg Opus</option>
									</select>
								</label>
								<label className="text-[10px]">
									<span className="mb-1 block opacity-60">Width</span>
									<input
										aria-label="Export width"
										className="bg-background border-input h-8 w-full rounded border px-2"
										type="number"
										min={16}
										max={8192}
										value={draft.width}
										onChange={(event) =>
											patchDraft({
												update: {
													width: numberFromInput({
														value: event.target.value,
														fallback: draft.width,
													}),
												},
											})
										}
									/>
								</label>
								<label className="text-[10px]">
									<span className="mb-1 block opacity-60">Height</span>
									<input
										aria-label="Export height"
										className="bg-background border-input h-8 w-full rounded border px-2"
										type="number"
										min={16}
										max={8192}
										value={draft.height}
										onChange={(event) =>
											patchDraft({
												update: {
													height: numberFromInput({
														value: event.target.value,
														fallback: draft.height,
													}),
												},
											})
										}
									/>
								</label>
								<label className="text-[10px]">
									<span className="mb-1 block opacity-60">Frame rate</span>
									<select
										aria-label="Export frame rate"
										className="bg-background border-input h-8 w-full rounded border px-2"
										value={draft.fps.numerator / draft.fps.denominator}
										onChange={(event) =>
											patchDraft({
												update: {
													fps: {
														numerator: Number(event.target.value),
														denominator: 1,
													},
												},
											})
										}
									>
										{[24, 25, 30, 50, 60].map((fps) => (
											<option key={fps} value={fps}>
												{fps} fps
											</option>
										))}
									</select>
								</label>
								<label className="text-[10px]">
									<span className="mb-1 block opacity-60">Video codec</span>
									<select
										aria-label="Video codec"
										className="bg-background border-input h-8 w-full rounded border px-2"
										value={draft.videoCodec}
										onChange={(event) =>
											patchDraft({
												update: {
													videoCodec:
														event.target.value === "av1"
															? "av1"
															: event.target.value === "vp9"
																? "vp9"
																: "avc",
												},
											})
										}
									>
										{draft.format === "mp4" ? (
											<option value="avc">H.264 / AVC</option>
										) : (
											<>
												<option value="vp9">VP9</option>
												<option value="av1">AV1</option>
											</>
										)}
									</select>
								</label>
								<label className="text-[10px]">
									<span className="mb-1 block opacity-60">Video bitrate</span>
									<div className="relative">
										<input
											aria-label="Video bitrate Mbps"
											className="bg-background border-input h-8 w-full rounded border px-2 pr-10"
											type="number"
											min={0.25}
											max={200}
											step={0.25}
											value={draft.videoBitrate / 1_000_000}
											onChange={(event) =>
												patchDraft({
													update: {
														videoBitrate:
															numberFromInput({
																value: event.target.value,
																fallback: draft.videoBitrate / 1_000_000,
															}) * 1_000_000,
													},
												})
											}
										/>
										<span className="absolute top-2 right-2 opacity-50">
											Mbps
										</span>
									</div>
								</label>
								<label className="text-[10px]">
									<span className="mb-1 block opacity-60">Audio codec</span>
									<select
										aria-label="Audio codec"
										className="bg-background border-input h-8 w-full rounded border px-2"
										value={draft.audioCodec}
										disabled={!draft.includeAudio}
										onChange={(event) =>
											patchDraft({
												update: {
													audioCodec:
														event.target.value === "opus" ? "opus" : "aac",
												},
											})
										}
									>
										<option value={draft.format === "mp4" ? "aac" : "opus"}>
											{draft.format === "mp4" ? "AAC" : "Opus"}
										</option>
									</select>
								</label>
								<label className="text-[10px]">
									<span className="mb-1 block opacity-60">Audio bitrate</span>
									<div className="relative">
										<input
											aria-label="Audio bitrate Kbps"
											className="bg-background border-input h-8 w-full rounded border px-2 pr-10"
											type="number"
											min={32}
											max={512}
											step={16}
											disabled={!draft.includeAudio}
											value={draft.audioBitrate / 1000}
											onChange={(event) =>
												patchDraft({
													update: {
														audioBitrate:
															numberFromInput({
																value: event.target.value,
																fallback: draft.audioBitrate / 1000,
															}) * 1000,
													},
												})
											}
										/>
										<span className="absolute top-2 right-2 opacity-50">
											Kbps
										</span>
									</div>
								</label>
							</div>
							<div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
								<label
									className="flex items-center gap-2"
									htmlFor="advanced-export-include-audio"
								>
									<Checkbox
										id="advanced-export-include-audio"
										checked={draft.includeAudio}
										onCheckedChange={(checked) =>
											patchDraft({ update: { includeAudio: checked === true } })
										}
									/>
									Include audio
								</label>
								<label
									className="flex items-center gap-2"
									htmlFor="advanced-export-include-alpha"
								>
									<Checkbox
										id="advanced-export-include-alpha"
										checked={draft.includeAlpha}
										disabled={draft.format !== "webm"}
										onCheckedChange={(checked) =>
											patchDraft({ update: { includeAlpha: checked === true } })
										}
									/>
									Keep alpha
								</label>
								<label>
									<select
										aria-label="Hardware acceleration"
										className="bg-background border-input h-8 w-full rounded border px-2"
										value={draft.hardwareAcceleration}
										onChange={(event) =>
											patchDraft({
												update: {
													hardwareAcceleration:
														event.target.value === "prefer-software"
															? "prefer-software"
															: event.target.value === "no-preference"
																? "no-preference"
																: "prefer-hardware",
												},
											})
										}
									>
										<option value="prefer-hardware">Prefer hardware</option>
										<option value="no-preference">Auto</option>
										<option value="prefer-software">Prefer software</option>
									</select>
								</label>
							</div>
							{capabilities ? (
								<div className="mt-2 flex gap-2 text-[9px]">
									<span className="rounded bg-emerald-500/10 px-2 py-1">
										Video{" "}
										{capabilities.videoCodecSupported ? "supported" : "blocked"}
									</span>
									<span className="rounded bg-emerald-500/10 px-2 py-1">
										Audio{" "}
										{capabilities.audioCodecSupported ? "supported" : "blocked"}
									</span>
									<span className="rounded bg-sky-500/10 px-2 py-1">
										Hardware preference{" "}
										{capabilities.hardwareAccelerationAvailable
											? "accepted"
											: "not confirmed"}
									</span>
								</div>
							) : null}
						</section>

						<section className="border-border rounded-lg border p-3">
							<div className="mb-2 flex items-center justify-between">
								<div>
									<div className="text-xs font-semibold">Range</div>
									<div className="text-muted-foreground text-[9px]">
										Leave empty for the full {durationSeconds.toFixed(2)}s
										timeline
									</div>
								</div>
								{draft.range ? (
									<button
										type="button"
										className="text-primary text-[10px]"
										onClick={() => patchDraft({ update: { range: undefined } })}
									>
										Clear range
									</button>
								) : null}
							</div>
							<div className="grid grid-cols-2 gap-2">
								<label className="text-[10px]">
									<span className="mb-1 block opacity-60">In seconds</span>
									<input
										aria-label="Export range start"
										className="bg-background border-input h-8 w-full rounded border px-2"
										type="number"
										min={0}
										max={durationSeconds}
										step={0.01}
										value={draft.range?.startSeconds ?? ""}
										placeholder="0.00"
										onChange={(event) =>
											patchDraft({
												update: {
													range: {
														startSeconds: numberFromInput({
															value: event.target.value,
															fallback: 0,
														}),
														endSeconds:
															draft.range?.endSeconds ?? durationSeconds,
													},
												},
											})
										}
									/>
								</label>
								<label className="text-[10px]">
									<span className="mb-1 block opacity-60">Out seconds</span>
									<input
										aria-label="Export range end"
										className="bg-background border-input h-8 w-full rounded border px-2"
										type="number"
										min={0}
										max={durationSeconds}
										step={0.01}
										value={draft.range?.endSeconds ?? ""}
										placeholder={durationSeconds.toFixed(2)}
										onChange={(event) =>
											patchDraft({
												update: {
													range: {
														startSeconds: draft.range?.startSeconds ?? 0,
														endSeconds: numberFromInput({
															value: event.target.value,
															fallback: durationSeconds,
														}),
													},
												},
											})
										}
									/>
								</label>
							</div>
						</section>

						<div className="grid grid-cols-3 gap-2">
							<div className="bg-muted/40 rounded-lg p-2">
								<div className="text-muted-foreground text-[9px]">
									Duration estimate
								</div>
								<div className="text-xs font-semibold">
									{formatDuration(estimate.durationSeconds)}
								</div>
							</div>
							<div className="bg-muted/40 rounded-lg p-2">
								<div className="text-muted-foreground text-[9px]">
									Size estimate
								</div>
								<div className="text-xs font-semibold">
									≈ {formatBytes(estimate.estimatedBytes)}
								</div>
							</div>
							<div className="bg-muted/40 rounded-lg p-2">
								<div className="text-muted-foreground text-[9px]">
									Render estimate
								</div>
								<div className="text-xs font-semibold">
									≈ {formatDuration(estimate.estimatedRenderSeconds)}
								</div>
							</div>
						</div>
						<p className="text-muted-foreground text-[9px]">
							{estimate.label}.
						</p>

						{validationIssues.length > 0 ? (
							<ul className="space-y-1">
								{validationIssues.map((issue) => (
									<li
										key={issue.code}
										className={`rounded p-2 text-[10px] ${
											issue.severity === "error"
												? "bg-red-500/10 text-red-600"
												: "bg-amber-500/10 text-amber-700"
										}`}
									>
										{issue.message}
									</li>
								))}
							</ul>
						) : null}
					</div>
				) : null}

				{tab === "preflight" ? (
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<div>
								<div className="text-xs font-semibold">Export preflight</div>
								<div className="text-muted-foreground text-[9px]">
									Project health + representative render samples + encoder
									support
								</div>
							</div>
							<Button
								size="sm"
								onClick={() => void runPreflight()}
								disabled={runningPreflight}
							>
								{runningPreflight ? "Checking…" : "Run preflight"}
							</Button>
						</div>
						{preflight ? (
							<>
								<div
									className={`rounded-lg border p-3 ${
										preflight.ready
											? "border-emerald-500/30 bg-emerald-500/10"
											: "border-red-500/30 bg-red-500/10"
									}`}
								>
									<div className="text-xs font-semibold">
										{preflight.ready
											? "Ready to export"
											: "Resolve blocking findings"}
									</div>
									<div className="text-[9px] opacity-65">
										{preflight.checkedSamples} representative frames rendered ·{" "}
										{preflight.findings.length} findings
									</div>
								</div>
								<ul className="space-y-1.5">
									{preflight.findings.map((finding) => (
										<li
											key={finding.id}
											className="border-border flex items-start gap-2 rounded border p-2 text-[10px]"
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
											<div className="min-w-0 flex-1">
												<div>{finding.message}</div>
												<div className="mt-0.5 text-[8px] uppercase opacity-50">
													{finding.source}
												</div>
											</div>
											{finding.atSeconds !== undefined ? (
												<button
													type="button"
													className="text-primary shrink-0"
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
							</>
						) : (
							<div className="border-border rounded-lg border border-dashed p-8 text-center text-[11px] opacity-55">
								Run preflight before a final export. Render samples use the same
								scene builder as the encoder.
							</div>
						)}
					</div>
				) : null}

				{tab === "components" ? (
					<div className="space-y-3">
						<div>
							<div className="text-xs font-semibold">Component exports</div>
							<div className="text-muted-foreground text-[9px]">
								Deliver a mix, isolated stems, captions, still, alpha, or range
							</div>
						</div>
						<ul className="grid grid-cols-2 gap-2">
							{componentPlan.map((item) => (
								<li
									key={item.id}
									className="border-border flex items-center justify-between gap-2 rounded-lg border p-2"
								>
									<div className="min-w-0">
										<div className="truncate text-[10px] font-medium">
											{item.label}
										</div>
										<div className="text-muted-foreground text-[8px]">
											{item.available ? item.kind : item.reason}
										</div>
									</div>
									<Button
										size="sm"
										variant="outline"
										disabled={!item.available}
										onClick={() => void exportComponent({ item })}
									>
										Export
									</Button>
								</li>
							))}
						</ul>
					</div>
				) : null}

				{tab === "queue" ? (
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<div>
								<div className="text-xs font-semibold">Batch export queue</div>
								<div className="text-muted-foreground text-[9px]">
									Each preset, range, and revision keeps independent state
								</div>
							</div>
							<div className="flex gap-2">
								<Button size="sm" variant="outline" onClick={addToQueue}>
									Add current
								</Button>
								<Button
									size="sm"
									onClick={() => void runQueue()}
									disabled={
										runningQueue ||
										!queueItems.some((item) => item.status === "pending")
									}
								>
									{runningQueue ? "Running…" : "Run queue"}
								</Button>
							</div>
						</div>
						{queueItems.length === 0 ? (
							<div className="border-border rounded-lg border border-dashed p-8 text-center text-[11px] opacity-55">
								Add the current setup, switch presets or ranges, then add
								another.
							</div>
						) : (
							<ul className="space-y-2">
								{queueItems.map((item) => (
									<li
										key={item.id}
										className="border-border rounded-lg border p-2"
									>
										<div className="flex items-center justify-between gap-2">
											<div className="min-w-0">
												<div className="truncate text-[10px] font-medium">
													{item.label}
												</div>
												<div className="text-muted-foreground text-[8px]">
													rev {item.projectRevision} · attempt {item.attempts} ·{" "}
													{item.options.width}×{item.options.height}
												</div>
											</div>
											<div className="flex items-center gap-2">
												<span className="text-[9px] uppercase">
													{item.status}
												</span>
												{item.status === "failed" ||
												item.status === "cancelled" ? (
													<button
														type="button"
														className="text-primary text-[9px]"
														onClick={() => exportQueue.retry({ id: item.id })}
													>
														Retry
													</button>
												) : null}
											</div>
										</div>
										<Progress
											value={item.progress * 100}
											className="mt-2 h-1"
										/>
										{item.error ? (
											<div className="mt-1 text-[9px] text-red-500">
												{item.error}
											</div>
										) : null}
										{item.outputName ? (
											<div className="text-muted-foreground mt-1 text-[8px]">
												{item.outputName} · {formatBytes(item.sizeBytes ?? 0)}
											</div>
										) : null}
									</li>
								))}
							</ul>
						)}
					</div>
				) : null}

				{tab === "history" ? (
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<div>
								<div className="text-xs font-semibold">Export history</div>
								<div className="text-muted-foreground text-[9px]">
									Settings, destination, result, errors, availability, and rerun
								</div>
							</div>
							<Button
								size="sm"
								variant="outline"
								onClick={() => void refreshAvailability()}
							>
								Refresh files
							</Button>
						</div>
						{history.length === 0 ? (
							<div className="border-border rounded-lg border border-dashed p-8 text-center text-[11px] opacity-55">
								Completed, failed, and cancelled runs will appear here.
							</div>
						) : (
							<ul className="space-y-2">
								{history.map((entry) => (
									<li
										key={entry.id}
										className="border-border rounded-lg border p-2"
									>
										<div className="flex items-center justify-between gap-2">
											<div className="min-w-0">
												<div className="truncate text-[10px] font-medium">
													{entry.label}
												</div>
												<div className="text-muted-foreground text-[8px]">
													rev {entry.projectRevision} · {entry.options.width}×
													{entry.options.height} ·{" "}
													{entry.options.format.toUpperCase()}
												</div>
											</div>
											<div className="flex items-center gap-2">
												<span
													className={`text-[9px] uppercase ${
														entry.status === "failed"
															? "text-red-500"
															: entry.status === "cancelled"
																? "text-amber-500"
																: "text-emerald-500"
													}`}
												>
													{entry.status}
												</span>
												<Button
													size="sm"
													variant="outline"
													onClick={() => void rerunHistory({ entry })}
												>
													Rerun
												</Button>
											</div>
										</div>
										<div className="text-muted-foreground mt-1 text-[8px]">
											{entry.destinationName
												? `${entry.destinationName} · ${
														entry.available
															? "file available"
															: "file unavailable"
													}`
												: entry.error}
										</div>
									</li>
								))}
							</ul>
						)}
					</div>
				) : null}
			</div>

			<div className="border-border border-t p-3">
				{exportState.isExporting ? (
					<div className="space-y-2">
						<div className="flex justify-between text-[10px]">
							<span>Encoding {Math.round(exportState.progress * 100)}%</span>
							<span>
								{remainingSeconds === null
									? "Estimating time…"
									: `≈ ${formatDuration(remainingSeconds)} remaining`}
							</span>
						</div>
						<Progress value={exportState.progress * 100} />
						<Button
							variant="outline"
							className="w-full"
							onClick={cancelCurrent}
						>
							Cancel current export
						</Button>
					</div>
				) : (
					<div className="grid grid-cols-3 gap-2">
						<Button variant="outline" onClick={() => void runPreflight()}>
							Preflight
						</Button>
						<Button variant="outline" onClick={addToQueue}>
							Add to queue
						</Button>
						<Button
							onClick={() =>
								void performVideoExport({
									requestDraft: draft,
									label:
										EXPORT_PLATFORM_PRESETS.find(
											(preset) => preset.id === draft.presetId,
										)?.name ?? "Custom export",
								})
							}
							disabled={validationIssues.some(
								(issue) => issue.severity === "error",
							)}
						>
							Export now
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
