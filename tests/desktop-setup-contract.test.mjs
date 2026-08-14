import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

const setupScript = readFileSync(
	new URL("../apps/desktop/script/setup", import.meta.url),
	"utf8",
);
const desktopReadme = readFileSync(
	new URL("../apps/desktop/README.md", import.meta.url),
	"utf8",
);

describe("desktop native dependency setup", () => {
	test("requires the Metal compiler instead of accepting Command Line Tools alone", () => {
		expect(setupScript).toContain("xcrun --find metal");
		expect(desktopReadme).toContain("full Xcode application");
	});
});
