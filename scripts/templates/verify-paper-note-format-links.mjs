import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000/api/footage/templates';
const root='/Users/zhengwei/Downloads/paper-note-composition-formats-2026-09-28';
const links=JSON.parse(await fs.readFile(root+'/workbench-links.json','utf8'));
function compare(actual,expected,path){
 if(typeof actual==='number'&&typeof expected==='number'){
  assert.ok(Math.abs(actual-expected)<=4*Number.EPSILON*Math.max(1,Math.abs(actual),Math.abs(expected)),path);return;
 }
 if(actual&&expected&&typeof actual==='object'&&typeof expected==='object'){
  assert.equal(Array.isArray(actual),Array.isArray(expected),path);
  assert.deepEqual(Object.keys(actual).sort(),Object.keys(expected).sort(),path);
  for(const key of Object.keys(actual))compare(actual[key],expected[key],path+'.'+key);
 }else assert.deepEqual(actual,expected,path);
}
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [format,index] of [['landscape',0],['portrait',1],['square',0]]) {
  const batch=format==='square'?'production-05d457242c6b16db878400132ab858ae':'production-e99b8fb48f79148d295748a4e31e76b9';
  const response=await fetch(base+'/production/'+batch+'/items/'+index);assert.ok(response.ok);
  const expected=(await response.json()).output.template;
  const applied=page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/insert')&&r.request().postDataJSON()?.assetId==='style-pilot-20260923-caption');
  await page.goto(links[format]);
  const actual=await applied;assert.ok(actual.ok(),await actual.text());const template=(await actual.json()).template;
  for(const field of ['canvas','elements','styles','composition','resources','resourceBindings'])compare(template[field],expected[field],format+' '+field);
  await page.waitForFunction(()=>document.querySelector('.tw-trial-visual')?.getAttribute('aria-busy')==='false');
 }
 assert.deepEqual(errors,[]);console.log('Three editable workbench links reproduce exported canvas, layers, styles, composition and resources');
}finally{await browser.close();}
