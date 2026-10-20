import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {archiveTestStyle} from './archive-test-style.mjs';
const base='http://127.0.0.1:3000',root='/Users/zhengwei/Downloads/icon-group-fade-20260929';
async function api(path,body){const r=await fetch(base+'/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const raw=await r.text();assert.ok(r.ok,raw);return JSON.parse(raw);}
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const results=[];
try{
 const p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 async function open(id){const pending=p.waitForResponse(r=>r.ok()&&r.url().endsWith('/dynamic-assets/preview')&&r.request().postDataJSON()?.definition?.id===id);await p.goto(base+'/templates?effect='+id);await pending;await p.getByLabel('当前样式图层',{exact:true}).selectOption('root');await p.getByRole('button',{name:'外观',exact:true}).click();}
 async function frame(name,time){const slider=p.getByRole('slider',{name:'效果预览进度',exact:true});await slider.fill((time+.01).toFixed(2));await slider.fill(String(time));await p.waitForFunction(t=>{const s=document.querySelector('.tw-effect-stage'),c=s?.querySelector('canvas');return c&&c.dataset.renderGeneration===s.dataset.previewGeneration&&Math.abs(Number(c.dataset.renderTime)-t)<.001},time);const data=await p.locator('.tw-effect-stage canvas').evaluate(c=>c.toDataURL());await fs.writeFile(root+'/'+name+'.png',Buffer.from(data.split(',')[1],'base64'));}
 for(const name of ['clock','completion']){
  const original=(await api('/dynamic-assets/style-study-20260929-'+name)).definition;
  const before=JSON.parse(await fs.readFile(root+'/'+name+'-before.json','utf8'));
  const id='style-qa-fixed-fade-'+name+'-'+Date.now();before.id=id;before.revision=0;
  await api('/dynamic-assets',{definition:before,baseRevision:0,idempotencyKey:id+'-before'});
  await open(id);for(const t of [.46,.6,.76,.78,.8])await frame(name+'-before-'+t,t);
  await open(original.id);for(const t of [.46,.6,.76,.78,.8])await frame(name+'-after-'+t,t);
  assert.equal(await p.getByLabel('整组合成',{exact:true}).isChecked(),true);
  assert.equal(Number(await p.getByLabel('整组淡出时长（秒）',{exact:true}).inputValue()),.06);
  const draft=structuredClone(original);draft.id=id;draft.revision=1;
  const initial=(await api('/dynamic-assets',{definition:draft,baseRevision:1,idempotencyKey:id+'-composite'})).definition;
  await open(id);
  await p.getByLabel('整组淡出时长（秒）',{exact:true}).fill('0.12');
  const pending=p.waitForResponse(r=>r.ok()&&r.url().endsWith('/dynamic-assets/layers'));
  await p.getByRole('button',{name:'应用整组淡出',exact:true}).click();
  const edited=(await(await pending).json()).definition;
  const expected=structuredClone(initial);expected.treatments.find(t=>t.id==='group-fade-root').operation.motionTiming.exitSeconds=.12;
  assert.deepEqual(edited,expected);
  const save=p.waitForResponse(r=>r.ok()&&r.request().method()==='POST'&&r.url().endsWith('/dynamic-assets'));
  await p.getByRole('button',{name:'保存修改',exact:true}).click();
  const saved=(await(await save).json()).definition;expected.revision=3;assert.deepEqual(saved,expected);
  await open(id);assert.equal(Number(await p.getByLabel('整组淡出时长（秒）',{exact:true}).inputValue()),.12);
  assert.equal(Number(await p.getByLabel('整组入场预留（秒）',{exact:true}).inputValue()),name==='clock'?.16:.18);
  await p.setViewportSize({width:390,height:844});await p.getByLabel('整组淡出时长（秒）',{exact:true}).scrollIntoViewIfNeeded();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:root+'/'+name+'-mobile.png'});await p.setViewportSize({width:1440,height:1000});
  assert.deepEqual((await api('/dynamic-assets/'+original.id)).definition,original);
  await archiveTestStyle(base,id);
  results.push({id:original.id,revision:original.revision,exactSecondsEdit:true,saveReload:true,mobileNoOverflow:true,productionStyleUnchanged:true});
 }
 assert.deepEqual(errors,[]);await fs.writeFile(root+'/ui-verification.json',JSON.stringify({passed:true,results,errors},null,2));console.log('PASS fixed group fade UI');
}finally{await browser.close();}
