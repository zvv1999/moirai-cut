import fs from "node:fs/promises";
import { createHash } from "node:crypto";

/** Transport-only initializer. Saved user work wins; Rust validates a missing style. */
export async function initializeStyleSeed(seedName, {
  baseUrl = process.env.WORKBENCH_URL ?? "http://127.0.0.1:3000",
  request = fetch,
} = {}) {
  if (!/^[a-z0-9-]+\.json$/.test(seedName)) throw new Error("Expected a seed filename");
  const definition = JSON.parse(await fs.readFile(new URL(`./seeds/${seedName}`, import.meta.url), "utf8"));
  const base = `${baseUrl.replace(/\/$/, "")}/api/footage/templates`;
  async function api(path, body) {
    const response = await request(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", "x-requested-with": "moirai-footage" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(value));
    return value;
  }
  const saved = (await api("/dynamic-assets")).assets.find((asset) => asset.id === definition.id);
  if (saved) return saved;
  const normalized = (await api("/dynamic-assets/inspect", definition)).definition;
  const fingerprint = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  return (await api("/dynamic-assets", {
    definition: normalized, baseRevision: 0, idempotencyKey: `seed-${fingerprint}`,
  })).definition;
}
