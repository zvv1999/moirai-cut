import type { EditorCore } from "@/core";
import { toast } from "sonner";
import type { MediaAsset } from "@/media/types";
import { storageService } from "@/services/storage/service";
import { generateUUID } from "@/utils/id";
import { videoCache } from "@/services/video-cache/service";
import { waveformCache } from "@/services/waveform-cache/service";
import {
	BatchCommand,
	RelinkMediaAssetCommand,
	RemoveMediaAssetCommand,
	UpdateMediaAssetCommand,
} from "@/commands";
import { buildBatchMediaNames } from "@/media/proxy";

export class MediaManager {
	private assets: MediaAsset[] = [];
	private isLoading = false;
	private listeners = new Set<() => void>();

	constructor(private editor: EditorCore) {}

	async addMediaAsset({
		projectId,
		asset,
	}: {
		projectId: string;
		asset: Omit<MediaAsset, "id">;
	}): Promise<MediaAsset | null> {
		const newAsset: MediaAsset = {
			...asset,
			id: generateUUID(),
		};

		this.assets = [...this.assets, newAsset];
		this.notify();

		try {
			await storageService.saveMediaAsset({ projectId, mediaAsset: newAsset });
			this.editor.project.ratchetFpsForImportedMedia({
				importedAssets: [newAsset],
			});
			return newAsset;
		} catch (error) {
			console.error("Failed to save media asset:", error);
			this.assets = this.assets.filter((asset) => asset.id !== newAsset.id);
			this.notify();

			if (storageService.isQuotaExceededError({ error })) {
				toast.error("Not enough browser storage", {
					description: error instanceof Error ? error.message : undefined,
				});
			}

			return null;
		}
	}

	removeMediaAsset({ projectId, id }: { projectId: string; id: string }): void {
		this.removeMediaAssets({ projectId, ids: [id] });
	}

	removeMediaAssets({
		projectId,
		ids,
	}: {
		projectId: string;
		ids: string[];
	}): void {
		const uniqueIds = [...new Set(ids)];
		if (uniqueIds.length === 0) {
			return;
		}

		const command =
			uniqueIds.length === 1
				? new RemoveMediaAssetCommand({
						projectId,
						assetId: uniqueIds[0],
					})
				: new BatchCommand(
						uniqueIds.map(
							(id) =>
								new RemoveMediaAssetCommand({
									projectId,
									assetId: id,
								}),
						),
					);

		this.editor.command.execute({ command });
	}

	relinkMediaAsset({
		projectId,
		assetId,
		asset,
	}: {
		projectId: string;
		assetId: string;
		asset: Omit<MediaAsset, "id">;
	}): void {
		this.relinkMediaAssets({
			projectId,
			items: [{ assetId, asset }],
		});
	}

	relinkMediaAssets({
		projectId,
		items,
	}: {
		projectId: string;
		items: Array<{
			assetId: string;
			asset: Omit<MediaAsset, "id">;
		}>;
	}): void {
		if (items.length === 0) return;

		const commands = items.map(
			({ assetId, asset }) =>
				new RelinkMediaAssetCommand({
					projectId,
					assetId,
					asset,
				}),
		);
		const command =
			commands.length === 1 ? commands[0] : new BatchCommand(commands);
		this.editor.command.execute({ command });
	}

	renameMediaAssets({
		projectId,
		assets,
		prefix,
		startIndex,
	}: {
		projectId: string;
		assets: MediaAsset[];
		prefix: string;
		startIndex: number;
	}): void {
		const names = buildBatchMediaNames({ assets, prefix, startIndex });
		const commands = names.map(
			({ assetId, name }) =>
				new UpdateMediaAssetCommand({
					projectId,
					assetId,
					update: (asset) => ({ ...asset, name }),
				}),
		);
		if (commands.length === 0) return;
		this.editor.command.execute({
			command: commands.length === 1 ? commands[0] : new BatchCommand(commands),
		});
	}

	updateMediaAssets({
		projectId,
		updates,
	}: {
		projectId: string;
		updates: Array<{
			assetId: string;
			update: (asset: MediaAsset) => MediaAsset;
		}>;
	}): void {
		const commands = updates.map(
			({ assetId, update }) =>
				new UpdateMediaAssetCommand({ projectId, assetId, update }),
		);
		if (commands.length === 0) return;
		this.editor.command.execute({
			command: commands.length === 1 ? commands[0] : new BatchCommand(commands),
		});
	}

	async loadProjectMedia({ projectId }: { projectId: string }): Promise<void> {
		this.isLoading = true;
		this.notify();

		try {
			const mediaAssets = await storageService.loadAllMediaAssets({
				projectId,
			});
			this.assets = mediaAssets;
			this.notify();
		} catch (error) {
			console.error("Failed to load media assets:", error);
		} finally {
			this.isLoading = false;
			this.notify();
		}
	}

	async clearProjectMedia({ projectId }: { projectId: string }): Promise<void> {
		waveformCache.clearAll();

		this.assets.forEach((asset) => {
			if (asset.url) {
				URL.revokeObjectURL(asset.url);
			}
			if (asset.thumbnailUrl) {
				URL.revokeObjectURL(asset.thumbnailUrl);
			}
			if (asset.proxyUrl) {
				URL.revokeObjectURL(asset.proxyUrl);
			}
		});

		const mediaIds = this.assets.map((asset) => asset.id);
		this.assets = [];
		this.notify();

		try {
			await Promise.all(
				mediaIds.map((id) =>
					storageService.deleteMediaAsset({ projectId, id }),
				),
			);
		} catch (error) {
			console.error("Failed to clear media assets from storage:", error);
		}
	}

	clearAllAssets(): void {
		videoCache.clearAll();
		waveformCache.clearAll();

		this.assets.forEach((asset) => {
			if (asset.url) {
				URL.revokeObjectURL(asset.url);
			}
			if (asset.thumbnailUrl) {
				URL.revokeObjectURL(asset.thumbnailUrl);
			}
			if (asset.proxyUrl) {
				URL.revokeObjectURL(asset.proxyUrl);
			}
		});

		this.assets = [];
		this.notify();
	}

	getAssets(): MediaAsset[] {
		return this.assets;
	}

	setAssets({ assets }: { assets: MediaAsset[] }): void {
		this.assets = assets;
		this.notify();
	}

	isLoadingMedia(): boolean {
		return this.isLoading;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		this.listeners.forEach((fn) => {
			fn();
		});
	}
}
