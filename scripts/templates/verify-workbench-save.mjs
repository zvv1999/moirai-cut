import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const base = process.env.WORKBENCH_URL ?? "http://127.0.0.1:3000";
const library = await (await fetch(`${base}/api/footage/templates`)).json();
const template = library.templates.find((entry) => entry.id === process.env.TEST_TEMPLATE_ID);
assert.ok(template, "Set TEST_TEMPLATE_ID to an existing test template");
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
try {
	const page = await browser.newPage();
	page.setDefaultTimeout(15000);
	page.setDefaultNavigationTimeout(15000);
	let completeSave;
	let requestReceived;
	let requests = [];
	await page.route("**/api/footage/templates/save", async (route) => {
		const body = route.request().postDataJSON();
		requests.push(body);
		await new Promise((resolve) => { completeSave = resolve; requestReceived?.(); });
		await route.fulfill({ json: { template: { ...body.template, revision: body.baseRevision + 1 } } });
	});
	await page.goto(`${base}/templates?template=${encodeURIComponent(template.id)}`);
	await page.getByRole("textbox", { name: "模板名称", exact: true }).waitFor();
	await page.getByRole("navigation", { name: "工作视图" }).getByRole("button", { name: "编辑模板", exact: true }).click();
	const name = page.getByRole("textbox", { name: "元素名称", exact: true });
	await name.fill("Before save");
	const received = new Promise((resolve) => { requestReceived = resolve; });
	await page.getByRole("button", { name: "保存 *", exact: true }).click();
	await received;
	await name.fill("Edited during save");
	completeSave();
	await page.getByText("提交的版本已保存，后续修改尚未保存。", { exact: true }).waitFor();
	assert.equal(await name.inputValue(), "Edited during save");
	const secondReceived = new Promise((resolve) => { requestReceived = resolve; });
	await page.getByRole("button", { name: "保存 *", exact: true }).click();
	await secondReceived;
	assert.equal(requests[1].baseRevision, template.revision + 1);
	assert.equal(requests[1].template.elements[0].description, "Edited during save");
	completeSave();
	await page.getByRole("button", { name: "保存", exact: true }).waitFor();
	assert.equal(await name.inputValue(), "Edited during save");
	await name.fill("Unsaved refresh test");
	const dialogSeen = new Promise((resolve) => page.once("dialog", async (dialog) => {
		assert.equal(dialog.type(), "beforeunload");
		await dialog.dismiss();
		resolve();
	}));
	const reload = page.reload().catch(() => {});
	await dialogSeen;
	await reload;
	assert.equal(await name.inputValue(), "Unsaved refresh test");
	const persisted = await (await fetch(`${base}/api/footage/templates`)).json();
	assert.deepEqual(persisted.templates.find((entry) => entry.id === template.id), template);
	console.log(JSON.stringify({ passed: ["delayed save preserves edit", "next save uses receipt revision", "refresh dismissal preserves draft", "test does not mutate saved template"], interceptedSaves: requests.length }));
	if (process.env.CHECK_HISTORY === "1") {
		const historyPage = await browser.newPage();
		historyPage.setDefaultTimeout(15000);
		await historyPage.goto(`${base}/projects`);
		await historyPage.getByRole("link", { name: "模板工作台", exact: true }).click();
		await historyPage.getByRole("textbox", { name: "模板名称", exact: true }).fill("Unsaved history test");
		let prompted = false;
		historyPage.on("dialog", async (dialog) => { prompted = true; await dialog.dismiss(); });
		await historyPage.goBack().catch(() => {});
		assert.equal(prompted, true, "history navigation should prompt for unsaved edits");
		assert.equal(new URL(historyPage.url()).pathname, "/templates");
		assert.equal(await historyPage.getByRole("textbox", { name: "模板名称", exact: true }).inputValue(), "Unsaved history test");
		console.log(JSON.stringify({ historyBack: { prompted, remainedInWorkbench: new URL(historyPage.url()).pathname === "/templates" } }));
		await historyPage.close();
	}
} finally {
	await browser.close();
}
