"use client";

import { useState, useEffect } from "react";
import { useEditor } from "@/editor/use-editor";
import { formatTimecode } from "opencut-wasm";
import { invokeAction } from "@/actions";
import { EditableTimecode } from "@/components/editable-timecode";
import { Button } from "@/components/ui/button";
import { FullScreenIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Separator } from "@/components/ui/separator";
import {
	Select,
	SelectTrigger,
	SelectContent,
	SelectItem,
	SelectSeparator,
} from "@/components/ui/select";
import { PREVIEW_ZOOM_PRESETS } from "@/preview/zoom";
import { usePreviewViewport } from "./preview-viewport";
import { usePreviewStore } from "@/preview/preview-store";
import type { MediaTime } from "@/wasm";
import { PlaybackTransportControls } from "./playback-transport-controls";

export function PreviewToolbar({
	onToggleFullscreen,
}: {
	onToggleFullscreen: () => void;
}) {
	return (
		<div className="flex flex-col gap-1.5 px-3 pb-2 pt-3">
			<div className="flex min-w-0 items-center justify-between gap-2">
				<TimecodeDisplay />
				<div className="flex shrink-0 items-center gap-1">
					<ZoomSelect />
					<Separator orientation="vertical" className="h-4" />
					<Button
						variant="text"
						size="icon"
						className="size-7"
						aria-label="Toggle fullscreen preview"
						title="Toggle fullscreen preview"
						onClick={onToggleFullscreen}
					>
						<HugeiconsIcon icon={FullScreenIcon} />
					</Button>
				</div>
			</div>
			<PlaybackControls />
		</div>
	);
}

function TimecodeDisplay() {
	const editor = useEditor();
	const totalDuration = useEditor((e) => e.timeline.getTotalDuration());
	const fps = useEditor((e) => e.project.getActive().settings.fps);
	const [currentTime, setCurrentTime] = useState<MediaTime>(() =>
		editor.playback.getCurrentTime(),
	);

	useEffect(() => {
		const unsubscribeUpdate = editor.playback.onUpdate(setCurrentTime);
		const unsubscribeSeek = editor.playback.onSeek(setCurrentTime);
		return () => {
			unsubscribeUpdate();
			unsubscribeSeek();
		};
	}, [editor.playback]);

	return (
		<div className="flex min-w-0 items-center overflow-hidden">
			<EditableTimecode
				time={currentTime}
				duration={totalDuration}
				format="HH:MM:SS:FF"
				fps={fps}
				onTimeChange={({ time }) => editor.playback.seek({ time })}
				className="text-center"
			/>
			<span className="text-muted-foreground px-2 font-mono text-xs">/</span>
			<span className="text-muted-foreground font-mono text-xs">
				{formatTimecode({
					time: totalDuration,
					format: "HH:MM:SS:FF",
					rate: fps,
				})}
			</span>
		</div>
	);
}

function ZoomSelect() {
	const { isAtFit, zoomPercent, fitToScreen, setViewportPercent } =
		usePreviewViewport();

	const displayLabel = isAtFit ? "Fit" : `${zoomPercent}%`;

	const onValueChange = (value: string) => {
		if (value === "fit") {
			fitToScreen();
		} else {
			setViewportPercent({ percent: Number(value) });
		}
	};

	return (
		<Select
			value={isAtFit ? "fit" : String(zoomPercent)}
			onValueChange={onValueChange}
		>
			<SelectTrigger className="tabular-nums">{displayLabel}</SelectTrigger>
			<SelectContent>
				<SelectItem value="fit">Fit</SelectItem>
				<SelectSeparator />
				{PREVIEW_ZOOM_PRESETS.map((preset) => (
					<SelectItem key={preset} value={String(preset)}>
						{preset}%
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function PlayPauseButton() {
	const editor = useEditor();
	const isPlaying = useEditor((e) => e.playback.getIsPlaying());
	const loopEnabled = useEditor((e) => e.playback.getLoopEnabled());
	const playbackRate = useEditor((e) => e.playback.getPlaybackRate());
	const previewQuality = usePreviewStore((state) => state.quality);
	const setPreviewQuality = usePreviewStore((state) => state.setQuality);

	return (
		<PlaybackTransportControls
			isPlaying={isPlaying}
			loopEnabled={loopEnabled}
			playbackRate={playbackRate}
			previewQuality={previewQuality}
			onGoToStart={() => invokeAction("goto-start")}
			onStepBackward={() => {
				editor.playback.pause();
				invokeAction("frame-step-backward");
			}}
			onTogglePlay={() => invokeAction("toggle-play")}
			onStepForward={() => {
				editor.playback.pause();
				invokeAction("frame-step-forward");
			}}
			onGoToEnd={() => invokeAction("goto-end")}
			onToggleLoop={() => editor.playback.toggleLoop()}
			onPlaybackRateChange={(rate) => editor.playback.setPlaybackRate({ rate })}
			onPreviewQualityChange={setPreviewQuality}
		/>
	);
}

function PlaybackControls() {
	return (
		<div className="min-w-0">
			<PlayPauseButton />
		</div>
	);
}
