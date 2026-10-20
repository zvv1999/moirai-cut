import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
const base="http://127.0.0.1:3000/api/footage/templates";
async function api(path,body){const r=await fetch(base+path,{method:body?"POST":"GET",headers:{"content-type":"application/json","x-requested-with":"moirai-footage"},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw new Error(JSON.stringify(d));return d;}
const id="style-pilot-20260923-adaptive";
let asset=(await api("/dynamic-assets")).assets.find(a=>a.id===id);
if(!asset){
  const {definition:d}=await api("/dynamic-assets/create",{name:"重点标记 · 自适应底色",purpose:"keyword",canvas:{width:720,height:720,fps:30}});
  d.id=id;d.provenance="Original editable background-padding pilot; visual assessment required.";
  Object.assign(d.styles[0],{fontSize:82,fill:"#17251F",strokeWidth:0,maxLines:1});
  d.layers.find(l=>l.content.kind==="element").content.element.region={x:0.08,y:0.35,width:0.84,height:0.3};
  asset=(await api("/dynamic-assets",{definition:d,baseRevision:0,idempotencyKey:id})).definition;
}
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE});
try {
  const page=await browser.newPage({viewport:{width:1280,height:950}});
  await page.goto("http://127.0.0.1:3000/templates");
  await page.locator(".tw-dynamic-list button").filter({hasText:asset.name}).click();
  await page.getByRole("checkbox",{name:"文字底色",exact:true}).check();
  await page.getByRole("spinbutton",{name:"横向留白",exact:true}).fill("24");
  await page.getByRole("spinbutton",{name:"纵向留白",exact:true}).fill("12");
  const save=page.getByRole("button",{name:"保存修改",exact:true});
  if(await save.isEnabled()){
    const saved=page.waitForResponse(r=>r.url().endsWith("/dynamic-assets")&&r.request().method()==="POST");
    await save.click();assert.equal((await saved).ok(),true);
  }
  await page.reload();
  await page.locator(".tw-dynamic-list button").filter({hasText:asset.name}).click();
  assert.equal(await page.getByRole("spinbutton",{name:"横向留白",exact:true}).inputValue(),"24");
  assert.equal(await page.getByRole("spinbutton",{name:"纵向留白",exact:true}).inputValue(),"12");
  await page.locator("summary").filter({hasText:/^示例文案$/}).click();
  const widths=[];
  for(const [name,text] of [["short","重点"],["long","真正打动你的地方"]]){
    const previous=await page.locator(".tw-effect-stage").getAttribute("data-preview-generation");
    const response=page.waitForResponse(r=>r.url().endsWith("/dynamic-assets/preview")&&r.request().postDataJSON()?.example?.text===text&&r.request().postDataJSON()?.example?.keyword===text);
    await page.getByRole("textbox",{name:"预览示例句子",exact:true}).fill(text);
    await page.getByRole("textbox",{name:"预览示例重点词",exact:true}).fill(text);
    assert.equal((await response).ok(),true);
    await page.getByRole("slider",{name:"效果预览进度",exact:true}).fill("1");
    await page.waitForFunction(previous=>{const s=document.querySelector(".tw-effect-stage"),c=s?.querySelector("canvas");return s?.dataset.previewGeneration!==previous&&c?.dataset.renderGeneration===s?.dataset.previewGeneration&&Number(c?.dataset.renderTime)===1&&document.querySelector('section[aria-label="效果预览"]')?.getAttribute("aria-busy")==="false";},previous);
    const canvas=page.locator('canvas[aria-label="效果实时画面"]');
    widths.push(await canvas.evaluate(c=>{const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let min=c.width,max=-1;for(let i=0;i<d.length;i+=4)if(d[i]>150&&d[i+1]>180&&d[i+2]<160&&d[i+3]>200){const x=(i/4)%c.width;min=Math.min(min,x);max=Math.max(max,x);}return max-min+1;}));
    await canvas.screenshot({path:`/tmp/adaptive-background-${name}.png`});
  }
  assert.ok(widths[0]>100&&widths[1]>widths[0]*2&&widths[1]<720,JSON.stringify(widths));
  const saved=(await api("/dynamic-assets")).assets.find(a=>a.id===id);
  assert.deepEqual(saved.styles[0].backgroundPadding,{x:24,y:12});
  console.log(JSON.stringify({id,revision:saved.revision,widths,verified:"controls, save/reload, short/long background rendering"}));
}finally{await browser.close();}
