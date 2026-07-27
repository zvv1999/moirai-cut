#!/usr/bin/env node
import { evaluateInPage, findEditorTarget } from "./cdp.mjs";

/**
 * Dev helper: make sure the attached Chrome has a project open in the editor.
 * Not part of the agent surface — the MCP server deliberately does not create
 * projects; it edits the one the human has open.
 */

async function listPages() {
  const response = await fetch("http://127.0.0.1:9222/json/list");
  return (await response.json()).filter((t) => t.type === "page");
}

const pages = await listPages();
const editor = pages.find((t) => t.url.includes("/editor/"));
if (editor) {
  console.log(`already open: ${editor.url}`);
  process.exit(0);
}

const projects = pages.find((t) => t.url.includes("/projects"));
if (!projects) {
  console.error("No /projects tab open in the debugged Chrome.");
  process.exit(1);
}

// Find the create-project control by its visible label rather than a test id,
// so this keeps working if the markup is restructured.
const clicked = await evaluateInPage({
  webSocketDebuggerUrl: projects.webSocketDebuggerUrl,
  expression: `(() => {
    const candidates = [...document.querySelectorAll('button, a')];
    const target = candidates.find((el) => /new project|create project|new,? +project/i.test(el.textContent || ''));
    if (!target) return { clicked: false, saw: candidates.map((el) => (el.textContent || '').trim()).filter(Boolean).slice(0, 25) };
    target.click();
    return { clicked: true, label: (target.textContent || '').trim() };
  })()`,
});
console.log(JSON.stringify(clicked));
if (!clicked.clicked) process.exit(1);

// Creating a project navigates to /editor/<id>; poll for the tab to settle.
for (let attempt = 0; attempt < 40; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const target = await findEditorTarget({}).catch(() => null);
  if (target) {
    console.log(`editor open: ${target.url}`);
    process.exit(0);
  }
}
console.error("Timed out waiting for the editor tab.");
process.exit(1);
