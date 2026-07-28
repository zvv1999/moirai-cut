import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { SceneTracks, TrackControlPatch } from "@/timeline";
import {
	applyTrackControlPatch,
	updateTrackInSceneTracks,
} from "@/timeline";

export class UpdateTrackControlsCommand extends Command {
	private savedState: SceneTracks | null = null;

	constructor(
		private trackId: string,
		private patch: TrackControlPatch,
	) {
		super();
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;
		const updatedTracks = updateTrackInSceneTracks({
			tracks: this.savedState,
			trackId: this.trackId,
			update: (track) => applyTrackControlPatch({ track, patch: this.patch }),
		});
		editor.timeline.updateTracks(updatedTracks);
		return undefined;
	}

	undo(): void {
		if (!this.savedState) return;
		EditorCore.getInstance().timeline.updateTracks(this.savedState);
	}
}
