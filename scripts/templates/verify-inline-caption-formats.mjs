import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root='/Users/zhengwei/Downloads/inline-caption-formats-20260929',base='http://127.0.0.1:3000',id='style-caption-inline-cyan-candidate-20260929';await fs.mkdir(root,{recursive:true});const read=async()=>await(await fetch(base+'/api/footage/templates/dynamic-assets')).json(),before=await read();
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const records=[];
try{const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const format of ['landscape','portrait']){
  const query=new URLSearchParams({revision:'1',format,scale:format==='portrait'?'1.6':'1',centerX:'.5',centerY:format==='portrait'?'.88':'.9',captionWidth:format==='portrait'?'.9':'.84'});const url=`${base}/templates/effects/${id}/try?${query}`;
  await page.goto(url);await page.getByLabel('效果实时画面',{exact:true}).waitFor({state:'visible',timeout:60000});
  for(const [label,slug] of [['短句','short'],['长中文','zh'],['长英文','en']]){
   const generation=await page.locator('.tw-effect-stage').getAttribute('data-preview-generation');
   const response=page.waitForResponse(r=>r.ok()&&r.url().endsWith('/dynamic-assets/application-preview')&&r.request().postDataJSON()?.durationSeconds===6);
   if(slug==='short')await page.getByRole('spinbutton',{name:'效果预览时长',exact:true}).fill('6');else await page.getByRole('group',{name:'快速试文案'}).getByRole('button',{name:label,exact:true}).click();
   const result=await response;const data=await result.json();await page.waitForFunction(g=>document.querySelector('.tw-effect-stage')?.getAttribute('data-preview-generation')!==g,generation);await page.getByLabel('效果实时画面',{exact:true}).waitFor({state:'visible',timeout:60000});await page.getByLabel('效果实时画面',{exact:true}).screenshot({path:`${root}/${format}-${slug}.png`});
   records.push({format,label,url,request:result.request().postDataJSON(),preview:data,image:`${format}-${slug}.png`});
  }
 }
 assert.deepEqual(errors,[]);assert.deepEqual(await read(),before);await fs.writeFile(root+'/verification.json',JSON.stringify({passed:true,syntheticOnly:true,libraryUnchanged:true,pageErrors:errors,records,visuallyInspected:false,listened:false,score:null},null,2));console.log('PASS six synthetic text/format previews without library changes');
}finally{await browser.close();}
