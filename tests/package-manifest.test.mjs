import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

const manifest = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const webManifest = JSON.parse(
	readFileSync(new URL("../apps/web/package.json", import.meta.url), "utf8"),
);
const mcpManifest = JSON.parse(
	readFileSync(new URL("../apps/mcp/package.json", import.meta.url), "utf8"),
);
const eslintRuleTestSource = readFileSync(
	new URL(
		"../eslint/rules/__tests__/prefer-object-params.test.mjs",
		import.meta.url,
	),
	"utf8",
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

	test("runs Turbo scripts with Bun's native architecture", () => {
		const nodeDispatchedTurboScripts = Object.entries(
			manifest.scripts ?? {},
		).filter(([, command]) => command.startsWith("turbo "));

		expect(nodeDispatchedTurboScripts).toEqual([]);
	});

	test("generates clean-clone content types before TypeScript validation", () => {
		expect(webManifest.scripts.typecheck).toContain("next typegen");
		expect(webManifest.scripts.typecheck).toContain("tsc --noEmit");
	});

	test("uses the Moirai Cut public package identity", () => {
		expect(manifest.name).toBe("moirai-cut");
		expect(webManifest.name).toBe("@moirai-cut/web");
		expect(manifest.description).toContain("visible, editable loop");
	});

	test("lets Node discover MCP tests portably instead of passing a directory", () => {
		expect(mcpManifest.scripts.test).toBe("node --test");
	});

	test("does not eagerly read Bun's disabled it.only hook in CI", () => {
		expect(eslintRuleTestSource).not.toContain(
			"RuleTester.itOnly = it.only;",
		);
	});

	test("pins transitive dependencies at their audited security floors", () => {
		expect(manifest.overrides).toMatchObject({
			"brace-expansion": "2.1.4",
			"fast-uri": "3.1.5",
			hono: "4.13.0",
			undici: "7.29.0",
		});
	});
});
