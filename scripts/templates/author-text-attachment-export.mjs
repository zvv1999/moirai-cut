import fs from "node:fs/promises";
import {createHash} from "node:crypto";
const animated=process.env.ATTACHMENT_ANIMATED==="1";
const output=`/Users/zhengwei/Downloads/text-attachment-${animated?"motion-":""}export-2026-09-28`;
async function api(path,body){const r=await fetch(`http://127.0.0.1:3000/api/footage/templates${path}`,{method:body?"POST":"GET",headers:{"content-type":"application/json","x-requested-with":"moirai-footage"},body:body?JSON.stringify(body):undefined});const v=await r.json();if(!r.ok)throw Error(JSON.stringify(v));return v;}
const schema=await api("/schema");
if(!schema.productionAuthoringInput)throw Error("Missing native authoring contract");
const {definition}=await api("/dynamic-assets/text-attachment-validation-20260928");
const {template}=await api("/dynamic-assets/application",{assetId:definition.id,assetRevision:definition.revision,canvas:{width:720,height:720,fps:30},placement:{x:0,y:0,width:1,height:1}});
template.id="text-bound-export-20260928";template.name="文字边界依附 · 导出验证";
if(animated){
  template.id="text-bound-motion-export-20260928";template.name="文字边界依附 · 旋转缩放验证";
  const parent=template.elements.find(e=>e.id===template.composition.spatialRelations[0].relativeTo);
  parent.motions=[["rotation",-20,20],["scale_x",0.7,1.1],["scale_y",1.2,0.8]].map(([property,start,end])=>({property,keys:[{time:0,value:start,easing:"linear"},{time:1,value:end,easing:"linear"}]}));
  parent.motionTiming=null;
}
const {samples}=JSON.parse(await fs.readFile("/Users/zhengwei/Downloads/effect-style-pilot-2026-09-23/designs.json","utf8"));
for(const sample of samples){const input=await api(`/inputs/${sample.inputId}`);if(input.transcript.revision!==sample.transcriptRevision)throw Error("Transcript revision changed; review before proceeding");}
const designs=[{template,baseRevision:0}];
const hash=createHash("sha256").update(JSON.stringify({designs,samples})).digest("hex");
const manifest={idempotencyKey:`text-bound-export-${hash}`,name:animated?"文字边界依附 · 动态双语验证":"文字边界依附 · 双语导出验证",brief:"Engineering fixture: green measured text background plus red editable square. Verify native text-box attachment survives real export and retains spacing across measured English/Chinese keyword lengths. Not an aesthetic candidate or a new approved template. Preserve original sample audio; isolated preview-only projects."+(animated?" Parent rotates from -20 to +20 degrees while X/Y scales change independently.":""),previewOnly:true,designs,samples};
await fs.mkdir(output,{recursive:true});await fs.writeFile(`${output}/designs.json`,JSON.stringify(manifest,null,2));
console.log(JSON.stringify({manifest:`${output}/designs.json`,sourceRevision:definition.revision}));
