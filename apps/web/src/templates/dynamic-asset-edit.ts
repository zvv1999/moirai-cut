/** Keep asynchronous native layer edits from replacing newer local draft changes. */
export async function requestDynamicAssetLayerEdit<T>({ api, definition, operation, current }: {
	api: <R>(path: string, body?: unknown) => Promise<R>;
	definition: T;
	operation: object;
	current: () => T | null;
}) {
	const snapshot = JSON.stringify(definition);
	const result = await api<{ definition: T; selectedLayerId: string }>("/dynamic-assets/layers", { definition, operation });
	if (JSON.stringify(current()) !== snapshot) {
		throw new Error("样式草稿已变化，已保留当前修改；请重新应用图层操作。");
	}
	return result;
}
