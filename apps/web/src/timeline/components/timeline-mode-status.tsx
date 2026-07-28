"use client";

import {
	Link02Icon,
	MagnetIcon,
	Unlink02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { invokeAction } from "@/actions";
import { useKeyboardShortcutsHelp } from "@/actions/use-keyboard-shortcuts-help";
import { useEditor } from "@/editor/use-editor";
import {
	canToggleSourceAudio,
	isSourceAudioSeparated,
} from "@/timeline/audio-separation";
import { hasMediaId } from "@/timeline";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { useTimelineStore } from "@/timeline/timeline-store";
import { OcRippleIcon } from "@/components/icons";
import { cn } from "@/utils/ui";

type SourceAudioStatus = {
	status: "linked" | "separated" | "unavailable";
	label: string;
	canToggle: boolean;
};

function ModeButton({
	label,
	isActive,
	icon,
	name,
	state,
	shortcut,
	disabled = false,
	onClick,
}: {
	label: string;
	isActive: boolean;
	icon: React.ReactNode;
	name: string;
	state: string;
	shortcut?: string | null;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className={cn(
				"border-border bg-background text-muted-foreground flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors",
				isActive && "border-primary/40 bg-primary/10 text-primary",
				disabled && "cursor-not-allowed opacity-55",
			)}
			aria-label={label}
			aria-pressed={isActive}
			title={label}
			disabled={disabled}
			onClick={onClick}
		>
			<span className="flex size-3.5 items-center justify-center">{icon}</span>
			<span>{name}</span>
			<span
				className={cn(
					"text-foreground/65",
					isActive && "text-primary/80",
				)}
			>
				{state}
			</span>
			{shortcut && (
				<kbd className="border-border bg-muted/70 rounded border px-1 font-mono text-[9px] leading-4">
					{shortcut}
				</kbd>
			)}
		</button>
	);
}

export function TimelineModeStatusView({
	snappingEnabled,
	snappingShortcut,
	rippleEditingEnabled,
	sourceAudio,
	onToggleSnapping,
	onToggleRippleEditing,
	onToggleSourceAudio,
}: {
	snappingEnabled: boolean;
	snappingShortcut: string | null;
	rippleEditingEnabled: boolean;
	sourceAudio: SourceAudioStatus;
	onToggleSnapping: () => void;
	onToggleRippleEditing: () => void;
	onToggleSourceAudio: () => void;
}) {
	const snappingLabel = `Auto snapping: ${
		snappingEnabled ? "On" : "Off"
	}${snappingShortcut ? ` (${snappingShortcut})` : ""}`;
	const rippleLabel = `Ripple editing: ${
		rippleEditingEnabled ? "On" : "Off"
	}`;
	const audioIsSeparated = sourceAudio.status === "separated";

	return (
		<div
			className="border-border/80 bg-muted/15 flex h-9 shrink-0 items-center gap-1.5 overflow-x-auto border-b px-2 scrollbar-hidden"
			role="group"
			aria-label="Timeline edit modes"
		>
			<span className="text-muted-foreground mr-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em]">
				Modes
			</span>
			<ModeButton
				label={snappingLabel}
				isActive={snappingEnabled}
				icon={<HugeiconsIcon icon={MagnetIcon} />}
				name="Snap"
				state={snappingEnabled ? "On" : "Off"}
				shortcut={snappingShortcut}
				onClick={onToggleSnapping}
			/>
			<ModeButton
				label={rippleLabel}
				isActive={rippleEditingEnabled}
				icon={<OcRippleIcon size={15} />}
				name="Ripple"
				state={rippleEditingEnabled ? "On" : "Off"}
				onClick={onToggleRippleEditing}
			/>
			<ModeButton
				label={sourceAudio.label}
				isActive={audioIsSeparated}
				icon={
					<HugeiconsIcon
						icon={audioIsSeparated ? Unlink02Icon : Link02Icon}
					/>
				}
				name="Audio"
				state={
					sourceAudio.status === "linked"
						? "Linked"
						: sourceAudio.status === "separated"
							? "Separated"
							: "Unavailable"
				}
				disabled={!sourceAudio.canToggle}
				onClick={onToggleSourceAudio}
			/>
			<span className="text-muted-foreground ml-auto shrink-0 text-[10px]">
				Hold Shift to bypass snapping
			</span>
		</div>
	);
}

export function TimelineModeStatus() {
	const editor = useEditor();
	const { selectedElements } = useElementSelection();
	const snappingEnabled = useTimelineStore((state) => state.snappingEnabled);
	const rippleEditingEnabled = useTimelineStore(
		(state) => state.rippleEditingEnabled,
	);
	const mediaAssets = useEditor((currentEditor) =>
		currentEditor.media.getAssets(),
	);
	const { shortcuts } = useKeyboardShortcutsHelp();
	const snappingShortcut =
		shortcuts.find((shortcut) => shortcut.action === "toggle-snapping")?.keys[0] ??
		null;
	const selectedElement =
		selectedElements.length === 1
			? (editor.timeline.getElementsWithTracks({
					elements: selectedElements,
				})[0] ?? null)
			: null;
	const selectedMediaAsset = (() => {
		if (!selectedElement || !hasMediaId(selectedElement.element)) {
			return null;
		}
		return (
			mediaAssets.find(
				(asset) => asset.id === selectedElement.element.mediaId,
			) ?? null
		);
	})();
	const sourceAudio: SourceAudioStatus = (() => {
		if (!selectedElement || selectedElement.element.type !== "video") {
			return {
				status: "unavailable",
				label: "Select one video clip to manage source audio",
				canToggle: false,
			};
		}

		if (!canToggleSourceAudio(selectedElement.element, selectedMediaAsset)) {
			return {
				status: "unavailable",
				label: "Selected video has no source audio",
				canToggle: false,
			};
		}

		const separated = isSourceAudioSeparated({
			element: selectedElement.element,
		});
		return {
			status: separated ? "separated" : "linked",
			label: separated
				? "Source audio separated — click to recover"
				: "Source audio linked — click to extract",
			canToggle: true,
		};
	})();

	return (
		<TimelineModeStatusView
			snappingEnabled={snappingEnabled}
			snappingShortcut={snappingShortcut}
			rippleEditingEnabled={rippleEditingEnabled}
			sourceAudio={sourceAudio}
			onToggleSnapping={() => invokeAction("toggle-snapping")}
			onToggleRippleEditing={() => invokeAction("toggle-ripple-editing")}
			onToggleSourceAudio={() => invokeAction("toggle-source-audio")}
		/>
	);
}
