import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {archiveTestStyle} from './archive-test-style.mjs';
const base='http://127.0.0.1:3000', root='/Users/zhengwei/Downloads/chinese-style-revision-roundtrip-20260929';
await fs.mkdir(root,{recursive:true});
async function api(path,body){const r=await fetch(base+'/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;}
const before=await api('/dynamic-assets'),source=before.assets.find(a=>a.id==='style-caption-inline-soft-panel-candidate-20260929');assert.ok(source);
const seed=(await api('/dynamic-assets/create',{name:'验收 · 中文换版试映 '+Date.now(),canvas:source.canvas,purpose:'caption'})).definition;
const definition={...source,id:seed.id,name:seed.name,revision:seed.revision};
await api('/dynamic-assets',{definition,baseRevision:0,idempotencyKey:'cn-roundtrip-'+seed.id});
const savedBefore=(await api('/dynamic-assets/'+seed.id)).definition;
await fs.writeFile(root+'/fixture.json',JSON.stringify(savedBefore,null,2));
const file='/Users/zhengwei/Downloads/caption-measured-chinese-20260929/agent-content.json',content=JSON.parse(await fs.readFile(file));
const params=new URLSearchParams({revision:String(savedBefore.revision),format:'portrait',placement:'full',scale:'1.6',centerX:'.5',centerY:'.88',captionWidth:'.9'});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const preview=()=>page.waitForResponse(r=>r.ok()&&r.url().endsWith('/dynamic-assets/sample-preview')&&r.request().postDataJSON().sample.inputId===content.liveInputId,{timeout:60000});
 await page.goto(`${base}/templates/effects/${seed.id}/try?${params}`);
 let pending=preview();await page.getByLabel('导入试映内容文件',{exact:true}).setInputFiles(file);let response=await pending;
 const originalSample=response.request().postDataJSON().sample,originalPreview=await response.json();
 const key=`moirai.style.trial-content.v1:/templates/effects/${seed.id}/try:automatic`;
 await page.waitForFunction(k=>JSON.parse(sessionStorage.getItem(k)||'null')?.entries?.length===3,key);
 const snapshot=await page.evaluate(k=>JSON.parse(sessionStorage.getItem(k)),key);
 for(const entry of content.entries){const actual=snapshot.entries.find(e=>e.inputId===entry.inputId);for(const field of ['transcriptRevision','semanticUnits','captionSpans','layoutPhrases'])assert.deepEqual(actual[field],entry[field]);}
 await page.getByRole('link',{name:'返回效果工作台',exact:true}).click();
 await page.getByRole('spinbutton',{name:'字号',exact:true}).fill('42');
 pending=preview();await page.getByRole('button',{name:'保存并用声音试效果',exact:true}).click();
 await page.waitForURL(url=>url.pathname.endsWith('/try')&&url.searchParams.get('revision')===String(savedBefore.revision+1));
 response=await pending;const restoredSample=response.request().postDataJSON().sample,restoredPreview=await response.json();
 await page.getByText('已自动恢复上次试映内容，并核对当前转写版本。',{exact:true}).waitFor();
 for(const [k,v]of params)if(k!=='revision')assert.equal(new URL(page.url()).searchParams.get(k),v,k);
 assert.deepEqual(restoredSample,originalSample);assert.deepEqual(restoredPreview.captions,originalPreview.captions);assert.equal(restoredPreview.captions.length,8);
 assert.equal(await page.locator('label.tp-choice input:checked').count(),3);
 assert.deepEqual(await page.evaluate(k=>JSON.parse(sessionStorage.getItem(k)),key),snapshot);
 const metadata=restoredPreview.tracks.overlay.flatMap(t=>t.elements).map(e=>e.params?.['text.layoutPhrases']).filter(Boolean).map(JSON.parse);
 assert.deepEqual(metadata.flatMap(m=>m.ranges.map(r=>m.content.slice(r.start,r.end))),['完成时间']);
 const savedAfter=(await api('/dynamic-assets/'+seed.id)).definition;
 assert.equal(savedAfter.styles[0].fontSize,42);
 const expected=structuredClone(savedBefore);expected.revision++;expected.styles[0].fontSize=42;assert.deepEqual(savedAfter,expected);
 await page.getByLabel('效果实时画面',{exact:true}).waitFor({state:'visible',timeout:60000});
 await page.screenshot({path:root+'/restored-desktop.png'});
 pending=preview();await page.reload();response=await pending;assert.deepEqual(response.request().postDataJSON().sample,originalSample);await page.getByText('已自动恢复上次试映内容，并核对当前转写版本。',{exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:root+'/restored-mobile.png'});
 assert.deepEqual(errors,[]);await archiveTestStyle(base,seed.id);const after=await api('/dynamic-assets');for(const old of before.assets)assert.deepEqual(after.assets.find(a=>a.id===old.id),old);
 await fs.writeFile(root+'/verification.json',JSON.stringify({passed:true,fixtureId:seed.id,previousRevision:savedBefore.revision,savedRevision:savedAfter.revision,fontSize:42,threeChineseInputsRestored:true,sampleExactlyPreserved:true,eightCueTimingsPreserved:true,phrase:'完成时间',portraitApplicationPreserved:true,reloadPreserved:true,mobileNoOverflow:true,existingStylesUnchanged:true,fixtureArchived:true,pageErrors:errors},null,2));
 console.log('PASS Chinese content, phrase, measured cues and portrait application across saved style revision and reload');
}finally{await browser.close();}
