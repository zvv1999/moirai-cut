import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000',root='/Users/zhengwei/Downloads/paper-note-refinement-2026-09-28';
const receipt=JSON.parse(await fs.readFile(root+'/style-review-receipt.json','utf8'));
const reviews=await(await fetch(base+'/api/footage/templates/dynamic-assets/reviews')).json();
const live=reviews.reviews.find(r=>r.id===receipt.id);assert.ok(live,'Historical review retained');
const current=reviews.reviews.filter(r=>r.current&&r.submission.application.assetId===receipt.submission.application.assetId);
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage({viewport:{width:1280,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(let pass=0;pass<2;pass++) {
  if(pass===0)await page.goto(base+'/templates?effect='+receipt.submission.application.assetId);else await page.reload();
  const summary=page.locator('.tw-style-reviews > summary');
  await summary.filter({hasText:current.length?`${current.length} 份当前版本记录`:'待评审'}).waitFor();await summary.click();
  const review=page.locator('.tw-style-reviews');
  if(live.current){
   assert.match(await review.innerText(),/内部评分 82\/100 · 需完善/);
   assert.match(await review.innerText(),/未试听/);
   await review.getByText('分项依据',{exact:true}).click();
   assert.match(await review.innerText(),/适配 14\/20/);
   assert.match(await review.innerText(),/最终适配验收未完成/);
  }else{
   if(current.length){
    for(const record of current){
     const section=review.getByRole('region',{name:`v${record.submission.application.assetRevision} 应用评审`,exact:true});
     assert.match(await section.innerText(),new RegExp(`内部评分 ${record.total}/100 · 需完善`));
     assert.match(await section.innerText(),/未试听/);
    }
   }else assert.match(await review.innerText(),/当前版本尚无有效评审/);
   assert.doesNotMatch(await review.innerText(),/82\/100/);
   await review.getByText('历史评审 · 1 份',{exact:true}).click();
   await review.getByRole('region',{name:'v2 应用评审',exact:true}).waitFor();
   assert.match(await review.innerText(),/v2 · 1280 × 720 · 历史内部评分 82\/100/);
   assert.match(await review.innerText(),/此记录不代表当前版本/);
   assert.equal(await review.locator('video').count(),0,'Evidence loads only on request');
   await review.locator('.tw-style-review-history').getByText('查看评审成片 · 3 份',{exact:true}).click();
   await review.locator('video').first().waitFor();assert.equal(await review.locator('video').count(),3);
   const video=review.locator('video').first();
   await video.evaluate(v=>{v.preload='metadata';v.load();});
   await page.waitForFunction(()=>{const v=document.querySelector('.tw-style-review-history video');return v&&Number.isFinite(v.duration)&&v.duration>0;});
   assert.ok(Math.abs(await video.evaluate(v=>v.duration)-7.04)<0.1);
   await review.locator('.tw-style-review-history').getByText('查看评审成片 · 3 份',{exact:true}).click();
   await review.locator('video').first().waitFor({state:'detached'});
  }
 }
 await page.waitForFunction(()=>document.querySelector('.tw-effect-preview')?.getAttribute('aria-busy')==='false');
 await page.screenshot({path:root+(live.current?'/style-review-ui.png':'/style-review-stale-ui.png')});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({reviewRevision:receipt.submission.application.assetRevision,current:live.current,uiCorrectAfterReload:true}));
}finally{await browser.close();}
