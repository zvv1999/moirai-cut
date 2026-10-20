import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000',root='/Users/zhengwei/Downloads/inline-caption-readability-20260929',id='style-caption-inline-cyan-candidate-20260929';
async function api(path,body){const r=await fetch(base+'/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const before=await api('/dynamic-assets'),application=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/inline-caption-saved-20260929/application.json','utf8'));
const {template}=await api('/dynamic-assets/application',application),manifest=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/inline-caption-saved-20260929/designs.json','utf8'));
const validated=await api('/samples/validate',{template,samples:manifest.samples});const previews=[];
for(let i=0;i<manifest.samples.length;i++){const p=await api('/dynamic-assets/sample-preview',{template,sample:manifest.samples[i]});assert.deepEqual(p.captions,validated.samples[i].plan.captions);previews.push(p);}
const imported=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/caption-keyword-corner-20260929/agent-content.json','utf8'));imported.liveInputId=manifest.samples[2].inputId;await fs.writeFile(root+'/trial-content.json',JSON.stringify(imported));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/templates/effects/'+id+'/try?revision=1');await page.getByRole('button',{name:'1 选素材与内容',exact:true}).click();
 const sampleResponse=page.waitForResponse(r=>r.ok()&&r.url().endsWith('/dynamic-assets/sample-preview')&&r.request().postDataJSON().sample.inputId===manifest.samples[2].inputId);
 await page.getByLabel('导入试映内容文件',{exact:true}).setInputFiles(root+'/trial-content.json');const sample=await(await sampleResponse).json();
 const canvas=page.getByLabel('效果实时画面',{exact:true});await canvas.waitFor({state:'visible',timeout:60000});
 await page.getByText(/^预览检查 ·/).click();await page.getByText('定位需检查的字幕',{exact:true}).click();
 const cue=sample.captions.find(c=>c.text.includes('teaching assistant'));assert.ok(cue);assert.equal(cue.start,2.12);assert.equal(cue.end,3.12);
 const locate=page.getByRole('button',{name:'定位字幕：'+cue.text,exact:true});await locate.click();
 await page.waitForFunction(t=>Number(document.querySelector('[aria-label="效果预览进度"]').value)===t,cue.start);await canvas.waitFor({state:'visible'});
 const audio=page.locator('.tw-effect-preview audio');assert.ok(await audio.evaluate(a=>a.paused));assert.ok(Math.abs(await audio.evaluate(a=>a.currentTime)-cue.start)<.02);
 await page.screenshot({path:root+'/diagnostics-desktop.png'});
 await page.setViewportSize({width:390,height:844});await locate.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:root+'/diagnostics-mobile.png'});await locate.click();await canvas.waitFor({state:'visible'});
 assert.deepEqual(await api('/dynamic-assets'),before);assert.deepEqual(errors,[]);
 await fs.writeFile(root+'/diagnostic-verification.json',JSON.stringify({passed:true,threeNativeCaptionListsMatchPlans:true,totalCaptions:previews.reduce((n,p)=>n+p.captions.length,0),targetCue:cue,seekTime:cue.start,audioPausedAndAligned:true,mobileNoOverflow:true,libraryUnchanged:true,pageErrors:errors},null,2));console.log('PASS native diagnostic locations, seek/audio alignment, mobile, unchanged library');
}finally{await browser.close();}
