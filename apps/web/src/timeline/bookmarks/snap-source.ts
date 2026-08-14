import type { Bookmark } from "@/timeline";
import type { SnapPoint } from "@/timeline/snapping";
import type { MediaTime } from "@/wasm";

export function getBookmarkSnapPoints({
	bookmarks,
	excludeBookmarkTime,
	excludeClipElementIds,
}: {
	bookmarks: Bookmark[];
	excludeBookmarkTime?: MediaTime;
	excludeClipElementIds?: ReadonlySet<string>;
}): SnapPoint[] {
	return bookmarks.flatMap((bookmark) => {
		if (excludeBookmarkTime != null && bookmark.time === excludeBookmarkTime) {
			return [];
		}
		if (
			bookmark.scope === "clip" &&
			bookmark.elementId !== undefined &&
			excludeClipElementIds?.has(bookmark.elementId)
		) {
			return [];
		}

		return [
			{ time: bookmark.time, type: "bookmark" satisfies SnapPoint["type"] },
		];
	});
}
