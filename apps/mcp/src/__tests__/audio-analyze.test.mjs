import { strict as assert } from "node:assert";
import test from "node:test";
import { createServer } from "node:http";
import { analyzeAudio } from "../audio-analyze.mjs";

// A fresh checkout compiles the Rust analysis helper on its first invocation.
test(
	"FFmpeg to Rust returns source-time pulse candidates and preserves silence analysis",
	{ timeout: 120_000 },
	async () => {
		const rate = 8000,
			duration = 4,
			count = rate * duration;
		const wav = Buffer.alloc(44 + count * 2);
		wav.write("RIFF", 0);
		wav.writeUInt32LE(36 + count * 2, 4);
		wav.write("WAVEfmt ", 8);
		wav.writeUInt32LE(16, 16);
		wav.writeUInt16LE(1, 20);
		wav.writeUInt16LE(1, 22);
		wav.writeUInt32LE(rate, 24);
		wav.writeUInt32LE(rate * 2, 28);
		wav.writeUInt16LE(2, 32);
		wav.writeUInt16LE(16, 34);
		wav.write("data", 36);
		wav.writeUInt32LE(count * 2, 40);
		for (let i = 0; i < count; i++) {
			const time = i / rate;
			const value =
				time >= 0.5 && time % 0.5 < 0.04
					? Math.sin(2 * Math.PI * 440 * time) * 16000
					: 0;
			wav.writeInt16LE(Math.round(value), 44 + i * 2);
		}
		const server = createServer((request, response) => {
			if (request.url === "/api/media/p") {
				response.setHeader("Content-Type", "application/json");
				response.end(
					JSON.stringify({
						assets: {
							pulse: {
								name: "pulse.wav",
								type: "audio",
								hasAudio: true,
								duration,
							},
						},
					}),
				);
			} else {
				response.setHeader("Content-Type", "audio/wav");
				response.setHeader("Content-Length", wav.length);
				response.end(wav);
			}
		});
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		try {
			const result = await analyzeAudio({
				projectId: "p",
				assetId: "pulse",
				base: `http://127.0.0.1:${server.address().port}`,
			});
			assert.equal(result.rhythm.status, "analyzed");
			assert.equal(result.rhythm.estimatedBpm, 120);
			assert.ok(Math.abs(result.rhythm.onsets[0].seconds - 0.5) <= 0.04);
			assert.ok(result.silences.length > 2);
			assert.ok(result.loudness.maxDb < 0);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	},
);
