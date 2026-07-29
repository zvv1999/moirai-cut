import { describe, expect, test } from "bun:test";
import { CodexSseDecoder } from "@/agent/codex-sse";

describe("Codex SSE decoder", () => {
	test("reassembles JSON events split across arbitrary network chunks", () => {
		const decoder = new CodexSseDecoder();

		expect(decoder.push("event: session\ndata: {\"sessionId\":\"thread")).toEqual(
			[],
		);
		expect(
			decoder.push(
				'-1"}\n\nevent: delta\r\ndata: {"delta":"你"}\r\n\r\nevent: del',
			),
		).toEqual([
			{ event: "session", data: '{"sessionId":"thread-1"}' },
			{ event: "delta", data: '{"delta":"你"}' },
		]);
		expect(decoder.push('ta\ndata: {"delta":"好"}\n\n')).toEqual([
			{ event: "delta", data: '{"delta":"好"}' },
		]);
	});

	test("ignores heartbeat comments and joins multiline data", () => {
		const decoder = new CodexSseDecoder();

		expect(
			decoder.push(": connected\n\nevent: error\ndata: line 1\ndata: line 2\n\n"),
		).toEqual([{ event: "error", data: "line 1\nline 2" }]);
	});
});
