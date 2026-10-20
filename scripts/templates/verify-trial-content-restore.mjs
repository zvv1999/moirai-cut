import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const url='http://127.0.0.1:3000/templates/effects/style-study-20260928-cyan-impact/try?revision=1';
 const inputId='input-2a7dc38df99bce8407996f888c2d4932';
 const choice=()=>page.locator('label.tp-choice').filter({hasText:'样式试映闭环验证'}).getByRole('checkbox');
 await page.goto(url);
 await choice().click();
 await page.getByText('内容重点 · 1 段',{exact:true}).click();
 const tokens=page.getByRole('group',{name:'第1段文字选重点',exact:true}).getByRole('button');
 await tokens.nth(1).click();await tokens.nth(2).click();
 await page.getByRole('button',{name:'保存试映内容',exact:true}).click();
 await page.getByText('已保存试映内容；本标签页刷新后可恢复。样式和位置仍由当前页面配置决定。',{exact:true}).waitFor();
 const stored=await page.evaluate(()=>sessionStorage.getItem(`moirai.style.trial-content.v1:${location.pathname}`));
 assert.equal(JSON.parse(stored).entries[0].inputId,inputId);
 assert.equal(JSON.parse(stored).entries[0].detail,undefined,'Do not cache authoritative transcript');
 await page.reload();await choice().waitFor();assert.equal(await choice().isChecked(),false);
 const previewResponse=page.waitForResponse(r=>r.url().endsWith('/sample-preview')&&r.ok()&&r.request().postDataJSON()?.sample.semanticUnits[0].keyword?.endWord===3);
 await page.getByRole('button',{name:'恢复试映内容',exact:true}).click();
 await page.getByText('已恢复素材、内容标注和素材绑定，并核对当前转写版本。',{exact:true}).waitFor();
 const preview=await(await previewResponse).json();
 const word=preview.tracks.overlay.flatMap(t=>t.elements).find(e=>e.params?.['template.elementId']==='headline');
 assert.equal(word.params.content,'重點');assert.equal(word.startTime,16800);assert.equal(word.duration,52800);
 assert.equal(await choice().isChecked(),true);
 await page.getByText('内容重点 · 1 段',{exact:true}).click();
 assert.equal(await page.getByLabel('第1段重点起词',{exact:true}).inputValue(),'1');
 assert.equal(await page.getByLabel('第1段重点止词',{exact:true}).inputValue(),'3');
 // Simulate a changed authoritative transcript; fail atomically and preserve current annotations.
 await page.route(`**/api/footage/templates/inputs/${inputId}`,async route=>{
  const response=await route.fetch(),data=await response.json();data.transcript.revision+=1;
  await route.fulfill({response,json:data});
 });
 await page.getByRole('button',{name:'恢复试映内容',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'转写已变化'}).waitFor();
 assert.equal(await page.getByLabel('第1段重点止词',{exact:true}).inputValue(),'3');
 await page.unroute(`**/api/footage/templates/inputs/${inputId}`);
 await page.evaluate(()=>sessionStorage.setItem(`moirai.style.trial-content.v1:${location.pathname}`,'invalid-json'));
 await page.getByRole('button',{name:'恢复试映内容',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'无法读取保存的试映内容'}).waitFor();
 assert.equal(await choice().isChecked(),true);
 await page.screenshot({path:'/tmp/trial-content-restore.png'});
 assert.deepEqual(errors,[]);
 await fs.writeFile('/tmp/trial-content-restore-verification.json',JSON.stringify({passed:true,inputId,keyword:word,staleRevisionRejected:true,malformedStoragePreservedCurrent:true},null,2));
 console.log('PASS explicit save, refresh, native restore/preview timing, stale revision rejection and preserved current annotations');
}finally{await browser.close();}
