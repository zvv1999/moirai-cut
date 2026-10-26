import {
	claimInspection,
	finishInspection,
	requestInspection,
} from "@/server/editor-inspection";

export const dynamic = "force-dynamic";
const safeId = (value: unknown): value is string =>
	typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
function localRequest(request: Request) {
	if (request.headers.get("sec-fetch-site") === "cross-site") return false;
	const origin = request.headers.get("origin");
	if (!origin) return true;
	const url = new URL(request.url);
	// Next may normalize the request URL to localhost while the browser uses 127.0.0.1.
	return (
		origin === url.origin ||
		origin === `${url.protocol}//${request.headers.get("host")}`
	);
}
export async function GET(request: Request) {
	const id = new URL(request.url).searchParams.get("projectId");
	if (!safeId(id) || !localRequest(request))
		return Response.json({ error: "Invalid request" }, { status: 400 });
	return Response.json({ job: claimInspection(id) });
}
export async function POST(request: Request) {
	if (!localRequest(request))
		return Response.json({ error: "Invalid origin" }, { status: 403 });
	try {
		const body = await request.json();
		if (
			!safeId(body.projectId) ||
			!["getState", "renderFrames"].includes(body.method)
		)
			throw new Error("Invalid inspection request");
		const args = body.args;
		if (
			body.method === "renderFrames" &&
			(!args ||
				args.tile !== true ||
				!Array.isArray(args.atSeconds) ||
				args.atSeconds.length < 1 ||
				args.atSeconds.length > 24 ||
				args.atSeconds.some(
					(n: unknown) => typeof n !== "number" || !Number.isFinite(n) || n < 0,
				) ||
				!Number.isInteger(args.maxDim) ||
				args.maxDim < 160 ||
				args.maxDim > 640)
		)
			throw new Error("Invalid frame request");
		const result = await requestInspection(
			{
				projectId: body.projectId,
				method: body.method,
				args: body.method === "getState" ? null : args,
			},
			request.signal,
		);
		return Response.json(result);
	} catch (error) {
		return Response.json(
			{
				ok: false,
				error: {
					code: "editor_inspection_failed",
					message: error instanceof Error ? error.message : String(error),
				},
			},
			{ status: 400 },
		);
	}
}
export async function PATCH(request: Request) {
	if (!localRequest(request))
		return Response.json({ error: "Invalid origin" }, { status: 403 });
	try {
		const text = await request.text();
		if (text.length > 16 * 1024 * 1024)
			throw new Error("Inspection result too large");
		const body = JSON.parse(text);
		if (
			!safeId(body.projectId) ||
			!safeId(body.id) ||
			!safeId(body.token) ||
			!body.result ||
			typeof body.result.ok !== "boolean"
		)
			throw new Error("Invalid result");
		return Response.json({
			ok: finishInspection(body.projectId, body.id, body.token, body.result),
		});
	} catch {
		return Response.json({ error: "Invalid result" }, { status: 400 });
	}
}
