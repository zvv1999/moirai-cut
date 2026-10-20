import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:"playwright");
const base=process.env.WORKBENCH_URL??"http://127.0.0.1:3000";
const read=async path=>{const r=await fetch(`${base}/api/footage/templates${path}`);assert.ok(r.ok);return r.json();};
const asset=await read(`/dynamic-assets/${process.env.TEST_EFFECT_ID}`);
const input=await read(`/inputs/${process.env.TEST_INPUT_ID}`);
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
try {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.goto(`${base}/templates/effects/${asset.definition.id}/try?revision=${asset.definition.revision}&scale=0.85&centerX=0.5&centerY=0.82`);
  const choice=page.getByRole("checkbox",{name:new RegExp(input.input.name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"))});
  const compiled=page.waitForResponse(response=>response.url().endsWith("/sample-preview"));
  await choice.click();
  const response=await compiled;
  assert.ok(response.ok(),await response.text());
  const result=await response.json();
  assert.equal(result.timingSource,"measured_transcript");
  assert.equal(response.request().postDataJSON().sample.transcriptRevision,input.transcript.revision);
  assert.ok(result.tracks.main.elements.length>0);
  await page.waitForFunction(()=>{
    const c=document.querySelector('canvas[aria-label="效果实时画面"]');
    if(!c)return false;
    const pixels=c.getContext("2d").getImageData(0,0,c.width,c.height).data;
    let colored=0;for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2])>20)colored++;
    return colored>c.width*c.height*0.2;
  });
  const seek=page.getByRole("slider",{name:"效果预览进度",exact:true});
  await seek.fill("1.1");
  await page.waitForFunction(()=>document.querySelector('canvas[aria-label="效果实时画面"]')?.dataset.renderTime==="1.1");
  const canvas=page.locator('canvas[aria-label="效果实时画面"]');
  await canvas.screenshot({path:"/tmp/effect-live-media-frame.png"});
  await page.getByRole("button",{name:"播放效果",exact:true}).click();
  await page.waitForFunction(()=>{
    const audio=document.querySelector('.tw-effect-preview audio');
    const c=document.querySelector('canvas[aria-label="效果实时画面"]');
    return audio&&!audio.paused&&audio.currentTime>1.6&&Math.abs(audio.currentTime-Number(c?.dataset.renderTime))<0.35;
  });
  await page.getByRole("button",{name:"暂停效果",exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.tw-effect-preview audio')?.paused);
  await seek.fill("5.6");
  await page.waitForFunction(()=>document.querySelector('canvas[aria-label="效果实时画面"]')?.dataset.renderTime==="5.6");
  await canvas.screenshot({path:"/tmp/effect-live-media-later.png"});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  await page.getByRole("region",{name:"效果预览",exact:true}).screenshot({path:"/tmp/effect-live-media-mobile.png"});
  if(process.env.TEST_SECOND_INPUT_ID){
    const second=await read(`/inputs/${process.env.TEST_SECOND_INPUT_ID}`);
    const secondChoice=page.getByRole("checkbox",{name:new RegExp(second.input.name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"))});
    await secondChoice.click();
    const previewButton=page.getByRole("button",{name:`预览 ${second.input.name}`,exact:true});
    await previewButton.waitFor();
    let changed=page.waitForResponse(response=>response.url().endsWith("/sample-preview")&&response.request().postDataJSON().sample.inputId===second.input.id);
    await previewButton.click();
    assert.ok((await changed).ok());
    await page.waitForFunction(id=>document.querySelector('.tw-effect-preview audio')?.src.includes(id),second.input.id);
    changed=page.waitForResponse(response=>response.url().endsWith("/sample-preview")&&response.request().postDataJSON().sample.inputId===input.input.id);
    await page.getByRole("button",{name:`预览 ${input.input.name}`,exact:true}).click();
    assert.ok((await changed).ok());
    await page.waitForFunction(id=>document.querySelector('.tw-effect-preview audio')?.src.includes(id),input.input.id);
    await secondChoice.click();
    assert.deepEqual(await read(`/inputs/${second.input.id}`),second);
  }
  await choice.click();
  await page.waitForFunction(()=>!document.querySelector('.tw-effect-preview audio'));
  if(process.env.CHECK_AUDIO_FAILURE==="1") {
    await page.route(`**/templates/inputs/${input.input.id}/media/audio`,route=>route.abort());
    await choice.click();
    await page.getByText("无法读取原声预览",{exact:true}).waitFor();
    await seek.fill("0.8");
    await page.waitForFunction(()=>document.querySelector('canvas[aria-label="效果实时画面"]')?.dataset.renderTime==="0.8");
    assert.equal(await page.getByText("无法读取原声预览",{exact:true}).isVisible(),true);
  }
  assert.deepEqual(await read(`/dynamic-assets/${asset.definition.id}`),asset);
  assert.deepEqual(await read(`/inputs/${input.input.id}`),input);
  console.log(JSON.stringify({passed:["measured transcript revision","real video pixels","source audio advances with canvas clock","pause and seek","mobile no overflow","deselection removes audio","effect and input unchanged"]}));
} catch(error) {
  const page=browser.contexts()[0]?.pages()[0];
  if(page){await page.screenshot({path:"/tmp/effect-live-media-error.png"});console.error(await page.locator('[role="alert"]').allTextContents());console.error(await page.locator('canvas').evaluateAll(cs=>cs.map(c=>({width:c.width,height:c.height,time:c.dataset.renderTime}))));}
  console.error(error);
  throw error;
} finally {await browser.close();}
