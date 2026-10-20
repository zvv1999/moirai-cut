import { expect, test } from "bun:test";
import { currentEffectPreview, effectPreviewRequestKey } from "./effect-preview-request";

const original = {
	kind: "definition" as const,
	snapshot: JSON.stringify({ id: "style", revision: 1 }),
	sampleSnapshot: "null",
	duration: 2,
	text: "让重点表达更清楚",
	keyword: "重点",
	keywordOccurrence: 0,
	intent: "emphasis",
	phraseSnapshot: "[]",
};

test("changing any preview input immediately hides completed frames and diagnostics from the previous request", () => {
	const preview = { generation: "old-frame", exitSampling: { status: "passed" }, warnings: ["old-warning"] };
	const response = { requestKey: effectPreviewRequestKey(original), preview };
	expect(currentEffectPreview(response, effectPreviewRequestKey({ ...original }))).toBe(preview);
	const changes: Partial<Parameters<typeof effectPreviewRequestKey>[0]>[] = [
		{ kind: "template" },
		{ snapshot: JSON.stringify({ id: "style", revision: 2 }) },
		{ sampleSnapshot: JSON.stringify({ projectId: "source", sampleId: "different-voice" }) },
		{ duration: 4 },
		{ text: "新的示例重点" },
		{ keyword: "表达" },
		{ keywordOccurrence: 1 },
		{ intent: "conclusion" },
		{ phraseSnapshot: JSON.stringify([{ wordSpan: { startWord: 0, endWord: 2 } }]) },
	];
	for (const change of changes) {
		// No loading state/effect update is needed to reject the previous response.
		const nextKey = effectPreviewRequestKey({ ...original, ...change });
		expect(currentEffectPreview(response, nextKey)).toBeUndefined();
		const nextPreview = { ...preview, generation: "new-frame" };
		expect(currentEffectPreview({ requestKey: nextKey, preview: nextPreview }, nextKey)).toBe(nextPreview);
	}
});

test("a late response cannot supply current measurements or diagnostics", () => {
	const currentKey = effectPreviewRequestKey({ ...original, duration: 5 });
	const oldKey = effectPreviewRequestKey(original);
	expect(currentEffectPreview(undefined, currentKey)).toBeUndefined();
	expect(currentEffectPreview({ requestKey: oldKey, preview: { editingRegions: ["old"], exitSampling: "old" } }, currentKey)).toBeUndefined();
});
