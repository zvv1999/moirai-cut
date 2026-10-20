import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {archiveTestStyle} from './archive-test-style.mjs';
const base='http://127.0.0.1:3000',root='/Users/zhengwei/Downloads/style-save-and-trial-20260929';await fs.mkdir(root,{recursive:true});
async function api(path,body){const r=await fetch(base+'/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const before=await api('/dynamic-assets');
const definition=process.env.TEST_EFFECT_ID?(await api('/dynamic-assets/'+process.env.TEST_EFFECT_ID)).definition:(await api('/dynamic-assets/create',{name:'验收 · 保存后试映 '+Date.now(),canvas:{width:1280,height:720,fps:30},purpose:'keyword'})).definition;
if(!process.env.TEST_EFFECT_ID)await api('/dynamic-assets',{definition,baseRevision:0,idempotencyKey:'save-trial-'+definition.id});
assert.match(definition.name,/^验收 · /);const originalRevision=definition.revision,nextRevision=originalRevision+1,editedName='验收 · 一步保存并试映 v'+nextRevision;await fs.writeFile(root+'/fixture.json',JSON.stringify({id:definition.id},null,2));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/templates?effect='+definition.id);
 const input=page.getByRole('textbox',{name:'效果名称',exact:true});await input.fill(editedName);
 await page.getByRole('navigation',{name:'属性快捷定位'}).getByRole('button',{name:'应用规则',exact:true}).click();await page.getByRole('combobox',{name:'结束时机',exact:true}).selectOption('semantic_end');
 const action=page.getByRole('button',{name:'保存并用声音试效果',exact:true});await action.waitFor();
 let saveCalls=0,fail=true;
 await page.route('**/api/footage/templates/dynamic-assets',async route=>{
  if(route.request().method()!=='POST')return route.continue();saveCalls++;
  if(fail)return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'验收模拟：保存版本冲突'})});
  await route.continue();
 });
 await action.click();await page.getByRole('alert').filter({hasText:'验收模拟：保存版本冲突'}).waitFor();
 assert.ok(page.url().includes('/templates?effect='));assert.equal(await input.inputValue(),editedName);assert.equal(await page.getByRole('combobox',{name:'结束时机',exact:true}).inputValue(),'semantic_end');assert.equal((await api('/dynamic-assets/'+definition.id)).definition.revision,originalRevision);assert.equal(saveCalls,1);
 await page.setViewportSize({width:390,height:844});await action.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:root+'/mobile.png'});
 fail=false;await action.click();await page.waitForURL('**/templates/effects/'+definition.id+'/try?revision='+nextRevision);assert.equal(saveCalls,2);
 const saved=(await api('/dynamic-assets/'+definition.id)).definition;assert.equal(saved.revision,nextRevision);assert.equal(saved.name,editedName);assert.equal(saved.layers.find(l=>l.content.element?.id==='headline').content.element.timing.endAnchor,'semantic_end');await page.getByRole('heading',{name:'效果试映',exact:true}).waitFor();await page.locator('.tw-header').getByText(editedName+' · v'+nextRevision,{exact:true}).waitFor();await page.getByLabel('效果实时画面',{exact:true}).waitFor({state:'visible',timeout:60000});await page.screenshot({path:root+'/trial.png'});
 await page.goto(base+'/templates?effect='+definition.id);await page.getByRole('link',{name:'用声音试效果',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'用声音试效果',exact:true}).getAttribute('href'),`/templates/effects/${definition.id}/try?revision=${nextRevision}`);assert.equal(await page.getByRole('button',{name:'保存并用声音试效果',exact:true}).count(),0);
 assert.deepEqual(errors,[]);await archiveTestStyle(base,definition.id);const after=await api('/dynamic-assets');for(const old of before.assets.filter(a=>a.id!==definition.id))assert.deepEqual(after.assets.find(a=>a.id===old.id),old);
 await fs.writeFile(root+'/verification.json',JSON.stringify({passed:true,fixtureId:definition.id,failurePreservesDraft:true,failureDoesNotNavigate:true,successOpensSavedRevision:nextRevision,endAnchorPreserved:true,cleanStyleUsesLink:true,mobileNoOverflow:true,fixtureArchived:true,existingAssetsUnchanged:true,pageErrors:errors},null,2));console.log('PASS save failure protection, one-action save/trial, exact revision, mobile and archive');
} finally {await browser.close();}
