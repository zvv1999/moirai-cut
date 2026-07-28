import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { MediaAsset } from "@/media/types";
import { storageService } from "@/services/storage/service";
import { videoCache } from "@/services/video-cache/service";

type UpdateMediaEditor = {
	media: {
		getAssets: () => MediaAsset[];
		setAssets: (args: { assets: MediaAsset[] }) => void;
	};
};

type UpdateMediaAssetDependencies = {
	getEditor: () => UpdateMediaEditor;
	saveMediaAssetMetadata: typeof storageService.saveMediaAssetMetadata;
	saveMediaProxy: typeof storageService.saveMediaProxy;
	deleteMediaProxy: typeof storageService.deleteMediaProxy;
	clearCaches: (args: { mediaIds: string[] }) => void;
};

export class UpdateMediaAssetCommand extends Command {
	private previousAsset: MediaAsset | null = null;
	private updatedAsset: MediaAsset | null = null;

	constructor({
		projectId,
		assetId,
		update,
		dependencies = {},
	}: {
		projectId: string;
		assetId: string;
		update: (asset: MediaAsset) => MediaAsset;
		dependencies?: Partial<UpdateMediaAssetDependencies>;
	}) {
		super();
		this.projectId = projectId;
		this.assetId = assetId;
		this.update = update;
		this.dependencies = dependencies;
	}

	private projectId: string;
	private assetId: string;
	private update: (asset: MediaAsset) => MediaAsset;
	private dependencies: Partial<UpdateMediaAssetDependencies>;

	execute(): CommandResult | undefined {
		const editor = this.getEditor();
		const assets = editor.media.getAssets();
		this.previousAsset =
			assets.find((asset) => asset.id === this.assetId) ?? null;
		if (!this.previousAsset) return undefined;

		this.updatedAsset = this.update(this.previousAsset);
		this.clearCaches({ before: this.previousAsset, after: this.updatedAsset });
		editor.media.setAssets({
			assets: assets.map((asset) =>
				asset.id === this.assetId ? this.updatedAsset! : asset,
			),
		});
		void this.persist({
			before: this.previousAsset,
			after: this.updatedAsset,
		});
		return undefined;
	}

	undo(): void {
		if (!this.previousAsset || !this.updatedAsset) return;
		const editor = this.getEditor();
		const assets = editor.media.getAssets();
		this.clearCaches({ before: this.updatedAsset, after: this.previousAsset });
		editor.media.setAssets({
			assets: assets.map((asset) =>
				asset.id === this.assetId ? this.previousAsset! : asset,
			),
		});
		void this.persist({
			before: this.updatedAsset,
			after: this.previousAsset,
		});
	}

	private getEditor(): UpdateMediaEditor {
		return this.dependencies.getEditor?.() ?? EditorCore.getInstance();
	}

	private async persist({
		before,
		after,
	}: {
		before: MediaAsset;
		after: MediaAsset;
	}): Promise<void> {
		try {
			if (after.proxy && after.proxyFile) {
				await (
					this.dependencies.saveMediaProxy?.({
						projectId: this.projectId,
						mediaAsset: after,
					}) ??
					storageService.saveMediaProxy({
						projectId: this.projectId,
						mediaAsset: after,
					})
				);
			} else {
				if (before.proxy) {
					await (
						this.dependencies.deleteMediaProxy?.({
							projectId: this.projectId,
							storageId: before.proxy.storageId,
						}) ??
						storageService.deleteMediaProxy({
							projectId: this.projectId,
							storageId: before.proxy.storageId,
						})
					);
				}
				await (
					this.dependencies.saveMediaAssetMetadata?.({
						projectId: this.projectId,
						mediaAsset: after,
					}) ??
					storageService.saveMediaAssetMetadata({
						projectId: this.projectId,
						mediaAsset: after,
					})
				);
			}
		} catch (error) {
			console.error("Failed to persist media update:", error);
		}
	}

	private clearCaches({
		before,
		after,
	}: {
		before: MediaAsset;
		after: MediaAsset;
	}): void {
		const mediaIds = [
			before.id,
			before.proxy?.storageId,
			after.proxy?.storageId,
		].filter((id): id is string => Boolean(id));
		if (this.dependencies.clearCaches) {
			this.dependencies.clearCaches({ mediaIds });
			return;
		}
		for (const mediaId of mediaIds) {
			videoCache.clearVideo({ mediaId });
		}
	}
}
