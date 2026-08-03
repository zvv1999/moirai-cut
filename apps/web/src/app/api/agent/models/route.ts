import { NextResponse } from "next/server";
import { getAgentModelCatalog } from "@/server/agent-model-catalog";
import { getAgentSettingsStore } from "@/server/agent-settings";

export const runtime = "nodejs";

export async function GET(request: Request) {
	try {
		const endpoint = await getAgentSettingsStore().runtimeEndpoint("codex");
		if (endpoint.mode !== "custom") {
			return NextResponse.json({
				source: "native",
				models: [],
				fetchedAt: new Date().toISOString(),
			});
		}
		const force = new URL(request.url).searchParams.get("refresh") === "1";
		return NextResponse.json(
			{
				source: "gateway",
				models: await getAgentModelCatalog({ endpoint, force }),
				fetchedAt: new Date().toISOString(),
			},
			{ headers: { "cache-control": "no-store, max-age=0" } },
		);
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "无法读取端点模型目录。",
			},
			{ status: 502 },
		);
	}
}
