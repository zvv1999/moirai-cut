#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { findSensitiveTrackedPaths } from "./release-tools.mjs";

const rootDir = resolve(import.meta.dir, "../..");
const tracked = (await Bun.$`git ls-files -z`.cwd(rootDir).text())
	.split("\0")
	.filter(Boolean);
const attributes = await Bun.$`git check-attr -z export-ignore -- ${tracked}`
	.cwd(rootDir)
	.nothrow()
	.text();
const ignored = new Set();
const attributeParts = attributes.split("\0");
for (let index = 0; index + 2 < attributeParts.length; index += 3) {
	if (attributeParts[index + 1] === "export-ignore" && attributeParts[index + 2] === "set") {
		ignored.add(attributeParts[index]);
	}
}
const publicPaths = tracked.filter((path) => !ignored.has(path));
const sensitivePaths = findSensitiveTrackedPaths(publicPaths);
const highConfidenceSecrets = [];
const secretPatterns = [
	/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
	/\bghp_[A-Za-z0-9]{36,}\b/,
	/\bAKIA[0-9A-Z]{16}\b/,
	/\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/,
];

for (const path of publicPaths) {
	let contents;
	try {
		contents = await readFile(resolve(rootDir, path), "utf8");
	} catch {
		continue;
	}
	if (contents.includes("\0")) continue;
	if (secretPatterns.some((pattern) => pattern.test(contents))) {
		highConfidenceSecrets.push({ path, reason: "high-confidence secret pattern" });
	}
}

const findings = [...sensitivePaths, ...highConfidenceSecrets];
if (findings.length > 0) {
	console.error("Public-tree check failed. Findings (contents intentionally hidden):");
	for (const finding of findings) {
		console.error(`- ${finding.path}: ${finding.reason}`);
	}
	process.exit(1);
}

console.log(
	`Public-tree check passed: ${publicPaths.length} exported tracked files; ${ignored.size} export-ignored files.`,
);
