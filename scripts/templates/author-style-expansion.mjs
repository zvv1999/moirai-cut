import fs from "node:fs/promises";
import {createHash} from "node:crypto";

const root=process.env.PILOT_OUTPUT??"/Users/zhengwei/Downloads/effect-style-expansion-2026-09-24";
const base=(process.env.WORKBENCH_URL??"http://127.0.0.1:3000")+"/api/footage/templates";
async function api(path,body) {
  const response=await fetch(base+path,{method:body?"POST":"GET",headers:{"content-type":"application/json","x-requested-with":"moirai-footage"},body:body?JSON.stringify(body):undefined});
  const value=await response.json();if(!response.ok)throw new Error(JSON.stringify(value));return value;
}
const catalog=(await api("/dynamic-assets")).assets;
const definitions=[
  ["note","便签批注 · 纸签贴入","keyword"],
  ["echo","入场强调 · 消散重影","keyword"],
  ["serif","轻量讲述 · 宋体重点","caption"],
];
const designs=[],effects=[];
async function projectSaved(saved,purpose) {
  effects.push({id:saved.id,revision:saved.revision,name:saved.name});
  const {template}=await api("/dynamic-assets/application",{assetId:saved.id,assetRevision:saved.revision,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:0.85,centerX:0.5,centerY:0.8},...(purpose==="caption"?{captionWidth:0.85}:{})});
  designs.push({template,baseRevision:0});
}

if(process.env.PILOT_STYLE&&!definitions.some(([key])=>key===process.env.PILOT_STYLE))throw new Error("Unknown PILOT_STYLE");
const motion=(property,values)=>({property,keys:values.map(([time,value,easing="linear"])=>({time,value,easing}))});
for(const [key,name,purpose] of definitions) {
  if(process.env.PILOT_STYLE&&process.env.PILOT_STYLE!==key)continue;
  const existing=catalog.find(a=>a.id===`style-study-20260924-${key}`);
  if(existing){await projectSaved(existing,purpose);continue;}
  if(key==="echo") {
    const seed=JSON.parse(await fs.readFile(new URL("./seeds/echo.json",import.meta.url),"utf8"));
    const normalized=(await api("/dynamic-assets/inspect",seed)).definition;
    const hash=createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
    const saved=(await api("/dynamic-assets",{definition:normalized,baseRevision:0,idempotencyKey:`style-expansion-${hash}`})).definition;
    await projectSaved(saved,purpose);continue;
  }
  const {definition:d}=await api("/dynamic-assets/create",{name,purpose,canvas:{width:720,height:720,fps:30}});
  d.id=`style-study-20260924-${key}`;
  d.provenance="Original editable typography study. All layers are native text and motion, not extracted reference imagery. Pending visual review; no aesthetic score.";
  d.purposes=purpose==="caption"?["caption"]:["keyword","decorative_text"];
  const e=d.layers.find(l=>l.content.kind==="element").content.element,s=d.styles[0];
  e.description=name;
  e.region={x:0.075,y:0.35,width:0.85,height:0.3};
  e.motionTiming={enterEnd:0.2,exitStart:0.8,enterSeconds:0.18,exitSeconds:0.1};
  e.motions=[motion("opacity",[[0,0],[0.2,1,"linear"],[0.8,1,"ease_in"],[1,0]])];
  Object.assign(s,{fontFamily:"PingFang SC",fontSize:88,weight:800,italic:false,letterSpacing:0,lineHeight:1.15,maxLines:1,textAlign:"center",fill:"#FFFFFF",stroke:"#151C22",strokeWidth:0,background:null,shadow:null});
  if(key==="note") {
    Object.assign(s,{fontSize:84,fill:"#493422",background:"#FFF3D7",backgroundPadding:{x:28,y:20},maxLines:2,stroke:"#D5B98B",strokeWidth:0,shadow:null});
    e.motionTiming.enterSeconds=0.10;e.motionTiming.exitSeconds=0.06;
    e.motions.push(motion("rotation",[[0,-8,"ease_out"],[0.2,-3],[1,-3]]),motion("y",[[0,16,"ease_out"],[0.2,0],[1,0]]));
    const back=structuredClone(e),style=structuredClone(s);
    back.id="note-shadow";back.description="便签偏移底层";back.z=e.z-1;back.styleId="note-shadow-style";
    back.region={...e.region,x:e.region.x+0.012,y:e.region.y+0.016};
    Object.assign(style,{id:back.styleId,fill:"#AD8155",background:"#AD8155",shadow:null});
    d.styles.push(style);d.layers.push({parentId:"root",content:{kind:"element",element:back}});
    d.inputs[0].layerIds.push(back.id);
    const tape=structuredClone(e);
    Object.assign(tape,{id:"paper-tape",description:"纸签顶部胶带",styleId:"paper-tape-style",literal:null,z:e.z+1,region:{x:0.41,y:0.3,width:0.20,height:0.065}});
    tape.features.representation="rectangle";tape.features.role="decoration";
    tape.motions=[motion("opacity",[[0,0],[0.2,0.9],[0.8,0.9],[1,0]]),motion("rotation",[[0,10],[1,10]])];
    d.layers.push({parentId:"root",content:{kind:"element",element:tape}});
    d.styles.push({...structuredClone(s),id:"paper-tape-style",fill:"#D5AD77",background:null,strokeWidth:0,shadow:null});
    d.spatialRelations=[{elementId:tape.id,relativeTo:e.id,placement:"above",gap:0,offsetX:0,offsetY:0.015,referenceBounds:"text_box",followMotion:true}];

  } else {
    Object.assign(s,{fontFamily:"Songti SC",fontSize:76,weight:800,fill:"#F9FAFB",strokeWidth:3.5,stroke:"#20282E",shadow:{color:"#101419",opacity:0.85,blur:3,x:0,y:2},maxLines:2,lineHeight:1.22});
    e.region={x:0.065,y:0.37,width:0.87,height:0.26};
    e.motionTiming.enterSeconds=0.16;
    d.treatments[0].operation.mode="keyword";
    d.treatments[0].operation.color="#FFE28B";
    e.motions.push(motion("y",[[0,5,"ease_out"],[0.2,0],[1,0]]));
  }
  const normalized=(await api("/dynamic-assets/inspect",d)).definition;
  const hash=createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  const saved=(await api("/dynamic-assets",{definition:normalized,baseRevision:0,idempotencyKey:`style-expansion-${hash}`})).definition;
  await projectSaved(saved,purpose);
}
const source=JSON.parse(await fs.readFile("/Users/zhengwei/Downloads/effect-editorial-styles-2026-09-28/designs.json","utf8"));
for(const sample of source.samples) {
  const input=await api(`/inputs/${sample.inputId}`);
  if(input.transcript.revision!==sample.transcriptRevision)throw new Error("Transcript changed; review measured ranges before production");
}
const hash=createHash("sha256").update(JSON.stringify({designs,samples:source.samples})).digest("hex").slice(0,24);
const manifest={idempotencyKey:`style-expansion-${hash}`,name:effects.length===1?`${effects[0].name} · 修订试映`:"便签、重影与宋体字幕 · 样式试制",brief:"Original editable studies with distinct structure, motion and typography. Cross-language measured timing fixtures. Preview-only; visual assessment pending and no 90-point approval.",previewOnly:true,designs,samples:source.samples};
await fs.mkdir(root,{recursive:true});
await fs.writeFile(`${root}/designs.json`,JSON.stringify(manifest,null,2));
await fs.writeFile(`${root}/effects.json`,JSON.stringify(effects,null,2));
console.log(JSON.stringify({effects,manifest:`${root}/designs.json`,samples:source.samples.length}));
