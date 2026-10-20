import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000',id='style-study-20260928-growth';
const read=async()=>{const r=await fetch(base+'/api/footage/templates/dynamic-assets');assert.ok(r.ok);return r.json();};
const normalized=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='number'?Number(v.toFixed(12)):v));
const before=await read(),asset=before.assets.find(x=>x.id===id);assert.ok(asset);
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const response=(suffix='/application')=>page.waitForResponse(r=>r.url().endsWith('/dynamic-assets'+suffix)&&r.request().method()==='POST');
 const result=async pending=>{const r=await pending;const d=await r.json();assert.ok(r.ok(),JSON.stringify(d));return d.template;};
 let next=response();await page.goto(`${base}/templates/effects/${id}/try?revision=${asset.revision}&scale=.26&centerX=.25&centerY=.25`);const original=await result(next);
 const primary=page.getByRole('combobox',{name:'主样式出现语义',exact:true});
 next=response();await primary.selectOption('metric');let template=await result(next);assert.ok(template.elements.every(e=>JSON.stringify(e.intents)==='["metric"]'));
 assert.deepEqual(template.elements.map(e=>[e.id,e.region,e.timing,e.motions]),original.elements.map(e=>[e.id,e.region,e.timing,e.motions]));
 next=response();await page.reload();await result(next);assert.equal(await primary.inputValue(),'metric');
 next=response();await primary.selectOption('authored');template=await result(next);assert.deepEqual(template,original);assert.equal(new URL(page.url()).searchParams.has('intents'),false);
 await page.getByRole('combobox',{name:'选择叠加样式',exact:true}).selectOption(id);next=response('/insert');await page.getByRole('button',{name:'叠加到试映',exact:true}).click();await result(next);
 const extra=page.getByRole('combobox',{name:'叠加样式1出现语义',exact:true});next=response('/insert');await extra.selectOption('metric');template=await result(next);
 const sourceIds=new Set(original.elements.map(e=>e.id));assert.deepEqual(normalized(template.elements.filter(e=>sourceIds.has(e.id))),normalized(original.elements));assert.ok(template.elements.filter(e=>!sourceIds.has(e.id)).every(e=>JSON.stringify(e.intents)==='["metric"]'));
 next=response('/insert');await page.reload();template=await result(next);assert.equal(await extra.inputValue(),'metric');
 const captured=await fetch(base+'/api/footage/templates/dynamic-assets/capture',{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify({template,name:'语义组合只读验证'})});const data=await captured.json();assert.ok(captured.ok,JSON.stringify(data));
 const layers=data.definition.layers.filter(l=>l.content.kind==='element').map(l=>l.content.element);assert.equal(layers.filter(e=>JSON.stringify(e.intents)==='["metric"]').length,5);
 next=response('/insert');await extra.selectOption('any');template=await result(next);assert.ok(template.elements.filter(e=>!sourceIds.has(e.id)).every(e=>e.intents.length===0));
 await page.setViewportSize({width:390,height:844});await primary.scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.screenshot({path:'/tmp/trial-intents-mobile.png'});
 assert.deepEqual(await read(),before);assert.deepEqual(errors,[]);
 console.log('PASS native primary/extra intent overrides, unchanged host/geometry/timing/library, reload, authored restore, any intent, capture, mobile');
}finally{await browser.close();}
