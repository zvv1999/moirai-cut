import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Tells the editor when the project file changed underneath it.
 *
 * Without this the file is write-only from the editor's point of view: an agent
 * (or git, or another window) can edit the document on disk and the editor will
 * neither see it nor stop itself from overwriting it on the next autosave.
 *
 * Polls rather than `fs.watch` deliberately. `fs.watch` semantics differ per
 * platform and per editor-save strategy — the write-then-rename in the projects
 * route in particular shows up as a rename, not a change, on some of them. A
 * one-second poll of a small JSON file is cheap and behaves the same everywhere.
 */

export const dynamic = "force-dynamic";

const PROJECTS_ROOT =
  process.env.OPENCUT_PROJECTS_DIR ?? path.join(homedir(), "OpenCutProjects");
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const POLL_MS = 1000;

async function readRevision(id: string): Promise<number | null> {
  try {
    const contents = await readFile(path.join(PROJECTS_ROOT, id, "project.json"), "utf8");
    const parsed = JSON.parse(contents) as { revision?: unknown };
    return typeof parsed.revision === "number" ? parsed.revision : 0;
  } catch {
    // Missing or momentarily unreadable (mid-rename): report "unknown" rather
    // than a number, so a transient read never looks like a real revision change.
    return null;
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!SAFE_ID.test(id)) {
    return new Response(JSON.stringify({ error: "Unsafe project id" }), { status: 400 });
  }

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      let lastSent: number | null = await readRevision(id);
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* client went away between the poll and the write */
        }
      };
      send({ type: "hello", revision: lastSent });

      timer = setInterval(async () => {
        const revision = await readRevision(id);
        if (revision === null || revision === lastSent) return;
        lastSent = revision;
        send({ type: "revision", revision });
      }, POLL_MS);

      // Abort fires on tab close, navigation, and HMR reload; without cleanup
      // every dev reload would leak another interval polling the same file.
      request.signal.addEventListener("abort", () => {
        if (timer) clearInterval(timer);
        timer = null;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
