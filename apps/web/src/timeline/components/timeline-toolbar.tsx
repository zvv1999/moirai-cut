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
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { GraphEditorPopover } from "./graph-editor/popover";
import { PopoverTrigger } from "@/components/ui/popover";
import { useGraphEditorController } from "./graph-editor/use-controller";
import { useMemo } from "react";
import { useKeyboardShortcutsHelp } from "@/actions/use-keyboard-shortcuts-help";
import { TimelineToolbarButton } from "./timeline-toolbar-button";
import { KeyframeSelectionToolbar } from "./keyframe-selection-toolbar";
import { getElementKeyframes } from "@/animation";

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
			<div className="flex h-10 items-center justify-between border-b px-2 py-1">
				<ToolbarLeftSection />

				<SceneSelector />

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

	return (
		<div className="flex items-center gap-1">
			<TooltipProvider delayDuration={500}>
				<TimelineToolbarButton
					icon={<HugeiconsIcon icon={ScissorIcon} />}
					tooltip="Split element"
					shortcut={shortcutByAction.get("split")}
					onClick={({ event }) => handleAction({ action: "split", event })}
				/>

				<TimelineToolbarButton
					icon={<HugeiconsIcon icon={AlignLeftIcon} />}
					tooltip="Split left"
					shortcut={shortcutByAction.get("split-left")}
					onClick={({ event }) => handleAction({ action: "split-left", event })}
				/>

				<TimelineToolbarButton
					icon={<HugeiconsIcon icon={AlignRightIcon} />}
					tooltip="Split right"
					shortcut={shortcutByAction.get("split-right")}
					onClick={({ event }) =>
						handleAction({ action: "split-right", event })
					}
				/>

				<TimelineToolbarButton
					icon={<HugeiconsIcon icon={Copy01Icon} />}
					tooltip="Duplicate element"
					shortcut={shortcutByAction.get("duplicate-selected")}
					onClick={({ event }) =>
						handleAction({ action: "duplicate-selected", event })
					}
				/>

				<TimelineToolbarButton
					icon={<HugeiconsIcon icon={SnowIcon} />}
					tooltip="Freeze frame (coming soon)"
					disabled={true}
					onClick={({ event: _event }) => {}}
				/>

				<TimelineToolbarButton
					icon={<HugeiconsIcon icon={Delete02Icon} />}
					tooltip="Delete element"
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
						tooltip={isCurrentlyBookmarked ? "Remove bookmark" : "Add bookmark"}
						onClick={({ event }) =>
							handleAction({ action: "toggle-bookmark", event })
						}
					/>
				</Tooltip>

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
						isSelectedElementExpanded
							? "Collapse keyframe lanes"
							: "Expand keyframe lanes"
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
				<SplitButtonLeft>{currentScene?.name || "No Scene"}</SplitButtonLeft>
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
					aria-label="Zoom out timeline"
					title="Zoom out timeline"
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
					aria-label="Zoom in timeline"
					title="Zoom in timeline"
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
