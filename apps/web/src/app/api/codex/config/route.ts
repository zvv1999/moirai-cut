import { NextResponse } from "next/server";
import {
	configuredCodexBinary,
	inspectCodexBinary,
} from "@/server/codex-config";

export const runtime = "nodejs";

export async function GET() {
	const connection = await inspectCodexBinary({
		binary: configuredCodexBinary(),
	});
	return NextResponse.json(connection);
}
