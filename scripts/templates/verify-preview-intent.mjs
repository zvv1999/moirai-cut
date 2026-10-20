import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000',id='style-study-20260928-growth';
const read=async()=>{const r=await fetch(base+'/api/footage/templates/dynamic-assets/'+id);assert.ok(r.ok);return r.json();};const before=await read();
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const response=()=>page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/application-preview')&&r.request().method()==='POST');
 let next=response();await page.goto(`${base}/templates/effects/${id}/try?revision=${before.definition.revision}&scale=.26&centerX=.5&centerY=.5&intents=${encodeURIComponent('["metric"]')}`);
 assert.equal((await next).ok(),false);await page.getByRole('alert').filter({hasText:'示例尚未触发样式'}).waitFor();
 await page.locator('.tw-preview-example summary').click();
 next=response();await page.getByRole('combobox',{name:'预览示例语义',exact:true}).selectOption('metric');const r=await next,data=await r.json();assert.ok(r.ok(),JSON.stringify(data));assert.equal(data.example.timingSource,'synthetic_example');assert.deepEqual(data.tracks.audio,[]);
 assert.equal(await page.getByRole('combobox',{name:'主样式出现语义',exact:true}).inputValue(),'metric');
 await page.waitForFunction(()=>document.querySelector('.tw-effect-preview')?.getAttribute('aria-busy')==='false'&&document.querySelector('canvas[aria-label="效果实时画面"]')?.style.visibility==='visible');
 assert.ok(await page.locator('canvas[aria-label="效果实时画面"]').evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>40&&Math.max(d[i],d[i+1],d[i+2])>80)n++;return n>100;}));
 await page.getByRole('region',{name:'效果预览',exact:true}).screenshot({path:'/tmp/preview-intent-metric.png'});
 next=response();await page.getByRole('combobox',{name:'预览示例语义',exact:true}).selectOption('question');assert.equal((await next).ok(),false);await page.getByRole('alert').filter({hasText:'示例尚未触发样式'}).waitFor();
 assert.deepEqual(await read(),before);assert.deepEqual(errors,[]);
 console.log('PASS default mismatch guidance, metric native synthetic preview renders, mismatch restored, application filter and saved style unchanged');
}finally{await browser.close();}
