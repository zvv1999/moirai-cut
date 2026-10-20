// Browser-only receipts identify the exact form submission that produced a video.
export type DraftPreviewReceipt = { identity: string; batchId: string };

function submittedTemplate(identity: string): unknown {
	try {
		const submission = JSON.parse(identity);
		return Array.isArray(submission?.designs) && submission.designs.length === 1
			? submission.designs[0]?.template
			: undefined;
	} catch { return undefined; }
}

export function readDraftPreviewReceipts(raw: string | null): DraftPreviewReceipt[] {
	try {
		const data: unknown = JSON.parse(raw ?? "[]");
		return Array.isArray(data) ? data.filter((entry): entry is DraftPreviewReceipt =>
			typeof entry?.identity === "string" && submittedTemplate(entry.identity) !== undefined &&
			typeof entry?.batchId === "string" && /^[a-zA-Z0-9_-]+$/.test(entry.batchId),
		).slice(-10) : [];
	} catch { return []; }
}

export function rememberDraftPreview(receipts: DraftPreviewReceipt[], receipt: DraftPreviewReceipt): DraftPreviewReceipt[] {
	return [...receipts.filter((entry) => entry.identity !== receipt.identity), receipt].slice(-10);
}

export function draftPreviewIsCurrent(receipt: DraftPreviewReceipt | undefined, identity: string, templateSnapshot: string): boolean {
	return !!receipt && !!identity && receipt.identity === identity &&
		JSON.stringify(submittedTemplate(identity)) === templateSnapshot;
}

export function draftPreviewAspectRatio(receipt: DraftPreviewReceipt): string | undefined {
	const template = submittedTemplate(receipt.identity) as { canvas?: { width?: number; height?: number } } | undefined;
	const { width, height } = template?.canvas ?? {};
	return typeof width === "number" && width > 0 && typeof height === "number" && height > 0
		? `${width}/${height}` : undefined;
}
