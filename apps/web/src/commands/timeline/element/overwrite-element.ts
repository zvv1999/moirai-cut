import {
	Command,
	createElementSelectionResult,
	type CommandResult,
} from "@/commands/base-command";
import { DeleteElementsCommand } from "./delete-elements";
import { InsertElementCommand } from "./insert-element";
import { SplitElementsCommand } from "./split-elements";
import { EditorCore } from "@/core";
import type {
	CreateTimelineElement,
	SceneTracks,
	TimelineElement,
} from "@/timeline";
import { findTrackInSceneTracks } from "@/timeline/track-element-update";
import { canElementGoOnTrack } from "@/timeline/placement";
import { addMediaTime, type MediaTime } from "@/wasm";

export class OverwriteElementCommand extends Command {
	private before: SceneTracks | null = null;
	private after: SceneTracks | null = null;
	private insertedElementId: string | null = null;
	private readonly insertCommand: InsertElementCommand;

	constructor({
		element,
		trackId,
	}: {
		element: CreateTimelineElement;
		trackId: string;
	}) {
		super();
		this.element = element;
		this.trackId = trackId;
		this.insertCommand = new InsertElementCommand({
			element,
			placement: { mode: "explicit", trackId },
		});
	}

	private readonly element: CreateTimelineElement;
	private readonly trackId: string;

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		const tracks = editor.scenes.getActiveScene().tracks;
		const target = findTrackInSceneTracks({ tracks, trackId: this.trackId });
		if (
			!target ||
			target.locked ||
			!canElementGoOnTrack({
				elementType: this.element.type,
				trackType: target.type,
			})
		) {
			return undefined;
		}

		this.before = tracks;
		const overwriteStart = this.element.startTime;
		const overwriteEnd = addMediaTime({
			a: overwriteStart,
			b: this.element.duration,
		});

		this.splitAtBoundary({ boundary: overwriteStart });
		this.splitAtBoundary({ boundary: overwriteEnd });
		this.deleteCoveredElements({
			startTime: overwriteStart,
			endTime: overwriteEnd,
		});
		const result = this.insertCommand.execute();
		this.insertedElementId = this.insertCommand.getElementId();
		this.after = editor.scenes.getActiveScene().tracks;
		return result;
	}

	undo(): void {
		if (!this.before) return;
		EditorCore.getInstance().timeline.updateTracks(this.before);
	}

	redo(): CommandResult | undefined {
		if (!this.after || !this.insertedElementId) return this.execute();
		EditorCore.getInstance().timeline.updateTracks(this.after);
		return createElementSelectionResult([
			{ trackId: this.trackId, elementId: this.insertedElementId },
		]);
	}

	private splitAtBoundary({ boundary }: { boundary: MediaTime }): void {
		const editor = EditorCore.getInstance();
		const target = findTrackInSceneTracks({
			tracks: editor.scenes.getActiveScene().tracks,
			trackId: this.trackId,
		});
		if (!target) return;
		const elements = target.elements
			.filter((element) => crossesBoundary({ element, boundary }))
			.map((element) => ({
				trackId: this.trackId,
				elementId: element.id,
			}));
		if (elements.length === 0) return;
		new SplitElementsCommand({ elements, splitTime: boundary }).execute();
	}

	private deleteCoveredElements({
		startTime,
		endTime,
	}: {
		startTime: MediaTime;
		endTime: MediaTime;
	}): void {
		const editor = EditorCore.getInstance();
		const target = findTrackInSceneTracks({
			tracks: editor.scenes.getActiveScene().tracks,
			trackId: this.trackId,
		});
		if (!target) return;
		const elements = target.elements
			.filter((element) => {
				const elementEnd = addMediaTime({
					a: element.startTime,
					b: element.duration,
				});
				return element.startTime >= startTime && elementEnd <= endTime;
			})
			.map((element) => ({
				trackId: this.trackId,
				elementId: element.id,
			}));
		if (elements.length === 0) return;
		new DeleteElementsCommand({ elements }).execute();
	}
}

function crossesBoundary({
	element,
	boundary,
}: {
	element: TimelineElement;
	boundary: MediaTime;
}): boolean {
	return (
		element.startTime < boundary &&
		addMediaTime({ a: element.startTime, b: element.duration }) > boundary
	);
}
