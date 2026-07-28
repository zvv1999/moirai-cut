import type { MediaAsset } from "@/media/types";

export type MediaDuplicateGroup = {
	id: string;
	kind: "exact" | "probable";
	assetIds: string[];
	reasons: string[];
};

function normalizedStem({ name }: { name: string }): string {
	const lastDot = name.lastIndexOf(".");
	const stem = lastDot > 0 ? name.slice(0, lastDot) : name;
	return stem
		.toLocaleLowerCase()
		.normalize("NFKC")
		.replace(/\s*(?:copy|duplicate)(?:\s*\(\d+\)|\s*\d+)?$/u, "")
		.replace(/\s*\(\d+\)$/u, "")
		.replace(/[\s_-]+/gu, " ")
		.trim();
}

async function sha256({ file }: { file: File }): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function relativeSizeDifference({
	left,
	right,
}: {
	left: number;
	right: number;
}): number {
	return Math.abs(left - right) / Math.max(1, left, right);
}

function probableReasons({
	left,
	right,
}: {
	left: MediaAsset;
	right: MediaAsset;
}): string[] {
	if (left.type !== right.type) return [];
	if (
		normalizedStem({ name: left.name }) !== normalizedStem({ name: right.name })
	) {
		return [];
	}

	const reasons = ["Matching normalized filename"];
	if (left.type === "image") {
		if (
			left.width !== undefined &&
			left.height !== undefined &&
			left.width === right.width &&
			left.height === right.height &&
			relativeSizeDifference({
				left: left.file.size,
				right: right.file.size,
			}) <= 0.03
		) {
			reasons.push("Matching dimensions and similar file size");
		}
	} else {
		const durationDifference =
			left.duration !== undefined && right.duration !== undefined
				? Math.abs(left.duration - right.duration)
				: Infinity;
		if (
			durationDifference <= 0.1 &&
			(left.type === "audio" ||
				(left.width === right.width && left.height === right.height)) &&
			relativeSizeDifference({
				left: left.file.size,
				right: right.file.size,
			}) <= 0.05
		) {
			reasons.push(
				left.type === "audio"
					? "Matching duration and similar file size"
					: "Matching dimensions and duration",
			);
		}
	}

	return reasons.length > 1 ? reasons : [];
}

export async function detectMediaDuplicates({
	assets,
	onProgress,
}: {
	assets: MediaAsset[];
	onProgress?: (progress: number) => void;
}): Promise<MediaDuplicateGroup[]> {
	const candidates = assets.filter((asset) => !asset.ephemeral);
	const exactGroups: MediaDuplicateGroup[] = [];
	const exactAssetIds = new Set<string>();
	const sizeBuckets = new Map<string, MediaAsset[]>();

	for (const asset of candidates) {
		const key = `${asset.type}:${asset.file.size}`;
		sizeBuckets.set(key, [...(sizeBuckets.get(key) ?? []), asset]);
	}

	const hashCandidates = [...sizeBuckets.values()]
		.filter((bucket) => bucket.length > 1)
		.flat();
	const hashes = new Map<string, string>();
	for (let index = 0; index < hashCandidates.length; index++) {
		const asset = hashCandidates[index];
		hashes.set(asset.id, await sha256({ file: asset.file }));
		onProgress?.(((index + 1) / Math.max(1, hashCandidates.length)) * 0.7);
	}

	for (const bucket of sizeBuckets.values()) {
		if (bucket.length < 2) continue;
		const hashBuckets = new Map<string, MediaAsset[]>();
		for (const asset of bucket) {
			const hash = hashes.get(asset.id);
			if (!hash) continue;
			hashBuckets.set(hash, [...(hashBuckets.get(hash) ?? []), asset]);
		}
		for (const [hash, matches] of hashBuckets) {
			if (matches.length < 2) continue;
			const assetIds = matches.map((asset) => asset.id).sort();
			assetIds.forEach((id) => exactAssetIds.add(id));
			exactGroups.push({
				id: `exact:${hash}`,
				kind: "exact",
				assetIds,
				reasons: ["Identical SHA-256 content", "Identical byte size"],
			});
		}
	}

	const probableGroups: MediaDuplicateGroup[] = [];
	for (let leftIndex = 0; leftIndex < candidates.length; leftIndex++) {
		const left = candidates[leftIndex];
		if (exactAssetIds.has(left.id)) continue;
		for (
			let rightIndex = leftIndex + 1;
			rightIndex < candidates.length;
			rightIndex++
		) {
			const right = candidates[rightIndex];
			if (exactAssetIds.has(right.id)) continue;
			const reasons = probableReasons({ left, right });
			if (reasons.length === 0) continue;
			probableGroups.push({
				id: `probable:${left.id}:${right.id}`,
				kind: "probable",
				assetIds: [left.id, right.id],
				reasons,
			});
		}
		onProgress?.(
			0.7 + ((leftIndex + 1) / Math.max(1, candidates.length)) * 0.3,
		);
	}

	onProgress?.(1);
	return [...exactGroups, ...probableGroups].sort((left, right) => {
		if (left.kind !== right.kind) return left.kind === "exact" ? -1 : 1;
		return left.assetIds[0].localeCompare(right.assetIds[0]);
	});
}
