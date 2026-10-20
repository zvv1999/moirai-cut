import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';

const output=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/measured-sparkle-pilot-2026-09-28';
const base=(process.env.WORKBENCH_URL??'http://127.0.0.1:3000')+'/api/footage/templates';
async function api(path,body) {
	const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});
	const raw=await response.text();
	if(!response.ok)throw Error(`${path}: HTTP ${response.status}: ${raw.slice(0,1000)}`);
	return JSON.parse(raw);
}
const schema=await api('/schema');if(!schema.productionAuthoringInput)throw Error('Missing authoring contract');
const catalog=(await api('/dynamic-assets')).assets;
const source=catalog.find(asset=>asset.id==='style-pilot-20260923-sparkle-follow');
const caption=catalog.find(asset=>asset.id==='style-pilot-20260923-caption');
if(!source||!caption)throw Error('Missing source studies');
let definition=catalog.find(asset=>asset.id==='style-study-20260928-measured-sparkle');
// Reuse saved revisions; only seed this design when it is absent.
if(!definition){
  definition=structuredClone(source);
  definition.id='style-study-20260928-measured-sparkle';
  definition.name='温暖批注 · 文字边缘星光';
  definition.provenance='Original editable cream-and-gold keyword study, derived from the existing local sparkle study and its licensed Lucide asset. Measured text-box attachment; not extracted artwork or aesthetic certification.';
  definition.revision=0;
  const text=definition.layers.find(layer=>layer.content.element?.id==='headline').content.element;
  text.features.role='emphasis';
  text.region={x:0.1,y:0.35,width:0.72,height:0.3};
  text.motionTiming={enterEnd:0.2,exitStart:0.8,enterSeconds:0.1,exitSeconds:0.06};
  const keys=(property,values)=>({property,keys:values.map(([time,value,easing='linear'])=>({time,value,easing}))});
  text.motions=[
    keys('opacity',[[0,0,'ease_out'],[0.2,1],[0.8,1,'ease_in'],[1,0]]),
    keys('scale',[[0,0.86,'ease_out'],[0.14,1.025,'ease_out'],[0.2,1],[1,1]]),
    keys('y',[[0,10,'ease_out'],[0.2,0],[1,0]]),
  ];
  Object.assign(definition.styles.find(style=>style.id===text.styleId),{fontSize:76,weight:800,fill:'#28323A',background:'#FFF1C9',backgroundPadding:{x:22,y:12},strokeWidth:0,maxLines:2,textAlign:'left',shadow:{color:'#171B20',opacity:0.2,blur:5,x:0,y:3}});
  const icon=definition.layers.find(layer=>layer.content.element?.id==='sparkle').content.element;
  icon.region={x:0.84,y:0.44,width:0.1,height:0.1};
  icon.motionTiming=structuredClone(text.motionTiming);
  icon.motions=[structuredClone(text.motions[0]),keys('scale',[[0,0.65,'ease_out'],[0.2,1],[1,1]]),keys('rotation',[[0,-18,'ease_out'],[0.2,0],[1,0]])];
  definition.spatialRelations=[{elementId:'sparkle',relativeTo:'headline',placement:'right',referenceBounds:'text_box',gap:0.025,offsetX:0,offsetY:0,followMotion:true}];
  // Independent editable backing keeps the gold line icon legible over footage.
  const badge=structuredClone(icon);
  badge.id='sparkle-backing';badge.description='星光衬底';badge.features.representation='ellipse';
  badge.resourceId=null;badge.styleId='sparkle-backing-style';badge.literal=null;badge.z=0;
  badge.region={x:0.82,y:0.43,width:0.125,height:0.125};
  definition.layers.push({parentId:'root',content:{kind:'element',element:badge}});
  definition.styles.push({...structuredClone(definition.styles.find(style=>style.id===text.styleId)),id:'sparkle-backing-style',description:'星光浅色衬底',fill:'#FFF1C9',background:null,shadow:null});
  definition.spatialRelations.push({elementId:badge.id,relativeTo:'headline',placement:'right',referenceBounds:'text_box',gap:0.0125,offsetX:0,offsetY:0,followMotion:true});

  definition=(await api('/dynamic-assets',{definition,baseRevision:0,idempotencyKey:'measured-sparkle-'+createHash('sha256').update(JSON.stringify(definition)).digest('hex')})).definition;
}

const canvas={width:1280,height:720,fps:30};
let template=(await api('/dynamic-assets/application',{assetId:caption.id,assetRevision:caption.revision,canvas,placement:{x:0,y:0,width:1,height:1},transform:{scale:0.65,centerX:0.5,centerY:0.89},captionWidth:0.85})).template;
template=(await api('/dynamic-assets/insert',{template,assetId:definition.id,assetRevision:definition.revision,instanceId:'warm-keyword',placement:{x:0,y:0.25,width:1,height:0.7}})).template;
template.name='清晰讲述 · 温暖星光重点';
const {samples}=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/effect-style-pilot-2026-09-23/designs.json','utf8'));
for(const sample of samples){
	const input=await api('/inputs/'+sample.inputId);
	if(input.transcript.revision!==sample.transcriptRevision)throw Error('Transcript changed; review ranges before production');
	if(sample.inputId==='input-941335914fe590272ed1f8cef9af917a') {
		// ASR keeps “下一” in one token. Include the verb rather than inventing subword timing.
		const unit=sample.semanticUnits.find(unit=>unit.startWord===24&&unit.endWord===30);
		const phrase=input.transcript.words.slice(26,30).map(word=>word.text).join('');
		if(!unit||phrase!=='写下一句话，')throw Error('Reviewed Chinese emphasis no longer matches');
		unit.keyword={startWord:26,endWord:30};
		unit.rationale='Emphasize the complete action 写下一句话; retain original measured token boundaries, including the ASR token 下一.';
	}
}
template.id='measured-sparkle-study';
template.id='measured-sparkle-'+createHash('sha256').update(JSON.stringify(template)).digest('hex').slice(0,20);
const designs=[{template,baseRevision:0}];
const fingerprint=createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex');
const manifest={idempotencyKey:'measured-sparkle-'+fingerprint,name:'温暖星光重点 · 实测声音组合验收',brief:'One original reusable keyword style combined with active-word captions. Gold Lucide sparkle follows the measured cream text background. Two existing measured inputs, original audio retained. Check short/long words, caption hierarchy, motion boundaries and MP4. Preview-only isolated projects; no aesthetic score or 20-template acceptance implied.',previewOnly:true,designs,samples};
await fs.mkdir(output,{recursive:true});
await fs.writeFile(output+'/designs.json',JSON.stringify(manifest,null,2));
await fs.writeFile(output+'/effect.json',JSON.stringify(definition,null,2));
console.log(JSON.stringify({manifest:output+'/designs.json',assetId:definition.id,revision:definition.revision,designs:1,samples:samples.length}));
