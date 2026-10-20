import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {chromium} from "/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
const base="http://127.0.0.1:3000";
async function api(path,body){const r=await fetch(`${base}/api/footage/templates${path}`,{method:body?"POST":"GET",headers:{"content-type":"application/json","x-requested-with":"moirai-footage"},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(JSON.stringify(data));return data;}
const id="text-attachment-validation-20260928";
const current=(await api("/dynamic-assets")).assets.find(a=>a.id===id);
const {definition:d}=await api("/dynamic-assets/create",{name:"文字边界依附 · 验证样例",purpose:"keyword",canvas:{width:720,height:720,fps:30}});
d.id=id;d.revision=current?.revision??0;
const parent=d.layers.find(l=>l.content.kind==="element").content.element;
parent.region={x:0.2,y:0.4,width:0.5,height:0.2};parent.motions=[];parent.motionTiming=null;
Object.assign(d.styles[0],{fontSize:60,maxLines:1,fill:"#FFFFFF",strokeWidth:0,shadow:null,background:"#00FF00",backgroundPadding:{x:10,y:8}});
const child=structuredClone(parent);
Object.assign(child,{id:"badge",description:"间距验证图标",styleId:"badge-style",region:{x:0.7,y:0.4,width:0.04,height:0.04},z:parent.z+1});
child.features.representation="rectangle";child.features.outline=false;
d.styles.push({...structuredClone(d.styles[0]),id:"badge-style",fill:"#FF0000",background:null,backgroundPadding:null});
d.layers.push({parentId:"root",content:{kind:"element",element:child}});
d.spatialRelations=[{elementId:"badge",relativeTo:parent.id,placement:"right",gap:0.02,offsetX:0,offsetY:0,followMotion:true,referenceBounds:"text_box"}];
const normalized=(await api("/dynamic-assets/inspect",d)).definition;
const fingerprint=createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
await api("/dynamic-assets",{definition:normalized,baseRevision:d.revision,idempotencyKey:`text-bound-${fingerprint}`});
const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
try {
  const page=await browser.newPage();await page.goto(`${base}/templates?effect=${id}`);
  await page.getByText("示例文案",{exact:true}).click();
  const results=[];
  for(const text of ["重点","真正打动你的地方"]) {
    const response=page.waitForResponse(r=>r.url().endsWith("/dynamic-assets/preview")&&r.request().postDataJSON()?.example?.text===text&&r.request().postDataJSON()?.example?.keyword===text);
    await page.getByRole("textbox",{name:"预览示例句子",exact:true}).fill(text);
    await page.getByRole("textbox",{name:"预览示例重点词",exact:true}).fill(text);
    const r=await response;assert.equal(r.ok(),true);const compiled=await r.json();
    const clips=compiled.tracks.overlay.flatMap(t=>t.elements),badge=clips.find(e=>e.params["template.elementId"]==="badge");
    assert.ok(badge.textAttachment);assert.deepEqual(badge.textAttachment.anchor,[1,0.5]);
    await page.waitForFunction(()=>{const s=document.querySelector(".tw-effect-stage"),c=s?.querySelector("canvas");return c&&c.dataset.renderGeneration===s.dataset.previewGeneration&&getComputedStyle(c).visibility==="visible";}).catch(async error=>{console.error(await page.locator('section[aria-label="效果预览"]').innerText());throw error;});
    const pixels=await page.locator('canvas[aria-label="效果实时画面"]').evaluate(c=>{
      const p=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let greenRight=-1,redLeft=c.width;
      for(let i=0;i<p.length;i+=4){const x=(i/4)%c.width;if(p[i+1]>200&&p[i]<30&&p[i+2]<30)greenRight=Math.max(greenRight,x);if(p[i]>200&&p[i+1]<30&&p[i+2]<30)redLeft=Math.min(redLeft,x);}
      return {greenRight,redLeft,gap:redLeft-greenRight-1,width:c.width};
    });
    assert.ok(pixels.greenRight>=0&&pixels.redLeft<pixels.width,JSON.stringify(pixels));
    assert.ok(Math.abs(pixels.gap-14.4)<=2,JSON.stringify({text,...pixels}));
    await page.locator('canvas[aria-label="效果实时画面"]').screenshot({path:`/tmp/text-bound-${results.length}.png`});results.push({text,...pixels});
  }
  assert.notEqual(results[0].redLeft,results[1].redLeft);
  console.log(JSON.stringify({id,results}));
}finally{await browser.close();}
