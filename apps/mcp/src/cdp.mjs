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
