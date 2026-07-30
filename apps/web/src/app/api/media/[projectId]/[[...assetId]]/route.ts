import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import type { ReadableOptions } from "node:stream";

/**
 * Media bytes on disk, beside the project document.
 *
 * Layout:
 *   <root>/<projectId>/media/index.json      assetId -> metadata + file extension
 *   <root>/<projectId>/media/<assetId>.<ext> the bytes
 *
 * The index deliberately lives in its own file rather than inside project.json:
 * an import would otherwise bump the project revision, which collides with the
 * document's compare-and-swap and makes the editor reload for a change that did
 * not touch the timeline.
 */

const PROJECTS_ROOT =
  process.env.OPENCUT_PROJECTS_DIR ?? path.join(homedir(), "OpenCutProjects");

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_EXT = /^[A-Za-z0-9]{1,8}$/;

function mediaDir(projectId: string): string {
  if (!SAFE_ID.test(projectId)) throw new Error(`Unsafe project id: ${JSON.stringify(projectId)}`);
  return path.join(PROJECTS_ROOT, projectId, "media");
}

const indexPath = (projectId: string) => path.join(mediaDir(projectId), "index.json");

type MediaIndex = Record<string, { ext: string; mimeType?: string } & Record<string, unknown>>;

function mediaResponseHeaders({
  id,
  entry,
}: {
  id: string;
  entry: MediaIndex[string];
}): Record<string, string> {
  return {
    "x-opencut-media-name": encodeURIComponent(
      typeof entry.name === "string" ? entry.name : id,
    ),
    "x-opencut-media-last-modified": String(
      typeof entry.lastModified === "number" ? entry.lastModified : 0,
    ),
  };
}

async function readIndex(projectId: string): Promise<MediaIndex> {
  try {
    return JSON.parse(await readFile(indexPath(projectId), "utf8")) as MediaIndex;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function writeIndex(projectId: string, index: MediaIndex): Promise<void> {
  const dir = mediaDir(projectId);
  await mkdir(dir, { recursive: true });
  const temporary = path.join(dir, `.index.json.${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(index, null, 2), "utf8");
  await rename(temporary, indexPath(projectId));
}

function assetPath(projectId: string, assetId: string, ext: string): string {
  if (!SAFE_ID.test(assetId)) throw new Error(`Unsafe asset id: ${JSON.stringify(assetId)}`);
  if (!SAFE_EXT.test(ext)) throw new Error(`Unsafe extension: ${JSON.stringify(ext)}`);
  return path.join(mediaDir(projectId), `${assetId}.${ext}`);
}

const failed = (error: unknown, status = 400) =>
  NextResponse.json(
    { error: error instanceof Error ? error.message : String(error) },
    { status },
  );

type Context = { params: Promise<{ projectId: string; assetId?: string[] }> };

function nodeStreamToWeb(filePath: string, options: ReadableOptions & { start?: number; end?: number }) {
  const stream = createReadStream(filePath, options);
  return new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk as Buffer)));
      stream.on("end", () => controller.close());
      stream.on("error", (error) => controller.error(error));
    },
    cancel() {
      stream.destroy();
    },
  });
}

export async function GET(request: Request, { params }: Context) {
  const { projectId, assetId } = await params;
  try {
    const index = await readIndex(projectId);
    if (!assetId || assetId.length === 0) {
      return NextResponse.json({ assets: index });
    }
    const id = assetId[0];
    const entry = index[id];
    if (!entry) return NextResponse.json({ error: `No asset ${id}` }, { status: 404 });

    const file = assetPath(projectId, id, entry.ext);
    const { size } = await stat(file);
    const contentType = entry.mimeType ?? "application/octet-stream";

    // mediabunny's UrlSource probes with `Range: bytes=0-`, requires a 206 with a
    // parseable Content-Range, and THROWS on any non-206 once it is reading past
    // the start. A plain 200 silently degrades it to downloading the whole file.
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range.trim());
      if (!match) {
        return new NextResponse(null, {
          status: 416,
          headers: { "content-range": `bytes */${size}`, "accept-ranges": "bytes" },
        });
      }
      const start = Number(match[1]);
      const end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
      if (start >= size || end < start) {
        return new NextResponse(null, {
          status: 416,
          headers: { "content-range": `bytes */${size}`, "accept-ranges": "bytes" },
        });
      }
      return new NextResponse(nodeStreamToWeb(file, { start, end }) as unknown as BodyInit, {
        status: 206,
        headers: {
          "content-type": contentType,
          "content-length": String(end - start + 1),
          "content-range": `bytes ${start}-${end}/${size}`,
          "accept-ranges": "bytes",
          "cache-control": "no-store",
          ...mediaResponseHeaders({ id, entry }),
        },
      });
    }

    return new NextResponse(nodeStreamToWeb(file, {}) as unknown as BodyInit, {
      headers: {
        "content-type": contentType,
        "content-length": String(size),
        "accept-ranges": "bytes",
        "cache-control": "no-store",
        ...mediaResponseHeaders({ id, entry }),
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
  const { projectId, assetId } = await params;
  try {
    // PUT with no asset id replaces the index; with one, it writes bytes.
    if (!assetId || assetId.length === 0) {
      await writeIndex(projectId, (await request.json()) as MediaIndex);
      return NextResponse.json({ ok: true });
    }
    const id = assetId[0];
    const ext = new URL(request.url).searchParams.get("ext") ?? "bin";
    const mimeType = request.headers.get("content-type") ?? "application/octet-stream";
    const dir = mediaDir(projectId);
    await mkdir(dir, { recursive: true });

    const target = assetPath(projectId, id, ext);
    const temporary = path.join(dir, `.${id}.${randomUUID()}.tmp`);
    await writeFile(temporary, Buffer.from(await request.arrayBuffer()));
    await rename(temporary, target);

    const index = await readIndex(projectId);
    index[id] = { ...(index[id] ?? {}), ext, mimeType };
    await writeIndex(projectId, index);
    return NextResponse.json({ ok: true, path: target });
  } catch (error) {
    return failed(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const { projectId, assetId } = await params;
  try {
    const index = await readIndex(projectId);
    if (!assetId || assetId.length === 0) {
      await rm(mediaDir(projectId), { recursive: true, force: true });
      return NextResponse.json({ ok: true });
    }
    const id = assetId[0];
    const entry = index[id];
    if (entry) {
      // Renamed into .trash rather than unlinked: an element on the timeline may
      // still reference this asset, and an undo of the delete has to be able to
      // find the bytes again.
      const trash = path.join(mediaDir(projectId), ".trash");
      await mkdir(trash, { recursive: true });
      await rename(
        assetPath(projectId, id, entry.ext),
        path.join(trash, `${id}.${entry.ext}`),
      ).catch(() => undefined);
      // A proxied still has an archived original beside it, outside the index;
      // trash it too or deleting the asset leaves an orphan on disk.
      const original = (entry as { original?: { ext?: string } }).original;
      if (original?.ext && SAFE_EXT.test(original.ext)) {
        await rename(
          assetPath(projectId, `${id}-original`, original.ext),
          path.join(trash, `${id}-original.${original.ext}`),
        ).catch(() => undefined);
      }
      delete index[id];
      await writeIndex(projectId, index);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error);
  }
}
