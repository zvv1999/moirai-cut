import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const source='/Users/zhengwei/OpenCutProjects/tpl-preview-2d466bfe496c625b8d07e7c83da9bf67-0-1/project.json';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const report=[];
try {
 for(const scenario of [{offset:0},{offset:80},{offset:40,rotate:30,scaleX:1.3,scaleY:0.8},{offset:40,rotate:30,scaleX:1.3,scaleY:0.8,child:true}]) {
  const {offset}=scenario;
  const d=JSON.parse(await readFile(source,'utf8')),id='tpl-preview-group-check-'+randomUUID(),dir='/Users/zhengwei/OpenCutProjects/'+id;
  await mkdir(dir);Object.assign(d.metadata,{id,name:'跨组依附 · 坐标诊断'});d.revision=0;
  const scene=d.scenes[0];scene.id=id+'-scene';d.currentSceneId=scene.id;scene.tracks.audio=[];
  const parentTrack=scene.tracks.overlay.find(t=>t.type==='text'),childTrack=scene.tracks.overlay.find(t=>t.type==='graphic');
  parentTrack.elements=parentTrack.elements.slice(0,1);childTrack.elements=childTrack.elements.slice(0,1);
  parentTrack.elements[0].params.content='重点';
  const groupId='parent-group';childTrack.elements[0].textAttachment.parent.groupPath=[groupId];
  const group={id:groupId,type:'graphic',definitionId:'rectangle',name:'文字组',startTime:0,duration:240000,trimStart:0,trimEnd:0,params:{'transform.positionX':offset,'transform.scaleX':scenario.scaleX??1,'transform.scaleY':scenario.scaleY??1,'transform.rotate':scenario.rotate??0,opacity:1},renderGroup:{timeOrigin:0,tracks:[parentTrack]}};
  scene.tracks.overlay=[scenario.child?{id:'child-group-track',type:'graphic',elements:[{...structuredClone(group),id:'child-group',params:{'transform.positionX':-30,'transform.positionY':10,'transform.rotate':-25,'transform.scaleX':0.9,'transform.scaleY':1.2,opacity:1},renderGroup:{timeOrigin:0,tracks:[childTrack]}}]}:childTrack,{id:'group-track',type:'graphic',elements:[group]}];
  await writeFile(dir+'/project.json',JSON.stringify(d));
  const page=await browser.newPage();await page.addInitScript(()=>localStorage.setItem('hasSeenAgentOnboardingV2','true'));
  await page.goto('http://127.0.0.1:3000/editor/'+id);await page.waitForFunction(()=>window.__opencutAgent?.getState().ok,{},{timeout:60000});
  const r=await page.evaluate(()=>window.__opencutAgent.renderFrames({atSeconds:[1]}));assert.equal(r.ok,true,JSON.stringify(r));const frame=r.data.frames[0];assert.ok(frame.pngBase64,JSON.stringify(frame));
  await writeFile(dir+'/frame.png',Buffer.from(frame.pngBase64,'base64'));
  const pixels=await page.evaluate(async ({png,scenario})=>{const b=await createImageBitmap(await(await fetch('data:image/png;base64,'+png)).blob());const c=new OffscreenCanvas(b.width,b.height),ctx=c.getContext('2d');ctx.drawImage(b,0,0);b.close();const p=ctx.getImageData(0,0,c.width,c.height).data;let greenRight=-Infinity,redLeft=Infinity,redRight=-Infinity,redTop=Infinity,redBottom=-Infinity;const r=(scenario.rotate??0)*Math.PI/180;for(let i=0;i<p.length;i+=4){const x=i/4%c.width+0.5-c.width/2-scenario.offset,y=Math.floor(i/4/c.width)+0.5-c.height/2;const px=(x*Math.cos(r)+y*Math.sin(r))/(scenario.scaleX??1),py=(-x*Math.sin(r)+y*Math.cos(r))/(scenario.scaleY??1);if(p[i+1]>200&&p[i]<30&&p[i+2]<30)greenRight=Math.max(greenRight,px);if(p[i]>200&&p[i+1]<30&&p[i+2]<30){redLeft=Math.min(redLeft,px);redRight=Math.max(redRight,px);redTop=Math.min(redTop,py);redBottom=Math.max(redBottom,py);}}return {greenRight,redLeft,gap:redLeft-greenRight,redWidth:redRight-redLeft,redHeight:redBottom-redTop};},{png:frame.pngBase64,scenario});
  report.push({scenario,projectId:id,directory:dir,expectedGap:14.4,...pixels});await page.close();
 }
 // Diagnostic output deliberately records failures; this is not an acceptance verifier.
 console.log(JSON.stringify({report,passes:report.every(r=>Math.abs(r.gap-r.expectedGap)<=3&&Math.abs(r.redWidth-28.8)<=3&&Math.abs(r.redHeight-28.8)<=3)}));
 await writeFile('/tmp/text-attachment-group-diagnosis.json',JSON.stringify(report,null,2));
}finally{await browser.close();}
