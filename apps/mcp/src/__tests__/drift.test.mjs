import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { OperationSchema, SCHEMA_OPERATION_TYPES } from "../schema.mjs";
import { createOpenCutMcpServer } from "../server.mjs";
import { supportedOperationTypes as fileOperationTypes } from "../document.mjs";

const registryPath = fileURLToPath(
  new URL("../../../web/src/agent/operations.ts", import.meta.url),
);

/**
 * The page registry is the source of truth for what can execute; this server's
 * zod union only decides what an agent may ask for. If the two drift, an agent
 * either cannot reach a real capability or gets a confident schema for one that
 * does not exist. Neither failure is visible at runtime, so it is checked here.
 */
function registryOperationTypes() {
  const source = readFileSync(registryPath, "utf8");
  const block = source.match(/COMMAND_FACTORIES[^=]*=\s*\{([\s\S]*?)\n\};/);
  assert.ok(block, "could not locate COMMAND_FACTORIES in operations.ts");
  const types = [...block[1].matchAll(/^\s{2}"([^"]+)":/gm)].map((m) => m[1]);
  assert.ok(types.length > 0, "parsed zero operation types — the parser is broken, not the code");
  return types;
}

test("the MCP schema advertises exactly what the page registry can execute", () => {
  assert.deepEqual(SCHEMA_OPERATION_TYPES.slice().sort(), registryOperationTypes().sort());
});

test("SCHEMA_OPERATION_TYPES matches the zod union it claims to describe", () => {
  const inUnion = OperationSchema.options.map((option) => option.shape.type.value);
  assert.deepEqual(inUnion.slice().sort(), SCHEMA_OPERATION_TYPES.slice().sort());
});

test("a malformed operation is refused by the schema, not sent to the page", () => {
  assert.equal(OperationSchema.safeParse({ type: "track.toggleMute" }).success, false);
  assert.equal(OperationSchema.safeParse({ type: "nope", trackId: "t" }).success, false);
  assert.equal(
    OperationSchema.safeParse({ type: "track.toggleMute", trackId: "t" }).success,
    true,
  );
});

test("the file implementation speaks exactly the same vocabulary as the page", () => {
  // Three declarations of the same vocabulary now: the page registry (what the
  // editor can execute), this schema (what an agent may ask for), and the file
  // implementation (what can be done without a browser). An operation missing
  // from any one of them is a capability that works one way and not the other,
  // which is worse than not having it at all.
  assert.deepEqual(fileOperationTypes().slice().sort(), registryOperationTypes().sort());
  assert.deepEqual(fileOperationTypes().slice().sort(), SCHEMA_OPERATION_TYPES.slice().sort());
});

test("the server exposes the agent tool surface", async () => {
  const server = createOpenCutMcpServer();
  const registered = Object.keys(server._registeredTools ?? {});
  for (const name of [
    "status", "get_state", "get_context", "reveal_context",
    "list_operations", "apply_operation", "render_frames", "undo", "redo",
    "list_projects", "read_project", "edit_project",
    "get_active_project", "read_agent_context",
    "list_media", "import_media", "delete_media", "analyze_audio",
    "inspect_media", "inspect_media_scenes", "inspect_timeline_range",
    "build_media_catalog", "read_media_catalog", "save_media_analysis",
    "lint_cut",
    "create_project", "delete_project",
    "start_export", "get_export", "cancel_export",
    "start_transcribe", "get_transcribe",
    "wait_for_sync", "list_revisions", "compare_revision", "restore_revision",
    "open_editor", "close_editor",
  ]) {
    assert.ok(registered.includes(name), `missing tool: ${name}`);
  }
});

test("reversible project edits are not advertised as destructive", () => {
  const server = createOpenCutMcpServer();
  const editProject = server._registeredTools?.edit_project;

  assert.equal(editProject?.annotations?.readOnlyHint, false);
  assert.equal(
    editProject?.annotations?.destructiveHint,
    false,
    "edit_project is revisioned, atomic, and recoverable, so Codex should not pause for destructive-tool approval",
  );
  assert.equal(
    server._registeredTools?.delete_project?.annotations?.destructiveHint,
    true,
    "actual deletion must remain explicitly destructive",
  );
});
