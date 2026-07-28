import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import {
	compareProjectRevisions,
	summarizeProjectRevision,
} from "@/project/revision-diff";

/**
 * Project files on disk.
 *
 * The point of this route is to move the authoritative document out of the
 * browser. While it lives in IndexedDB + OPFS it is reachable only from inside a
 * tab, which is why driving the editor from an agent needed CDP at all. As a
 * plain file, a Node process — the MCP server, LocalCut's harness, git — can
 * read and write it directly, and the browser becomes a shell that loads it.
 *
 * Layout mirrors LocalCut's bundle so the two can converge later:
 *   <root>/<projectId>/project.json
 */

const PROJECTS_ROOT =
  process.env.OPENCUT_PROJECTS_DIR ?? path.join(homedir(), "OpenCutProjects");

/**
 * Ids come from the client, and this route turns them into filesystem paths.
 * An allow-list (not a blocklist, and not `path.normalize`) is the only version
 * of this check that cannot be talked around by encoding tricks.
 */
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function projectDir(id: string): string {
  if (!SAFE_ID.test(id)) throw new Error(`Unsafe project id: ${JSON.stringify(id)}`);
  return path.join(PROJECTS_ROOT, id);
}

function projectFile(id: string): string {
  return path.join(projectDir(id), "project.json");
}

async function listProjectIds(): Promise<string[]> {
  try {
    const entries = await readdir(PROJECTS_ROOT, { withFileTypes: true });
    const ids: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !SAFE_ID.test(entry.name)) continue;
      // A directory alone is not a project — only count one that really holds a
      // document, so a half-deleted folder does not show up as a broken project.
      try {
        await readFile(projectFile(entry.name), "utf8");
        ids.push(entry.name);
      } catch {
        /* no project.json in there */
      }
    }
    return ids;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

const idOf = (segments: string[] | undefined): string | null =>
  segments && segments.length > 0 ? segments.join("/") : null;

const failed = (error: unknown, status = 400) =>
  NextResponse.json(
    { error: error instanceof Error ? error.message : String(error) },
    { status },
  );

/**
 * One write at a time per project.
 *
 * The compare-and-swap reads the current revision and writes several awaits
 * later. Without serialisation two concurrent PUTs both read 5, both satisfy
 * `if-match: 5`, both compute 6, and the second rename wins — the lost update
 * the CAS exists to prevent. Reachable in normal use: the editor's autosave and
 * an agent's edit_project can easily overlap.
 */
const writeQueues = new Map<string, Promise<unknown>>();

function withProjectLock<T>(id: string, work: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(id) ?? Promise.resolve();
  const next = previous.then(work, work);
  // Keep the chain alive but never let a rejection poison the next writer.
  writeQueues.set(
    id,
    next.catch(() => undefined),
  );
  return next;
}

async function pruneRevisionHistory({
  revDir,
  limit = 50,
}: {
  revDir: string;
  limit?: number;
}) {
  const entries = (await readdir(revDir))
    .filter((entry) => /^\d{6}\.json$/.test(entry))
    .sort();
  for (const stale of entries.slice(0, Math.max(0, entries.length - limit))) {
    await rm(path.join(revDir, stale), { force: true });
    await rm(path.join(revDir, stale.replace(/\.json$/, ".meta.json")), {
      force: true,
    });
  }
}

type Context = { params: Promise<{ segments?: string[] }> };

export async function GET(_request: Request, { params }: Context) {
  const segments = (await params).segments;
  const id = idOf(segments);
  try {
    if (id === null) {
      return NextResponse.json({ root: PROJECTS_ROOT, ids: await listProjectIds() });
    }
    // GET <id>/revisions — the snapshot list, newest first.
    if (segments && segments.length === 2 && segments[1] === "revisions") {
      const projectId = segments[0];
      const revDir = path.join(projectDir(projectId), "revisions");
      const entries = await readdir(revDir).catch(() => [] as string[]);
      const revisions = [];
      for (const entry of entries.filter((f) => /^\d{6}\.json$/.test(f)).sort().reverse()) {
        try {
          // Listing must stay cheap even when every snapshot is a multi-megabyte
          // document. Only named snapshots have a sidecar; automatic revisions
          // use the file's mtime and load their body lazily when compared.
          const snapshotPath = path.join(revDir, entry);
          const [metadata, fileInfo] = await Promise.all([
            readFile(
              path.join(revDir, entry.replace(/\.json$/, ".meta.json")),
              "utf8",
            )
              .then((value) => JSON.parse(value) as Record<string, unknown>)
              .catch(() => null),
            stat(snapshotPath),
          ]);
          revisions.push({
            revision: Number(entry.slice(0, 6)),
            name: typeof metadata?.name === "string" ? metadata.name : null,
            kind: metadata ? "named" : "automatic",
            createdAt:
              typeof metadata?.createdAt === "string" ? metadata.createdAt : null,
            updatedAt: fileInfo.mtime.toISOString(),
            summary:
              metadata?.summary &&
              typeof metadata.summary === "object" &&
              !Array.isArray(metadata.summary)
                ? metadata.summary
                : undefined,
          });
        } catch {
          /* unreadable snapshot — skip */
        }
      }
      return NextResponse.json({ revisions });
    }
    // GET <id>/compare/<revision> — diff current timeline against a snapshot.
    if (segments && segments.length === 3 && segments[1] === "compare") {
      const [projectId, , revisionRaw] = segments;
      const revisionNumber = Number(revisionRaw);
      if (!Number.isInteger(revisionNumber) || revisionNumber <= 0) {
        return failed(new Error(`Not a revision number: ${revisionRaw}`));
      }
      const targetPath = path.join(
        projectDir(projectId),
        "revisions",
        `${String(revisionNumber).padStart(6, "0")}.json`,
      );
      const targetText = await readFile(targetPath, "utf8").catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      });
      if (targetText === null) {
        return failed(
          new Error(
            `No snapshot for revision ${revisionNumber} (history keeps the newest 50)`,
          ),
          404,
        );
      }
      const currentText = await readFile(projectFile(projectId), "utf8");
      const current = JSON.parse(currentText);
      const target = JSON.parse(targetText);
      return NextResponse.json(compareProjectRevisions({ current, target }));
    }
    if (segments && segments.length > 1) {
      return failed(new Error("Unknown project sub-resource"), 404);
    }
    const contents = await readFile(projectFile(id), "utf8");
    // Returned as text and parsed by the caller: re-serialising here would be a
    // second chance to change the bytes the editor and the agent both read.
    return new NextResponse(contents, {
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json(null);
    }
    return failed(error);
  }
}

/** Current on-disk revision, or 0 when the project does not exist yet. */
async function currentRevision(id: string): Promise<number> {
  try {
    const parsed = JSON.parse(await readFile(projectFile(id), "utf8")) as {
      revision?: unknown;
    };
    return typeof parsed.revision === "number" ? parsed.revision : 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}

export async function PUT(request: Request, { params }: Context) {
  const id = idOf((await params).segments);
  if (id === null) return failed(new Error("PUT requires a project id"), 405);
  // Read the body before taking the lock: it does not touch shared state, and
  // holding the lock across the network read would stall other writers.
  const body = await request.text();
  return withProjectLock(id, () => writeProjectFile(id, body, request.headers.get("if-match")));
}

async function writeProjectFile(id: string, body: string, ifMatch: string | null) {
  try {
    // Parse before writing: a malformed body must not replace a good document.
    const document = JSON.parse(body) as Record<string, unknown>;

    // Compare-and-swap. Without this, two writers holding the same document
    // each write their whole copy and the later one silently erases the other's
    // work — which is exactly what happens today when an agent edits the file
    // while the editor has it open. A conflict must be an error, not a merge.
    const onDisk = await currentRevision(id);
    if (ifMatch !== null && Number(ifMatch) !== onDisk) {
      return NextResponse.json(
        {
          error: `Project ${id} is at revision ${onDisk}, not ${ifMatch}. Re-read it and retry.`,
          code: "revision_conflict",
          revision: onDisk,
        },
        { status: 409 },
      );
    }

    // The route owns the revision: a client-supplied one is discarded, so a
    // caller cannot rewind history by echoing back a stale number.
    const revision = onDisk + 1;
    const contents = JSON.stringify({ ...document, revision }, null, 2);

    const dir = projectDir(id);
    await mkdir(dir, { recursive: true });

    // Snapshot what is being replaced, BEFORE the rename. This is what makes an
    // agent's batch reversible by a human: agent edits arrive via reload and are
    // not in any tab's undo stack, so without these files a bad batch is simply
    // permanent. Bounded to the newest 50 — a history that grows forever is a
    // disk leak wearing a feature's clothes.
    if (onDisk > 0) {
      try {
        const previous = await readFile(projectFile(id), "utf8");
        const revDir = path.join(dir, "revisions");
        await mkdir(revDir, { recursive: true });
        await writeFile(path.join(revDir, `${String(onDisk).padStart(6, "0")}.json`), previous, "utf8");
        await pruneRevisionHistory({ revDir });
      } catch {
        // A failed snapshot must not block the write itself.
      }
    }
    // Write-then-rename, so a crash mid-write cannot leave a truncated
    // project.json where a whole one used to be.
    // Per-request entropy, not just the pid: two concurrent PUTs for the same
    // project in the same process would otherwise resolve to the SAME temp path
    // and interleave their writes into one file before either rename. The
    // rename is atomic; what it renames would not have been either document.
    const temporary = path.join(dir, `.project.json.${randomUUID()}.tmp`);
    await writeFile(temporary, contents, "utf8");
    await rename(temporary, projectFile(id));
    return NextResponse.json({ ok: true, path: projectFile(id), revision });
  } catch (error) {
    return failed(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  const segments = (await params).segments;
  // POST <id>/snapshots — name the current revision without mutating it.
  if (segments && segments.length === 2 && segments[1] === "snapshots") {
    const id = segments[0];
    const body = (await request.json().catch(() => ({}))) as {
      name?: unknown;
      expectedRevision?: unknown;
    };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 80) {
      return failed(new Error("Snapshot name must be between 1 and 80 characters"));
    }
    return withProjectLock(id, async () => {
      try {
        const documentText = await readFile(projectFile(id), "utf8");
        const document = JSON.parse(documentText) as Record<string, unknown>;
        const revision =
          typeof document.revision === "number" ? document.revision : 0;
        if (
          body.expectedRevision !== undefined &&
          Number(body.expectedRevision) !== revision
        ) {
          return NextResponse.json(
            {
              error: `Project ${id} is at revision ${revision}, not ${body.expectedRevision}. Refresh before snapshotting.`,
              code: "revision_conflict",
              revision,
            },
            { status: 409 },
          );
        }
        if (revision <= 0) {
          return failed(new Error("Save the project before creating a snapshot"));
        }
        const revDir = path.join(projectDir(id), "revisions");
        await mkdir(revDir, { recursive: true });
        const stem = String(revision).padStart(6, "0");
        await writeFile(path.join(revDir, `${stem}.json`), documentText, "utf8");
        await writeFile(
          path.join(revDir, `${stem}.meta.json`),
          JSON.stringify(
            {
              name,
              createdAt: new Date().toISOString(),
              summary: summarizeProjectRevision({ document }),
            },
            null,
            2,
          ),
          "utf8",
        );
        await pruneRevisionHistory({ revDir });
        return NextResponse.json({ ok: true, name, revision });
      } catch (error) {
        return failed(error);
      }
    }) as Promise<NextResponse>;
  }
  // POST <id>/restore/<revision> — roll the document back to a snapshot.
  if (!segments || segments.length !== 3 || segments[1] !== "restore") {
    return failed(new Error("POST supports only <id>/restore/<revision>"), 405);
  }
  const [id, , revisionRaw] = segments;
  const revisionNumber = Number(revisionRaw);
  if (!Number.isInteger(revisionNumber) || revisionNumber <= 0) {
    return failed(new Error(`Not a revision number: ${revisionRaw}`));
  }
  const body = (await request.json().catch(() => ({}))) as {
    expectedRevision?: unknown;
  };
  return withProjectLock(id, async () => {
    try {
      const snapshotPath = path.join(
        projectDir(id),
        "revisions",
        `${String(revisionNumber).padStart(6, "0")}.json`,
      );
      const snapshot = await readFile(snapshotPath, "utf8").catch(() => null);
      if (snapshot === null) {
        return failed(new Error(`No snapshot for revision ${revisionNumber} (history keeps the newest 50)`), 404);
      }
      // Restoring goes FORWARD: the snapshot content becomes a NEW revision.
      // Rewinding the counter would let a stale CAS token authorise a write.
      const document = JSON.parse(snapshot) as Record<string, unknown>;
      const onDisk = await currentRevision(id);
      const expectedRevision =
        request.headers.get("if-match") ?? body.expectedRevision;
      if (
        expectedRevision !== undefined &&
        expectedRevision !== null &&
        Number(expectedRevision) !== onDisk
      ) {
        return NextResponse.json(
          {
            error: `Project ${id} is at revision ${onDisk}, not ${expectedRevision}. Compare again before restoring.`,
            code: "revision_conflict",
            revision: onDisk,
          },
          { status: 409 },
        );
      }
      const revision = onDisk + 1;
      const contents = JSON.stringify({ ...document, revision }, null, 2);
      const dir = projectDir(id);
      // Snapshot the current state too, so a restore is itself restorable.
      try {
        const current = await readFile(projectFile(id), "utf8");
        const revDir = path.join(dir, "revisions");
        await mkdir(revDir, { recursive: true });
        await writeFile(path.join(revDir, `${String(onDisk).padStart(6, "0")}.json`), current, "utf8");
        await pruneRevisionHistory({ revDir });
      } catch {
        /* best effort */
      }
      const temporary = path.join(dir, `.project.json.${randomUUID()}.tmp`);
      await writeFile(temporary, contents, "utf8");
      await rename(temporary, projectFile(id));
      return NextResponse.json({ ok: true, restoredFrom: revisionNumber, revision });
    } catch (error) {
      return failed(error);
    }
  }) as Promise<NextResponse>;
}

export async function DELETE(_request: Request, { params }: Context) {
  const id = idOf((await params).segments);
  try {
    if (id === null) {
      for (const existing of await listProjectIds()) {
        await rm(projectDir(existing), { recursive: true, force: true });
      }
      return NextResponse.json({ ok: true });
    }
    await rm(projectDir(id), { recursive: true, force: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error);
  }
}
