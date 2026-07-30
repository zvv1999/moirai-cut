import { NextResponse } from "next/server";
import {
	nativeMediaJobs,
	PROXY_PROFILE_NAMES,
	type NativeMediaJob,
	type ProxyProfileName,
} from "@/server/media-jobs";

type Context = {
	params: Promise<{ projectId: string }>;
};

export interface MediaJobsApiService {
	ensureProxy(input: {
		projectId: string;
		assetId: string;
		profile?: ProxyProfileName;
		force?: boolean;
	}): Promise<NativeMediaJob>;
	list(input: { projectId: string }): Promise<NativeMediaJob[]>;
	get(input: {
		projectId: string;
		jobId: string;
	}): Promise<NativeMediaJob | null>;
	cancel(input: { projectId: string; jobId: string }): Promise<NativeMediaJob>;
	retry(input: { projectId: string; jobId: string }): Promise<NativeMediaJob>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function isProxyProfile(value: unknown): value is ProxyProfileName {
	return (
		typeof value === "string" &&
		PROXY_PROFILE_NAMES.some((profile) => profile === value)
	);
}

function requestError({
	message,
	status = 400,
}: {
	message: string;
	status?: number;
}): NextResponse {
	return NextResponse.json(
		{
			error: {
				code: "media_job_request_invalid",
				message,
			},
		},
		{ status },
	);
}

function operationError({ error }: { error: unknown }): NextResponse {
	return NextResponse.json(
		{
			error: {
				code: "media_job_failed",
				message: error instanceof Error ? error.message : String(error),
			},
		},
		{ status: 400 },
	);
}

export function createMediaJobsRouteHandlers({
	service,
}: {
	service: MediaJobsApiService;
}) {
	const GET = async (request: Request, { params }: Context) => {
		try {
			const { projectId } = await params;
			const jobId = new URL(request.url).searchParams.get("jobId");
			if (!jobId) {
				return NextResponse.json({
					data: await service.list({ projectId }),
				});
			}
			const job = await service.get({ projectId, jobId });
			return job
				? NextResponse.json({ data: job })
				: requestError({
						message: `No media job ${jobId}`,
						status: 404,
					});
		} catch (error) {
			return operationError({ error });
		}
	};

	const POST = async (request: Request, { params }: Context) => {
		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return requestError({ message: "Request body must be JSON" });
		}
		if (!isRecord(body) || typeof body.action !== "string") {
			return requestError({ message: "A valid action is required" });
		}

		try {
			const { projectId } = await params;
			switch (body.action) {
				case "ensureProxy": {
					if (typeof body.assetId !== "string") {
						return requestError({
							message: "ensureProxy requires assetId",
						});
					}
					if (body.profile !== undefined && !isProxyProfile(body.profile)) {
						return requestError({
							message: "Unknown proxy profile",
						});
					}
					const profile = isProxyProfile(body.profile)
						? body.profile
						: "standard";
					const job = await service.ensureProxy({
						projectId,
						assetId: body.assetId,
						profile,
						force: body.force === true,
					});
					return NextResponse.json({ data: job }, { status: 202 });
				}
				case "cancel":
					if (typeof body.jobId !== "string") {
						return requestError({
							message: "cancel requires jobId",
						});
					}
					return NextResponse.json({
						data: await service.cancel({
							projectId,
							jobId: body.jobId,
						}),
					});
				case "retry":
					if (typeof body.jobId !== "string") {
						return requestError({
							message: "retry requires jobId",
						});
					}
					return NextResponse.json({
						data: await service.retry({
							projectId,
							jobId: body.jobId,
						}),
					});
				default:
					return requestError({
						message: `Unknown media job action: ${body.action}`,
					});
			}
		} catch (error) {
			return operationError({ error });
		}
	};

	return { GET, POST };
}

const handlers = createMediaJobsRouteHandlers({
	service: nativeMediaJobs,
});

export const GET = handlers.GET;
export const POST = handlers.POST;
