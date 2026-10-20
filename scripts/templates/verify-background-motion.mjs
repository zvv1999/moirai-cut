import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000',root='/Users/zhengwei/Downloads/background-motion-20260929',id='style-caption-compact-candidate-20260929';await fs.mkdir(root,{recursive:true});
const read=async()=>await(await fetch(base+'/api/footage/templates/dynamic-assets/'+id)).json();const before=await read();
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('/dynamic-assets/preview'))requests.push(r.postDataJSON());});
await page.goto(base+'/templates?effect='+id);await page.getByRole('combobox',{name:'当前样式图层',exact:true}).selectOption('headline');await page.getByRole('navigation',{name:'属性快捷定位',exact:true}).getByRole('button',{name:'动效',exact:true}).click();await page.getByText('高级关键帧 · 1 条轨道',{exact:true}).click();
await page.getByRole('combobox',{name:'添加动画轨道',exact:true}).selectOption('background_opacity');
await page.getByRole('button',{name:'在底板不透明度关键帧1后插入',exact:true}).click();await page.getByRole('button',{name:'在底板不透明度关键帧2后插入',exact:true}).click();
for(const [i,time,value] of [[1,0,0],[2,20,.62],[3,80,.62],[4,100,0]]){
 await page.getByRole('spinbutton',{name:`底板不透明度关键帧${i}时间`,exact:true}).fill(String(time));await page.getByRole('spinbutton',{name:`底板不透明度关键帧${i}数值`,exact:true}).fill(String(value));
}
await page.getByRole('spinbutton',{name:'效果预览时长',exact:true}).fill('2');
await page.waitForFunction(()=>document.querySelector('.tw-effect-preview')?.getAttribute('aria-busy')==='false');
const preview=await(await fetch(base+'/api/footage/templates/dynamic-assets/preview',{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify(requests.at(-1))})).json();const element=preview.tracks.overlay.flatMap(t=>t.elements).find(e=>e.params?.['template.elementId']==='headline');assert.ok(element);const start=element.startTime/120000,end=(element.startTime+element.duration)/120000;assert.equal(element.params.opacity,1);assert.equal(element.animations.opacity,undefined);
const capture=async(time,name)=>{await page.getByRole('slider',{name:'效果预览进度',exact:true}).fill(String(time));await page.waitForFunction(()=>document.querySelector('.tw-effect-preview')?.getAttribute('aria-busy')==='false');const c=page.locator('canvas[aria-label="效果实时画面"]');await c.screenshot({path:root+'/'+name+'.png'});return c.evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let alpha=0,solidText=0,backingLight=0;for(let i=0;i<d.length;i+=4){alpha+=d[i+3];if(d[i+2]>d[i]*1.3&&d[i+1]>d[i]&&d[i+2]<80)backingLight+=d[i+2];if(d[i]>220&&d[i+1]>210&&d[i+3]>240)solidText++;}return {alpha,solidText,backingLight};});};
const entry=await capture(Math.ceil(start*100)/100,'entry'),hold=await capture(Math.round((start+.3)*100)/100,'hold'),exit=await capture(Math.floor((end-.01)*100)/100,'exit');assert.ok(hold.backingLight>entry.backingLight*1.2);assert.ok(hold.backingLight>exit.backingLight*1.2);assert.ok(Math.min(entry.solidText,hold.solidText,exit.solidText)>100);
await page.getByRole('spinbutton',{name:'底板不透明度关键帧2数值',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:root+'/workbench.png'});
await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await page.getByRole('button',{name:'撤销未保存修改',exact:true}).click();await page.reload();await page.getByRole('combobox',{name:'当前样式图层',exact:true}).waitFor();assert.deepEqual(await read(),before);assert.deepEqual(errors,[]);
await fs.writeFile(root+'/ui-verification.json',JSON.stringify({passed:true,entry,hold,exit,originalUnchanged:true,mobileNoOverflow:true,pageErrors:errors},null,2));console.log('PASS background-only alpha changes, solid glyphs retained, native keyframe UI, undo, reload and mobile.');
}finally{await browser.close();}
