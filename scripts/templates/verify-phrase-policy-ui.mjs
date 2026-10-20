import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000',id='style-study-20260930-checklist-sidebar',inputId='input-80f248b968faad87d3460b76ec8badd1';
const asset=()=>fetch(base+'/api/footage/templates/dynamic-assets/'+id).then(r=>r.json());
const before=await asset(),input=await fetch(base+'/api/footage/templates/inputs/'+inputId).then(r=>r.json());
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/templates/effects/'+id+'/try?revision=1');
 const ready=page.waitForResponse(r=>r.url().endsWith('/sample-preview')&&r.ok()&&r.request().postDataJSON()?.sample?.inputId===inputId);
 await page.locator('label.tp-choice').filter({hasText:input.input.name}).getByRole('checkbox').click();await ready;
 await page.locator('summary').filter({hasText:/^短语排版/}).click();
 await page.getByLabel('同排短语起始词',{exact:true}).selectOption('32');await page.getByLabel('同排短语结束词',{exact:true}).selectOption('34');
 await page.getByRole('button',{name:'设为尽量同排',exact:true}).click();
 await page.getByRole('button',{name:'取消第1组同排短语',exact:true}).waitFor();
 await page.locator('summary').filter({hasText:/^字幕分段/}).click();await page.locator('summary').filter({hasText:/^重新生成分段$/}).click();
 await page.getByLabel('每句字数上限',{exact:true}).fill('42');await page.getByLabel('每句时长上限（秒）',{exact:true}).fill('3.5');await page.getByLabel('停顿分句阈值（秒）',{exact:true}).fill('0.32');
 await page.getByLabel('自动分段保留已标注短语',{exact:true}).check();
 const planned=page.waitForResponse(r=>r.url().endsWith('/plan')&&r.ok()&&r.request().postDataJSON()?.captionPolicy?.preserveLayoutPhrases===true&&r.request().postDataJSON()?.captionSpans?.length===0);
 await page.getByRole('button',{name:'按设置重新分段',exact:true}).click();const response=await planned,request=response.request().postDataJSON(),plan=await response.json();
 assert.deepEqual(request.layoutPhrases,[{wordSpan:{startWord:32,endWord:34}}]);assert.ok(plan.captions.some(c=>c.wordSpan.startWord<=32&&c.wordSpan.endWord>=34));
 await page.getByRole('button',{name:'保存试映内容',exact:true}).click();await page.reload();await page.getByRole('button',{name:'恢复试映内容',exact:true}).click();
 await page.locator('summary').filter({hasText:/^字幕分段/}).click();await page.locator('summary').filter({hasText:/^重新生成分段$/}).click();
 assert.ok(await page.getByLabel('自动分段保留已标注短语',{exact:true}).isChecked());assert.equal(await page.getByLabel('每句字数上限',{exact:true}).inputValue(),'42');
 assert.deepEqual(await asset(),before);assert.deepEqual(errors,[]);
 await fs.writeFile('/Users/zhengwei/Downloads/checklist-side-phrases-20260930/ui-verification.json',JSON.stringify({passed:true,request,captionTexts:plan.captions.map(c=>c.text),restored:true,libraryUnchanged:true,pageErrors:errors},null,2));console.log('PASS phrase annotations, native planning, policy restoration, unchanged library');
}finally{await browser.close();}
