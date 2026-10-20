import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const base = process.env.WORKBENCH_URL ?? "http://127.0.0.1:3000";
const firstTime=process.env.TEST_PREVIEW_FIRST_TIME ?? "0.1";
const secondTime=process.env.TEST_PREVIEW_SECOND_TIME ?? "0.7";
assert.ok(process.env.TEST_EFFECT_ID,"Set TEST_EFFECT_ID to an animated effect fixture");
const saved = await (await fetch(`${base}/api/footage/templates/dynamic-assets/${process.env.TEST_EFFECT_ID}`)).json();
assert.ok(saved.definition,JSON.stringify(saved));
const browser = await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE ? {executablePath:process.env.CHROME_EXECUTABLE}: {})});
try {
	const page = await browser.newPage({viewport:{width:1280,height:900}});
	await page.goto(`${base}/templates`);
	await page.getByRole("button",{name:`${saved.definition.name} v${saved.definition.revision} · ${saved.definition.layers.length} 层`,exact:true}).click();
	for (const [viewport,label] of [[{width:1280,height:900},"desktop"],[{width:390,height:844},"mobile"]]) {
		await page.setViewportSize(viewport);
		const seek = page.getByRole("slider",{name:"效果预览进度",exact:true});
		await seek.fill(firstTime);
		await page.waitForFunction(() => {
			const canvas = document.querySelector('canvas[aria-label="效果实时画面"]');
			if(!canvas) return false;
			const pixels = canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;
			return pixels.some((value,index)=>index%4!==3&&value>40);
		});
		const hash = await page.locator("canvas").evaluate((canvas)=>{
			const pixels=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;
			return pixels.reduce((hash,value)=>Math.imul(hash^value,16777619)>>>0,2166136261);
		});
		await seek.fill(secondTime);
		await page.waitForFunction((previous)=>{
			const canvas=document.querySelector('canvas[aria-label="效果实时画面"]');
			const pixels=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;
			return pixels.some((value,index)=>index%4!==3&&value>40) && pixels.reduce((hash,value)=>Math.imul(hash^value,16777619)>>>0,2166136261)!==previous;
		},hash);
		const dimensions=await page.locator("canvas").evaluate((canvas)=>({width:canvas.getBoundingClientRect().width,height:canvas.getBoundingClientRect().height,ratio:canvas.width/canvas.height}));
		assert.ok(Math.abs(dimensions.width/dimensions.height-dimensions.ratio)<0.01);
		assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),viewport.width);
		await page.getByRole("region",{name:"效果预览",exact:true}).screenshot({path:`/tmp/effect-preview-${label}.png`});
		if(label === "desktop") {
			await page.locator("summary").filter({hasText:/^高级关键帧/}).click();
			await page.getByRole("combobox",{name:"添加动画轨道",exact:true}).scrollIntoViewIfNeeded();
			const preview=await page.getByRole("region",{name:"效果预览",exact:true}).boundingBox();
			const control=await page.getByRole("combobox",{name:"添加动画轨道",exact:true}).boundingBox();
			assert.ok(preview.y>=0 && preview.y+preview.height<=viewport.height,"preview must stay visible while editing motion");
			assert.ok(preview.x+preview.width<=control.x,"motion inspector must not overlap the preview");
			await page.screenshot({path:"/tmp/effect-workbench-sticky-preview.png"});
		}
	}
	const after=await(await fetch(`${base}/api/footage/templates/dynamic-assets/${process.env.TEST_EFFECT_ID}`)).json();
	assert.deepEqual(after,saved);
	console.log(JSON.stringify({passed:["desktop/mobile animated pixel difference","nonblank frames","canvas aspect ratio","no overflow","saved definition unchanged"]}));
} finally {await browser.close();}
