import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root=process.env.TRIAL_CONTENT_OUTPUT??'/Users/zhengwei/Downloads/trial-content-exchange-20260929',base='http://127.0.0.1:3000';await fs.mkdir(root,{recursive:true});
const manifest=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/caption-phrases-20260929/designs.json','utf8'));
const payload={version:1,entries:manifest.samples.map(s=>({...s,resourceBindings:[],layoutPhrases:[]})),liveInputId:manifest.samples[1].inputId};
await fs.writeFile(root+'/agent-content.json',JSON.stringify(payload,null,2));
const read=async()=>await(await fetch(base+'/api/footage/templates/dynamic-assets')).json();const before=await read();
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[],previews=[];page.on('response',r=>{if(r.ok()&&r.url().endsWith('/sample-preview'))previews.push(r.request().postDataJSON());});page.on('pageerror',e=>errors.push(e.message));
 const current=before.assets.find(a=>a.id==='style-caption-compact-candidate-20260929');assert.ok(current);
 await page.goto(base+'/templates/effects/'+current.id+'/try?revision='+current.revision);
 await page.getByText('与 AI 交换试映内容',{exact:true}).click();
 const upload=async(data)=>page.getByLabel('导入试映内容文件',{exact:true}).setInputFiles({name:'content.json',mimeType:'application/json',buffer:Buffer.from(typeof data==='string'?data:JSON.stringify(data))});
 await upload(payload);await page.getByText('已导入素材引用、内容标注和分段，并核对当前转写版本。可继续编辑；保存后才能在本标签页刷新恢复。',{exact:true}).waitFor();
 const download=async(name)=>{const pending=page.waitForEvent('download');await page.getByRole('button',{name:'导出试映内容 JSON',exact:true}).click();const d=await pending;await d.saveAs(root+'/'+name);return JSON.parse(await fs.readFile(root+'/'+name,'utf8'));};
 assert.deepEqual(await download('roundtrip.json'),payload);
 const omitted=structuredClone(payload);for(const entry of omitted.entries)delete entry.resourceBindings;
 await upload(omitted);await page.getByText('已导入素材引用、内容标注和分段，并核对当前转写版本。可继续编辑；保存后才能在本标签页刷新恢复。',{exact:true}).waitFor();
 assert.deepEqual(await download('optional-bindings-roundtrip.json'),payload,'omitted bindings become empty UI bindings after native validation');
 for(const [name,bad,error] of [
 ['malformed','{','无法读取试映内容 JSON'],
 ['bad-binding',{...payload,entries:payload.entries.map((s,i)=>i===1?{...s,resourceBindings:[{slotId:'missing-slot',assetId:'missing-asset',enabled:true}]}:s)},'resource'],
 ['stale',{...payload,entries:payload.entries.map((s,i)=>i===1?{...s,transcriptRevision:999999}:s)},'revision or source changed'],
 ['invalid-span',{...payload,entries:payload.entries.map((s,i)=>i===1?{...s,captionSpans:[{startWord:1,endWord:37}]}:s)},'caption spans must cover'],
 ['duplicate',{...payload,entries:[payload.entries[0],payload.entries[0]]},'duplicate sample'],
 ['invalid-focus',{...payload,entries:payload.entries.map((s,i)=>i===1?{...s,focalPoint:{x:2,y:.5}}:s)},'focal point must be normalized'],
 ['unknown-design',{...payload,entries:payload.entries.map((s,i)=>i===1?{...s,designResourceBindings:{missing:[]}}:s)},'不支持的字段：designResourceBindings'],
 ]){
  await upload(bad);await page.getByRole('alert').filter({hasText:error}).waitFor();assert.deepEqual(await download(name+'-preserved.json'),payload);
 }
 const content=page.locator('fieldset.tp-content-review').filter({hasText:'中文阅读 · 实测词时间 · 内容'});
 await content.locator('summary').filter({hasText:'字幕分段 ·'}).click();
 await content.getByRole('combobox',{name:'第1句拆分位置',exact:true}).selectOption('3');
 await content.getByRole('button',{name:'拆分第1句',exact:true}).click();await content.getByText('字幕分段 · 6 句',{exact:true}).waitFor();
 const edited=await download('human-edited.json');assert.deepEqual(edited.entries[0].captionSpans.slice(0,2),[{startWord:0,endWord:3},{startWord:3,endWord:10}]);assert.deepEqual(edited.entries[0].semanticUnits,payload.entries[0].semanticUnits);
 await upload(payload);await page.getByText('已导入素材引用、内容标注和分段，并核对当前转写版本。可继续编辑；保存后才能在本标签页刷新恢复。',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('.tw-effect-preview audio')&&document.querySelector('.tw-effect-preview')?.getAttribute('aria-busy')==='false');
 assert.ok(previews.some(p=>p.sample.inputId===payload.liveInputId&&JSON.stringify(p.sample.captionSpans)===JSON.stringify(payload.entries[1].captionSpans)));
 await page.getByRole('button',{name:'保存试映内容',exact:true}).click();await page.reload();await page.getByRole('button',{name:'恢复试映内容',exact:true}).click();await page.getByText('已恢复素材、内容标注和素材绑定，并核对当前转写版本。',{exact:true}).waitFor();
 await page.getByText('与 AI 交换试映内容',{exact:true}).click();assert.deepEqual(await download('restored.json'),payload);
 await page.getByText('与 AI 交换试映内容',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:root+'/desktop.png'});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:root+'/mobile.png'});
 assert.deepEqual(await read(),before);assert.deepEqual(errors,[]);
 await fs.writeFile(root+'/verification.json',JSON.stringify({passed:true,importedSamples:3,exactRoundtrip:true,optionalBindingsAccepted:true,humanSplitAfterImport:true,nativeSamplePreview:true,invalidImportsPreserveAllContent:true,saveReloadRestore:true,mobileNoOverflow:true,libraryUnchanged:true,pageErrors:errors},null,2));console.log('PASS file import/export, native invalid-range rejection, stale version, malformed/duplicate input, atomic state, save/reload, unchanged library.');
}finally{await browser.close();}
