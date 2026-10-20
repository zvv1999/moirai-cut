import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000';
async function read(path){const r=await fetch(base+'/api/footage/templates'+path);assert.ok(r.ok);return r.json();}
const before=await read('/dynamic-assets/reviews'),library=await read('/dynamic-assets');
const schema=await read('/dynamic-assets/schema');assert.ok(schema.qualityReview);assert.equal(schema.qualityReviewCapabilities.scope,'saved_style_revision_and_exact_application');
const asset=library.assets.find(a=>a.id==='style-study-20260928-cyan-impact');assert.ok(asset);
const batch='production-b6266fe3ea53b6e9665a87bfa17c008c';
const item=await read('/production/'+batch+'/items/0');
const criterion={score:0,rationale:'Rejection fixture, not an aesthetic review'};
const response=await fetch(base+'/api/footage/templates/dynamic-assets/reviews',{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify({application:{assetId:asset.id,assetRevision:asset.revision,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:0.95,centerX:0.5,centerY:0.70}},review:{templateId:item.templateId,templateRevision:item.templateRevision,batchId:batch,item:0,reviewer:'rejection test',composition:criterion,motion:criterion,assets:criterion,adaptation:criterion,editability:criterion,evidence:item.previews.map(p=>({fixture:p.fixture,sha256:p.sha256})),inspection:'No visual review submitted',limitations:'Test must reject: batch contains a separate caption asset',blockingFindings:['Unrelated composition'],listened:false}})});
assert.equal(response.status,400);assert.match(await response.text(),/differs from the saved style application/);
assert.deepEqual(await read('/dynamic-assets/reviews'),before);
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/templates?effect='+asset.id);
 const summary=page.locator('.tw-style-reviews summary');await summary.filter({hasText:'待评审'}).waitFor();await summary.click();
 await page.getByText('当前版本尚无有效评审。',{exact:false}).waitFor();
 await page.getByLabel('效果名称',{exact:true}).fill('尚未保存');
 await page.getByText('当前有未保存修改。评审仅对应其标注的已保存版本',{exact:false}).waitFor();
 await page.getByRole('button',{name:'撤销未保存修改',exact:true}).click();
 assert.deepEqual(errors,[]);assert.deepEqual(await read('/dynamic-assets'),library);
 console.log('schema exposed; unrelated real production rejected without writes; UI pending state and unsaved warning verified');
} finally {await browser.close();}
