import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { MediaAsset } from "@/media/types";
import { buildWaveformSourceKey } from "@/media/waveform-summary";
import { storageService } from "@/services/storage/service";
import { videoCache } from "@/services/video-cache/service";
import { waveformCache } from "@/services/waveform-cache/service";

type PersistMediaAsset = (args: {
	projectId: string;
	mediaAsset: MediaAsset;
}) => Promise<void>;

type DeleteMediaAsset = (args: {
	projectId: string;
	id: string;
}) => Promise<void>;

type RelinkMediaEditor = {
	media: {
		getAssets: () => MediaAsset[];
		setAssets: (args: { assets: MediaAsset[] }) => void;
	};
};

type RelinkMediaAssetDependencies = {
	getEditor: () => RelinkMediaEditor;
	saveMediaAsset: PersistMediaAsset;
	deleteMediaAsset: DeleteMediaAsset;
	clearCaches: (args: { mediaId: string }) => void;
};

export class RelinkMediaAssetCommand extends Command {
	private previousAsset: MediaAsset | null = null;
	private replacementAsset: MediaAsset | null = null;
	private dependencies: Partial<RelinkMediaAssetDependencies>;

	constructor({
		projectId,
		assetId,
		asset,
		dependencies = {},
	}: {
		projectId: string;
		assetId: string;
		asset: Omit<MediaAsset, "id"> | MediaAsset;
		dependencies?: Partial<RelinkMediaAssetDependencies>;
	}) {
		super();
		this.projectId = projectId;
		this.assetId = assetId;
		this.asset = asset;
		this.dependencies = dependencies;
	}

	private projectId: string;
	private assetId: string;
	private asset: Omit<MediaAsset, "id"> | MediaAsset;

	execute(): CommandResult | undefined {
		const editor = this.getEditor();
		const assets = editor.media.getAssets();
		this.previousAsset =
			assets.find((asset) => asset.id === this.assetId) ?? null;
		this.replacementAsset = {
			...this.asset,
			id: this.assetId,
		};

		this.clearCaches();
		editor.media.setAssets({
			assets: this.previousAsset
				? assets.map((asset) =>
						asset.id === this.assetId ? this.replacementAsset! : asset,
					)
				: [...assets, this.replacementAsset],
		});

		this.saveMediaAsset({
			mediaAsset: this.replacementAsset,
		}).catch((error) => {
			console.error("Failed to relink media asset:", error);
			const currentAssets = editor.media.getAssets();
			const isReplacementStillCurrent = currentAssets.some(
				(asset) =>
					asset.id === this.assetId &&
					asset.file === this.replacementAsset?.file,
			);
			if (!isReplacementStillCurrent) return;

			this.clearCaches();
			editor.media.setAssets({
				assets: this.previousAsset
					? currentAssets.map((asset) =>
							asset.id === this.assetId ? this.previousAsset! : asset,
						)
					: currentAssets.filter((asset) => asset.id !== this.assetId),
			});
		});

		return undefined;
	}

	undo(): void {
		const editor = this.getEditor();
		const assets = editor.media.getAssets();
		this.clearCaches();

		if (this.previousAsset) {
			editor.media.setAssets({
				assets: assets.map((asset) =>
					asset.id === this.assetId ? this.previousAsset! : asset,
				),
			});
			this.saveMediaAsset({
				mediaAsset: this.previousAsset,
			}).catch((error) => {
				console.error("Failed to restore media asset after undo:", error);
			});
			return;
		}

		editor.media.setAssets({
			assets: assets.filter((asset) => asset.id !== this.assetId),
		});
		this.deleteMediaAsset().catch((error) => {
			console.error("Failed to restore missing media state after undo:", error);
		});
	}

	private getEditor(): RelinkMediaEditor {
		return this.dependencies.getEditor?.() ?? EditorCore.getInstance();
	}

	private saveMediaAsset({
		mediaAsset,
	}: {
		mediaAsset: MediaAsset;
	}): Promise<void> {
		const args = {
			projectId: this.projectId,
			mediaAsset,
		};
		return (
			this.dependencies.saveMediaAsset?.(args) ??
			storageService.saveMediaAsset(args)
		);
	}

	private deleteMediaAsset(): Promise<void> {
		const args = {
			projectId: this.projectId,
			id: this.assetId,
		};
		return (
			this.dependencies.deleteMediaAsset?.(args) ??
			storageService.deleteMediaAsset(args)
		);
	}

	private clearCaches(): void {
		if (this.dependencies.clearCaches) {
			this.dependencies.clearCaches({ mediaId: this.assetId });
			return;
		}

		videoCache.clearVideo({ mediaId: this.assetId });
		waveformCache.clearSource({
			sourceKey: buildWaveformSourceKey({
				kind: "media",
				id: this.assetId,
			}),
		});
	}
}
