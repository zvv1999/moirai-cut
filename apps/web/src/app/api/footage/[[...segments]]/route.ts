import { proxyFootage } from "@/server/footage-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ segments?: string[] }> };
async function handle(request: Request, context: Context) {
	return proxyFootage(request, (await context.params).segments ?? ["state"]);
}
export { handle as GET, handle as POST, handle as PATCH };
