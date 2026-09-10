"use client";

import Image from "next/image";
import { FootageOrigin } from "@/footage/lineage-view";
import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import type { MediaAsset } from "@/media/types";
import {
	getDefaultSourceRange,
	getSourceDurationSeconds,
	buildElementFromSourceRange,
	resolveSourceOverwriteTarget,
	updateSourceRangePoint,
	type SourceRange,
} from "@/media/source-range";
import { Pause, Play, RotateCcw, X } from "lucide-react";
import {
	checkBrowserDecodeSupport,
	requestMediaProbe,
	type AgentMediaProbeResult,
} from "@/agent/media-codec";
import { useEditor } from "@/editor/use-editor";
import { getMediaAssetPlaybackSource } from "@/media/proxy";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { toast } from "sonner";
import { cn } from "@/utils/ui";

function localizeOverwriteReason(reason: string | null): string | undefined {
	if (!reason) return undefined;
	const match = reason.match(
		/^Unlock a (video|audio) track before overwriting$/,
	);
	if (!match) return reason;
	return `请先解锁一条${match[1] === "video" ? "视频" : "音频"}轨道再执行覆盖`;
}

export function SourcePreviewPanel({ asset }: { asset: MediaAsset }) {
	const editor = useEditor();
	const activeTracks = useEditor((e) => e.scenes.getActiveScene().tracks);
	const projectId = useEditor((e) => e.project.getActive().metadata.id);
	const { selectedElements } = useElementSelection();
	const closeSourcePreview = useAssetsPanelStore(
		(state) => state.closeSourcePreview,
	);
	const overwriteTarget = useMemo(
		() =>
			resolveSourceOverwriteTarget({
				tracks: activeTracks,
				selectedElements,
				mediaType: asset.type,
			}),
		[activeTracks, asset.type, selectedElements],
	);
	const overwriteTrack =
		overwriteTarget.trackId === null
			? null
			: editor.timeline.getTrackById({ trackId: overwriteTarget.trackId });
	const mediaTypeLabel =
		asset.type === "video" ? "视频" : asset.type === "audio" ? "音频" : "图片";

	const insertSourceRange = ({ range }: { range: SourceRange }) => {
		editor.timeline.insertElement({
			element: buildElementFromSourceRange({
				asset,
				range,
				startTime: editor.playback.getCurrentTime(),
			}),
			placement: { mode: "auto" },
		});
		toast.success("已插入源素材范围", {
			description: `${asset.name} 已添加到播放头位置。`,
		});
	};

	const overwriteSourceRange = ({ range }: { range: SourceRange }) => {
		if (overwriteTarget.trackId === null) {
			toast.error("无法覆盖源素材范围", {
				description: overwriteTarget.reason ?? "请选择或解锁兼容的时间线轨道。",
			});
			return;
		}
		editor.timeline.overwriteElement({
			element: buildElementFromSourceRange({
				asset,
				range,
				startTime: editor.playback.getCurrentTime(),
			}),
			trackId: overwriteTarget.trackId,
		});
		toast.success("已覆盖时间线范围", {
			description: `${asset.name} 已替换 ${overwriteTrack?.name ?? "目标轨道"} 上的对应区间。`,
		});
	};

	return (
		<div
			className="panel bg-background flex size-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border"
			data-source-preview="active"
		>
			<header className="border-border/70 flex h-11 shrink-0 items-center justify-between border-b px-3.5">
				<div className="min-w-0">
					<div className="truncate text-[13px] font-medium">
						正在预览 — {mediaTypeLabel}
					</div>
					<div className="text-muted-foreground truncate text-[10px]">
						{asset.name}
					</div>
				</div>
				<Button
					type="button"
					size="icon"
					variant="ghost"
					aria-label="返回时间线预览"
					title="返回时间线预览"
					onClick={closeSourcePreview}
				>
					<X />
				</Button>
			</header>
			<div className="min-h-0 flex-1 overflow-auto">
				<SourceMonitorView
					key={asset.id}
					asset={asset}
					projectId={projectId}
					presentation="panel"
					overwriteTargetLabel={overwriteTrack?.name ?? null}
					overwriteDisabledReason={overwriteTarget.reason}
					onInsert={insertSourceRange}
					onOverwrite={overwriteSourceRange}
					onClose={closeSourcePreview}
				/>
			</div>
		</div>
	);
}

export function SourceMonitorDialog({
	open,
	asset,
	overwriteTargetLabel,
	overwriteDisabledReason,
	onOpenChange,
	onInsert,
	onOverwrite,
}: {
	open: boolean;
	asset: MediaAsset | null;
	overwriteTargetLabel: string | null;
	overwriteDisabledReason: string | null;
	onOpenChange: (open: boolean) => void;
	onInsert: (args: { range: SourceRange }) => void;
	onOverwrite: (args: { range: SourceRange }) => void;
}) {
	const projectId = useEditor(
		(editor) => editor.project.getActive().metadata.id,
	);
	if (!asset) return null;
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="max-w-3xl overflow-hidden"
				aria-label="源监视器"
			>
				<SourceMonitorView
					key={asset.id}
					asset={asset}
					projectId={projectId}
					overwriteTargetLabel={overwriteTargetLabel}
					overwriteDisabledReason={overwriteDisabledReason}
					onInsert={onInsert}
					onOverwrite={onOverwrite}
					onClose={() => onOpenChange(false)}
				/>
			</DialogContent>
		</Dialog>
	);
}

export function SourceMonitorView({
	asset,
	projectId,
	presentation = "dialog",
	overwriteTargetLabel,
	overwriteDisabledReason,
	onInsert,
	onOverwrite,
	onClose,
}: {
	asset: MediaAsset;
	projectId?: string;
	presentation?: "dialog" | "panel";
	overwriteTargetLabel: string | null;
	overwriteDisabledReason: string | null;
	onInsert: (args: { range: SourceRange }) => void;
	onOverwrite: (args: { range: SourceRange }) => void;
	onClose: () => void;
}) {
	const duration = getSourceDurationSeconds({ asset });
	const [range, setRange] = useState<SourceRange>(() =>
		getDefaultSourceRange({ asset }),
	);
	const [currentTime, setCurrentTime] = useState(0);
	const [isPlaying, setIsPlaying] = useState(false);
	const [showRangeControls, setShowRangeControls] = useState(
		presentation === "dialog",
	);
	const [diagnostics, setDiagnostics] = useState<AgentMediaProbeResult | null>(
		null,
	);
	const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
	const mediaRef = useRef<HTMLMediaElement | null>(null);
	const canPlay = asset.type !== "image";
	const rangeDuration = range.outPoint - range.inPoint;
	const playbackSource = getMediaAssetPlaybackSource({
		asset,
		isPreview: true,
	});

	useEffect(() => {
		if (asset.type === "image" || !projectId) {
			return;
		}
		let active = true;
		void (async () => {
			try {
				const browserCanDecode =
					asset.browserCanDecode ??
					(await checkBrowserDecodeSupport({ asset }));
				const result = await requestMediaProbe({
					projectId,
					assetId: asset.id,
					browserCanDecode,
				});
				if (active) {
					setDiagnostics(result);
					setDiagnosticError(null);
				}
			} catch (error) {
				if (active) {
					setDiagnosticError(
						error instanceof Error ? error.message : String(error),
					);
				}
			}
		})();
		return () => {
			active = false;
		};
	}, [asset, projectId]);

	const seek = ({ time }: { time: number }) => {
		const nextTime = Math.min(duration, Math.max(0, time));
		setCurrentTime(nextTime);
		if (mediaRef.current) mediaRef.current.currentTime = nextTime;
	};

	const setPoint = ({ point, time }: { point: "in" | "out"; time: number }) => {
		setRange((currentRange) =>
			updateSourceRangePoint({
				range: currentRange,
				point,
				time,
				duration,
			}),
		);
	};

	const togglePlayback = async () => {
		const media = mediaRef.current;
		if (!media) return;
		if (!media.paused) {
			media.pause();
			return;
		}
		if (
			media.currentTime >= range.outPoint ||
			media.currentTime < range.inPoint
		) {
			seek({ time: range.inPoint });
		}
		try {
			await media.play();
		} catch {
			setIsPlaying(false);
		}
	};

	const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (
			event.target instanceof HTMLInputElement ||
			event.target instanceof HTMLTextAreaElement
		) {
			return;
		}
		const key = event.key.toLocaleLowerCase();
		if (key === "i") {
			event.preventDefault();
			setPoint({ point: "in", time: currentTime });
		} else if (key === "o") {
			event.preventDefault();
			setPoint({ point: "out", time: currentTime });
		} else if (key === " ") {
			event.preventDefault();
			void togglePlayback();
		}
	};

	return (
		<div
			role="toolbar"
			aria-label="源监视器"
			tabIndex={0}
			onKeyDown={handleKeyDown}
			className={cn(
				"min-h-0",
				presentation === "panel" && "flex h-full flex-col",
			)}
		>
			{presentation === "dialog" ? (
				<DialogHeader className="pr-12">
					<DialogTitle className="truncate">{asset.name}</DialogTitle>
					<DialogDescription>
						源监视器 · 精确设置入点和出点，原始素材不会被修改。
					</DialogDescription>
				</DialogHeader>
			) : null}
			<DialogBody
				className={cn(
					"gap-4",
					presentation === "panel" && "min-h-0 flex-1 overflow-auto p-3",
				)}
			>
				<div className="bg-black relative flex aspect-video max-h-[46vh] min-h-44 items-center justify-center overflow-hidden rounded-md">
					{asset.type === "video" ? (
						<>
							{/* Imported sources do not necessarily include caption tracks. */}
							{/* eslint-disable-next-line jsx-a11y/media-has-caption */}
							<video
								ref={(element) => {
									mediaRef.current = element;
								}}
								src={playbackSource.url}
								className="size-full object-contain"
								preload="metadata"
								playsInline
								onPlay={() => setIsPlaying(true)}
								onPause={() => setIsPlaying(false)}
								onEnded={() => setIsPlaying(false)}
								onTimeUpdate={(event) => {
									const time = event.currentTarget.currentTime;
									if (time >= range.outPoint) {
										event.currentTarget.pause();
										event.currentTarget.currentTime = range.outPoint;
										setCurrentTime(range.outPoint);
										return;
									}
									setCurrentTime(time);
								}}
							/>
						</>
					) : asset.type === "audio" ? (
						<div className="flex w-full max-w-xl flex-col items-center gap-5 px-10">
							<div className="text-primary bg-primary/10 flex size-20 items-center justify-center rounded-full text-3xl">
								♫
							</div>
							{/* Source audio has no external caption track at import time. */}
							{/* eslint-disable-next-line jsx-a11y/media-has-caption */}
							<audio
								ref={(element) => {
									mediaRef.current = element;
								}}
								src={playbackSource.url}
								preload="metadata"
								className="w-full"
								onPlay={() => setIsPlaying(true)}
								onPause={() => setIsPlaying(false)}
								onEnded={() => setIsPlaying(false)}
								onTimeUpdate={(event) => {
									const time = event.currentTarget.currentTime;
									if (time >= range.outPoint) {
										event.currentTarget.pause();
										event.currentTarget.currentTime = range.outPoint;
										setCurrentTime(range.outPoint);
										return;
									}
									setCurrentTime(time);
								}}
							/>
						</div>
					) : (
						<Image
							src={asset.url ?? ""}
							alt={asset.name}
							fill
							sizes="70vw"
							className="object-contain"
							unoptimized
						/>
					)}
					<div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 rounded bg-black/70 px-3 py-2 text-xs text-white">
						<span>{formatSourceTime({ seconds: currentTime })}</span>
						<span>
							入点 {formatSourceTime({ seconds: range.inPoint })} · 出点{" "}
							{formatSourceTime({ seconds: range.outPoint })}
						</span>
						<span>{formatSourceTime({ seconds: duration })}</span>
					</div>
				</div>

				{asset.footage && <FootageOrigin value={asset.footage} />}
				{asset.type !== "image" && presentation === "dialog" ? (
					<MediaCodecDiagnostics
						asset={asset}
						diagnostics={diagnostics}
						error={diagnosticError}
					/>
				) : null}

				<div className="grid gap-3 rounded-md border p-3">
					<div className="flex items-center gap-2">
						<Button
							type="button"
							size="icon"
							variant="outline"
							disabled={!canPlay}
							aria-label={isPlaying ? "暂停源素材" : "播放源素材"}
							title={canPlay ? "播放或暂停源素材（空格）" : "静态图片"}
							onClick={() => void togglePlayback()}
						>
							{isPlaying ? <Pause /> : <Play />}
						</Button>
						<Slider
							aria-label="源素材播放头"
							min={0}
							max={duration}
							step={0.01}
							value={[currentTime]}
							onValueChange={([time]) => seek({ time: time ?? 0 })}
						/>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							aria-label="重置源素材范围"
							title="重置源素材范围"
							onClick={() => {
								setRange(getDefaultSourceRange({ asset }));
								seek({ time: 0 });
							}}
						>
							<RotateCcw />
						</Button>
					</div>

					{showRangeControls ? (
						<div className="grid gap-2 sm:grid-cols-2">
							<SourcePointControl
								label="入点"
								shortcut="I"
								value={range.inPoint}
								max={Math.max(0, range.outPoint)}
								onValueChange={({ value }) =>
									setPoint({ point: "in", time: value })
								}
								onSet={() => setPoint({ point: "in", time: currentTime })}
								onGo={() => seek({ time: range.inPoint })}
							/>
							<SourcePointControl
								label="出点"
								shortcut="O"
								value={range.outPoint}
								max={duration}
								onValueChange={({ value }) =>
									setPoint({ point: "out", time: value })
								}
								onSet={() => setPoint({ point: "out", time: currentTime })}
								onGo={() => seek({ time: range.outPoint })}
							/>
						</div>
					) : (
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={() => setShowRangeControls(true)}
						>
							设置入点 / 出点
						</Button>
					)}
					<div className="text-muted-foreground flex items-center justify-between text-xs">
						<span>已选源素材范围</span>
						<strong className="text-foreground">
							{formatSourceTime({ seconds: rangeDuration })}
						</strong>
					</div>
				</div>
			</DialogBody>
			<DialogFooter
				className={cn(
					"items-center sm:justify-between",
					presentation === "panel" &&
						"border-border/70 sticky bottom-0 border-t bg-background px-3 py-2",
				)}
			>
				{presentation === "dialog" ? (
					<Button type="button" variant="ghost" onClick={onClose}>
						关闭
					</Button>
				) : (
					<span className="text-muted-foreground text-[10px]">
						I / O 设置范围 · 空格播放
					</span>
				)}
				<div className="flex flex-wrap justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => onInsert({ range })}
					>
						插入范围
					</Button>
					<Button
						type="button"
						disabled={overwriteTargetLabel === null}
						title={localizeOverwriteReason(overwriteDisabledReason)}
						onClick={() => onOverwrite({ range })}
					>
						覆盖到 {overwriteTargetLabel ?? "时间线"}
					</Button>
				</div>
			</DialogFooter>
		</div>
	);
}

function MediaCodecDiagnostics({
	asset,
	diagnostics,
	error,
}: {
	asset: MediaAsset;
	diagnostics: AgentMediaProbeResult | null;
	error: string | null;
}) {
	const video = diagnostics?.probe.videoStreams[0];
	const audio = diagnostics?.probe.audioStreams[0];
	const strategyLabels = {
		direct: "原片直放",
		"proxy-recommended": "建议代理",
		"proxy-required": "必须代理",
		"audio-only": "纯音频",
		unsupported: "暂不支持",
	} as const;

	return (
		<section
			className="grid gap-2 rounded-md border bg-muted/20 p-3 text-[11px]"
			aria-label="媒体兼容性诊断"
		>
			<div className="flex items-center justify-between gap-3">
				<strong className="text-xs">媒体信息与兼容性</strong>
				<span className="rounded-full bg-background px-2 py-1 font-medium">
					{asset.proxy?.enabled && asset.proxyFile
						? "当前预览：代理"
						: "当前预览：原片"}
				</span>
			</div>
			{diagnostics ? (
				<>
					<div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
						<CodecFact
							label="策略"
							value={strategyLabels[diagnostics.compatibility.kind]}
						/>
						<CodecFact
							label="封装"
							value={diagnostics.probe.container.formatNames[0] ?? "未知"}
						/>
						<CodecFact
							label="视频"
							value={
								video
									? `${video.codec ?? "未知"}${video.profile ? ` · ${video.profile}` : ""}`
									: "无"
							}
						/>
						<CodecFact
							label="像素格式"
							value={
								video
									? `${video.pixelFormat ?? "未知"}${video.bitDepth ? ` · ${video.bitDepth}-bit` : ""}`
									: "—"
							}
						/>
						<CodecFact
							label="尺寸 / 帧率"
							value={
								video
									? `${video.width ?? "?"}×${video.height ?? "?"} · ${video.averageFrameRate?.toFixed(2) ?? "?"} fps`
									: "—"
							}
						/>
						<CodecFact
							label="帧率模式"
							value={
								video?.frameRateMode === "variable"
									? "可变帧率 VFR"
									: video?.frameRateMode === "constant"
										? "恒定帧率 CFR"
										: "未知"
							}
						/>
						<CodecFact
							label="色彩"
							value={
								video
									? `${video.color.primaries ?? "未标记"} / ${video.color.transfer ?? "未标记"}${video.hdr ? " · HDR" : " · SDR"}`
									: "—"
							}
						/>
						<CodecFact
							label="音频"
							value={
								audio
									? `${audio.codec ?? "未知"} · ${audio.sampleRate ?? "?"} Hz · ${audio.channelLayout ?? `${audio.channels ?? "?"} 声道`}`
									: "无"
							}
						/>
					</div>
					{diagnostics.compatibility.reasonCodes.length > 0 ? (
						<p className="text-muted-foreground">
							判断依据：
							{diagnostics.compatibility.reasonCodes.join(" · ")}
						</p>
					) : null}
				</>
			) : error ? (
				<p className="text-amber-600">无法读取编解码信息：{error}</p>
			) : (
				<p className="text-muted-foreground">正在检测媒体信息…</p>
			)}
		</section>
	);
}

function CodecFact({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0">
			<div className="text-muted-foreground">{label}</div>
			<div className="truncate font-medium" title={value}>
				{value}
			</div>
		</div>
	);
}

function SourcePointControl({
	label,
	shortcut,
	value,
	max,
	onValueChange,
	onSet,
	onGo,
}: {
	label: "入点" | "出点";
	shortcut: "I" | "O";
	value: number;
	max: number;
	onValueChange: (args: { value: number }) => void;
	onSet: () => void;
	onGo: () => void;
}) {
	return (
		<div className="bg-muted/40 grid gap-2 rounded p-2">
			<div className="flex items-center justify-between">
				<span className="text-xs font-semibold">源素材{label}</span>
				<kbd className="text-muted-foreground rounded border px-1.5 text-[10px]">
					{shortcut}
				</kbd>
			</div>
			<Input
				type="number"
				aria-label={`源素材${label}时间`}
				min={0}
				max={max}
				step={0.01}
				value={roundForInput({ value })}
				onChange={(event) =>
					onValueChange({ value: Number(event.currentTarget.value) })
				}
			/>
			<div className="grid grid-cols-2 gap-1.5">
				<Button type="button" size="sm" variant="secondary" onClick={onSet}>
					设置{label}
				</Button>
				<Button type="button" size="sm" variant="outline" onClick={onGo}>
					前往{label}
				</Button>
			</div>
		</div>
	);
}

function formatSourceTime({ seconds }: { seconds: number }): string {
	const safe = Math.max(0, seconds);
	const minutes = Math.floor(safe / 60);
	const remaining = safe - minutes * 60;
	return `${minutes.toString().padStart(2, "0")}:${remaining
		.toFixed(2)
		.padStart(5, "0")}`;
}

function roundForInput({ value }: { value: number }): number {
	return Math.round(value * 1000) / 1000;
}
