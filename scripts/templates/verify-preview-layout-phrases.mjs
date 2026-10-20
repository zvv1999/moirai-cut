import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000',root='/Users/zhengwei/Downloads/preview-layout-phrases-2026-09-29';await fs.mkdir(root,{recursive:true});
const read=async()=>{const r=await fetch(base+'/api/footage/templates/dynamic-assets');assert.ok(r.ok);return r.json();};const before=await read();
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const response=(count)=>page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/preview')&&r.request().postDataJSON()?.example?.text==='先完成最重要的一件事'&&r.request().postDataJSON()?.example?.keyword==='先完成最重要的一件事'&&(count===undefined||r.request().postDataJSON()?.example?.layoutPhrases?.length===count));
 await page.goto(base+'/templates?effect=style-pilot-20260923-adaptive');await page.waitForFunction(()=>document.querySelector('.tw-effect-preview')?.getAttribute('aria-busy')==='false');
 await page.locator('.tw-preview-example summary').click();
 await page.getByLabel('预览示例句子',{exact:true}).fill('先完成最重要的一件事');
 const initial=response();await page.getByLabel('预览示例重点词',{exact:true}).fill('先完成最重要的一件事');let r=await initial;if(!r.ok()){r=await response();}assert.ok(r.ok());const plain=await r.json();
 const capture=async(name)=>{await page.waitForFunction(()=>document.querySelector('.tw-effect-preview')?.getAttribute('aria-busy')==='false');const slider=page.getByRole('slider',{name:'效果预览进度'});await slider.fill('1.01');await slider.fill('1');await page.waitForFunction(()=>{const s=document.querySelector('.tw-effect-stage'),c=s?.querySelector('canvas');return c&&c.dataset.renderGeneration===s.dataset.previewGeneration&&Math.abs(Number(c.dataset.renderTime)-1)<.001;});const data=await page.locator('.tw-effect-stage canvas').evaluate(c=>c.toDataURL());await fs.writeFile(root+'/'+name+'.png',Buffer.from(data.split(',')[1],'base64'));};
 await capture('before');
 await page.getByLabel('预览同排起始词').selectOption('3');await page.getByLabel('预览同排结束词').selectOption('6');
 const next=response(1);await page.getByRole('button',{name:'预览同排',exact:true}).click();r=await next;assert.ok(r.ok(),await r.text());const grouped=await r.json();assert.deepEqual(grouped.example,plain.example);
 const elements=p=>p.tracks.overlay.flatMap(t=>t.elements);assert.deepEqual(elements(plain).map(e=>[e.startTime,e.duration,e.params.content]),elements(grouped).map(e=>[e.startTime,e.duration,e.params.content]));
 assert.ok(elements(grouped).some(e=>e.params['text.layoutPhrases']));await capture('after');
 const invalid=response(2);await page.getByRole('button',{name:'预览同排',exact:true}).click();assert.equal((await invalid).ok(),false);await page.getByRole('alert').filter({hasText:'同排范围无效'}).waitFor();
 const recover=response(1);await page.getByRole('button',{name:'移除第2组预览同排',exact:true}).click();assert.ok((await recover).ok());await capture('recovered');
 assert.equal(await page.getByRole('button',{name:'移除第1组预览同排',exact:true}).count(),1);
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'移除第1组预览同排',exact:true}).scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.screenshot({path:root+'/mobile.png'});
 const reset=response(0);await page.getByRole('button',{name:'清除预览同排',exact:true}).click();assert.ok((await reset).ok());await capture('reset');
 const readd=response(1);await page.getByRole('button',{name:'预览同排',exact:true}).click();assert.ok((await readd).ok());await capture('before-text-change');
 const newText=page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/preview')&&r.request().postDataJSON()?.example?.text==='重点'&&r.request().postDataJSON()?.example?.keyword==='重点');await page.getByLabel('预览示例句子',{exact:true}).fill('重点');await page.getByLabel('预览示例重点词',{exact:true}).fill('重点');const changed=await newText;assert.ok(changed.ok());assert.deepEqual(changed.request().postDataJSON().example.layoutPhrases,[]);
 assert.deepEqual(await read(),before);assert.deepEqual(errors,[]);await fs.writeFile(root+'/verification.json',JSON.stringify({syntheticTimingUnchanged:true,invalidOverlapRejected:true,resetRecovered:true,individualRecovery:true,mobileNoOverflow:true,textChangeResetsPhrases:true,libraryUnchanged:true},null,2));console.log('PASS phrase preview, unchanged timing, overlap rejection, reset recovery and unchanged library');
}finally{await browser.close();}
