import type {
	InterchangeReport,
	ProjectFcpxmlExportResult,
} from "@/server/interchange";

export type FcpxmlClientResult = Pick<
	ProjectFcpxmlExportResult,
	| "revision"
	| "currentRevision"
	| "stable"
	| "name"
	| "downloadUrl"
	| "reportName"
	| "reportDownloadUrl"
> & { report: InterchangeReport };

interface ErrorPayload {
	error?: { code?: string; message?: string; revision?: number };
}

type Fetcher = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

export async function requestProjectFcpxml({
	projectId,
	projectName,
	sceneId,
	isDirty,
	flush,
	getRevision,
	fetcher = fetch,
}: {
	projectId: string;
	projectName: string;
	sceneId?: string;
	isDirty: () => boolean;
	flush: () => Promise<void>;
	getRevision: () => number | null;
	fetcher?: Fetcher;
}): Promise<FcpxmlClientResult> {
	if (isDirty()) {
		await flush();
		if (isDirty()) {
			throw new Error("工程仍有未保存的更改，暂不能生成 revision-bound FCPXML。");
		}
	}
	const revision = getRevision();
	if (revision === null) {
		throw new Error("工程尚未保存到本地文件，无法生成 revision-bound FCPXML。");
	}
	const response = await fetcher(
		`/api/interchange/${encodeURIComponent(projectId)}/fcpxml`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				baseRevision: revision,
				...(sceneId ? { sceneId } : {}),
				name: projectName,
				target: "jianying-desktop",
			}),
		},
	);
	const payload = (await response.json().catch(() => ({}))) as ErrorPayload & {
		data?: FcpxmlClientResult;
	};
	if (!response.ok || !payload.data) {
		throw new Error(
			payload.error?.message || `FCPXML export failed with ${response.status}`,
		);
	}
	return payload.data;
}
