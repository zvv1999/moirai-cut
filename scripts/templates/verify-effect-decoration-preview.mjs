import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:"playwright");
const base=process.env.WORKBENCH_URL??"http://127.0.0.1:3000";
async function api(path,body){const r=await fetch(`${base}/api/footage/templates${path}`,{method:body?"POST":"GET",headers:{"content-type":"application/json","x-requested-with":"moirai-footage"},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;}
const original=await api(`/dynamic-assets/${process.env.TEST_EFFECT_ID}`);
const catalog=(await api("/assets")).assets;
const still=catalog.find(a=>a.name==="图标 · 闪亮强调");
const animated=catalog.find(a=>a.name==="图标 · 庆祝礼花 · 动画预览");
const replacement=catalog.find(a=>a.name==="图标 · 指向箭头");
assert.ok(still&&animated&&replacement,"Required local icon fixtures");
const definition=structuredClone(original.definition);
definition.id=`decoration-preview-${Date.now()}`;definition.revision=0;definition.name="验收 · 图标与动态装饰预览";
let template=original.projection;
for(const [index,asset] of [still,animated].entries()){
  const added=await api("/assets/insert",{template,assetId:asset.id});template=added.template;
  const element=template.elements.find(e=>e.id===added.elementId);
  element.features.avoidProtectedRegions=false;
  element.region={x:index?0.65:0.1,y:0.1,width:0.25,height:0.25};
  element.timing.maxSeconds=2;element.timing.minSeconds=0.1;
  definition.layers.push({parentId:null,content:{kind:"element",element}});
}
definition.resourceSlots=template.resourceSlots;definition.resourceBindings=template.resourceBindings;
const saved=process.env.TEST_DECORATION_ID ? (await api(`/dynamic-assets/${process.env.TEST_DECORATION_ID}`)).definition : (await api("/dynamic-assets",{definition,baseRevision:0,idempotencyKey:definition.id})).definition;
console.log(JSON.stringify({effectId:saved.id}));
const input=await api(`/inputs/${process.env.TEST_INPUT_ID}`);
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
try {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.goto(`${base}/templates`);
  await page.getByRole("button",{name:`${saved.name} v1 · ${saved.layers.length} 层`,exact:true}).click();
  const seek=page.getByRole("slider",{name:"效果预览进度",exact:true});
  await seek.fill("0.6");
  await page.waitForFunction(()=>{
    const c=document.querySelector('canvas[aria-label="效果实时画面"]');if(!c||c.dataset.renderTime!=="0.6")return false;
    const data=c.getContext("2d").getImageData(0,0,c.width,Math.floor(c.height*0.4)).data;
    return data.reduce((n,v,i)=>n+(i%4!==3&&v>80?1:0),0)>3000;
  });
  const hash=()=>{const c=document.querySelector('canvas[aria-label="效果实时画面"]');const p=c.getContext("2d").getImageData(Math.floor(c.width*0.65),0,Math.floor(c.width*0.3),Math.floor(c.height*0.4)).data;return p.reduce((h,v)=>Math.imul(h^v,16777619)>>>0,2166136261);};
  const first=await page.evaluate(hash);
  await seek.fill("1.2");
  await page.waitForFunction(()=>document.querySelector('canvas[aria-label="效果实时画面"]')?.dataset.renderTime==="1.2");
  assert.notEqual(await page.evaluate(hash),first,"video decoration must animate");
  await page.getByRole("region",{name:"效果预览",exact:true}).screenshot({path:"/tmp/effect-decoration-standalone.png"});
  await page.getByRole("link",{name:"试用到视频",exact:true}).click();
  const measured=page.waitForResponse(r=>r.url().endsWith("/sample-preview"));
  await page.getByRole("checkbox",{name:new RegExp(input.input.name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"))}).click();
  const measuredResponse=await measured;assert.ok(measuredResponse.ok(),await measuredResponse.text());
  assert.equal((await measuredResponse.json()).mediaSources.length,2);
  const label=`${saved.name} · ${still.name}`;
  await page.locator(".tp-asset-picker").filter({has:page.getByRole("combobox",{name:label,exact:true,includeHidden:true})}).locator("summary").click();
  const changed=page.waitForResponse(r=>r.url().endsWith("/sample-preview")&&r.request().postDataJSON().sample.resourceBindings.some(b=>b.assetId===replacement.id));
  await page.getByRole("combobox",{name:label,exact:true}).selectOption(replacement.id);
  const changedResponse=await changed;assert.ok(changedResponse.ok(),await changedResponse.text());
  const resolved=await changedResponse.json();
  assert.ok(resolved.mediaSources.some(s=>s.id===replacement.id));assert.ok(!resolved.mediaSources.some(s=>s.id===still.id));
  const reapplied=page.waitForResponse(r=>r.url().endsWith("/sample-preview")&&r.request().postDataJSON().sample.resourceBindings.some(b=>b.assetId===replacement.id));
  await page.getByRole("combobox",{name:"试映效果区域",exact:true}).selectOption("lower");
  const appliedResponse=await reapplied;assert.ok(appliedResponse.ok());
  assert.equal(await page.getByRole("combobox",{name:label,exact:true}).inputValue(),replacement.id);
  await page.getByRole("region",{name:"效果预览",exact:true}).locator('canvas').waitFor();
  await page.waitForFunction(()=>document.querySelector('section[aria-label="效果预览"]')?.getAttribute("aria-busy")==="false");
  await page.waitForFunction(({id,assetId})=>{
    const c=document.querySelector('canvas[aria-label="效果实时画面"]');
    if(c?.dataset.templateId!==id||!c.dataset.mediaIds?.includes(assetId))return false;
    const pixels=c.getContext("2d").getImageData(0,0,c.width,c.height).data;
    let count=0;for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2])>20)count++;
    return count>c.width*c.height*0.2;
  },{id:appliedResponse.request().postDataJSON().template.id,assetId:replacement.id});
  await page.getByRole("region",{name:"效果预览",exact:true}).screenshot({path:"/tmp/effect-decoration-measured.png"});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  assert.deepEqual((await api(`/dynamic-assets/${saved.id}`)).definition,saved);
  assert.deepEqual(await api(`/dynamic-assets/${original.definition.id}`),original);
  console.log(JSON.stringify({effectId:saved.id,passed:["PNG visible","video decoration moving","measured preview resolves both resources","override replaces source","override survives application changes","no mobile overflow","saved effects unchanged"]}));
} finally {await browser.close();}
