"use client";

import { Bookmark02Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import {
	createClipMarker,
	createTimelineMarker,
	getAdjacentMarker,
} from "@/timeline/bookmarks/marker-model";
import { generateUUID } from "@/utils/id";
import { mediaTimeToSeconds } from "@/wasm";

const MARKER_COLORS = ["#F97316", "#22C55E", "#38BDF8", "#A78BFA", "#F43F5E"];

export function MarkerManagerPopover() {
	const editor = useEditor();
	const markers = useEditor((currentEditor) => [
		...currentEditor.scenes.getActiveScene().bookmarks,
	]);
	const { selectedElements } = useElementSelection();
	const currentTime = useEditor((currentEditor) =>
		currentEditor.playback.getCurrentTime(),
	);
	const selected =
		selectedElements.length === 1
			? (editor.timeline.getElementsWithTracks({
					elements: selectedElements,
				})[0] ?? null)
			: null;
	const orderedMarkers = [...markers].sort(
		(left, right) => left.time - right.time,
	);
	const previousMarker = getAdjacentMarker({
		markers,
		time: currentTime,
		direction: "previous",
	});
	const nextMarker = getAdjacentMarker({
		markers,
		time: currentTime,
		direction: "next",
	});

	const addTimelineMarker = () => {
		const marker = createTimelineMarker({
			id: generateUUID(),
			time: currentTime,
			name: `标记 ${markers.length + 1}`,
		});
		editor.scenes.addBookmark({
			bookmark: {
				...marker,
				color: MARKER_COLORS[markers.length % MARKER_COLORS.length],
			},
		});
	};
	const addClipMarker = () => {
		if (!selected) return;
		const marker = createClipMarker({
			id: generateUUID(),
			trackId: selected.track.id,
			element: selected.element,
		});
		editor.scenes.addBookmark({
			bookmark: {
				...marker,
				color: MARKER_COLORS[markers.length % MARKER_COLORS.length],
			},
		});
	};
	const seekTo = (time: typeof currentTime) => {
		editor.playback.seek({ time });
	};

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="text"
					size="icon"
					className="relative rounded-sm"
					aria-label={`打开标记管理器（${markers.length}）`}
				>
					<HugeiconsIcon icon={Bookmark02Icon} />
					{markers.length > 0 ? (
						<span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 min-w-3 rounded-full px-0.5 text-[8px] leading-3">
							{markers.length}
						</span>
					) : null}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="bottom"
				className="flex w-80 flex-col gap-3 p-3"
			>
				<div>
					<p className="text-sm font-semibold">标记与范围</p>
					<p className="text-muted-foreground text-[11px]">
						支持命名、颜色标识和稳定 ID 定位。
					</p>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<Button type="button" size="sm" onClick={addTimelineMarker}>
						在播放头处添加
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={!selected}
						onClick={addClipMarker}
					>
						添加素材范围
					</Button>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={!previousMarker}
						onClick={() => previousMarker && seekTo(previousMarker.time)}
					>
						上一个
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={!nextMarker}
						onClick={() => nextMarker && seekTo(nextMarker.time)}
					>
						下一个
					</Button>
				</div>
				<div className="max-h-64 space-y-1 overflow-y-auto">
					{orderedMarkers.length === 0 ? (
						<p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-xs">
							暂无标记
						</p>
					) : (
						orderedMarkers.map((marker) => (
							<div
								key={marker.id}
								className="border-border bg-muted/20 flex items-center gap-2 rounded-md border p-2"
							>
								<span
									className="size-2.5 shrink-0 rounded-full"
									style={{ backgroundColor: marker.color }}
								/>
								<button
									type="button"
									className="min-w-0 flex-1 text-left"
									aria-label={`前往标记 ${marker.name ?? marker.id}`}
									onClick={() => seekTo(marker.time)}
								>
									<span className="block truncate text-xs font-medium">
										{marker.name ?? "未命名标记"}
									</span>
									<span className="text-muted-foreground block truncate font-mono text-[9px]">
										{marker.scope === "clip" ? "素材" : "时间线"} ·{" "}
										{mediaTimeToSeconds({ time: marker.time }).toFixed(2)} 秒 ·{" "}
										{marker.id.slice(0, 8)}
									</span>
								</button>
								<Button
									type="button"
									variant="text"
									size="icon"
									className="size-7 shrink-0"
									aria-label={`删除标记 ${marker.name ?? marker.id}`}
									onClick={() =>
										editor.scenes.removeBookmark({ time: marker.time })
									}
								>
									<HugeiconsIcon icon={Delete02Icon} className="!size-3.5" />
								</Button>
							</div>
						))
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
