import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import type { ReadableOptions } from "node:stream";
import {
  mutateMediaIndex,
  readMediaIndex,
  withMediaIndexLock,
  type MediaIndex,
} from "@/server/media-index";

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

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_EXT = /^[A-Za-z0-9]{1,8}$/;

function projectsRoot(): string {
  return (
    process.env.OPENCUT_PROJECTS_DIR ?? path.join(homedir(), "OpenCutProjects")
  );
}

function mediaDir(projectId: string): string {
  if (!SAFE_ID.test(projectId))
    throw new Error(`Unsafe project id: ${JSON.stringify(projectId)}`);
  return path.join(projectsRoot(), projectId, "media");
}

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
  return readMediaIndex({ directory: mediaDir(projectId), allowMissing: true });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function assetPath(projectId: string, assetId: string, ext: string): string {
  if (!SAFE_ID.test(assetId))
    throw new Error(`Unsafe asset id: ${JSON.stringify(assetId)}`);
  if (!SAFE_EXT.test(ext))
    throw new Error(`Unsafe extension: ${JSON.stringify(ext)}`);
  return path.join(mediaDir(projectId), `${assetId}.${ext}`);
}

async function moveIndexedAssetToTrash({
  projectId,
  assetId,
  ext,
  trash,
}: {
  projectId: string;
  assetId: string;
  ext: string;
  trash: string;
}): Promise<{ source: string; destination: string } | null> {
  if (!SAFE_ID.test(assetId) || !SAFE_EXT.test(ext)) return null;
  const source = assetPath(projectId, assetId, ext);
  const destination = path.join(trash, `${assetId}.${ext}`);
  try {
    await rename(source, destination);
    return { source, destination };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function restoreTrashedAssets(
  moves: Array<{ source: string; destination: string }>,
): Promise<void> {
  for (const move of moves.toReversed()) {
    await rename(move.destination, move.source);
  }
}

const failed = (error: unknown, status = 400) =>
  NextResponse.json(
    { error: error instanceof Error ? error.message : String(error) },
    { status },
  );

type Context = { params: Promise<{ projectId: string; assetId?: string[] }> };

function nodeStreamToWeb(
  filePath: string,
  options: ReadableOptions & { start?: number; end?: number },
) {
  const stream = createReadStream(filePath, options);
  return new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) =>
        controller.enqueue(new Uint8Array(chunk as Buffer)),
      );
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
    if (!entry)
      return NextResponse.json({ error: `No asset ${id}` }, { status: 404 });

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
          headers: {
            "content-range": `bytes */${size}`,
            "accept-ranges": "bytes",
          },
        });
      }
      const start = Number(match[1]);
      const end =
        match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
      if (start >= size || end < start) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            "content-range": `bytes */${size}`,
            "accept-ranges": "bytes",
          },
        });
      }
      return new NextResponse(
        nodeStreamToWeb(file, { start, end }) as unknown as BodyInit,
        {
          status: 206,
          headers: {
            "content-type": contentType,
            "content-length": String(end - start + 1),
            "content-range": `bytes ${start}-${end}/${size}`,
            "accept-ranges": "bytes",
            "cache-control": "no-store",
            ...mediaResponseHeaders({ id, entry }),
          },
        },
      );
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
    // The collection PUT is now clear-only. Per-asset metadata uses PATCH so a
    // stale browser snapshot cannot replace proxy metadata written by a worker.
    if (!assetId || assetId.length === 0) {
      const replacement: unknown = await request.json();
      if (!isRecord(replacement) || Object.keys(replacement).length > 0) {
        throw new Error(
          "Bulk media index replacement is not supported; use per-asset PATCH",
        );
      }
      await mutateMediaIndex({
        directory: mediaDir(projectId),
        allowMissing: true,
        update: (index) => {
          for (const id of Object.keys(index)) delete index[id];
        },
      });
      return NextResponse.json({ ok: true });
    }
    const id = assetId[0];
    const ext = new URL(request.url).searchParams.get("ext") ?? "bin";
    const mimeType =
      request.headers.get("content-type") ?? "application/octet-stream";
    const dir = mediaDir(projectId);
    await mkdir(dir, { recursive: true });

    const target = assetPath(projectId, id, ext);
    const temporary = path.join(dir, `.${id}.${randomUUID()}.tmp`);
    await writeFile(temporary, Buffer.from(await request.arrayBuffer()));
    let previousProxyStorageId: string | undefined;
    let previousProxyExt: string | undefined;
    let previousSourceExt: string | undefined;
    try {
      await mutateMediaIndex({
        directory: dir,
        allowMissing: true,
        update: async (index) => {
          const current = index[id];
          if (
            current?.ext &&
            current.ext !== ext &&
            SAFE_EXT.test(current.ext)
          ) {
            previousSourceExt = current.ext;
          }
          const previousProxy = current?.proxy;
          if (
            isRecord(previousProxy) &&
            typeof previousProxy.storageId === "string" &&
            SAFE_ID.test(previousProxy.storageId) &&
            previousProxy.storageId.endsWith("-proxy")
          ) {
            const proxyEntry = index[previousProxy.storageId];
            if (proxyEntry && SAFE_EXT.test(proxyEntry.ext)) {
              previousProxyStorageId = previousProxy.storageId;
              previousProxyExt = proxyEntry.ext;
            }
            delete index[previousProxy.storageId];
          }
          await rename(temporary, target);
          const next: MediaIndex[string] = {
            ...(current ?? {}),
            ext,
            mimeType,
          };
          delete next.proxy;
          index[id] = next;
        },
      });
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
    await withMediaIndexLock({
      directory: dir,
      action: async () => {
        const currentIndex = await readMediaIndex({
          directory: dir,
          allowMissing: true,
        });
        const current = currentIndex[id];
        if (previousSourceExt && current?.ext !== previousSourceExt) {
          await rm(assetPath(projectId, id, previousSourceExt), {
            force: true,
          }).catch(() => undefined);
        }
        const currentProxy = current?.proxy;
        if (
          previousProxyStorageId &&
          previousProxyExt &&
          (!isRecord(currentProxy) ||
            currentProxy.storageId !== previousProxyStorageId) &&
          !currentIndex[previousProxyStorageId]
        ) {
          await rm(
            assetPath(projectId, previousProxyStorageId, previousProxyExt),
            { force: true },
          ).catch(() => undefined);
        }
      },
    });
    return NextResponse.json({ ok: true, path: target });
  } catch (error) {
    return failed(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const { projectId, assetId } = await params;
  try {
    if (!assetId || assetId.length === 0) {
      throw new Error("Media metadata mutation requires an asset id");
    }
    const id = assetId[0];
    if (!SAFE_ID.test(id))
      throw new Error(`Unsafe asset id: ${JSON.stringify(id)}`);
    const mutation: unknown = await request.json();
    if (
      !isRecord(mutation) ||
      (mutation.action !== "merge" && mutation.action !== "remove")
    ) {
      throw new Error("Invalid media metadata mutation");
    }
    const action = mutation.action;
    if (action === "merge" && !isRecord(mutation.value)) {
      throw new Error("Media metadata merge requires an object value");
    }
    const value = action === "merge" ? mutation.value : undefined;
    const removeKeys =
      action === "merge" && Array.isArray(mutation.removeKeys)
        ? mutation.removeKeys
        : [];
    if (
      removeKeys.some(
        (field) =>
          typeof field !== "string" ||
          field === "__proto__" ||
          field === "constructor" ||
          field === "prototype",
      )
    ) {
      throw new Error("Invalid media metadata removal keys");
    }
    await mutateMediaIndex({
      directory: mediaDir(projectId),
      update: (index) => {
        if (action === "remove") {
          delete index[id];
          return;
        }
        if (!isRecord(value)) throw new Error("Invalid media metadata value");
        const current = index[id];
        if (!current) throw new Error(`No media bytes for asset ${id}`);
        const accepted = { ...value };
        for (const reserved of ["__proto__", "constructor", "prototype"]) {
          delete accepted[reserved];
        }
        if ("proxy" in accepted) {
          const incomingProxy = accepted.proxy;
          const incomingStorageId = isRecord(incomingProxy)
            ? incomingProxy.storageId
            : undefined;
          if (
            typeof incomingStorageId !== "string" ||
            !SAFE_ID.test(incomingStorageId) ||
            !incomingStorageId.endsWith("-proxy") ||
            !index[incomingStorageId]
          ) {
            delete accepted.proxy;
          }
        }
        const next = { ...current };
        for (const field of removeKeys) {
          if (field !== "ext" && field !== "mimeType" && field !== "proxy") {
            delete next[field];
          }
        }
        Object.assign(next, accepted);
        next.ext = current.ext;
        next.mimeType = current.mimeType;
        index[id] = next;
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const { projectId, assetId } = await params;
  try {
    if (!assetId || assetId.length === 0) {
      const directory = mediaDir(projectId);
      await withMediaIndexLock({
        directory,
        action: () => rm(directory, { recursive: true, force: true }),
      });
      return NextResponse.json({ ok: true });
    }
    const id = assetId[0];
    if (!SAFE_ID.test(id))
      throw new Error(`Unsafe asset id: ${JSON.stringify(id)}`);
    const directory = mediaDir(projectId);
    const moves: Array<{ source: string; destination: string }> = [];
    await mutateMediaIndex({
      directory,
      update: async (index) => {
        try {
          const entry = index[id];
          if (!entry) return;
          // Renamed into .trash rather than unlinked: an element on the timeline may
          // still reference this asset, and an undo of the delete has to be able to
          // find the bytes again.
          const trash = path.join(directory, ".trash");
          await mkdir(trash, { recursive: true });
          const primaryMove = await moveIndexedAssetToTrash({
            projectId,
            assetId: id,
            ext: entry.ext,
            trash,
          });
          if (primaryMove) moves.push(primaryMove);
          const linkedProxy = entry.proxy;
          if (
            isRecord(linkedProxy) &&
            typeof linkedProxy.storageId === "string" &&
            SAFE_ID.test(linkedProxy.storageId) &&
            linkedProxy.storageId.endsWith("-proxy")
          ) {
            const proxyEntry = index[linkedProxy.storageId];
            if (proxyEntry) {
              const proxyMove = await moveIndexedAssetToTrash({
                projectId,
                assetId: linkedProxy.storageId,
                ext: proxyEntry.ext,
                trash,
              });
              if (proxyMove) moves.push(proxyMove);
              delete index[linkedProxy.storageId];
            }
          }
          for (const candidate of Object.values(index)) {
            const proxy = candidate.proxy;
            if (isRecord(proxy) && proxy.storageId === id) {
              delete candidate.proxy;
            }
          }
          // A proxied still has an archived original beside it, outside the index;
          // trash it too or deleting the asset leaves an orphan on disk.
          const original = (entry as { original?: { ext?: string } }).original;
          if (original?.ext && SAFE_EXT.test(original.ext)) {
            const originalMove = await moveIndexedAssetToTrash({
              projectId,
              assetId: `${id}-original`,
              ext: original.ext,
              trash,
            });
            if (originalMove) moves.push(originalMove);
          }
          delete index[id];
        } catch (error) {
          try {
            await restoreTrashedAssets(moves);
          } catch (rollbackError) {
            throw new AggregateError(
              [error, rollbackError],
              "Media deletion and rollback both failed",
            );
          }
          throw error;
        }
      },
      onWriteError: () => restoreTrashedAssets(moves),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error);
  }
}
