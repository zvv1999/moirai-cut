import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const inputId='input-2a7dc38df99bce8407996f888c2d4932';
 const detail=await(await fetch(base+'/api/footage/templates/inputs/'+inputId)).json();
 await page.goto(base+'/templates/effects/style-study-20260928-cyan-impact/try?revision=1');
 await page.locator('label.tp-choice').filter({hasText:'样式试映闭环验证'}).getByRole('checkbox').click();
 await page.getByText('内容重点 · 1 段',{exact:true}).click();
 const group=page.getByRole('group',{name:'第1段文字选重点',exact:true});
 const tokens=group.getByRole('button');assert.equal(await tokens.count(),detail.transcript.words.length);
 await tokens.nth(1).click();assert.equal(await page.getByLabel('第1段重点起词',{exact:true}).inputValue(),'1');
 assert.equal(await page.getByLabel('第1段重点止词',{exact:true}).inputValue(),'2');
 const rendered=page.waitForResponse(r=>r.url().endsWith('/sample-preview')&&r.ok()&&r.request().postDataJSON()?.sample.semanticUnits[0].keyword?.endWord===3);
 await tokens.nth(2).click();
 const preview=await(await rendered).json();const text=preview.tracks.overlay.flatMap(t=>t.elements).find(e=>e.params?.['template.elementId']==='headline');
 assert.equal(text.params.content,'重點');assert.equal(text.startTime,16800);assert.equal(text.duration,52800);
 assert.equal(await group.locator('button[aria-pressed="true"]').count(),2);
 await tokens.nth(13).click();await tokens.nth(12).click();
 assert.equal(await page.getByLabel('第1段重点起词',{exact:true}).inputValue(),'12');
 assert.equal(await page.getByLabel('第1段重点止词',{exact:true}).inputValue(),'14');
 // Keyboard activation and Escape finish range extension without clearing selection.
 await tokens.nth(1).focus();await page.keyboard.press('Enter');await page.keyboard.press('Escape');
 assert.equal(await page.getByRole('button',{name:'完成选择',exact:true}).count(),0);
 await tokens.nth(5).click();
 assert.equal(await page.getByLabel('第1段重点起词',{exact:true}).inputValue(),'5');
 await page.getByRole('button',{name:'完成选择',exact:true}).click();
 await page.getByRole('button',{name:'清除第1段重点',exact:true}).click();
 assert.equal(await group.locator('button[aria-pressed="true"]').count(),0);
 assert.equal(await page.getByLabel('第1段重点起词',{exact:true}).inputValue(),'');
 // Switching to the precision controls must discard the prior click anchor.
 await page.getByText('精确范围与段落调整',{exact:true}).click();
 await tokens.nth(1).click();await page.getByLabel('第1段重点起词',{exact:true}).selectOption('8');
 await tokens.nth(12).click();assert.equal(await page.getByLabel('第1段重点起词',{exact:true}).inputValue(),'12');
 // Split uses Rust; a stale anchor must not leak into the new unit indices.
 await page.getByLabel('第1段拆分位置',{exact:true}).selectOption('7');
 await page.getByRole('button',{name:'拆分第1段',exact:true}).click();
 await page.getByText('内容重点 · 2 段',{exact:true}).waitFor();
 const next=page.getByRole('group',{name:'第2段文字选重点',exact:true});
 await next.getByRole('button').nth(1).click();await next.getByRole('button').nth(2).click();
 assert.equal(await page.getByLabel('第2段重点起词',{exact:true}).inputValue(),'8');
 assert.equal(await page.getByLabel('第2段重点止词',{exact:true}).inputValue(),'10');
 await next.scrollIntoViewIfNeeded();
 const geometry=await next.evaluate(el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth,buttons:[...el.querySelectorAll('button')].map(b=>({h:b.getBoundingClientRect().height,x:b.getBoundingClientRect().right}))}));
 assert.ok(geometry.scroll<=geometry.width+1,'No overflow');assert.ok(geometry.buttons.every(b=>b.h>=44&&b.x<=390),'Touch targets fit mobile viewport');
 await page.screenshot({path:'/tmp/keyword-word-picker-mobile.png'});
 assert.deepEqual(errors,[]);
 await fs.writeFile('/tmp/keyword-word-picker-verification.json',JSON.stringify({passed:true,inputId,previewKeyword:text,geometry},null,2));
 console.log('PASS mobile word selection, reverse range, keyboard/Escape, clear, dropdown consistency, native split, actual preview timing');
}finally{await browser.close();}
