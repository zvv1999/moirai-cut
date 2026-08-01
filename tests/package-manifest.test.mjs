import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

const manifest = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

describe("root package manifest", () => {
	test("does not install the repository root as its own dependency", () => {
		const dependencySections = [
			manifest.dependencies ?? {},
			manifest.devDependencies ?? {},
			manifest.optionalDependencies ?? {},
		];
		const localRootReferences = dependencySections.flatMap((dependencies) =>
			Object.entries(dependencies).filter(
				([name, version]) =>
					name === manifest.name || version === "." || version === "file:.",
			),
		);

		expect(localRootReferences).toEqual([]);
	});
});
