import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const base=process.env.OPENCUT_BASE_URL??'http://127.0.0.1:3000';
const response=await fetch(base+'/api/footage/templates/dynamic-assets');assert.ok(response.ok);
const before=await response.json();
const archived=before.assets.find(asset=>before.library.some(entry=>entry.assetId===asset.id&&entry.archived));
const active=before.assets.find(asset=>asset.id==='style-study-20260928-signal');
assert.ok(archived&&active,'Requires an existing archived fixture and active signal style; no library mutations are performed');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto(base+'/templates?effect='+active.id);
 const scope=page.getByRole('combobox',{name:'样式库范围'});
 const name=page.getByRole('textbox',{name:'效果名称'});
 await name.waitFor();assert.equal(await name.inputValue(),active.name);
 await scope.selectOption('archived');
 await page.waitForURL(url=>url.searchParams.get('styleLibrary')==='archived'&&!url.searchParams.has('effect'));
 await page.getByRole('button',{name:'刷新动态素材',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('input[aria-label="效果名称"]')?.value);
 assert.equal(await scope.inputValue(),'archived');
 const selectedId=new URL(page.url()).searchParams.get('effect');
 assert.ok(before.library.some(entry=>entry.assetId===selectedId&&entry.archived));
 await page.reload();await name.waitFor();assert.equal(await scope.inputValue(),'archived');
 await scope.selectOption('active');
 await page.waitForURL(url=>!url.searchParams.has('effect')&&!url.searchParams.has('styleLibrary'));
 await page.reload();await name.waitFor();assert.equal(await scope.inputValue(),'active');
 assert.ok(!before.library.some(entry=>entry.assetId===new URL(page.url()).searchParams.get('effect')&&entry.archived));
 // Explicit asset links determine their own scope, even if a stale scope is present.
 await page.goto(base+'/templates?effect='+active.id+'&styleLibrary=archived');
 await name.waitFor();assert.equal(await name.inputValue(),active.name);assert.equal(await scope.inputValue(),'active');
 await page.goto(base+'/templates?effect='+archived.id);await name.waitFor();
 assert.equal(await name.inputValue(),archived.name);assert.equal(await scope.inputValue(),'archived');
 const after=await(await fetch(base+'/api/footage/templates/dynamic-assets')).json();
 assert.deepEqual(after,before,'Navigation must not alter saved definitions or archive records');
 console.log('scope switch, refresh, reload, stale-scope deep links passed; library unchanged');
}finally{await browser.close();}
