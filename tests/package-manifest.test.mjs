import { existsSync, readFileSync } from "node:fs";

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
const desktopManifestSource = readFileSync(
	new URL("../apps/desktop/Cargo.toml", import.meta.url),
	"utf8",
);
const interchangeManifestSource = readFileSync(
	new URL("../rust/crates/interchange/Cargo.toml", import.meta.url),
	"utf8",
);
const mediaTimeManifestSource = readFileSync(
	new URL("../rust/crates/time/Cargo.toml", import.meta.url),
	"utf8",
);
const wasmManifestSource = readFileSync(
	new URL("../rust/wasm/Cargo.toml", import.meta.url),
	"utf8",
);
const cargoLockSource = readFileSync(
	new URL("../Cargo.lock", import.meta.url),
	"utf8",
);
const bunLockSource = readFileSync(
	new URL("../bun.lock", import.meta.url),
	"utf8",
);
const readmeSource = readFileSync(
	new URL("../README.md", import.meta.url),
	"utf8",
);
const changelogSource = readFileSync(
	new URL("../CHANGELOG.md", import.meta.url),
	"utf8",
);
const releaseWorkflowSource = readFileSync(
	new URL("../.github/workflows/release-readiness.yml", import.meta.url),
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
		expect(webManifest.scripts.typecheck).toContain("--incremental false");
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

	test("gives the local media-time crate an unambiguous package identity", () => {
		expect(mediaTimeManifestSource).toContain('name = "moirai-time"');
		expect(interchangeManifestSource).toContain("moirai-time = {");
		expect(wasmManifestSource).toContain("moirai-time = {");
	});

	test("keeps every public release surface on one version", () => {
		const version = manifest.version;
		const escapedVersion = version.replaceAll(".", "\\.");
		const webEntry = new URL(
			`../apps/web/src/changelog/entries/${version}.md`,
			import.meta.url,
		);

		expect(webManifest.version).toBe(version);
		expect(mcpManifest.version).toBe(version);
		expect(desktopManifestSource).toMatch(
			new RegExp(`name = "moirai-cut-desktop"[\\s\\S]*?version = "${escapedVersion}"`),
		);
		expect(cargoLockSource).toMatch(
			new RegExp(`name = "moirai-cut-desktop"\\nversion = "${escapedVersion}"`),
		);
		expect(bunLockSource).toMatch(
			new RegExp(`"name": "@moirai-cut/mcp",\\n\\s+"version": "${escapedVersion}"`),
		);
		expect(bunLockSource).toMatch(
			new RegExp(`"name": "@moirai-cut/web",\\n\\s+"version": "${escapedVersion}"`),
		);
		expect(readmeSource).toContain(`v${version} Public Preview`);
		expect(changelogSource).toContain(`## ${version} —`);
		expect(existsSync(webEntry)).toBe(true);
		if (existsSync(webEntry)) {
			const entry = readFileSync(webEntry, "utf8");
			expect(entry).toContain(`version: "${version}"`);
			expect(entry).toContain("published: true");
		}
	});

	test("rejects a release tag that disagrees with package metadata", () => {
		expect(releaseWorkflowSource).toContain("Verify release version");
		expect(releaseWorkflowSource).toContain("GITHUB_REF_NAME");
		expect(releaseWorkflowSource).toContain("package.json");
	});
});
