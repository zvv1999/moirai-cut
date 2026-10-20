import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000';
const before=await(await fetch(base+'/api/footage/templates/dynamic-assets')).json();
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}});const requests=[];const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.url().endsWith('/dynamic-assets/preview')&&r.method()==='POST')requests.push(r.postDataJSON().definition);});
 await page.goto(base+'/templates?effect=style-study-20260928-signal');
 const search=page.getByRole('searchbox',{name:'搜索效果素材'});
 await search.fill('箭头');
 const arrow=page.locator('.tw-dynamic-results .tw-style-open').filter({hasText:'方向提示'});
 await arrow.locator('[data-thumbnail-state="ready"] img').waitFor();
 const image=await arrow.locator('img').getAttribute('src');assert.ok(image.startsWith('data:image/png;'));
 const inkWidth=await arrow.locator('img').evaluate(async image=>{await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let left=canvas.width,right=-1;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const i=(y*canvas.width+x)*4;if(data[i]>180&&data[i+1]>130&&data[i+2]<150){left=Math.min(left,x);right=Math.max(right,x);}}return right-left+1;});
 assert.ok(inkWidth>=110,'Small arrow must fill its thumbnail instead of retaining large blank artboard margins');
 const count=requests.filter(d=>d.id==='style-study-20260928-arrow').length;
 await search.fill('双圈');await page.locator('.tw-dynamic-results [data-thumbnail-state="ready"] img').waitFor();
 await search.fill('箭头');await arrow.locator('[data-thumbnail-state="ready"] img').waitFor();
 assert.equal(requests.filter(d=>d.id==='style-study-20260928-arrow').length,count,'Returning to a saved revision must reuse thumbnail');
 await arrow.click();await page.getByRole('textbox',{name:'效果名称'}).waitFor();
 assert.equal(await page.getByRole('textbox',{name:'效果名称'}).inputValue(),'方向提示 · 箭头轻推');
 await page.waitForFunction(()=>document.querySelector('.tw-effect-preview')?.getAttribute('aria-busy')==='false');
 await search.fill('');
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  if(width===390){
   const region=page.locator('.tw-dynamic-results');assert.ok(await region.evaluate(e=>e.clientHeight)>=80,'Mobile library must show complete cards');
   await arrow.scrollIntoViewIfNeeded();
   const card=await arrow.boundingBox(),bounds=await region.boundingBox();assert.ok(card.height>=70&&card.x>=bounds.x-1&&card.x+card.width<=bounds.x+bounds.width+1);
  }
  await page.screenshot({path:`/tmp/style-thumbnails-${width}.png`,fullPage:true});
 }
 assert.deepEqual(errors,[]);
 assert.deepEqual(await(await fetch(base+'/api/footage/templates/dynamic-assets')).json(),before);
 console.log(JSON.stringify({cached:true,editableSelection:true,noOverflow:true,libraryUnchanged:true,previewRequests:requests.length}));
}finally{await browser.close();}
