import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root=process.env.READING_REVIEW_ROOT||'/Users/zhengwei/Downloads/reading-left-align-real-20260929',applicationReview=Boolean(process.env.READING_REVIEW_ROOT),expectedCount=applicationReview?4:7,b=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{const p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('file://'+root+'/review.html');await p.waitForFunction(count=>document.querySelectorAll('video').length===count&&[...document.querySelectorAll('video')].every(v=>v.readyState>=1&&v.videoWidth===1280),expectedCount);
for(const section of await p.locator('section').all()){
 await section.locator('video').evaluate(v=>{v.currentTime=1});await section.getByRole('button',{name:applicationReview?'调整前':'居中旧版',exact:true}).click();await section.locator('video').evaluate(v=>new Promise(resolve=>{if(v.readyState>=1&&Math.abs(v.currentTime-1)<.1)return resolve();v.addEventListener('seeked',()=>resolve(),{once:true})}));assert.ok(Math.abs(await section.locator('video').evaluate(v=>v.currentTime)-1)<.1);
}
const links=[...new Set(await p.getByRole('link',{name:applicationReview?'按此次位置在工作台试用':'按此次布局在工作台试用'}).evaluateAll(a=>a.map(e=>e.href)))];assert.equal(links.length,2);
await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
for(const [i,link]of links.entries()){
 const pending=p.waitForResponse(r=>r.ok()&&r.url().endsWith('/dynamic-assets/application'));await p.goto(link);const actual=(await(await pending).json()).template;const expected=JSON.parse(await fs.readFile(root+'/'+['adaptive','marker'][i]+'/designs.json')).designs[0].template;expected.id=actual.id;assert.deepEqual(actual,expected);
}
assert.deepEqual(errors,[]);await fs.writeFile(root+'/ui-verification.json',JSON.stringify({passed:true,videoVersionsLoaded:expectedCount*2,switchRetainsPosition:true,exactApplicationLinks:true,mobileNoOverflow:true,pageErrors:errors},null,2));console.log('PASS review videos, same-time switching, precise application links and mobile');
}finally{await b.close()}
