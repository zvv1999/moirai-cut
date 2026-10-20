import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000',root='/Users/zhengwei/Downloads/library-review-summaries-2026-09-29';
async function read(path){const r=await fetch(base+'/api/footage/templates'+path);assert.ok(r.ok);return r.json();}
const library=await read('/dynamic-assets'),reviews=await read('/dynamic-assets/reviews');
const echo=reviews.reviews.find(r=>r.current&&r.submission.application.assetId==='style-study-20260924-echo');assert.ok(echo);
await fs.mkdir(root,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const card=name=>page.locator('.tw-style-card').filter({has:page.getByRole('button',{name:new RegExp('^'+name)})});
 await page.goto(base+'/templates');
 await card('便签批注').locator('.tw-style-review-summary').filter({hasText:'应用评分 85/100 · 需完善'}).waitFor();
 assert.match(await card('入场强调').innerText(),/应用评分 82\/100 · 需完善/);
 assert.equal(await card('时间提示').locator('.tw-style-review-summary').innerText(),'待评审');
 assert.equal(await page.locator('video').count(),0,'Listing must not load review media');
 await page.screenshot({path:root+'/desktop.png'});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await card('入场强调').getByRole('button',{name:/^入场强调/}).click();
 const badge=card('入场强调').locator('.tw-style-review-summary');await badge.scrollIntoViewIfNeeded();
 assert.ok(await badge.evaluate(e=>{const r=e.getBoundingClientRect(),p=e.closest('.tw-dynamic-results').getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom;}),'Selected mobile card must not clip the review badge');
 await page.screenshot({path:root+'/mobile.png'});
 // These response-only fixtures test stale/failed/scoped states; no review is written.
 let fixture=reviews,status=200;
 await page.route('**/api/footage/templates/dynamic-assets/reviews',route=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(fixture)}));
 status=503;await page.goto(base+'/templates');
 await card('入场强调').locator('.tw-style-review-summary').filter({hasText:'评审读取失败'}).waitFor();
 assert.doesNotMatch(await card('入场强调').innerText(),/待评审/);
 status=200;fixture={reviews:[{...echo,total:99,current:false,meetsInternalThreshold:true}]};await page.reload();
 await card('入场强调').locator('.tw-style-review-summary').filter({hasText:'当前版本待评审 · 有历史记录'}).waitFor();
 assert.doesNotMatch(await card('入场强调').innerText(),/99|达标/);
 fixture={reviews:[{...echo,total:99,current:true,evidenceCurrent:false,meetsInternalThreshold:true}]};await page.reload();
 await card('入场强调').locator('.tw-style-review-summary').filter({hasText:'当前版本待评审 · 有历史记录'}).waitFor();
 fixture={reviews:[{...echo,total:99,meetsInternalThreshold:false}]};await page.reload();
 await card('入场强调').locator('.tw-style-review-summary').filter({hasText:'应用评分 99/100 · 需完善'}).waitFor();
 fixture={reviews:[echo,{...echo,id:'ui-only-second-application',total:94,meetsInternalThreshold:true}]};await page.reload();
 await card('入场强调').locator('.tw-style-review-summary').filter({hasText:'2 份应用评审 · 1 个应用达标'}).waitFor();
 for(const intents of [['metric'],[]]){
  fixture={reviews:[{...echo,submission:{...echo.submission,application:{...echo.submission.application,intents}}}]};
  await page.goto(base+'/templates?effect='+echo.submission.application.assetId);
  const summary=page.locator('.tw-style-reviews > summary');await summary.filter({hasText:'1 份当前版本记录'}).waitFor();await summary.click();
  const link=page.getByRole('link',{name:'用这个布局试自己的声音',exact:true});
  assert.deepEqual(JSON.parse(new URL(await link.getAttribute('href'),base).searchParams.get('intents')),intents);
  const response=page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/application')&&JSON.stringify(r.request().postDataJSON()?.intents)===JSON.stringify(intents));
  await link.click();const r=await response;assert.ok(r.ok());
  const template=(await r.json()).template;
  assert.ok(template.elements.length);assert.ok(template.elements.every(e=>JSON.stringify(e.intents)===JSON.stringify(intents)));
 }
 assert.deepEqual(errors,[]);assert.deepEqual(await read('/dynamic-assets'),library);assert.deepEqual(await read('/dynamic-assets/reviews'),reviews);
 await fs.writeFile(root+'/verification.json',JSON.stringify({realCurrentReviews:true,unreviewed:true,mobileBadgeVisible:true,failedReadNotUnreviewed:true,staleAndChangedEvidenceExcluded:true,nativeThresholdFlagRespected:true,multipleApplicationsScoped:true,intentsRestored:['metric','any'],responseFixturesOnly:true,libraryAndReviewsUnchanged:true},null,2));
 console.log('PASS: real badges, mobile, failure/history, native threshold flags, multiple applications and native intent-link restoration');
}finally{await browser.close();}
