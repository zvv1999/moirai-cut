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

const EXPORT_PRESET_COPY: Record<
	ExportPresetId,
	{ name: string; description: string }
> = {
	source: { name: "匹配工程", description: "沿用工程画布和帧率" },
	"landscape-hd": { name: "横屏高清", description: "1920×1080 · H.264" },
	"vertical-social": {
		name: "竖屏社交媒体",
		description: "1080×1920 · Reels / TikTok / Shorts",
	},
	"square-social": { name: "方形社交媒体", description: "1080×1080 · 信息流" },
	"youtube-4k": {
		name: "YouTube 4K",
		description: "3840×2160 · 高码率",
	},
	"transparent-webm": {
		name: "透明 WebM",
		description: "VP9 Alpha · 叠加层交付",
	},
};

const EXPORT_STATUS_LABELS: Record<ExportHistoryStatus, string> = {
	completed: "已完成",
	failed: "失败",
	cancelled: "已取消",
};

const QUEUE_STATUS_LABELS: Record<ExportQueueItem["status"], string> = {
	pending: "等待中",
	running: "运行中",
	completed: "已完成",
	failed: "失败",
	cancelled: "已取消",
};

const PREFLIGHT_SOURCE_LABELS = {
	health: "工程健康",
	render: "画面渲染",
	encoding: "编码设置",
} as const;

const VALIDATION_MESSAGE_LABELS: Record<string, string> = {
	invalid_resolution: "分辨率必须是 16 到 8192 之间的整数像素。",
	invalid_frame_rate: "帧率必须大于 0。",
	invalid_video_bitrate: "视频码率必须在 0.25 到 200 Mbps 之间。",
	invalid_audio_bitrate: "音频码率必须在 32 到 512 Kbps 之间。",
	invalid_range: "导出范围无效或超出时间线。",
	container_video_codec: "当前封装格式不支持所选视频编码器。",
	container_audio_codec: "当前封装格式不支持所选音频编码器。",
	alpha_container: "透明视频需要使用 WebM。",
	video_codec_unavailable: "当前浏览器不支持所选视频编码器。",
	audio_codec_unavailable: "当前浏览器不支持所选音频编码器。",
	hardware_unavailable: "未确认硬件编码能力，可能回退到软件编码。",
};

function getPresetCopy(presetId: ExportPresetId) {
	return EXPORT_PRESET_COPY[presetId];
}

function componentLabel(item: ComponentExportPlanItem): string {
	switch (item.kind) {
		case "audio-mix":
			return "完整音频混音（WAV）";
		case "audio-stem":
			return `${item.label.replace(/ stem \\(WAV\\)$/, "")} 分轨（WAV）`;
		case "captions":
			return "字幕（WebVTT）";
		case "still":
			return "播放头静帧（PNG）";
		case "alpha-video":
			return "透明视频（WebM）";
		case "range-video":
			return "所选范围视频";
	}
}

function componentReason(item: ComponentExportPlanItem): string {
	if (item.available) {
		const kindLabels: Record<ComponentExportPlanItem["kind"], string> = {
			"audio-mix": "音频混音",
			"audio-stem": "独立分轨",
			captions: "字幕文件",
			still: "静帧图片",
			"alpha-video": "透明视频",
			"range-video": "范围视频",
		};
		return kindLabels[item.kind];
	}
	switch (item.kind) {
		case "audio-mix":
			return "没有可听轨道";
		case "captions":
			return "没有字幕片段";
		case "alpha-video":
			return "VP9 Alpha 不可用";
		case "range-video":
			return "请设置有效的入点和出点";
		default:
			return item.reason ?? "当前组件不可用";
	}
}

function localizePreflightMessage(
	finding: ExportPreflightResult["findings"][number],
): string {
	if (finding.source === "encoding") {
		return (
			VALIDATION_MESSAGE_LABELS[finding.id.replace(/^encoding:/, "")] ??
			finding.message
		);
	}
	if (
		finding.source === "render" &&
		finding.message === "Representative frame did not render."
	) {
		return "代表性画面渲染失败。";
	}
	if (finding.message === "The project has no visual content to export.") {
		return "工程中没有可导出的画面内容。";
	}
	const overlap = finding.message.match(/^(.+) overlaps (.+) on (.+)\.$/);
	if (overlap) {
		return `${overlap[1]} 与 ${overlap[2]} 在 ${overlap[3]} 上发生重叠。`;
	}
	const emptyRange = finding.message.match(
		/^Nothing exists from (.+)s to (.+)s\.$/,
	);
	if (emptyRange) {
		return `${emptyRange[1]} 秒到 ${emptyRange[2]} 秒之间没有内容。`;
	}
	return finding.message
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
	if (seconds < 60) return `${Math.ceil(seconds)} 秒`;
	const minutes = Math.floor(seconds / 60);
	return `${minutes} 分 ${Math.ceil(seconds % 60)} 秒`;
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
			toast.error("请检查导出设置", {
				description:
					VALIDATION_MESSAGE_LABELS[blocking.code] ?? blocking.message,
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
						step: `正在编码 ${Math.round(state.progress * 100)}%`,
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
					throw new Error(result.error || "导出未生成文件");
				}
				if (deliverySelection === "browser") {
					update({ progress: 0.99, step: "正在准备下载" });
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
			(status === "cancelled" ? "导出已取消" : "导出失败");
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
			label: "导出预检",
			run: async ({ update }) => {
				update({ progress: 0.1, step: "正在检查工程结构" });
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
						step: `正在渲染样本 ${index + 1} / ${sampleTimes.length}`,
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
		const preset = getPresetCopy(draft.presetId).name;
		exportQueue.enqueue({
			label: draft.range ? `${preset} · 所选范围` : preset,
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
						error: `队列版本为 ${next.projectRevision}，当前版本为 ${currentRevision}`,
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
							step: "正在混合时间线音频",
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
			toast.error(componentReason(item));
			return;
		}
		const safeProject =
			project.metadata.name.replace(/[<>:"/\\|?*]/g, "-").trim() || "opencut";
		if (item.kind === "still") {
			const result = await editor.renderer.saveSnapshot();
			if (!result.success) toast.error(result.error ?? "保存快照失败");
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
			toast.success(`已导出 ${captionCues.length} 条字幕`);
			return;
		}
		if (item.kind === "audio-mix") {
			await exportAudio({
				tracks: scene.tracks,
				label: "导出完整音频混音",
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
				label: "透明 WebM",
			});
			return;
		}
		if (item.kind === "range-video" && draft.range) {
			await performVideoExport({
				requestDraft: { ...draft, range: { ...draft.range } },
				label: "所选范围",
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
			label: `${request.label} · 重新运行`,
		});
	};

	const cancelCurrent = () => {
		if (currentJobIdRef.current) {
			backgroundJobs.cancel({ jobId: currentJobIdRef.current });
		}
		editor.project.cancelExport();
	};

	const tabs: Array<{ id: ExportTab; label: string }> = [
		{ id: "setup", label: "设置" },
		{ id: "preflight", label: "预检" },
		{ id: "components", label: "分项导出" },
		{ id: "queue", label: "队列" },
		{ id: "history", label: "历史" },
	];

	return (
		<div className="bg-background text-foreground flex max-h-[82vh] w-[42rem] flex-col overflow-hidden rounded-xl border shadow-2xl">
			<div className="border-border flex items-start justify-between border-b p-4">
				<div>
					<div className="text-sm font-semibold">导出工作台</div>
					<div className="text-muted-foreground text-[11px]">
						可编辑预设 · 预检 · 分项导出 · 队列 · 历史
					</div>
				</div>
				<button
					type="button"
					className="text-muted-foreground hover:text-foreground text-xs"
					onClick={() => onOpenChange(false)}
				>
					关闭
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
							<div className="mb-2 text-xs font-semibold">平台预设</div>
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
											{getPresetCopy(preset.id).name}
										</div>
										<div className="text-muted-foreground mt-0.5 text-[9px]">
											{getPresetCopy(preset.id).description}
										</div>
									</button>
								))}
							</div>
							<p className="text-muted-foreground mt-1.5 text-[9px]">
								预设只是可编辑的起点，所有实际编码参数都显示在下方。
							</p>
						</section>

						<section className="border-border rounded-lg border p-3">
							<div className="mb-3 flex items-center justify-between">
								<div>
									<div className="text-xs font-semibold">编码设置</div>
									<div className="text-muted-foreground text-[9px]">
										封装 · 分辨率 · 帧率 · 编码器 · 码率 · 硬件
									</div>
								</div>
								<Button
									size="sm"
									variant="outline"
									onClick={() => void checkCapabilities()}
									disabled={checkingCapabilities}
								>
									{checkingCapabilities ? "检查中…" : "检查支持情况"}
								</Button>
							</div>
							<div className="grid grid-cols-4 gap-2">
								<label className="text-[10px]">
									<span className="mb-1 block opacity-60">格式</span>
									<select
										aria-label="导出格式"
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
									<span className="mb-1 block opacity-60">宽度</span>
									<input
										aria-label="导出宽度"
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
									<span className="mb-1 block opacity-60">高度</span>
									<input
										aria-label="导出高度"
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
									<span className="mb-1 block opacity-60">帧率</span>
									<select
										aria-label="导出帧率"
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
									<span className="mb-1 block opacity-60">视频编码器</span>
									<select
										aria-label="视频编码器"
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
									<span className="mb-1 block opacity-60">视频码率</span>
									<div className="relative">
										<input
											aria-label="视频码率 Mbps"
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
									<span className="mb-1 block opacity-60">音频编码器</span>
									<select
										aria-label="音频编码器"
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
									<span className="mb-1 block opacity-60">音频码率</span>
									<div className="relative">
										<input
											aria-label="音频码率 Kbps"
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
									包含音频
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
									保留 Alpha 通道
								</label>
								<label>
									<select
										aria-label="硬件加速"
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
										<option value="prefer-hardware">优先硬件</option>
										<option value="no-preference">自动</option>
										<option value="prefer-software">优先软件</option>
									</select>
								</label>
							</div>
							{capabilities ? (
								<div className="mt-2 flex gap-2 text-[9px]">
									<span className="rounded bg-emerald-500/10 px-2 py-1">
										视频{" "}
										{capabilities.videoCodecSupported ? "受支持" : "不可用"}
									</span>
									<span className="rounded bg-emerald-500/10 px-2 py-1">
										音频{" "}
										{capabilities.audioCodecSupported ? "受支持" : "不可用"}
									</span>
									<span className="rounded bg-sky-500/10 px-2 py-1">
										硬件偏好{" "}
										{capabilities.hardwareAccelerationAvailable
											? "可用"
											: "未确认"}
									</span>
								</div>
							) : null}
						</section>

						<section className="border-border rounded-lg border p-3">
							<div className="mb-2 flex items-center justify-between">
								<div>
									<div className="text-xs font-semibold">导出范围</div>
									<div className="text-muted-foreground text-[9px]">
										留空将导出完整的 {durationSeconds.toFixed(2)} 秒时间线
									</div>
								</div>
								{draft.range ? (
									<button
										type="button"
										className="text-primary text-[10px]"
										onClick={() => patchDraft({ update: { range: undefined } })}
									>
										清除范围
									</button>
								) : null}
							</div>
							<div className="grid grid-cols-2 gap-2">
								<label className="text-[10px]">
									<span className="mb-1 block opacity-60">入点（秒）</span>
									<input
										aria-label="导出范围起点"
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
									<span className="mb-1 block opacity-60">出点（秒）</span>
									<input
										aria-label="导出范围终点"
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
									时长估算
								</div>
								<div className="text-xs font-semibold">
									{formatDuration(estimate.durationSeconds)}
								</div>
							</div>
							<div className="bg-muted/40 rounded-lg p-2">
								<div className="text-muted-foreground text-[9px]">
									文件大小估算
								</div>
								<div className="text-xs font-semibold">
									≈ {formatBytes(estimate.estimatedBytes)}
								</div>
							</div>
							<div className="bg-muted/40 rounded-lg p-2">
								<div className="text-muted-foreground text-[9px]">
									渲染耗时估算
								</div>
								<div className="text-xs font-semibold">
									≈ {formatDuration(estimate.estimatedRenderSeconds)}
								</div>
							</div>
						</div>
						<p className="text-muted-foreground text-[9px]">
							根据已配置码率和像素吞吐量进行规划估算。
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
										{VALIDATION_MESSAGE_LABELS[issue.code] ?? issue.message}
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
								<div className="text-xs font-semibold">导出预检</div>
								<div className="text-muted-foreground text-[9px]">
									工程健康 + 代表性渲染样本 + 编码器支持
								</div>
							</div>
							<Button
								size="sm"
								onClick={() => void runPreflight()}
								disabled={runningPreflight}
							>
								{runningPreflight ? "检查中…" : "运行预检"}
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
											? "可以导出"
											: "请先解决阻塞问题"}
									</div>
									<div className="text-[9px] opacity-65">
										已渲染 {preflight.checkedSamples} 个代表性画面 ·{" "}
										{preflight.findings.length} 个问题
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
												<div>{localizePreflightMessage(finding)}</div>
												<div className="mt-0.5 text-[8px] uppercase opacity-50">
													{PREFLIGHT_SOURCE_LABELS[finding.source]}
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
													前往 {finding.atSeconds.toFixed(2)} 秒
												</button>
											) : null}
										</li>
									))}
								</ul>
							</>
						) : (
							<div className="border-border rounded-lg border border-dashed p-8 text-center text-[11px] opacity-55">
								最终导出前请运行预检。渲染样本与编码器使用同一场景构建器。
							</div>
						)}
					</div>
				) : null}

				{tab === "components" ? (
					<div className="space-y-3">
						<div>
							<div className="text-xs font-semibold">分项导出</div>
							<div className="text-muted-foreground text-[9px]">
								交付混音、独立分轨、字幕、静帧、透明视频或所选范围
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
											{componentLabel(item)}
										</div>
										<div className="text-muted-foreground text-[8px]">
											{componentReason(item)}
										</div>
									</div>
									<Button
										size="sm"
										variant="outline"
										disabled={!item.available}
										onClick={() => void exportComponent({ item })}
									>
										导出
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
								<div className="text-xs font-semibold">批量导出队列</div>
								<div className="text-muted-foreground text-[9px]">
									每个预设、范围和版本都保留独立状态
								</div>
							</div>
							<div className="flex gap-2">
								<Button size="sm" variant="outline" onClick={addToQueue}>
									添加当前设置
								</Button>
								<Button
									size="sm"
									onClick={() => void runQueue()}
									disabled={
										runningQueue ||
										!queueItems.some((item) => item.status === "pending")
									}
								>
									{runningQueue ? "运行中…" : "运行队列"}
								</Button>
							</div>
						</div>
						{queueItems.length === 0 ? (
							<div className="border-border rounded-lg border border-dashed p-8 text-center text-[11px] opacity-55">
								添加当前设置后，可切换预设或范围并继续添加。
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
													版本 {item.projectRevision} · 第 {item.attempts} 次尝试 ·{" "}
													{item.options.width}×{item.options.height}
												</div>
											</div>
											<div className="flex items-center gap-2">
												<span className="text-[9px] uppercase">
													{QUEUE_STATUS_LABELS[item.status]}
												</span>
												{item.status === "failed" ||
												item.status === "cancelled" ? (
													<button
														type="button"
														className="text-primary text-[9px]"
														onClick={() => exportQueue.retry({ id: item.id })}
													>
														重试
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
								<div className="text-xs font-semibold">导出历史</div>
								<div className="text-muted-foreground text-[9px]">
									设置、目标、结果、错误、文件状态和重新运行
								</div>
							</div>
							<Button
								size="sm"
								variant="outline"
								onClick={() => void refreshAvailability()}
							>
								刷新文件
							</Button>
						</div>
						{history.length === 0 ? (
							<div className="border-border rounded-lg border border-dashed p-8 text-center text-[11px] opacity-55">
								已完成、失败和取消的导出会显示在这里。
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
													版本 {entry.projectRevision} · {entry.options.width}×
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
													{EXPORT_STATUS_LABELS[entry.status]}
												</span>
												<Button
													size="sm"
													variant="outline"
													onClick={() => void rerunHistory({ entry })}
												>
													重新运行
												</Button>
											</div>
										</div>
										<div className="text-muted-foreground mt-1 text-[8px]">
											{entry.destinationName
												? `${entry.destinationName} · ${
														entry.available
															? "文件可用"
															: "文件不可用"
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
							<span>正在编码 {Math.round(exportState.progress * 100)}%</span>
							<span>
								{remainingSeconds === null
									? "正在估算时间…"
									: `约剩余 ${formatDuration(remainingSeconds)}`}
							</span>
						</div>
						<Progress value={exportState.progress * 100} />
						<Button
							variant="outline"
							className="w-full"
							onClick={cancelCurrent}
						>
							取消当前导出
						</Button>
					</div>
				) : (
					<div className="grid grid-cols-3 gap-2">
						<Button variant="outline" onClick={() => void runPreflight()}>
							预检
						</Button>
						<Button variant="outline" onClick={addToQueue}>
							加入队列
						</Button>
						<Button
							onClick={() =>
								void performVideoExport({
									requestDraft: draft,
									label:
										getPresetCopy(draft.presetId).name,
								})
							}
							disabled={validationIssues.some(
								(issue) => issue.severity === "error",
							)}
						>
							立即导出
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
