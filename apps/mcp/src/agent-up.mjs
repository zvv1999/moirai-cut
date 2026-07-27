#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * One command from cold machine to working agent surface.
 *
 * The agent stack is three processes that each fail differently when missing —
 * the web server (file APIs + editor), the debug Chrome (page-path tools), and
 * ffmpeg (probing, thumbnails, audio analysis). Before this script existed,
 * bringing them up was tribal knowledge spread across a session transcript.
 *
 * Idempotent: everything already running is detected and reused, so `agent:up`
 * is also the health check — run it any time to see what state the stack is in.
 *
 * The debug Chrome uses ITS OWN profile directory, never the user's real
 * browser profile: a debugging port on a daily-driver profile would expose
 * every logged-in session on the machine to anything that can reach the port.
 */

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(new URL(import.meta.url)));
const REPO = path.resolve(HERE, "..", "..", "..");
const WEB_DIR = path.join(REPO, "apps", "web");
const BASE = process.env.OPENCUT_BASE_URL ?? "http://localhost:3000";
const CDP = "http://127.0.0.1:9222";
const CHROME_PROFILE = "/tmp/opencut-agent-profile";
const DEV_LOG = "/tmp/opencut-dev.log";

const ok = (v) => (v ? "✔" : "✘");
const rows = [];
const report = (name, healthy, detail) => rows.push({ name, healthy, detail });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function reachable(url, timeoutMs = 2000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return response.ok || response.status === 400 ? response : null;
  } catch {
    return null;
  }
}

// ---------- 1. environment ----------
const envFile = path.join(WEB_DIR, ".env.local");
const env = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
const fileMode = /NEXT_PUBLIC_OPENCUT_PROJECT_FILES=1/.test(env);
const projectsDir =
  env.match(/OPENCUT_PROJECTS_DIR=(.+)/)?.[1]?.trim() ??
  path.join(homedir(), "OpenCutProjects");
report(
  "env: project-file mode",
  fileMode,
  fileMode ? `projects at ${projectsDir}` : `set NEXT_PUBLIC_OPENCUT_PROJECT_FILES=1 in ${envFile}`,
);

let ffmpegOk = false;
try {
  await run("ffmpeg", ["-version"]);
  await run("ffprobe", ["-version"]);
  ffmpegOk = true;
} catch {
  /* reported below */
}
report("ffmpeg + ffprobe", ffmpegOk, ffmpegOk ? "on PATH" : "brew install ffmpeg");

// ---------- 2. web server ----------
let web = await reachable(`${BASE}/api/projects`);
if (!web) {
  console.log(`starting web server (log: ${DEV_LOG}) ...`);
  const log = openSync(DEV_LOG, "a");
  const child = spawn("bun", ["dev"], {
    cwd: WEB_DIR,
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.unref();
  for (let i = 0; i < 60 && !web; i += 1) {
    await sleep(2000);
    web = await reachable(`${BASE}/api/projects`);
  }
}
report("web server", Boolean(web), web ? BASE : `did not come up — see ${DEV_LOG}`);

// ---------- 3. debug Chrome (own profile, never the user's) ----------
let cdp = await reachable(`${CDP}/json/version`);
if (!cdp) {
  console.log(`starting debug Chrome (profile: ${CHROME_PROFILE}) ...`);
  mkdirSync(CHROME_PROFILE, { recursive: true });
  const child = spawn(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    [
      "--remote-debugging-port=9222",
      `--user-data-dir=${CHROME_PROFILE}`,
      "--no-first-run",
      "--no-default-browser-check",
      `${BASE}/projects`,
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  for (let i = 0; i < 20 && !cdp; i += 1) {
    await sleep(1000);
    cdp = await reachable(`${CDP}/json/version`);
  }
}
let editorTabs = [];
if (cdp) {
  const targets = await (await fetch(`${CDP}/json/list`)).json();
  editorTabs = targets.filter((t) => t.type === "page" && t.url.includes("/editor/"));
}
report("debug Chrome (:9222)", Boolean(cdp), cdp ? CHROME_PROFILE : "did not come up");
report(
  "editor tab",
  true, // informational: file tools need no tab
  editorTabs.length
    ? editorTabs.map((t) => t.url.split("/editor/")[1]).join(", ")
    : "none open — file tools work anyway; page tools need one",
);

// ---------- 4. projects on disk ----------
let projectCount = null;
try {
  projectCount = readdirSync(projectsDir).filter((entry) => !entry.startsWith(".")).length;
} catch {
  /* reported below */
}
report(
  "projects root",
  projectCount !== null,
  projectCount !== null ? `${projectsDir} (${projectCount} projects)` : `missing: ${projectsDir}`,
);

// ---------- table ----------
const width = Math.max(...rows.map((r) => r.name.length));
console.log("");
for (const row of rows) {
  console.log(`  ${ok(row.healthy)}  ${row.name.padEnd(width)}  ${row.detail}`);
}
const healthy = rows.every((r) => r.healthy);
console.log(
  healthy
    ? `\nready — connect with:\n  claude mcp add opencut -- node ${path.join(HERE, "server.mjs")}`
    : "\nnot ready — fix the ✘ lines above and re-run",
);
process.exit(healthy ? 0 : 1);
