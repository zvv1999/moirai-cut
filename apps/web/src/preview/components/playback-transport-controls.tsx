"use client";

import {
	NextIcon,
	PauseIcon,
	PlayIcon,
	PreviousIcon,
	RepeatIcon,
	SkipBack,
	SkipForward,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
	PLAYBACK_RATES,
	PREVIEW_QUALITIES,
	type PlaybackRate,
	type PreviewQuality,
	isPlaybackRate,
	isPreviewQuality,
} from "@/playback/transport";

const QUALITY_LABELS: Record<PreviewQuality, string> = {
	full: "完整",
	balanced: "流畅",
	performance: "性能",
};

export function PlaybackTransportControls({
	isPlaying,
	loopEnabled,
	playbackRate,
	previewQuality,
	onGoToStart,
	onStepBackward,
	onTogglePlay,
	onStepForward,
	onGoToEnd,
	onToggleLoop,
	onPlaybackRateChange,
	onPreviewQualityChange,
}: {
	isPlaying: boolean;
	loopEnabled: boolean;
	playbackRate: PlaybackRate;
	previewQuality: PreviewQuality;
	onGoToStart: () => void;
	onStepBackward: () => void;
	onTogglePlay: () => void;
	onStepForward: () => void;
	onGoToEnd: () => void;
	onToggleLoop: () => void;
	onPlaybackRateChange: (rate: PlaybackRate) => void;
	onPreviewQualityChange: (quality: PreviewQuality) => void;
}) {
	const buttonClassName = "h-7 w-[26px] shrink-0";

	return (
		<div
			className="flex min-w-0 items-center justify-center gap-0.5"
			aria-label="播放控制"
		>
			<Button
				variant="text"
				size="icon"
				className={buttonClassName}
				aria-label="回到时间线开头（Home）"
				title="回到时间线开头（Home）"
				onClick={onGoToStart}
			>
				<HugeiconsIcon icon={SkipBack} />
			</Button>
			<Button
				variant="text"
				size="icon"
				className={buttonClassName}
				aria-label="上一帧（←）"
				title="上一帧（←）"
				onClick={onStepBackward}
			>
				<HugeiconsIcon icon={PreviousIcon} />
			</Button>
			<Button
				variant="secondary"
				size="icon"
				className={buttonClassName}
				aria-label={isPlaying ? "暂停（空格）" : "播放（空格）"}
				title={isPlaying ? "暂停（空格）" : "播放（空格）"}
				onClick={onTogglePlay}
			>
				<HugeiconsIcon icon={isPlaying ? PauseIcon : PlayIcon} />
			</Button>
			<Button
				variant="text"
				size="icon"
				className={buttonClassName}
				aria-label="下一帧（→）"
				title="下一帧（→）"
				onClick={onStepForward}
			>
				<HugeiconsIcon icon={NextIcon} />
			</Button>
			<Button
				variant="text"
				size="icon"
				className={buttonClassName}
				aria-label="前往时间线结尾（End）"
				title="前往时间线结尾（End）"
				onClick={onGoToEnd}
			>
				<HugeiconsIcon icon={SkipForward} />
			</Button>
			<Button
				variant={loopEnabled ? "secondary" : "text"}
				size="icon"
				className={buttonClassName}
				aria-label="循环播放"
				aria-pressed={loopEnabled}
				title={loopEnabled ? "循环播放：开启" : "循环播放：关闭"}
				onClick={onToggleLoop}
			>
				<HugeiconsIcon icon={RepeatIcon} />
			</Button>
			<select
				className="border-border bg-background h-7 w-12 shrink-0 rounded-md border px-1 text-[11px] font-medium tabular-nums"
				aria-label="播放速度"
				title="播放速度"
				value={playbackRate}
				onChange={(event) => {
					const rate = Number(event.currentTarget.value);
					if (isPlaybackRate(rate)) {
						onPlaybackRateChange(rate);
					}
				}}
			>
				{PLAYBACK_RATES.map((rate) => (
					<option key={rate} value={rate}>
						{rate}×
					</option>
				))}
			</select>
			<select
				className="border-border bg-background h-7 w-[5.4rem] shrink-0 rounded-md border px-1 text-[11px] font-medium"
				aria-label="预览画质"
				title="预览画质"
				value={previewQuality}
				onChange={(event) => {
					const quality = event.currentTarget.value;
					if (isPreviewQuality(quality)) {
						onPreviewQualityChange(quality);
					}
				}}
			>
				{PREVIEW_QUALITIES.map((quality) => (
					<option key={quality} value={quality}>
						{QUALITY_LABELS[quality]}
					</option>
				))}
			</select>
		</div>
	);
}
