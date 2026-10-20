import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {archiveTestStyle} from './archive-test-style.mjs';
const base='http://127.0.0.1:3000',root='/Users/zhengwei/Downloads/style-role-editor-20260929';await fs.mkdir(root,{recursive:true});
async function api(path,body){const r=await fetch(base+'/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const before=await api('/dynamic-assets');let {definition}=await api('/dynamic-assets/create',{name:'验收 · 语义角色 '+Date.now(),canvas:{width:720,height:720,fps:30},purpose:'keyword'});
({definition}=await api('/dynamic-assets',{definition,baseRevision:0,idempotencyKey:'role-editor-'+definition.id}));await fs.writeFile(root+'/fixture.json',JSON.stringify(definition,null,2));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(base+'/templates?effect='+definition.id);const rules=()=>page.getByRole('navigation',{name:'属性快捷定位'}).getByRole('button',{name:'应用规则',exact:true}).click();await rules();
const role=page.getByRole('combobox',{name:'图层语义角色',exact:true});assert.equal(await role.inputValue(),'emphasis');
async function change(value){const pending=page.waitForResponse(r=>r.ok()&&r.url().endsWith('/dynamic-assets/layers'));await role.selectOption(value);const data=await(await pending).json();await page.waitForFunction(v=>document.querySelector('select[aria-label="图层语义角色"]')?.value===v,value);return data.definition;}
let edited=await change('callout');const expected=structuredClone(definition);expected.layers.find(l=>l.content.kind==='element').content.element.features.role='callout';assert.deepEqual(edited,expected);
const saved=page.waitForResponse(r=>r.ok()&&r.url().endsWith('/dynamic-assets')&&r.request().method()==='POST');await page.getByRole('button',{name:'保存修改',exact:true}).click();let savedDefinition=(await(await saved).json()).definition;expected.revision++;assert.deepEqual(savedDefinition,expected);
await page.reload();await rules();assert.equal(await role.inputValue(),'callout');await change('');assert.equal(await role.inputValue(),'');await page.getByRole('button',{name:'撤销未保存修改',exact:true}).click();assert.equal(await role.inputValue(),'callout');
await change('');const clearSave=page.waitForResponse(r=>r.ok()&&r.url().endsWith('/dynamic-assets')&&r.request().method()==='POST');await page.getByRole('button',{name:'保存修改',exact:true}).click();savedDefinition=(await(await clearSave).json()).definition;expected.revision++;expected.layers.find(l=>l.content.kind==='element').content.element.features.role=null;assert.deepEqual(savedDefinition,expected);
await page.reload();await rules();assert.equal(await role.inputValue(),'');await role.scrollIntoViewIfNeeded();await page.screenshot({path:root+'/desktop.png'});
await page.setViewportSize({width:390,height:844});await role.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:root+'/mobile.png'});
assert.deepEqual(errors,[]);await archiveTestStyle(base,definition.id);const after=await api('/dynamic-assets');for(const old of before.assets)assert.deepEqual(after.assets.find(a=>a.id===old.id),old);
await fs.writeFile(root+'/verification.json',JSON.stringify({passed:true,fixtureId:definition.id,roleOnlyMutation:true,saveReload:true,clearAndUndo:true,clearSaveReload:true,mobileNoOverflow:true,existingAssetsUnchanged:true,fixtureArchived:true,pageErrors:errors},null,2));console.log('PASS semantic role editing, save/reload, clear/undo, mobile and unchanged independent channels');
}finally{await browser.close()}
