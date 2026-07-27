import type { StorageAdapter } from "./types";

/**
 * A StorageAdapter backed by files on disk, via the local /api/projects route.
 *
 * This is the seam that takes the authoritative document out of the browser.
 * IndexedDB and OPFS are reachable only from inside a tab, which is what forced
 * an agent to drive the editor through CDP; once the document is a file, a Node
 * process can read and write it directly and the page becomes a shell that
 * loads it.
 *
 * Deliberately the same five-method interface as the IndexedDB adapter, plus the
 * `getAll` that `StorageService` also depends on, so swapping it in is a
 * one-line change rather than a rewrite of the storage service.
 */
/**
 * Raised when the file changed since this adapter last read it — someone else
 * (an agent, another window, git) wrote it. The caller must re-read and decide;
 * writing anyway is precisely the silent data loss this exists to prevent.
 */
export class ProjectConflictError extends Error {
  constructor(
    readonly projectId: string,
    readonly actualRevision: number,
    readonly expectedRevision: number,
  ) {
    super(
      `Project ${projectId} changed on disk: it is at revision ${actualRevision}, not ${expectedRevision}. Re-read it before saving.`,
    );
    this.name = "ProjectConflictError";
  }
}

export class FileAdapter<T> implements StorageAdapter<T> {
  /** Last revision this adapter saw per project, used as the CAS token. */
  private seenRevision = new Map<string, number>();

  constructor(private basePath = "/api/projects") {}

  private url(key?: string): string {
    return key === undefined ? this.basePath : `${this.basePath}/${encodeURIComponent(key)}`;
  }

  private async request(
    method: string,
    key?: string,
    body?: string,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    const response = await fetch(this.url(key), {
      method,
      ...(body === undefined
        ? { headers }
        : { body, headers: { "content-type": "application/json", ...headers } }),
    });
    if (!response.ok) {
      let payload: { error?: string; code?: string; revision?: number } = {};
      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        /* fall back to the status text */
      }
      if (response.status === 409 && key !== undefined) {
        const actual = payload.revision ?? 0;
        const expected = this.seenRevision.get(key) ?? 0;
        // Adopt the real revision so a caller that re-reads and retries is not
        // stuck failing forever against a token it can never satisfy.
        this.seenRevision.set(key, actual);
        throw new ProjectConflictError(key, actual, expected);
      }
      throw new Error(`Project storage ${method} failed: ${payload.error ?? response.statusText}`);
    }
    return response;
  }

  /** What this adapter believes is on disk. Null if it has not read it yet. */
  knownRevision(key: string): number | null {
    return this.seenRevision.get(key) ?? null;
  }

  async get(key: string): Promise<T | null> {
    const response = await this.request("GET", key);
    const value = (await response.json()) as (T & { revision?: number }) | null;
    if (value && typeof value.revision === "number") {
      this.seenRevision.set(key, value.revision);
    } else if (value) {
      // A file with no revision yet (pre-CAS) reads as 0, matching the route.
      this.seenRevision.set(key, 0);
    }
    return value as T | null;
  }

  async set({ key, value }: { key: string; value: T }): Promise<void> {
    const expected = this.seenRevision.get(key);
    const response = await this.request(
      "PUT",
      key,
      JSON.stringify(value, null, 2),
      // Omitted when unknown: a first write must not be blocked by a token this
      // adapter never had. Once it has read or written once, every save is gated.
      expected === undefined ? {} : { "if-match": String(expected) },
    );
    const { revision } = (await response.json()) as { revision: number };
    this.seenRevision.set(key, revision);
  }

  async remove(key: string): Promise<void> {
    await this.request("DELETE", key);
  }

  async list(): Promise<string[]> {
    const response = await this.request("GET");
    return ((await response.json()) as { ids: string[] }).ids;
  }

  async clear(): Promise<void> {
    await this.request("DELETE");
  }

  async getAll(): Promise<T[]> {
    // Sequential rather than parallel: a project list is small, and hammering
    // the route with N concurrent reads buys nothing but file-handle pressure.
    const values: T[] = [];
    for (const key of await this.list()) {
      const value = await this.get(key);
      if (value !== null) values.push(value);
    }
    return values;
  }

  /** Where the files actually live — worth surfacing so a human can go look. */
  async root(): Promise<string> {
    const response = await this.request("GET");
    return ((await response.json()) as { root: string }).root;
  }
}
