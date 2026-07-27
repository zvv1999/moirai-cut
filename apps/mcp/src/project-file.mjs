/**
 * Read and write the project file over the editor's own /api/projects route.
 *
 * Going through the HTTP route rather than `fs` directly is deliberate: the
 * route owns the revision and performs the compare-and-swap, so there is exactly
 * one place that decides whether a write is allowed. Writing the file straight
 * from here would be a second writer with its own idea of the rules, which is
 * the failure this whole layer exists to prevent.
 */

const DEFAULT_BASE = process.env.OPENCUT_BASE_URL ?? "http://localhost:3000";

export class ProjectFileError extends Error {
  constructor(message, code = "project_file_error", detail) {
    super(message);
    this.name = "ProjectFileError";
    this.code = code;
    this.detail = detail;
  }
}

const url = (base, id) =>
  id === undefined ? `${base}/api/projects` : `${base}/api/projects/${encodeURIComponent(id)}`;

async function call(method, target, { body, headers } = {}) {
  let response;
  try {
    response = await fetch(target, {
      method,
      ...(body === undefined
        ? { headers }
        : { body, headers: { "content-type": "application/json", ...headers } }),
    });
  } catch (cause) {
    throw new ProjectFileError(
      `Cannot reach the OpenCut server at ${target}. Is \`bun dev\` running?`,
      "server_unreachable",
      String(cause?.message ?? cause),
    );
  }
  if (!response.ok) {
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      /* keep the status */
    }
    if (response.status === 409) {
      throw new ProjectFileError(
        payload.error ?? "The project changed on disk.",
        "revision_conflict",
        { revision: payload.revision },
      );
    }
    throw new ProjectFileError(
      payload.error ?? `${method} ${target} failed with ${response.status}`,
      "request_failed",
    );
  }
  return response;
}

export async function listProjects({ base = DEFAULT_BASE } = {}) {
  const response = await call("GET", url(base));
  return response.json();
}

export async function readProject({ projectId, base = DEFAULT_BASE }) {
  const response = await call("GET", url(base, projectId));
  const document = await response.json();
  if (document === null) {
    throw new ProjectFileError(`No project ${projectId} on disk.`, "not_found");
  }
  return document;
}

/**
 * Write the document back, gated on the revision it was read at.
 *
 * `baseRevision` is not optional by accident: an unconditional write is exactly
 * how an agent silently erases whatever the human did between the read and the
 * write.
 */
export async function writeProject({ projectId, document, baseRevision, base = DEFAULT_BASE }) {
  if (typeof baseRevision !== "number" || !Number.isFinite(baseRevision)) {
    throw new ProjectFileError("writeProject requires the revision the document was read at");
  }
  const response = await call("PUT", url(base, projectId), {
    body: JSON.stringify(document, null, 2),
    headers: { "if-match": String(baseRevision) },
  });
  return response.json();
}
