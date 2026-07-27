import WebSocket from "ws";

/**
 * Minimal Chrome DevTools Protocol client.
 *
 * The editor's authoritative document lives inside the tab (IndexedDB + OPFS),
 * so a Node process cannot reach it directly — it has to talk *through* a page.
 * This attaches to a Chrome that is already running with a debugging port, which
 * is the shape that matches the product: the human keeps the editor open and the
 * agent edits alongside them, against the same live document.
 *
 * Start Chrome with:
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *     --remote-debugging-port=9222 --user-data-dir=/tmp/opencut-agent-profile
 */

const DEFAULT_PORT = Number(process.env.OPENCUT_CDP_PORT || 9222);
const DEFAULT_URL_MATCH = process.env.OPENCUT_URL_MATCH || "/editor/";

export class CdpError extends Error {
  constructor(message, { code = "cdp_error", hint } = {}) {
    super(message);
    this.name = "CdpError";
    this.code = code;
    this.hint = hint;
  }
}

async function listTargets(port) {
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${port}/json/list`);
  } catch (cause) {
    throw new CdpError(`No Chrome DevTools endpoint on port ${port}.`, {
      code: "no_browser",
      hint:
        `Start Chrome with a debugging port, e.g.\n` +
        `  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=${port} --user-data-dir=/tmp/opencut-agent-profile\n` +
        `then open the OpenCut editor in it.`,
    });
  }
  if (!response.ok) throw new CdpError(`DevTools endpoint returned ${response.status}.`);
  return response.json();
}

/**
 * Find the editor tab.
 *
 * `projectId` NARROWS the editor-tab match; it never replaces it. Matching on
 * the id alone would let any unrelated page whose URL happens to contain the
 * string be driven as if it were the editor — and since a short or truncated id
 * is a substring of far more URLs, the failure would be silent rather than loud.
 * For the same reason an ambiguous match is an error, not a coin flip: picking
 * "whichever tab /json/list returned first" would edit an arbitrary document.
 */
export async function findEditorTarget({ port = DEFAULT_PORT, projectId } = {}) {
  const targets = await listTargets(port);
  const pages = targets.filter(
    (t) => t.type === "page" && typeof t.url === "string" && t.url.includes(DEFAULT_URL_MATCH),
  );
  const matches = projectId ? pages.filter((t) => t.url.includes(projectId)) : pages;

  if (matches.length === 0) {
    const open = targets.filter((t) => t.type === "page").map((t) => t.url).join("\n  ");
    throw new CdpError(
      projectId
        ? `No open editor tab for project ${projectId}.`
        : `No open OpenCut editor tab (looking for a URL containing "${DEFAULT_URL_MATCH}").`,
      { code: "no_editor_tab", hint: `Open tabs:\n  ${open || "(no pages)"}` },
    );
  }
  if (matches.length > 1) {
    throw new CdpError(
      `${matches.length} editor tabs match — refusing to guess which one to edit.`,
      {
        code: "ambiguous_editor_tab",
        hint: `Pass projectId to disambiguate. Matching tabs:\n  ${matches
          .map((t) => t.url)
          .join("\n  ")}`,
      },
    );
  }

  const [match] = matches;
  if (typeof match.webSocketDebuggerUrl !== "string" || !match.webSocketDebuggerUrl) {
    throw new CdpError(`Editor tab ${match.url} exposes no debugger socket.`, {
      code: "no_debugger_socket",
      hint: "Another client (an open DevTools window) may already be attached to it.",
    });
  }
  return match;
}

/**
 * Evaluate an expression in the page and return its value.
 * Uses awaitPromise so the caller can hand us async expressions later.
 */
export function evaluateInPage({ webSocketDebuggerUrl, expression, timeoutMs = 10_000 }) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
    const id = 1;
    // `close()` and `terminate()` can themselves emit 'error'/'close' after the
    // promise has settled, so every path funnels through this one flag. Without
    // it the late event wins and masks the real reason with a generic one.
    let settled = false;

    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch { /* already closing */ }
      fn(value);
    };

    const timer = setTimeout(() => {
      done(reject, new CdpError(`Timed out after ${timeoutMs}ms evaluating in the page.`, { code: "timeout" }));
      try { socket.terminate(); } catch { /* already gone */ }
    }, timeoutMs);

    socket.on("error", (error) =>
      done(reject, new CdpError(`CDP socket error: ${error.message}`, { code: "socket_error" })),
    );
    // Without this, a tab that closes or navigates mid-call leaves the promise
    // pending until the timeout, and then blames a timeout for a vanished tab.
    socket.on("close", (code) =>
      done(
        reject,
        new CdpError(`The editor tab closed the debugger connection (code ${code}).`, {
          code: "target_gone",
          hint: "The tab was closed, navigated, or the renderer crashed. Re-check with `status`.",
        }),
      ),
    );
    socket.on("open", () => {
      socket.send(
        JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true, awaitPromise: true },
        }),
      );
    });
    socket.on("message", (raw) => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (message.id !== id) return;
      if (message.error) {
        return done(reject, new CdpError(message.error.message || "CDP call failed"));
      }
      const { result, exceptionDetails } = message.result ?? {};
      if (exceptionDetails) {
        const text =
          exceptionDetails.exception?.description ||
          exceptionDetails.text ||
          "Page threw during evaluation";
        return done(reject, new CdpError(text, { code: "page_exception" }));
      }
      done(resolve, result?.value);
    });
  });
}

/**
 * Call one method on the page's agent bridge.
 * Returns the bridge's own {ok, data|error} envelope untouched, so MCP callers
 * see the same revision/conflict semantics the browser reports.
 */
export async function callBridge({ method, args = [], port = DEFAULT_PORT, projectId, target: resolved } = {}) {
  const target = resolved ?? (await findEditorTarget({ port, projectId }));
  // Every interpolation goes through JSON.stringify, including inside the error
  // message: the values land in JSON string literals in the page source, where
  // quotes and backslashes are escaped and `${`/backticks are inert.
  const name = JSON.stringify(method);
  const expression = `(() => {
    const bridge = window.__opencutAgent;
    if (!bridge) {
      return { ok: false, error: { code: "bridge_missing", message: "window.__opencutAgent is not installed — the editor has no project open yet.", revision: -1 } };
    }
    if (typeof bridge[${name}] !== "function") {
      return { ok: false, error: { code: "unknown_method", message: "Bridge has no method " + ${name}, revision: -1 } };
    }
    return bridge[${name}](...${JSON.stringify(args)});
  })()`;
  const value = await evaluateInPage({
    webSocketDebuggerUrl: target.webSocketDebuggerUrl,
    expression,
  });
  return { value, target: { url: target.url, title: target.title } };
}

/**
 * Open (or find) an editor tab for a project.
 *
 * This is what makes render and export possible with no human at the keyboard:
 * both need a live page (WebCodecs), but they should not need a person to have
 * clicked the project open first. Reuses an existing tab when one matches —
 * opening a second tab for the same project would make every later call
 * ambiguous by our own rules above.
 */

/** One open per project at a time within this process; see openEditorTab. */
const inflightOpens = new Map();

/**
 * True readiness: the bridge ENVELOPE said ok. callBridge resolves (does not
 * throw) when the page evaluates but window.__opencutAgent is absent — so
 * "the call returned" only proves the tab can run JS, which is true from
 * navigation commit onward, long before the bundle loads and the bridge
 * installs. Counting that as ready is how a tool reports "drivable" against a
 * page that is still compiling — or against Chrome's own error page, which
 * keeps the /editor/ URL and evaluates JS happily.
 */
async function probeBridgeReady({ port, projectId }) {
  const target = await findEditorTarget({ port, projectId });
  const response = await callBridge({ method: "getState", target, projectId });
  if (response.value?.ok !== true) {
    throw new CdpError(
      response.value?.error?.message ?? "Bridge answered but not with an ok envelope.",
      { code: response.value?.error?.code ?? "bridge_not_ready" },
    );
  }
  return target;
}

async function waitUntilDrivable({ port, projectId, deadline }) {
  // TWICE in a row, because during initial load React's strict-mode remount
  // uninstalls and reinstalls the bridge — a single ok probe can land right
  // before the gap and the caller's next call then flaps.
  let lastError = null;
  let consecutive = 0;
  let target = null;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      target = await probeBridgeReady({ port, projectId });
      consecutive += 1;
      if (consecutive >= 2) return target;
    } catch (error) {
      consecutive = 0;
      lastError = error;
    }
  }
  throw new CdpError(
    `The editor for ${projectId} never became drivable in time.`,
    { code: "editor_not_ready", hint: String(lastError?.message ?? lastError ?? "") },
  );
}

export async function openEditorTab({
  port = DEFAULT_PORT,
  projectId,
  base = process.env.OPENCUT_BASE_URL ?? "http://localhost:3000",
  // Below the MCP SDK's 60s default request timeout on purpose: a longer wait
  // here would have the CLIENT abort the call while this poll runs on
  // detached, doing things to tabs that no caller will ever hear about.
  timeoutMs = 50_000,
  // Called with the tab id the moment a tab is created — BEFORE the readiness
  // wait, so the caller keeps ownership records even when this call later
  // times out and a retry adopts the tab via the alreadyOpen path.
  onTabCreated,
} = {}) {
  if (!projectId) throw new CdpError("openEditorTab requires a projectId.");
  // Serialise concurrent opens for the same project in this process. Without
  // this, two callers both see "no tab", both create one, and the resulting
  // pair poisons every later findEditorTarget with ambiguous_editor_tab.
  const pending = inflightOpens.get(projectId);
  if (pending) return pending;
  const work = doOpenEditorTab({ port, projectId, base, timeoutMs, onTabCreated });
  inflightOpens.set(projectId, work);
  try {
    return await work;
  } finally {
    inflightOpens.delete(projectId);
  }
}

async function doOpenEditorTab({ port, projectId, base, timeoutMs, onTabCreated }) {
  const deadline = Date.now() + timeoutMs;
  try {
    await findEditorTarget({ port, projectId });
    // A tab exists — but existing is not drivable (a session-restored tab on a
    // cold dev server, a crashed renderer): hold "found" to the same standard
    // as "created", or alreadyOpen:true becomes the untested path.
    const target = await waitUntilDrivable({ port, projectId, deadline });
    return { alreadyOpen: true, target, createdTabId: null };
  } catch (error) {
    if (error?.code !== "no_editor_tab") throw error;
  }

  const created = await (
    await fetch(`http://127.0.0.1:${port}/json/new`, { method: "PUT" })
  ).json();
  if (!created?.id || !created?.webSocketDebuggerUrl) {
    throw new CdpError("Chrome created no usable tab.", { code: "tab_create_failed" });
  }
  onTabCreated?.(created.id);
  try {
    // Chrome ≥117 ignores the url query on /json/new; navigate explicitly.
    await evaluateInPage({
      webSocketDebuggerUrl: created.webSocketDebuggerUrl,
      expression: `location.href = ${JSON.stringify(`${base}/editor/${encodeURIComponent(projectId)}`)}`,
    });
  } catch (error) {
    // A tab that never navigated is pure litter — close it before failing.
    await fetch(`http://127.0.0.1:${port}/json/close/${created.id}`).catch(() => {});
    throw error;
  }

  // Another process attached to the same Chrome may have raced us here. The
  // in-process lock cannot see it, but both sides can apply the same rule —
  // smallest tab id survives — so exactly one tab remains without coordination.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const rivals = targets.filter(
    (t) => t.type === "page" && typeof t.url === "string" &&
      t.url.includes(DEFAULT_URL_MATCH) && t.url.includes(projectId),
  );
  if (rivals.length > 1) {
    const winner = [...rivals].sort((a, b) => (a.id < b.id ? -1 : 1))[0];
    if (winner.id !== created.id) {
      await fetch(`http://127.0.0.1:${port}/json/close/${created.id}`).catch(() => {});
      const target = await waitUntilDrivable({ port, projectId, deadline });
      return { alreadyOpen: true, target, createdTabId: null };
    }
    for (const rival of rivals) {
      if (rival.id !== winner.id) {
        await fetch(`http://127.0.0.1:${port}/json/close/${rival.id}`).catch(() => {});
      }
    }
  }

  try {
    const target = await waitUntilDrivable({ port, projectId, deadline });
    return { alreadyOpen: false, target, createdTabId: created.id };
  } catch (error) {
    // Deliberately LEAVE the tab open on a readiness timeout: navigation has
    // committed, so a retrying caller adopts it via the alreadyOpen path and
    // keeps waiting — closing it here would yank the tab out from under that
    // retry (and under a slow dev compile that was about to finish).
    throw new CdpError(
      `Opened a tab for ${projectId} but the editor was not drivable within ${timeoutMs / 1000}s.`,
      {
        code: "editor_not_ready",
        hint: `The tab is still open and loading — retry open_editor to keep waiting. Last error: ${String(error?.hint ?? error?.message ?? error)}`,
      },
    );
  }
}

/** Close the project's editor tab. The caller decides whether that is polite. */
export async function closeEditorTab({ port = DEFAULT_PORT, projectId } = {}) {
  if (!projectId) throw new CdpError("closeEditorTab requires a projectId.");
  const target = await findEditorTarget({ port, projectId });
  const response = await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`);
  if (!response.ok) {
    throw new CdpError(`Closing the tab failed: ${response.status}.`, { code: "close_failed" });
  }
  return { closed: true, url: target.url, tabId: target.id };
}
