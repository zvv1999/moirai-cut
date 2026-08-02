import type { MediaAsset, MediaType } from "@/media/types";
import { hasMediaId } from "@/timeline/element-utils";
import type {
	ElementRef,
	SceneTracks,
	TimelineElement,
	TimelineTrack,
	VideoElement,
	ImageElement,
} from "@/timeline";
import type { MediaTime } from "@/wasm";

export type MissingMediaReference = {
	mediaId: string;
	name: string;
	type: MediaType;
	usages: ElementRef[];
};

export type ActiveMissingVisualElement = {
	mediaId: string;
	name: string;
	type: "video" | "image";
	trackId: string;
	elementId: string;
};

function getTracks({ tracks }: { tracks: SceneTracks }): TimelineTrack[] {
	return [...tracks.overlay, tracks.main, ...tracks.audio];
}

function getExpectedMediaType({
	element,
}: {
	element: TimelineElement;
}): MediaType | null {
	if (element.type === "video" || element.type === "image") {
		return element.type;
	}
	if (element.type === "audio" && element.sourceType === "upload") {
		return "audio";
	}
	return null;
}

export function findMissingMediaReferences({
	tracks,
	assets,
}: {
	tracks: SceneTracks;
	assets: MediaAsset[];
}): MissingMediaReference[] {
	const availableIds = new Set(assets.map((asset) => asset.id));
	const references = new Map<string, MissingMediaReference>();

	for (const track of getTracks({ tracks })) {
		for (const element of track.elements) {
			if (!hasMediaId(element) || availableIds.has(element.mediaId)) {
				continue;
			}

			const type = getExpectedMediaType({ element });
			if (!type) continue;

			const usage = { trackId: track.id, elementId: element.id };
			const existing = references.get(element.mediaId);
			if (existing) {
				existing.usages.push(usage);
				continue;
			}

			references.set(element.mediaId, {
				mediaId: element.mediaId,
				name: element.name,
				type,
				usages: [usage],
			});
		}
	}

	return [...references.values()];
}

function isElementActive({
	element,
	time,
}: {
	element: VideoElement | ImageElement;
	time: MediaTime;
}): boolean {
	return (
		time >= element.startTime && time < element.startTime + element.duration
	);
}

export function findActiveMissingVisualElements({
	tracks,
	assets,
	time,
}: {
	tracks: SceneTracks;
	assets: MediaAsset[];
	time: MediaTime;
}): ActiveMissingVisualElement[] {
	const availableIds = new Set(assets.map((asset) => asset.id));
	const visibleTracks = [
		...tracks.overlay.filter(
			(track) => !("hidden" in track) || track.hidden !== true,
		),
		...(tracks.main.hidden ? [] : [tracks.main]),
	];
	const missing: ActiveMissingVisualElement[] = [];

	for (const track of visibleTracks) {
		for (const element of track.elements) {
			if (element.type !== "video" && element.type !== "image") continue;
			if (element.hidden || availableIds.has(element.mediaId)) continue;
			if (!isElementActive({ element, time })) continue;

			missing.push({
				mediaId: element.mediaId,
				name: element.name,
				type: element.type,
				trackId: track.id,
				elementId: element.id,
			});
		}
	}

	return missing;
}

function normalizeFilename({ name }: { name: string }): string {
	return name.trim().toLocaleLowerCase();
}

function getFilenameBase({ name }: { name: string }): string {
	const normalized = normalizeFilename({ name });
	const lastDot = normalized.lastIndexOf(".");
	return lastDot > 0 ? normalized.slice(0, lastDot) : normalized;
}

function inferFileMediaType({ file }: { file: File }): MediaType | null {
	const topLevelType = file.type.split("/", 1)[0];
	if (
		topLevelType === "video" ||
		topLevelType === "image" ||
		topLevelType === "audio"
	) {
		return topLevelType;
	}

	const extension = file.name.split(".").pop()?.toLocaleLowerCase();
	if (!extension) return null;
	if (["mp4", "mov", "m4v", "webm", "mkv", "avi"].includes(extension)) {
		return "video";
	}
	if (
		["png", "jpg", "jpeg", "webp", "gif", "svg", "avif"].includes(extension)
	) {
		return "image";
	}
	if (["wav", "mp3", "m4a", "aac", "ogg", "flac", "opus"].includes(extension)) {
		return "audio";
	}
	return null;
}

export function matchFilesToMissingMedia({
	references,
	files,
}: {
	references: MissingMediaReference[];
	files: File[];
}): {
	matches: Array<{ reference: MissingMediaReference; file: File }>;
	unmatchedReferences: MissingMediaReference[];
	unmatchedFiles: File[];
} {
	const remainingFileIndexes = new Set(files.map((_, index) => index));
	const fileTypes = files.map((file) => inferFileMediaType({ file }));
	const matchesByMediaId = new Map<
		string,
		{ reference: MissingMediaReference; file: File }
	>();

	const assignMatches = ({
		matches,
	}: {
		matches: ({
			reference,
			file,
		}: {
			reference: MissingMediaReference;
			file: File;
		}) => boolean;
	}) => {
		for (const reference of references) {
			if (matchesByMediaId.has(reference.mediaId)) continue;

			const candidateIndexes = [...remainingFileIndexes].filter((index) => {
				if (fileTypes[index] !== reference.type) return false;
				return matches({ reference, file: files[index] });
			});
			if (candidateIndexes.length !== 1) continue;

			const [index] = candidateIndexes;
			matchesByMediaId.set(reference.mediaId, {
				reference,
				file: files[index],
			});
			remainingFileIndexes.delete(index);
		}
	};

	assignMatches({
		matches: ({ reference, file }) =>
			normalizeFilename({ name: reference.name }) ===
			normalizeFilename({ name: file.name }),
	});
	assignMatches({
		matches: ({ reference, file }) =>
			getFilenameBase({ name: reference.name }) ===
			getFilenameBase({ name: file.name }),
	});

	return {
		matches: references.flatMap((reference) => {
			const match = matchesByMediaId.get(reference.mediaId);
			return match ? [match] : [];
		}),
		unmatchedReferences: references.filter(
			(reference) => !matchesByMediaId.has(reference.mediaId),
		),
		unmatchedFiles: files.filter((_, index) => remainingFileIndexes.has(index)),
	};
}
