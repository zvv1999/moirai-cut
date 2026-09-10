import assert from "node:assert/strict";
import { Database } from "bun:sqlite";
import { mkdir, mkdtemp, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");

// Isolated publication fixture; the live library is read only.
const root = await mkdtemp("/tmp/moirai-lineage-qa-");
await mkdir(`${root}/publications`, { recursive: true });
const live = new Database(`${process.env.HOME}/.moirai-cut/footage/library.sqlite3`, { readonly: true });
const shot = JSON.parse(live.query("SELECT body FROM records WHERE kind='shot' AND json_extract(body,'$.outputPath') IS NOT NULL LIMIT 1").get().body);
const source = JSON.parse(live.query("SELECT body FROM records WHERE kind='source' AND id=?").get(shot.sourceId).body);
live.close();
shot.id = "lineage-shot";
shot.name = "血缘验证片段";
shot.status = "published";
shot.revision = 5;
shot.publishedPath = "master.mp4";
await copyFile(shot.outputPath, `${root}/master.mp4`);
const db = new Database(`${root}/library.sqlite3`);
db.exec("CREATE TABLE IF NOT EXISTS records(kind TEXT,id TEXT,body TEXT,PRIMARY KEY(kind,id))");
const put = (kind, id, body) => db.query("INSERT OR REPLACE INTO records VALUES(?,?,?)").run(kind, id, JSON.stringify(body));
put("source", source.id, source);
put("shot", shot.id, shot);
put("job", "lineage-release", { id: "lineage-release", kind: "publish", targetId: shot.id, revision: 4, status: "succeeded", attempt: 1, createdAt: 0, updatedAt: 0, error: null });
await writeFile(`${root}/publications/lineage-release.json`, JSON.stringify({ publicationId: "lineage-release", shot, source: { id: source.id, sha256: source.sha256 } }));
const config = JSON.parse(await readFile(`${process.env.HOME}/.moirai-cut/footage-runtime.json`, "utf8"));
await writeFile(`${root}/config.json`, JSON.stringify({ ...config, dataDir: root, nasRoot: `${root}/offline-nas`, requireSmb: false, port: 4319 }));
const server = spawn(path.resolve("target/debug/moirai-footage"), [], { env: { ...process.env, MOIRAI_FOOTAGE_CONFIG: `${root}/config.json` }, stdio: "inherit" });
let browser, projectId, page;
try {
  let token;
  for (let i=0; i<100; i++) {
    try { token = (await readFile(`${root}/service-token`, "utf8")).trim(); break; }
    catch { await new Promise(r=>setTimeout(r,200)); }
  }
  assert.ok(token, "Native fixture server did not start");
  for(let i=0;i<100;i++) {
    try { const response=await fetch("http://127.0.0.1:4319/state",{headers:{"x-footage-token":token}});if(response.ok)break; }
    catch {}
    if(i===99) throw new Error("Native service did not become ready");
    await new Promise(r=>setTimeout(r,200));
  }
  const call = async (path) => {
    const r = await fetch(`http://127.0.0.1:4319/${path}`, { headers: { "x-footage-token": token } });
    return { status: r.status, value: await r.json() };
  };
  assert.equal((await call("releases/lineage-release")).status, 200);
  browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route("**/api/footage/**", async route => {
    const req = route.request();
    const u = new URL(req.url());
    const response = await route.fetch({ url: `http://127.0.0.1:4319${u.pathname.replace("/api/footage", "")}${u.search}`, headers: { ...req.headers(), "x-footage-token": token } });
    await route.fulfill({ response });
  });
  const listing = page.waitForResponse(r => new URL(r.url()).pathname === "/api/projects");
  await page.goto("http://127.0.0.1:3000/projects");
  await listing;
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.waitForURL("**/editor/**");
  projectId = new URL(page.url()).pathname.split("/").at(-1);
  await page.getByRole("button", { name: "关闭", exact: true }).last().click();
  await page.getByRole("button", { name: "产品素材库", exact: true }).click();
  await page.getByRole("button", { name: "关联 血缘验证片段", exact: true }).click();
  await page.getByText("已关联到工程素材库", { exact: true }).waitFor();
  await page.getByRole("button", { name: "关闭", exact: true }).last().click();
  const index = await (await fetch(`http://127.0.0.1:3000/api/media/${projectId}`)).json();
  const asset = Object.values(index.assets).find(a => a.footage?.releaseId === "lineage-release");
  assert.ok(asset);
  assert.equal(asset.footage.sourceId, source.id);
  await page.reload();
  await page.waitForFunction(() => window.__opencutAgent?.getState().data?.media.some(a => a.footage?.releaseId === "lineage-release"));
  const state = await page.evaluate(() => window.__opencutAgent.getState().data);
  assert.equal(state.media.find(a => a.id === asset.id).footage.shotRevision, 5);
  console.log("PASS editor import, disk metadata, reload, Agent context", { projectId, assetId: asset.id });
  await page.getByRole("option").filter({ hasText: "血缘验证片段.mp4" }).dblclick();
  await page.getByRole("button", { name: "插入范围", exact: true }).click();
  await page.waitForFunction(() => window.__opencutAgent.getState().data.tracks.some(t => t.elements.length > 0));
  for (let i=0; i<30; i++) {
    const linked = await call(`lineage/${shot.id}`);
    if (linked.value.uses.some(u => u.projectId===projectId && u.elements.length===1)) break;
    if (i===29) throw new Error("Timeline linkage was not persisted");
    await new Promise(r=>setTimeout(r,300));
  }
  await page.screenshot({ path: "artifacts/footage/lineage-editor.png", fullPage: true });
  const linked = await call(`lineage/${shot.id}`);
  assert.equal(linked.value.uses[0].mediaId, asset.id);
  assert.equal(linked.value.uses[0].elements.length, 1);
  assert.ok(linked.value.uses[0].elements[0].sceneId);
  assert.ok(linked.value.uses[0].elements[0].trackId);
  await page.reload();
  await page.waitForFunction(() => window.__opencutAgent?.getState().data?.tracks.some(t=>t.elements.length>0));
  console.log("PASS timeline insert, scene/track/element reverse lookup, reload");
  // A newer draft cannot silently replace the imported release or its tags.
  put("shot", shot.id, { ...shot, revision: 6, status: "draft", description: "Changed later" });
  assert.equal((await call("releases/lineage-release")).status, 400);
  const reloaded = await (await fetch(`http://127.0.0.1:3000/api/media/${projectId}`)).json();
  assert.equal(reloaded.assets[asset.id].footage.shotRevision, 5);
  console.log("PASS reverse project linkage and immutable version; withdrawn release rejected");
} catch (error) {
  if (page) { console.log((await page.locator("body").innerText()).slice(0,5000)); await page.screenshot({path:"artifacts/footage/lineage-failure.png",fullPage:true}); }
  throw error;
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
  if (server.exitCode === null && server.signalCode === null) await new Promise(resolve => server.once("exit", resolve));
  db.close();
  if (projectId) {
    const response = await fetch(`http://127.0.0.1:3000/api/projects/${projectId}`, { method: "DELETE" });
    assert.ok(response.ok);
  }
  await rm(root, { recursive: true, force: true });
}
