import { expect, test } from "bun:test";
import { reconcileDraftSave } from "./draft-save-state";

const initial = { id: "template-a", revision: 4, name: "Original" };
const submittedJson = JSON.stringify(initial, null, 2);
const saved = { ...initial, revision: 5 };

test("a delayed save preserves later property edits and rebases the next save", async () => {
	let finish!: (value: typeof saved) => void;
	const response = new Promise<typeof saved>((resolve) => { finish = resolve; });
	let current = initial;
	let currentJson = submittedJson;
	const pending = response.then((saved) => reconcileDraftSave({ submitted: initial, submittedJson, current, currentJson, jsonPending: false, saved }));
	current = { ...initial, name: "Edited while saving" };
	currentJson = JSON.stringify(current, null, 2);
	finish(saved);
	const result = await pending;
	expect(result?.draft.name).toBe("Edited while saving");
	expect(result?.baseRevision).toBe(5);
	expect(result?.dirty).toBe(true);
	expect(JSON.parse(result!.jsonText).revision).toBe(5);
	expect(initial.name).toBe("Original");
	const next = reconcileDraftSave({ submitted: result!.draft, submittedJson: result!.jsonText, current: result!.draft, currentJson: result!.jsonText, jsonPending: false, saved: { ...result!.draft, revision: 6 } });
	expect(next?.dirty).toBe(false);
	expect(next?.draft).toEqual({ id: "template-a", revision: 6, name: "Edited while saving" });
});

test("unfinished JSON typed during save is preserved verbatim", () => {
	const currentJson = '{"name": "unfinished';
	const result = reconcileDraftSave({ submitted: initial, submittedJson, current: initial, currentJson, jsonPending: true, saved });
	expect(result?.jsonText).toBe(currentJson);
	expect(result?.jsonPending).toBe(true);
	expect(result?.dirty).toBe(true);
	expect(result?.baseRevision).toBe(5);
});

test("a successful unchanged JSON submission clears pending edits", () => {
	const result = reconcileDraftSave({ submitted: initial, submittedJson, current: initial, currentJson: submittedJson, jsonPending: true, saved });
	expect(result?.dirty).toBe(false);
	expect(result?.jsonPending).toBe(false);
	expect(result?.draft).toEqual(saved);
});

test("receipts cannot overwrite another draft or rebase its revision", () => {
	for (const current of [null, { ...initial, id: "template-b" }]) {
		expect(reconcileDraftSave({ submitted: initial, submittedJson, current, currentJson: submittedJson, jsonPending: false, saved })).toBeNull();
	}
	expect(reconcileDraftSave({ submitted: initial, submittedJson, current: { ...initial, name: "Later" }, currentJson: submittedJson, jsonPending: false, saved: { ...saved, id: "template-copy" } })).toBeNull();
});
