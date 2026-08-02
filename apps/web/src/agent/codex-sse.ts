export interface CodexSseFrame {
	event: string;
	data: string;
	id?: string;
}

function parseFrame(frame: string): CodexSseFrame | null {
	let event = "message";
	let id: string | undefined;
	const data: string[] = [];
	for (const line of frame.split(/\r?\n/)) {
		if (!line || line.startsWith(":")) continue;
		const separator = line.indexOf(":");
		const field = separator === -1 ? line : line.slice(0, separator);
		const value =
			separator === -1 ? "" : line.slice(separator + 1).replace(/^ /, "");
		if (field === "event") event = value;
		if (field === "data") data.push(value);
		if (field === "id") id = value;
	}
	if (data.length === 0) return null;
	return { event, data: data.join("\n"), ...(id ? { id } : {}) };
}

export class CodexSseDecoder {
	private buffer = "";

	push(chunk: string): CodexSseFrame[] {
		this.buffer += chunk;
		const events: CodexSseFrame[] = [];
		for (;;) {
			const boundary = /\r?\n\r?\n/.exec(this.buffer);
			if (!boundary || boundary.index === undefined) break;
			const frame = this.buffer.slice(0, boundary.index);
			this.buffer = this.buffer.slice(boundary.index + boundary[0].length);
			const event = parseFrame(frame);
			if (event) events.push(event);
		}
		return events;
	}
}
