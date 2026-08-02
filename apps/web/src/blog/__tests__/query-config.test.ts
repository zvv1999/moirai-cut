import { describe, expect, test } from "bun:test";
import { isMarbleWorkspaceConfigured } from "../query";

describe("Marble blog configuration", () => {
	test("does not contact an inherited or placeholder workspace by default", () => {
		expect(isMarbleWorkspaceConfigured(undefined)).toBe(false);
		expect(isMarbleWorkspaceConfigured("")).toBe(false);
		expect(isMarbleWorkspaceConfigured("build-placeholder")).toBe(false);
		expect(isMarbleWorkspaceConfigured("your_workspace_key_here")).toBe(false);
	});

	test("enables the CMS only for an explicit workspace", () => {
		expect(isMarbleWorkspaceConfigured("moirai-cut-public-blog")).toBe(true);
	});
});
