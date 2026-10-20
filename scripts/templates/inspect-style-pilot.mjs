import fs from "node:fs/promises";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root=process.env.PILOT_OUTPUT??"/Users/zhengwei/Downloads/effect-style-pilot-2026-09-23";
const effects=JSON.parse(await fs.readFile(`${root}/effects.json`,"utf8"));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE});
try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  for(const effect of effects){
    await page.goto("http://127.0.0.1:3000/templates");
    await page.getByRole("searchbox",{name:"搜索效果素材",exact:true}).fill(effect.name);
    await page.locator(".tw-dynamic-list button").filter({hasText:effect.name}).click();
    await page.locator("summary").filter({hasText:/^示例文案$/}).click();
    for(const [name,text,keyword] of [["short","让重点表达更清楚","重点"],["long","每天留出十分钟，记住真正打动你的地方","真正打动你的地方"]]){
      const previous=await page.locator(".tw-effect-stage").getAttribute("data-preview-generation");
      const response=page.waitForResponse(r=>{
        if(!r.url().endsWith("/dynamic-assets/preview")||r.request().method()!=="POST")return false;
        const body=r.request().postDataJSON();return body.definition.id===effect.id&&body.example.text===text&&body.example.keyword===keyword;
      });
      // Trigger a new request even when the first example matches the defaults.
      await page.getByRole("textbox",{name:"预览示例句子",exact:true}).fill(`${text} `);
      await page.getByRole("textbox",{name:"预览示例句子",exact:true}).fill(text);
      await page.getByRole("textbox",{name:"预览示例重点词",exact:true}).fill(keyword);
      const result=await (await response).json();
      const words=result.example.words;
      const begin=text.indexOf(keyword),end=begin+keyword.length;
      let offset=0;const selected=words.filter(w=>{const start=offset;offset+=w.text.length;return start>=begin&&start<end;});
      assert.ok(selected.length>0);
      const time=Number(((selected[0].start+selected.at(-1).end)/2).toFixed(2));
      const seek=page.getByRole("slider",{name:"效果预览进度",exact:true});await seek.fill(String(time));
      await page.waitForFunction(({previous,time})=>{
        const s=document.querySelector(".tw-effect-stage"),c=s?.querySelector("canvas");
        return s?.dataset.previewGeneration!==previous&&document.querySelector('section[aria-label="效果预览"]')?.getAttribute("aria-busy")==="false"&&c?.dataset.renderGeneration===s?.dataset.previewGeneration&&Number(c?.dataset.renderTime)===time;
      },{previous,time});
      const canvas=page.locator('canvas[aria-label="效果实时画面"]');
      await canvas.screenshot({path:`${root}/${effect.id}-${name}.png`});
      const stats=await canvas.evaluate(c=>{
        const p=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let count=0,minX=c.width,maxX=0,minY=c.height,maxY=0;
        for(let i=0;i<p.length;i+=4){if(Math.max(p[i],p[i+1],p[i+2])>80){const x=(i/4)%c.width,y=Math.floor(i/4/c.width);count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}
        return {count,minX,maxX,minY,maxY,width:c.width,height:c.height};
      });
      assert.ok(stats.count>100,JSON.stringify({effect:effect.id,name,stats}));
      console.log(JSON.stringify({effect:effect.id,name,stats}));
    }
  }
}finally{await browser.close();}
