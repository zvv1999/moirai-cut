import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000',root='/Users/zhengwei/Downloads/trial-text-widths-20260929';await fs.mkdir(root,{recursive:true});
const library=async()=>await(await fetch(base+'/api/footage/templates/dynamic-assets')).json(),before=await library();
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const ready=()=>page.waitForFunction(()=>document.querySelector('.tw-trial-visual')?.getAttribute('aria-busy')==='false');
for(const combined of [false,true]){
 const extra={assetId:'style-study-20260928-cyan-impact',assetRevision:2,instanceId:'emphasis',placement:'full',transform:{scale:.6,centerX:.5,centerY:.7},intents:[]};
 const url=combined?base+'/templates/effects/style-caption-compact-candidate-20260929/try?revision=3&scale=1&centerX=.5&centerY=.9&styles='+encodeURIComponent(JSON.stringify([extra])):base+'/templates/effects/'+extra.assetId+'/try?revision=2&scale=.6&centerX=.5&centerY=.7';
 const endpoint=combined?'/dynamic-assets/insert':'/dynamic-assets/application',label=combined?'叠加样式1':'主样式';
 let response=page.waitForResponse(r=>r.ok()&&r.url().endsWith(endpoint));await page.goto(url);const baseline=(await(await response).json()).template;await ready();
 await page.getByText(label+'文字行宽',{exact:true}).click();await page.getByRole('checkbox',{name:label+'headline独立行宽',exact:true}).check();await ready();
 response=page.waitForResponse(r=>r.url().endsWith(endpoint)&&r.request().postDataJSON()?.textWidths?.headline===.5);await page.getByRole('spinbutton',{name:label+'headline行宽',exact:true}).fill('.5');const widenedResponse=await response;assert.ok(widenedResponse.ok());const widened=(await widenedResponse.json()).template;await ready();
 const id=combined?'emphasis--headline':'headline';assert.deepEqual(widened.styles,baseline.styles);assert.deepEqual(widened.layouts,baseline.layouts);
 for(const original of baseline.elements){const modified=widened.elements.find(e=>e.id===original.id);const expected=structuredClone(original);if(original.id===id){expected.region.x=original.region.x+original.region.width/2-.25;expected.region.width=.5;}assert.deepEqual(modified,expected);}
 response=page.waitForResponse(r=>r.ok()&&r.url().endsWith(endpoint));await page.reload();const restored=(await(await response).json()).template;assert.deepEqual(restored,widened);await ready();await page.getByText(label+'文字行宽',{exact:true}).click();assert.equal(await page.getByRole('spinbutton',{name:label+'headline行宽',exact:true}).inputValue(),'0.5');
 response=page.waitForResponse(r=>r.url().endsWith(endpoint)&&r.request().postDataJSON()?.textWidths?.headline===.01);await page.getByRole('spinbutton',{name:label+'headline行宽',exact:true}).fill('.01');assert.equal((await response).ok(),false);await page.getByRole('alert').filter({hasText:'text width'}).waitFor();
 response=page.waitForResponse(r=>r.ok()&&r.url().endsWith(endpoint));await page.getByRole('spinbutton',{name:label+'headline行宽',exact:true}).fill('.5');await response;await ready();
 if(combined){await page.setViewportSize({width:390,height:844});await page.getByRole('spinbutton',{name:label+'headline行宽',exact:true}).scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:root+'/mobile.png'});}
 response=page.waitForResponse(r=>r.ok()&&r.url().endsWith(endpoint));await page.getByRole('checkbox',{name:label+'headline独立行宽',exact:true}).uncheck();const reset=(await(await response).json()).template;assert.deepEqual(reset,baseline);await ready();
}
assert.deepEqual(await library(),before);assert.deepEqual(errors,[]);await fs.writeFile(root+'/verification.json',JSON.stringify({passed:true,primaryAndInserted:true,onlySelectedRegionChanged:true,exactReload:true,invalidWidthRejected:true,recovery:true,resetToOriginal:true,mobileNoOverflow:true,libraryUnchanged:true,pageErrors:errors},null,2));console.log('PASS primary/inserted widths, invariants, reload, invalid recovery, reset, mobile, unchanged library');
}finally{await browser.close();}
