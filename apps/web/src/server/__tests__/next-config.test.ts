import { describe, expect, it } from "bun:test";
import nextConfig from "../../../next.config";

describe("Next.js development origins", () => {
	it("allows the 127.0.0.1 editor URL used by the in-app browser", async () => {
		const resolvedConfig = await nextConfig;
		expect(resolvedConfig.allowedDevOrigins).toContain("127.0.0.1");
	});
});
