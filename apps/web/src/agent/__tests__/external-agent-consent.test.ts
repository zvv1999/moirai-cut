import { describe, expect, it } from "bun:test";
import {
	AGENT_DATA_CONSENT_STORAGE_KEY,
	LEGACY_AGENT_DATA_CONSENT_STORAGE_KEY,
	clearExternalAgentConsent,
	hasExternalAgentConsent,
	storeExternalAgentConsent,
} from "../external-agent-consent";

class MemoryStorage {
	private readonly values = new Map<string, string>();

	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}

	removeItem(key: string): void {
		this.values.delete(key);
	}
}

describe("external Agent data consent", () => {
	it("requires consent when no valid receipt is stored", () => {
		const storage = new MemoryStorage();
		expect(hasExternalAgentConsent(storage)).toBe(false);

		storage.setItem(AGENT_DATA_CONSENT_STORAGE_KEY, "not-json");
		expect(hasExternalAgentConsent(storage)).toBe(false);

		storage.setItem(
			AGENT_DATA_CONSENT_STORAGE_KEY,
			JSON.stringify({ version: 0, acceptedAt: "2026-08-02T00:00:00.000Z" }),
		);
		expect(hasExternalAgentConsent(storage)).toBe(false);
	});

	it("stores a versioned receipt and allows it to be revoked", () => {
		const storage = new MemoryStorage();
		storeExternalAgentConsent({
			storage,
			acceptedAt: new Date("2026-08-02T00:00:00.000Z"),
		});

		expect(hasExternalAgentConsent(storage)).toBe(true);
		expect(
			JSON.parse(storage.getItem(AGENT_DATA_CONSENT_STORAGE_KEY) ?? "{}"),
		).toEqual({
			version: 1,
			acceptedAt: "2026-08-02T00:00:00.000Z",
		});

		clearExternalAgentConsent(storage);
		expect(hasExternalAgentConsent(storage)).toBe(false);
	});

	it("accepts and clears the transitional HoloCut receipt", () => {
		const storage = new MemoryStorage();
		storage.setItem(
			LEGACY_AGENT_DATA_CONSENT_STORAGE_KEY,
			JSON.stringify({
				version: 1,
				acceptedAt: "2026-08-02T00:00:00.000Z",
			}),
		);

		expect(hasExternalAgentConsent(storage)).toBe(true);
		clearExternalAgentConsent(storage);
		expect(hasExternalAgentConsent(storage)).toBe(false);
	});
});
