import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { Bookmark, TScene } from "@/timeline";
import { updateSceneInArray } from "@/timeline/scenes";

export class AddBookmarkCommand extends Command {
	private savedScenes: TScene[] | null = null;

	constructor(private readonly bookmark: Bookmark) {
		super();
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		const activeScene = editor.scenes.getActiveScene();
		const scenes = editor.scenes.getScenes();
		this.savedScenes = [...scenes];
		if (activeScene.bookmarks.some((marker) => marker.id === this.bookmark.id)) {
			return;
		}

		const bookmarks = [...activeScene.bookmarks, this.bookmark].sort(
			(left, right) => left.time - right.time,
		);
		editor.scenes.setScenes({
			scenes: updateSceneInArray({
				scenes,
				sceneId: activeScene.id,
				updates: { bookmarks },
			}),
		});
	}

	undo(): void {
		if (!this.savedScenes) return;
		EditorCore.getInstance().scenes.setScenes({ scenes: this.savedScenes });
	}
}
