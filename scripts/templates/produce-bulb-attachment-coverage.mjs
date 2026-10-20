import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const source='/Users/zhengwei/Downloads/bulb-caption-bound-20260929';
const root='/Users/zhengwei/Downloads/bulb-attachment-coverage-20260929';
const base='http://127.0.0.1:3000/api/footage/templates';
async function api(path,body){const r=await fetch(base+path,body?{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify(body)}:undefined);const t=await r.text();assert.ok(r.ok,t);return JSON.parse(t);}
const old=JSON.parse(await fs.readFile(source+'/manifest.json'));
const saved=JSON.parse(await fs.readFile(source+'/saved.json'));
assert.deepEqual((await api('')).templates.find(t=>t.id===saved.id),saved);
const samples=structuredClone(old.samples),inputs=[];
for(const s of samples){const input=await api('/inputs/'+s.inputId);assert.equal(input.transcript.revision,s.transcriptRevision);inputs.push(input);}
samples[1].semanticUnits[0].keyword={startWord:32,endWord:34};
samples[1].semanticUnits[0].rationale='Agent annotation: from space is the surprising answer to where Earth can be studied. Tests the same design at the end of a longer caption.';
samples[2].semanticUnits[0].keyword={startWord:11,endWord:18};
samples[2].semanticUnits[0].rationale='Agent annotation: because of the tilt of the earth explains the solstice mechanism. Tests a longer explanatory phrase, without changing caption boundaries or word times.';
assert.equal(inputs[1].transcript.words.slice(32,34).map(w=>w.text).join(' '),'from space.');
assert.equal(inputs[2].transcript.words.slice(11,18).map(w=>w.text).join(' '),'because of the tilt of the earth,');
assert.ok((await api('/samples/validate',{template:saved,samples})).validated);
const designs=[{template:saved,baseRevision:saved.revision}];
const manifest={name:'字幕旁点亮 · 长句与因果词段复用验证',brief:'Use the exact saved design without layout changes. Two manually annotated explanatory cues on real backgrounds, plus one unchanged negative example. Measured word times and caption spans are preserved.',previewOnly:true,designs,samples,idempotencyKey:'bulb-coverage-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
await fs.mkdir(root,{recursive:true});
for(const [k,v]of Object.entries({manifest,inputs}))await fs.writeFile(root+'/'+k+'.json',JSON.stringify(v,null,2));
for(const name of ['definition.json','applications.json'])await fs.copyFile(source+'/'+name,root+'/'+name);
const result=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(result,null,2));console.log(result.id);
