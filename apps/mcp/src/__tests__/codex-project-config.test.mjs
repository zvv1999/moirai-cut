import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the repository exposes OpenCut MCP to Codex App without LocalCut", async () => {
  const config = await readFile(
    new URL("../../../../.codex/config.toml", import.meta.url),
    "utf8",
  );
  assert.match(config, /\[mcp_servers\.opencut\]/);
  assert.match(config, /command\s*=\s*"bun"/);
  assert.match(config, /apps\/mcp\/src\/server\.mjs/);
  assert.match(config, /OPENCUT_BASE_URL/);
  assert.match(config, /OPENCUT_PROJECTS_DIR/);
  assert.doesNotMatch(config, /localcut/i);
});
