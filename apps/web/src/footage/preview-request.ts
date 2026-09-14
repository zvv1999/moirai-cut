import { libraryHeaders } from "./library-session";

function waitForRetry(signal: AbortSignal, delay: number) {
	return new Promise<void>((resolve, reject) => {
		signal.throwIfAborted();
		const abort = () => {
			clearTimeout(timer);
			reject(signal.reason);
		};
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", abort);
			resolve();
		}, delay);
		signal.addEventListener("abort", abort, { once: true });
	});
}

export async function requestPreview<T>(
	path: string,
	body: unknown,
	signal: AbortSignal,
): Promise<T> {
	const payload = JSON.stringify(body);
	for (let attempt = 0; ; attempt++) {
		signal.throwIfAborted();
		let response: Response;
		let text: string;
		try {
			response = await fetch(`/api/footage/${path}`, {
				method: "POST",
				signal,
				headers: {
					...libraryHeaders(),
					"content-type": "application/json",
					"x-requested-with": "moirai-footage",
				},
				body: payload,
			});
			text = await response.text();
		} catch {
			signal.throwIfAborted();
			if (attempt >= 2) throw new Error("预览服务连接中断，请重试预览。当前修改已保留。");
			await waitForRetry(signal, 400 * (attempt + 1));
			continue;
		}
		if ([502, 503, 504].includes(response.status) && attempt < 2) {
			await waitForRetry(signal, 400 * (attempt + 1));
			continue;
		}
		let value: T & { error?: string };
		try {
			value = JSON.parse(text);
		} catch {
			if (response.status === 413)
				throw new Error("调色预览数据超出服务限制，请更新素材库服务后重试。当前修改已保留。");
			if (response.status === 422 && text.includes("unknown field"))
				throw new Error("素材库服务版本不匹配，尚不支持当前画面参数，请更新并重启素材库服务。");
			throw new Error(`预览服务返回异常（${response.status}），请重试预览。`);
		}
		if (!response.ok) throw new Error(value?.error ?? `预览请求失败（${response.status}），请重试预览。`);
		if (!value || typeof value !== "object") throw new Error("预览服务返回了无效数据，请重试预览。");
		return value;
	}
}
