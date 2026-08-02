#!/usr/bin/env bun

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { sha256File } from "./release-tools.mjs";

const rootDir = resolve(import.meta.dir, "../..");
const manifest = await Bun.file(resolve(rootDir, "package.json")).json();
const outputPath = resolve(
	rootDir,
	process.argv[2] ?? `artifacts/release/moirai-cut-v${manifest.version}-source.tar.gz`,
);
await mkdir(dirname(outputPath), { recursive: true });
await Bun.$`git archive --worktree-attributes --format=tar.gz --prefix=${`moirai-cut-v${manifest.version}/`} --output=${outputPath} HEAD`.cwd(
	rootDir,
);
const digest = await sha256File(outputPath);
await writeFile(`${outputPath}.sha256`, `${digest}  ${outputPath.split("/").at(-1)}\n`);
console.log(`Source archive: ${outputPath}`);
console.log(`SHA-256: ${digest}`);
