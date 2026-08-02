import { NextResponse } from "next/server";
import {
	getActiveEditor,
	recordEditorPresence,
	removeEditorPresence,
} from "@/server/editor-presence";

export const dynamic = "force-dynamic";

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

interface PresenceBody {
	projectId?: unknown;
	sceneId?: unknown;
	revision?: unknown;
	context?: unknown;
}

async function bodyOf(request: Request): Promise<PresenceBody> {
	try {
		return (await request.json()) as PresenceBody;
	} catch {
		return {};
	}
}

export async function GET() {
	return NextResponse.json(getActiveEditor());
}

export async function POST(request: Request) {
	const body = await bodyOf(request);
	if (typeof body.projectId !== "string" || !SAFE_ID.test(body.projectId)) {
		return NextResponse.json({ error: "Unsafe project id" }, { status: 400 });
	}
	try {
		recordEditorPresence({
			projectId: body.projectId,
			...(typeof body.sceneId === "string" ? { sceneId: body.sceneId } : {}),
			...(typeof body.revision === "number" && Number.isFinite(body.revision)
				? { revision: body.revision }
				: {}),
			...(body.context !== undefined ? { context: body.context } : {}),
		});
		return NextResponse.json({ ok: true });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : String(error) },
			{ status: 413 },
		);
	}
}

export async function DELETE(request: Request) {
	const body = await bodyOf(request);
	if (typeof body.projectId !== "string" || !SAFE_ID.test(body.projectId)) {
		return NextResponse.json({ error: "Unsafe project id" }, { status: 400 });
	}
	removeEditorPresence(body.projectId);
	return NextResponse.json({ ok: true });
}
