import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const base = process.env.WORKBENCH_URL ?? "http://127.0.0.1:3000";
const templateId = process.env.TEST_TEMPLATE_ID;
const inputId = process.env.TEST_INPUT_ID;
assert.ok(templateId && inputId, "Set TEST_TEMPLATE_ID and TEST_INPUT_ID to existing test fixtures");
const template = await (await fetch(`${base}/api/footage/templates/${templateId}`)).json();
const input = await (await fetch(`${base}/api/footage/templates/inputs/${inputId}`)).json();
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
try {
	const page = await browser.newPage();
	page.setDefaultTimeout(15000);
	let completeSubmission;
	let requestReceived;
	let submitted;
	const batchId = "production-preview-ui-regression";
	const playbackBatch = process.env.TEST_PREVIEW_BATCH_ID;
	if (playbackBatch) await page.route(`**/api/footage/templates/production/${batchId}/items/0/previews/0`, (route) => route.fulfill({
		status: 302, headers: { location: `${base}/api/footage/templates/production/${playbackBatch}/items/0/previews/0` },
	}));
	await page.route("**/api/footage/templates/production/author", async (route) => {
		submitted = route.request().postDataJSON();
		await new Promise((resolve) => { completeSubmission = resolve; requestReceived?.(); });
		await route.fulfill({ json: { id: batchId, name: "Delayed preview" } });
	});
	await page.route(`**/api/footage/templates/production/${batchId}`, (route) => route.fulfill({ json: {
		name: "Delayed preview", cancelled: false, job: { status: "succeeded" }, renderJob: { status: "succeeded" },
		items: [{ index: 0, status: "published", previews: playbackBatch ? [{ fixture: 0 }] : [] }],
	} }));
	await page.goto(`${base}/templates?template=${encodeURIComponent(templateId)}`);
	const edit = () => page.getByRole("navigation", { name: "工作视图" }).getByRole("button", { name: "编辑模板", exact: true }).click();
	const preview = () => page.getByRole("button", { name: "预览当前效果", exact: true }).click();
	await edit();
	await preview();
	await page.getByRole("checkbox", { name: new RegExp(input.input.name) }).click();
	const title = page.getByRole("textbox", { name: "成片标题", exact: true });
	await title.fill("Preview retained input");
	await edit();
	const font = page.getByRole("spinbutton", { name: "字号", exact: true });
	await font.fill("44");
	await preview();
	assert.equal(await title.inputValue(), "Preview retained input");
	const received = new Promise((resolve) => { requestReceived = resolve; });
	await page.getByRole("button", { name: "生成草稿预览 · 1 个成片", exact: true }).click();
	await received;
	assert.equal(submitted.previewOnly, true);
	assert.equal(submitted.samples[0].inputId, inputId);
	assert.equal(submitted.samples[0].title, "Preview retained input");
	const styleId = template.elements[0].styleId;
	assert.equal(submitted.designs[0].template.styles.find((s) => s.id === styleId).fontSize, 44);
	await edit();
	await font.fill("48");
	completeSubmission();
	await preview();
	await page.getByRole("button", { name: "生成草稿预览 · 1 个成片", exact: true }).waitFor({ state: "visible" });
	await page.waitForFunction(() => Array.from(document.querySelectorAll(".tp-create button")).some((button) => button.textContent.includes("生成草稿预览") && !button.disabled));
	assert.equal(await page.getByRole("link", { name: "查看试映任务", exact: true }).count(), 0, "old submission must not become the current draft preview");
	await edit();
	await font.fill("44");
	await preview();
	await page.getByRole("link", { name: "查看试映任务", exact: true }).waitFor();
	assert.match(await page.getByRole("link", { name: "查看试映任务", exact: true }).getAttribute("href"), new RegExp(batchId));
	assert.equal(await title.inputValue(), "Preview retained input");
	if (playbackBatch) {
		const video = page.locator('video[aria-label="草稿成片 1"]');
		await video.evaluate(async (element) => { element.muted = true; await element.play(); });
		await page.waitForFunction(() => document.querySelector('video[aria-label="草稿成片 1"]')?.currentTime > 0);
		await edit();
		assert.equal(await video.evaluate((element) => element.paused), true, "hidden preview playback must pause");
		await preview();
	}
	await page.setViewportSize({ width: 390, height: 844 });
	await edit();
	assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
	await page.screenshot({ path: "/tmp/workbench-preview-mobile.png" });
	await preview();
	assert.equal(await title.inputValue(), "Preview retained input");
	assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
	const persisted = await (await fetch(`${base}/api/footage/templates/${templateId}`)).json();
	assert.deepEqual(persisted, template);
	console.log(JSON.stringify({ passed: ["inputs retained across editing", "latest draft submitted", "delayed old result isolated", "matching snapshot restores receipt", "mobile edit and preview retain input without overflow", "saved template unchanged"], playbackPausedOnLeave: !!playbackBatch }));
} finally {
	await browser.close();
}
