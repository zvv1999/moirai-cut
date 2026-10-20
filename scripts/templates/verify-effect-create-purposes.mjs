import assert from "node:assert/strict";
import {randomUUID} from 'node:crypto';
import {archiveTestStyle} from './archive-test-style.mjs';
import {pathToFileURL} from "node:url";
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base=process.env.WORKBENCH_URL??"http://127.0.0.1:3000";
async function api(path){const r=await fetch(`${base}/api/footage/templates${path}`);assert.ok(r.ok);return r.json();}
const original=(await api("/dynamic-assets")).assets;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE});
const created=[];
try {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.goto(`${base}/templates`);
  await page.getByRole('textbox',{name:'效果名称',exact:true}).waitFor();
  for(const [purpose,binding,anchor] of [["decorative_text","literal","video_start"],["keyword","keyword","keyword_start"],["caption","sentence","cue_start"]]) {
    const name=`验收 · 新建用途 · ${purpose} ${randomUUID()}`;
    let definition=original.find(asset=>asset.name===name);
    if(!definition){
      const label={decorative_text:"花字",keyword:"重点词",caption:"动态字幕"}[purpose];
      await page.getByRole("group",{name:"筛选样式用途"}).getByRole("button",{name:label,exact:true}).click();
      assert.equal(await page.getByRole("combobox",{name:"新建样式用途",exact:true}).inputValue(),purpose);
      const [draft,saved]=await Promise.all([
        page.waitForResponse(r=>r.url().endsWith("/dynamic-assets/create")),
        page.waitForResponse(r=>r.url().endsWith("/dynamic-assets")&&r.request().method()==="POST"),
        page.getByRole("button",{name:`新建${label}`,exact:true}).click(),
      ]).catch(async error=>{console.error(await page.locator('[role="alert"]').allTextContents());throw error;});
      assert.ok(draft.ok(),await draft.text());
      assert.equal(draft.request().postDataJSON().purpose,purpose);
      assert.ok(saved.ok());definition=(await saved.json()).definition;
      created.push(definition.id);
      assert.equal(await page.getByRole("group",{name:"筛选样式用途"}).getByRole("button",{name:label,exact:true}).getAttribute("aria-pressed"),"true");
      await page.getByRole("textbox",{name:"效果名称",exact:true}).fill(name);
      await page.getByRole("searchbox",{name:"搜索效果素材",exact:true}).fill("missing-style-qa-query");
      await page.getByRole("status").filter({hasText:"没有匹配的样式"}).waitFor();
      assert.equal(await page.getByRole("textbox",{name:"效果名称",exact:true}).inputValue(),name);
      const renamed=page.waitForResponse(r=>r.url().endsWith("/dynamic-assets")&&r.request().method()==="POST");
      await page.getByRole("button",{name:"保存修改",exact:true}).click();const renamedResponse=await renamed;assert.ok(renamedResponse.ok());definition=(await renamedResponse.json()).definition;
    }
    await page.getByRole("searchbox",{name:"搜索效果素材",exact:true}).fill(name);
    assert.equal(await page.locator(".tw-dynamic-results .tw-style-open").count(),1);
    await page.locator('.tw-dynamic-results .tw-style-open').filter({hasText:name}).click();
    const element=definition.layers.find(l=>l.content.kind==="element").content.element;
    assert.equal(element.binding,binding);assert.equal(element.timing.anchor,anchor);assert.ok(element.motionTiming);
    await page.getByRole("navigation",{name:"属性快捷定位"}).getByRole("button",{name:"应用规则",exact:true}).click();
    assert.equal(await page.getByRole("combobox",{name:"文字内容来源",exact:true}).inputValue(),binding);
    await page.getByRole("navigation",{name:"属性快捷定位"}).getByRole("button",{name:"外观",exact:true}).click();
    if(purpose==="caption")assert.equal(await page.getByRole("combobox",{name:"文字高亮方式",exact:true}).inputValue(),"active_word");
    await page.waitForFunction(()=>document.querySelector('section[aria-label="效果预览"]')?.getAttribute('aria-busy')==='false');
    await page.getByRole("slider",{name:"效果预览进度",exact:true}).fill("0.51");
    await page.getByRole("slider",{name:"效果预览进度",exact:true}).fill("0.5");
    await page.waitForFunction(()=>{
      const s=document.querySelector(".tw-effect-stage"),c=s?.querySelector("canvas");
      return c?.dataset.renderGeneration===s?.dataset.previewGeneration&&c?.dataset.renderTime==="0.5"&&c.getContext("2d").getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4!==3&&v>80);
    }).catch(async error=>{console.error(await page.evaluate(()=>({stage:document.querySelector('.tw-effect-stage')?.dataset,canvas:document.querySelector('.tw-effect-stage canvas')?.dataset,errors:[...document.querySelectorAll('[role="alert"]')].map(e=>e.textContent)})));throw error;});
    await page.getByRole("region",{name:"效果预览",exact:true}).screenshot({path:`/tmp/effect-create-${purpose}.png`});
  }
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  await page.screenshot({path:"/tmp/effect-create-mobile.png",fullPage:true});
  const after=(await api("/dynamic-assets")).assets;
  for(const asset of original)assert.deepEqual(after.find(current=>current.id===asset.id),asset);
  for(const id of created)await archiveTestStyle(base,id);
  console.log(JSON.stringify({created,passed:["three purpose entry points","native bindings and event anchors","editable entrance and exit","caption active-word mode","search and no results","search retains unsaved name","save after filtering","nonblank rendered previews","mobile overflow","existing assets unchanged"]}));
}finally{await browser.close();}
