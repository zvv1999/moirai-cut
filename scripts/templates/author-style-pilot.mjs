import fs from "node:fs/promises";
import {createHash} from "node:crypto";
const base=process.env.WORKBENCH_URL??"http://127.0.0.1:3000";
const output=process.env.PILOT_OUTPUT??"/Users/zhengwei/Downloads/effect-style-pilot-2026-09-23";
async function api(path,body){const r=await fetch(`${base}/api/footage/templates${path}`,{method:body?"POST":"GET",headers:{"content-type":"application/json","x-requested-with":"moirai-footage"},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw new Error(JSON.stringify(d));return d;}
const catalog=(await api("/dynamic-assets")).assets;
const designs=[],effects=[];
if(process.env.PILOT_STYLE&&!['caption','offset','marker'].includes(process.env.PILOT_STYLE))throw new Error("Unknown PILOT_STYLE");
for(const [key,name,purpose] of [["caption","清晰讲述 · 逐词字幕","caption"],["offset","综艺强调 · 双层花字","keyword"],["marker","重点标记 · 色块侧签","keyword"]]){
  if(process.env.PILOT_STYLE&&process.env.PILOT_STYLE!==key)continue;
  let saved=catalog.find(asset=>asset.id===`style-pilot-20260923-${key}`);
  // Saved definitions include human and agent refinements; seeds only initialize missing styles.
  if(!saved&&key==="offset"){
    const seed=JSON.parse(await fs.readFile(new URL("./seeds/offset.json",import.meta.url),"utf8"));
    const normalized=(await api("/dynamic-assets/inspect",seed)).definition;
    const fingerprint=createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
    saved=(await api("/dynamic-assets",{definition:normalized,baseRevision:0,idempotencyKey:`style-${fingerprint}`})).definition;
  }
  if(!saved){
    const {definition:d}=await api("/dynamic-assets/create",{name,purpose,canvas:{width:720,height:720,fps:30}});
    d.id=`style-pilot-20260923-${key}`;
    d.provenance="Original editable study informed by visual inspection of local Kaipai 47 variety preview; not an extracted template or a fidelity claim.";
    d.evidence=[{status:"authored",description:"Typography and motion study; visual review pending",referenceId:null,startSeconds:null,endSeconds:null}];
    const e=d.layers.find(l=>l.content.kind==="element").content.element,s=d.styles[0];
    e.region={x:0.075,y:0.39,width:0.85,height:0.22};
    s.fontFamily="PingFang SC";s.fontSize=64;s.weight=700;s.letterSpacing=0;s.lineHeight=1.12;s.maxLines=2;s.fill="#FFFFFF";s.stroke="#171B20";s.strokeWidth=5;
    s.shadow={color:"#11151A",opacity:0.45,blur:6,x:0,y:3};
    e.motionTiming={enterEnd:0.2,exitStart:0.8,enterSeconds:0.14,exitSeconds:0.1};
    const envelope={property:"opacity",keys:[{time:0,value:0,easing:"linear"},{time:0.2,value:1,easing:"ease_out"},{time:0.8,value:1,easing:"linear"},{time:1,value:0,easing:"ease_in"}]};
    e.motions=[structuredClone(envelope)];
    if(key==="caption"){
      d.treatments[0].id="active-word";d.applications[0].treatmentId="active-word";
      d.treatments[0].operation.color="#FFE46A";
      e.description="逐词字幕";
      e.motions.push({property:"y",keys:[{time:0,value:8,easing:"ease_out"},{time:0.2,value:0,easing:"linear"},{time:1,value:0,easing:"linear"}]});
    }else{
      e.description="重点词主体";s.fontSize=82;s.maxLines=1;s.fill="#17251F";s.strokeWidth=0;s.shadow=null;
      e.region={x:0.19,y:0.405,width:0.64,height:0.19};
      e.motions.push({property:"y",keys:[{time:0,value:16,easing:"ease_out"},{time:0.2,value:0,easing:"linear"},{time:1,value:0,easing:"linear"}]});
      const panel=structuredClone(e);panel.id="marker-panel";panel.description="重点底色";panel.features.representation="rectangle";panel.features.role="supporting_visual";panel.features.outline=false;panel.z=e.z-1;panel.styleId="marker-panel-style";panel.region={x:0.15,y:0.39,width:0.72,height:0.22};
      d.styles.push({...structuredClone(s),id:panel.styleId,fill:"#DDFC74",stroke:"#17251F",strokeWidth:2});
      d.layers.push({parentId:"root",content:{kind:"element",element:panel}});
      const bar=structuredClone(panel);bar.id="marker-bar";bar.description="侧边强调线";bar.styleId="marker-bar-style";bar.region={x:0.115,y:0.39,width:0.014,height:0.22};
      d.styles.push({...structuredClone(s),id:bar.styleId,fill:"#DDFC74",strokeWidth:0});
      d.layers.push({parentId:"root",content:{kind:"element",element:bar}});
    }
    d.purposes=key==="offset"?["keyword","decorative_text"]:[purpose];
    d.revision=0;
    const normalized=(await api("/dynamic-assets/inspect",d)).definition;
    const fingerprint=createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
    saved=(await api("/dynamic-assets",{definition:normalized,baseRevision:0,idempotencyKey:`style-${fingerprint}`})).definition;
  }
  effects.push({id:saved.id,revision:saved.revision,name:saved.name});
  const application=await api("/dynamic-assets/application",{assetId:saved.id,assetRevision:saved.revision,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:0.85,centerX:0.5,centerY:0.8},...(key==="caption"?{captionWidth:0.85}:{})});
  designs.push({template:application.template,baseRevision:0});
}
const english=await api("/inputs/input-e0d2273b4b7b27c945a73d00eb03b2c6"),chinese=await api("/inputs/input-941335914fe590272ed1f8cef9af917a");
function sample(input,ranges,title){return {inputId:input.input.id,transcriptRevision:input.transcript.revision,title,captionSpans:ranges.map(([startWord,endWord])=>({startWord,endWord})),semanticUnits:ranges.map(([startWord,endWord,k0,k1])=>({startWord,endWord,intent:"emphasis",keyword:{startWord:k0,endWord:k1},rationale:"Author-selected semantic emphasis in the reviewed transcript; measured word times retained."}))};}
const samples=[sample(english,[[0,6,3,4],[6,16,14,16],[16,21,19,21]],"真实访谈 · 原声"),sample(chinese,[[0,10,4,7],[10,16,14,16],[16,24,18,21],[24,30,27,30],[30,38,32,38]],"中文阅读 · 实测词时间")];
const hash=createHash("sha256").update(JSON.stringify({designs,samples})).digest("hex").slice(0,24);
const manifest={idempotencyKey:`style-pilot-${hash}`,name:effects.length===1?`${effects[0].name} · 双语试映`:"效果样式试制 · 三种文字层级",brief:"Original typography studies after reference-frame review. Cross-language measured samples; preview-only, no aesthetic certification. Preserve source audio and expose every text/shape layer for editing. Sentence-caption applications use independent 85% canvas width without enlarging glyphs; keyword decoration retains its authored aspect.",previewOnly:true,designs,samples};
await fs.mkdir(output,{recursive:true});await fs.writeFile(`${output}/designs.json`,JSON.stringify(manifest,null,2));await fs.writeFile(`${output}/effects.json`,JSON.stringify(effects,null,2));
console.log(JSON.stringify({output,effects,designs:designs.length,samples:samples.length,manifest:`${output}/designs.json`}));
