export class InterchangeClientError extends Error {
	constructor(message, { code = "interchange_failed", status, revision } = {}) {
		super(message);
		this.name = "InterchangeClientError";
		this.code = code;
		this.status = status;
		this.revision = revision;
	}
}

export async function exportFcpxml({
	projectId,
	baseRevision,
	sceneId,
	name,
	base = process.env.OPENCUT_BASE_URL ?? "http://localhost:3000",
	fetchImpl = fetch,
}) {
	let response;
	try {
		response = await fetchImpl(
			`${base.replace(/\/+$/, "")}/api/interchange/${encodeURIComponent(projectId)}/fcpxml`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					baseRevision,
					...(sceneId ? { sceneId } : {}),
					...(name ? { name } : {}),
					target: "jianying-desktop",
				}),
			},
		);
	} catch (error) {
		throw new InterchangeClientError(
			`Cannot reach the Moirai Cut server: ${String(error?.message ?? error)}`,
			{ code: "server_unreachable" },
		);
	}
	const payload = await response.json().catch(() => ({}));
	if (!response.ok || !payload.data) {
		throw new InterchangeClientError(
			payload.error?.message ?? `FCPXML export failed with ${response.status}`,
			{
				code: payload.error?.code,
				status: response.status,
				revision: payload.error?.revision,
			},
		);
	}
	return payload.data;
}
