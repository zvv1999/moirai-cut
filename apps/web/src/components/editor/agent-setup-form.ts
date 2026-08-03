export type AgentSetupProviderId = "codex" | "claude";
export type AgentSetupEndpointMode = "native" | "custom";

export interface EndpointModeIntent {
	openEditor: boolean;
	mutation: {
		action: "select-endpoint";
		mode: AgentSetupEndpointMode;
	} | null;
}

export function endpointModeIntent({
	mode,
	hasConfiguredCustom,
}: {
	mode: AgentSetupEndpointMode;
	hasConfiguredCustom: boolean;
}): EndpointModeIntent {
	if (mode === "custom" && !hasConfiguredCustom) {
		return { openEditor: true, mutation: null };
	}
	return {
		openEditor: false,
		mutation: { action: "select-endpoint", mode },
	};
}

export interface EndpointDraftValidation {
	canSubmit: boolean;
	errors: {
		baseUrl?: string;
		credential?: string;
	};
}

function isLoopback(hostname: string): boolean {
	return new Set(["localhost", "127.0.0.1", "[::1]", "::1"]).has(hostname);
}

export function validateEndpointDraft({
	baseUrl,
	credential,
	hasStoredCredential,
}: {
	baseUrl: string;
	credential: string;
	hasStoredCredential: boolean;
}): EndpointDraftValidation {
	const errors: EndpointDraftValidation["errors"] = {};
	const normalizedUrl = baseUrl.trim();
	if (!normalizedUrl) {
		errors.baseUrl = "请输入 Base URL。";
	} else {
		try {
			const url = new URL(normalizedUrl);
			if (
				url.protocol !== "https:" &&
				!(url.protocol === "http:" && isLoopback(url.hostname))
			) {
				errors.baseUrl = "远程端点必须使用 HTTPS。";
			} else if (url.username || url.password || url.search || url.hash) {
				errors.baseUrl = "Base URL 不能包含账号、查询参数或片段。";
			}
		} catch {
			errors.baseUrl = "请输入有效的 Base URL。";
		}
	}
	if (!credential && !hasStoredCredential) {
		errors.credential = "请输入 API Key 或访问令牌。";
	}
	return { canSubmit: Object.keys(errors).length === 0, errors };
}
