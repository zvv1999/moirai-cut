import { expect, test } from "bun:test";
import { draftPreviewAspectRatio, draftPreviewIsCurrent, readDraftPreviewReceipts, rememberDraftPreview } from "./draft-preview-state";

function submission() {
	return {
		previewOnly: true, name: "预览", brief: "测试",
		designs: [{ template: { id: "template-a", revision: 2, canvas: { width: 1080, height: 1920 } }, baseRevision: 2 }],
		samples: ["input-a", "input-b"].map((inputId) => ({
			inputId, title: inputId, transcriptRevision: 1,
			semanticUnits: [{ startWord: 0, endWord: 4, keyword: { startWord: 1, endWord: 2 } }],
			captionSpans: [{ startWord: 0, endWord: 4 }],
			resourceBindings: [{ slotId: "icon", assetId: "asset-a", enabled: true }],
			designResourceBindings: { "template-a": [{ slotId: "image", assetId: "asset-b", enabled: true }] },
			translations: ["translation"], events: [{ id: "beat", start: 1 }], soundEvents: [],
			layoutPhrases: [], focalPoint: { x: 0.5, y: 0.5 },
		})),
	};
}

test("changing any submitted input invalidates the displayed preview, including a non-active second input", () => {
	const original = submission();
	const identity = JSON.stringify(original);
	const receipt = { identity, batchId: "production-first" };
	const template = JSON.stringify(original.designs[0].template);
	expect(draftPreviewIsCurrent(receipt, identity, template)).toBe(true);
	const changedValues = [
		{ inputId: "input-replacement" }, { title: "改过的文案" }, { transcriptRevision: 2 },
		{ semanticUnits: [{ startWord: 0, endWord: 4, keyword: { startWord: 2, endWord: 3 } }] },
		{ captionSpans: [{ startWord: 0, endWord: 2 }, { startWord: 2, endWord: 4 }] },
		{ resourceBindings: [{ slotId: "icon", assetId: "asset-other", enabled: true }] },
		{ designResourceBindings: { "template-a": [{ slotId: "image", assetId: "asset-b", enabled: false }] } },
		{ translations: ["another translation"] }, { events: [{ id: "beat", start: 2 }] },
		{ focalPoint: { x: 0.2, y: 0.8 } },
	];
	for (const change of changedValues) {
		const updated = submission();
		Object.assign(updated.samples[1], change);
		expect(draftPreviewIsCurrent(receipt, JSON.stringify(updated), template)).toBe(false);
	}
	const removed = submission(); removed.samples.pop();
	expect(draftPreviewIsCurrent(receipt, JSON.stringify(removed), template)).toBe(false);
});

test("new template props invalidate old completion before the form identity effect runs", () => {
	const original = submission(), identity = JSON.stringify(original);
	const receipt = { identity, batchId: "production-first" };
	const changedTemplate = { ...original.designs[0].template, revision: 3 };
	expect(draftPreviewIsCurrent(receipt, identity, JSON.stringify(changedTemplate))).toBe(false);
	expect(draftPreviewIsCurrent(receipt, "", JSON.stringify(original.designs[0].template))).toBe(false);
	expect(draftPreviewIsCurrent(undefined, identity, JSON.stringify(original.designs[0].template))).toBe(false);
});

test("late submissions retain their captured identity and never become the current result", () => {
	const original = submission(), identity = JSON.stringify(original);
	const updated = submission(); updated.samples[0].title = "修改后的内容";
	const currentIdentity = JSON.stringify(updated);
	const lateReceipt = { identity, batchId: "production-late" };
	const saved = rememberDraftPreview([{ identity: currentIdentity, batchId: "production-current" }], lateReceipt);
	expect(draftPreviewIsCurrent(lateReceipt, currentIdentity, JSON.stringify(updated.designs[0].template))).toBe(false);
	expect(saved.find((entry) => entry.identity === currentIdentity)?.batchId).toBe("production-current");
	expect(saved.find((entry) => entry.identity === identity)?.batchId).toBe("production-late");
	expect(readDraftPreviewReceipts(JSON.stringify(saved))).toEqual(saved);
});

test("template-only historical receipts and malformed browser state cannot authenticate previews", () => {
	for (const raw of ["not-json", "null", "{}", JSON.stringify([{ snapshot: "template", batchId: "production-old" }]), JSON.stringify([{ identity: "{}", batchId: "production-old" }])]) {
		expect(readDraftPreviewReceipts(raw)).toEqual([]);
	}
	const identity = JSON.stringify(submission());
	expect(readDraftPreviewReceipts(JSON.stringify([{ identity, batchId: "../../bad" }]))).toEqual([]);
	expect(readDraftPreviewReceipts(JSON.stringify([{ identity, batchId: "production-valid" }]))).toHaveLength(1);
});

test("historical video geometry remains tied to its submitted template", () => {
	const receipt = { identity: JSON.stringify(submission()), batchId: "production-portrait" };
	expect(draftPreviewAspectRatio(receipt)).toBe("1080/1920");
	const replacement = submission(); replacement.designs[0].template.canvas = { width: 1920, height: 1080 };
	expect(draftPreviewIsCurrent(receipt, JSON.stringify(replacement), JSON.stringify(replacement.designs[0].template))).toBe(false);
	expect(draftPreviewAspectRatio(receipt)).toBe("1080/1920");
});
