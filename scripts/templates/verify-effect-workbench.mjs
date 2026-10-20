import assert from "node:assert/strict";
import {archiveTestStyle} from './archive-test-style.mjs';
import { pathToFileURL } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const base = process.env.WORKBENCH_URL ?? "http://127.0.0.1:3000";
async function api(path, body) {
	const response = await fetch(`${base}/api/footage/templates${path}`, {
		method: body ? "POST" : "GET",
		headers: {"content-type":"application/json", "x-requested-with":"moirai-footage"},
		body: body ? JSON.stringify(body) : undefined,
	});
	const result = await response.json();
	assert.ok(response.ok, JSON.stringify(result));
	return result;
}
const before = (await api("/dynamic-assets")).assets;
const fixtureName = `验收 · 双层花字 ${Date.now()}`;
const {definition} = await api("/dynamic-assets/create", {name:fixtureName,canvas:{width:720,height:720,fps:30}});
const first = definition.layers.find((layer) => layer.content.kind === "element");
const second = structuredClone(first);
second.content.element.id = "secondary";
second.content.element.description = "副文字";
second.content.element.styleId = "secondary-style";
second.content.element.region = {x:0.1,y:0.65,width:0.8,height:0.2};
definition.layers.push(second);
definition.styles.push({...structuredClone(definition.styles[0]),id:"secondary-style",fontSize:40,fill:"#FFBB44"});
definition.inputs.push({id:"secondary-text",label:"副文字",default:"独立样式",maxCharacters:20,layerIds:["secondary"]});
await api("/dynamic-assets",{definition,baseRevision:0,idempotencyKey:`effect-ui-${definition.id}`});
const browser = await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE ? {executablePath:process.env.CHROME_EXECUTABLE}: {})});
try {
	const page = await browser.newPage({viewport:{width:1280,height:900}});
	page.setDefaultTimeout(20000);
	await page.goto(`${base}/templates`);
	await page.getByRole("button",{name:new RegExp(fixtureName)}).click();
	const font = page.getByRole("spinbutton",{name:"字号",exact:true});
	await font.fill("84");
	async function layerOp(button) {
		const response = page.waitForResponse((response) => response.url().endsWith("/dynamic-assets/layers"));
		await page.getByRole("button",{name:button,exact:true}).click();
		const result = await response;
		assert.equal(result.status(),200,await result.text());
		const body = await result.json();
		await page.waitForFunction(() => ![...document.querySelectorAll("button")].find((button)=>button.getAttribute("aria-label")==="添加图层")?.disabled);
		return body;
	}
	const added = await layerOp("添加图层");
	assert.equal(added.definition.styles[0].fontSize,84,"add must retain unsaved edits");
	await page.getByRole("button",{name:"文字 · 文字",exact:true}).click();
	await font.fill("45");
	const duplicated = await layerOp("复制所选图层");
	await page.getByRole("button",{name:"文字 副本 · 文字",exact:true}).click();
	assert.equal(await font.inputValue(),"45");
	await font.fill("51");
	await page.getByRole("textbox",{name:/文字 副本.*字/}).fill("复制后可编辑");
	await page.getByRole("button",{name:"文字 · 文字",exact:true}).click();
	assert.equal(await font.inputValue(),"45","copy must have its own style");
	const removed = await layerOp("删除所选图层");
	assert.ok(!removed.definition.layers.some((layer)=>layer.content.element?.id===added.selectedLayerId));
	assert.ok(!removed.definition.inputs.some((input)=>input.layerIds.includes(added.selectedLayerId)));
	await page.getByRole("button",{name:"副文字 · 文字",exact:true}).click();
	assert.equal(await font.inputValue(),"40");
	await font.fill("48");
	await page.getByRole("textbox",{name:/副文字.*字/}).fill("两层都可编辑");
	await page.getByRole("spinbutton",{name:"纵向位置 %",exact:true}).fill("58");
	await page.getByRole("button",{name:"主文字 · 文字",exact:true}).click();
	assert.equal(await font.inputValue(),"84","switching layers must retain unsaved style changes");
	await page.getByRole("spinbutton",{name:"入场占比 %",exact:true}).fill("25");
	await layerOp("应用入场动效");
	await page.locator("summary").filter({hasText:/^高级关键帧/}).click();
	await page.getByRole("combobox",{name:"添加动画轨道",exact:true}).selectOption("rotation");
	await page.getByRole("button",{name:"移除旋转动画轨道",exact:true}).click();
	await page.getByRole("combobox",{name:"添加动画轨道",exact:true}).selectOption("x");
	await page.getByRole("spinbutton",{name:"水平位移关键帧2数值",exact:true}).fill("36");
	await page.getByRole("button",{name:"在水平位移关键帧1后插入",exact:true}).click();
	await page.getByRole("spinbutton",{name:"水平位移关键帧2时间",exact:true}).fill("35");
	await page.getByRole("spinbutton",{name:"水平位移关键帧2数值",exact:true}).fill("14");
	await page.getByRole("combobox",{name:"水平位移关键帧2缓动",exact:true}).selectOption("ease_in_out");
	assert.equal(await page.getByText("应用规则与分组",{exact:true}).count(),1);
	assert.equal(await page.getByRole("spinbutton",{name:"时长上限 秒"}).count(),0);
	await page.getByRole("button",{name:"保存修改",exact:true}).click();
	await page.waitForFunction(() => document.querySelector(".tw-dynamic-meta span")?.textContent === "v2");
	const saved = (await api("/dynamic-assets")).assets.find((asset) => asset.id === definition.id);
	assert.equal(saved.styles[0].fontSize,84);
	assert.equal(saved.styles.find((style)=>style.id === "secondary-style").fontSize,48);
	assert.equal(saved.layers.find((layer)=>layer.content.element?.id === "secondary").content.element.region.y,0.58);
	assert.equal(saved.inputs.find((input)=>input.id === "secondary-text").default,"两层都可编辑");
	const copy = saved.layers.find((layer)=>layer.content.element?.id===duplicated.selectedLayerId).content.element;
	assert.equal(saved.styles.find((style)=>style.id===copy.styleId).fontSize,51);
	assert.equal(saved.inputs.find((input)=>input.layerIds.includes(copy.id)).default,"复制后可编辑");
	const motions = saved.layers.find((layer)=>layer.content.element?.id===first.content.element.id).content.element.motions;
	assert.equal(motions.find((motion)=>motion.property==="opacity").keys[1].time,0.25);
	assert.deepEqual(motions.find((motion)=>motion.property==="x").keys[1],{time:0.35,value:14,easing:"ease_in_out"});
	assert.ok(!motions.some((motion)=>motion.property==="rotation"));
	await page.reload();
	await page.getByRole("button",{name:new RegExp(fixtureName)}).click();
	await page.getByRole("button",{name:"副文字 · 文字",exact:true}).click();
	assert.equal(await font.inputValue(),"48");
	await font.fill("63");
	await page.getByRole("button",{name:"撤销未保存修改",exact:true}).click();
	await page.waitForFunction(() => [...document.querySelectorAll("label")].find((label) => label.textContent.trim() === "字号")?.querySelector("input")?.value === "48");
	assert.equal(await font.inputValue(),"48");
	await page.getByRole("spinbutton",{name:"效果预览时长",exact:true}).fill("3");
	await page.waitForFunction(() => {
		const canvas = document.querySelector('canvas[aria-label="效果实时画面"]');
		if (!canvas) return false;
		const pixels = canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;
		for(let i=0;i<pixels.length;i+=4) if(pixels[i]>40 || pixels[i+1]>40 || pixels[i+2]>40) return true;
		return false;
	});
	await page.screenshot({path:"/tmp/effect-workbench-desktop.png",fullPage:true});
	await page.getByRole("button",{name:"重播效果",exact:true}).click();
	await page.waitForFunction(()=>Number(document.querySelector('input[aria-label="效果预览进度"]')?.value)>0.6);
	await page.getByRole("button",{name:"暂停效果",exact:true}).click();
	await page.setViewportSize({width:390,height:844});
	assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
	assert.ok(await page.locator('canvas[aria-label="效果实时画面"]').evaluate((canvas) => {
		const rect=canvas.getBoundingClientRect();
		return Math.abs(rect.width / rect.height - canvas.width / canvas.height) < 0.01;
	}),"mobile canvas must retain its authored aspect ratio");
	await page.screenshot({path:"/tmp/effect-workbench-mobile.png",fullPage:true});
	const after = (await api("/dynamic-assets")).assets;
	assert.deepEqual(after.find((asset)=>asset.id===definition.id),saved,"example duration and playback must not persist changes");
	for(const original of before) assert.deepEqual(after.find((asset)=>asset.id===original.id),original);
	await archiveTestStyle(base, definition.id);
	console.log(JSON.stringify({assetId:definition.id,passed:["add retains unsaved edits","copy has independent style and text input","remove cleans references","new layers persist","entrance creates editable keyframes","motion tracks and keyframe timing/easing persist","per-layer style and position persistence","input saved and reloaded","discard restores selected layer","example duration leaves definition unchanged","shared renderer nonblank","playback progress","mobile no overflow","existing library unchanged"]}));
} finally { await browser.close(); }
