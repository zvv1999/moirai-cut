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
	full: "Full",
	balanced: "Balanced",
	performance: "Performance",
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
			aria-label="Playback transport"
		>
			<Button
				variant="text"
				size="icon"
				className={buttonClassName}
				aria-label="Go to timeline start (Home)"
				title="Go to timeline start (Home)"
				onClick={onGoToStart}
			>
				<HugeiconsIcon icon={SkipBack} />
			</Button>
			<Button
				variant="text"
				size="icon"
				className={buttonClassName}
				aria-label="Previous frame (Left Arrow)"
				title="Previous frame (Left Arrow)"
				onClick={onStepBackward}
			>
				<HugeiconsIcon icon={PreviousIcon} />
			</Button>
			<Button
				variant="secondary"
				size="icon"
				className={buttonClassName}
				aria-label={isPlaying ? "Pause (Space)" : "Play (Space)"}
				title={isPlaying ? "Pause (Space)" : "Play (Space)"}
				onClick={onTogglePlay}
			>
				<HugeiconsIcon icon={isPlaying ? PauseIcon : PlayIcon} />
			</Button>
			<Button
				variant="text"
				size="icon"
				className={buttonClassName}
				aria-label="Next frame (Right Arrow)"
				title="Next frame (Right Arrow)"
				onClick={onStepForward}
			>
				<HugeiconsIcon icon={NextIcon} />
			</Button>
			<Button
				variant="text"
				size="icon"
				className={buttonClassName}
				aria-label="Go to timeline end (End)"
				title="Go to timeline end (End)"
				onClick={onGoToEnd}
			>
				<HugeiconsIcon icon={SkipForward} />
			</Button>
			<Button
				variant={loopEnabled ? "secondary" : "text"}
				size="icon"
				className={buttonClassName}
				aria-label="Loop playback"
				aria-pressed={loopEnabled}
				title={loopEnabled ? "Loop playback: On" : "Loop playback: Off"}
				onClick={onToggleLoop}
			>
				<HugeiconsIcon icon={RepeatIcon} />
			</Button>
			<select
				className="border-border bg-background h-7 w-12 shrink-0 rounded-md border px-1 text-[11px] font-medium tabular-nums"
				aria-label="Playback speed"
				title="Playback speed"
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
				aria-label="Preview quality"
				title="Preview quality"
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
