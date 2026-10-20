import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root='/Users/zhengwei/Downloads/study-guidance-workbench-2026-09-29',base='http://127.0.0.1:3000';
const saved=JSON.parse(await fs.readFile(root+'/saved.json','utf8'));
const read=async()=>{const r=await fetch(base+'/api/footage/templates');assert.ok(r.ok);return r.json();};
const before=await read(),browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url=base+'/templates/compositions?template='+saved.id;
 await page.goto(url);const name=page.getByRole('textbox',{name:'模板名称',exact:true});await name.waitFor();assert.equal(await name.inputValue(),saved.name);
 await page.getByRole('navigation',{name:'工作视图'}).getByRole('button',{name:'编辑模板',exact:true}).click();
 const buttons=page.locator('.tw-elements > button');assert.equal(await buttons.count(),saved.elements.length);
 for(const [i,e] of saved.elements.entries()){
  await buttons.nth(i).click();assert.equal(await page.getByRole('textbox',{name:'元素名称',exact:true}).inputValue(),e.description);
  assert.equal(await page.getByLabel('内容绑定',{exact:true}).inputValue(),e.binding);assert.equal(await page.getByLabel('语义角色',{exact:true}).inputValue(),e.features.role);
  const timing=page.locator('.tw-inspector details').filter({has:page.locator('summary').getByText('出现时机',{exact:true})});
  if(await timing.getAttribute('open')===null)await timing.locator('summary').click();
  assert.ok(await timing.locator('select').isVisible());assert.equal(await timing.locator('select').inputValue(),e.timing.anchor);
 }
 const titleIndex=saved.elements.findIndex(e=>e.id==='page-heading');await buttons.nth(titleIndex).click();await page.screenshot({path:root+'/desktop.png'});
 await page.reload();await name.waitFor();assert.equal(await name.inputValue(),saved.name);
 await page.setViewportSize({width:390,height:844});await page.getByRole('navigation',{name:'工作视图'}).getByRole('button',{name:'编辑模板',exact:true}).click();await buttons.nth(titleIndex).click();await page.getByRole('textbox',{name:'元素名称',exact:true}).scrollIntoViewIfNeeded();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:root+'/mobile.png'});
 assert.deepEqual(await read(),before);assert.deepEqual(errors,[]);
 await fs.writeFile(root+'/ui-verification.json',JSON.stringify({templateId:saved.id,revision:saved.revision,selectableElements:saved.elements.length,bindingAndTimingControlsMatch:true,reload:true,mobileNoOverflow:true,libraryUnchanged:true,pageErrors:errors},null,2));console.log('PASS saved composition: all layers selectable, bindings/timing match, reload and mobile');
}finally{await browser.close();}
