"use client";

import { useEditor } from "@/editor/use-editor";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export function ActiveLayerPicker() {
	const editor = useEditor();
	const scene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	const time = useEditor((e) => e.playback.getCurrentTime());
	const selected = useEditor((e) => e.selection.getSelectedElements());
	if (!scene) return null;
	const layers = [...scene.tracks.overlay, scene.tracks.main]
		.filter((t) => !t.hidden)
		.flatMap((track) =>
			track.elements
				.filter(
					(e) =>
						e.type !== "effect" &&
						!("hidden" in e && e.hidden) &&
						e.params.opacity !== 0 &&
						e.startTime <= time &&
						time < e.startTime + e.duration,
				)
				.map((element) => ({
					trackId: track.id,
					elementId: element.id,
					name:
						element.type === "text"
							? String(element.params.content || element.name)
							: element.name,
				})),
		);
	if (!layers.length) return null;
	return (
		<div className="border-b px-4 py-2">
			<Select
				value={
					layers.some((e) => e.elementId === selected[0]?.elementId)
						? selected[0]?.elementId
						: ""
				}
				onValueChange={(id) => {
					const layer = layers.find((e) => e.elementId === id);
					if (layer)
						editor.selection.setSelectedElements({
							elements: [
								{ trackId: layer.trackId, elementId: layer.elementId },
							],
						});
				}}
			>
				<SelectTrigger aria-label="当前画面图层" className="w-full">
					<SelectValue placeholder={`当前画面图层 (${layers.length})`} />
				</SelectTrigger>
				<SelectContent>
					{layers.map((layer) => (
						<SelectItem key={layer.elementId} value={layer.elementId}>
							{layer.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
