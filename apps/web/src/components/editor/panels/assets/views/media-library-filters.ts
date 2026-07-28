import type { MediaAsset } from "@/media/types";
import type { MediaAssetMetadata } from "@/media/organization";

export type MediaTypeFilter = "all" | MediaAsset["type"];
export type MediaDurationFilter = "all" | "under-10" | "10-60" | "over-60";
export type MediaResolutionFilter = "all" | "sd" | "hd" | "uhd";
export type MediaUsageFilter = "all" | "used" | "unused";
export type MediaAvailabilityFilter = "all" | "available" | "missing";
export type MediaFavoriteFilter = "all" | "favorite";

export interface MediaLibraryFilters {
	duration: MediaDurationFilter;
	resolution: MediaResolutionFilter;
	usage: MediaUsageFilter;
	availability: MediaAvailabilityFilter;
	tag: string | null;
	favorite: MediaFavoriteFilter;
}

export const DEFAULT_MEDIA_LIBRARY_FILTERS: MediaLibraryFilters = {
	duration: "all",
	resolution: "all",
	usage: "all",
	availability: "all",
	tag: null,
	favorite: "all",
};

export function filterMediaLibraryAssets({
	assets,
	query,
	type,
	filters = DEFAULT_MEDIA_LIBRARY_FILTERS,
	usageCounts = {},
	metadata = {},
}: {
	assets: MediaAsset[];
	query: string;
	type: MediaTypeFilter;
	filters?: MediaLibraryFilters;
	usageCounts?: Record<string, number>;
	metadata?: Record<string, MediaAssetMetadata>;
}): MediaAsset[] {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	const normalizedTag = filters.tag?.trim().toLocaleLowerCase() ?? null;

	return assets.filter((asset) => {
		if (asset.ephemeral) return false;
		if (filters.availability === "missing") return false;
		if (type !== "all" && asset.type !== type) return false;
		if (!matchesDuration({ asset, filter: filters.duration })) return false;
		if (!matchesResolution({ asset, filter: filters.resolution })) return false;
		const usageCount = usageCounts[asset.id] ?? 0;
		if (filters.usage === "used" && usageCount === 0) return false;
		if (filters.usage === "unused" && usageCount > 0) return false;
		const assetMetadata = metadata[asset.id] ?? {
			tags: [],
			favorite: false,
			colorLabel: null,
		};
		if (filters.favorite === "favorite" && !assetMetadata.favorite) return false;
		if (
			normalizedTag !== null &&
			!assetMetadata.tags.some(
				(tag) => tag.toLocaleLowerCase() === normalizedTag,
			)
		) {
			return false;
		}
		if (!normalizedQuery) return true;

		return asset.name.toLocaleLowerCase().includes(normalizedQuery);
	});
}

export function countActiveMediaLibraryFilters({
	type,
	filters,
}: {
	type: MediaTypeFilter;
	filters: MediaLibraryFilters;
}): number {
	return [
		type !== "all",
		filters.duration !== "all",
		filters.resolution !== "all",
		filters.usage !== "all",
		filters.availability !== "all",
		filters.tag !== null,
		filters.favorite !== "all",
	].filter(Boolean).length;
}

function matchesDuration({
	asset,
	filter,
}: {
	asset: MediaAsset;
	filter: MediaDurationFilter;
}): boolean {
	if (filter === "all") return true;
	if (asset.duration === undefined) return false;
	if (filter === "under-10") return asset.duration < 10;
	if (filter === "10-60") {
		return asset.duration >= 10 && asset.duration <= 60;
	}
	return asset.duration > 60;
}

function matchesResolution({
	asset,
	filter,
}: {
	asset: MediaAsset;
	filter: MediaResolutionFilter;
}): boolean {
	if (filter === "all") return true;
	if (asset.width === undefined || asset.height === undefined) return false;
	const longEdge = Math.max(asset.width, asset.height);
	const shortEdge = Math.min(asset.width, asset.height);
	const isUhd = longEdge >= 3840 || shortEdge >= 2160;
	const isHd = longEdge >= 1280 || shortEdge >= 720;
	if (filter === "uhd") return isUhd;
	if (filter === "hd") return isHd && !isUhd;
	return !isHd;
}
