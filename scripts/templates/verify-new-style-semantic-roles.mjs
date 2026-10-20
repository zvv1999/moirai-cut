import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3000/api/footage/templates',root='/Users/zhengwei/Downloads/new-style-semantic-roles-20260929';
await fs.mkdir(root,{recursive:true});
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const before=await api('/dynamic-assets'),results=[];
for(const [purpose,role,binding,anchor] of [['keyword','emphasis','keyword','keyword_start'],['caption','subtitle','sentence','cue_start'],['decorative_text',null,'literal','video_start'],['decoration','decoration','literal','video_start']]){
 const {definition}=await api('/dynamic-assets/create',{name:'验收 · 语义角色 '+purpose,canvas:{width:720,height:720,fps:30},purpose});
 const e=definition.layers.find(l=>l.content.kind==='element').content.element;
 assert.equal(e.features.role,role);assert.equal(e.binding,binding);assert.equal(e.timing.anchor,anchor);
 const preview=await api('/dynamic-assets/preview',{definition,inputs:{},durationSeconds:3,example:{text:'把复杂的事情讲清楚',keyword:'讲清楚'}});
 assert.ok(preview.tracks.overlay.some(t=>t.elements.length>0));
 await fs.writeFile(root+'/'+purpose+'.json',JSON.stringify({definition,preview},null,2));
 results.push({purpose,role,binding,anchor,overlayElements:preview.tracks.overlay.flatMap(t=>t.elements).length});
}
assert.deepEqual(await api('/dynamic-assets'),before);
await fs.writeFile(root+'/verification.json',JSON.stringify({passed:true,results,savedLibraryUnchanged:true,savedFixtures:0},null,2));console.log(JSON.stringify(results));
