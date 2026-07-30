import { NextResponse } from "next/server";
import {
	DELIVERY_PRESET_NAMES,
	type DeliveryPresetName,
	type NativeDeliveryResult,
} from "@/export/native-delivery-contract";
import { transcodeProjectExport } from "@/server/native-delivery";

export const runtime = "nodejs";

type Context = {
	params: Promise<{ projectId: string }>;
};

export type NativeDeliveryExecutor = (request: {
	projectId: string;
	sourceName: string;
	preset: DeliveryPresetName;
	outputName?: string;
	signal?: AbortSignal;
}) => Promise<NativeDeliveryResult>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function isDeliveryPreset(value: unknown): value is DeliveryPresetName {
	return (
		typeof value === "string" &&
		DELIVERY_PRESET_NAMES.some((preset) => preset === value)
	);
}

function invalidRequest({ message }: { message: string }): NextResponse {
	return NextResponse.json(
		{
			error: {
				code: "native_delivery_request_invalid",
				message,
			},
		},
		{ status: 400 },
	);
}

export function createNativeDeliveryRouteHandlers({
	execute,
}: {
	execute: NativeDeliveryExecutor;
}) {
	const POST = async (request: Request, { params }: Context) => {
		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return invalidRequest({ message: "Request body must be JSON" });
		}
		if (
			!isRecord(body) ||
			typeof body.sourceName !== "string" ||
			!isDeliveryPreset(body.preset) ||
			(body.outputName !== undefined && typeof body.outputName !== "string")
		) {
			return invalidRequest({
				message: "sourceName and a supported delivery preset are required",
			});
		}

		try {
			const { projectId } = await params;
			const result = await execute({
				projectId,
				sourceName: body.sourceName,
				preset: body.preset,
				...(typeof body.outputName === "string"
					? { outputName: body.outputName }
					: {}),
				signal: request.signal,
			});
			return NextResponse.json({ data: result });
		} catch (error) {
			return NextResponse.json(
				{
					error: {
						code: "native_delivery_failed",
						message: error instanceof Error ? error.message : String(error),
					},
				},
				{ status: 400 },
			);
		}
	};
	return { POST };
}

const handlers = createNativeDeliveryRouteHandlers({
	execute: transcodeProjectExport,
});

export const POST = handlers.POST;
