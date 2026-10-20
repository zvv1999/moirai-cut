import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root='/Users/zhengwei/Downloads/cyan-accent-saved-20260929';
const receipt=JSON.parse(await fs.readFile(root+'/style-review-receipt.json','utf8'));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(let pass=0;pass<2;pass++){
  if(pass===0)await page.goto('http://127.0.0.1:3000/templates?effect=style-cyan-accent-candidate-20260929');else await page.reload();
  const summary=page.locator('.tw-style-reviews > summary');await summary.filter({hasText:'1 份当前版本记录'}).waitFor();await summary.click();
  const region=page.getByRole('region',{name:'v1 应用评审',exact:true});await region.waitFor();
  const text=await region.innerText();assert.match(text,/内部评分 86\/100 · 需完善/);assert.match(text,/未试听/);assert.match(text,/双笔触造型偏简单/);
  await region.getByText('分项依据',{exact:true}).click();assert.match(await region.innerText(),/构图 22\/25/);
  await region.getByText('查看评审成片 · 3 份',{exact:true}).click();
  await region.locator('video').first().waitFor();assert.equal(await region.locator('video').count(),3);
  const video=region.locator('video').first();await video.evaluate(v=>{v.preload='metadata';v.load();});
  await page.waitForFunction(()=>{const v=document.querySelector('.tw-style-reviews video');return v&&v.duration>0;});
  assert.ok(Math.abs(await video.evaluate(v=>v.duration)-10.475283)<.1);
  await region.getByText('查看评审成片 · 3 份',{exact:true}).click();await region.locator('video').first().waitFor({state:'detached'});
 }
 await page.getByRole('region',{name:'v1 应用评审',exact:true}).screenshot({path:root+'/style-review-ui.png'});
 const applicationResponse=page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/application')&&r.ok());
 await page.getByRole('link',{name:'用这个布局试自己的声音',exact:true}).click();
 const applied=await applicationResponse;
 assert.deepEqual({inputs:{},...applied.request().postDataJSON()},receipt.submission.application,'Trial must use the exact reviewed native application');
 await page.getByRole('button',{name:'恢复试映内容',exact:true}).waitFor();
 const restoredResponse=page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/application')&&r.ok());
 await page.reload();
 assert.deepEqual({inputs:{},...(await restoredResponse).request().postDataJSON()},receipt.submission.application);
 assert.equal(await page.locator('label.tp-choice input[type="checkbox"]:checked:not(:disabled)').count(),0,'Review link must not silently select source media');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({review:receipt.id,total:86,current:true,uiAfterReload:true,evidenceVideoLoads:true}));
}finally{await browser.close();}
