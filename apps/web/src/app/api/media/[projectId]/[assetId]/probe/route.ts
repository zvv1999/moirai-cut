import { execFile } from "node:child_process";
import { NextResponse } from "next/server";
import { decidePlaybackStrategy } from "@/media/codec-capabilities";
import { probeProjectMedia } from "@/server/media-probe";

export const runtime = "nodejs";

type Context = {
	params: Promise<{ projectId: string; assetId: string }>;
};

function queryBoolean({ value }: { value: string | null }): boolean | null {
	if (value === "true") {
		return true;
	}
	if (value === "false") {
		return false;
	}
	return null;
}

async function nativeTranscodeAvailable(): Promise<boolean> {
	const binary = process.env.FFMPEG_BIN ?? "ffmpeg";
	return new Promise((resolve) => {
		execFile(
			binary,
			["-version"],
			{
				encoding: "utf8",
				maxBuffer: 1024 * 1024,
				timeout: 3_000,
			},
			(error) => resolve(error === null),
		);
	});
}

export async function GET(
	request: Request,
	{ params }: Context,
): Promise<NextResponse> {
	try {
		const { projectId, assetId } = await params;
		const url = new URL(request.url);
		const [result, hasNativeTranscode] = await Promise.all([
			probeProjectMedia({
				projectId,
				assetId,
				force:
					queryBoolean({
						value: url.searchParams.get("force"),
					}) === true,
			}),
			nativeTranscodeAvailable(),
		]);
		const browserCanDecode = queryBoolean({
			value: url.searchParams.get("browserCanDecode"),
		});

		return NextResponse.json({
			data: {
				...result,
				nativeTranscodeAvailable: hasNativeTranscode,
				compatibility: decidePlaybackStrategy({
					probe: result.probe,
					browserCanDecode,
					nativeTranscodeAvailable: hasNativeTranscode,
				}),
			},
		});
	} catch (error) {
		return NextResponse.json(
			{
				error: {
					code: "media_probe_failed",
					message: error instanceof Error ? error.message : String(error),
				},
			},
			{ status: 400 },
		);
	}
}
