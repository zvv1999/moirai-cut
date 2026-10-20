import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000',root='/Users/zhengwei/Downloads/trial-step-navigation-20260929';await fs.mkdir(root,{recursive:true});
const api=async path=>{const r=await fetch(base+'/api/footage/templates'+path);assert.ok(r.ok);return r.json();};
const before=await api('/dynamic-assets'),style=before.assets.find(a=>a.id==='style-caption-compact-candidate-20260929');assert.ok(style);
const detail=await api('/inputs/input-99fa58d72fd4c9ad5cc2eed30b95b6a1');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/templates/effects/${style.id}/try?revision=${style.revision}`);
 const nav=page.getByRole('navigation',{name:'试映操作导航'});
 async function jump(button,selector){await nav.getByRole('button',{name:button,exact:true}).click();assert.equal(await page.locator(selector).evaluate(el=>el===document.activeElement),true);const box=await page.locator(selector).boundingBox(),bar=await nav.boundingBox();assert.ok(box.y>=bar.y+bar.height-1,'target not covered by navigation');assert.ok(box.y<await page.evaluate(()=>innerHeight),'target visible');}
 await jump('1 选素材与内容','[aria-label="试映素材与内容"]');
 const choice=page.locator('label.tp-choice').filter({hasText:detail.input.name}).getByRole('checkbox');await choice.click();
 await page.getByRole('button',{name:'预览 '+detail.input.name,exact:true}).waitFor();
 await jump('2 看效果与布局','[aria-label="效果与布局"]');await page.getByLabel('效果实时画面',{exact:true}).waitFor({state:'visible',timeout:60000});
 await page.getByRole('combobox',{name:'试映效果区域',exact:true}).selectOption('upper');
 await jump('3 叠加与复用','fieldset[aria-label="叠加样式"]');await page.getByRole('searchbox',{name:'搜索叠加样式'}).fill('青');
 await jump('1 选素材与内容','[aria-label="试映素材与内容"]');assert.equal(await choice.isChecked(),true);
 await jump('2 看效果与布局','[aria-label="效果与布局"]');assert.equal(await page.getByRole('combobox',{name:'试映效果区域',exact:true}).inputValue(),'upper');
 await page.setViewportSize({width:390,height:844});await jump('3 叠加与复用','fieldset[aria-label="叠加样式"]');assert.equal(await page.getByRole('searchbox',{name:'搜索叠加样式'}).inputValue(),'青');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:root+'/mobile-composition.png'});
 await jump('1 选素材与内容','[aria-label="试映素材与内容"]');assert.equal(await choice.isChecked(),true);await page.screenshot({path:root+'/mobile-content.png'});
 await jump('2 看效果与布局','[aria-label="效果与布局"]');await page.getByLabel('效果实时画面',{exact:true}).waitFor({state:'visible',timeout:60000});await page.screenshot({path:root+'/mobile-preview.png'});
 assert.deepEqual(errors,[]);assert.deepEqual(await api('/dynamic-assets'),before);
 await fs.writeFile(root+'/verification.json',JSON.stringify({passed:true,realInputSelected:detail.input.id,focusAndScroll:true,targetsNotObscured:true,contentPlacementAndSearchPreserved:true,mobileNoOverflow:true,libraryUnchanged:true,pageErrors:errors},null,2));console.log('PASS three-step navigation, real input, preserved placement/content, focus, mobile and unchanged library');
}finally{await browser.close();}
