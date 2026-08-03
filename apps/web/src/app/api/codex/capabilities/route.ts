import { NextResponse } from "next/server";
import type { CodexToolProfile } from "@/server/codex-chat";
import { createCodexEndpointRoutingService } from "@/server/codex-endpoint-routing";

export const runtime = "nodejs";

const service = createCodexEndpointRoutingService();

function isToolProfile(value: unknown): value is CodexToolProfile {
	return value === "edit" || value === "verify" || value === "full";
}

export async function GET(request: Request) {
	const requestedProfile = new URL(request.url).searchParams.get("toolProfile");
	const toolProfile = isToolProfile(requestedProfile)
		? requestedProfile
		: "edit";
	try {
		return NextResponse.json(await service.capabilities({ toolProfile }));
	} catch (error) {
		return NextResponse.json(
			{
				error: {
					code: "codex_capabilities_unavailable",
					message:
						error instanceof Error ? error.message : "无法读取 Codex 能力。",
				},
			},
			{ status: 503 },
		);
	}
}
