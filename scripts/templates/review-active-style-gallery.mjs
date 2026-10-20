import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000',root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/active-style-gallery-2026-09-28';
await fs.mkdir(root,{recursive:true});
const data=await(await fetch(base+'/api/footage/templates/dynamic-assets')).json();
const assets=data.assets.filter(a=>(!process.env.STYLE_ID||process.env.STYLE_ID.split(",").includes(a.id))&&/^(style-|live-)/.test(a.id)&&!data.library.some(r=>r.assetId===a.id&&r.archived));
assert.ok(assets.length,'No active styles matched the requested gallery');
const eventFraction=process.env.PREVIEW_EVENT_FRACTION===undefined?null:Number(process.env.PREVIEW_EVENT_FRACTION);
assert.ok(eventFraction===null||(Number.isFinite(eventFraction)&&eventFraction>0&&eventFraction<1),'PREVIEW_EVENT_FRACTION must be between zero and one');
const sampleTimes=process.env.PREVIEW_TIMES?JSON.parse(process.env.PREVIEW_TIMES):[0.5,0.7];
const layoutPhrases=JSON.parse(process.env.EXAMPLE_LAYOUT_PHRASES??'[]');
assert.ok(Array.isArray(layoutPhrases)&&(!layoutPhrases.length||process.env.EXAMPLE_TEXT),'Phrase hints require explicit example text');
assert.ok(Array.isArray(sampleTimes)&&sampleTimes.length&&sampleTimes.every(t=>typeof t==='number'&&Number.isFinite(t)&&t>=0),'PREVIEW_TIMES must be a nonempty array of nonnegative seconds');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const results=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}});
 for(const [index,asset] of assets.entries()){
  const initialResponse=page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/preview')&&r.ok()&&r.request().postDataJSON()?.definition?.id===asset.id);
  await page.goto(base+'/templates?effect='+asset.id);
  const initialPreview=await(await initialResponse).json();
  await page.waitForFunction(()=>document.querySelector('.tw-effect-preview')?.getAttribute('aria-busy')==='false');
  let selectedPreview;
  if(process.env.EXAMPLE_TEXT){
   const expected=page.waitForResponse(r=>r.url().endsWith("/dynamic-assets/preview")&&r.ok()&&r.request().postDataJSON()?.example?.text===process.env.EXAMPLE_TEXT&&r.request().postDataJSON()?.example?.keyword===(process.env.EXAMPLE_KEYWORD??process.env.EXAMPLE_TEXT));
   await page.locator('.tw-preview-example summary').click();
   await page.getByLabel('预览示例句子',{exact:true}).fill(process.env.EXAMPLE_TEXT);
   await page.getByLabel('预览示例重点词',{exact:true}).fill(process.env.EXAMPLE_KEYWORD??process.env.EXAMPLE_TEXT);
   selectedPreview=await (await expected).json();
   await page.waitForFunction(()=>document.querySelector('.tw-effect-preview')?.getAttribute('aria-busy')==='false');
   for(const [index,phrase] of layoutPhrases.entries()){
    await page.getByLabel('预览同排起始词',{exact:true}).selectOption(String(phrase.wordSpan.startWord));
    await page.getByLabel('预览同排结束词',{exact:true}).selectOption(String(phrase.wordSpan.endWord));
    const pending=page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/preview')&&r.ok()&&JSON.stringify(r.request().postDataJSON()?.example?.layoutPhrases)===JSON.stringify(layoutPhrases.slice(0,index+1)));
    await page.getByRole('button',{name:'预览同排',exact:true}).click();selectedPreview=await(await pending).json();
    await page.waitForFunction(()=>document.querySelector('.tw-effect-preview')?.getAttribute('aria-busy')==='false');
   }
  }
  const preview=selectedPreview??initialPreview;
  assert.ok(preview?.tracks,'No native preview evidence captured');
  await fs.writeFile(`${root}/${index}-preview.json`,JSON.stringify(preview,null,2));
  const events=preview.tracks.overlay.flatMap(track=>track.elements.map(element=>({elementId:element.params?.['template.elementId'],start:element.startTime/120000,duration:element.duration/120000})));
  const event=events.filter(e=>e.duration>0).sort((a,b)=>a.start-b.start)[0];
  assert.ok(eventFraction===null||event,'No visible events to sample');
  const times=eventFraction===null?sampleTimes:[Number((event.start+event.duration*eventFraction).toFixed(2))];
  const slider=page.getByRole('slider',{name:'效果预览进度',exact:true});
  const maxTime=Number(await slider.getAttribute('max'));
  for(const time of times){
   assert.ok(time+0.01<=maxTime,'Requested preview sample exceeds the slider duration');
   await slider.fill(String(Number((time+0.01).toFixed(2))));await slider.fill(String(Number(time.toFixed(2))));
   await page.waitForFunction(time=>{const s=document.querySelector('.tw-effect-stage'),c=s?.querySelector('canvas');return c&&c.dataset.renderGeneration===s.dataset.previewGeneration&&Math.abs(Number(c.dataset.renderTime)-time)<0.001;},time);
   if(eventFraction!==null) assert.ok(await page.locator('.tw-effect-stage canvas').evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4!==3&&v>8)),'Event sample is blank');
   const image=await page.locator('.tw-effect-stage canvas').evaluate(c=>c.toDataURL());await fs.writeFile(`${root}/${index}-${time}.png`,Buffer.from(image.split(',')[1],'base64'));
  }
  results.push({sampleTimes:times,index,id:asset.id,revision:asset.revision,name:asset.name,purposes:asset.purposes,events});
 }
 assert.deepEqual(await(await fetch(base+'/api/footage/templates/dynamic-assets')).json(),data);
 await fs.writeFile(root+'/manifest.json',JSON.stringify({sampleTimes,eventFraction,exampleText:process.env.EXAMPLE_TEXT,exampleKeyword:process.env.EXAMPLE_KEYWORD??process.env.EXAMPLE_TEXT,layoutPhrases,results,note:'Synthetic sample text; not source-footage or aesthetic acceptance.'},null,2));
 console.log(JSON.stringify({styles:results.length,root}));
}finally{await browser.close();}
