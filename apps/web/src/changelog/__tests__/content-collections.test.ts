import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createBuilder } from "@content-collections/core";
import { expect, test } from "bun:test";

test("publishes the current package version through the generated changelog collection", async () => {
	const rootManifest = JSON.parse(
		await readFile(
			new URL("../../../../../package.json", import.meta.url),
			"utf8",
		),
	) as { version: string };
	const generatedRoot = fileURLToPath(
		new URL("../../../.content-collections/", import.meta.url),
	);
	await mkdir(generatedRoot, { recursive: true });
	const temporaryRoot = await mkdtemp(join(generatedRoot, "test-"));
	const outputDirectory = join(temporaryRoot, "generated");

	try {
		const builder = await createBuilder(
			fileURLToPath(new URL("../../../content-collections.ts", import.meta.url)),
			{
				configName: "content-collections",
				cacheDir: join(temporaryRoot, "cache"),
				outputDir: outputDirectory,
			},
		);
		await builder.build();

		const generated = (await import(
			`${pathToFileURL(join(outputDirectory, "allChangelogs.js")).href}?test=${Date.now()}`
		)).default as Array<{ published?: boolean; version: string }>;
		const publishedVersions = generated
			.filter((entry) => entry.published !== false)
			.map((entry) => entry.version);

		expect(publishedVersions).toEqual([rootManifest.version]);
	} finally {
		await rm(temporaryRoot, { recursive: true, force: true });
	}
});
