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
			<span className={cn("text-foreground/65", isActive && "text-primary/80")}>
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
	rippleEditingShortcut,
	sourceAudio,
	sourceAudioShortcut,
	selectionCount = 0,
	onToggleSnapping,
	onToggleRippleEditing,
	onToggleSourceAudio,
}: {
	snappingEnabled: boolean;
	snappingShortcut: string | null;
	rippleEditingEnabled: boolean;
	rippleEditingShortcut: string | null;
	sourceAudio: SourceAudioStatus;
	sourceAudioShortcut: string | null;
	selectionCount?: number;
	onToggleSnapping: () => void;
	onToggleRippleEditing: () => void;
	onToggleSourceAudio: () => void;
}) {
	const snappingLabel = `自动吸附：${
		snappingEnabled ? "开启" : "关闭"
	}${snappingShortcut ? ` (${snappingShortcut})` : ""}`;
	const rippleLabel = `联动编辑：${
		rippleEditingEnabled ? "开启" : "关闭"
	}${rippleEditingShortcut ? ` (${rippleEditingShortcut})` : ""}`;
	const sourceAudioLabel = `${sourceAudio.label}${
		sourceAudioShortcut ? ` (${sourceAudioShortcut})` : ""
	}`;
	const audioIsSeparated = sourceAudio.status === "separated";

	return (
		<div
			className="border-border/80 bg-muted/15 flex h-9 shrink-0 items-center gap-1.5 overflow-x-auto border-b px-2 scrollbar-hidden"
			role="group"
			aria-label="时间线编辑模式"
		>
			<span className="text-muted-foreground mr-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em]">
				模式
			</span>
			<ModeButton
				label={snappingLabel}
				isActive={snappingEnabled}
				icon={<HugeiconsIcon icon={MagnetIcon} />}
				name="吸附"
				state={snappingEnabled ? "开" : "关"}
				shortcut={snappingShortcut}
				onClick={onToggleSnapping}
			/>
			<ModeButton
				label={rippleLabel}
				isActive={rippleEditingEnabled}
				icon={<OcRippleIcon size={15} />}
				name="联动"
				state={rippleEditingEnabled ? "开" : "关"}
				shortcut={rippleEditingShortcut}
				onClick={onToggleRippleEditing}
			/>
			<ModeButton
				label={sourceAudioLabel}
				isActive={audioIsSeparated}
				icon={
					<HugeiconsIcon icon={audioIsSeparated ? Unlink02Icon : Link02Icon} />
				}
				name="原声"
				state={
					sourceAudio.status === "linked"
						? "已连接"
						: sourceAudio.status === "separated"
							? "已分离"
							: "不可用"
				}
				disabled={!sourceAudio.canToggle}
				shortcut={sourceAudioShortcut}
				onClick={onToggleSourceAudio}
			/>
			<span
				className="border-border bg-background text-muted-foreground shrink-0 rounded-md border px-2 py-1 text-[10px]"
				aria-label={`时间线已选择 ${selectionCount} 个素材`}
			>
				已选 <strong className="text-foreground">{selectionCount}</strong>
				<span className="ml-1.5">· Shift 连选 · ⌘ 多选 · 框选</span>
			</span>
			<span className="text-muted-foreground ml-auto shrink-0 text-[10px]">
				拖动时按 Shift 可临时关闭吸附
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
		shortcuts.find((shortcut) => shortcut.action === "toggle-snapping")
			?.keys[0] ?? null;
	const rippleEditingShortcut =
		shortcuts.find((shortcut) => shortcut.action === "toggle-ripple-editing")
			?.keys[0] ?? null;
	const sourceAudioShortcut =
		shortcuts.find((shortcut) => shortcut.action === "toggle-source-audio")
			?.keys[0] ?? null;
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
		const mediaId = selectedElement.element.mediaId;
		return mediaAssets.find((asset) => asset.id === mediaId) ?? null;
	})();
	const sourceAudio: SourceAudioStatus = (() => {
		if (!selectedElement || selectedElement.element.type !== "video") {
			return {
				status: "unavailable",
				label: "请选择一个视频素材以管理原声",
				canToggle: false,
			};
		}

		if (!canToggleSourceAudio(selectedElement.element, selectedMediaAsset)) {
			return {
				status: "unavailable",
				label: "所选视频没有可用原声",
				canToggle: false,
			};
		}

		const separated = isSourceAudioSeparated({
			element: selectedElement.element,
		});
		return {
			status: separated ? "separated" : "linked",
			label: separated ? "原声已分离 — 点击恢复" : "原声已连接 — 点击提取",
			canToggle: true,
		};
	})();

	return (
		<TimelineModeStatusView
			snappingEnabled={snappingEnabled}
			snappingShortcut={snappingShortcut}
			rippleEditingEnabled={rippleEditingEnabled}
			rippleEditingShortcut={rippleEditingShortcut}
			sourceAudio={sourceAudio}
			sourceAudioShortcut={sourceAudioShortcut}
			selectionCount={selectedElements.length}
			onToggleSnapping={() => invokeAction("toggle-snapping")}
			onToggleRippleEditing={() => invokeAction("toggle-ripple-editing")}
			onToggleSourceAudio={() => invokeAction("toggle-source-audio")}
		/>
	);
}
