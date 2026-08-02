import { describe, expect, test } from "bun:test";

import {
	buildCycloneDx,
	findSensitiveTrackedPaths,
	isPublicSnapshotPath,
	parseBunList,
	parseCargoPackages,
} from "../release-tools.mjs";

describe("release tooling", () => {
	test("turns Bun and Cargo dependency data into a deterministic CycloneDX document", () => {
		const document = buildCycloneDx({
			root: { name: "moirai-cut", version: "0.1.0" },
			bunTree: {
				name: "moirai-cut",
				version: "0.1.0",
				dependencies: {
					next: { version: "16.2.12", dependencies: {} },
				},
			},
			cargoPackages: [
				{ name: "serde", version: "1.0.228", checksum: "abc123" },
			],
			serialNumber: "urn:uuid:00000000-0000-4000-8000-000000000000",
			timestamp: "2026-08-02T00:00:00.000Z",
		});

		expect(document.bomFormat).toBe("CycloneDX");
		expect(document.specVersion).toBe("1.5");
		expect(document.metadata.component.name).toBe("moirai-cut");
		expect(document.components.map((component) => component.purl)).toEqual([
			"pkg:cargo/serde@1.0.228",
			"pkg:npm/next@16.2.12",
		]);
		expect(document.components[0].hashes).toEqual([
			{ alg: "SHA-256", content: "abc123" },
		]);
	});

	test("parses package records from Cargo.lock", () => {
		const packages = parseCargoPackages(`
[[package]]
name = "serde"
version = "1.0.228"
checksum = "abc123"

[[package]]
name = "workspace-only"
version = "0.1.0"
`);

		expect(packages).toEqual([
			{ name: "serde", version: "1.0.228", checksum: "abc123" },
			{ name: "workspace-only", version: "0.1.0" },
		]);
	});

	test("parses Bun's tree output without duplicating versions in package URLs", () => {
		const bunTree = parseBunList(`
├── next@16.2.12
└── @modelcontextprotocol/sdk@1.30.0
`);
		const document = buildCycloneDx({
			root: { name: "moirai-cut", version: "0.1.0" },
			bunTree,
			cargoPackages: [],
		});

		expect(document.components.map((component) => component.purl)).toEqual([
			"pkg:npm/%40modelcontextprotocol/sdk@1.30.0",
			"pkg:npm/next@16.2.12",
		]);
	});

	test("flags private release inputs without echoing their contents", () => {
		expect(
			findSensitiveTrackedPaths([
				"README.md",
				".env",
				"docs/reports/editor/frame.png",
				"fixtures/example.env.example",
				"keys/release.pem",
			]),
		).toEqual([
			{ path: ".env", reason: "environment file" },
			{
				path: "docs/reports/editor/frame.png",
				reason: "private acceptance-report media",
			},
			{ path: "keys/release.pem", reason: "private key or certificate" },
		]);
	});

	test("keeps source files while excluding private and generated snapshot inputs", () => {
		expect(
			[
				"README.md",
				"apps/web/src/app.tsx",
				"docs/reports/editor/frame.png",
				"director-agent/private-plan.md",
				"artifacts/sbom.json",
				".codex/config.toml",
			].filter(isPublicSnapshotPath),
		).toEqual([
			"README.md",
			"apps/web/src/app.tsx",
			".codex/config.toml",
		]);
	});
});
