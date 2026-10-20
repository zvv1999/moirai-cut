import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base='http://127.0.0.1:3000',inputId='input-80f248b968faad87d3460b76ec8badd1';
 const names=['样式试映闭环验证','NASA Alex · 深色服装与太阳背景'];
 const choice=name=>page.locator('label.tp-choice').filter({hasText:name}).getByRole('checkbox');
 const content=name=>page.getByRole('group',{name:name+' · 内容',exact:true});
 await page.goto(base+'/templates/effects/style-study-20260928-cyan-impact/try?revision=1');
 for(const name of names){
  await choice(name).click();
  await content(name).locator('summary').filter({hasText:'内容重点'}).click();
  const words=content(name).getByRole('group',{name:'第1段文字选重点',exact:true}).getByRole('button');
  await words.nth(1).click();await words.nth(2).click();
 }
 await page.getByRole('button',{name:'预览 '+names[1],exact:true}).click();
 await page.getByRole('button',{name:'保存试映内容',exact:true}).click();
 await page.getByText('已保存试映内容；本标签页刷新后可恢复。样式和位置仍由当前页面配置决定。',{exact:true}).waitFor();
 const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem(`moirai.style.trial-content.v1:${location.pathname}`)));
 assert.equal(saved.entries.length,2);assert.equal(saved.liveInputId,inputId);
 await page.reload();await choice(names[0]).waitFor();
 const rendered=page.waitForResponse(r=>r.url().endsWith('/sample-preview')&&r.ok()&&r.request().postDataJSON()?.sample.inputId===inputId);
 await page.getByRole('button',{name:'恢复试映内容',exact:true}).click();
 await page.getByText('已恢复素材、内容标注和素材绑定，并核对当前转写版本。',{exact:true}).waitFor();
 const preview=await(await rendered).json();
 for(const name of names)assert.equal(await choice(name).isChecked(),true);
 assert.equal(await page.getByRole('button',{name:'预览 '+names[1],exact:true}).getAttribute('aria-pressed'),'true');
 const detail=await(await fetch(base+'/api/footage/templates/inputs/'+inputId)).json();
 const keyword=preview.tracks.overlay.flatMap(t=>t.elements).find(e=>e.params?.['template.elementId']==='headline');
 assert.ok(Math.abs(keyword.startTime/120000-detail.transcript.words[1].start)<1/120000);
 // Change current first input after saving; failing the second must not apply the first saved value.
 await content(names[0]).locator('summary').filter({hasText:'内容重点'}).click();
 await content(names[0]).getByRole('group',{name:'第1段文字选重点',exact:true}).getByRole('button').nth(5).click();
 await page.route(`**/api/footage/templates/inputs/${inputId}`,async route=>{const response=await route.fetch(),data=await response.json();data.transcript.revision+=1;await route.fulfill({response,json:data});});
 await page.getByRole('button',{name:'恢复试映内容',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'转写已变化'}).waitFor();
 assert.equal(await content(names[0]).getByLabel('第1段重点起词',{exact:true}).inputValue(),'5');
 assert.equal(await page.getByRole('button',{name:'预览 '+names[1],exact:true}).getAttribute('aria-pressed'),'true');
 assert.deepEqual(errors,[]);
 await fs.writeFile('/tmp/trial-multi-restore-verification.json',JSON.stringify({passed:true,savedInputs:saved.entries.map(e=>e.inputId),liveInputId:inputId,keyword,secondInputStalePreservesAll:true},null,2));
 console.log('PASS multi-input restore, active preview and native word timing; second-input stale revision leaves all current state intact');
}finally{await browser.close();}
