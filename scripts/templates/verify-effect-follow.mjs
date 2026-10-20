import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
const base="http://127.0.0.1:3000/api/footage/templates";
async function api(path,body){const r=await fetch(base+path,{method:body?"POST":"GET",headers:{"content-type":"application/json","x-requested-with":"moirai-footage"},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw new Error(JSON.stringify(d));return d;}
const id="effect-follow-validation-20260923";
let asset=(await api("/dynamic-assets")).assets.find(a=>a.id===id);
if(!asset){
  const {definition:d}=await api("/dynamic-assets/create",{name:"验收 · 独立装饰跟随",purpose:"decorative_text",canvas:{width:720,height:720,fps:30}});
  d.id=id;const main=d.layers.find(l=>l.content.kind==="element").content.element;
  const child=structuredClone(main);Object.assign(child,{id:"badge",description:"跟随装饰",styleId:"badge-style",region:{x:0.4,y:0.2,width:0.08,height:0.08},motions:[],motionTiming:null});child.features.representation="rectangle";
  d.styles.push({...structuredClone(d.styles[0]),id:"badge-style",fill:"#DDFC74",strokeWidth:0});
  d.layers.push({parentId:"root",content:{kind:"element",element:child}});
  asset=(await api("/dynamic-assets",{definition:d,baseRevision:0,idempotencyKey:id})).definition;
}
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE});
try{
  const page=await browser.newPage({viewport:{width:1280,height:950}});
  async function select(){await page.goto("http://127.0.0.1:3000/templates");await page.locator(".tw-dynamic-list button").filter({hasText:asset.name}).click();await page.locator(".tw-layer-select").filter({hasText:"跟随装饰"}).click();await page.locator("summary").filter({hasText:/^相对摆放$/}).click();}
  await select();
  await page.getByRole("combobox",{name:"摆放参照图层",exact:true}).selectOption("headline");
  await page.getByRole("combobox",{name:"相对摆放方向",exact:true}).selectOption("above");
  const response=page.waitForResponse(r=>r.url().endsWith("/dynamic-assets/layers")&&r.request().postDataJSON()?.operation?.kind==="spatial_relation");
  await page.getByRole("button",{name:"建立跟随关系",exact:true}).click();assert.equal((await response).ok(),true);
  const save=page.getByRole("button",{name:"保存修改",exact:true});
  if(await save.isEnabled()){
    const saved=page.waitForResponse(r=>r.url().endsWith("/dynamic-assets")&&r.request().method()==="POST");
    await save.click();assert.equal((await saved).ok(),true);
  }
  await select();assert.equal(await page.getByRole("checkbox",{name:"跟随位移、缩放与旋转",exact:true}).isChecked(),true);
  assert.equal(await page.getByRole("combobox",{name:"相对摆放方向",exact:true}).inputValue(),"above");
  const counts=[];
  for(const time of [0.04,0.5]){
    await page.getByRole("slider",{name:"效果预览进度",exact:true}).fill(String(time));
    await page.waitForFunction(time=>{const s=document.querySelector(".tw-effect-stage"),c=s?.querySelector("canvas");return c?.dataset.renderGeneration===s?.dataset.previewGeneration&&Number(c?.dataset.renderTime)===time&&document.querySelector('section[aria-label="效果预览"]')?.getAttribute("aria-busy")==="false";},time);
    const canvas=page.locator('canvas[aria-label="效果实时画面"]');
    counts.push(await canvas.evaluate(c=>{const p=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let count=0;for(let i=0;i<p.length;i+=4)if(p[i]>160&&p[i+1]>190&&p[i+2]<150)count++;return count;}));
    await canvas.screenshot({path:`/tmp/effect-follow-${time}.png`});
  }
  assert.ok(counts.every(n=>n>20)&&counts[0]!==counts[1],JSON.stringify(counts));
  asset=(await api("/dynamic-assets")).assets.find(a=>a.id===id);
  const application=(await api("/dynamic-assets/application",{assetId:id,assetRevision:asset.revision,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1}})).template;
  const inserted=(await api("/dynamic-assets/insert",{assetId:id,assetRevision:asset.revision,instanceId:"copy",template:application,placement:{x:0,y:0,width:1,height:1}})).template;
  assert.ok(inserted.composition.spatialRelations.some(r=>r.elementId==="copy--badge"&&r.relativeTo==="copy--headline"));
  const preview=await api("/dynamic-assets/preview",{definition:asset,durationSeconds:2});
  const clips=preview.tracks.overlay.flatMap(t=>t.elements);
  assert.ok(clips.find(e=>e.params["template.elementId"]==="badge").params["template.attachedTo"]);
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  await page.screenshot({path:"/tmp/effect-follow-mobile.png",fullPage:true});
  console.log(JSON.stringify({id,revision:asset.revision,counts,verified:"relation controls, persistence, animated decoration, namespaced insertion, compiled attachment"}));
}finally{await browser.close();}
