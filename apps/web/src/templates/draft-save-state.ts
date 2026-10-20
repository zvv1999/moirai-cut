// Reconcile an asynchronous save receipt with the editor state that exists now.
export function reconcileDraftSave<T extends { id: string; revision: number }>({
	submitted, submittedJson, current, currentJson, jsonPending, saved,
}: {
	submitted: T;
	submittedJson: string;
	current: T | null;
	currentJson: string;
	jsonPending: boolean;
	saved: T;
}) {
	if (!current || current.id !== submitted.id) return null;
	const dirty = current !== submitted || currentJson !== submittedJson;
	// A JSON save may create another template. Its revision must not rebase edits to the old one.
	if (dirty && saved.id !== submitted.id) return null;
	const draft = dirty ? { ...current, revision: saved.revision } : saved;
	return {
		draft,
		baseRevision: saved.revision,
		dirty,
		jsonPending: dirty && jsonPending,
		jsonText: dirty && jsonPending ? currentJson : JSON.stringify(draft, null, 2),
	};
}
