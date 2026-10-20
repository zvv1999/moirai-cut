import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000',root='/Users/zhengwei/Downloads/template-element-picker-2026-09-29';await fs.mkdir(root,{recursive:true});
const read=async()=>{const r=await fetch(base+'/api/footage/templates');assert.ok(r.ok);return r.json();};const before=await read(),template=before.templates.find(t=>t.id==='composition-study-guidance-20260929');assert.ok(template);
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{const p=await browser.newPage({viewport:{width:390,height:844}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/templates/compositions?template='+template.id);await p.getByRole('textbox',{name:'模板名称',exact:true}).waitFor();await p.getByRole('navigation',{name:'工作视图'}).getByRole('button',{name:'编辑模板',exact:true}).click();
 await p.getByRole('button',{name:'编辑所选元素',exact:true}).click();assert.equal(await p.evaluate(()=>document.activeElement?.textContent),'元素属性');
 const picker=p.getByRole('combobox',{name:'当前模板元素',exact:true});assert.ok(await picker.isVisible());assert.equal(await picker.locator('option').count(),template.elements.length);
 const box=await picker.boundingBox();assert.ok(box.y>=0&&box.y+box.height<844,'picker reached without traversing layer list');
 for(const e of template.elements){await picker.selectOption(e.id);assert.equal(await p.getByRole('textbox',{name:'元素名称',exact:true}).inputValue(),e.description);assert.equal(await p.getByLabel('内容绑定',{exact:true}).inputValue(),e.binding);}
 await picker.selectOption('headline');const description=p.getByRole('textbox',{name:'元素名称',exact:true});const original=await description.inputValue();await description.fill(original+' 未保存验证');await picker.selectOption('page-heading');await picker.selectOption('headline');assert.equal(await description.inputValue(),original+' 未保存验证');await p.getByText('未保存',{exact:true}).waitFor();
 await picker.scrollIntoViewIfNeeded();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:root+'/mobile.png'});
 await p.setViewportSize({width:1440,height:1000});await p.getByRole('button',{name:'编辑所选元素',exact:true}).click();await p.screenshot({path:root+'/desktop.png'});
 assert.deepEqual(await read(),before);assert.deepEqual(errors,[]);await fs.writeFile(root+'/verification.json',JSON.stringify({templateId:template.id,revision:template.revision,selectableElements:template.elements.length,mobileJumpAndFocus:true,unsavedDraftRetained:true,mobileNoOverflow:true,libraryUnchanged:true,pageErrors:errors},null,2));console.log('PASS mobile jump/focus, all element choices, unsaved state and desktop; library unchanged');
}finally{await browser.close();}
