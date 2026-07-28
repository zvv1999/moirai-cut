import type { MediaAsset } from "@/media/types";

export type MediaTypeFilter = "all" | MediaAsset["type"];

export function filterMediaLibraryAssets({
	assets,
	query,
	type,
}: {
	assets: MediaAsset[];
	query: string;
	type: MediaTypeFilter;
}): MediaAsset[] {
	const normalizedQuery = query.trim().toLocaleLowerCase();

	return assets.filter((asset) => {
		if (asset.ephemeral) return false;
		if (type !== "all" && asset.type !== type) return false;
		if (!normalizedQuery) return true;

		return asset.name.toLocaleLowerCase().includes(normalizedQuery);
	});
}
