/** Preserve the native optional boolean through navigation and history. */
export function readTrialBackground(query: URLSearchParams): boolean | undefined {
	const value = query.get("blurredBackground");
	return value === null ? undefined : value === "true";
}

export function writeTrialBackground(query: URLSearchParams, value?: boolean): void {
	if (value === undefined) query.delete("blurredBackground");
	else query.set("blurredBackground", String(value));
}
