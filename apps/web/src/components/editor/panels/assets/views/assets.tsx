"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { MediaDragOverlay } from "@/components/editor/panels/assets/drag-overlay";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import { mediaTimeFromSeconds, type MediaTime } from "@/wasm";
import { useEditor } from "@/editor/use-editor";
import { useFileUpload } from "@/media/use-file-upload";
import { invokeAction } from "@/actions";
import { processMediaAssets } from "@/media/processing";
import { showMediaUploadToast } from "@/media/upload-toast";
import {
	SelectableItem,
	SelectableSurface,
	useSelection,
	useSelectionScope,
} from "@/selection";
import { buildElementFromMedia } from "@/timeline/element-utils";
import {
	type MediaSortKey,
	type MediaSortOrder,
	type MediaViewMode,
	useAssetsPanelStore,
} from "@/components/editor/panels/assets/assets-panel-store";
import { hasMediaId, MASKABLE_ELEMENT_TYPES } from "@/timeline";
import type { MediaAsset } from "@/media/types";
import {
	findMissingMediaReferences,
	matchFilesToMissingMedia,
	type MissingMediaReference,
} from "@/media/missing-media";
import { MissingMediaPlaceholder } from "@/media/missing-media-placeholder";
import { getMediaTypeFromFile } from "@/media/media-utils";
import { cn } from "@/utils/ui";
import { generateUUID } from "@/utils/id";
import {
	CloudUploadIcon,
	GridViewIcon,
	LeftToRightListDashIcon,
	SortingOneNineIcon,
	Image02Icon,
	MusicNote03Icon,
	Search01Icon,
	Video01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
	countActiveMediaLibraryFilters,
	filterMediaLibraryAssets,
	DEFAULT_MEDIA_LIBRARY_FILTERS,
	type MediaLibraryFilters,
	type MediaTypeFilter,
} from "./media-library-filters";
import { MediaLibraryControlsView } from "./media-library-controls";
import {
	assignAssetsToMediaBin,
	createMediaBin,
	deleteMediaBin,
	getMediaAssetMetadata,
	getMediaBinTree,
	mediaAssetMatchesBin,
	moveMediaBin,
	normalizeMediaOrganization,
	renameMediaBin,
	updateMediaAssetMetadata,
	type MediaAssetMetadata,
	type MediaBinSelection,
	type MediaColorLabel,
} from "@/media/organization";
import { MediaBinBrowserView } from "./media-bin-browser";
import { MediaMetadataEditorDialog } from "./media-metadata-editor";

export function MediaView() {
	const editor = useEditor();
	const mediaFiles = useEditor((e) => e.media.getAssets());
	const activeTracks = useEditor((e) => e.scenes.getActiveScene().tracks);
	const activeProject = useEditor((e) => e.project.getActive());

	const {
		mediaViewMode,
		setMediaViewMode,
		highlightMediaId,
		clearHighlight,
		mediaSortBy,
		mediaSortOrder,
		setMediaSort,
	} = useAssetsPanelStore();

	const [isProcessing, setIsProcessing] = useState(false);
	const [progress, setProgress] = useState(0);
	const [searchQuery, setSearchQuery] = useState("");
	const [mediaTypeFilter, setMediaTypeFilter] =
		useState<MediaTypeFilter>("all");
	const [libraryFilters, setLibraryFilters] = useState<MediaLibraryFilters>(
		DEFAULT_MEDIA_LIBRARY_FILTERS,
	);
	const [activeBinId, setActiveBinId] =
		useState<MediaBinSelection>("all");
	const [metadataEditorAssetIds, setMetadataEditorAssetIds] = useState<
		string[]
	>([]);
	const relinkInputRef = useRef<HTMLInputElement>(null);
	const relinkTargetIdsRef = useRef<string[]>([]);
	const mediaOrganization = useMemo(
		() =>
			normalizeMediaOrganization({
				organization: activeProject.mediaOrganization,
			}),
		[activeProject.mediaOrganization],
	);
	const effectiveActiveBinId =
		activeBinId === "all" ||
		activeBinId === "unfiled" ||
		mediaOrganization.bins.some((bin) => bin.id === activeBinId)
			? activeBinId
			: "all";
	const mediaUsageCounts = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const track of [
			...activeTracks.overlay,
			activeTracks.main,
			...activeTracks.audio,
		]) {
			for (const element of track.elements) {
				if (!hasMediaId(element)) continue;
				counts[element.mediaId] = (counts[element.mediaId] ?? 0) + 1;
			}
		}
		return counts;
	}, [activeTracks]);
	const availableTags = useMemo(
		() =>
			[
				...new Set(
					Object.values(mediaOrganization.assetMetadata ?? {}).flatMap(
						(metadata) => metadata.tags,
					),
				),
			].sort((a, b) => a.localeCompare(b)),
		[mediaOrganization.assetMetadata],
	);

	const missingReferences = useMemo(
		() =>
			findMissingMediaReferences({
				tracks: activeTracks,
				assets: mediaFiles,
			}),
		[activeTracks, mediaFiles],
	);

	const processFiles = async ({ files }: { files: File[] }) => {
		if (!files || files.length === 0) return;
		if (!activeProject) {
			toast.error("No active project");
			return;
		}

		setIsProcessing(true);
		setProgress(0);
		try {
			await showMediaUploadToast({
				filesCount: files.length,
				promise: async () => {
					const processedAssets = await processMediaAssets({
						files,
						onProgress: (progress: { progress: number }) =>
							setProgress(progress.progress),
					});
					for (const asset of processedAssets) {
						await editor.media.addMediaAsset({
							projectId: activeProject.metadata.id,
							asset,
						});
					}
					return {
						uploadedCount: processedAssets.length,
						assetNames: processedAssets.map((asset) => asset.name),
					};
				},
			});
		} catch (error) {
			console.error("Error processing files:", error);
		} finally {
			setIsProcessing(false);
			setProgress(0);
		}
	};

	const { isDragOver, dragProps, openFilePicker, fileInputProps } =
		useFileUpload({
			accept: "image/*,video/*,audio/*",
			multiple: true,
			onFilesSelected: (files) => processFiles({ files }),
		});

	const openRelinkPicker = ({
		references,
	}: {
		references: MissingMediaReference[];
	}) => {
		const input = relinkInputRef.current;
		if (!input || references.length === 0) return;
		relinkTargetIdsRef.current = references.map(
			(reference) => reference.mediaId,
		);
		input.multiple = references.length > 1;
		input.click();
	};

	const handleRelinkFiles = async ({
		files,
	}: {
		files: File[];
	}): Promise<void> => {
		if (files.length === 0) return;
		const targetIds = new Set(relinkTargetIdsRef.current);
		const targetReferences = missingReferences.filter((reference) =>
			targetIds.has(reference.mediaId),
		);
		if (targetReferences.length === 0) {
			toast.error("The missing media selection is no longer available");
			return;
		}

		setIsProcessing(true);
		setProgress(0);
		try {
			if (targetReferences.length === 1) {
				const [reference] = targetReferences;
				const [file] = files;
				const fileType = getMediaTypeFromFile({ file });
				if (fileType !== reference.type) {
					toast.error(`Choose a ${reference.type} file`, {
						description: `${file.name} is ${
							fileType ? `a ${fileType}` : "not supported"
						}.`,
					});
					return;
				}

				const [processed] = await processMediaAssets({
					files: [file],
					onProgress: ({ progress }) => setProgress(progress),
				});
				if (!processed) return;

				editor.media.relinkMediaAsset({
					projectId: activeProject.metadata.id,
					assetId: reference.mediaId,
					asset: processed,
				});
				toast.success(`Relinked ${reference.name}`, {
					description: `Using ${file.name}. Timeline edits were preserved.`,
				});
				return;
			}

			const matching = matchFilesToMissingMedia({
				references: targetReferences,
				files,
			});
			const processedAssets = await processMediaAssets({
				files: matching.matches.map((match) => match.file),
				onProgress: ({ progress }) => setProgress(progress),
			});
			const processedByFile = new Map(
				processedAssets.map((asset) => [asset.file, asset]),
			);
			const items = matching.matches.flatMap((match) => {
				const processed = processedByFile.get(match.file);
				return processed
					? [{ assetId: match.reference.mediaId, asset: processed }]
					: [];
			});

			editor.media.relinkMediaAssets({
				projectId: activeProject.metadata.id,
				items,
			});

			if (items.length > 0) {
				toast.success(
					`Relinked ${items.length} missing ${
						items.length === 1 ? "file" : "files"
					}`,
					{ description: "Timeline edits were preserved." },
				);
			}
			if (
				matching.unmatchedReferences.length > 0 ||
				matching.unmatchedFiles.length > 0
			) {
				toast.warning("Some files could not be matched", {
					description: `${matching.unmatchedReferences.length} missing references and ${matching.unmatchedFiles.length} selected files remain unmatched.`,
				});
			}
		} catch (error) {
			console.error("Error relinking media:", error);
			toast.error("Could not relink media", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setIsProcessing(false);
			setProgress(0);
			relinkTargetIdsRef.current = [];
		}
	};

	const handleRemove = ({
		event,
		ids,
	}: {
		event: React.MouseEvent;
		ids: string[];
	}) => {
		event.stopPropagation();

		invokeAction("remove-media-assets", {
			projectId: activeProject.metadata.id,
			assetIds: ids,
		});
	};

	const handleSort = ({ key }: { key: MediaSortKey }) => {
		if (mediaSortBy === key) {
			setMediaSort({
				key,
				order: mediaSortOrder === "asc" ? "desc" : "asc",
			});
		} else {
			setMediaSort({ key, order: "asc" });
		}
	};

	const updateMediaOrganization = ({
		organization,
	}: {
		organization: typeof mediaOrganization;
	}) => {
		editor.project.updateMediaOrganization({ organization });
	};

	const handleCreateBin = ({
		name,
		parentId,
	}: {
		name: string;
		parentId: string | null;
	}) => {
		try {
			const id = generateUUID();
			updateMediaOrganization({
				organization: createMediaBin({
					organization: mediaOrganization,
					bin: { id, name, parentId },
				}),
			});
			setActiveBinId(id);
		} catch (error) {
			toast.error("Could not create bin", {
				description: error instanceof Error ? error.message : undefined,
			});
		}
	};

	const handleRenameBin = ({
		binId,
		name,
	}: {
		binId: string;
		name: string;
	}) => {
		try {
			updateMediaOrganization({
				organization: renameMediaBin({
					organization: mediaOrganization,
					binId,
					name,
				}),
			});
		} catch (error) {
			toast.error("Could not rename bin", {
				description: error instanceof Error ? error.message : undefined,
			});
		}
	};

	const handleMoveBin = ({
		binId,
		parentId,
		index,
	}: {
		binId: string;
		parentId: string | null;
		index: number;
	}) => {
		try {
			updateMediaOrganization({
				organization: moveMediaBin({
					organization: mediaOrganization,
					binId,
					parentId,
					index,
				}),
			});
		} catch (error) {
			toast.error("Could not move bin", {
				description: error instanceof Error ? error.message : undefined,
			});
		}
	};

	const handleDeleteBin = ({ binId }: { binId: string }) => {
		try {
			const parentId =
				mediaOrganization.bins.find((candidate) => candidate.id === binId)
					?.parentId ?? null;
			const result = deleteMediaBin({
				organization: mediaOrganization,
				binId,
			});
			updateMediaOrganization({ organization: result.organization });
			if (
				result.deletedBinIds.includes(effectiveActiveBinId)
			) {
				setActiveBinId(
					parentId !== null &&
						result.organization.bins.some((bin) => bin.id === parentId)
						? parentId
						: "unfiled",
				);
			}
			toast.success(
				`Deleted ${result.deletedBinIds.length} ${
					result.deletedBinIds.length === 1 ? "bin" : "bins"
				}`,
				{
					description: `${result.rehomedAssetIds.length} assets kept and rehomed. Undo is available.`,
				},
			);
		} catch (error) {
			toast.error("Could not delete bin", {
				description: error instanceof Error ? error.message : undefined,
			});
		}
	};

	const handleAssignAssetsToBin = ({
		assetIds,
		binId,
	}: {
		assetIds: string[];
		binId: string | null;
	}) => {
		try {
			updateMediaOrganization({
				organization: assignAssetsToMediaBin({
					organization: mediaOrganization,
					assetIds,
					binId,
				}),
			});
			toast.success(
				`Moved ${assetIds.length} ${assetIds.length === 1 ? "asset" : "assets"}`,
				{ description: "Only organization changed. Source media was kept." },
			);
		} catch (error) {
			toast.error("Could not organize media", {
				description: error instanceof Error ? error.message : undefined,
			});
		}
	};

	const handleApplyAssetMetadata = ({
		addTags,
		removeTags,
		favorite,
		colorLabel,
	}: {
		addTags: string[];
		removeTags: string[];
		favorite?: boolean;
		colorLabel?: MediaColorLabel | null;
	}) => {
		if (metadataEditorAssetIds.length === 0) return;
		updateMediaOrganization({
			organization: updateMediaAssetMetadata({
				organization: mediaOrganization,
				assetIds: metadataEditorAssetIds,
				patch: { addTags, removeTags, favorite, colorLabel },
			}),
		});
		toast.success(
			`Updated ${metadataEditorAssetIds.length} ${
				metadataEditorAssetIds.length === 1 ? "asset" : "assets"
			}`,
			{ description: "Tags, favorite, and color labels are undoable." },
		);
	};

	const filteredMediaItems = useMemo(() => {
		const filtered = filterMediaLibraryAssets({
			assets: mediaFiles,
			query: searchQuery,
			type: mediaTypeFilter,
			filters: libraryFilters,
			usageCounts: mediaUsageCounts,
			metadata: mediaOrganization.assetMetadata,
		}).filter((asset) =>
			mediaAssetMatchesBin({
				organization: mediaOrganization,
				assetId: asset.id,
				binId: effectiveActiveBinId,
			}),
		);

		filtered.sort((a, b) => {
			let valueA: string | number;
			let valueB: string | number;

			switch (mediaSortBy) {
				case "name":
					valueA = a.name.toLowerCase();
					valueB = b.name.toLowerCase();
					break;
				case "type":
					valueA = a.type;
					valueB = b.type;
					break;
				case "duration":
					valueA = a.duration || 0;
					valueB = b.duration || 0;
					break;
				case "size":
					valueA = a.file.size;
					valueB = b.file.size;
					break;
				case "favorite":
					valueA = getMediaAssetMetadata({
						organization: mediaOrganization,
						assetId: a.id,
					}).favorite
						? 1
						: 0;
					valueB = getMediaAssetMetadata({
						organization: mediaOrganization,
						assetId: b.id,
					}).favorite
						? 1
						: 0;
					break;
				case "colorLabel":
					valueA =
						getMediaAssetMetadata({
							organization: mediaOrganization,
							assetId: a.id,
						}).colorLabel ?? "";
					valueB =
						getMediaAssetMetadata({
							organization: mediaOrganization,
							assetId: b.id,
						}).colorLabel ?? "";
					break;
				default:
					return 0;
			}

			if (valueA < valueB) return mediaSortOrder === "asc" ? -1 : 1;
			if (valueA > valueB) return mediaSortOrder === "asc" ? 1 : -1;
			return 0;
		});

		return filtered;
	}, [
		effectiveActiveBinId,
		libraryFilters,
		mediaFiles,
		mediaOrganization,
		mediaUsageCounts,
		mediaSortBy,
		mediaSortOrder,
		mediaTypeFilter,
		searchQuery,
	]);
	const filteredMissingReferences = useMemo(() => {
		if (
			effectiveActiveBinId !== "all" &&
			effectiveActiveBinId !== "unfiled"
		) {
			return [];
		}
		if (libraryFilters.availability === "available") return [];
		if (
			libraryFilters.duration !== "all" ||
			libraryFilters.resolution !== "all" ||
			libraryFilters.tag !== null ||
			libraryFilters.favorite !== "all" ||
			libraryFilters.usage === "unused"
		) {
			return [];
		}
		const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
		return missingReferences.filter(
			(reference) =>
				(mediaTypeFilter === "all" || mediaTypeFilter === reference.type) &&
				(!normalizedQuery ||
					reference.name.toLocaleLowerCase().includes(normalizedQuery)),
		);
	}, [
		effectiveActiveBinId,
		libraryFilters,
		mediaTypeFilter,
		missingReferences,
		searchQuery,
	]);
	const mediaLibraryItemCount = useMemo(
		() =>
			filterMediaLibraryAssets({
				assets: mediaFiles,
				query: "",
				type: "all",
			}).length + missingReferences.length,
		[mediaFiles, missingReferences.length],
	);
	const activeBinItemCount = useMemo(
		() =>
			mediaFiles.filter((asset) =>
				mediaAssetMatchesBin({
					organization: mediaOrganization,
					assetId: asset.id,
					binId: effectiveActiveBinId,
				}),
			).length +
			(effectiveActiveBinId === "all" ||
			effectiveActiveBinId === "unfiled"
				? missingReferences.length
				: 0),
		[
			effectiveActiveBinId,
			mediaFiles,
			mediaOrganization,
			missingReferences.length,
		],
	);
	const orderedMediaIds = useMemo(() => {
		return filteredMediaItems.map((item) => item.id);
	}, [filteredMediaItems]);
	const hasActiveLibraryFilters =
		Boolean(searchQuery.trim()) ||
		countActiveMediaLibraryFilters({
			type: mediaTypeFilter,
			filters: libraryFilters,
		}) > 0;

	return (
		<>
			<MediaMetadataEditorDialog
				open={metadataEditorAssetIds.length > 0}
				assetCount={metadataEditorAssetIds.length}
				onOpenChange={(open) => {
					if (!open) setMetadataEditorAssetIds([]);
				}}
				onApply={handleApplyAssetMetadata}
			/>
			<input {...fileInputProps} />
			<input
				ref={relinkInputRef}
				type="file"
				accept="image/*,video/*,audio/*"
				className="hidden"
				aria-label="Choose files to relink missing media"
				onChange={(event) => {
					const files = Array.from(event.currentTarget.files ?? []);
					event.currentTarget.value = "";
					void handleRelinkFiles({ files });
				}}
			/>

			<PanelView
				title="Assets"
				actions={
					<MediaActions
						mediaViewMode={mediaViewMode}
						setMediaViewMode={setMediaViewMode}
						isProcessing={isProcessing}
						sortBy={mediaSortBy}
						sortOrder={mediaSortOrder}
						onSort={handleSort}
						onImport={openFilePicker}
					/>
				}
				className={cn(isDragOver && "bg-accent/30")}
				contentClassName="h-full"
				{...dragProps}
			>
				{isDragOver ? (
					<MediaDragOverlay
						isVisible={true}
						isProcessing={isProcessing}
						progress={progress}
						onClick={openFilePicker}
					/>
				) : (
					<div className="flex min-h-full flex-col">
						<MediaBinBrowserView
							bins={mediaOrganization.bins}
							assetBinIds={mediaOrganization.assetBinIds}
							assetIds={mediaFiles.map((asset) => asset.id)}
							activeBinId={effectiveActiveBinId}
							onSelect={setActiveBinId}
							onCreate={handleCreateBin}
							onRename={handleRenameBin}
							onMove={handleMoveBin}
							onDelete={handleDeleteBin}
						/>
						<MediaLibraryControlsView
							query={searchQuery}
							type={mediaTypeFilter}
							filters={libraryFilters}
							availableTags={availableTags}
							resultCount={
								filteredMediaItems.length +
								filteredMissingReferences.length
							}
							totalCount={activeBinItemCount}
							onQueryChange={setSearchQuery}
							onTypeChange={setMediaTypeFilter}
							onFiltersChange={setLibraryFilters}
							onClearAll={() => {
								setSearchQuery("");
								setMediaTypeFilter("all");
								setLibraryFilters(DEFAULT_MEDIA_LIBRARY_FILTERS);
							}}
						/>
						{filteredMissingReferences.length > 0 ? (
							<MissingMediaSection
								references={filteredMissingReferences}
								isProcessing={isProcessing}
								onRelink={(reference) =>
									openRelinkPicker({ references: [reference] })
								}
								onRelinkAll={() =>
									openRelinkPicker({ references: missingReferences })
								}
							/>
						) : null}
						{mediaLibraryItemCount === 0 &&
						!searchQuery &&
						mediaTypeFilter === "all" ? (
							<div className="flex flex-1 items-center p-2">
								<MediaDragOverlay
									isVisible={true}
									isProcessing={isProcessing}
									progress={progress}
									onClick={openFilePicker}
								/>
							</div>
						) : filteredMediaItems.length === 0 &&
						filteredMissingReferences.length === 0 ? (
							<MediaLibraryEmptySearch
								query={searchQuery}
								type={mediaTypeFilter}
								hasActiveFilters={hasActiveLibraryFilters}
								binName={
									mediaOrganization.bins.find(
										(bin) => bin.id === effectiveActiveBinId,
									)?.name ??
									(effectiveActiveBinId === "unfiled"
										? "Unfiled"
										: null)
								}
								onClear={() => {
									setSearchQuery("");
									setMediaTypeFilter("all");
									setLibraryFilters(DEFAULT_MEDIA_LIBRARY_FILTERS);
									setActiveBinId("all");
								}}
							/>
						) : filteredMediaItems.length > 0 ? (
							<SelectableSurface
								ariaLabel="Assets"
								orderedIds={orderedMediaIds}
								revealId={highlightMediaId}
								onRevealComplete={clearHighlight}
							>
								<MediaScopeRegistrar />
								<MediaItemList
									items={filteredMediaItems}
									mode={mediaViewMode}
									bins={mediaOrganization.bins}
									organization={mediaOrganization}
									onEditMetadata={({ assetIds }) =>
										setMetadataEditorAssetIds(assetIds)
									}
									onAssignToBin={handleAssignAssetsToBin}
									onRemove={handleRemove}
								/>
							</SelectableSurface>
						) : null}
					</div>
				)}
			</PanelView>
		</>
	);
}

function MediaLibraryEmptySearch({
	query,
	type,
	hasActiveFilters,
	binName,
	onClear,
}: {
	query: string;
	type: MediaTypeFilter;
	hasActiveFilters: boolean;
	binName: string | null;
	onClear: () => void;
}) {
	return (
		<div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 px-4 pb-12 text-center">
			<div className="bg-muted flex size-9 items-center justify-center rounded-full">
				<HugeiconsIcon icon={Search01Icon} className="size-4" />
			</div>
			<div>
				<p className="text-foreground text-sm font-medium">
					{hasActiveFilters
						? "No matching assets"
						: `${binName ?? "This bin"} is empty`}
				</p>
				<p className="mt-0.5 text-xs">
					{hasActiveFilters
						? `Try another filename${type !== "all" ? " or media type" : ""}.`
						: "Move media here from an asset context menu."}
				</p>
			</div>
			<Button size="sm" variant="outline" onClick={onClear}>
				{hasActiveFilters ? "Clear filters" : "View all assets"}
			</Button>
			<span className="sr-only">
				No assets match {query || "the selected media type"}
			</span>
		</div>
	);
}

function MissingMediaSection({
	references,
	isProcessing,
	onRelink,
	onRelinkAll,
}: {
	references: MissingMediaReference[];
	isProcessing: boolean;
	onRelink: (reference: MissingMediaReference) => void;
	onRelinkAll: () => void;
}) {
	return (
		<section
			className="border-b border-red-500/20 px-2 pb-3"
			aria-label={`${references.length} missing media ${
				references.length === 1 ? "file" : "files"
			}`}
		>
			<div className="mb-2 flex items-center justify-between gap-2">
				<div className="min-w-0">
					<p className="text-xs font-bold text-red-400">
						{references.length} missing{" "}
						{references.length === 1 ? "file" : "files"}
					</p>
					<p className="text-muted-foreground truncate text-[11px]">
						Relink to restore preview and export
					</p>
				</div>
				{references.length > 1 ? (
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="h-6 text-xs"
						disabled={isProcessing}
						onClick={onRelinkAll}
					>
						Relink all
					</Button>
				) : null}
			</div>
			<div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
				{references.map((reference) => (
					<MissingMediaPlaceholder
						key={reference.mediaId}
						surface="library"
						mediaId={reference.mediaId}
						name={reference.name}
						type={reference.type}
						usageCount={reference.usages.length}
						onRelink={isProcessing ? undefined : () => onRelink(reference)}
					/>
				))}
			</div>
		</section>
	);
}

function MediaScopeRegistrar() {
	useSelectionScope();
	return null;
}

function MediaAssetDraggable({
	item,
	preview,
	variant,
	isRounded,
}: {
	item: MediaAsset;
	preview: React.ReactNode;
	variant: "card" | "compact";
	isRounded?: boolean;
}) {
	const editor = useEditor();

	const addElementAtTime = ({
		asset,
		startTime,
	}: {
		asset: MediaAsset;
		startTime: MediaTime;
	}) => {
		const duration =
			asset.duration != null
				? mediaTimeFromSeconds({ seconds: asset.duration })
				: DEFAULT_NEW_ELEMENT_DURATION;
		const element = buildElementFromMedia({
			mediaId: asset.id,
			mediaType: asset.type,
			name: asset.name,
			duration,
			startTime,
		});
		editor.timeline.insertElement({
			element,
			placement: { mode: "auto" },
		});
	};

	return (
		<DraggableItem
			name={item.name}
			preview={preview}
			dragData={{
				id: item.id,
				type: "media",
				mediaType: item.type,
				name: item.name,
				...(item.type !== "audio" && {
					targetElementTypes: [...MASKABLE_ELEMENT_TYPES],
				}),
			}}
			shouldShowPlusOnDrag={false}
			onAddToTimeline={({ currentTime }) =>
				addElementAtTime({ asset: item, startTime: currentTime })
			}
			variant={variant}
			isRounded={isRounded}
		/>
	);
}

function MediaItemWithContextMenu({
	item,
	bins,
	organization,
	children,
	onEditMetadata,
	onAssignToBin,
	onRemove,
}: {
	item: MediaAsset;
	bins: ReturnType<typeof getMediaBinTree>[number]["bin"][];
	organization: ReturnType<typeof normalizeMediaOrganization>;
	children: React.ReactNode;
	onEditMetadata: (args: { assetIds: string[] }) => void;
	onAssignToBin: (args: {
		assetIds: string[];
		binId: string | null;
	}) => void;
	onRemove: ({
		event,
		ids,
	}: {
		event: React.MouseEvent;
		ids: string[];
	}) => void;
}) {
	const { isSelected, selectedIds } = useSelection();
	const idsToDelete = isSelected(item.id) ? selectedIds : [item.id];
	const deleteLabel =
		idsToDelete.length > 1 ? `Delete ${idsToDelete.length} items` : "Delete";
	const binTree = getMediaBinTree({ organization });
	const allAssignmentsMatch = ({ binId }: { binId: string | null }) =>
		idsToDelete.every((assetId) =>
			binId === null
				? organization.assetBinIds[assetId] === undefined
				: organization.assetBinIds[assetId] === binId,
		);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem>Export clips</ContextMenuItem>
				<ContextMenuItem
					onSelect={() => onEditMetadata({ assetIds: idsToDelete })}
				>
					Edit tags, favorite &amp; color…
				</ContextMenuItem>
				<ContextMenuSub>
					<ContextMenuSubTrigger>Move to bin</ContextMenuSubTrigger>
					<ContextMenuSubContent>
						<ContextMenuLabel>Keep source media</ContextMenuLabel>
						<ContextMenuItem
							disabled={allAssignmentsMatch({ binId: null })}
							onSelect={() =>
								onAssignToBin({ assetIds: idsToDelete, binId: null })
							}
						>
							Unfiled
						</ContextMenuItem>
						{bins.length > 0 ? <ContextMenuSeparator /> : null}
						{binTree.map(({ bin, depth }) => (
							<ContextMenuItem
								key={bin.id}
								disabled={allAssignmentsMatch({ binId: bin.id })}
								onSelect={() =>
									onAssignToBin({
										assetIds: idsToDelete,
										binId: bin.id,
									})
								}
							>
								{"· ".repeat(depth)}
								{bin.name}
							</ContextMenuItem>
						))}
					</ContextMenuSubContent>
				</ContextMenuSub>
				<ContextMenuSeparator />
				<ContextMenuItem
					variant="destructive"
					onClick={(event: React.MouseEvent<HTMLDivElement>) =>
						onRemove({ event, ids: idsToDelete })
					}
				>
					{deleteLabel}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

function MediaItemList({
	items,
	mode,
	bins,
	organization,
	onEditMetadata,
	onAssignToBin,
	onRemove,
}: {
	items: MediaAsset[];
	mode: MediaViewMode;
	bins: ReturnType<typeof getMediaBinTree>[number]["bin"][];
	organization: ReturnType<typeof normalizeMediaOrganization>;
	onEditMetadata: (args: { assetIds: string[] }) => void;
	onAssignToBin: (args: {
		assetIds: string[];
		binId: string | null;
	}) => void;
	onRemove: ({
		event,
		ids,
	}: {
		event: React.MouseEvent;
		ids: string[];
	}) => void;
}) {
	const isGrid = mode === "grid";

	return (
		<div
			className={cn(isGrid ? "grid gap-4" : "flex flex-col gap-1.5")}
			style={
				isGrid ? { gridTemplateColumns: "repeat(auto-fill, 7rem)" } : undefined
			}
		>
			{items.map((item) => (
				<MediaItemWithContextMenu
					item={item}
					bins={bins}
					organization={organization}
					onEditMetadata={onEditMetadata}
					onAssignToBin={onAssignToBin}
					onRemove={onRemove}
					key={item.id}
				>
					<SelectableItem className={cn(!isGrid && "w-full")} id={item.id}>
						<MediaAssetDraggable
							item={item}
							preview={
								<MediaPreview
									item={item}
									variant={isGrid ? "grid" : "compact"}
									metadata={getMediaAssetMetadata({
										organization,
										assetId: item.id,
									})}
								/>
							}
							variant={isGrid ? "card" : "compact"}
							isRounded={isGrid ? false : undefined}
						/>
					</SelectableItem>
				</MediaItemWithContextMenu>
			))}
		</div>
	);
}

function formatDuration({ duration }: { duration: number }) {
	const min = Math.floor(duration / 60);
	const sec = Math.floor(duration % 60);
	return `${min}:${sec.toString().padStart(2, "0")}`;
}

function MediaDurationBadge({ duration }: { duration?: number }) {
	if (!duration) return null;

	return (
		<div className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-xs text-white">
			{formatDuration({ duration })}
		</div>
	);
}

function MediaDurationLabel({ duration }: { duration?: number }) {
	if (!duration) return null;

	return (
		<span className="text-xs opacity-70">{formatDuration({ duration })}</span>
	);
}

function MediaTypePlaceholder({
	icon,
	label,
	duration,
	variant,
}: {
	icon: IconSvgElement;
	label: string;
	duration?: number;
	variant: "muted" | "bordered";
}) {
	const iconClassName = cn("size-6", variant === "bordered" && "mb-1");

	return (
		<div
			className={cn(
				"text-muted-foreground flex size-full flex-col items-center justify-center rounded",
				variant === "muted" ? "bg-muted/30" : "border",
			)}
		>
			<HugeiconsIcon icon={icon} className={iconClassName} />
			<span className="text-xs">{label}</span>
			<MediaDurationLabel duration={duration} />
		</div>
	);
}

function MediaPreview({
	item,
	variant = "grid",
	metadata,
}: {
	item: MediaAsset;
	variant?: "grid" | "compact";
	metadata: MediaAssetMetadata;
}) {
	const shouldShowDurationBadge = variant === "grid";

	if (item.type === "image") {
		return (
			<div className="relative flex size-full items-center justify-center bg-muted">
				<Image
					src={item.url ?? ""}
					alt={item.name}
					fill
					sizes="100vw"
					className="object-cover"
					loading="lazy"
					unoptimized
				/>
				<MediaMetadataBadges metadata={metadata} />
			</div>
		);
	}

	if (item.type === "video") {
		if (item.thumbnailUrl) {
			return (
				<div className="relative size-full">
					<Image
						src={item.thumbnailUrl}
						alt={item.name}
						fill
						sizes="100vw"
						className="rounded object-cover"
						loading="lazy"
						unoptimized
					/>
					{shouldShowDurationBadge ? (
						<MediaDurationBadge duration={item.duration} />
					) : null}
					<MediaMetadataBadges metadata={metadata} />
				</div>
			);
		}

		return (
			<div className="relative size-full">
				<MediaTypePlaceholder
					icon={Video01Icon}
					label="Video"
					duration={item.duration}
					variant="muted"
				/>
				<MediaMetadataBadges metadata={metadata} />
			</div>
		);
	}

	if (item.type === "audio") {
		return (
			<div className="relative size-full">
				<MediaTypePlaceholder
					icon={MusicNote03Icon}
					label="Audio"
					duration={item.duration}
					variant="bordered"
				/>
				<MediaMetadataBadges metadata={metadata} />
			</div>
		);
	}

	return (
		<div className="relative size-full">
			<MediaTypePlaceholder icon={Image02Icon} label="Unknown" variant="muted" />
			<MediaMetadataBadges metadata={metadata} />
		</div>
	);
}

const MEDIA_LABEL_CLASSES: Record<MediaColorLabel, string> = {
	red: "bg-red-500",
	orange: "bg-orange-500",
	yellow: "bg-yellow-400",
	green: "bg-emerald-500",
	blue: "bg-blue-500",
	purple: "bg-violet-500",
};

function MediaMetadataBadges({
	metadata,
}: {
	metadata: MediaAssetMetadata;
}) {
	if (!metadata.favorite && metadata.colorLabel === null) return null;
	return (
		<div className="absolute left-1 top-1 flex items-center gap-1">
			{metadata.favorite ? (
				<span
					className="flex size-4 items-center justify-center rounded bg-black/70 text-[10px] text-amber-300"
					aria-label="Favorite asset"
					title="Favorite"
				>
					★
				</span>
			) : null}
			{metadata.colorLabel ? (
				<span
					className={cn(
						"size-3 rounded-full border border-white/70",
						MEDIA_LABEL_CLASSES[metadata.colorLabel],
					)}
					aria-label={`${metadata.colorLabel} color label`}
					title={`${metadata.colorLabel} color label`}
				/>
			) : null}
		</div>
	);
}

function MediaActions({
	mediaViewMode,
	setMediaViewMode,
	isProcessing,
	sortBy,
	sortOrder,
	onSort,
	onImport,
}: {
	mediaViewMode: MediaViewMode;
	setMediaViewMode: (mode: MediaViewMode) => void;
	isProcessing: boolean;
	sortBy: MediaSortKey;
	sortOrder: MediaSortOrder;
	onSort: ({ key }: { key: MediaSortKey }) => void;
	onImport: () => void;
}) {
	return (
		<div className="flex gap-1.5">
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label={
								mediaViewMode === "grid"
									? "Switch assets to list view"
									: "Switch assets to grid view"
							}
							size="icon"
							variant="ghost"
							onClick={() =>
								setMediaViewMode(mediaViewMode === "grid" ? "list" : "grid")
							}
							disabled={isProcessing}
							className="items-center justify-center"
						>
							{mediaViewMode === "grid" ? (
								<HugeiconsIcon icon={LeftToRightListDashIcon} />
							) : (
								<HugeiconsIcon icon={GridViewIcon} />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<p>
							{mediaViewMode === "grid"
								? "Switch to list view"
								: "Switch to grid view"}
						</p>
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<DropdownMenu>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<Button
									aria-label={`Sort assets by ${sortBy}, ${
										sortOrder === "asc" ? "ascending" : "descending"
									}`}
									size="icon"
									variant="ghost"
									disabled={isProcessing}
									className="items-center justify-center"
								>
									<HugeiconsIcon icon={SortingOneNineIcon} />
								</Button>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<DropdownMenuContent align="end">
							<SortMenuItem
								label="Name"
								sortKey="name"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label="Type"
								sortKey="type"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label="Duration"
								sortKey="duration"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label="File size"
								sortKey="size"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label="Favorite"
								sortKey="favorite"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label="Color label"
								sortKey="colorLabel"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
						</DropdownMenuContent>
					</DropdownMenu>
					<TooltipContent>
						<p>
							Sort by {sortBy} (
							{sortOrder === "asc" ? "ascending" : "descending"})
						</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
			<Button
				variant="outline"
				onClick={onImport}
				disabled={isProcessing}
				size="sm"
				className="items-center justify-center gap-1.5"
			>
				<HugeiconsIcon icon={CloudUploadIcon} />
				Import
			</Button>
		</div>
	);
}

function SortMenuItem({
	label,
	sortKey,
	currentSortBy,
	currentSortOrder,
	onSort,
}: {
	label: string;
	sortKey: MediaSortKey;
	currentSortBy: MediaSortKey;
	currentSortOrder: MediaSortOrder;
	onSort: ({ key }: { key: MediaSortKey }) => void;
}) {
	const isActive = currentSortBy === sortKey;
	const arrow = isActive ? (currentSortOrder === "asc" ? "↑" : "↓") : "";

	return (
		<DropdownMenuItem onClick={() => onSort({ key: sortKey })}>
			{label} {arrow}
		</DropdownMenuItem>
	);
}
