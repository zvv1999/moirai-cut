import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000',root='/Users/zhengwei/Downloads/style-inspector-persistence-2026-09-29';
await fs.mkdir(root,{recursive:true});
async function read(path){const r=await fetch(base+'/api/footage/templates'+path);assert.ok(r.ok);return r.json();}
const before=await read('/dynamic-assets'),source=before.assets.find(a=>a.id==='style-study-20260928-cyan-impact');assert.ok(source);
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 let copy;try{copy=JSON.parse(await fs.readFile(root+'/copy.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!copy){
  await p.goto(base+'/templates?effect='+source.id);await p.getByRole('textbox',{name:'效果名称',exact:true}).waitFor();
  const response=p.waitForResponse(r=>r.url().endsWith('/dynamic-assets')&&r.request().method()==='POST');
  await p.getByRole('button',{name:'另存为新样式',exact:true}).click();const r=await response;assert.ok(r.ok(),await r.text());copy=(await r.json()).definition;
  assert.notEqual(copy.id,source.id);await fs.writeFile(root+'/copy.json',JSON.stringify(copy,null,2));
 }
 const live=(await read('/dynamic-assets/'+copy.id)).definition;assert.ok([1,2].includes(live.revision));
 await p.goto(base+'/templates?effect='+copy.id);await p.getByRole('textbox',{name:'效果名称',exact:true}).waitFor();
 const nav=p.getByRole('navigation',{name:'属性快捷定位',exact:true}),picker=p.getByRole('combobox',{name:'当前样式图层',exact:true});
 const layer=copy.layers.find(l=>l.content.element).content.element;
 await picker.selectOption(layer.id);await nav.getByRole('button',{name:'外观',exact:true}).click();
 if(live.revision===1){
  await p.getByRole('textbox',{name:'效果名称',exact:true}).fill('验收副本 · 跨分类编辑持久化');
  await p.getByLabel('描边宽度',{exact:true}).fill('7.5');
  await nav.getByRole('button',{name:'布局',exact:true}).click();await p.getByLabel('横向位置 %',{exact:true}).fill('8');
  await nav.getByRole('button',{name:'动效',exact:true}).click();await p.getByLabel('入场秒数',{exact:true}).fill('0.11');
  await picker.selectOption('root');await picker.selectOption(layer.id);
  await nav.getByRole('button',{name:'外观',exact:true}).click();assert.equal(await p.getByLabel('描边宽度',{exact:true}).inputValue(),'7.5');
  const response=p.waitForResponse(r=>r.url().endsWith('/dynamic-assets')&&r.request().method()==='POST');
  await p.getByRole('button',{name:'保存修改',exact:true}).click();const r=await response;assert.ok(r.ok(),await r.text());
  const saved=(await r.json()).definition;assert.equal(saved.id,copy.id);assert.equal(saved.revision,2);
  await fs.writeFile(root+'/saved.json',JSON.stringify(saved,null,2));
  await p.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent?.trim()==='保存修改'&&b.disabled));
 }
 await p.reload();await picker.waitFor();await picker.selectOption(layer.id);
 await nav.getByRole('button',{name:'外观',exact:true}).click();assert.equal(await p.getByLabel('描边宽度',{exact:true}).inputValue(),'7.5');
 await nav.getByRole('button',{name:'布局',exact:true}).click();assert.equal(await p.getByLabel('横向位置 %',{exact:true}).inputValue(),'8');
 await nav.getByRole('button',{name:'动效',exact:true}).click();assert.equal(await p.getByLabel('入场秒数',{exact:true}).inputValue(),'0.11');
 const expected=structuredClone(copy);expected.revision=2;expected.name='验收副本 · 跨分类编辑持久化';expected.styles.find(s=>s.id===layer.styleId).strokeWidth=7.5;
 const e=expected.layers.find(l=>l.content.element?.id===layer.id).content.element;e.region.x=.08;e.motionTiming.enterSeconds=.11;
 assert.deepEqual((await read('/dynamic-assets/'+copy.id)).definition,expected);
 await p.waitForFunction(()=>{const s=document.querySelector('.tw-effect-stage'),c=s?.querySelector('canvas');return c&&c.dataset.renderGeneration===s.dataset.previewGeneration;});
 await p.screenshot({path:root+'/reopened.png'});
 const archive=p.waitForResponse(r=>r.url().endsWith('/dynamic-assets/archive'));
 await p.getByRole('button',{name:'归档样式',exact:true}).click();const archived=await archive;assert.ok(archived.ok(),await archived.text());assert.equal((await archived.json()).entry.archived,true);
 const after=await read('/dynamic-assets');for(const asset of before.assets.filter(a=>a.id!==copy.id))assert.deepEqual(after.assets.find(a=>a.id===asset.id),asset);
 for(const entry of (before.library??[]).filter(e=>e.assetId!==copy.id))assert.deepEqual(after.library.find(e=>e.assetId===entry.assetId),entry);
 assert.equal(after.library.find(e=>e.assetId===copy.id).archived,true);assert.deepEqual(errors,[]);
 await fs.writeFile(root+'/verification.json',JSON.stringify({passed:true,copyId:copy.id,revision:2,sourceId:source.id,fields:['strokeWidth','region.x','motionTiming.enterSeconds'],fullDefinitionMatches:true,reopenedInUi:true,previewRendered:true,testCopyArchived:true,originalAssetsUnchanged:true,pageErrors:errors},null,2));
 console.log('PASS cross-section edits, layer switch, save/reopen and exact native definition; isolated copy archived');
}finally{await browser.close();}
