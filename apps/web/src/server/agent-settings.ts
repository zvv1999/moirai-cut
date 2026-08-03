import { randomUUID } from "node:crypto";
import {
	chmod,
	mkdir,
	readFile,
	rename,
	unlink,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { AgentProviderId } from "@/server/agent-deployment";

export interface AgentSettings {
	schemaVersion: "moirai-cut.agent-settings.v1";
	activeProvider: AgentProviderId | null;
	binaries: Partial<Record<AgentProviderId, string>>;
}

export type AgentEndpointMode = "native" | "custom";
export type AgentEndpointAuth = "api-key" | "bearer";

export interface AgentCustomEndpointSettings {
	baseUrl: string;
	auth: AgentEndpointAuth;
}

export interface AgentProviderEndpointSettings {
	mode: AgentEndpointMode;
	custom: AgentCustomEndpointSettings | null;
}

export type AgentEndpointSnapshot = Record<
	AgentProviderId,
	AgentProviderEndpointSettings & {
		custom: (AgentCustomEndpointSettings & { hasCredential: boolean }) | null;
	}
>;

export type AgentEndpointRuntime =
	| { mode: "native" }
	| (AgentCustomEndpointSettings & {
			mode: "custom";
			credential: string;
	  });

interface AgentEndpointFile {
	schemaVersion: "moirai-cut.agent-endpoints.v1";
	providers: Record<AgentProviderId, AgentProviderEndpointSettings>;
}

interface AgentCredentialsFile {
	schemaVersion: "moirai-cut.agent-credentials.v1";
	credentials: Partial<Record<AgentProviderId, string>>;
}

const EMPTY_SETTINGS: AgentSettings = {
	schemaVersion: "moirai-cut.agent-settings.v1",
	activeProvider: null,
	binaries: {},
};

const EMPTY_ENDPOINTS: AgentEndpointFile = {
	schemaVersion: "moirai-cut.agent-endpoints.v1",
	providers: {
		codex: { mode: "native", custom: null },
		claude: { mode: "native", custom: null },
	},
};

const EMPTY_CREDENTIALS: AgentCredentialsFile = {
	schemaVersion: "moirai-cut.agent-credentials.v1",
	credentials: {},
};

function providerLabel(provider: AgentProviderId): string {
	return provider === "codex" ? "Codex" : "Claude";
}

function expectedBinaryNames(provider: AgentProviderId): string[] {
	return process.platform === "win32"
		? [provider, `${provider}.exe`, `${provider}.cmd`]
		: [provider];
}

export function validateAgentBinaryPath({
	provider,
	binary,
}: {
	provider: AgentProviderId;
	binary: string;
}): string {
	const normalized = binary.trim();
	if (!path.isAbsolute(normalized)) {
		throw new Error(
			`${providerLabel(provider)} binary must use an absolute path.`,
		);
	}
	if (!expectedBinaryNames(provider).includes(path.basename(normalized))) {
		throw new Error(
			`${providerLabel(provider)} 可执行文件必须命名为 ${provider}。`,
		);
	}
	return path.normalize(normalized);
}

function isProvider(value: unknown): value is AgentProviderId {
	return value === "codex" || value === "claude";
}

function isEndpointMode(value: unknown): value is AgentEndpointMode {
	return value === "native" || value === "custom";
}

function isEndpointAuth(value: unknown): value is AgentEndpointAuth {
	return value === "api-key" || value === "bearer";
}

function cloneEmptyEndpoints(): AgentEndpointFile {
	return {
		...EMPTY_ENDPOINTS,
		providers: {
			codex: { mode: "native", custom: null },
			claude: { mode: "native", custom: null },
		},
	};
}

function validateEndpointUrl(value: string): string {
	const normalized = value.trim();
	let url: URL;
	try {
		url = new URL(normalized);
	} catch {
		throw new Error("Endpoint Base URL 无效。");
	}
	const loopback = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
	if (
		url.protocol !== "https:" &&
		!(url.protocol === "http:" && loopback.has(url.hostname))
	) {
		throw new Error("远程 Endpoint 必须使用 HTTPS；HTTP 仅允许本机地址。");
	}
	if (url.username || url.password || url.search || url.hash) {
		throw new Error("Endpoint Base URL 不能包含账号、查询参数或片段。");
	}
	return url.toString().replace(/\/$/, "");
}

function containsAsciiControlCharacter(value: string): boolean {
	return Array.from(value).some((character) => {
		const code = character.charCodeAt(0);
		return code <= 31 || code === 127;
	});
}

function validateEndpointCredential(value: string): string {
	if (
		!value ||
		value.length > 8_192 ||
		value.trim() !== value ||
		containsAsciiControlCharacter(value)
	) {
		throw new Error("Endpoint credential 无效。");
	}
	return value;
}

function parseCustomEndpoint(
	value: unknown,
): AgentCustomEndpointSettings | null {
	if (value === null) return null;
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	if (typeof record.baseUrl !== "string" || !isEndpointAuth(record.auth)) {
		return null;
	}
	try {
		return {
			baseUrl: validateEndpointUrl(record.baseUrl),
			auth: record.auth,
		};
	} catch {
		return null;
	}
}

function parseEndpointFile(value: unknown): AgentEndpointFile | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	if (
		record.schemaVersion !== "moirai-cut.agent-endpoints.v1" ||
		!record.providers ||
		typeof record.providers !== "object" ||
		Array.isArray(record.providers)
	) {
		return null;
	}
	const providers = record.providers as Record<string, unknown>;
	const parsed = cloneEmptyEndpoints();
	for (const provider of ["codex", "claude"] as const) {
		const value = providers[provider];
		if (!value || typeof value !== "object" || Array.isArray(value))
			return null;
		const endpoint = value as Record<string, unknown>;
		if (!isEndpointMode(endpoint.mode)) return null;
		const custom = parseCustomEndpoint(endpoint.custom);
		if (endpoint.custom !== null && custom === null) return null;
		if (endpoint.mode === "custom" && custom === null) return null;
		parsed.providers[provider] = { mode: endpoint.mode, custom };
	}
	return parsed;
}

function parseCredentialsFile(value: unknown): AgentCredentialsFile | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	if (
		record.schemaVersion !== "moirai-cut.agent-credentials.v1" ||
		!record.credentials ||
		typeof record.credentials !== "object" ||
		Array.isArray(record.credentials)
	) {
		return null;
	}
	const credentials: Partial<Record<AgentProviderId, string>> = {};
	for (const provider of ["codex", "claude"] as const) {
		const value = (record.credentials as Record<string, unknown>)[provider];
		if (value === undefined) continue;
		if (typeof value !== "string") return null;
		try {
			credentials[provider] = validateEndpointCredential(value);
		} catch {
			return null;
		}
	}
	return {
		schemaVersion: "moirai-cut.agent-credentials.v1",
		credentials,
	};
}

function normalizeSharedEndpointState({
	endpoints,
	credentials,
	preferredProvider,
}: {
	endpoints: AgentEndpointFile;
	credentials: AgentCredentialsFile;
	preferredProvider: AgentProviderId | null;
}): {
	endpoints: AgentEndpointFile;
	credentials: AgentCredentialsFile;
} {
	const orderedProviders = Array.from(
		new Set(
			[preferredProvider, "claude", "codex"].filter(
				(provider): provider is AgentProviderId => provider !== null,
			),
		),
	);
	const configuredProvider =
		orderedProviders.find((provider) => {
			const endpoint = endpoints.providers[provider];
			return (
				endpoint.mode === "custom" &&
				Boolean(endpoint.custom) &&
				Boolean(credentials.credentials[provider])
			);
		}) ??
		orderedProviders.find(
			(provider) =>
				Boolean(endpoints.providers[provider].custom) &&
				Boolean(credentials.credentials[provider]),
		);
	if (!configuredProvider) return { endpoints, credentials };

	const source = endpoints.providers[configuredProvider];
	const credential = credentials.credentials[configuredProvider];
	if (!source.custom || !credential) return { endpoints, credentials };
	const mode: AgentEndpointMode = (
		Object.keys(endpoints.providers) as AgentProviderId[]
	).some(
		(provider) =>
			endpoints.providers[provider].mode === "custom" &&
			Boolean(endpoints.providers[provider].custom) &&
			Boolean(credentials.credentials[provider]),
	)
		? "custom"
		: "native";
	return {
		endpoints: {
			...endpoints,
			providers: {
				codex: { mode, custom: { ...source.custom } },
				claude: { mode, custom: { ...source.custom } },
			},
		},
		credentials: {
			...credentials,
			credentials: { codex: credential, claude: credential },
		},
	};
}

function parseSettings(value: unknown): AgentSettings | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	if (record.schemaVersion !== "moirai-cut.agent-settings.v1") return null;
	if (record.activeProvider !== null && !isProvider(record.activeProvider)) {
		return null;
	}
	if (!record.binaries || typeof record.binaries !== "object") return null;
	const binaries: Partial<Record<AgentProviderId, string>> = {};
	for (const provider of ["codex", "claude"] as const) {
		const candidate = (record.binaries as Record<string, unknown>)[provider];
		if (candidate === undefined) continue;
		if (typeof candidate !== "string") return null;
		try {
			binaries[provider] = validateAgentBinaryPath({
				provider,
				binary: candidate,
			});
		} catch {
			return null;
		}
	}
	return {
		schemaVersion: "moirai-cut.agent-settings.v1",
		activeProvider: record.activeProvider,
		binaries,
	};
}

export class AgentSettingsStore {
	readonly filePath: string;
	readonly endpointsFilePath: string;
	readonly credentialsFilePath: string;
	private queue: Promise<void> = Promise.resolve();

	constructor({
		filePath,
		endpointsFilePath = path.join(
			path.dirname(filePath),
			"agent-endpoints.json",
		),
		credentialsFilePath = path.join(
			path.dirname(filePath),
			"agent-credentials.json",
		),
	}: {
		filePath: string;
		endpointsFilePath?: string;
		credentialsFilePath?: string;
	}) {
		this.filePath = filePath;
		this.endpointsFilePath = endpointsFilePath;
		this.credentialsFilePath = credentialsFilePath;
	}

	async read(): Promise<AgentSettings> {
		try {
			const parsed = parseSettings(
				JSON.parse(await readFile(this.filePath, "utf8")),
			);
			return parsed ?? { ...EMPTY_SETTINGS, binaries: {} };
		} catch (error) {
			if (
				error &&
				typeof error === "object" &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				return { ...EMPTY_SETTINGS, binaries: {} };
			}
			throw error;
		}
	}

	private async write(settings: AgentSettings): Promise<void> {
		const directory = path.dirname(this.filePath);
		await mkdir(directory, { recursive: true });
		const temporary = path.join(
			directory,
			`.agent-settings.${randomUUID()}.tmp`,
		);
		try {
			await writeFile(
				temporary,
				`${JSON.stringify(settings, null, 2)}\n`,
				"utf8",
			);
			await rename(temporary, this.filePath);
		} catch (error) {
			await unlink(temporary).catch(() => {});
			throw error;
		}
	}

	private async readEndpoints(): Promise<AgentEndpointFile> {
		try {
			return (
				parseEndpointFile(
					JSON.parse(await readFile(this.endpointsFilePath, "utf8")),
				) ?? cloneEmptyEndpoints()
			);
		} catch (error) {
			if (
				error &&
				typeof error === "object" &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				return cloneEmptyEndpoints();
			}
			throw error;
		}
	}

	private async readCredentials(): Promise<AgentCredentialsFile> {
		try {
			return (
				parseCredentialsFile(
					JSON.parse(await readFile(this.credentialsFilePath, "utf8")),
				) ?? { ...EMPTY_CREDENTIALS, credentials: {} }
			);
		} catch (error) {
			if (
				error &&
				typeof error === "object" &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				return { ...EMPTY_CREDENTIALS, credentials: {} };
			}
			throw error;
		}
	}

	private async readSharedEndpointState(): Promise<{
		endpoints: AgentEndpointFile;
		credentials: AgentCredentialsFile;
	}> {
		const [endpoints, credentials, settings] = await Promise.all([
			this.readEndpoints(),
			this.readCredentials(),
			this.read(),
		]);
		return normalizeSharedEndpointState({
			endpoints,
			credentials,
			preferredProvider: settings.activeProvider,
		});
	}

	private async writeJson(
		filePath: string,
		value: unknown,
		mode?: number,
	): Promise<void> {
		const directory = path.dirname(filePath);
		await mkdir(directory, { recursive: true });
		const temporary = path.join(directory, `.agent-config.${randomUUID()}.tmp`);
		try {
			await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
				encoding: "utf8",
				...(mode ? { mode } : {}),
			});
			await rename(temporary, filePath);
			if (mode) await chmod(filePath, mode);
		} catch (error) {
			await unlink(temporary).catch(() => {});
			throw error;
		}
	}

	private async serialize<T>(operation: () => Promise<T>): Promise<T> {
		let resolveQueue: (() => void) | undefined;
		const previous = this.queue;
		this.queue = new Promise<void>((resolve) => {
			resolveQueue = resolve;
		});
		await previous.catch(() => {});
		try {
			return await operation();
		} finally {
			resolveQueue?.();
		}
	}

	private async update(
		mutate: (settings: AgentSettings) => AgentSettings,
	): Promise<AgentSettings> {
		return this.serialize(async () => {
			const next = mutate(await this.read());
			await this.write(next);
			return next;
		});
	}

	async configureProvider({
		provider,
		binary,
	}: {
		provider: AgentProviderId;
		binary: string;
	}): Promise<AgentSettings> {
		const normalized = validateAgentBinaryPath({ provider, binary });
		return this.update((settings) => ({
			...settings,
			binaries: { ...settings.binaries, [provider]: normalized },
		}));
	}

	async selectProvider(provider: AgentProviderId): Promise<AgentSettings> {
		return this.update((settings) => ({
			...settings,
			activeProvider: provider,
		}));
	}

	async configureEndpoint({
		baseUrl,
		auth,
		credential,
	}: {
		baseUrl: string;
		auth: AgentEndpointAuth;
		credential?: string;
	}): Promise<AgentEndpointSnapshot> {
		const custom: AgentCustomEndpointSettings = {
			baseUrl: validateEndpointUrl(baseUrl),
			auth,
		};
		return this.serialize(async () => {
			const { endpoints, credentials } = await this.readSharedEndpointState();
			const nextCredential =
				credential === undefined
					? (credentials.credentials.codex ?? credentials.credentials.claude)
					: validateEndpointCredential(credential);
			if (!nextCredential) {
				throw new Error("第三方端点需要 API Key 或访问令牌。");
			}
			const nextCredentials: AgentCredentialsFile = {
				...credentials,
				credentials: { codex: nextCredential, claude: nextCredential },
			};
			const nextEndpoints: AgentEndpointFile = {
				...endpoints,
				providers: {
					codex: { mode: "custom", custom },
					claude: { mode: "custom", custom },
				},
			};
			await this.writeJson(this.credentialsFilePath, nextCredentials, 0o600);
			await this.writeJson(this.endpointsFilePath, nextEndpoints);
			await this.write(await this.read());
			return this.endpointSnapshotFrom(nextEndpoints, nextCredentials);
		});
	}

	async selectEndpointMode({
		mode,
	}: {
		mode: AgentEndpointMode;
	}): Promise<AgentEndpointSnapshot> {
		return this.serialize(async () => {
			const { endpoints, credentials } = await this.readSharedEndpointState();
			if (
				mode === "custom" &&
				(!endpoints.providers.codex.custom || !credentials.credentials.codex)
			) {
				throw new Error("请先配置第三方端点和密钥。");
			}
			const next: AgentEndpointFile = {
				...endpoints,
				providers: {
					codex: { ...endpoints.providers.codex, mode },
					claude: { ...endpoints.providers.claude, mode },
				},
			};
			await this.writeJson(this.endpointsFilePath, next);
			return this.endpointSnapshotFrom(next, credentials);
		});
	}

	private endpointSnapshotFrom(
		endpoints: AgentEndpointFile,
		credentials: AgentCredentialsFile,
	): AgentEndpointSnapshot {
		return Object.fromEntries(
			(["codex", "claude"] as const).map((provider) => {
				const endpoint = endpoints.providers[provider];
				return [
					provider,
					{
						mode: endpoint.mode,
						custom: endpoint.custom
							? {
									...endpoint.custom,
									hasCredential: Boolean(credentials.credentials[provider]),
								}
							: null,
					},
				];
			}),
		) as AgentEndpointSnapshot;
	}

	async endpointSnapshot(): Promise<AgentEndpointSnapshot> {
		const { endpoints, credentials } = await this.readSharedEndpointState();
		return this.endpointSnapshotFrom(endpoints, credentials);
	}

	async runtimeEndpoint(
		provider: AgentProviderId,
	): Promise<AgentEndpointRuntime> {
		const { endpoints, credentials } = await this.readSharedEndpointState();
		const endpoint = endpoints.providers[provider];
		if (endpoint.mode === "native") return { mode: "native" };
		const credential = credentials.credentials[provider];
		if (!endpoint.custom || !credential) {
			throw new Error("第三方端点配置不完整。");
		}
		return { mode: "custom", ...endpoint.custom, credential };
	}
}

export function createAgentSettingsStore({
	filePath = process.env.MOIRAI_AGENT_SETTINGS_FILE?.trim() ||
		path.join(homedir(), ".moirai-cut", "agent-settings.json"),
	endpointsFilePath,
	credentialsFilePath,
}: {
	filePath?: string;
	endpointsFilePath?: string;
	credentialsFilePath?: string;
} = {}): AgentSettingsStore {
	return new AgentSettingsStore({
		filePath,
		...(endpointsFilePath ? { endpointsFilePath } : {}),
		...(credentialsFilePath ? { credentialsFilePath } : {}),
	});
}

let sharedFilePath: string | null = null;
let sharedStore: AgentSettingsStore | null = null;

export function getAgentSettingsStore(): AgentSettingsStore {
	const filePath =
		process.env.MOIRAI_AGENT_SETTINGS_FILE?.trim() ||
		path.join(homedir(), ".moirai-cut", "agent-settings.json");
	if (!sharedStore || sharedFilePath !== filePath) {
		sharedFilePath = filePath;
		sharedStore = createAgentSettingsStore({ filePath });
	}
	return sharedStore;
}
