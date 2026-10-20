import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000';
const read=async()=>{const r=await fetch(base+'/api/footage/templates/dynamic-assets');assert.ok(r.ok);return r.json();};
const before=await read();
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const response=()=>page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/application'));
 const first=response();await page.goto(base+'/templates/effects/style-pilot-20260923-caption/try?revision=3&scale=0.65&centerX=0.5&centerY=0.9&captionWidth=0.84');
 const original=(await(await first).json()).template;
 const change=async(action)=>{const next=response();await action();const r=await next;assert.ok(r.ok(),await r.text());await page.waitForFunction(()=>document.querySelector('.tw-trial-visual')?.getAttribute('aria-busy')==='false');return (await r.json()).template;};
 const divided=await change(()=>page.getByRole('checkbox',{name:'自定原视频区域',exact:true}).check());
 assert.deepEqual(divided.layouts[0].videoRegion,{x:0,y:0,width:1,height:0.8});
 assert.deepEqual(divided.elements,original.elements);assert.deepEqual(divided.styles,original.styles);
 const resized=await change(()=>page.getByRole('spinbutton',{name:'原视频高度',exact:true}).fill('0.75'));
 assert.equal(resized.layouts[0].videoRegion.height,0.75);
 const reload=response();await page.reload();const restored=(await(await reload).json()).template;
 assert.deepEqual(restored,resized);assert.equal(await page.getByRole('spinbutton',{name:'原视频高度',exact:true}).inputValue(),'0.75');
 const invalid=response();await page.getByRole('spinbutton',{name:'原视频顶部',exact:true}).fill('0.5');assert.equal((await invalid).ok(),false);
 await page.getByRole('alert').filter({hasText:'layout must fit normalized canvas'}).waitFor();
 await change(()=>page.getByRole('spinbutton',{name:'原视频顶部',exact:true}).fill('0'));
 await page.setViewportSize({width:390,height:844});await page.getByRole('group',{name:'原视频区域',exact:true}).scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.screenshot({path:'/tmp/trial-video-region-mobile.png'});
 const reset=await change(()=>page.getByRole('checkbox',{name:'自定原视频区域',exact:true}).uncheck());assert.deepEqual(reset,original);assert.equal(new URL(page.url()).searchParams.has('videoHeight'),false);
 assert.deepEqual(await read(),before);assert.deepEqual(errors,[]);
 console.log('PASS video region native application, independent caption styles/timing, reload, bounds rejection, reset, mobile, unchanged library');
}finally{await browser.close();}
