import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/templates/effects/style-pilot-20260923-caption/try?revision=2');
 const response=page.waitForResponse(r=>r.url().endsWith('/sample-preview')&&r.ok()&&r.request().postDataJSON()?.sample.inputId==='input-e0d2273b4b7b27c945a73d00eb03b2c6');
 await page.locator('label.tp-choice').filter({hasText:'热爱研究，影响生活'}).getByRole('checkbox').click();
 const native=await(await response).json();assert.ok(native.warnings.includes('cue-0:reading_speed_exceeds_limit'));
 await page.waitForFunction(()=>document.querySelector('.tw-effect-preview')?.getAttribute('aria-busy')==='false');
 await page.getByText(/^预览检查 · \d+ 条提醒$/).click();
 const panel=page.getByRole('region',{name:'效果预览',exact:true});
 assert.match(await panel.innerText(),/字幕分段第 1、2、3、4、5、6、7、8、9 句：阅读速度超过当前设置/);
 assert.match(await panel.innerText(),/放慢配音后重新试映/);
 assert.doesNotMatch(await panel.innerText(),/reading_speed_exceeds_limit|aligned_word_exceeds_character_budget/);
 assert.equal(await panel.locator('p').filter({hasText:'阅读速度超过当前设置'}).count(),1);
 await panel.locator('p').filter({hasText:'阅读速度超过当前设置'}).scrollIntoViewIfNeeded();
 await page.screenshot({path:'/tmp/preview-warning-copy-mobile.png'});
 assert.deepEqual(errors,[]);console.log('PASS real Rust reading-speed warning shown in Chinese with one-based cue and actionable guidance; no page errors');
}finally{await browser.close();}
