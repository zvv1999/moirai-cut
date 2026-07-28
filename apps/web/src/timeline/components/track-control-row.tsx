"use client";

import {
	Delete02Icon,
	LockIcon,
	VerticalResizeIcon,
	ViewIcon,
	ViewOffSlashIcon,
	VolumeHighIcon,
	VolumeOffIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useState } from "react";
import type { TimelineTrack } from "@/timeline/types";
import {
	canTrackBeHidden,
	canTrackHaveAudio,
} from "@/timeline/track-capabilities";
import {
	getNextTrackDisplayHeight,
	getTrackCompatibilityLabel,
} from "@/timeline/track-controls";
import { cn } from "@/utils/ui";

interface TrackControlRowViewProps {
	track: TimelineTrack;
	isMainTrack: boolean;
	onRename: (name: string) => void;
	onToggleLock: () => void;
	onToggleSolo: () => void;
	onToggleMute: () => void;
	onToggleVisibility: () => void;
	onSetHeight: (height: number) => void;
	onDelete: () => void;
}

function TrackControlButton({
	label,
	icon,
	pressed,
	danger = false,
	onClick,
	children,
}: {
	label: string;
	icon?: IconSvgElement;
	pressed?: boolean;
	danger?: boolean;
	onClick: () => void;
	children?: React.ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			aria-pressed={pressed}
			title={label}
			className={cn(
				"hover:bg-muted flex size-6 shrink-0 items-center justify-center rounded text-[10px] font-semibold transition-colors",
				pressed && "bg-primary/15 text-primary",
				danger
					? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
					: "text-muted-foreground hover:text-foreground",
			)}
			onClick={(event) => {
				event.stopPropagation();
				onClick();
			}}
		>
			{icon ? <HugeiconsIcon icon={icon} className="size-3.5" /> : children}
		</button>
	);
}

export function TrackControlRowView({
	track,
	isMainTrack,
	onRename,
	onToggleLock,
	onToggleSolo,
	onToggleMute,
	onToggleVisibility,
	onSetHeight,
	onDelete,
}: TrackControlRowViewProps) {
	const [isRenaming, setIsRenaming] = useState(false);
	const [draftName, setDraftName] = useState(track.name);
	const compatibilityLabel = getTrackCompatibilityLabel({
		trackType: track.type,
	});
	const commitRename = () => {
		onRename(draftName);
		setIsRenaming(false);
	};

	return (
		<div
			className={cn(
				"flex size-full min-h-0 flex-col justify-center gap-0.5 px-2 py-1",
				track.locked && "bg-amber-500/5",
			)}
			data-track-id={track.id}
			data-track-locked={track.locked ? "true" : "false"}
		>
			<div className="flex min-w-0 items-center gap-1">
				<span
					className="bg-muted text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded text-[9px] font-bold uppercase"
					aria-hidden="true"
				>
					{track.type.slice(0, 1)}
				</span>
				{isRenaming ? (
					<input
						autoFocus
						value={draftName}
						aria-label={`Track name for ${track.name}`}
						className="border-input bg-background h-6 min-w-0 flex-1 rounded border px-1 text-xs outline-none focus:border-primary"
						onChange={(event) => setDraftName(event.target.value)}
						onBlur={commitRename}
						onKeyDown={(event) => {
							if (event.key === "Enter") commitRename();
							if (event.key === "Escape") {
								setDraftName(track.name);
								setIsRenaming(false);
							}
						}}
					/>
				) : (
					<button
						type="button"
						aria-label={`Rename ${track.name}`}
						title={`${compatibilityLabel} · Double-click or press to rename`}
						className="min-w-0 flex-1 text-left"
						onClick={(event) => {
							event.stopPropagation();
							setDraftName(track.name);
							setIsRenaming(true);
						}}
					>
						<span className="flex min-w-0 items-center gap-1">
							<span className="truncate text-[11px] font-medium">{track.name}</span>
							{isMainTrack && (
								<span className="bg-primary/10 text-primary shrink-0 rounded px-1 text-[8px] font-semibold uppercase">
									Main
								</span>
							)}
						</span>
						<span className="text-muted-foreground block truncate text-[9px] leading-none">
							{compatibilityLabel}
						</span>
					</button>
				)}
			</div>
			<div className="flex items-center gap-0.5">
				<TrackControlButton
					label={`${track.locked ? "Unlock" : "Lock"} ${track.name}`}
					icon={LockIcon}
					pressed={track.locked === true}
					onClick={onToggleLock}
				/>
				{canTrackHaveAudio(track) && (
					<>
						<TrackControlButton
							label={`${track.solo ? "Disable solo for" : "Solo"} ${track.name}`}
							pressed={track.solo === true}
							onClick={onToggleSolo}
						>
							S
						</TrackControlButton>
						<TrackControlButton
							label={`${track.muted ? "Unmute" : "Mute"} ${track.name}`}
							icon={track.muted ? VolumeOffIcon : VolumeHighIcon}
							pressed={track.muted}
							onClick={onToggleMute}
						/>
					</>
				)}
				{canTrackBeHidden(track) && (
					<TrackControlButton
						label={`${track.hidden ? "Show" : "Hide"} ${track.name}`}
						icon={track.hidden ? ViewOffSlashIcon : ViewIcon}
						pressed={track.hidden}
						onClick={onToggleVisibility}
					/>
				)}
				<TrackControlButton
					label={`Resize ${track.name}`}
					icon={VerticalResizeIcon}
					onClick={() => onSetHeight(getNextTrackDisplayHeight({ track }))}
				/>
				{!isMainTrack && (
					<TrackControlButton
						label={`Delete ${track.name}`}
						icon={Delete02Icon}
						danger
						onClick={onDelete}
					/>
				)}
			</div>
		</div>
	);
}
