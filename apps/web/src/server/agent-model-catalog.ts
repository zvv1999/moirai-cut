import { createHash } from "node:crypto";
import type { AgentEndpointRuntime } from "@/server/agent-settings";

export interface AgentModelCatalogItem {
	id: string;
	label: string;
	ownedBy: string | null;
	createdAt: string | null;
}

interface CachedCatalog {
	expiresAt: number;
	models: AgentModelCatalogItem[];
}

const CATALOG_TTL_MS = 30_000;
const CATALOG_TIMEOUT_MS = 10_000;
const catalogCache = new Map<string, CachedCatalog>();
type AgentModelFetch = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

function normalizedBaseUrl(baseUrl: string): string {
	return baseUrl.replace(/\/+$/, "");
}

export function modelCatalogUrlCandidates(baseUrl: string): string[] {
	const normalized = normalizedBaseUrl(baseUrl);
	return normalized.endsWith("/v1")
		? [`${normalized}/models`]
		: [`${normalized}/v1/models`, `${normalized}/models`];
}

function recordString(record: Record<string, unknown>, ...keys: string[]) {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return null;
}

function normalizeModel(value: unknown): AgentModelCatalogItem | null {
	if (typeof value === "string") {
		const id = value.trim();
		return id ? { id, label: id, ownedBy: null, createdAt: null } : null;
	}
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	const id = recordString(record, "id", "model", "name");
	if (!id) return null;
	return {
		id,
		label: recordString(record, "display_name", "displayName", "label") ?? id,
		ownedBy: recordString(record, "owned_by", "ownedBy", "provider"),
		createdAt: recordString(record, "created_at", "createdAt"),
	};
}

function normalizeCatalogPayload(value: unknown): AgentModelCatalogItem[] {
	let entries: unknown[] = [];
	if (Array.isArray(value)) {
		entries = value;
	} else if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		if (Array.isArray(record.data)) entries = record.data;
		else if (Array.isArray(record.models)) entries = record.models;
	}
	const seen = new Set<string>();
	return entries.flatMap((entry) => {
		const model = normalizeModel(entry);
		if (!model || seen.has(model.id)) return [];
		seen.add(model.id);
		return [model];
	});
}

function requestHeaders(
	endpoint: Extract<AgentEndpointRuntime, { mode: "custom" }>,
) {
	const headers = new Headers({ accept: "application/json" });
	headers.set("authorization", `Bearer ${endpoint.credential}`);
	headers.set("anthropic-version", "2023-06-01");
	if (endpoint.auth === "api-key") {
		headers.set("x-api-key", endpoint.credential);
	}
	return headers;
}

export async function discoverAgentModels({
	endpoint,
	fetchImpl = fetch,
	signal,
}: {
	endpoint: Extract<AgentEndpointRuntime, { mode: "custom" }>;
	fetchImpl?: AgentModelFetch;
	signal?: AbortSignal;
}): Promise<AgentModelCatalogItem[]> {
	const timeout = AbortSignal.timeout(CATALOG_TIMEOUT_MS);
	const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
	let lastError = "模型目录不可用";
	for (const url of modelCatalogUrlCandidates(endpoint.baseUrl)) {
		try {
			const response = await fetchImpl(url, {
				method: "GET",
				headers: requestHeaders(endpoint),
				signal: requestSignal,
				cache: "no-store",
			});
			if (!response.ok) {
				lastError = `模型目录请求失败（${response.status}）`;
				continue;
			}
			const models = normalizeCatalogPayload(await response.json());
			if (models.length > 0) return models;
			lastError = "端点返回了空模型目录";
		} catch (error) {
			lastError = error instanceof Error ? error.message : "模型目录请求失败";
		}
	}
	throw new Error(`${lastError}。请确认端点支持 GET /v1/models。`);
}

function cacheKey(endpoint: Extract<AgentEndpointRuntime, { mode: "custom" }>) {
	return createHash("sha256")
		.update(
			JSON.stringify({
				baseUrl: endpoint.baseUrl,
				auth: endpoint.auth,
				credential: endpoint.credential,
			}),
		)
		.digest("hex");
}

export async function getAgentModelCatalog({
	endpoint,
	force = false,
}: {
	endpoint: Extract<AgentEndpointRuntime, { mode: "custom" }>;
	force?: boolean;
}): Promise<AgentModelCatalogItem[]> {
	const key = cacheKey(endpoint);
	const cached = catalogCache.get(key);
	if (!force && cached && cached.expiresAt > Date.now()) return cached.models;
	const models = await discoverAgentModels({ endpoint });
	catalogCache.set(key, { models, expiresAt: Date.now() + CATALOG_TTL_MS });
	return models;
}
