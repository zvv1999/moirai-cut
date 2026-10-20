import {trialTransformFields} from "./trial-transform";
import {trialLayoutFields} from "./trial-layout";
// Browser-only navigation memory. Rust still validates the resulting application.
const fields = [...trialLayoutFields, ...trialTransformFields, "captionWidth", "minDisplaySeconds", "textWidths", "videoX", "videoY", "videoWidth", "videoHeight", "blurredBackground", "intents", "inputs", "styles", "applicationContext"];
const key = (assetId: string) => `moirai.style.trial-application.v1:${assetId}`;
function applicationParams(source: URLSearchParams) {
	const result = new URLSearchParams();
	for (const field of fields) {
		const value = source.get(field);
		if (value !== null) result.set(field, value);
	}
	return result;
}
export function rememberTrialApplication(assetId: string, query: URLSearchParams): boolean {
	try { sessionStorage.setItem(key(assetId), applicationParams(query).toString()); return true; }
	catch { return false; }
}
export function trialHref(assetId: string, revision: number): string {
	const query = new URLSearchParams({revision: String(revision)});
	try {
		const saved = sessionStorage.getItem(key(assetId));
		if (saved) for (const [name, value] of applicationParams(new URLSearchParams(saved))) query.set(name, value);
	} catch { /* A fresh trial remains available without session storage. */ }
	return `/templates/effects/${encodeURIComponent(assetId)}/try?${query}`;
}
