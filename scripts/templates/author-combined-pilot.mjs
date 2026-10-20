import fs from "node:fs/promises";
import {createHash} from "node:crypto";
const root="/Users/zhengwei/Downloads/effect-combined-pilot-2026-09-23";
const base="http://127.0.0.1:3000/api/footage/templates";
async function api(path,body){const r=await fetch(base+path,{method:body?"POST":"GET",headers:{"content-type":"application/json","x-requested-with":"moirai-footage"},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw new Error(JSON.stringify(d));return d;}
const catalog=(await api("/dynamic-assets")).assets;
const caption=catalog.find(a=>a.id==="style-pilot-20260923-caption");
const badge=catalog.find(a=>a.id==="style-pilot-20260923-adaptive");
if(!caption||!badge)throw new Error("Saved pilot effects are required");
const canvas={width:1280,height:720,fps:30},placement={x:0,y:0,width:1,height:1};
const single=(await api("/dynamic-assets/application",{assetId:badge.id,assetRevision:badge.revision,canvas,placement,transform:{scale:0.85,centerX:0.5,centerY:0.8}})).template;
let combined=(await api("/dynamic-assets/application",{assetId:caption.id,assetRevision:caption.revision,canvas,placement,transform:{scale:0.75,centerX:0.5,centerY:0.87},captionWidth:0.85})).template;
combined=(await api("/dynamic-assets/insert",{template:combined,assetId:badge.id,assetRevision:badge.revision,instanceId:"emphasis",placement:{x:0,y:0.2,width:1,height:0.8}})).template;
combined.name="清晰讲述 + 自适应重点词";
combined.id=`combined-pilot-${createHash("sha256").update(JSON.stringify(combined)).digest("hex").slice(0,24)}`;
const source=JSON.parse(await fs.readFile("/Users/zhengwei/Downloads/effect-style-pilot-2026-09-23/designs.json","utf8"));
for(const sample of source.samples){const input=await api(`/inputs/${sample.inputId}`);if(input.transcript.revision!==sample.transcriptRevision)throw new Error("Transcript changed; review ranges before production");}
const designs=[single,combined].map(template=>({template,baseRevision:0}));
const fingerprint=createHash("sha256").update(JSON.stringify({designs,samples:source.samples})).digest("hex").slice(0,24);
const manifest={idempotencyKey:`combined-pilot-${fingerprint}`,name:"自适应底色与字幕组合试映",brief:"Original editable style composition. Verify content-sized background, sentence reflow and spatial hierarchy against measured English interview and Chinese TTS; no aesthetic certification.",previewOnly:true,designs,samples:source.samples};
await fs.mkdir(root,{recursive:true});await fs.writeFile(`${root}/designs.json`,JSON.stringify(manifest,null,2));
console.log(JSON.stringify({manifest:`${root}/designs.json`,effects:[{id:caption.id,revision:caption.revision},{id:badge.id,revision:badge.revision}],designs:2,samples:source.samples.length}));
