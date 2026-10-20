import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base=process.env.OPENCUT_BASE_URL??'http://127.0.0.1:3000';
const read=async()=>{const r=await fetch(base+'/api/footage/templates/dynamic-assets');assert.ok(r.ok);return r.json();};
const before=await read();
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 let latest;
 const inserted=id=>page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/insert')&&r.request().postDataJSON()?.assetId===id);
 await page.goto(base+'/templates/effects/style-study-20260928-signal/try?revision=1&videoX=0&videoY=0&videoWidth=1&videoHeight=0.8');
 const ready=async()=>{await page.waitForFunction(()=>document.querySelector('.tw-trial-visual')?.getAttribute('aria-busy')==='false'||[...document.querySelectorAll('[role="alert"]')].some(e=>e.textContent.trim()));assert.deepEqual((await page.locator('[role="alert"]').allTextContents()).filter(s=>s.trim()),[]);};
 await ready();
 const select=page.getByRole('combobox',{name:'选择叠加样式',exact:true});
 const purpose=page.getByRole('combobox',{name:'叠加样式用途',exact:true});
 const search=page.getByRole('searchbox',{name:'搜索叠加样式',exact:true});
 const initialUrl=page.url();
 await purpose.selectOption('caption');
 const captions=before.assets.filter(style=>!before.library.some(entry=>entry.assetId===style.id&&entry.archived)&&style.purposes?.includes('caption'));
 assert.deepEqual(await select.locator('option').evaluateAll(options=>options.map(option=>option.value).filter(Boolean)),captions.map(style=>style.id));
 await select.selectOption('style-pilot-20260923-caption');
 await search.fill('missing-style-search-qa');
 await page.getByRole('status').filter({hasText:'没有匹配的叠加样式'}).waitFor();
 assert.equal(await select.inputValue(),'');
 assert.equal(await page.getByRole('button',{name:'叠加到试映',exact:true}).isDisabled(),true);
 assert.equal(page.url(),initialUrl,'Filtering must not change the application');
 await search.fill('逐词');
 assert.ok((await select.locator('option').allTextContents()).slice(1).every(name=>name.includes('逐词')));
 await search.fill('');
 await purpose.selectOption('all');
 for(const id of ['style-pilot-20260923-caption','style-study-20260928-idea']){
  await select.selectOption(id);
  const response=inserted(id);
  await page.getByRole('button',{name:'叠加到试映',exact:true}).click();
  const result=await response;assert.ok(result.ok(),await result.text());latest=(await result.json()).template;
  await ready();
 }
 assert.equal(new URL(page.url()).searchParams.has('styles'),true);
 assert.equal(latest.elements.length,5);
 assert.deepEqual(latest.layouts[0].videoRegion,{x:0,y:0,width:1,height:0.8});
 assert.equal(latest.elements.filter(e=>e.binding==='sentence').length,1);
 const composedUrl=page.url();
 await purpose.selectOption('decoration');
 assert.equal(await page.locator('.tw-trial-extra').count(),2);
 assert.equal(page.url(),composedUrl,'Changing the picker must retain the existing composition');
 const editCaption=async(action)=>{
  const response=inserted('style-pilot-20260923-caption');await action();
  const result=await response;assert.ok(result.ok(),await result.text());const draft=(await result.json()).template;await ready();return draft;
 };
 await editCaption(()=>page.getByRole('checkbox',{name:'叠加样式1独立位置与大小',exact:true}).check());
 await editCaption(()=>page.getByRole('checkbox',{name:'叠加样式1独立字幕行宽',exact:true}).check());
 const wide=await editCaption(()=>page.getByRole('spinbutton',{name:'叠加样式1字幕行宽',exact:true}).fill('0.84'));
 const narrow=await editCaption(()=>page.getByRole('spinbutton',{name:'叠加样式1字幕行宽',exact:true}).fill('0.6'));
 assert.deepEqual(wide.styles,narrow.styles);
 assert.deepEqual(wide.elements.find(e=>e.binding==='sentence').motions,narrow.elements.find(e=>e.binding==='sentence').motions);
 assert.equal(narrow.elements.find(e=>e.binding==='sentence').region.width,0.6);
 await editCaption(()=>page.getByRole('spinbutton',{name:'叠加样式1字幕行宽',exact:true}).fill('0.84'));

 assert.ok(latest.composition.treatments.some(t=>t.operation.kind==='text_highlight'));
 assert.equal(await page.getByRole('checkbox',{name:'独立字幕行宽',exact:true}).count(),0,'Primary-only control must not silently target the added caption');
 await page.getByRole('combobox',{name:'叠加样式2区域',exact:true}).selectOption('upper');await ready();

 const settings=JSON.parse(new URL(page.url()).searchParams.get('styles'));
 const lampId=settings[1].instanceId+'--decoration';
 const captionId=latest.elements.find(e=>e.binding==='sentence').id;
 await page.locator('.tw-trial-extra').nth(1).locator('summary').click();
 const attached=inserted('style-study-20260928-idea');
 await page.getByRole('combobox',{name:lampId+'跟随文字',exact:true}).selectOption(captionId);
 const attachedResult=await attached;assert.ok(attachedResult.ok(),await attachedResult.text());
 const linked=(await attachedResult.json()).template;
 assert.ok(linked.composition.spatialRelations.some(r=>r.elementId===lampId&&r.relativeTo===captionId&&r.referenceBounds==='text_box'&&r.followMotion));
 await ready();
 const url=page.url();await page.reload();await ready();
 assert.equal(page.url(),url);
 await page.locator('.tw-trial-extra').nth(1).locator('summary').click();
 assert.equal(await page.getByRole('combobox',{name:lampId+'跟随文字',exact:true}).inputValue(),captionId);
 assert.equal(await page.getByRole('spinbutton',{name:'叠加样式1字幕行宽',exact:true}).inputValue(),'0.84');
 assert.equal(await page.getByRole('checkbox',{name:'叠加样式1独立位置与大小',exact:true}).isChecked(),true);
 assert.equal(await page.getByRole('combobox',{name:'叠加样式2区域',exact:true}).inputValue(),'upper');
 await page.waitForFunction(()=>{
  const s=document.querySelector('.tw-effect-stage'),c=s?.querySelector('canvas');
  return c&&c.dataset.renderGeneration===s.dataset.previewGeneration&&c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4!==3&&v>50);
 });
 for(const width of [1280,390]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);await page.screenshot({path:`/tmp/trial-composition-${width}.png`,fullPage:true});}
 const removed=inserted('style-study-20260928-idea');
 await page.getByRole('button',{name:'移除叠加样式1',exact:true}).click();latest=(await(await removed).json()).template;await ready();
 assert.ok((await page.getByRole('status').allTextContents()).some(s=>s.includes('解除其他样式')));
 assert.equal(latest.composition.spatialRelations.some(r=>r.relativeTo===captionId),false);
 assert.deepEqual(latest.layouts[0].videoRegion,{x:0,y:0,width:1,height:0.8});
 assert.equal(latest.elements.length,4);assert.equal(latest.elements.some(e=>e.binding==='sentence'),false);
 await page.getByRole('button',{name:'移除叠加样式1',exact:true}).click();await ready();
 assert.equal(new URL(page.url()).searchParams.has('styles'),false);
 assert.deepEqual(await read(),before);
 console.log('composition/native elements/highlight/reload/regions/remove/mobile/render passed; library unchanged');
}finally{await browser.close();}
