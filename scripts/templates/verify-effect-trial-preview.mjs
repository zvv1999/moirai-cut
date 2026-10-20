import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const base=process.env.WORKBENCH_URL??"http://127.0.0.1:3000";
const asset=await(await fetch(`${base}/api/footage/templates/dynamic-assets/${process.env.TEST_EFFECT_ID}`)).json();
assert.ok(asset.definition);
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
try {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.goto(`${base}/templates/effects/${asset.definition.id}/try?revision=${asset.definition.revision}&scale=1&centerX=0.5&centerY=0.65`);
  const pixels=()=>{
    const canvas=document.querySelector('canvas[aria-label="效果实时画面"]');
    if(!canvas)return null;
    const data=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;
    let count=0,minX=Infinity,maxX=0,minY=Infinity,maxY=0;
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
      const i=(y*canvas.width+x)*4;
      if(data[i+3]>40&&Math.max(data[i],data[i+1],data[i+2])>80){count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
    }
    return {count,width:maxX-minX+1,height:maxY-minY+1,y:(minY+maxY)/2};
  };
  await page.waitForFunction(fn=>{const p=(0,eval)(`(${fn})`)();return p?.count>100;},pixels.toString());
  const original=await page.evaluate(pixels);
  await page.getByRole("slider",{name:"垂直中心",exact:true}).fill("0.82");
  await page.waitForFunction(({fn,y})=>{const p=(0,eval)(`(${fn})`)();return p?.y>y+100;},{fn:pixels.toString(),y:original.y});
  const moved=await page.evaluate(pixels);
  assert.ok(Math.abs(moved.width-original.width)<=2);
  assert.ok(Math.abs(moved.height-original.height)<=2);
  assert.ok(Math.abs(moved.y-original.y-0.17*720)<=2);
  await page.getByRole("slider",{name:"效果大小",exact:true}).fill("0.75");
  await page.waitForFunction(({fn,width})=>{const p=(0,eval)(`(${fn})`)();return p?.count>100&&p.width<width*0.85;},{fn:pixels.toString(),width:moved.width});
  const scaled=await page.evaluate(pixels);
  assert.ok(Math.abs(scaled.y-moved.y)<=4);
  for(const [width,height,label] of [[1280,900,"desktop"],[390,844,"mobile"]]){
    await page.setViewportSize({width,height});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
    await page.getByRole("region",{name:"效果预览",exact:true}).screenshot({path:`/tmp/trial-live-preview-${label}.png`});
  }
  assert.deepEqual(await(await fetch(`${base}/api/footage/templates/dynamic-assets/${asset.definition.id}`)).json(),asset);
  console.log(JSON.stringify({passed:["nonblank shared renderer","movement preserves pixel dimensions","scaling preserves center","desktop/mobile no overflow","saved asset unchanged"],original,moved,scaled}));
} finally {await browser.close();}
