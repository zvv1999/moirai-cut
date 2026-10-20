import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/quotation-refine-2026-09-28';
async function api(path,body){const response=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const data=await response.json();assert.ok(response.ok,JSON.stringify(data));return data;}
const original=(await api('/dynamic-assets/style-study-20260928-quotation')).definition;
assert.equal(original.revision,4,'Only refine the visually reviewed version');
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/original-v4.json',JSON.stringify(original,null,2));
const definition=structuredClone(original);
const headline=definition.layers.find(l=>l.content.element?.id==='headline').content.element;
headline.region={...headline.region,x:.12,width:.76};
for(const layer of definition.layers){const element=layer.content.element;if(element)element.motionTiming={...element.motionTiming,enterSeconds:.1,exitSeconds:.06};}
for(const style of definition.styles){style.fontSize=style.id==='headline-style'?80:96;}
definition.provenance+=' Revision 5: widen headline region and reduce type scale to retain short English phrases on one line; shorten entry/exit for measured short keywords. Requires visual review; no score inherited.';
const normalized=(await api('/dynamic-assets/inspect',definition)).definition;
const saved=(await api('/dynamic-assets',{definition:normalized,baseRevision:4,idempotencyKey:'quotation-refine-'+createHash('sha256').update(JSON.stringify(normalized)).digest('hex')})).definition;
assert.equal(saved.revision,5);await fs.writeFile(root+'/saved-v5.json',JSON.stringify(saved,null,2));
console.log(JSON.stringify({id:saved.id,revision:saved.revision,root}));
