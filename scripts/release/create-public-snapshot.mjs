#!/usr/bin/env bun

import { cp, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { isPublicSnapshotPath } from "./release-tools.mjs";

const rootDir = resolve(import.meta.dir, "../..");
const targetDir = resolve(
	rootDir,
	process.argv[2] ?? "../moirai-cut-public-snapshot",
);

try {
	await stat(targetDir);
	console.error(`Refusing to overwrite existing snapshot: ${targetDir}`);
	process.exit(1);
} catch (error) {
	if (error?.code !== "ENOENT") throw error;
}

const indexedPaths = (await Bun.$`git ls-files -z --cached --others --exclude-standard`.cwd(rootDir).text())
	.split("\0")
	.filter(Boolean)
	.filter(isPublicSnapshotPath);

const paths = [];
for (const candidate of indexedPaths) {
	try {
		await stat(resolve(rootDir, candidate));
		paths.push(candidate);
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}
}

await mkdir(targetDir, { recursive: true });
for (const path of paths) {
	const source = resolve(rootDir, path);
	const destination = resolve(targetDir, path);
	await mkdir(dirname(destination), { recursive: true });
	await cp(source, destination, {
		force: false,
		preserveTimestamps: true,
		recursive: true,
	});
}

await Bun.$`git init -b main`.cwd(targetDir);
await Bun.$`git add --all`.cwd(targetDir);
await Bun.$`git -c ${"user.name=Moirai Cut Release"} -c user.email=noreply@moirai-cut.local commit -m ${"chore: prepare Moirai Cut public source snapshot"}`.cwd(
	targetDir,
);
await Bun.$`bun scripts/release/check-public-tree.mjs`.cwd(targetDir);
const commit = (await Bun.$`git rev-parse HEAD`.cwd(targetDir).text()).trim();

console.log(`Public snapshot: ${targetDir}`);
console.log(`Files: ${paths.length}`);
console.log(`Root commit: ${commit}`);
