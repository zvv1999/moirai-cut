import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const base='http://127.0.0.1:3000',id=process.env.STYLE_ASSET_ID,root=process.env.PILOT_OUTPUT;
assert.ok(id&&root,'Provide STYLE_ASSET_ID and PILOT_OUTPUT');
const read=async()=>{const r=await fetch(base+'/api/footage/templates/dynamic-assets/'+encodeURIComponent(id));assert.ok(r.ok);return r.json();};
const before=await read(),definition=before.definition;
const layers=definition.layers.flatMap(l=>l.content.element?[l.content.element]:[]);
assert.ok(layers.length);
const labels={ellipse:'椭圆',rectangle:'矩形',line:'线条'};
for(const e of layers)assert.ok(labels[e.features.representation],'Only native shape decorations are checked here');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));await page.goto(base+'/templates?effect='+encodeURIComponent(id));
 async function select(e){
  await page.getByRole('combobox',{name:'当前样式图层',exact:true}).selectOption(e.id);
  await page.getByRole('navigation',{name:'属性快捷定位',exact:true}).getByRole('button',{name:'外观',exact:true}).click();
  const fill=page.getByLabel('填充色',{exact:true});assert.ok(await fill.isEnabled());
  assert.equal((await fill.inputValue()).toLowerCase(),definition.styles.find(s=>s.id===e.styleId).fill.toLowerCase());
 }
 for(const e of layers)await select(e);
 await page.reload();await select(layers.at(-1));
 const compositeRoot=definition.layers.find(l=>l.content.kind==='group'&&l.content.id==='root'&&l.content.composite);
 if(compositeRoot){
  await page.getByRole('combobox',{name:'当前样式图层',exact:true}).selectOption('root');
  await page.getByRole('navigation',{name:'属性快捷定位',exact:true}).getByRole('button',{name:'外观',exact:true}).click();
  assert.equal(await page.getByLabel('整组合成',{exact:true}).isChecked(),true);
  assert.equal(await page.getByLabel('按显示区间重复组动效',{exact:true}).isChecked(),compositeRoot.content.separateInstances??false);
  const fade=definition.treatments.find(t=>t.id==='group-fade-root');
  if(fade){assert.equal(Number(await page.getByLabel('整组淡出时长（秒）',{exact:true}).inputValue()),fade.operation.motionTiming.exitSeconds);assert.equal(Number(await page.getByLabel('整组入场预留（秒）',{exact:true}).inputValue()),fade.operation.motionTiming.enterSeconds);}
 }

 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(await read(),before);assert.deepEqual(errors,[]);
 await fs.mkdir(root,{recursive:true});
 await page.screenshot({path:root+'/mobile.png'});
 const result={assetId:id,revision:definition.revision,selectedLayers:layers.map(e=>e.id),fillControlsEnabledAndMatched:true,compositeRootChecked:Boolean(compositeRoot),reloaded:true,mobileNoOverflow:true,libraryUnchanged:true};
 await fs.writeFile(root+'/editor-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
