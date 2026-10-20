import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000';
const read=async path=>{const r=await fetch(base+'/api/footage/templates'+path);assert.ok(r.ok);return r.json();};
const before=await read('/dynamic-assets'),reviews=await read('/dynamic-assets/reviews');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const close of ['videos','history','review','selection']){
  await page.goto(base+'/templates?effect=style-study-20260924-note');
  await page.locator('.tw-style-reviews > summary').filter({hasText:/待评审|当前版本记录/}).click();
  await page.getByText('历史评审 · 1 份',{exact:true}).click();
  await page.locator('.tw-style-review-history').getByText('查看评审成片 · 3 份',{exact:true}).click();
  const first=await page.locator('.tw-style-reviews video').nth(0).elementHandle();
  const second=await page.locator('.tw-style-reviews video').nth(1).elementHandle();
  await first.evaluate(async v=>{v.muted=true;await Promise.race([v.play(),new Promise((_,reject)=>setTimeout(()=>reject(Error("Review video did not start within 15 seconds")),15000))]);});
  await second.evaluate(async v=>{v.muted=true;await Promise.race([v.play(),new Promise((_,reject)=>setTimeout(()=>reject(Error("Review video did not start within 15 seconds")),15000))]);});
  assert.equal(await first.evaluate(v=>v.paused),true,'Playing a second sample pauses the first');
  assert.equal(await second.evaluate(v=>v.paused),false);
  if(close==='videos')await page.locator('.tw-style-review-history').getByText('查看评审成片 · 3 份',{exact:true}).click();
  if(close==='history')await page.getByText('历史评审 · 1 份',{exact:true}).click();
  if(close==='review')await page.locator('.tw-style-reviews > summary').click();
  if(close==='selection')await page.getByRole('navigation',{name:'效果素材列表'}).getByRole('button',{name:/口播强调 · 青色弹字/}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.tw-style-reviews video').length===0);
  for(const video of [first,second])assert.deepEqual(await video.evaluate(v=>({paused:v.paused,connected:v.isConnected,src:v.getAttribute('src')})),{paused:true,connected:false,src:null},close);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(await read('/dynamic-assets'),before);assert.deepEqual(await read('/dynamic-assets/reviews'),reviews);
 console.log('Muted playback: exclusive sample audio, four collapse/switch paths pause and release detached media; data unchanged');
}finally{await browser.close();}
