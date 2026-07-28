export interface MediaBin {
	id: string;
	name: string;
	parentId: string | null;
	order: number;
}

export interface MediaOrganization {
	bins: MediaBin[];
	assetBinIds: Record<string, string>;
	assetMetadata?: Record<string, MediaAssetMetadata>;
}

export const MEDIA_COLOR_LABELS = [
	"red",
	"orange",
	"yellow",
	"green",
	"blue",
	"purple",
] as const;

export type MediaColorLabel = (typeof MEDIA_COLOR_LABELS)[number];

export interface MediaAssetMetadata {
	tags: string[];
	favorite: boolean;
	colorLabel: MediaColorLabel | null;
}

export type MediaBinSelection = "all" | "unfiled" | string;

export interface MediaBinTreeItem {
	bin: MediaBin;
	depth: number;
	hasChildren: boolean;
}

const MAX_BIN_NAME_LENGTH = 80;

export function emptyMediaOrganization(): MediaOrganization {
	return { bins: [], assetBinIds: {}, assetMetadata: {} };
}

export function normalizeMediaOrganization({
	organization,
}: {
	organization: MediaOrganization | null | undefined;
}): MediaOrganization {
	if (!organization) return emptyMediaOrganization();
	const seenIds = new Set<string>();
	const bins = organization.bins.flatMap((bin) => {
		if (!bin.id || seenIds.has(bin.id)) return [];
		seenIds.add(bin.id);
		return [
			{
				id: bin.id,
				name: normalizeBinName({ name: bin.name }),
				parentId: bin.parentId,
				order: Number.isFinite(bin.order) ? Math.max(0, Math.floor(bin.order)) : 0,
			},
		];
	});
	const candidate: MediaOrganization = {
		bins: bins.map((bin) => ({
			...bin,
			parentId:
				bin.parentId !== bin.id && seenIds.has(bin.parentId ?? "")
					? bin.parentId
					: null,
		})),
		assetBinIds: { ...organization.assetBinIds },
		assetMetadata: Object.fromEntries(
			Object.entries(organization.assetMetadata ?? {}).map(
				([assetId, metadata]) => [
					assetId,
					normalizeMediaAssetMetadata({ metadata }),
				],
			),
		),
	};
	const cyclicIds = findCyclicBinIds({ bins: candidate.bins });
	return normalizeSiblingOrders({
		organization: {
			...candidate,
			bins: candidate.bins.map((bin) =>
				cyclicIds.has(bin.id) ? { ...bin, parentId: null } : bin,
			),
			assetBinIds: Object.fromEntries(
				Object.entries(candidate.assetBinIds).filter(([, binId]) =>
					seenIds.has(binId),
				),
			),
		},
	});
}

export function createMediaBin({
	organization,
	bin,
}: {
	organization: MediaOrganization;
	bin: Pick<MediaBin, "id" | "name" | "parentId">;
}): MediaOrganization {
	const normalized = normalizeMediaOrganization({ organization });
	if (normalized.bins.some((candidate) => candidate.id === bin.id)) {
		throw new Error(`Media bin ${bin.id} already exists`);
	}
	if (
		bin.parentId !== null &&
		!normalized.bins.some((candidate) => candidate.id === bin.parentId)
	) {
		throw new Error("Parent media bin does not exist");
	}
	const siblingCount = normalized.bins.filter(
		(candidate) => candidate.parentId === bin.parentId,
	).length;
	return {
		...normalized,
		bins: [
			...normalized.bins,
			{
				id: bin.id,
				name: normalizeBinName({ name: bin.name }),
				parentId: bin.parentId,
				order: siblingCount,
			},
		],
	};
}

export function renameMediaBin({
	organization,
	binId,
	name,
}: {
	organization: MediaOrganization;
	binId: string;
	name: string;
}): MediaOrganization {
	assertBinExists({ organization, binId });
	return {
		...organization,
		bins: organization.bins.map((bin) =>
			bin.id === binId
				? { ...bin, name: normalizeBinName({ name }) }
				: bin,
		),
	};
}

export function moveMediaBin({
	organization,
	binId,
	parentId,
	index,
}: {
	organization: MediaOrganization;
	binId: string;
	parentId: string | null;
	index: number;
}): MediaOrganization {
	const normalized = normalizeMediaOrganization({ organization });
	const moving = assertBinExists({ organization: normalized, binId });
	if (parentId !== null) {
		assertBinExists({ organization: normalized, binId: parentId });
		const descendants = getDescendantIds({
			bins: normalized.bins,
			binId: moving.id,
		});
		if (parentId === moving.id || descendants.has(parentId)) {
			throw new Error("A media bin cannot be moved inside itself");
		}
	}

	const withoutMoving = normalized.bins.filter((bin) => bin.id !== moving.id);
	const targetSiblings = withoutMoving
		.filter((bin) => bin.parentId === parentId)
		.sort(compareBinOrder);
	const insertionIndex = Math.max(0, Math.min(Math.floor(index), targetSiblings.length));
	targetSiblings.splice(insertionIndex, 0, { ...moving, parentId });

	const targetOrder = new Map(
		targetSiblings.map((bin, order) => [bin.id, order]),
	);
	return normalizeSiblingOrders({
		organization: {
			...normalized,
			bins: normalized.bins.map((bin) => {
				if (bin.id === moving.id) {
					return {
						...bin,
						parentId,
						order: targetOrder.get(bin.id) ?? 0,
					};
				}
				const order = targetOrder.get(bin.id);
				return order === undefined ? bin : { ...bin, order };
			}),
		},
	});
}

export function deleteMediaBin({
	organization,
	binId,
}: {
	organization: MediaOrganization;
	binId: string;
}): {
	organization: MediaOrganization;
	deletedBinIds: string[];
	rehomedAssetIds: string[];
} {
	const normalized = normalizeMediaOrganization({ organization });
	const deletedRoot = assertBinExists({ organization: normalized, binId });
	const deletedIds = new Set([
		binId,
		...getDescendantIds({ bins: normalized.bins, binId }),
	]);
	const deletedBinIds = normalized.bins
		.filter((bin) => deletedIds.has(bin.id))
		.map((bin) => bin.id);
	const rehomedAssetIds: string[] = [];
	const assetBinIds: Record<string, string> = {};

	for (const [assetId, assignedBinId] of Object.entries(
		normalized.assetBinIds,
	)) {
		if (!deletedIds.has(assignedBinId)) {
			assetBinIds[assetId] = assignedBinId;
			continue;
		}
		rehomedAssetIds.push(assetId);
		if (deletedRoot.parentId !== null) {
			assetBinIds[assetId] = deletedRoot.parentId;
		}
	}

	return {
		organization: normalizeSiblingOrders({
			organization: {
				...normalized,
				bins: normalized.bins.filter((bin) => !deletedIds.has(bin.id)),
				assetBinIds,
			},
		}),
		deletedBinIds,
		rehomedAssetIds,
	};
}

export function assignAssetsToMediaBin({
	organization,
	assetIds,
	binId,
}: {
	organization: MediaOrganization;
	assetIds: string[];
	binId: string | null;
}): MediaOrganization {
	const normalized = normalizeMediaOrganization({ organization });
	if (binId !== null) {
		assertBinExists({ organization: normalized, binId });
	}
	const assetBinIds = { ...normalized.assetBinIds };
	for (const assetId of new Set(assetIds)) {
		if (binId === null) {
			delete assetBinIds[assetId];
		} else {
			assetBinIds[assetId] = binId;
		}
	}
	return { ...normalized, assetBinIds };
}

export function getMediaAssetMetadata({
	organization,
	assetId,
}: {
	organization: MediaOrganization;
	assetId: string;
}): MediaAssetMetadata {
	return normalizeMediaAssetMetadata({
		metadata: organization.assetMetadata?.[assetId],
	});
}

export function updateMediaAssetMetadata({
	organization,
	assetIds,
	patch,
}: {
	organization: MediaOrganization;
	assetIds: string[];
	patch: {
		addTags?: string[];
		removeTags?: string[];
		favorite?: boolean;
		colorLabel?: MediaColorLabel | null;
	};
}): MediaOrganization {
	const normalized = normalizeMediaOrganization({ organization });
	const assetMetadata = { ...(normalized.assetMetadata ?? {}) };
	const addTags = normalizeTags({ tags: patch.addTags ?? [] });
	const removeTagKeys = new Set(
		normalizeTags({ tags: patch.removeTags ?? [] }).map((tag) =>
			tag.toLocaleLowerCase(),
		),
	);

	for (const assetId of new Set(assetIds)) {
		const current = getMediaAssetMetadata({
			organization: normalized,
			assetId,
		});
		const tags = current.tags.filter(
			(tag) => !removeTagKeys.has(tag.toLocaleLowerCase()),
		);
		const tagKeys = new Set(tags.map((tag) => tag.toLocaleLowerCase()));
		for (const tag of addTags) {
			const key = tag.toLocaleLowerCase();
			if (tagKeys.has(key)) continue;
			tags.push(tag);
			tagKeys.add(key);
		}
		assetMetadata[assetId] = {
			tags,
			favorite: patch.favorite ?? current.favorite,
			colorLabel:
				patch.colorLabel === undefined
					? current.colorLabel
					: patch.colorLabel,
		};
	}

	return { ...normalized, assetMetadata };
}

export function getMediaBinTree({
	organization,
}: {
	organization: MediaOrganization;
}): MediaBinTreeItem[] {
	const normalized = normalizeMediaOrganization({ organization });
	const result: MediaBinTreeItem[] = [];
	const appendChildren = ({
		parentId,
		depth,
	}: {
		parentId: string | null;
		depth: number;
	}) => {
		const children = normalized.bins
			.filter((bin) => bin.parentId === parentId)
			.sort(compareBinOrder);
		for (const bin of children) {
			const hasChildren = normalized.bins.some(
				(candidate) => candidate.parentId === bin.id,
			);
			result.push({ bin, depth, hasChildren });
			appendChildren({ parentId: bin.id, depth: depth + 1 });
		}
	};
	appendChildren({ parentId: null, depth: 0 });
	return result;
}

export function getMediaBinAssetCount({
	organization,
	assetIds,
	binId,
}: {
	organization: MediaOrganization;
	assetIds: string[];
	binId: MediaBinSelection;
}): number {
	if (binId === "all") return assetIds.length;
	return assetIds.filter((assetId) => {
		const assignedBinId = organization.assetBinIds[assetId];
		return binId === "unfiled"
			? assignedBinId === undefined
			: assignedBinId === binId;
	}).length;
}

export function mediaAssetMatchesBin({
	organization,
	assetId,
	binId,
}: {
	organization: MediaOrganization;
	assetId: string;
	binId: MediaBinSelection;
}): boolean {
	if (binId === "all") return true;
	const assignedBinId = organization.assetBinIds[assetId];
	return binId === "unfiled"
		? assignedBinId === undefined
		: assignedBinId === binId;
}

function normalizeBinName({ name }: { name: string }): string {
	const normalized = name.trim().replace(/\s+/g, " ");
	if (!normalized) return "Untitled bin";
	return normalized.slice(0, MAX_BIN_NAME_LENGTH);
}

function normalizeMediaAssetMetadata({
	metadata,
}: {
	metadata: Partial<MediaAssetMetadata> | null | undefined;
}): MediaAssetMetadata {
	const colorLabel =
		MEDIA_COLOR_LABELS.find((label) => label === metadata?.colorLabel) ?? null;
	return {
		tags: normalizeTags({ tags: metadata?.tags ?? [] }),
		favorite: metadata?.favorite === true,
		colorLabel,
	};
}

function normalizeTags({ tags }: { tags: string[] }): string[] {
	const normalized: string[] = [];
	const keys = new Set<string>();
	for (const rawTag of tags) {
		const tag = rawTag.trim().replace(/\s+/g, " ").slice(0, 40);
		const key = tag.toLocaleLowerCase();
		if (!tag || keys.has(key)) continue;
		normalized.push(tag);
		keys.add(key);
		if (normalized.length === 32) break;
	}
	return normalized;
}

function assertBinExists({
	organization,
	binId,
}: {
	organization: MediaOrganization;
	binId: string;
}): MediaBin {
	const bin = organization.bins.find((candidate) => candidate.id === binId);
	if (!bin) throw new Error(`Media bin ${binId} does not exist`);
	return bin;
}

function compareBinOrder(a: MediaBin, b: MediaBin): number {
	return a.order - b.order || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

function normalizeSiblingOrders({
	organization,
}: {
	organization: MediaOrganization;
}): MediaOrganization {
	const orders = new Map<string, number>();
	const parentIds = new Set(organization.bins.map((bin) => bin.parentId));
	for (const parentId of parentIds) {
		organization.bins
			.filter((bin) => bin.parentId === parentId)
			.sort(compareBinOrder)
			.forEach((bin, index) => orders.set(bin.id, index));
	}
	return {
		...organization,
		bins: organization.bins.map((bin) => ({
			...bin,
			order: orders.get(bin.id) ?? 0,
		})),
	};
}

function getDescendantIds({
	bins,
	binId,
}: {
	bins: MediaBin[];
	binId: string;
}): Set<string> {
	const descendants = new Set<string>();
	let changed = true;
	while (changed) {
		changed = false;
		for (const bin of bins) {
			if (
				!descendants.has(bin.id) &&
				(bin.parentId === binId ||
					(bin.parentId !== null && descendants.has(bin.parentId)))
			) {
				descendants.add(bin.id);
				changed = true;
			}
		}
	}
	return descendants;
}

function findCyclicBinIds({ bins }: { bins: MediaBin[] }): Set<string> {
	const byId = new Map(bins.map((bin) => [bin.id, bin]));
	const cyclic = new Set<string>();
	for (const bin of bins) {
		const path = new Set<string>();
		let current: MediaBin | undefined = bin;
		while (current?.parentId) {
			if (path.has(current.id)) {
				for (const id of path) cyclic.add(id);
				break;
			}
			path.add(current.id);
			current = byId.get(current.parentId);
		}
	}
	return cyclic;
}
