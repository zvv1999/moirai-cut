import { NextResponse } from "next/server";
import {
	exportProjectFcpxml,
	InterchangeServiceError,
	type ProjectFcpxmlExportResult,
} from "@/server/interchange";

type Context = { params: Promise<{ projectId: string }> };

export type FcpxmlRouteExecutor = (request: {
	projectId: string;
	baseRevision: number;
	name?: string;
	sceneId?: string;
	target: "jianying-desktop";
}) => Promise<ProjectFcpxmlExportResult>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidRequest(message: string): NextResponse {
	return NextResponse.json(
		{ error: { code: "interchange_request_invalid", message } },
		{ status: 400 },
	);
}

export function createFcpxmlRouteHandlers({
	execute,
}: {
	execute: FcpxmlRouteExecutor;
}) {
	const POST = async (request: Request, { params }: Context) => {
		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return invalidRequest("Request body must be JSON");
		}
		if (
			!isRecord(body) ||
			typeof body.baseRevision !== "number" ||
			!Number.isSafeInteger(body.baseRevision) ||
			body.baseRevision < 0 ||
			(body.name !== undefined &&
				(typeof body.name !== "string" ||
					body.name.trim().length === 0 ||
					body.name.length > 110)) ||
			(body.sceneId !== undefined &&
				(typeof body.sceneId !== "string" || body.sceneId.trim().length === 0))
		) {
			return invalidRequest(
				"baseRevision must be a safe non-negative integer; name must be 1-110 characters and sceneId must be non-empty when provided",
			);
		}

		try {
			const { projectId } = await params;
			const result = await execute({
				projectId,
				baseRevision: body.baseRevision,
				...(typeof body.name === "string" ? { name: body.name } : {}),
				...(typeof body.sceneId === "string" ? { sceneId: body.sceneId } : {}),
				target: "jianying-desktop",
			});
			return NextResponse.json({ data: result });
		} catch (error) {
			const typed =
				error instanceof InterchangeServiceError ||
				(isRecord(error) && typeof error.code === "string")
					? error
					: null;
			const status =
				typed && typeof typed.status === "number" ? typed.status : 400;
			return NextResponse.json(
				{
					error: {
						code: typed?.code ?? "interchange_failed",
						message: error instanceof Error ? error.message : String(error),
						...(typed && typeof typed.revision === "number"
							? { revision: typed.revision }
							: {}),
					},
				},
				{ status },
			);
		}
	};
	return { POST };
}

const handlers = createFcpxmlRouteHandlers({ execute: exportProjectFcpxml });

export const POST = handlers.POST;
