export const AGENT_DATA_CONSENT_STORAGE_KEY =
	"moirai-cut:external-agent-data-consent:v1";
export const LEGACY_AGENT_DATA_CONSENT_STORAGE_KEY =
	"holocut:external-agent-data-consent:v1";

const AGENT_DATA_CONSENT_STORAGE_KEYS = [
	AGENT_DATA_CONSENT_STORAGE_KEY,
	LEGACY_AGENT_DATA_CONSENT_STORAGE_KEY,
] as const;

interface ConsentStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

interface ExternalAgentConsentReceipt {
	version: 1;
	acceptedAt: string;
}

function isConsentReceipt(
	value: unknown,
): value is ExternalAgentConsentReceipt {
	return (
		typeof value === "object" &&
		value !== null &&
		"version" in value &&
		value.version === 1 &&
		"acceptedAt" in value &&
		typeof value.acceptedAt === "string" &&
		Number.isFinite(Date.parse(value.acceptedAt))
	);
}

export function hasExternalAgentConsent(storage: ConsentStorage): boolean {
	for (const key of AGENT_DATA_CONSENT_STORAGE_KEYS) {
		try {
			const value = storage.getItem(key);
			if (value !== null && isConsentReceipt(JSON.parse(value))) return true;
		} catch {
			// Ignore invalid receipts and continue checking migration aliases.
		}
	}
	return false;
}

export function storeExternalAgentConsent({
	storage,
	acceptedAt = new Date(),
}: {
	storage: ConsentStorage;
	acceptedAt?: Date;
}): boolean {
	try {
		storage.setItem(
			AGENT_DATA_CONSENT_STORAGE_KEY,
			JSON.stringify({
				version: 1,
				acceptedAt: acceptedAt.toISOString(),
			} satisfies ExternalAgentConsentReceipt),
		);
		return true;
	} catch {
		return false;
	}
}

export function clearExternalAgentConsent(storage: ConsentStorage): boolean {
	try {
		for (const key of AGENT_DATA_CONSENT_STORAGE_KEYS) {
			storage.removeItem(key);
		}
		return true;
	} catch {
		return false;
	}
}
