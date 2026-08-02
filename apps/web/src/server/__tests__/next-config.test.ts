import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import nextConfig from "../../../next.config";

describe("Next.js development origins", () => {
	it("allows the 127.0.0.1 editor URL used by the in-app browser", async () => {
		const resolvedConfig = await nextConfig;
		expect(resolvedConfig.allowedDevOrigins).toContain("127.0.0.1");
	});

	it("marks every dynamic media probe path as a runtime-only path", () => {
		const source = readFileSync(
			fileURLToPath(new URL("../media-probe.ts", import.meta.url)),
			"utf8",
		);
		const unboundedJoins = source.match(
			/path\.join\((?!\/\*turbopackIgnore: true\*\/)/g,
		);

		expect(unboundedJoins).toBeNull();
	});

	it("suppresses only the known runtime-media NFT warning", async () => {
		const resolvedConfig = await nextConfig;
		expect(resolvedConfig.turbopack?.ignoreIssue).toEqual([
			{
				path: "**/next.config.ts",
				title: "Encountered unexpected file in NFT list",
			},
		]);
	});
});
