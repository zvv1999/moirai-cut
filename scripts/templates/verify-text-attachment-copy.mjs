import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const source='/Users/zhengwei/OpenCutProjects/tpl-preview-2d466bfe496c625b8d07e7c83da9bf67-0-1/project.json';
const document=JSON.parse(await readFile(source,'utf8'));
const projectId='tpl-preview-copy-check-'+randomUUID();
const directory='/Users/zhengwei/OpenCutProjects/'+projectId;
await mkdir(directory);
Object.assign(document.metadata,{id:projectId,name:'复制依附 · 浏览器验证',thumbnail:'',duration:240000});
document.revision=0;
const scene=document.scenes[0];scene.id=projectId+'-scene';document.currentSceneId=scene.id;
scene.tracks.audio=[];
for(const track of scene.tracks.overlay)track.elements=track.elements.slice(0,1);
await writeFile(directory+'/project.json',JSON.stringify(document));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const report={projectId,frames:[]};
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.addInitScript(()=>localStorage.setItem('hasSeenAgentOnboardingV2','true'));
 await page.goto('http://127.0.0.1:3000/editor/'+projectId);
 await page.waitForFunction(()=>window.__opencutAgent?.getState().ok,{},{timeout:60000});
 const state=async()=>{const r=await page.evaluate(()=>window.__opencutAgent.getState());assert.equal(r.ok,true);return r.data;};
 const clips=s=>s.tracks.flatMap(t=>t.elements.map(e=>({...e,trackId:t.id})));
 const before=await state();const originalIds=clips(before).map(e=>e.id);assert.equal(originalIds.length,2);
 // Human entry: actual editor keyboard action, including async native preparation.
 await page.locator('body').click({position:{x:700,y:950}});
 await page.keyboard.press('ControlOrMeta+a');
 const response=page.waitForResponse(r=>r.url().endsWith('/timeline/copies/remap'),{timeout:15000});
 await page.keyboard.press('ControlOrMeta+d');
 assert.equal((await response).ok(),true);
 await page.waitForFunction(()=>window.__opencutAgent.getState().data.tracks.reduce((n,t)=>n+t.elements.length,0)===4);
 const after=await state();const copies=clips(after).filter(e=>!originalIds.includes(e.id));
 const text=copies.find(e=>e.type==='text'),icon=copies.find(e=>e.type==='graphic');
 assert.deepEqual(icon.textAttachment.parent,{elementId:text.id,trackId:text.trackId,groupPath:[]});
 assert.equal(icon.params['template.attachedTo'],text.id);
 for(const method of ['undo','redo'])assert.equal((await page.evaluate(method=>window.__opencutAgent[method](),method)).ok,true);
 assert.deepEqual(clips(await state()).map(e=>e.id).sort(),clips(after).map(e=>e.id).sort());
 const apply=async operation=>{const s=await state();const r=await page.evaluate(async args=>window.__opencutAgent.applyOperationAsync(args),{operation,baseRevision:s.revision,idempotencyKey:randomUUID(),expectedProjectId:projectId});assert.equal(r.ok,true,JSON.stringify(r));return r.data;};
 // Remove originals from rendering: a wrongly retained reference now fails.
 for(const track of before.tracks.filter(t=>t.elements.length))await apply({type:'track.toggleVisibility',trackId:track.id});
 for(const content of ['重点','真正打动你的地方']) {
  await apply({type:'element.setParams',elementId:text.id,trackId:text.trackId,params:{content}});
  const result=await page.evaluate(()=>window.__opencutAgent.renderFrames({atSeconds:[1]}));
  assert.equal(result.ok,true,JSON.stringify(result));const frame=result.data.frames[0];assert.ok(frame.pngBase64,JSON.stringify(frame));
  const pixels=await page.evaluate(async png=>{const b=await createImageBitmap(await(await fetch('data:image/png;base64,'+png)).blob());const c=new OffscreenCanvas(b.width,b.height),ctx=c.getContext('2d');ctx.drawImage(b,0,0);b.close();const p=ctx.getImageData(0,0,c.width,c.height).data;let greenRight=-1,redLeft=c.width;for(let i=0;i<p.length;i+=4){const x=i/4%c.width;if(p[i+1]>200&&p[i]<30&&p[i+2]<30)greenRight=Math.max(greenRight,x);if(p[i]>200&&p[i+1]<30&&p[i+2]<30)redLeft=Math.min(redLeft,x);}return {greenRight,redLeft,gap:redLeft-greenRight-1};},frame.pngBase64);
  assert.ok(pixels.greenRight>=0&&pixels.redLeft<720,JSON.stringify(pixels));assert.ok(Math.abs(pixels.gap-14.4)<=2,JSON.stringify(pixels));
  await writeFile(directory+`/copy-frame-${report.frames.length}.png`,Buffer.from(frame.pngBase64,'base64'));report.frames.push({content,...pixels});
 }
 assert.notEqual(report.frames[0].redLeft,report.frames[1].redLeft);
 // AI entry, child-only: intentionally retain the copied text as external parent.
 const previous=clips(await state()).map(e=>e.id);
 await apply({type:'element.duplicate',elements:[{trackId:icon.trackId,elementId:icon.id}]});
 const aiCopy=clips(await state()).find(e=>!previous.includes(e.id));
 assert.deepEqual(aiCopy.textAttachment.parent,{elementId:text.id,trackId:text.trackId,groupPath:[]});
 const rendered=await page.evaluate(()=>window.__opencutAgent.renderFrames({atSeconds:[1]}));assert.equal(rendered.ok,true);assert.ok(rendered.data.frames[0].pngBase64);
 // Keep the page alive through debounced autosave; readback of the initial file
 // is not evidence that these edits survived persistence.
 let saved;
 for(let attempt=0;attempt<75;attempt++) {
  saved=JSON.parse(await readFile(directory+'/project.json','utf8'));
  const elements=saved.scenes[0].tracks.overlay.flatMap(t=>t.elements);
  if(elements.length===5&&elements.some(e=>e.id===aiCopy.id))break;
  await delay(200);
 }
 const savedTracks=saved.scenes[0].tracks.overlay;
 assert.equal(savedTracks.flatMap(t=>t.elements).length,5,'all copies must be saved before closing');
 const savedIcon=savedTracks.flatMap(t=>t.elements).find(e=>e.id===aiCopy.id);
 assert.deepEqual(savedIcon.textAttachment.parent,{elementId:text.id,trackId:text.trackId,groupPath:[]});
 assert.equal(savedIcon.params['template.attachedTo'],text.id);
 report.savedRevision=saved.revision;
 await page.reload();
 await page.waitForFunction(()=>window.__opencutAgent?.getState().ok,{},{timeout:60000});
 const reloaded=clips(await state());assert.equal(reloaded.length,5);
 assert.deepEqual(reloaded.find(e=>e.id===aiCopy.id).textAttachment.parent,savedIcon.textAttachment.parent);
 const restoredFrame=await page.evaluate(()=>window.__opencutAgent.renderFrames({atSeconds:[1]}));
 assert.equal(restoredFrame.ok,true);assert.ok(restoredFrame.data.frames[0].pngBase64);
 await page.screenshot({path:directory+'/editor.png'});
 await writeFile(directory+'/copy-review.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,directory}));
} finally {await browser.close();}
