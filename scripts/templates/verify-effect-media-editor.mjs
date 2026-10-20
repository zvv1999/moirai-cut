import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base = process.env.WORKBENCH_URL ?? "http://127.0.0.1:3000";
async function api(path, body) {
  const response = await fetch(`${base}/api/footage/templates${path}`, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", "x-requested-with": "moirai-footage" }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json(); assert.ok(response.ok, JSON.stringify(data)); return data;
}
assert.ok((await api("/dynamic-assets/schema")).mediaEdit);
const original = await api(`/dynamic-assets/${process.env.TEST_EFFECT_ID}`);
const definition = structuredClone(original.definition);
definition.id = process.env.TEST_MEDIA_EDITOR_ID ?? `media-editor-${Date.now()}`;
definition.revision = process.env.TEST_MEDIA_EDITOR_ID ? (await api(`/dynamic-assets/${definition.id}`)).definition.revision : 0;
definition.name = definition.id;
const saved = (await api("/dynamic-assets", { definition, baseRevision: definition.revision, idempotencyKey: `${definition.id}-${definition.revision}` })).definition;
console.log(JSON.stringify({ fixture: saved.id }));
const catalog = (await api("/assets")).assets;
const still = catalog.find(a => a.name === "图标 · 闪亮强调");
const replacement = catalog.find(a => a.name === "图标 · 指向箭头");
const animated = catalog.find(a => a.name === "图标 · 庆祝礼花 · 动画预览");
assert.ok(still && replacement && animated);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${base}/templates`);
  await page.getByRole("button", { name: `${saved.name} v${saved.revision} · ${saved.layers.length} 层`, exact: true }).click();
  const advanced = page.locator("summary").filter({ hasText: /^高级关键帧/ });
  const opacityKey = page.getByRole("spinbutton", { name: "透明度关键帧2数值", exact: true, includeHidden: true });
  assert.equal(await opacityKey.isVisible(), false);
  assert.equal(await page.getByRole("spinbutton", { name: "入场秒数", exact: true }).isVisible(), true);
  await advanced.click();
  await opacityKey.fill("0.9");
  await advanced.click();
  assert.equal(await opacityKey.isVisible(), false);
  await page.getByRole("textbox", { name: "效果名称", exact: true }).fill(`${saved.name}-edited`);
  await page.locator("summary").filter({ hasText: "素材库 · 添加与替换" }).click();
  async function choose(asset) {
    await page.getByRole("textbox", { name: "搜索插画与图标", exact: true }).fill(asset.name);
    await page.getByRole("button", { name: `选择素材 ${asset.name}`, exact: true }).click();
  }
  async function command(label) {
    const pending = page.waitForResponse(r => r.url().endsWith("/dynamic-assets/media"));
    await page.getByRole("button", { name: label, exact: true }).click();
    const response = await pending; assert.ok(response.ok(), await response.text()); return response.json();
  }
  await choose(still);
  const added = await command("添加素材图层");
  assert.equal(added.definition.name, `${saved.name}-edited`);
  const layer = added.definition.layers.find(l => l.content.element?.id === added.selectedLayerId);
  assert.ok(layer);
  await choose(replacement);
  const replaced = await command("替换所选图层");
  const changedLayer = replaced.definition.layers.find(l => l.content.element?.id === added.selectedLayerId);
  const expected = structuredClone(layer);
  expected.content.element.resourceId = changedLayer.content.element.resourceId;
  assert.deepEqual(changedLayer, expected);
  assert.equal(replaced.definition.resourceBindings.find(b => b.slotId === changedLayer.content.element.resourceId).assetId, replacement.id);
  await choose(animated);
  assert.ok(await page.getByRole("button", { name: "替换所选图层", exact: true }).isDisabled());
  const video = await command("添加素材图层");
  assert.ok(video.definition.layers.find(l => l.content.element?.id === video.selectedLayerId).content.element.timing.maxSeconds <= animated.duration);
  await page.getByRole("slider", { name: "效果预览进度", exact: true }).fill("0.6");
  await page.waitForFunction(id => {
    const c = document.querySelector('canvas[aria-label="效果实时画面"]');
    return c?.dataset.renderTime === "0.6" && c.dataset.mediaIds?.includes(id);
  }, animated.id);
  const pixels = () => {
    const c = document.querySelector('canvas[aria-label="效果实时画面"]');
    return c.getContext("2d").getImageData(0, 0, c.width, c.height).data.reduce((h, v) => Math.imul(h ^ v, 16777619) >>> 0, 2166136261);
  };
  const covered = await page.evaluate(pixels);
  const orderRequest = page.waitForResponse(r => r.url().endsWith("/dynamic-assets/layers"));
  await page.getByRole("button", { name: "置于底层", exact: true }).click();
  const orderResponse = await orderRequest;
  assert.ok(orderResponse.ok(), await orderResponse.text());
  const ordered = await orderResponse.json();
  const element = ordered.definition.layers.find(l => l.content.element?.id === video.selectedLayerId).content.element;
  assert.ok(ordered.definition.layers.every(l => !l.content.element || l.content.element.id === element.id || l.content.element.z > element.z));
  const expectedOrder = structuredClone(orderResponse.request().postDataJSON().definition);
  for (const layer of video.definition.layers) {
    if (!layer.content.element) continue;
    const before = layer.content.element.region;
    const after = expectedOrder.layers.find(l => l.content.element?.id === layer.content.element.id).content.element.region;
    for (const key of ["x", "y", "width", "height"]) assert.ok(Math.abs(before[key] - after[key]) < 1e-12);
    const returned = ordered.definition.layers.find(l => l.content.element?.id === layer.content.element.id).content.element.region;
    for (const key of ["x", "y", "width", "height"]) {
      assert.ok(Math.abs(after[key] - returned[key]) < 1e-12);
      after[key] = returned[key];
    }
  }
  expectedOrder.layers.find(l => l.content.element?.id === element.id).content.element.z = element.z;
  assert.deepEqual(ordered.definition, expectedOrder);
  await page.waitForFunction(previous => {
    const c = document.querySelector('canvas[aria-label="效果实时画面"]');
    if (c?.dataset.renderTime !== "0.6") return false;
    return c.getContext("2d").getImageData(0, 0, c.width, c.height).data.reduce((h, v) => Math.imul(h ^ v, 16777619) >>> 0, 2166136261) !== previous;
  }, covered);
  await page.getByRole("region", { name: "效果预览", exact: true }).screenshot({ path: "/tmp/effect-media-editor-reordered.png" });
  const beforeAlignment = await page.evaluate(pixels);
  let aligned;
  for (const label of ["靠右对齐", "底部对齐"]) {
    const pending = page.waitForResponse(r => r.url().endsWith("/dynamic-assets/layers"));
    await page.getByRole("button", { name: label, exact: true }).click();
    const response = await pending; assert.ok(response.ok(), await response.text());
    aligned = await response.json();
  }
  const alignedElement = aligned.definition.layers.find(l => l.content.element?.id === element.id).content.element;
  assert.ok(Math.abs(alignedElement.region.x + alignedElement.region.width - 1) < 1e-12);
  assert.ok(Math.abs(alignedElement.region.y + alignedElement.region.height - 1) < 1e-12);
  assert.deepEqual(alignedElement.timing, element.timing);
  assert.deepEqual(alignedElement.motions, element.motions);
  assert.equal(alignedElement.region.width, element.region.width);
  assert.equal(alignedElement.region.height, element.region.height);
  await page.waitForFunction(previous => {
    const c = document.querySelector('canvas[aria-label="效果实时画面"]');
    return c?.dataset.renderTime === "0.6" && c.getContext("2d").getImageData(0, 0, c.width, c.height).data.reduce((h, v) => Math.imul(h ^ v, 16777619) >>> 0, 2166136261) !== previous;
  }, beforeAlignment);
  await page.getByRole("spinbutton", { name: "宽度 %", exact: true }).fill("20");
  await page.getByRole("spinbutton", { name: "高度 %", exact: true }).fill("23");
  await page.locator("summary").filter({ hasText: /^相对摆放$/ }).click();
  const caption = video.definition.layers.find(l => l.content.element?.features.representation === "text").content.element;
  await page.getByRole("combobox", { name: "摆放参照图层", exact: true }).selectOption(caption.id);
  await page.getByRole("combobox", { name: "相对摆放方向", exact: true }).selectOption("right");
  const rejected = page.waitForResponse(r => r.url().endsWith("/dynamic-assets/layers"));
  await page.getByRole("button", { name: "应用摆放", exact: true }).click();
  assert.equal((await rejected).status(), 400);
  await page.getByRole("alert").filter({ hasText: "空间不足" }).waitFor();
  assert.equal(await page.getByRole("spinbutton", { name: "宽度 %", exact: true }).inputValue(), "20");
  await page.getByRole("combobox", { name: "相对摆放方向", exact: true }).selectOption("below");
  const besideResponse = page.waitForResponse(r => r.url().endsWith("/dynamic-assets/layers"));
  await page.getByRole("button", { name: "应用摆放", exact: true }).click();
  const response = await besideResponse; assert.ok(response.ok(), await response.text());
  const beside = await response.json();
  const finalElement = beside.definition.layers.find(l => l.content.element?.id === element.id).content.element;
  assert.ok(Math.abs(finalElement.region.y - caption.region.y - caption.region.height - 0.02) < 1e-12);
  assert.ok(Math.abs(finalElement.region.x + finalElement.region.width / 2 - caption.region.x - caption.region.width / 2) < 1e-12);
  assert.equal(finalElement.region.width, 0.2); assert.equal(finalElement.region.height, 0.23);
  assert.deepEqual(finalElement.timing, element.timing);
  const pendingSave = page.waitForResponse(r => r.url().endsWith("/dynamic-assets") && r.request().method() === "POST");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  assert.ok((await pendingSave).ok());
  const persisted = (await api(`/dynamic-assets/${saved.id}`)).definition;
  assert.equal(persisted.layers.length, saved.layers.length + 2);
  assert.equal(persisted.name, `${saved.name}-edited`);
  const savedCaption = persisted.layers.find(l => l.content.element?.features.representation === "text").content.element;
  assert.equal(savedCaption.motions.find(m => m.property === "opacity").keys[1].value, 0.9);
  assert.equal(persisted.layers.find(l => l.content.element?.id === element.id).content.element.z, element.z);
  assert.deepEqual(persisted.layers.find(l => l.content.element?.id === element.id).content.element.region, finalElement.region);
  await page.reload();
  await page.getByRole("button", { name: `${persisted.name} v${persisted.revision} · ${persisted.layers.length} 层`, exact: true }).click();
  const seek = page.getByRole("slider", { name: "效果预览进度", exact: true });
  async function frame(time) {
    await seek.fill(String(time));
    await page.waitForFunction(({ time, ids }) => {
      const c = document.querySelector('canvas[aria-label="效果实时画面"]');
      return c?.dataset.renderTime === String(time) && ids.every(id => c.dataset.mediaIds?.includes(id));
    }, { time, ids: [replacement.id, animated.id] });
    return page.locator('canvas[aria-label="效果实时画面"]').evaluate(c => {
      const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      return { hash: data.reduce((h, v) => Math.imul(h ^ v, 16777619) >>> 0, 2166136261), visible: data.filter((v, i) => i % 4 !== 3 && v > 80).length };
    });
  }
  const first = await frame(0.6), second = await frame(1.2);
  assert.ok(first.visible > 3000); assert.notEqual(first.hash, second.hash);
  await page.screenshot({ path: "/tmp/effect-media-editor-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("summary").filter({ hasText: "素材库 · 添加与替换" }).click();
  await choose(replacement);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  await page.getByRole("region", { name: "插画与图标", exact: true }).screenshot({ path: "/tmp/effect-media-editor-mobile.png" });
  assert.deepEqual(await api(`/dynamic-assets/${original.definition.id}`), original);
  console.log(JSON.stringify({ fixture: saved.id, passed: ["add PNG", "retain unsaved name", "replace only binding", "reject incompatible type", "add capped video", "send behind caption changes pixels", "preserve other fields", "save and reload stacking", "render referenced media", "changing preview pixels", "mobile overflow", "original unchanged"] }));
} finally { await browser.close(); }
