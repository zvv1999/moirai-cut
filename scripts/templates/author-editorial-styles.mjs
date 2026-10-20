import fs from "node:fs/promises";
import {createHash} from "node:crypto";
import {homedir} from "node:os";
import {join} from "node:path";
import {initializeStyleSeed} from "./initialize-style-seed.mjs";

const root=process.env.PILOT_OUTPUT??join(homedir(),"Downloads/effect-editorial-styles-2026-09-28");
const base=(process.env.WORKBENCH_URL??"http://127.0.0.1:3000")+"/api/footage/templates";
async function api(path,body) {
  const response=await fetch(base+path,{method:body?"POST":"GET",headers:{"content-type":"application/json","x-requested-with":"moirai-footage"},body:body?JSON.stringify(body):undefined});
  const value=await response.json();if(!response.ok)throw new Error(JSON.stringify(value));return value;
}
const catalog=(await api("/dynamic-assets")).assets;
const definitions=[
  ["quotation","观点引用 · 双引号","keyword"],
  ["signal","信息提示 · 青色侧标","keyword"],
];
const designs=[],effects=[];
if(process.env.PILOT_STYLE&&!definitions.some(([key])=>key===process.env.PILOT_STYLE))throw new Error("Unknown PILOT_STYLE");
const motion=(property,values)=>({property,keys:values.map(([time,value,easing="linear"])=>({time,value,easing}))});
for(const [key,name,purpose] of definitions) {
  if(process.env.PILOT_STYLE&&process.env.PILOT_STYLE!==key)continue;
  let saved=key==="signal"
    ?await initializeStyleSeed("signal.json")
    :catalog.find(a=>a.id===`style-study-20260928-${key}`);
  // Existing human/Agent revisions are authoritative; this script seeds missing assets only.
  if(!saved){
    const {definition:d}=await api("/dynamic-assets/create",{name,purpose,canvas:{width:720,height:720,fps:30}});
    d.id=`style-study-20260928-${key}`;
    d.provenance="Original editable typography study. All layers are native text and motion, not extracted reference imagery. Pending visual review; no aesthetic score.";
    d.purposes=purpose==="caption"?["caption"]:["keyword","decorative_text"];
    const e=d.layers.find(l=>l.content.kind==="element").content.element,s=d.styles[0];
    e.description=name;
    e.region={x:0.075,y:0.35,width:0.85,height:0.3};
    e.motionTiming={enterEnd:0.2,exitStart:0.8,enterSeconds:0.18,exitSeconds:0.1};
    e.motions=[motion("opacity",[[0,0],[0.2,1,"linear"],[0.8,1,"ease_in"],[1,0]])];
    Object.assign(s,{fontFamily:"PingFang SC",fontSize:88,weight:800,italic:false,letterSpacing:0,lineHeight:1.15,maxLines:1,textAlign:"center",fill:"#FFFFFF",stroke:"#151C22",strokeWidth:0,background:null,shadow:null});
    e.motions.push(motion("y",[[0,12,"ease_out"],[0.2,0],[1,0]]));
    d.spatialRelations=[];
    const decoration=(id,description,representation,region,style,literal,placement,gap)=>{
      const layer=structuredClone(e);
      Object.assign(layer,{id,description,styleId:style.id,region,literal,z:2,binding:literal?"literal":"keyword"});
      layer.features.representation=representation;
      layer.features.role="supporting_visual";
      layer.motions=[structuredClone(e.motions[0])];
      d.styles.push(style);d.layers.push({parentId:"root",content:{kind:"element",element:layer}});
      d.spatialRelations.push({elementId:id,relativeTo:e.id,placement,referenceBounds:"text_box",gap,offsetX:0,offsetY:0,followMotion:true});
    };
    if(key==="quotation") {
      Object.assign(s,{fontFamily:"Songti SC",fontSize:96,maxLines:2,weight:900,fill:"#FAF4E4",strokeWidth:5,stroke:"#17232D",shadow:{color:"#101419",opacity:0.7,blur:4,x:0,y:2}});
      e.region={x:0.17,y:0.35,width:0.66,height:0.3};
      for(const [id,literal,placement] of [["quote-left","“","left"],["quote-right","”","right"]]) {
        decoration(id,"引用标记", "text",{x:0.02,y:0.39,width:0.11,height:0.22},{...structuredClone(s),id:id+"-style",fontFamily:"Georgia",fontSize:116,fill:"#FFD166",strokeWidth:2},literal,placement,0.005);
        // Georgia's quote ink sits high in its line box; an editable optical offset centers it beside the block.
        d.layers.at(-1).content.element.motions.push(motion("y",[[0,40],[1,40]]));
      }
    }
    d.revision=0;
    const normalized=(await api("/dynamic-assets/inspect",d)).definition;
    const hash=createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
    saved=(await api("/dynamic-assets",{definition:normalized,baseRevision:0,idempotencyKey:`editorial-style-${hash}`})).definition;
  }
  effects.push({id:saved.id,revision:saved.revision,name:saved.name});
  let {template}=await api("/dynamic-assets/application",{assetId:saved.id,assetRevision:saved.revision,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:0.85,centerX:0.5,centerY:0.8},...(purpose==="caption"?{captionWidth:0.85}:{})});
  template.id=`editorial-study-${key}`;
  template.id+="-"+createHash("sha256").update(JSON.stringify(template)).digest("hex").slice(0,16);
  designs.push({template,baseRevision:0});
}
const source=JSON.parse(await fs.readFile(process.env.PILOT_SOURCE??join(homedir(),"Downloads/measured-sparkle-pilot-2026-09-28/designs.json"),"utf8"));
source.samples.push({inputId:"input-cde88118397f50e922df4e606786d79f",transcriptRevision:1,title:"导师的影响 · 实测原声",
  captionSpans:[[0,8],[8,14],[14,25],[25,36],[36,45],[45,54]].map(([startWord,endWord])=>({startWord,endWord})),
  semanticUnits:[[0,8,6,8],[8,14,12,14],[14,25,23,25],[25,36,34,36],[36,45,42,45],[45,54,49,54]].map(([startWord,endWord,keywordStart,keywordEnd])=>({startWord,endWord,intent:"emphasis",keyword:{startWord:keywordStart,endWord:keywordEnd},rationale:"Reviewed transcript: emphasize education, progress and the mentor's impact; preserve measured word boundaries."}))});
for(const sample of source.samples) {
  const input=await api(`/inputs/${sample.inputId}`);
  if(input.transcript.revision!==sample.transcriptRevision)throw new Error("Transcript changed; review measured ranges before production");
}
const hash=createHash("sha256").update(JSON.stringify({designs,samples:source.samples})).digest("hex").slice(0,24);
const manifest={idempotencyKey:`editorial-style-${hash}`,name:effects.length===1?`${effects[0].name} · 修订试映`:"引用与信息提示 · 样式试制",brief:"Original editable studies with distinct structure, motion and typography. Cross-language measured timing fixtures. Preview-only; visual assessment pending and no 90-point approval.",previewOnly:true,designs,samples:source.samples};
await fs.mkdir(root,{recursive:true});
await fs.writeFile(`${root}/designs.json`,JSON.stringify(manifest,null,2));
await fs.writeFile(`${root}/effects.json`,JSON.stringify(effects,null,2));
console.log(JSON.stringify({effects,manifest:`${root}/designs.json`,samples:source.samples.length}));
