import fs from "node:fs/promises";
import {createHash} from "node:crypto";
const output="/Users/zhengwei/Downloads/effect-weight-export-2026-09-24";
const base="http://127.0.0.1:3000/api/footage/templates";
async function api(path,body){const response=await fetch(base+path,{method:body?"POST":"GET",headers:{"content-type":"application/json","x-requested-with":"moirai-footage"},body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw Error(JSON.stringify(data));return data;}
const {definition}=await api("/dynamic-assets/style-pilot-20260923-offset");
const {template}=await api("/dynamic-assets/application",{assetId:definition.id,assetRevision:definition.revision,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:0.85,centerX:0.5,centerY:0.8}});
const source=JSON.parse(await fs.readFile("/Users/zhengwei/Downloads/effect-style-pilot-2026-09-23/designs.json","utf8"));
for(const sample of source.samples){const input=await api(`/inputs/${sample.inputId}`);if(input.transcript.revision!==sample.transcriptRevision)throw Error("Measured transcript changed; review required");}
const designs=[400,800].map(weight=>{const draft=structuredClone(template);draft.id=`weight-export-20260924-${weight}`;draft.name=`双层花字 · 字重 ${weight} 导出验证`;for(const style of draft.styles)style.weight=weight;return {template:draft,baseRevision:0};});
const hash=createHash("sha256").update(JSON.stringify({designs,samples:source.samples})).digest("hex").slice(0,24);
await fs.mkdir(output,{recursive:true});
await fs.writeFile(`${output}/designs.json`,JSON.stringify({idempotencyKey:`weight-export-${hash}`,name:"数值字重成片验证",brief:"Verify exact numeric font weights in compiled projects and real exports. Same editable effect and measured inputs; two weights are test variants, not distinct approved designs. Preview-only; original saved style unchanged.",previewOnly:true,designs,samples:source.samples},null,2));
console.log(JSON.stringify({sourceId:definition.id,sourceRevision:definition.revision,manifest:`${output}/designs.json`}));
