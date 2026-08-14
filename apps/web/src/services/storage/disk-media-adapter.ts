import type { StorageAdapter } from "./types";

/**
 * Media bytes and metadata on disk, via /api/media.
 *
 * Two adapters, matching the shape `StorageService` already expects: one for the
 * bytes (a `File`, same as the OPFS adapter returns) and one for the metadata
 * record. Both are backed by the project's own folder, so an agent — or ffmpeg,
 * or Finder — can put a file there and the editor will load it.
 *
 * KNOWN COST: `loadAllMediaAssets` materialises every asset when a project
 * opens, and a fetched Blob is not lazy the way OPFS's `getFile()` handle is. A
 * very large library therefore costs real memory at open. Keeping `File` is what
 * makes this a drop-in: every consumer in the app (`BlobSource(clip.file)` in
 * audio-manager, video-cache, media/audio, scene-builder) is built around a real
 * File, and swapping them to mediabunny's UrlSource is a separate change.
 */

const EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

function extensionFor(file: File): string {
  const fromName = /\.([A-Za-z0-9]{1,8})$/.exec(file.name)?.[1];
  if (fromName) return fromName.toLowerCase();
  return EXTENSIONS[file.type] ?? "bin";
}

export class DiskMediaFileAdapter implements StorageAdapter<File> {
  constructor(private projectId: string) {}

  private url(key?: string): string {
    const base = `/api/media/${encodeURIComponent(this.projectId)}`;
    return key === undefined ? base : `${base}/${encodeURIComponent(key)}`;
  }

  async get(key: string): Promise<File | null> {
    const response = await fetch(this.url(key));
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Media read failed: ${response.statusText}`);
    const blob = await response.blob();
    const encodedName = response.headers.get("x-opencut-media-name");
    let name = key;
    if (encodedName) {
      try {
        name = decodeURIComponent(encodedName);
      } catch {
        // Keep the stable storage id when a non-OpenCut server returns bad metadata.
      }
    }
    return new File([blob], name, {
      type: blob.type || response.headers.get("content-type") || "application/octet-stream",
      lastModified: Number(
        response.headers.get("x-opencut-media-last-modified") ?? 0,
      ),
    });
  }

  async set({ key, value }: { key: string; value: File }): Promise<void> {
    const response = await fetch(`${this.url(key)}?ext=${extensionFor(value)}`, {
      method: "PUT",
      headers: { "content-type": value.type || "application/octet-stream" },
      body: value,
    });
    if (!response.ok) throw new Error(`Media write failed: ${response.statusText}`);
  }

  async remove(key: string): Promise<void> {
    const response = await fetch(this.url(key), { method: "DELETE" });
    if (!response.ok) {
      throw new Error(`Media delete failed: ${response.statusText}`);
    }
  }

  async list(): Promise<string[]> {
    return Object.keys(await this.index());
  }

  async clear(): Promise<void> {
    const response = await fetch(this.url(), { method: "DELETE" });
    if (!response.ok) {
      throw new Error(`Media clear failed: ${response.statusText}`);
    }
  }

  private async index(): Promise<Record<string, Record<string, unknown>>> {
    const response = await fetch(this.url());
    if (!response.ok) return {};
    return ((await response.json()) as { assets: Record<string, Record<string, unknown>> }).assets ?? {};
  }
}

/**
 * Metadata for the same assets, stored in the shared media/index.json.
 *
 * Deliberately the same file the byte adapter writes its `ext`/`mimeType` into:
 * one index means an asset cannot exist in one half and not the other, which is
 * the failure the OPFS/IndexedDB split has (an interrupted import leaves an
 * orphan blob that nothing ever lists).
 */
export class DiskMediaMetadataAdapter<T> implements StorageAdapter<T> {
  constructor(private projectId: string) {}

  private get base(): string {
    return `/api/media/${encodeURIComponent(this.projectId)}`;
  }

  private async index(): Promise<Record<string, Record<string, unknown>>> {
    const response = await fetch(this.base);
    if (!response.ok) return {};
    return ((await response.json()) as { assets: Record<string, Record<string, unknown>> }).assets ?? {};
  }

  private async writeIndex(index: Record<string, unknown>): Promise<void> {
    const response = await fetch(this.base, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(index),
    });
    if (!response.ok) throw new Error(`Media index write failed: ${response.statusText}`);
  }

  private async mutate({
    key,
    mutation,
  }: {
    key: string;
    mutation:
      | {
          action: "merge";
          value: Record<string, unknown>;
          removeKeys: string[];
        }
      | { action: "remove" };
  }): Promise<void> {
    const response = await fetch(`${this.base}/${encodeURIComponent(key)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mutation),
    });
    if (!response.ok) throw new Error(`Media metadata write failed: ${response.statusText}`);
  }

  async get(key: string): Promise<T | null> {
    const entry = (await this.index())[key];
    return entry ? (entry as T) : null;
  }

  async set({ key, value }: { key: string; value: T }): Promise<void> {
    const record = value as Record<string, unknown>;
    await this.mutate({
      key,
      mutation: {
        action: "merge",
        value: Object.fromEntries(
          Object.entries(record).filter(
            ([, candidate]) => candidate !== undefined,
          ),
        ),
        removeKeys: Object.keys(record).filter(
          (field) => field !== "proxy" && record[field] === undefined,
        ),
      },
    });
  }

  async remove(key: string): Promise<void> {
    await this.mutate({ key, mutation: { action: "remove" } });
  }

  async list(): Promise<string[]> {
    return Object.keys(await this.index());
  }

  async clear(): Promise<void> {
    await this.writeIndex({});
  }

  async getAll(): Promise<T[]> {
    return Object.values(await this.index()) as T[];
  }
}
