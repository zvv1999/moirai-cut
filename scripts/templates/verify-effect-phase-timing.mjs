import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {randomUUID} from "node:crypto";

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:"playwright");
const base=process.env.WORKBENCH_URL??"http://127.0.0.1:3000";
assert.ok(process.env.TEST_EFFECT_ID,"Set TEST_EFFECT_ID to an existing sentence effect");
async function api(path,body) {
	const r=await fetch(`${base}/api/footage/templates${path}`,{method:body?"POST":"GET",headers:{"content-type":"application/json","x-requested-with":"moirai-footage"},body:body?JSON.stringify(body):undefined});
	const value=await r.json();assert.ok(r.ok,JSON.stringify(value));return value;
}
const source=(await api(`/dynamic-assets/${process.env.TEST_EFFECT_ID}`)).definition;
const definition={...structuredClone(source),id:`dynamic-${randomUUID()}`,revision:0,name:`验收 · 固定入退场 ${Date.now()}`};
await api("/dynamic-assets",{definition,baseRevision:0,idempotencyKey:`phase-${definition.id}`});
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
try {
	const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(20000);
	await page.goto(`${base}/templates`);
	await page.getByRole("button",{name:new RegExp(definition.name)}).click();
	await page.getByRole("combobox",{name:"动效时间模式",exact:true}).selectOption("phases");
	await page.getByRole("spinbutton",{name:"入场秒数",exact:true}).fill("0.2");
	await page.getByRole("spinbutton",{name:"退场秒数",exact:true}).fill("0.15");
	const changed=page.waitForResponse((response)=>response.url().endsWith("/dynamic-assets/layers"));
	await page.getByRole("button",{name:"应用入退场动效",exact:true}).click();
	assert.equal((await changed).status(),200);
	await page.getByRole("button",{name:"保存修改",exact:true}).click();
	await page.waitForFunction(()=>document.querySelector(".tw-dynamic-meta span")?.textContent==="v2");
	const saved=(await api(`/dynamic-assets/${definition.id}`)).definition;
	const element=saved.layers.find((layer)=>layer.content.element?.binding==="sentence").content.element;
	assert.deepEqual(element.motionTiming,{enterEnd:0.2,exitStart:0.8,enterSeconds:0.2,exitSeconds:0.15});
	async function frame(time) {
		time=Math.round(time*100)/100;
		await page.getByRole("slider",{name:"效果预览进度",exact:true}).fill(String(time));
		await page.waitForFunction((time)=>Math.abs(Number(document.querySelector("canvas")?.dataset.renderTime)-time)<0.0001,time);
		return page.locator("canvas").evaluate((canvas)=>{
			const pixels=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;
			let sum=0,count=0,minX=canvas.width,maxX=0;
			for(let i=0;i<pixels.length;i+=4) {const light=pixels[i]+pixels[i+1]+pixels[i+2];sum+=light;if(light>60){count++;minX=Math.min(minX,(i/4)%canvas.width);maxX=Math.max(maxX,(i/4)%canvas.width);}}
			return {sum,count,minX,maxX};
		});
	}
	const samples=[];
	for(const duration of [2,5]) {
		if(duration!==2) {
			const preview=page.waitForResponse((response)=>response.url().endsWith("/dynamic-assets/preview")&&response.request().postDataJSON()?.durationSeconds===duration);
			await page.getByRole("spinbutton",{name:"效果预览时长",exact:true}).fill(String(duration));
			assert.equal((await preview).status(),200);
		}
		const compiled=await api("/dynamic-assets/preview",{definition:saved,inputs:{},durationSeconds:duration});
		const clip=compiled.tracks.overlay.flatMap((track)=>track.elements)[0];
		const keys=clip.animations.opacity.keys;
		assert.equal(keys[1].time,24000);assert.equal(keys.at(-2).time,clip.duration-18000);
		const start=clip.startTime/120000,end=(clip.startTime+clip.duration)/120000;
		const enter=await frame(start+0.1);
		await page.getByRole("region",{name:"效果预览",exact:true}).screenshot({path:`/tmp/phase-enter-${duration}s.png`});
		const exit=await frame(end-0.075);
		assert.ok(enter.count>100&&exit.count>100);
		samples.push({enter,exit});
	}
	for(const phase of ["enter","exit"]) {
		assert.ok(Math.abs(samples[0][phase].sum/samples[1][phase].sum-1)<0.02,`${phase} appearance must not slow down with the sentence`);
		assert.ok(Math.abs(samples[0][phase].minX-samples[1][phase].minX)<=1);
		assert.ok(Math.abs(samples[0][phase].maxX-samples[1][phase].maxX)<=1);
	}
	const short=await api("/dynamic-assets/preview",{definition:saved,inputs:{},durationSeconds:0.2});
	const clip=short.tracks.overlay.flatMap((track)=>track.elements)[0];
	assert.equal(clip.duration,19200);
	assert.equal(clip.animations.opacity.keys.length,3);
	assert.equal(clip.animations.opacity.keys.at(-1).time,clip.duration);
	await page.reload();
	await page.getByRole("button",{name:new RegExp(definition.name)}).click();
	assert.equal(await page.getByRole("combobox",{name:"动效时间模式",exact:true}).inputValue(),"phases");
	assert.equal(await page.getByRole("spinbutton",{name:"入场秒数",exact:true}).inputValue(),"0.2");
	assert.deepEqual((await api(`/dynamic-assets/${definition.id}`)).definition,saved);
	assert.deepEqual((await api(`/dynamic-assets/${source.id}`)).definition,source);
	console.log(JSON.stringify({assetId:definition.id,samples,passed:["phase settings saved/reloaded","fixed entrance and exit ticks across durations","rendered entrance/exit speed invariant","short instance compressed without extension","source asset unchanged"]}));
} finally {await browser.close();}
