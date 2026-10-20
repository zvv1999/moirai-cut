import type { AgentExportQuality } from "@/export";

const endpoint = "/api/footage/exports/audio";

export async function checkNativeAudioEncoder(
	signal: AbortSignal,
): Promise<void> {
	const response = await fetch(endpoint, { signal });
	if (!response.ok) {
		throw new Error("MP4 音频导出需要本地素材服务，请检查服务是否已启动。");
	}
}

export async function finalizeNativeAudio({
	buffer,
	quality,
	bitrate,
	signal,
}: {
	buffer: ArrayBuffer;
	quality: AgentExportQuality;
	bitrate?: number;
	signal: AbortSignal;
}): Promise<ArrayBuffer> {
	const query = new URLSearchParams({ quality });
	if (bitrate !== undefined) query.set("bitrate", String(bitrate));
	const response = await fetch(`${endpoint}?${query}`, {
		method: "POST",
		headers: {
			"content-type": "video/quicktime",
			"x-requested-with": "moirai-footage",
		},
		body: buffer,
		signal,
	});
	if (!response.ok) {
		const detail = await response.json().catch(() => null);
		throw new Error(detail?.error ?? "本地 AAC 编码失败");
	}
	return response.arrayBuffer();
}
