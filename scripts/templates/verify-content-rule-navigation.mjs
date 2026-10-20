import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000',read=async()=>await(await fetch(base+'/api/footage/templates/dynamic-assets')).json(),before=await read();
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/templates?effect=style-caption-compact-candidate-20260929');
 const nav=page.getByRole('navigation',{name:'属性快捷定位'}),source=page.getByRole('combobox',{name:'文字内容来源',exact:true});
 await nav.getByRole('button',{name:'外观',exact:true}).click();assert.equal(await source.isVisible(),false);
 const highlight=page.getByRole('combobox',{name:'文字高亮方式',exact:true});assert.equal(await highlight.inputValue(),'active_word');
 await page.getByRole('button',{name:'更改内容与出现规则',exact:true}).click();assert.equal(await source.inputValue(),'sentence');assert.equal(await source.isVisible(),true);assert.equal(await highlight.isVisible(),false);
 assert.equal(await source.locator('option[value="keyword"]').evaluate(option=>option.disabled),true,'active word requires sentence content');
 const anchor=page.getByRole('combobox',{name:'出现时机',exact:true}),originalAnchor=await anchor.inputValue();
 await page.getByText('逐字高亮仅支持字幕句子。',{exact:false}).waitFor();await page.getByRole('button',{name:'调整高亮方式',exact:true}).click();assert.equal(await highlight.isVisible(),true);let response=page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/layers'));await highlight.selectOption('none');assert.ok((await response).ok());
 await page.getByRole('button',{name:'更改内容与出现规则',exact:true}).click();response=page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/layers'));await source.selectOption('keyword');const result=await response;assert.ok(result.ok());const draft=(await result.json()).definition;assert.ok(draft.layers.some(l=>l.content.element?.binding==='keyword'));assert.equal(await page.getByRole('button',{name:'调整高亮方式',exact:true}).count(),0,'no restriction guidance after clearing highlight');assert.equal(originalAnchor,'cue_start');assert.equal(await anchor.inputValue(),originalAnchor,'content edits preserve timing');await anchor.selectOption('semantic_start');
 await nav.getByRole('button',{name:'外观',exact:true}).click();await page.getByText('内容来源：重点词。',{exact:false}).waitFor();assert.equal(await highlight.inputValue(),'none');await page.getByText('逐字高亮需要整句内容及每个词的声音时间',{exact:false}).waitFor();await page.getByRole('button',{name:'更改内容与出现规则',exact:true}).click();assert.equal(await anchor.inputValue(),'semantic_start','custom timing survives section switch');await nav.getByRole('button',{name:'外观',exact:true}).click();
 await page.getByRole('button',{name:'撤销未保存修改',exact:true}).click();await page.waitForFunction(()=>document.querySelector('select[aria-label="文字内容来源"]')?.value==='sentence');assert.equal(await highlight.inputValue(),'active_word');
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'更改内容与出现规则',exact:true}).click();await source.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/content-rule-navigation-mobile.png'});
 assert.deepEqual(errors,[]);assert.deepEqual(await read(),before);await fs.writeFile('/tmp/content-rule-navigation-verification.json',JSON.stringify({passed:true,contentSeparateFromAppearance:true,highlightConstraintGuidance:true,nativeDraftEdit:true,timingPreserved:true,customTimingPreserved:true,undo:true,mobileNoOverflow:true,libraryUnchanged:true},null,2));console.log('PASS rules navigation, native content edit, timing independence, undo and mobile; saved library unchanged');
}finally{await browser.close();}
