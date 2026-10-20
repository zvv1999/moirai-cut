import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root='/Users/zhengwei/Downloads/layout-phrase-inspector-2026-09-29';await fs.mkdir(root,{recursive:true});
const originalPath='/Users/zhengwei/OpenCutProjects/tpl-preview-15faf659898e6da152c6780aa9f2085f-0-0/project.json';
const original=await fs.readFile(originalPath,'utf8'),doc=JSON.parse(original),projectId='tpl-preview-phrase-inspector-'+randomUUID(),directory='/Users/zhengwei/OpenCutProjects/'+projectId;
Object.assign(doc.metadata,{id:projectId,name:'同排短语 · 属性面板验证',thumbnail:''});doc.revision=0;
const scene=doc.scenes[0];scene.id=projectId+'-scene';doc.currentSceneId=scene.id;doc.scenes=[scene];
const track=scene.tracks.overlay.find(t=>t.elements.some(e=>e.params?.['text.layoutPhrases']));assert.ok(track);
const clip=track.elements.find(e=>e.params?.['text.layoutPhrases']);track.elements=[clip];scene.tracks.overlay=[track];scene.tracks.audio=[];scene.tracks.main.elements=[];
await fs.mkdir(directory);await fs.writeFile(directory+'/project.json',JSON.stringify(doc));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept().catch(()=>{}));await page.addInitScript(()=>localStorage.setItem('hasSeenAgentOnboardingV2','true'));
 const waitReady=()=>page.waitForFunction(()=>window.__opencutAgent?.getState().ok,{},{timeout:60000});
 const select=async()=>{const r=await page.evaluate(uri=>window.__opencutAgent.revealContext({uri}),`opencut://project/${projectId}/scene/${scene.id}/track/${track.id}/element/${clip.id}`);assert.ok(r.ok,JSON.stringify(r));};
 const state=async()=>{const r=await page.evaluate(()=>window.__opencutAgent.getState());assert.ok(r.ok);return r.data;};
 const current=async()=> (await state()).tracks.flatMap(t=>t.elements).find(e=>e.id===clip.id);
 const panel=page.getByRole('region',{name:'字幕同排短语',exact:true});
 await page.goto('http://127.0.0.1:3000/editor/'+projectId);await waitReady();await select();
 await panel.getByText('最重要',{exact:true}).waitFor();console.log('inspector loaded');
 const before=await current();
 await panel.getByRole('button',{name:'移除第1个同排短语',exact:true}).click();assert.deepEqual(JSON.parse((await current()).params['text.layoutPhrases']).ranges,[]);
 assert.ok((await page.evaluate(()=>window.__opencutAgent.undo())).ok);await panel.getByText('最重要',{exact:true}).waitFor();
 await panel.getByRole('button',{name:'清除同排短语',exact:true}).click();assert.equal((await current()).params['text.layoutPhrases'],'');
 const area=panel.getByLabel('选择同排短语文字',{exact:true});await area.focus();await area.press('ControlOrMeta+a');await area.press('ArrowLeft');for(let n=0;n<5;n++)await area.press('ArrowRight');for(let n=0;n<3;n++)await area.press('Shift+ArrowRight');assert.deepEqual(await area.evaluate(e=>[e.selectionStart,e.selectionEnd]),[5,8]);
 await panel.getByRole('button',{name:'添加同排短语',exact:true}).click();console.log('added', (await current()).params['text.layoutPhrases']);await panel.getByText('最重要',{exact:true}).waitFor();
 const saved=(await current()).params['text.layoutPhrases'];assert.equal(JSON.parse(saved).ranges[0].start,5);
 for(let n=0;n<75;n++){const d=JSON.parse(await fs.readFile(directory+'/project.json','utf8'));if(d.scenes[0].tracks.overlay[0].elements[0].params['text.layoutPhrases']===saved)break;await delay(200);}
 assert.equal(JSON.parse(await fs.readFile(directory+'/project.json','utf8')).scenes[0].tracks.overlay[0].elements[0].params['text.layoutPhrases'],saved);
 console.log('saved; reloading');await page.reload();await waitReady();await select();await panel.getByText('最重要',{exact:true}).waitFor();
 const s=await state();const changed=await page.evaluate(args=>window.__opencutAgent.applyOperationAsync(args),{operation:{type:'element.setParams',trackId:track.id,elementId:clip.id,params:{content:'已经换成另一句文字'}},baseRevision:s.revision,idempotencyKey:randomUUID(),expectedProjectId:projectId});assert.ok(changed.ok,JSON.stringify(changed));
 await panel.getByText(/原有同排范围已失效/).waitFor();
 assert.ok((await page.evaluate(()=>window.__opencutAgent.undo())).ok);await panel.getByText('最重要',{exact:true}).waitFor();
 const after=await current();assert.equal(after.startTime,before.startTime);assert.equal(after.duration,before.duration);assert.deepEqual(after.animations,before.animations);
 const emojiState=await state();
 const emojiResult=await page.evaluate(args=>window.__opencutAgent.applyOperationAsync(args),{operation:{type:'element.setParams',trackId:track.id,elementId:clip.id,params:{content:'看👨‍👩‍👧‍👦重点'}},baseRevision:emojiState.revision,idempotencyKey:randomUUID(),expectedProjectId:projectId});assert.ok(emojiResult.ok);
 for(const label of ['选择同排短语文字','选择关键词文字']){
  const field=page.getByLabel(label,{exact:true});await field.focus();await field.press('ControlOrMeta+a');await field.press('ArrowLeft');await field.press('ArrowRight');await field.press('Shift+ArrowRight');
  assert.deepEqual(await field.evaluate(e=>[e.selectionStart,e.selectionEnd,e.value.slice(e.selectionStart,e.selectionEnd)]),[1,12,'👨‍👩‍👧‍👦']);
  await field.press('ArrowRight');await field.press('Shift+ArrowLeft');assert.deepEqual(await field.evaluate(e=>[e.selectionStart,e.selectionEnd]),[1,12]);
 }
 assert.ok((await page.evaluate(()=>window.__opencutAgent.undo())).ok);await panel.getByText('最重要',{exact:true}).waitFor();
 await panel.screenshot({path:root+'/inspector.png'});
 assert.equal(await fs.readFile(originalPath,'utf8'),original);assert.deepEqual(errors,[]);
 await fs.writeFile(root+'/verification.json',JSON.stringify({passed:true,projectId,directory,checks:['inspect native metadata','remove','undo','clear','select and add','autosave/reload','changed text invalidation','unchanged timing and animations','source unchanged','keyboard-only phrase selection','forward/backward family emoji selection in both panels']},null,2));console.log(JSON.stringify({passed:true,projectId,root}));
}catch(error){console.error('Inspector verification failed:',error);throw error;}finally{await browser.close();}
