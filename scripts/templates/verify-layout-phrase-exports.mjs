import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const source='/Users/zhengwei/Downloads/chinese-semantic-icons-2026-09-29';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/layout-phrase-exports-2026-09-29';
const manifest=JSON.parse(await fs.readFile(source+'/designs.json','utf8'));
assert.equal(manifest.previewOnly,true);
const expected=[['input-cff723e5973128fcb40827c9cf585831',13,15,'最重要'],['input-e01ef91d1e429916a7f317f32ac47da7',21,23,'完成时间。'],['input-ac789371639a22936895cbebf224de23',35,37,'完成时间']];
const base='http://127.0.0.1:3000/api/footage/templates';
for(const [i,[id,startWord,endWord,text]] of expected.entries()){
 const sample=manifest.samples[i];assert.equal(sample.inputId,id);
 const detail=await(await fetch(base+'/inputs/'+id)).json();assert.equal(detail.transcript.revision,sample.transcriptRevision);
 assert.equal(detail.transcript.words.slice(startWord,endWord).map(w=>w.text).join(''),text);
 sample.layoutPhrases=[{wordSpan:{startWord,endWord}}];
}
manifest.name='中文短语同排 · 三份原声对照';
manifest.brief='Only add static layout phrase hints to the prior Chinese semantic icon samples. Preserve original measured words, audio, segmentation, styles and timing. Preview-only export; no aesthetic acceptance claim.';
manifest.idempotencyKey='layout-phrase-'+(process.env.RENDER_VARIANT??'v1')+'-'+createHash('sha256').update(JSON.stringify({designs:manifest.designs,samples:manifest.samples})).digest('hex');
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));
const response=await fetch(base+'/production/author',{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify(manifest)});const submitted=await response.json();assert.ok(response.ok,JSON.stringify(submitted));
await fs.writeFile(root+'/submission.json',JSON.stringify(submitted,null,2));console.log(JSON.stringify({batchId:submitted.id,root}));
