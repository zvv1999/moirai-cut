import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { TooltipProvider, Tooltip } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
	SplitButton,
	SplitButtonLeft,
	SplitButtonRight,
	SplitButtonSeparator,
} from "@/components/ui/split-button";
import { Slider } from "@/components/ui/slider";
import { TIMELINE_ZOOM_BUTTON_FACTOR } from "./interaction";
import { TIMELINE_ZOOM_MAX } from "@/timeline/scale";
import { sliderToZoom, zoomToSlider } from "@/timeline/zoom-utils";
import { ScenesView } from "@/components/editor/scenes-view";
import { type TActionWithOptionalArgs, invokeAction } from "@/actions";
import { useTimelineStore } from "@/timeline/timeline-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MarkerManagerPopover } from "@/timeline/bookmarks";
import {
	Bookmark02Icon,
	Delete02Icon,
	SnowIcon,
	ScissorIcon,
	SearchAddIcon,
	SearchMinusIcon,
	Copy01Icon,
	AlignLeftIcon,
	AlignRightIcon,
	Layers01Icon,
	Chart03Icon,
	KeyframeIcon,
	Link02Icon,
	Unlink02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { GraphEditorPopover } from "./graph-editor/popover";
import { PopoverTrigger } from "@/components/ui/popover";
import { useGraphEditorController } from "./graph-editor/use-controller";
import { useMemo } from "react";
import { useKeyboardShortcutsHelp } from "@/actions/use-keyboard-shortcuts-help";
import { TimelineToolbarButton } from "./timeline-toolbar-button";
import { KeyframeSelectionToolbar } from "./keyframe-selection-toolbar";
import { TransitionManagerPopover } from "./transition-manager-popover";
import { CompoundClipPopover } from "./compound-clip-popover";
import { getElementKeyframes } from "@/animation";
import { planElementRelationUpdate } from "@/timeline/element-groups";
import { generateUUID } from "@/utils/id";
import { getSourceTimeAtClipTime } from "@/retime";
import { roundMediaTime } from "@/wasm";
import {
	Popover,
	PopoverContent,
	PopoverTrigger as EditModePopoverTrigger,
} from "@/components/ui/popover";
import { TimelineModeStatus } from "./timeline-mode-status";
import { PrecisionTrimModeSelector } from "./precision-trim-mode-selector";
import { SlidersHorizontal } from "lucide-react";

export { TimelineToolbarButton } from "./timeline-toolbar-button";

export function TimelineToolbar({
	zoomLevel,
	minZoom,
	setZoomLevel,
}: {
	zoomLevel: number;
	minZoom: number;
	setZoomLevel: ({ zoom }: { zoom: number }) => void;
}) {
	const handleZoom = ({ direction }: { direction: "in" | "out" }) => {
		const newZoomLevel =
			direction === "in"
				? Math.min(TIMELINE_ZOOM_MAX, zoomLevel * TIMELINE_ZOOM_BUTTON_FACTOR)
				: Math.max(minZoom, zoomLevel / TIMELINE_ZOOM_BUTTON_FACTOR);
		setZoomLevel({ zoom: newZoomLevel });
	};

	return (
		<ScrollArea className="scrollbar-hidden">
			<div className="flex h-10 items-center justify-between border-b px-1.5 py-1">
				<ToolbarLeftSection />

				<div className="flex items-center gap-1">
					<TimelineEditModeCluster />
					<SceneSelector />
				</div>

				<ToolbarRightSection
					zoomLevel={zoomLevel}
					minZoom={minZoom}
					onZoomChange={(zoom) => setZoomLevel({ zoom })}
					onZoom={handleZoom}
				/>
			</div>
		</ScrollArea>
	);
}

function TimelineEditModeCluster() {
	return (
		<Popover>
			<EditModePopoverTrigger asChild>
				<Button
					type="button"
					variant="text"
					size="sm"
					className="text-muted-foreground h-8 gap-1.5 px-2 text-[11px]"
					aria-label="时间线编辑模式"
					title="吸附、联动、原声与精确修剪"
				>
					<SlidersHorizontal className="size-3.5" />
					<span className="hidden 2xl:inline">编辑模式</span>
				</Button>
			</EditModePopoverTrigger>
			<PopoverContent
				align="center"
				side="top"
				sideOffset={8}
				className="w-[min(52rem,calc(100vw-2rem))] overflow-hidden p-0"
			>
				<div className="border-border border-b px-3 py-2">
					<p className="text-[12px] font-medium">时间线编辑模式</p>
					<p className="text-muted-foreground mt-0.5 text-[10px]">
						将低频模式集中在弹层中，保持剪映式单行工具栏。
					</p>
				</div>
				<TimelineModeStatus />
				<PrecisionTrimModeSelector />
			</PopoverContent>
		</Popover>
	);
}

function ToolbarLeftSection() {
	const editor = useEditor();
	const shortcutByAction = useTimelineToolbarShortcuts();
	const { selectedElements } = useElementSelection();
	const graphEditor = useGraphEditorController();
	const isCurrentlyBookmarked = useEditor((e) =>
		e.scenes.isBookmarked({ time: e.playback.getCurrentTime() }),
	);
	const selectedElement =
		selectedElements.length === 1
			? (editor.timeline.getElementsWithTracks({
					elements: selectedElements,
				})[0] ?? null)
			: null;
	const relationTracks = (() => {
		const tracks = editor.scenes.getActiveScene().tracks;
		return [...tracks.overlay, tracks.main, ...tracks.audio];
	})();
	const groupPlan = planElementRelationUpdate({
		tracks: relationTracks,
		selection: selectedElements,
		kind: "group",
		relationId: "preview-group",
	});
	const linkPlan = planElementRelationUpdate({
		tracks: relationTracks,
		selection: selectedElements,
		kind: "link",
		relationId: "preview-link",
	});
	const hasSelectedElementKeyframes =
		!!selectedElement &&
		getElementKeyframes({
			animations: selectedElement.element.animations,
		}).length > 0;
	const isSelectedElementExpanded = useTimelineStore(
		(state) =>
			!!selectedElement &&
			state.expandedElementIds.has(selectedElement.element.id),
	);
	const toggleElementExpanded = useTimelineStore(
		(state) => state.toggleElementExpanded,
	);
	const canFreeze =
		selectedElement?.element.type === "video" &&
		editor.playback.getCurrentTime() >= selectedElement.element.startTime &&
		editor.playback.getCurrentTime() <=
			selectedElement.element.startTime + selectedElement.element.duration;
	const isFrozen =
		selectedElement?.element.type === "video" &&
		selectedElement.element.retime?.freezeFrameAt !== undefined;
	const toggleFreezeFrame = () => {
		if (!selectedElement || selectedElement.element.type !== "video") return;
		const element = selectedElement.element;
		const next = { ...(element.retime ?? { rate: 1 }) };
		if (next.freezeFrameAt !== undefined) {
			delete next.freezeFrameAt;
		} else {
			const sourceSpan = Math.max(
				0,
				(element.sourceDuration ?? element.duration) -
					element.trimStart -
					element.trimEnd,
			);
			next.freezeFrameAt = roundMediaTime({
				time: getSourceTimeAtClipTime({
					clipTime: Math.max(
						0,
						Math.min(
							element.duration,
							editor.playback.getCurrentTime() - element.startTime,
						),
					),
					retime: next,
					sourceSpan,
				}),
			});
		}
		editor.timeline.updateElementRetime({
			trackId: selectedElement.track.id,
			elementId: element.id,
			retime: next,
		});
	};

	const handleAction = ({
		action,
		event,
	}: {
		action: TActionWithOptionalArgs;
		event: React.MouseEvent;
	}) => {
		event.stopPropagation();
		invokeAction(action);
	};
	const applyRelation = ({ kind }: { kind: "group" | "link" }) => {
		const plan = planElementRelationUpdate({
			tracks: relationTracks,
			selection: selectedElements,
			kind,
			relationId: generateUUID(),
		});
		if (!plan.available) return;
		editor.timeline.updateElements({ updates: plan.updates });
	};

	return (
		<div className="flex items-center gap-1">
			<TooltipProvider delayDuration={500}>
				<TimelineToolbarButton
					icon={<HugeiconsIcon icon={ScissorIcon} />}
					tooltip="分割素材"
					shortcut={shortcutByAction.get("split")}
					onClick={({ event }) => handleAction({ action: "split", event })}
				/>

				<TimelineToolbarButton
					icon={<HugeiconsIcon icon={Layers01Icon} />}
					isActive={groupPlan.action === "ungroup"}
					tooltip={
						groupPlan.available
							? groupPlan.action === "ungroup"
								? "取消素材编组"
								: "将所选素材编组"
							: (groupPlan.reason ?? "将所选素材编组")
					}
					disabled={!groupPlan.available}
					onClick={({ event }) => {
						event.stopPropagation();
						applyRelation({ kind: "group" });
					}}
				/>

				<TimelineToolbarButton
					icon={
						<HugeiconsIcon
							icon={linkPlan.action === "unlink" ? Unlink02Icon : Link02Icon}
						/>
					}
					isActive={linkPlan.action === "unlink"}
					tooltip={
						linkPlan.available
							? linkPlan.action === "unlink"
								? "取消音视频链接"
								: "链接所选音视频"
							: (linkPlan.reason ?? "链接所选音视频")
					}
					disabled={!linkPlan.available}
					onClick={({ event }) => {
						event.stopPropagation();
						applyRelation({ kind: "link" });
					}}
				/>

				<TimelineToolbarButton
					icon={<HugeiconsIcon icon={AlignLeftIcon} />}
					tooltip="分割并删除左侧"
					shortcut={shortcutByAction.get("split-left")}
					onClick={({ event }) => handleAction({ action: "split-left", event })}
				/>

				<TimelineToolbarButton
					icon={<HugeiconsIcon icon={AlignRightIcon} />}
					tooltip="分割并删除右侧"
					shortcut={shortcutByAction.get("split-right")}
					onClick={({ event }) =>
						handleAction({ action: "split-right", event })
					}
				/>

				<TimelineToolbarButton
					icon={<HugeiconsIcon icon={Copy01Icon} />}
					tooltip="复制素材"
					shortcut={shortcutByAction.get("duplicate-selected")}
					onClick={({ event }) =>
						handleAction({ action: "duplicate-selected", event })
					}
				/>

				<TimelineToolbarButton
					icon={<HugeiconsIcon icon={SnowIcon} />}
					isActive={isFrozen}
					tooltip={isFrozen ? "移除定格" : "在播放头处定格"}
					disabled={!canFreeze && !isFrozen}
					onClick={({ event }) => {
						event.stopPropagation();
						toggleFreezeFrame();
					}}
				/>

				<TimelineToolbarButton
					icon={<HugeiconsIcon icon={Delete02Icon} />}
					tooltip="删除素材"
					shortcut={shortcutByAction.get("delete-selected")}
					onClick={({ event }) =>
						handleAction({ action: "delete-selected", event })
					}
				/>

				<div className="bg-border mx-1 h-6 w-px" />

				<Tooltip>
					<TimelineToolbarButton
						icon={<HugeiconsIcon icon={Bookmark02Icon} />}
						isActive={isCurrentlyBookmarked}
						tooltip={isCurrentlyBookmarked ? "移除书签" : "添加书签"}
						onClick={({ event }) =>
							handleAction({ action: "toggle-bookmark", event })
						}
					/>
				</Tooltip>

				<MarkerManagerPopover />
				<TransitionManagerPopover />
				<CompoundClipPopover />

				<GraphEditorPopover
					open={graphEditor.open}
					onOpenChange={graphEditor.onOpenChange}
					value={
						graphEditor.state.status === "ready"
							? graphEditor.state.cubicBezier
							: null
					}
					message={graphEditor.state.message}
					componentOptions={graphEditor.state.componentOptions}
					activeComponentKey={graphEditor.state.activeComponentKey}
					onActiveComponentKeyChange={graphEditor.onActiveComponentKeyChange}
					onPreviewValue={graphEditor.onPreviewValue}
					onCommitValue={graphEditor.onCommitValue}
					onCancelPreview={graphEditor.onCancelPreview}
				>
					<TimelineToolbarButton
						icon={<HugeiconsIcon icon={Chart03Icon} />}
						tooltip={graphEditor.tooltip}
						disabled={!graphEditor.canOpen}
						buttonWrapper={(button) =>
							graphEditor.canOpen ? (
								<PopoverTrigger asChild>{button}</PopoverTrigger>
							) : (
								button
							)
						}
					/>
				</GraphEditorPopover>

				<TimelineToolbarButton
					icon={<HugeiconsIcon icon={KeyframeIcon} />}
					isActive={isSelectedElementExpanded}
					tooltip={
						isSelectedElementExpanded ? "收起关键帧轨道" : "展开关键帧轨道"
					}
					disabled={!hasSelectedElementKeyframes}
					onClick={({ event }) => {
						event.stopPropagation();
						if (selectedElement) {
							toggleElementExpanded(selectedElement.element.id);
						}
					}}
				/>

				<KeyframeSelectionToolbar />
			</TooltipProvider>
		</div>
	);
}

function SceneSelector() {
	const editor = useEditor();
	const currentScene = editor.scenes.getActiveScene();

	return (
		<div>
			<SplitButton className="border-foreground/10 border">
				<SplitButtonLeft>{currentScene?.name || "未命名场景"}</SplitButtonLeft>
				<SplitButtonSeparator />
				<ScenesView>
					<SplitButtonRight onClick={() => {}}>
						<HugeiconsIcon icon={Layers01Icon} className="size-4" />
					</SplitButtonRight>
				</ScenesView>
			</SplitButton>
		</div>
	);
}

function ToolbarRightSection({
	zoomLevel,
	minZoom,
	onZoomChange,
	onZoom,
}: {
	zoomLevel: number;
	minZoom: number;
	onZoomChange: (zoom: number) => void;
	onZoom: (options: { direction: "in" | "out" }) => void;
}) {
	return (
		<div className="flex items-center gap-1">
			<div className="flex items-center gap-1">
				<Button
					aria-label="缩小时间线"
					title="缩小时间线"
					variant="text"
					size="icon"
					onClick={() => onZoom({ direction: "out" })}
				>
					<HugeiconsIcon icon={SearchMinusIcon} />
				</Button>
				<Slider
					className="w-28"
					value={[zoomToSlider({ zoomLevel, minZoom })]}
					onValueChange={(values) =>
						onZoomChange(sliderToZoom({ sliderPosition: values[0], minZoom }))
					}
					min={0}
					max={1}
					step={0.005}
				/>
				<Button
					aria-label="放大时间线"
					title="放大时间线"
					variant="text"
					size="icon"
					onClick={() => onZoom({ direction: "in" })}
				>
					<HugeiconsIcon icon={SearchAddIcon} />
				</Button>
			</div>
		</div>
	);
}

function useTimelineToolbarShortcuts() {
	const { shortcuts } = useKeyboardShortcutsHelp();

	return useMemo(
		() =>
			new Map(
				shortcuts.map(
					(shortcut) => [shortcut.action, shortcut.keys.join(" / ")] as const,
				),
			),
		[shortcuts],
	);
}
