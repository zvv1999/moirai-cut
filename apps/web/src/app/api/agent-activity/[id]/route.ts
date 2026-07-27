import { NextResponse } from "next/server";
import { getAgentPresence, recordAgentActivity } from "@/server/agent-activity";

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!SAFE_ID.test(id)) return NextResponse.json({ error: "Unsafe project id" }, { status: 400 });
  let body: { actor?: string; summary?: string; revision?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    /* heartbeat with no body */
  }
  recordAgentActivity({
    projectId: id,
    actor: typeof body.actor === "string" && body.actor ? body.actor.slice(0, 64) : "agent",
    ...(typeof body.summary === "string" && body.summary
      ? { summary: body.summary.slice(0, 200) }
      : {}),
    ...(typeof body.revision === "number" ? { revision: body.revision } : {}),
  });
  return NextResponse.json({ ok: true });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!SAFE_ID.test(id)) return NextResponse.json({ error: "Unsafe project id" }, { status: 400 });
  return NextResponse.json(getAgentPresence(id));
}
