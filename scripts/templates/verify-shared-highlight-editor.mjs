import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {archiveTestStyle} from './archive-test-style.mjs';
const base='http://127.0.0.1:3000',root=process.env.OUTPUT_DIR??'/Users/zhengwei/Downloads/shared-highlight-editor-20260929';await fs.mkdir(root,{recursive:true});
async function api(path,body){const r=await fetch(base+'/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const before=await api('/dynamic-assets');
let definition,second;
if(process.env.RESUME_FIXTURE){
 const fixture=JSON.parse(await fs.readFile(process.env.RESUME_FIXTURE,'utf8'));definition=fixture.definition;second=fixture.second;
 assert.match(definition.name,/^验收 · 共享高亮 /);
 const current=(await api('/dynamic-assets/'+definition.id)).definition;definition.revision=current.revision;
}else{
 ({definition}=await api('/dynamic-assets/create',{name:'验收 · 共享高亮 '+Date.now(),purpose:'caption',canvas:{width:1280,height:720,fps:30}}));
 const duplicated=await api('/dynamic-assets/layers',{definition,operation:{kind:'duplicate',layerId:'headline'}});definition=duplicated.definition;second=duplicated.selectedLayerId;
 definition.treatments=[definition.treatments[0]];definition.treatments[0].operation={kind:'text_highlight',mode:'keyword',color:'#11C6ED'};definition.applications=[{treatmentId:definition.treatments[0].id,target:{kind:'group',id:'root'},enabled:true}];
 definition.layers.find(l=>l.content.element?.id===second).content.element.region.y=.35;
}
const saved=await api('/dynamic-assets',{definition,baseRevision:definition.revision,idempotencyKey:'shared-highlight-'+definition.id+'-'+definition.revision});definition=saved.definition??(await api('/dynamic-assets/'+definition.id)).definition;
await fs.writeFile(root+'/fixture.json',JSON.stringify({id:definition.id,second,definition},null,2));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/templates?effect='+definition.id);const canvas=page.getByLabel('效果实时画面',{exact:true});await canvas.waitFor({state:'visible',timeout:60000});
 await page.getByRole('note').filter({hasText:'继承分组 root'}).waitFor();assert.equal(await page.getByRole('combobox',{name:'文字高亮方式',exact:true}).inputValue(),'keyword');
 const response=page.waitForResponse(r=>r.ok()&&r.url().endsWith('/dynamic-assets/layers')&&r.request().postDataJSON().operation.kind==='highlight_treatment');
 await page.getByRole('combobox',{name:'文字高亮方式',exact:true}).selectOption('active_word');const edited=(await(await response).json()).definition;assert.deepEqual(edited.layers,definition.layers);assert.deepEqual(edited.applications,definition.applications);assert.equal(edited.treatments[0].operation.mode,'active_word');await canvas.waitFor({state:'visible'});
 async function strokeEdit(action){const wait=page.waitForResponse(r=>r.ok()&&r.url().endsWith('/dynamic-assets/layers'));await action();const d=(await(await wait).json()).definition;assert.deepEqual(d.layers,definition.layers);assert.deepEqual(d.styles,definition.styles);await canvas.waitFor({state:'visible'});return d;}
 await strokeEdit(()=>page.getByRole('checkbox',{name:'高亮文字单独描边',exact:true}).click());
 await strokeEdit(()=>page.getByLabel('高亮描边颜色',{exact:true}).fill('#ff3366'));
 const stroked=await strokeEdit(()=>page.getByRole('spinbutton',{name:'高亮描边宽度',exact:true}).fill('4.5'));
 assert.deepEqual(stroked.treatments[0].operation.stroke,{color:'#ff3366',width:4.5});
 const compiled=await api('/dynamic-assets/preview',{definition:stroked,inputs:{},durationSeconds:2,example:{text:'让重点表达更清楚',keyword:'重点'}});
 const rendered=compiled.tracks.overlay.flatMap(t=>t.elements).filter(e=>e.type==='text');assert.equal(rendered.length,2);for(const e of rendered){assert.equal(e.params['text.highlightStrokeEnabled'],true);assert.equal(e.params['text.highlightStrokeColor'],'#ff3366');assert.equal(e.params['text.highlightStrokeWidth'],4.5);}
 await page.getByRole('combobox',{name:'当前样式图层',exact:true}).selectOption(second);assert.equal(await page.getByRole('combobox',{name:'文字高亮方式',exact:true}).inputValue(),'active_word');
 await page.getByRole('navigation',{name:'属性快捷定位'}).getByRole('button',{name:'应用规则',exact:true}).click();assert.ok(await page.getByRole('combobox',{name:'文字内容来源',exact:true}).isDisabled());
 await page.getByRole('navigation',{name:'属性快捷定位'}).getByRole('button',{name:'外观',exact:true}).click();await page.getByRole('button',{name:'保存修改',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="撤销未保存修改"]').disabled);
 const persisted=(await api('/dynamic-assets/'+definition.id)).definition;assert.equal(persisted.revision,definition.revision+1);assert.deepEqual(persisted.layers,definition.layers);assert.equal(persisted.treatments[0].operation.mode,'active_word');assert.deepEqual(persisted.treatments[0].operation.stroke,{color:'#ff3366',width:4.5});
 await page.reload();await canvas.waitFor({state:'visible'});await page.getByRole('note').filter({hasText:'继承分组 root'}).waitFor();assert.equal(await page.getByRole('combobox',{name:'文字高亮方式',exact:true}).inputValue(),'active_word');
 assert.equal(await page.getByRole('spinbutton',{name:'高亮描边宽度',exact:true}).inputValue(),'4.5');
 await page.setViewportSize({width:390,height:844});await page.getByRole('note').scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:root+'/mobile.png'});
 const clearing=page.waitForResponse(r=>r.ok()&&r.url().endsWith('/dynamic-assets/layers'));await page.getByRole('combobox',{name:'文字高亮方式',exact:true}).selectOption('none');const cleared=(await(await clearing).json()).definition;assert.deepEqual(cleared.treatments,[]);assert.deepEqual(cleared.applications,[]);assert.deepEqual(cleared.layers,definition.layers);
 await page.getByRole('button',{name:'撤销未保存修改',exact:true}).click();await page.getByRole('note').filter({hasText:'继承分组 root'}).waitFor();assert.equal(await page.getByRole('combobox',{name:'文字高亮方式',exact:true}).inputValue(),'active_word');
 const withoutStroke=await strokeEdit(()=>page.getByRole('checkbox',{name:'高亮文字单独描边',exact:true}).click());
 assert.ok(!withoutStroke.treatments[0].operation.stroke);
 const plain=await api('/dynamic-assets/preview',{definition:withoutStroke,inputs:{},durationSeconds:2,example:{text:'让重点表达更清楚',keyword:'重点'}});
 for(const e of plain.tracks.overlay.flatMap(t=>t.elements).filter(e=>e.type==='text')){assert.notEqual(e.params['text.highlightStrokeEnabled'],true);assert.equal(e.params['geometry.stroke.width'],rendered[0].params['geometry.stroke.width']);}
 await page.getByRole('button',{name:'撤销未保存修改',exact:true}).click();await page.getByRole('spinbutton',{name:'高亮描边宽度',exact:true}).waitFor();
 assert.deepEqual(errors,[]);await archiveTestStyle(base,definition.id);const after=await api('/dynamic-assets');for(const old of before.assets.filter(a=>a.id!==definition.id))assert.deepEqual(after.assets.find(a=>a.id===old.id),old);
 await fs.writeFile(root+'/verification.json',JSON.stringify({passed:true,fixtureId:definition.id,savedRevision:persisted.revision,sharedDisplay:true,bothLayersReflectEdit:true,layerContentTimingMotionUnchanged:true,saveReload:true,sharedClearAndUndo:true,highlightStrokeSaveReload:true,highlightStrokeCompiledOnBothLayers:true,ordinaryStrokePreserved:true,strokeDisableAndUndo:true,mobileNoOverflow:true,fixtureArchived:true,existingLibraryUnchanged:true,pageErrors:errors},null,2));console.log('PASS shared highlight display/edit/save/reload, clear/undo, mobile and archive');
}finally{await browser.close();}
