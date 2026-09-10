"use client";

import Image from "next/image";
import { EditorFootageLibrary } from "@/footage/editor-library";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { MediaBatchOperationsDialog } from "./media-batch-operations-dialog";
import { MediaDuplicateReviewDialog } from "./media-duplicate-review-dialog";
import { generateMediaProxy } from "@/media/proxy";
import { downloadBlob } from "@/utils/browser";
import { backgroundJobs } from "@/project/background-jobs";
import {
	cancelNativeMediaJob,
	ensureNativeProxy,
	waitForNativeMediaJob,
} from "@/agent/media-codec";

const MEDIA_SORT_LABELS: Record<MediaSortKey, string> = {
	name: "名称",
	type: "类型",
	duration: "时长",
	size: "文件大小",
	favorite: "收藏",
	colorLabel: "颜色标签",
};

const MEDIA_TYPE_LABELS: Record<MediaAsset["type"], string> = {
	video: "视频",
	image: "图片",
	audio: "音频",
};

const MEDIA_COLOR_LABEL_NAMES: Record<MediaColorLabel, string> = {
	red: "红色",
	orange: "橙色",
	yellow: "黄色",
	green: "绿色",
	blue: "蓝色",
	purple: "紫色",
};

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
		openSourcePreview,
	} = useAssetsPanelStore();

	const [isProcessing, setIsProcessing] = useState(false);
	const [progress, setProgress] = useState(0);
	const [searchQuery, setSearchQuery] = useState("");
	const [mediaTypeFilter, setMediaTypeFilter] =
		useState<MediaTypeFilter>("all");
	const [libraryFilters, setLibraryFilters] = useState<MediaLibraryFilters>(
		DEFAULT_MEDIA_LIBRARY_FILTERS,
	);
	const [activeBinId, setActiveBinId] = useState<MediaBinSelection>("all");
	const [metadataEditorAssetIds, setMetadataEditorAssetIds] = useState<
		string[]
	>([]);
	const [batchOperationAssetIds, setBatchOperationAssetIds] = useState<
		string[]
	>([]);
	const [batchStatus, setBatchStatus] = useState<string | null>(null);
	const [batchProgress, setBatchProgress] = useState(0);
	const [duplicateReviewOpen, setDuplicateReviewOpen] = useState(false);
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
		(activeBinId === "unfiled" && mediaOrganization.bins.length > 0) ||
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
	const batchOperationAssets = mediaFiles.filter((asset) =>
		batchOperationAssetIds.includes(asset.id),
	);

	const processFiles = async ({ files }: { files: File[] }) => {
		if (!files || files.length === 0) return;
		if (!activeProject) {
			toast.error("当前没有打开的工程");
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
			toast.error("所选丢失素材已不可用");
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
					toast.error(`请选择${MEDIA_TYPE_LABELS[reference.type]}文件`, {
						description: `${file.name} 是${
							fileType ? `${MEDIA_TYPE_LABELS[fileType]}文件` : "不支持的文件"
						}。`,
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
				toast.success(`已重新链接 ${reference.name}`, {
					description: `正在使用 ${file.name}，时间线编辑保持不变。`,
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
				toast.success(`已重新链接 ${items.length} 个丢失文件`, {
					description: "时间线编辑保持不变。",
				});
			}
			if (
				matching.unmatchedReferences.length > 0 ||
				matching.unmatchedFiles.length > 0
			) {
				toast.warning("部分文件无法匹配", {
					description: `仍有 ${matching.unmatchedReferences.length} 个丢失引用和 ${matching.unmatchedFiles.length} 个所选文件未匹配。`,
				});
			}
		} catch (error) {
			console.error("Error relinking media:", error);
			toast.error("无法重新链接素材", {
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

	const removeBatchAssets = () => {
		if (batchOperationAssetIds.length === 0) return;
		invokeAction("remove-media-assets", {
			projectId: activeProject.metadata.id,
			assetIds: batchOperationAssetIds,
		});
		setBatchOperationAssetIds([]);
		toast.success(`已移除 ${batchOperationAssetIds.length} 个素材`, {
			description: "撤销可恢复源素材及其时间线用法。",
		});
	};

	const handleBatchRename = ({
		prefix,
		startIndex,
	}: {
		prefix: string;
		startIndex: number;
	}) => {
		editor.media.renameMediaAssets({
			projectId: activeProject.metadata.id,
			assets: batchOperationAssets,
			prefix,
			startIndex,
		});
		toast.success(`已重命名 ${batchOperationAssets.length} 个素材`, {
			description: "文件扩展名和时间线标识保持不变。",
		});
	};

	const handleBatchReplace = async ({
		files,
		matchByName,
	}: {
		files: File[];
		matchByName: boolean;
	}) => {
		const normalizedBaseName = (name: string) =>
			name
				.slice(0, Math.max(0, name.lastIndexOf(".")) || name.length)
				.trim()
				.toLocaleLowerCase();
		const pairs = matchByName
			? batchOperationAssets.flatMap((asset) => {
					const file = files.find(
						(candidate) =>
							normalizedBaseName(candidate.name) ===
							normalizedBaseName(asset.name),
					);
					return file ? [{ asset, file }] : [];
				})
			: batchOperationAssets
					.slice(0, files.length)
					.map((asset, index) => ({ asset, file: files[index] }));
		const validPairs = pairs.filter(
			({ asset, file }) => getMediaTypeFromFile({ file }) === asset.type,
		);
		if (validPairs.length === 0) {
			toast.error("没有兼容的替换文件", {
				description: matchByName
					? "文件名和媒体类型必须匹配。"
					: "请按相同顺序选择同类型文件。",
			});
			return;
		}

		setIsProcessing(true);
		setBatchStatus(matchByName ? "正在按文件名重新链接…" : "正在替换源文件…");
		setBatchProgress(0);
		try {
			const processed = await processMediaAssets({
				files: validPairs.map(({ file }) => file),
				onProgress: ({ progress }) => {
					setProgress(progress);
					setBatchProgress(progress);
				},
			});
			editor.media.relinkMediaAssets({
				projectId: activeProject.metadata.id,
				items: processed.map((asset, index) => ({
					assetId: validPairs[index].asset.id,
					asset,
				})),
			});
			setBatchProgress(100);
			setBatchStatus(`已替换 ${processed.length} 个素材`);
			toast.success(`已替换 ${processed.length} 个源文件`, {
				description: "时间线编辑和素材标识保持不变。",
			});
		} catch (error) {
			console.error("Batch media replacement failed:", error);
			toast.error("无法替换所选素材", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setIsProcessing(false);
			setProgress(0);
		}
	};

	const handleExportOriginals = () => {
		for (const asset of batchOperationAssets) {
			downloadBlob({ blob: asset.file, filename: asset.file.name });
		}
		toast.success(`已导出 ${batchOperationAssets.length} 个原始文件`);
	};

	const handleGenerateProxies = async () => {
		const candidates = batchOperationAssets.filter(
			(asset) => asset.type !== "audio",
		);
		if (candidates.length === 0) return;
		setIsProcessing(true);
		setBatchProgress(0);
		setBatchStatus(`正在生成代理 1 / ${candidates.length}…`);
		try {
			const handle = backgroundJobs.start({
				kind: "proxy",
				label: `生成 ${candidates.length} 个代理`,
				run: async ({ signal, update }) => {
					const updates: Array<{
						assetId: string;
						update: (asset: MediaAsset) => MediaAsset;
					}> = [];
					let readyCount = 0;
					const failures: string[] = [];
					for (let index = 0; index < candidates.length; index++) {
						if (signal.aborted) return;
						const asset = candidates[index];
						const step = `正在生成代理 ${index + 1} / ${candidates.length}：${asset.name}`;
						setBatchStatus(step);
						update({ step, progress: index / candidates.length });
						try {
							if (asset.type === "video") {
								let nativeJob = await ensureNativeProxy({
									projectId: activeProject.metadata.id,
									assetId: asset.id,
									profile: "standard",
								});
								try {
									nativeJob = await waitForNativeMediaJob({
										projectId: activeProject.metadata.id,
										jobId: nativeJob.id,
										signal,
										onUpdate: (job) => {
											const progress =
												(index + job.progress) / candidates.length;
											setBatchProgress(progress * 100);
											update({
												progress,
												step: `${step} · ${Math.round(job.progress * 100)}%`,
											});
										},
									});
								} catch (error) {
									if (signal.aborted) {
										await cancelNativeMediaJob({
											projectId: activeProject.metadata.id,
											jobId: nativeJob.id,
										}).catch(() => undefined);
										return;
									}
									throw error;
								}
								if (nativeJob.status !== "succeeded") {
									throw new Error(
										nativeJob.error?.message ??
											`原生代理任务状态：${nativeJob.status}`,
									);
								}
								await editor.media.loadProjectMedia({
									projectId: activeProject.metadata.id,
								});
								readyCount += 1;
								continue;
							}
							const proxy = await generateMediaProxy({
								asset,
								onProgress: (itemProgress) => {
									const progress = (index + itemProgress) / candidates.length;
									setBatchProgress(progress * 100);
									update({ progress });
								},
							});
							updates.push({
								assetId: asset.id,
								update: (current) => ({
									...current,
									proxy: proxy.metadata,
									proxyFile: proxy.file,
									proxyUrl: proxy.url,
								}),
							});
							readyCount += 1;
						} catch (error) {
							console.error(
								`Proxy generation failed for ${asset.name}:`,
								error,
							);
							failures.push(asset.name);
						}
					}
					if (signal.aborted) return;
					editor.media.updateMediaAssets({
						projectId: activeProject.metadata.id,
						updates,
					});
					setBatchProgress(100);
					setBatchStatus(
						`${readyCount} 个代理已就绪${failures.length > 0 ? ` · ${failures.length} 个失败` : ""}`,
					);
					if (readyCount > 0) {
						toast.success(`已生成 ${readyCount} 个代理`, {
							description: "预览使用代理，最终导出仍保持原始画质。",
						});
					}
					if (failures.length > 0) {
						toast.warning(`${failures.length} 个代理生成失败`, {
							description: failures.slice(0, 3).join(", "),
						});
					}
				},
			});
			await handle.done;
		} finally {
			setIsProcessing(false);
		}
	};

	const handleToggleProxies = () => {
		const proxyAssets = batchOperationAssets.filter((asset) => asset.proxy);
		const enable = !proxyAssets.every((asset) => asset.proxy?.enabled);
		editor.media.updateMediaAssets({
			projectId: activeProject.metadata.id,
			updates: proxyAssets.map((asset) => ({
				assetId: asset.id,
				update: (current) => ({
					...current,
					proxy: current.proxy
						? { ...current.proxy, enabled: enable }
						: undefined,
				}),
			})),
		});
		setBatchStatus(`${proxyAssets.length} 个代理已${enable ? "启用" : "停用"}`);
		setBatchProgress(100);
	};

	const handleRemoveProxies = () => {
		const proxyAssets = batchOperationAssets.filter((asset) => asset.proxy);
		editor.media.updateMediaAssets({
			projectId: activeProject.metadata.id,
			updates: proxyAssets.map((asset) => ({
				assetId: asset.id,
				update: (current) => ({
					...current,
					proxy: undefined,
					proxyFile: undefined,
					proxyUrl: undefined,
				}),
			})),
		});
		setBatchStatus(`已移除 ${proxyAssets.length} 个代理`);
		setBatchProgress(100);
		toast.success("已移除预览代理", {
			description: "原始源素材已保留，可通过撤销恢复。",
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
			toast.error("无法新建素材文件夹", {
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
			toast.error("无法重命名素材文件夹", {
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
			toast.error("无法移动素材文件夹", {
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
			if (result.deletedBinIds.includes(effectiveActiveBinId)) {
				setActiveBinId(
					parentId !== null &&
						result.organization.bins.some((bin) => bin.id === parentId)
						? parentId
						: "unfiled",
				);
			}
			toast.success(`已删除 ${result.deletedBinIds.length} 个素材文件夹`, {
				description: `已保留并重新归类 ${result.rehomedAssetIds.length} 个素材，可通过撤销恢复。`,
			});
		} catch (error) {
			toast.error("无法删除素材文件夹", {
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
			toast.success(`已移动 ${assetIds.length} 个素材`, {
				description: "仅分类发生变化，源素材保持不变。",
			});
		} catch (error) {
			toast.error("无法整理素材", {
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
		toast.success(`已更新 ${metadataEditorAssetIds.length} 个素材`, {
			description: "标签、收藏和颜色标记均可撤销。",
		});
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
		if (effectiveActiveBinId !== "all" && effectiveActiveBinId !== "unfiled") {
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
			(effectiveActiveBinId === "all" || effectiveActiveBinId === "unfiled"
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
			<MediaBatchOperationsDialog
				open={batchOperationAssetIds.length > 0}
				assets={batchOperationAssets}
				busy={isProcessing}
				progress={batchProgress}
				status={batchStatus}
				onOpenChange={(open) => {
					if (!open) {
						setBatchOperationAssetIds([]);
						setBatchStatus(null);
						setBatchProgress(0);
					}
				}}
				onRename={handleBatchRename}
				onReplace={(files) =>
					void handleBatchReplace({ files, matchByName: false })
				}
				onRelinkByName={(files) =>
					void handleBatchReplace({ files, matchByName: true })
				}
				onExport={handleExportOriginals}
				onGenerateProxies={() => void handleGenerateProxies()}
				onToggleProxies={handleToggleProxies}
				onRemoveProxies={handleRemoveProxies}
				onRemoveAssets={removeBatchAssets}
			/>
			<MediaDuplicateReviewDialog
				open={duplicateReviewOpen}
				assets={mediaFiles}
				usageCounts={mediaUsageCounts}
				onOpenChange={setDuplicateReviewOpen}
				onRemove={(assetIds) => {
					invokeAction("remove-media-assets", {
						projectId: activeProject.metadata.id,
						assetIds,
					});
					toast.success(`已移除 ${assetIds.length} 个已确认的重复素材`, {
						description: "撤销可恢复素材及其时间线用法。",
					});
				}}
			/>
			<input {...fileInputProps} />
			<input
				ref={relinkInputRef}
				type="file"
				accept="image/*,video/*,audio/*"
				className="hidden"
				aria-label="选择用于重新链接丢失素材的文件"
				onChange={(event) => {
					const files = Array.from(event.currentTarget.files ?? []);
					event.currentTarget.value = "";
					void handleRelinkFiles({ files });
				}}
			/>

			<PanelView
				title="媒体"
				actions={
					<><EditorFootageLibrary />
					<MediaActions
						mediaViewMode={mediaViewMode}
						setMediaViewMode={setMediaViewMode}
						isProcessing={isProcessing}
						sortBy={mediaSortBy}
						sortOrder={mediaSortOrder}
						onSort={handleSort}
						onReviewDuplicates={() => setDuplicateReviewOpen(true)}
						onImport={openFilePicker}
					/>
					</>
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
								filteredMediaItems.length + filteredMissingReferences.length
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
									(effectiveActiveBinId === "unfiled" ? "未分类" : null)
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
								ariaLabel="素材"
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
									onOpenSource={({ assetId }) => openSourcePreview(assetId)}
									onEditMetadata={({ assetIds }) =>
										setMetadataEditorAssetIds(assetIds)
									}
									onBatchOperations={({ assetIds }) => {
										setBatchStatus(null);
										setBatchProgress(0);
										setBatchOperationAssetIds(assetIds);
									}}
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
						? "没有匹配的素材"
						: `${binName ?? "当前文件夹"}为空`}
				</p>
				<p className="mt-0.5 text-xs">
					{hasActiveFilters
						? `请尝试其他文件名${type !== "all" ? "或媒体类型" : ""}。`
						: "可从素材右键菜单将媒体移动到这里。"}
				</p>
			</div>
			<Button size="sm" variant="outline" onClick={onClear}>
				{hasActiveFilters ? "清除筛选" : "查看全部素材"}
			</Button>
			<span className="sr-only">没有素材匹配{query || "所选媒体类型"}</span>
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
			aria-label={`${references.length} 个丢失素材文件`}
		>
			<div className="mb-2 flex items-center justify-between gap-2">
				<div className="min-w-0">
					<p className="text-xs font-bold text-red-400">
						{references.length} 个丢失文件
					</p>
					<p className="text-muted-foreground truncate text-[11px]">
						重新链接后可恢复预览和导出
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
						全部重新链接
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
	onOpenSource,
	onEditMetadata,
	onBatchOperations,
	onAssignToBin,
	onRemove,
}: {
	item: MediaAsset;
	bins: ReturnType<typeof getMediaBinTree>[number]["bin"][];
	organization: ReturnType<typeof normalizeMediaOrganization>;
	children: React.ReactNode;
	onOpenSource: (args: { assetId: string }) => void;
	onEditMetadata: (args: { assetIds: string[] }) => void;
	onBatchOperations: (args: { assetIds: string[] }) => void;
	onAssignToBin: (args: { assetIds: string[]; binId: string | null }) => void;
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
		idsToDelete.length > 1 ? `删除 ${idsToDelete.length} 个素材` : "删除";
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
				<ContextMenuItem onSelect={() => onOpenSource({ assetId: item.id })}>
					在播放器中预览
				</ContextMenuItem>
				<ContextMenuItem
					onSelect={() => onBatchOperations({ assetIds: idsToDelete })}
				>
					导出原始文件…
				</ContextMenuItem>
				<ContextMenuItem
					onSelect={() => onEditMetadata({ assetIds: idsToDelete })}
				>
					编辑标签、收藏和颜色…
				</ContextMenuItem>
				<ContextMenuItem
					onSelect={() => onBatchOperations({ assetIds: idsToDelete })}
				>
					批量素材操作…
				</ContextMenuItem>
				<ContextMenuSub>
					<ContextMenuSubTrigger>移动到素材文件夹</ContextMenuSubTrigger>
					<ContextMenuSubContent>
						<ContextMenuLabel>保留源素材</ContextMenuLabel>
						<ContextMenuItem
							disabled={allAssignmentsMatch({ binId: null })}
							onSelect={() =>
								onAssignToBin({ assetIds: idsToDelete, binId: null })
							}
						>
							未分类
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
	onOpenSource,
	onEditMetadata,
	onBatchOperations,
	onAssignToBin,
	onRemove,
}: {
	items: MediaAsset[];
	mode: MediaViewMode;
	bins: ReturnType<typeof getMediaBinTree>[number]["bin"][];
	organization: ReturnType<typeof normalizeMediaOrganization>;
	onOpenSource: (args: { assetId: string }) => void;
	onEditMetadata: (args: { assetIds: string[] }) => void;
	onBatchOperations: (args: { assetIds: string[] }) => void;
	onAssignToBin: (args: { assetIds: string[]; binId: string | null }) => void;
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
					onOpenSource={onOpenSource}
					onEditMetadata={onEditMetadata}
					onBatchOperations={onBatchOperations}
					onAssignToBin={onAssignToBin}
					onRemove={onRemove}
					key={item.id}
				>
					<SelectableItem
						className={cn(!isGrid && "w-full")}
						id={item.id}
						onDoubleClick={() => onOpenSource({ assetId: item.id })}
					>
						<MediaAssetDraggable
							item={item}
							preview={
								<VirtualizedMediaPreview
									enabled={items.length > 100}
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

function VirtualizedMediaPreview({
	enabled,
	item,
	variant,
	metadata,
}: {
	enabled: boolean;
	item: MediaAsset;
	variant: "grid" | "compact";
	metadata: MediaAssetMetadata;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [visible, setVisible] = useState(!enabled);

	useEffect(() => {
		if (!enabled) return;
		const element = containerRef.current;
		if (!element || typeof IntersectionObserver === "undefined") {
			queueMicrotask(() => setVisible(true));
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				setVisible(Boolean(entry?.isIntersecting));
			},
			{ rootMargin: "480px 0px" },
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, [enabled]);

	return (
		<div
			ref={containerRef}
			className="size-full"
			style={{
				contentVisibility: enabled ? "auto" : "visible",
				containIntrinsicSize: variant === "grid" ? "112px 80px" : "48px 48px",
			}}
			data-media-preview-virtualized={enabled ? "true" : "false"}
		>
			{!enabled || visible ? (
				<MediaPreview item={item} variant={variant} metadata={metadata} />
			) : (
				<div
					className="bg-muted/30 size-full animate-pulse rounded"
					aria-label={`${item.name} 的延迟预览`}
				/>
			)}
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
				<MediaProxyBadge item={item} />
			</div>
		);
	}

	if (item.type === "video") {
		return (
			<HoverScrubVideoPreview
				item={item}
				metadata={metadata}
				showDurationBadge={shouldShowDurationBadge}
			/>
		);
	}

	if (item.type === "audio") {
		return (
			<div className="relative size-full">
				<MediaTypePlaceholder
					icon={MusicNote03Icon}
					label="音频"
					duration={item.duration}
					variant="bordered"
				/>
				<MediaMetadataBadges metadata={metadata} />
				<MediaProxyBadge item={item} />
			</div>
		);
	}

	return (
		<div className="relative size-full">
			<MediaTypePlaceholder icon={Image02Icon} label="未知" variant="muted" />
			<MediaMetadataBadges metadata={metadata} />
			<MediaProxyBadge item={item} />
		</div>
	);
}

function MediaProxyBadge({ item }: { item: MediaAsset }) {
	if (!item.proxy) return null;
	return (
		<span
			className={cn(
				"absolute top-1 left-1 rounded px-1 py-0.5 text-[9px] font-bold tracking-wide text-white shadow",
				item.proxy.enabled ? "bg-sky-500" : "bg-slate-500",
			)}
			title={`${item.proxy.enabled ? "代理预览已启用" : "代理预览已停用"} · 导出使用原始素材`}
		>
			P
		</span>
	);
}

function HoverScrubVideoPreview({
	item,
	metadata,
	showDurationBadge,
}: {
	item: MediaAsset;
	metadata: MediaAssetMetadata;
	showDurationBadge: boolean;
}) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [isHovering, setIsHovering] = useState(false);
	const [scrubTime, setScrubTime] = useState(0);
	const previewUrl =
		item.proxy?.enabled && item.proxyUrl ? item.proxyUrl : item.url;

	const scrub = ({ event }: { event: React.PointerEvent<HTMLDivElement> }) => {
		const duration = item.duration ?? videoRef.current?.duration ?? 0;
		if (duration <= 0) return;
		const bounds = event.currentTarget.getBoundingClientRect();
		const ratio = Math.min(
			1,
			Math.max(0, (event.clientX - bounds.left) / Math.max(1, bounds.width)),
		);
		const time = ratio * duration;
		setScrubTime(time);
		if (videoRef.current && Number.isFinite(videoRef.current.duration)) {
			videoRef.current.currentTime = time;
		}
	};

	return (
		<div
			className="relative size-full"
			onPointerEnter={() => setIsHovering(true)}
			onPointerMove={(event) => scrub({ event })}
			onPointerLeave={() => {
				setIsHovering(false);
				setScrubTime(0);
			}}
			title="悬停拖动预览 · 双击在播放器中预览"
		>
			{isHovering && previewUrl ? (
				<video
					ref={videoRef}
					src={previewUrl}
					className="size-full object-cover"
					muted
					playsInline
					preload="metadata"
				/>
			) : item.thumbnailUrl ? (
				<Image
					src={item.thumbnailUrl}
					alt={item.name}
					fill
					sizes="100vw"
					className="rounded object-cover"
					loading="lazy"
					unoptimized
				/>
			) : (
				<MediaTypePlaceholder
					icon={Video01Icon}
					label="视频"
					duration={item.duration}
					variant="muted"
				/>
			)}
			{isHovering ? (
				<span className="absolute inset-x-1 bottom-1 rounded bg-black/75 px-1 py-0.5 text-center text-[9px] text-white">
					预览 {formatDuration({ duration: scrubTime })} · 双击查看源素材
				</span>
			) : showDurationBadge ? (
				<MediaDurationBadge duration={item.duration} />
			) : null}
			<MediaMetadataBadges metadata={metadata} />
			<MediaProxyBadge item={item} />
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

function MediaMetadataBadges({ metadata }: { metadata: MediaAssetMetadata }) {
	if (!metadata.favorite && metadata.colorLabel === null) return null;
	return (
		<div className="absolute left-1 top-1 flex items-center gap-1">
			{metadata.favorite ? (
				<span
					className="flex size-4 items-center justify-center rounded bg-black/70 text-[10px] text-amber-300"
					aria-label="已收藏素材"
					title="已收藏"
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
					aria-label={`${MEDIA_COLOR_LABEL_NAMES[metadata.colorLabel]}颜色标签`}
					title={`${MEDIA_COLOR_LABEL_NAMES[metadata.colorLabel]}颜色标签`}
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
	onReviewDuplicates,
	onImport,
}: {
	mediaViewMode: MediaViewMode;
	setMediaViewMode: (mode: MediaViewMode) => void;
	isProcessing: boolean;
	sortBy: MediaSortKey;
	sortOrder: MediaSortOrder;
	onSort: ({ key }: { key: MediaSortKey }) => void;
	onReviewDuplicates: () => void;
	onImport: () => void;
}) {
	const sortLabel = MEDIA_SORT_LABELS[sortBy];
	return (
		<div className="flex gap-1.5">
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label={
								mediaViewMode === "grid" ? "切换为列表视图" : "切换为网格视图"
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
							{mediaViewMode === "grid" ? "切换为列表视图" : "切换为网格视图"}
						</p>
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<DropdownMenu>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<Button
									aria-label={`素材排序：${sortLabel}，${
										sortOrder === "asc" ? "升序" : "降序"
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
								label="名称"
								sortKey="name"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label="类型"
								sortKey="type"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label="时长"
								sortKey="duration"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label="文件大小"
								sortKey="size"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label="收藏"
								sortKey="favorite"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label="颜色标签"
								sortKey="colorLabel"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
						</DropdownMenuContent>
					</DropdownMenu>
					<TooltipContent>
						<p>
							按 {sortLabel} 排序（
							{sortOrder === "asc" ? "升序" : "降序"}）
						</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
			<Button
				variant="ghost"
				onClick={onReviewDuplicates}
				disabled={isProcessing}
				size="sm"
				className="items-center justify-center px-2 text-xs"
			>
				重复项
			</Button>
			<Button
				variant="outline"
				onClick={onImport}
				disabled={isProcessing}
				size="sm"
				className="items-center justify-center gap-1.5"
			>
				<HugeiconsIcon icon={CloudUploadIcon} />
				导入
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
