import { NextResponse } from "next/server";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Where finished exports land.
 *
 * The encode happens in the browser (WebCodecs), so the bytes start life as a
 * Blob in the page. Handing tens of megabytes back through CDP as base64 would
 * be slow and memory-hungry at both ends; the page uploads here instead, and a
 * Node caller just reads the file. The agent gets a path, not a payload.
 */

const PROJECTS_ROOT =
  process.env.OPENCUT_PROJECTS_DIR ?? path.join(homedir(), "OpenCutProjects");
const SAFE = /^[A-Za-z0-9_.-]{1,160}$/;

function exportsDir(projectId: string): string {
  if (!SAFE.test(projectId)) throw new Error(`Unsafe project id: ${JSON.stringify(projectId)}`);
  return path.join(PROJECTS_ROOT, projectId, "exports");
}

type Context = { params: Promise<{ projectId: string; name?: string[] }> };

const failed = (error: unknown, status = 400) =>
  NextResponse.json(
    { error: error instanceof Error ? error.message : String(error) },
    { status },
  );

export async function GET(_request: Request, { params }: Context) {
  const { projectId, name } = await params;
  try {
    const dir = exportsDir(projectId);
    if (!name || name.length === 0) {
      const entries = await readdir(dir).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [] as string[];
        throw error;
      });
      const files = [];
      for (const entry of entries) {
        if (entry.startsWith(".")) continue;
        const info = await stat(path.join(dir, entry));
        files.push({ name: entry, path: path.join(dir, entry), sizeBytes: info.size });
      }
      return NextResponse.json({ dir, files });
    }
    const target = name[0];
    if (!SAFE.test(target)) return failed(new Error("Unsafe export name"));
    const file = path.join(dir, target);
    const info = await stat(file);
    return new NextResponse(new Uint8Array(await readFile(file)), {
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(info.size),
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return failed(error);
  }
}

export async function PUT(request: Request, { params }: Context) {
  const { projectId, name } = await params;
  try {
    const target = name?.[0];
    if (!target || !SAFE.test(target)) return failed(new Error("PUT requires a safe export name"));
    const dir = exportsDir(projectId);
    await mkdir(dir, { recursive: true });
    // Write-then-rename so a caller polling the directory never sees a
    // half-uploaded file and mistakes it for a finished export.
    const temporary = path.join(dir, `.${randomUUID()}.tmp`);
    await writeFile(temporary, Buffer.from(await request.arrayBuffer()));
    const final = path.join(dir, target);
    await rename(temporary, final);
    const info = await stat(final);
    return NextResponse.json({ ok: true, path: final, sizeBytes: info.size });
  } catch (error) {
    return failed(error);
  }
}
