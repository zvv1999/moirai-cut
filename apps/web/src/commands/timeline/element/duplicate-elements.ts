import {
	Command,
	createElementSelectionResult,
	type CommandResult,
} from "@/commands/base-command";
import type { SceneTracks, TimelineElement } from "@/timeline";
import { generateUUID } from "@/utils/id";
import { EditorCore } from "@/core";
import { applyPlacement, resolveTrackPlacement } from "@/timeline/placement";
import { cloneAnimations } from "@/animation";
import type { MediaTime } from "@/wasm";

interface DuplicateElementsParams {
	elements: { trackId: string; elementId: string }[];
}

type CopyIdentity = { elementId: string; trackId: string; groupPath: string[] };
type PreparedCopy = { source: CopyIdentity; destination: CopyIdentity; element: TimelineElement };

export class DuplicateElementsCommand extends Command {
	private duplicatedElements: { trackId: string; elementId: string }[] = [];
	private savedState: SceneTracks | null = null;
	private elements: DuplicateElementsParams["elements"];
	private prepared: { before: string; sceneId: string; projectId: string | undefined; tracks: SceneTracks } | null = null;
	private copies: PreparedCopy[] = [];

	constructor({ elements }: DuplicateElementsParams) {
		super();
		this.elements = elements;
	}

	/** Resolve native references before entering the synchronous undo transaction. */
	async prepare(): Promise<void> {
		this.prepared = null;
		const editor = EditorCore.getInstance();
		if (editor.project.getIsLoading?.()) throw new Error("工程仍在加载，请稍后复制");
		const scene = editor.scenes.getActiveScene();
		const projectId = editor.project.getActiveOrNull()?.metadata.id;
		const before = JSON.stringify(scene.tracks);
		const tracks = this.buildTracks(scene.tracks);
		if (this.copies.some(copy => containsAttachment(copy.element))) {
			const response = await fetch("/api/footage/timeline/copies/remap", {
				method: "POST",
				headers: { "content-type": "application/json", "x-requested-with": "moirai-footage" },
				body: JSON.stringify({ copies: this.copies }),
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error ?? "复制依附元素失败");
			if (!Array.isArray(result.elements) || result.elements.length !== this.copies.length) throw new Error("复制服务返回了不完整的元素");
			for (const [index, copy] of this.copies.entries()) {
				if (result.elements[index]?.id !== copy.destination.elementId) throw new Error("复制服务返回的元素身份不匹配");
			}
			for (const [index, copy] of this.copies.entries()) {
				const track = [...tracks.overlay, tracks.main, ...tracks.audio].find(track => track.id === copy.destination.trackId)!;
				const position = track.elements.findIndex(element => element.id === copy.destination.elementId);
				track.elements[position] = result.elements[index];
			}
		}
		this.prepared = { before, sceneId: scene.id, projectId, tracks };
	}

	execute(): CommandResult | undefined {
		this.savedState = null;
		const editor = EditorCore.getInstance();
		if (editor.project.getIsLoading?.()) throw new Error("工程仍在加载，请稍后复制");
		const scene = editor.scenes.getActiveScene();
		let updatedTracks: SceneTracks;
		if (this.prepared) {
			if (scene.id !== this.prepared.sceneId || editor.project.getActiveOrNull()?.metadata.id !== this.prepared.projectId || JSON.stringify(scene.tracks) !== this.prepared.before) {
				throw new Error("复制期间工程已改变，请重新复制");
			}
			updatedTracks = this.prepared.tracks;
		} else {
			updatedTracks = this.buildTracks(scene.tracks);
			if (this.copies.some(copy => containsAttachment(copy.element))) throw new Error("复制依附元素需要先调用原生引用准备接口");
		}
		this.savedState = scene.tracks;
		editor.timeline.updateTracks(updatedTracks);
		if (this.duplicatedElements.length > 0) return createElementSelectionResult(this.duplicatedElements);
		return undefined;
	}

	private buildTracks(sourceTracks: SceneTracks): SceneTracks {
		this.duplicatedElements = [];
		this.copies = [];

		let updatedTracks = sourceTracks;

		for (const track of [
			...sourceTracks.overlay,
			sourceTracks.main,
			...sourceTracks.audio,
		]) {
			const elementsToDuplicate = this.elements.filter(
				(elementEntry) => elementEntry.trackId === track.id,
			);

			if (elementsToDuplicate.length === 0) {
				continue;
			}

			const elementIdsToDuplicate = new Set(
				elementsToDuplicate.map((element) => element.elementId),
			);
			const newTrackElements: TimelineElement[] = [];
			const originalIds: string[] = [];

			for (const element of track.elements) {
				if (!elementIdsToDuplicate.has(element.id)) {
					continue;
				}

				const newId = generateUUID();
				originalIds.push(element.id);
				newTrackElements.push(
					buildDuplicateElement({
						element,
						id: newId,
						startTime: element.startTime,
					}),
				);
			}

			const placementResult = resolveTrackPlacement({
				tracks: updatedTracks,
				trackType: track.type,
				timeSpans: [],
				strategy: { type: "alwaysNew", position: "highest" },
			});
			if (!placementResult || placementResult.kind !== "newTrack") {
				continue;
			}

			const applied = applyPlacement({
				tracks: updatedTracks,
				placementResult,
				elements: newTrackElements,
			});
			if (!applied) {
				continue;
			}

			updatedTracks = applied.updatedTracks;

			for (const [index, element] of newTrackElements.entries()) {
				this.copies.push({ source: { elementId: originalIds[index], trackId: track.id, groupPath: [] }, destination: { elementId: element.id, trackId: applied.targetTrackId, groupPath: [] }, element });
				this.duplicatedElements.push({
					trackId: applied.targetTrackId,
					elementId: element.id,
				});
			}
		}

		return updatedTracks;
	}

	undo(): void {
		if (this.savedState) {
			const editor = EditorCore.getInstance();
			editor.timeline.updateTracks(this.savedState);
		}
	}

	getDuplicatedElements(): { trackId: string; elementId: string }[] {
		return this.duplicatedElements;
	}
}

function buildDuplicateElement({
	element,
	id,
	startTime,
}: {
	element: TimelineElement;
	id: string;
	startTime: MediaTime;
}): TimelineElement {
	return {
		...structuredClone(element),
		id,
		name: `${element.name} (copy)`,
		startTime,
		animations: cloneAnimations({
			animations: element.animations,
			shouldRegenerateKeyframeIds: true,
		}),
	};
}

function containsAttachment(element: TimelineElement): boolean {
	return Boolean(element.textAttachment) || Boolean(element.renderGroup?.tracks.some(track => track.elements.some(containsAttachment)));
}
