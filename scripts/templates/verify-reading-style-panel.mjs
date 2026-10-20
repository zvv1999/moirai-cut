import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000',id=process.env.STYLE_ID,root=process.env.PILOT_OUTPUT;
assert.ok(id&&root,'Provide STYLE_ID and PILOT_OUTPUT');
const read=async()=>{const r=await fetch(base+'/api/footage/templates/dynamic-assets/'+id);assert.ok(r.ok);return r.json();};
const before=await read(),definition=before.definition;
const headline=definition.layers.find(l=>l.content.element?.id==='headline').content.element;
const style=definition.styles.find(s=>s.id===headline.styleId);
const b=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const p=await b.newPage({viewport:{width:1280,height:900}}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 for(let pass=0;pass<2;pass++){
  const pending=p.waitForResponse(r=>r.ok()&&r.url().endsWith('/dynamic-assets/preview')&&r.request().postDataJSON()?.definition?.id===id);
  await p.goto(base+'/templates?effect='+encodeURIComponent(id));await pending;
  for(const layerId of (process.env.STYLE_LAYERS || 'headline').split(',')){
  const headline=definition.layers.find(l=>l.content.element?.id===layerId).content.element;
  const style=definition.styles.find(s=>s.id===headline.styleId);
  await p.getByLabel('当前样式图层',{exact:true}).selectOption(layerId);
  await p.getByRole('button',{name:'外观',exact:true}).click();
  assert.equal(await p.getByLabel('文字对齐',{exact:true}).inputValue(),style.textAlign);
  assert.equal(Number(await p.getByRole('spinbutton',{name:'最多行数',exact:true}).inputValue()),style.maxLines);
  await p.getByRole('button',{name:'动效',exact:true}).click();
  assert.equal(Number(await p.getByLabel('入场秒数',{exact:true}).inputValue()),headline.motionTiming.enterSeconds);
  assert.equal(Number(await p.getByLabel('退场秒数',{exact:true}).inputValue()),headline.motionTiming.exitSeconds);
  }
 }
 await p.setViewportSize({width:390,height:844});await p.getByLabel('入场秒数',{exact:true}).scrollIntoViewIfNeeded();
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:root+'/panel-mobile.png'});
 assert.deepEqual(errors,[]);assert.deepEqual(await read(),before);
 await fs.writeFile(root+'/panel-verification.json',JSON.stringify({passed:true,id,revision:definition.revision,alignment:style.textAlign,maxLines:style.maxLines,motionTiming:headline.motionTiming,layersChecked:(process.env.STYLE_LAYERS || 'headline').split(','),reload:true,mobileNoOverflow:true,errors},null,2));
 console.log('PASS saved reading-style controls and reload');
}finally{await b.close();}
