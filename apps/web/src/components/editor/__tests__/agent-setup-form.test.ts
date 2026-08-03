import { describe, expect, test } from "bun:test";
import { endpointModeIntent, validateEndpointDraft } from "../agent-setup-form";

describe("Agent endpoint setup form", () => {
	test("opens configuration before activating an unconfigured custom endpoint", () => {
		expect(
			endpointModeIntent({ mode: "custom", hasConfiguredCustom: false }),
		).toEqual({ openEditor: true, mutation: null });
	});

	test("switches immediately when the requested endpoint is already usable", () => {
		expect(
			endpointModeIntent({ mode: "custom", hasConfiguredCustom: true }),
		).toEqual({
			openEditor: false,
			mutation: { action: "select-endpoint", mode: "custom" },
		});
		expect(
			endpointModeIntent({ mode: "native", hasConfiguredCustom: false }),
		).toEqual({
			openEditor: false,
			mutation: { action: "select-endpoint", mode: "native" },
		});
	});

	test("provides field-level guidance without requiring a network probe", () => {
		expect(
			validateEndpointDraft({
				baseUrl: "http://gateway.example.com/v1",
				credential: "",
				hasStoredCredential: false,
			}),
		).toEqual({
			canSubmit: false,
			errors: {
				baseUrl: "远程端点必须使用 HTTPS。",
				credential: "请输入 API Key 或访问令牌。",
			},
		});
	});

	test("accepts loopback HTTP and preserves a previously stored credential", () => {
		expect(
			validateEndpointDraft({
				baseUrl: "http://127.0.0.1:8787",
				credential: "",
				hasStoredCredential: true,
			}),
		).toEqual({ canSubmit: true, errors: {} });
	});
});
