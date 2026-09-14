import {
	ALL_FORMATS,
	BufferTarget,
	Conversion,
	Input,
	Mp4OutputFormat,
	Output,
	UrlSource,
} from "mediabunny";

export async function trimmedPreview(
	src: string,
	start: number,
	end: number,
	signal: AbortSignal,
) {
	const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(src) });
	let conversion: Conversion | undefined;
	const cancel = () => {
		void conversion?.cancel();
	};
	signal.addEventListener("abort", cancel);
	try {
		const target = new BufferTarget();
		const output = new Output({ format: new Mp4OutputFormat(), target });
		conversion = await Conversion.init({ input, output, trim: { start, end } });
		signal.throwIfAborted();
		if (!conversion.isValid) throw new Error("当前浏览器无法生成裁剪预览");
		await conversion.execute();
		signal.throwIfAborted();
		if (!target.buffer) throw new Error("裁剪预览生成失败");
		return URL.createObjectURL(
			new Blob([target.buffer], { type: "video/mp4" }),
		);
	} finally {
		signal.removeEventListener("abort", cancel);
		input.dispose();
	}
}
