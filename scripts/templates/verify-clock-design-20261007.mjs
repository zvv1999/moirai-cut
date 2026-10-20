import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const root='/Users/zhengwei/Downloads/clock-design-20261007',phase=process.argv[2]??'draft',id='style-study-20260929-clock';
const definition=JSON.parse(await fs.readFile(root+'/'+(phase==='draft'?'candidate.json':'saved.json'),'utf8'));
const b=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const p=await b.newPage({viewport:{width:1440,height:1100}}),errors=[],responses=[];p.on('pageerror',e=>errors.push(e.message));
 if(phase==='draft')await p.route('**/api/footage/templates/dynamic-assets**',async route=>{const req=route.request();if(req.method()==='GET'){const res=await route.fetch();const d=await res.json();if(d.definition?.id===id)d.definition=definition;if(d.assets)d.assets=d.assets.map(a=>a.id===id?definition:a);return route.fulfill({response:res,json:d});}return route.continue();});
 p.on('response',async res=>{if(res.url().endsWith('/dynamic-assets/preview'))responses.push(await res.json());});
 await p.goto('http://127.0.0.1:3000/templates?effect='+id);
 const picker=p.getByRole('combobox',{name:'当前样式图层',exact:true});await picker.waitFor({timeout:60000});const values=await picker.locator('option').evaluateAll(es=>es.map(e=>e.value));
 const checked=['case-depth','rim-highlight','inner-bezel','face','mark-north','minute-mark-1','hour-highlight','minute','hub-glint'];for(const layer of checked){assert.ok(values.includes(layer),layer+' selectable');await picker.selectOption(layer);assert.equal(await picker.inputValue(),layer);}
 await picker.selectOption('face');await p.getByText('正在更新效果…',{exact:true}).waitFor({state:'hidden',timeout:60000});
 const stage=p.locator('.tw-effect-stage').first();await stage.waitFor();
 await p.waitForFunction(()=>{const s=document.querySelector('.tw-effect-stage'),c=s?.querySelector('canvas');return c?.dataset.renderGeneration===s?.dataset.previewGeneration&&c?.width>0;},{},{timeout:60000});
 for(const background of ['黑色','白色','棋盘']){await p.getByRole('button',{name:background+'预览背景',exact:true}).click();await p.waitForFunction(label=>{const c=document.querySelector('.tw-effect-stage canvas');return c?.dataset.renderBackground===({'黑色':'#000000','白色':'#ffffff','棋盘':'checker'})[label];},background,{timeout:30000});const data=await stage.locator('canvas').evaluate(c=>({png:c.toDataURL(),renderTime:c.dataset.renderTime,width:c.width,height:c.height}));await fs.writeFile(root+'/'+phase+'-'+({'黑色':'black','白色':'white','棋盘':'checker'})[background]+'.png',Buffer.from(data.png.split(',')[1],'base64'));}
 await p.screenshot({path:root+'/'+phase+'-workbench.png',fullPage:true});
 assert.deepEqual(errors,[]);await fs.writeFile(root+'/'+phase+'-ui-verification.json',JSON.stringify({selectableLayers:values,checked,pageErrors:errors,preview:responses.at(-1)},null,2));console.log(JSON.stringify({phase,layers:values.length,errors}));
}finally{await b.close();}
