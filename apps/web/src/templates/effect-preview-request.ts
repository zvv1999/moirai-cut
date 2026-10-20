type EffectPreviewRequest = {
	kind: "template" | "definition";
	snapshot: string;
	sampleSnapshot: string;
	duration: number;
	text: string;
	keyword: string;
	keywordOccurrence: number;
	intent: string;
	phraseSnapshot: string;
};

/** UI request identity, including inputs that can change without editing a style. */
export function effectPreviewRequestKey(request: EffectPreviewRequest): string {
	return JSON.stringify([
		request.kind, request.snapshot, request.sampleSnapshot, request.duration,
		request.text, request.keyword, request.keywordOccurrence, request.intent,
		request.phraseSnapshot,
	]);
}

export type EffectPreviewResponse<T> = { requestKey: string; preview: T };

/** Reject old frames and diagnostics synchronously, before the next effect runs. */
export function currentEffectPreview<T>(response: EffectPreviewResponse<T> | undefined, requestKey: string): T | undefined {
	return response?.requestKey === requestKey ? response.preview : undefined;
}
