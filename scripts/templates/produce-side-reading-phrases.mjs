import fs from'node:fs/promises';import assert from'node:assert/strict';import{createHash}from'node:crypto';
const old='/Users/zhengwei/Downloads/checklist-side-segmented-20260930',root='/Users/zhengwei/Downloads/checklist-side-phrases-20260930',base='http://127.0.0.1:3000/api/footage/templates';await fs.mkdir(root,{recursive:true});
async function api(p,b){const r=await fetch(base+p,{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify(b)});const text=await r.text();assert.ok(r.ok,text);return JSON.parse(text);}
const submissions=[];
for(const i of [1,2]){
 const before=JSON.parse(await fs.readFile(old+'/'+i+'/manifest.json')),template=structuredClone(before.designs[0].template),samples=structuredClone(before.samples);
 template.id='checklist-sidebar-phrases-'+i+'-20260930';template.segmentation.preserveLayoutPhrases=true;
 samples[0].layoutPhrases=i===1?[{wordSpan:{startWord:3,endWord:6}},{wordSpan:{startWord:17,endWord:20}}]:[...samples[0].layoutPhrases,{wordSpan:{startWord:32,endWord:34}}];
 const plan=await api('/samples/validate',{template,samples});const captions=plan.samples[0].plan.captions;
 for(const phrase of samples[0].layoutPhrases)assert.ok(captions.some(c=>c.wordSpan.startWord<=phrase.wordSpan.startWord&&c.wordSpan.endWord>=phrase.wordSpan.endWord));
 const disabled=await api('/samples/validate',{template:{...template,segmentation:{...template.segmentation,preserveLayoutPhrases:false}},samples});
 assert.ok(disabled.samples[0].plan.warnings.some(w=>w.startsWith('layout_phrase_crosses_caption:')));
 const designs=[{template,baseRevision:0}],manifest={name:'侧栏阅读 · 保留内容短语',brief:'Same visual definition and 42-character policy. Explicit opt-in uses Agent-reviewed content phrase hints to avoid splitting I could find and longer sunlight across automatic captions. Source words/times unchanged; retain reading-speed warnings.',previewOnly:true,designs,samples,idempotencyKey:'side-phrases-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
 const folder=root+'/'+i;await fs.mkdir(folder,{recursive:true});for(const[k,v]of Object.entries({manifest,plan,disabledPlan:disabled}))await fs.writeFile(folder+'/'+k+'.json',JSON.stringify(v,null,2));
 for(const n of ['definition.json','inputs.json','placement.json'])await fs.copyFile(old+'/'+i+'/'+n,folder+'/'+n);
 const batch=await api('/production/author',manifest);await fs.writeFile(folder+'/submission.json',JSON.stringify(batch,null,2));submissions.push({fixture:i,id:batch.id});await fs.writeFile(root+'/submissions.json',JSON.stringify(submissions,null,2));console.log(i,captions.map(c=>c.text),plan.samples[0].plan.warnings);
}
