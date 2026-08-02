#!/usr/bin/env bun

import { resolve } from "node:path";

import { writeSbom } from "./release-tools.mjs";

const rootDir = resolve(import.meta.dir, "../..");
const outputPath = resolve(
	rootDir,
	process.argv[2] ?? "artifacts/sbom/moirai-cut.cdx.json",
);
const result = await writeSbom({ rootDir, outputPath });

console.log(`SBOM: ${result.outputPath} (${result.components} components)`);
