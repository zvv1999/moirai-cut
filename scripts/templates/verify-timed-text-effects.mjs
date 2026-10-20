import assert from "node:assert/strict";
import {archiveTestStyle} from "./archive-test-style.mjs";
import {pathToFileURL} from "node:url";

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const base=process.env.WORKBENCH_URL ?? "http://127.0.0.1:3000";
async function api(path,body) {
	const response=await fetch(`${base}/api/footage/templates${path}`,{method:body?"POST":"GET",headers:{"content-type":"application/json","x-requested-with":"moirai-footage"},body:body?JSON.stringify(body):undefined});
	const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;
}
const before=(await api("/dynamic-assets")).assets;
const name=`验收 · 逐字高亮 ${Date.now()}`;
const {definition}=process.env.TEST_EFFECT_ID ? await api(`/dynamic-assets/${process.env.TEST_EFFECT_ID}`) : await api("/dynamic-assets/create",{name,canvas:{width:720,height:720,fps:30}});
if(process.env.TEST_EFFECT_ID){assert.match(definition.name,/^验收 · 逐字高亮 /);assert.equal(definition.revision,1,"resume only this run’s unsaved verification fixture");}
if(!process.env.TEST_EFFECT_ID)await api("/dynamic-assets",{definition,baseRevision:0,idempotencyKey:`timed-text-${definition.id}`});
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
try {
	const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(20000);
	await page.goto(`${base}/templates?effect=${definition.id}`);
	async function select(name,value) {
        await page.getByRole("navigation",{name:"属性快捷定位"}).getByRole("button",{name:name==="文字内容来源"?"应用规则":"外观",exact:true}).click();
		const response=page.waitForResponse((response)=>response.url().endsWith("/dynamic-assets/layers"));
		await page.getByRole("combobox",{name,exact:true}).selectOption(value);
		const r=await response;assert.equal(r.status(),200,await r.text());
		return (await r.json()).definition;
	}
	await select("文字内容来源","sentence");
    await page.getByRole("combobox",{name:"出现时机",exact:true}).selectOption("cue_start");
    await page.getByRole("spinbutton",{name:"显示时长上限",exact:true}).fill("600");
	await select("文字高亮方式","active_word");
	assert.equal(await page.getByRole("textbox",{name:/主文字.*字/}).count(),0,"bound text must not offer an ineffective literal input");
	await page.getByRole("button",{name:"保存修改",exact:true}).click();
	await page.waitForFunction(()=>document.querySelector(".tw-dynamic-meta span")?.textContent==="v2");
	const saved=(await api(`/dynamic-assets/${definition.id}`)).definition;
	assert.equal(saved.layers.find((layer)=>layer.content.element?.id==="headline").content.element.binding,"sentence");
	assert.ok(saved.treatments.some((treatment)=>treatment.operation.mode==="active_word"));
    const savedElement=saved.layers.find(layer=>layer.content.element?.id==="headline").content.element;
    assert.equal(savedElement.timing.anchor,"cue_start");assert.equal(savedElement.timing.maxSeconds,600);
    await page.reload();
    await page.getByRole("navigation",{name:"属性快捷定位"}).getByRole("button",{name:"应用规则",exact:true}).click();
    assert.equal(await page.getByRole("combobox",{name:"文字内容来源",exact:true}).inputValue(),"sentence");
    assert.equal(await page.getByRole("combobox",{name:"出现时机",exact:true}).inputValue(),"cue_start");
    assert.equal(await page.getByRole("spinbutton",{name:"显示时长上限",exact:true}).inputValue(),"600");
	async function yellowCenter(time,expectedAfter=-1) {
		await page.getByRole("slider",{name:"效果预览进度",exact:true}).fill(String(time));
		await page.waitForFunction((after)=>{
			const canvas=document.querySelector('canvas[aria-label="效果实时画面"]');if(!canvas)return false;
			const pixels=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;
			let count=0,sum=0;
			for(let i=0;i<pixels.length;i+=4)if(pixels[i]>180&&pixels[i+1]>140&&pixels[i+2]<140){count++;sum+=(i/4)%canvas.width;}
			return count>30&&sum/count>after;
		},expectedAfter);
		return page.locator("canvas").evaluate((canvas)=>{
			const pixels=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;let count=0,sum=0;
			for(let i=0;i<pixels.length;i+=4)if(pixels[i]>180&&pixels[i+1]>140&&pixels[i+2]<140){count++;sum+=(i/4)%canvas.width;}
			return sum/count;
		});
	}
	const first=await yellowCenter(0.5);
	await page.getByRole("region",{name:"效果预览",exact:true}).screenshot({path:"/tmp/timed-caption-first-word.png"});
	const later=await yellowCenter(1.3,first+60);
	assert.ok(later>first+60,"highlight must advance through words, not recolor the whole sentence");
	await page.getByRole("region",{name:"效果预览",exact:true}).screenshot({path:"/tmp/timed-caption-later-word.png"});
	await page.getByRole("spinbutton",{name:"效果预览时长",exact:true}).fill("4");
	await yellowCenter(2.6,first+60);
	assert.deepEqual((await api(`/dynamic-assets/${definition.id}`)).definition,saved);
	await page.getByText("示例文案",{exact:true}).click();
	await page.getByRole("textbox",{name:"预览示例重点词",exact:true}).fill("字幕");
	await page.getByRole("textbox",{name:"预览示例句子",exact:true}).fill("一句新的字幕示例");
	await yellowCenter(2.6);
	assert.deepEqual((await api(`/dynamic-assets/${definition.id}`)).definition,saved,"preview text must not be saved as template content");
	await page.setViewportSize({width:390,height:844});
	assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
	await page.getByRole("region",{name:"效果预览",exact:true}).screenshot({path:"/tmp/timed-caption-mobile.png"});
	await page.setViewportSize({width:1280,height:900});
	await select("文字高亮方式","none");
	await select("文字内容来源","keyword");
    await page.getByRole("combobox",{name:"出现时机",exact:true}).selectOption("keyword_start");
	const keyword=await select("文字高亮方式","keyword");
	const compiled=await api("/dynamic-assets/preview",{definition:keyword,inputs:{},durationSeconds:4,example:{text:"一句新的字幕示例",keyword:"字幕"}});
	const clips=compiled.tracks.overlay.flatMap((track)=>track.elements);
	assert.equal(clips.length,1);assert.equal(clips[0].params.content,"字幕");
	assert.equal(compiled.example.timingSource,"synthetic_example");
	await yellowCenter(2.2);
	await page.getByRole("region",{name:"效果预览",exact:true}).screenshot({path:"/tmp/timed-keyword-effect.png"});
	await page.getByRole("button",{name:"撤销未保存修改",exact:true}).click();
	await page.waitForFunction(()=>document.querySelector('select[aria-label="文字内容来源"]')?.value==="sentence");
	assert.deepEqual((await api(`/dynamic-assets/${definition.id}`)).definition,saved);
	const after=(await api("/dynamic-assets")).assets;
	for(const original of before.filter(asset=>asset.id!==definition.id))assert.deepEqual(after.find((asset)=>asset.id===original.id),original);
	await archiveTestStyle(base,definition.id);
	console.log(JSON.stringify({assetId:definition.id,centers:[first,later],passed:["sentence/active-word mode saved","highlight follows individual words","slower preview timing","example text leaves template unchanged","keyword uses only selected phrase","discard restores saved text mode","mobile no overflow","existing assets unchanged"]}));
} finally {await browser.close();}
