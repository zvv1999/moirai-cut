import { describe, expect, test } from "bun:test";
import {
	discoverAgentModels,
	modelCatalogUrlCandidates,
} from "@/server/agent-model-catalog";

describe("Agent gateway model discovery", () => {
	test("derives standard model catalog URLs without duplicating v1", () => {
		expect(modelCatalogUrlCandidates("https://gateway.example.com")).toEqual([
			"https://gateway.example.com/v1/models",
			"https://gateway.example.com/models",
		]);
		expect(modelCatalogUrlCandidates("https://gateway.example.com/v1")).toEqual([
			"https://gateway.example.com/v1/models",
		]);
	});

	test("normalizes OpenAI and Anthropic model records for dynamic selection", async () => {
		const calls: Array<{ url: string; headers: Headers }> = [];
		const models = await discoverAgentModels({
			endpoint: {
				mode: "custom",
				baseUrl: "https://gateway.example.com",
				auth: "api-key",
				credential: "secret",
			},
			fetchImpl: async (input, init) => {
				calls.push({
					url: String(input),
					headers: new Headers(init?.headers),
				});
				return Response.json({
					data: [
						{ id: "gpt-5.6-sol", owned_by: "openai" },
						{ id: "claude-sonnet-4-6", display_name: "Claude Sonnet 4.6" },
					],
				});
			},
		});

		expect(models).toEqual([
			expect.objectContaining({ id: "gpt-5.6-sol", label: "gpt-5.6-sol" }),
			expect.objectContaining({
				id: "claude-sonnet-4-6",
				label: "Claude Sonnet 4.6",
			}),
		]);
		expect(calls[0]?.url).toBe("https://gateway.example.com/v1/models");
		expect(calls[0]?.headers.get("authorization")).toBe("Bearer secret");
		expect(calls[0]?.headers.get("x-api-key")).toBe("secret");
	});
});
