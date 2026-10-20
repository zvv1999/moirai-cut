import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SampleContent } from "./sample-content";
import type { TrialContentSnapshot } from "./production-create";
import { trialContentWithNativeSegments, type TrialContentValidation } from "./trial-content-snapshot";

const words = [{text: "第一句", start: 0, end: 1}, {text: "第二句", start: 1, end: 2}];
const units = [
	{startWord: 0, endWord: 1, keyword: null, intent: "explain", rationale: "native segmentation"},
	{startWord: 1, endWord: 2, keyword: null, intent: "emphasis", rationale: "native segmentation"},
];
function snapshot(): TrialContentSnapshot {
	return {version: 1, sourceTemplateId: "style-a", liveInputId: "input-a", entries: [
		{inputId: "input-a", title: "未分段的口播", transcriptRevision: 3, semanticUnits: [], captionSpans: null, events: [], translations: [], resourceBindings: []},
	]};
}
const validation: TrialContentValidation = {samples: [{inputId: "input-a", plan: {semanticUnits: units}}]};

test("restored empty segments expose the exact native diagnostic destination in the keyword editor", () => {
	const saved = snapshot(), before = JSON.stringify(saved);
	const restored = trialContentWithNativeSegments(saved, validation);
	const html = renderToStaticMarkup(<SampleContent words={words} units={restored.entries[0].semanticUnits} onChange={() => {}} onBusyChange={() => {}} focusRequest={{semanticIndex: 1, requestId: 1}}/>);
	expect(html).toContain("内容重点 · 2 段");
	expect(html).toContain('aria-label="第2段第1词 第二句"');
	expect(restored.entries[0].semanticUnits).toEqual(units);
	expect(restored.entries[0].captionSpans).toBeNull();
	expect(JSON.stringify(saved)).toBe(before);
});

test("multiple restored inputs match native plans by input identity, never response position", () => {
	const saved = snapshot();
	saved.entries.push({...saved.entries[0], inputId: "input-b", title: "另一声音"});
	const otherUnits = [{...units[0], endWord: 2, rationale: "other native segmentation"}];
	const restored = trialContentWithNativeSegments(saved, {samples: [
		{inputId: "input-b", plan: {semanticUnits: otherUnits}}, ...validation.samples,
	]});
	expect(restored.entries[0].semanticUnits).toEqual(units);
	expect(restored.entries[1].semanticUnits).toEqual(otherUnits);
});

test("explicit marked segments and event-only inputs are restored without replacing recorded content", () => {
	const marked = snapshot();
	marked.entries[0].semanticUnits = [{...units[0], keyword: {startWord: 0, endWord: 1}, rationale: "人工选择"}];
	const restored = trialContentWithNativeSegments(marked, validation);
	expect(restored.entries[0]).toBe(marked.entries[0]);
	const eventsOnly = snapshot(); eventsOnly.entries[0].transcriptRevision = null;
	const eventsRestored = trialContentWithNativeSegments(eventsOnly, validation);
	expect(eventsRestored.entries[0]).toBe(eventsOnly.entries[0]);
	expect(eventsRestored.entries[0].semanticUnits).toEqual([]);
	expect(trialContentWithNativeSegments({...snapshot(), entries: []}, {samples: []}).entries).toEqual([]);
});

test("missing or ambiguous native segment responses fail before mutating saved content", () => {
	const saved = snapshot(), before = JSON.stringify(saved);
	for (const result of [
		{samples: []},
		{samples: [{inputId: "input-other", plan: {semanticUnits: units}}]},
		{samples: [...validation.samples, ...validation.samples]},
	]) expect(() => trialContentWithNativeSegments(saved, result)).toThrow("当前内容未被替换");
	expect(JSON.stringify(saved)).toBe(before);
});
