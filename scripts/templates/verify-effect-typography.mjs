import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE});
const id="dynamic-ac330f19-affe-4aed-b3c4-a6b63f2c85ae";
const endpoint="http://127.0.0.1:3000/api/footage/templates/dynamic-assets";
try {
  const page=await browser.newPage({viewport:{width:1280,height:950}});
  await page.goto(`http://127.0.0.1:3000/templates?effect=${id}`);
  await page.getByRole("textbox",{name:"效果名称",exact:true}).waitFor();
  await page.getByRole("combobox",{name:"字重",exact:true}).selectOption("800");
  await page.getByRole("checkbox",{name:"斜体",exact:true}).check();
  await page.getByRole("combobox",{name:"文字对齐",exact:true}).selectOption("left");
  await page.getByRole("spinbutton",{name:"行高",exact:true}).fill("1.4");
  await page.getByRole("spinbutton",{name:"最多行数",exact:true}).fill("3");
  await page.getByRole("checkbox",{name:"文字阴影",exact:true}).check();
  await page.getByLabel("阴影颜色",{exact:true}).fill("#ff3377");
  for(const [name,value] of [["阴影不透明度","0.8"],["阴影模糊","9"],["阴影横向偏移","7"],["阴影纵向偏移","5"]]) await page.getByRole("spinbutton",{name,exact:true}).fill(value);
  const save=page.getByRole("button",{name:"保存修改",exact:true});
  if(await save.isEnabled()) {const response=page.waitForResponse(r=>r.url()===endpoint&&r.request().method()==="POST");await save.click();assert.equal((await response).ok(),true);}
  const data=await(await fetch(`${endpoint}/${id}`)).json();
  const layer=data.definition.layers.find(l=>l.content.element?.id==="headline");
  const style=data.definition.styles.find(s=>s.id===layer.content.element.styleId);
  assert.equal(style.weight,800);assert.equal(style.italic,true);assert.equal(style.textAlign,"left");assert.equal(style.lineHeight,1.4);assert.equal(style.maxLines,3);
  assert.deepEqual(style.shadow,{color:"#ff3377",opacity:0.8,blur:9,x:7,y:5});
  await page.reload();await page.getByRole("combobox",{name:"字重",exact:true}).waitFor();
  assert.equal(await page.getByRole("combobox",{name:"字重",exact:true}).inputValue(),"800");
  assert.equal(await page.getByRole("spinbutton",{name:"阴影模糊",exact:true}).inputValue(),"9");
  await page.waitForFunction(()=>{const s=document.querySelector(".tw-effect-stage"),c=s?.querySelector("canvas");return !!c&&c.dataset.renderGeneration===s.dataset.previewGeneration;});
  const canvas=page.locator('canvas[aria-label="效果实时画面"]');
  assert.ok(await canvas.evaluate(c=>{const p=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let pink=0;for(let i=0;i<p.length;i+=4)if(p[i]>40&&p[i]>p[i+1]*1.3&&p[i+2]>p[i+1]*1.1)pink++;return pink>10;}));
  await canvas.screenshot({path:"/tmp/effect-typography-preview.png"});
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  console.log(JSON.stringify({id,revision:data.definition.revision,verified:"typography and shadow controls, persisted native fields, reloaded controls, rendered pink shadow, mobile overflow"}));
} finally {await browser.close();}
