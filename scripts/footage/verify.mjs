import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";

// Use an isolated service configuration; never publish test assets to the live library.
const config = JSON.parse(
	await readFile(
		process.env.FOOTAGE_QA_CONFIG ?? "/tmp/moirai-footage-qa.json",
		"utf8",
	),
);
assert.match(config.nasRoot, /verification/);
const token = (
	await readFile(path.join(config.dataDir, "service-token"), "utf8")
).trim();
const base = `http://127.0.0.1:${config.port}`;
const { chromium } = await import(
	process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const browser = await chromium.launch({
	executablePath:
		process.env.CHROME_PATH ??
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const outputDir = path.resolve("artifacts/footage");
await mkdir(outputDir, { recursive: true });
const call = async (url, method = "GET", body) => {
	const response = await fetch(base + "/" + url, {
		method,
		headers: { "x-footage-token": token, "content-type": "application/json" },
		body: body ? JSON.stringify(body) : undefined,
	});
	return { status: response.status, data: await response.json() };
};
async function waitFor(predicate, timeout = 240000) {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		const value = (await call("state")).data;
		if (predicate(value)) return value;
		await new Promise((r) => setTimeout(r, 1000));
	}
	throw new Error("Timed out waiting for service state");
}
try {
	await page.route("**/api/footage/**", async (route) => {
		const req = route.request();
		const url = new URL(req.url());
		const response = await route.fetch({
			url: base + url.pathname.replace("/api/footage", "") + url.search,
			headers: { ...req.headers(), "x-footage-token": token },
			timeout: 240000,
		});
		await route.fulfill({ response });
	});
	await page.goto(
		process.env.FOOTAGE_WEB_URL ?? "http://127.0.0.1:3000/footage",
	);
	await page.getByText("NAS 已连接").waitFor();
	await page.screenshot({
		path: path.join(outputDir, "desktop-empty.png"),
		fullPage: true,
	});
	let state, shot;
	if (process.env.FOOTAGE_QA_RESUME) {
		state = (await call("state")).data;
		shot = state.shots.find((s) => s.status === "review");
		assert.ok(shot, "A previously rendered QA shot is required");
		await page
			.locator(".footage-shot-row")
			.filter({ hasText: shot.name })
			.first()
			.click();
	} else {
		const previousSources = new Set(
			(await call("state")).data.sources.map((s) => s.id),
		);
		const bytes = await readFile(
			process.env.FOOTAGE_QA_VIDEO ?? "/tmp/moirai-capability.mp4",
		);
		const transfer = await page.evaluateHandle((base64) => {
			const buffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
			const data = new DataTransfer();
			data.items.add(new File([buffer], "流程验证.mp4", { type: "video/mp4" }));
			return data;
		}, bytes.toString("base64"));
		await page.getByLabel("产品 / SKU").fill("技术测试图，非产品实拍");
		await page
			.locator(".footage-app")
			.dispatchEvent("dragenter", { dataTransfer: transfer });
		assert.equal(await page.locator(".footage-drop-overlay").isVisible(), true);
		await page
			.locator(".footage-app")
			.dispatchEvent("drop", { dataTransfer: transfer });
		state = await waitFor((s) =>
			s.sources.some(
				(v) =>
					!previousSources.has(v.id) && ["review", "failed"].includes(v.status),
			),
		);
		const source = state.sources.find((v) => !previousSources.has(v.id));
		assert.equal(source.status, "review", source.error);
		assert.ok(source.nasRelativePath);
		const archived = await readFile(
			path.join(config.nasRoot, source.nasRelativePath),
		);
		assert.equal(
			createHash("sha256").update(archived).digest("hex"),
			createHash("sha256").update(bytes).digest("hex"),
		);
		console.log(
			"PASS drag upload, NAS source checksum, live video model analysis",
		);
		await page.getByRole("button", { name: "手工分镜" }).first().click();
		await page.getByLabel("分镜名称").fill("流程验证：动态测试图");
		await page
			.getByLabel("画面描述", { exact: true })
			.fill("竖屏彩色动态测试图，包含移动图案。用于验证解码和加工流程。");
		await page.getByLabel("标签", { exact: true }).fill("测试，动态");
		await page.getByLabel("过渡", { exact: true }).check();
		await page
			.getByLabel("使用限制", { exact: true })
			.fill("非产品素材，不用于实际投放。");
		await page.getByLabel("入点（秒）").fill("0.2");
		await page.getByLabel("出点（秒）").fill("1.8");
		await page.getByLabel("画幅", { exact: true }).selectOption("vertical");
		await page.getByRole("button", { name: "确认粗剪并加工" }).click();
		state = await waitFor((s) =>
			s.shots.some(
				(v) =>
					v.sourceId === source.id &&
					v.modelId === "human" &&
					["review", "failed"].includes(v.status),
			),
		);
		shot = state.shots.find(
			(v) => v.sourceId === source.id && v.modelId === "human",
		);
		assert.equal(shot.status, "review", shot.error);
	}
	await page.getByRole("button", { name: "加工结果", exact: true }).click();
	await page.waitForFunction(() => {
		const v = document.querySelector("video");
		return v?.readyState >= 2 && v.videoWidth > 0;
	});
	await page.locator("video").evaluate(async (v) => {
		v.muted = true;
		await v.play();
		await new Promise((resolve) => v.requestVideoFrameCallback(resolve));
	});
	const pixels = await page.locator("video").evaluate((v) => {
		const c = document.createElement("canvas");
		c.width = 100;
		c.height = 100;
		const ctx = c.getContext("2d");
		ctx.drawImage(v, 0, 0, 100, 100);
		const d = ctx.getImageData(0, 0, 100, 100).data;
		let lit = 0;
		for (let i = 0; i < d.length; i += 4)
			if (d[i] + d[i + 1] + d[i + 2] > 50) lit++;
		return lit;
	});
	assert.ok(pixels > 1000, "Video pixels should render");
	await page.locator("video").evaluate((v) => v.pause());
	await page.screenshot({
		path: path.join(outputDir, "desktop-review.png"),
		fullPage: true,
	});
	await page.setViewportSize({ width: 390, height: 844 });
	await page.screenshot({
		path: path.join(outputDir, "mobile-review.png"),
		fullPage: true,
	});
	assert.ok(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth + 1,
		),
		"No page overflow on mobile",
	);
	const conflict = await call(`shots/${shot.id}/action`, "POST", {
		baseRevision: shot.revision - 1,
		action: "publish",
	});
	assert.equal(conflict.status, 409);
	console.log("PASS render, playback pixels, mobile layout, revision conflict");
	await page.getByRole("button", { name: "确认结果并入库" }).click();
	state = await waitFor((s) =>
		s.shots.some(
			(v) => v.id === shot.id && ["published", "failed"].includes(v.status),
		),
	);
	shot = state.shots.find((v) => v.id === shot.id);
	assert.equal(shot.status, "published", shot.error);
	const range = await fetch(`${base}/media/shot/${shot.id}/master`, {
		headers: { "x-footage-token": token, range: "bytes=0-99" },
	});
	assert.equal(range.status, 206);
	assert.equal((await range.arrayBuffer()).byteLength, 100);
	const unauth = await fetch(`${base}/state`);
	assert.equal(unauth.status, 401);
	assert.deepEqual(errors, []);
	console.log(
		"PASS publication, byte ranges, authentication; all workflow checks passed",
	);
} catch (error) {
	await page
		.screenshot({ path: path.join(outputDir, "failure.png"), fullPage: true })
		.catch(() => {});
	throw error;
} finally {
	await browser.close();
}
