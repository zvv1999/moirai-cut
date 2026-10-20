import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000',id='style-caption-inline-cyan-candidate-20260929',root='/Users/zhengwei/Downloads/preview-view-zoom-20260929';
await fs.mkdir(root,{recursive:true});
async function library(){const r=await fetch(base+'/api/footage/templates/dynamic-assets');assert.ok(r.ok);return r.json();}
const before=await library(),browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],edits=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.url().endsWith('/dynamic-assets/layers')&&r.method()==='POST')edits.push(r.postDataJSON());});
 await page.goto(base+'/templates?effect='+id);
 const canvas=page.getByLabel('效果实时画面',{exact:true}),zoom=page.getByRole('combobox',{name:'预览查看比例',exact:true});
 await canvas.waitFor({state:'visible',timeout:60000});await zoom.waitFor();
 const undo=page.getByRole('button',{name:'撤销未保存修改',exact:true});assert.ok(await undo.isDisabled());
 const original=await canvas.evaluate(c=>({bitmap:c.toDataURL(),width:c.width,height:c.height,generation:c.parentElement.dataset.previewGeneration}));
 for(const [value,width] of [['1',1280],['2',2560]]){
  await zoom.selectOption(value);
  await page.waitForFunction(w=>document.querySelector('.tw-effect-stage canvas')?.getBoundingClientRect().width===w,width);
  assert.deepEqual(await canvas.evaluate(c=>({bitmap:c.toDataURL(),width:c.width,height:c.height,generation:c.parentElement.dataset.previewGeneration})),original);
  assert.ok(await undo.isDisabled());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 await page.getByRole('button',{name:'编辑布局区域',exact:true}).click();
 const polygon=page.locator('.tw-measured-selection polygon[data-measured-layer-id="headline"]');await polygon.waitFor({state:'visible'});
 await page.locator('.tw-effect-viewport').scrollIntoViewIfNeeded();
 const rect=await polygon.boundingBox();assert.ok(rect);const viewport=await page.locator('.tw-effect-viewport').boundingBox();
 const x=Math.max(rect.x,viewport.x)+Math.min(rect.width,viewport.width)/2,y=rect.y+rect.height/2;
 assert.ok(y>=viewport.y&&y<viewport.y+viewport.height,'selected text is centered in scroll viewport');
 await page.waitForFunction(()=>Math.abs(document.querySelector('.tw-measured-scale circle').getBoundingClientRect().width-12)<.1);
 await page.screenshot({path:root+'/zoom-desktop.png'});
 const response=page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/layers')&&r.request().method()==='POST');
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+40,y,{steps:5});await page.mouse.up();
 const edited=await response;assert.ok(edited.ok());const payload=await edited.json();await canvas.waitFor({state:'visible'});
 await fs.writeFile(root+'/move.json',JSON.stringify({request:edits.at(-1),response:payload},null,2));
 const request=edits.at(-1),change=request.operations?.[0]??request.operation??request.edit;
 assert.equal(change.kind,'move_in_frame');assert.equal(change.deltaX,20);assert.equal(change.deltaY,0);
 const authored=request.definition.layers.find(l=>l.content.element?.id==='headline').content.element;
 const moved=payload.definition.layers.find(l=>l.content.element?.id==='headline').content.element;
 for(const key of ['timing','motions','motionTiming','styles'])assert.deepEqual(moved[key],authored[key]);
 await undo.click();await canvas.waitFor({state:'visible'});assert.ok(await undo.isDisabled());
 const handle=page.locator('.tw-measured-scale circle[data-scale-edge="1"]');
 await handle.focus();
 const scaling=page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/layers')&&r.request().method()==='POST');
 await handle.press('ArrowRight');const scaledResponse=await scaling;assert.ok(scaledResponse.ok());
 const scaleChange=edits.at(-1).operation;assert.equal(scaleChange.kind,'scale_in_frame');assert.equal(scaleChange.axis,'x');
 assert.ok(scaleChange.delta[0]>0);await canvas.waitFor({state:'visible'});await undo.click();await canvas.waitFor({state:'visible'});
 await page.setViewportSize({width:390,height:844});await zoom.selectOption('1');await zoom.selectOption('2');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('.tw-effect-viewport').scrollIntoViewIfNeeded();await page.screenshot({path:root+'/zoom-mobile.png'});
 await zoom.selectOption('fit');await canvas.waitFor({state:'visible'});
 await page.waitForFunction(()=>Math.abs(document.querySelector('.tw-measured-scale circle').getBoundingClientRect().width-12)<.1);
 assert.equal(await canvas.evaluate(c=>c.toDataURL()),original.bitmap);assert.ok(await undo.isDisabled());
 assert.deepEqual(await library(),before);assert.deepEqual(errors,[]);
 await fs.writeFile(root+'/verification.json',JSON.stringify({passed:true,nativeCanvas:[original.width,original.height],zoomWidths:[1280,2560],unchangedBitmapAndGenerationOnZoom:true,dragCssPixels:40,dragScenePixels:20,undoRestoresBitmap:true,handleDiameterCssPixels:12,scaleHandleKeyboardOperationVerified:true,motionTimingAndStylesPreserved:true,mobileNoPageOverflow:true,libraryUnchanged:true,pageErrors:errors},null,2));
 console.log('PASS view zoom, native drag conversion, undo, mobile overflow, library preservation');
}finally{await browser.close();}
