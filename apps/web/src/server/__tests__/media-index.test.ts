import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mutateMediaIndex, readMediaIndex } from "@/server/media-index";

async function fixture() {
	const directory = await mkdtemp(path.join(tmpdir(), "opencut-media-index-"));
	await mkdir(directory, { recursive: true });
	await writeFile(
		path.join(directory, "index.json"),
		JSON.stringify({ source: { ext: "mp4" } }),
	);
	return directory;
}

describe("shared media index transactions", () => {
	test("serializes read-modify-write updates for one directory", async () => {
		const directory = await fixture();
		await Promise.all([
			mutateMediaIndex({
				directory,
				update: async (index) => {
					await Bun.sleep(15);
					index.first = { ext: "mp4" };
				},
			}),
			mutateMediaIndex({
				directory,
				update: (index) => {
					index.second = { ext: "mov" };
				},
			}),
		]);

		const index = JSON.parse(
			await readFile(path.join(directory, "index.json"), "utf8"),
		);
		expect(index).toMatchObject({
			source: { ext: "mp4" },
			first: { ext: "mp4" },
			second: { ext: "mov" },
		});
	});

	test("continues the queue after a failed mutation", async () => {
		const directory = await fixture();
		await expect(
			mutateMediaIndex({
				directory,
				update: () => {
					throw new Error("expected failure");
				},
			}),
		).rejects.toThrow("expected failure");
		await mutateMediaIndex({
			directory,
			update: (index) => {
				index.recovered = { ext: "mp4" };
			},
		});
		expect((await readMediaIndex({ directory })).recovered).toEqual({
			ext: "mp4",
		});
	});

	test("rejects invalid entries instead of dropping them during a later write", async () => {
		const directory = await fixture();
		await writeFile(
			path.join(directory, "index.json"),
			JSON.stringify({ source: { name: "missing extension" } }),
		);
		await expect(readMediaIndex({ directory })).rejects.toThrow(
			"Invalid media index entry",
		);
	});
});
