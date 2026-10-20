import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
const upstream='http://127.0.0.1:3000',prefix='/api/footage/templates',id='style-study-20260924-echo';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/echo-seed-20260929';
await fs.mkdir(root,{recursive:true});
const read=async path=>{const r=await fetch(upstream+prefix+path);assert.ok(r.ok);return r.json();};
const before=await read('/dynamic-assets'),saved=(await read('/dynamic-assets/'+id)).definition;
const seed=JSON.parse(await fs.readFile(new URL('./seeds/echo.json',import.meta.url),'utf8'));
const visual=d=>{const {revision,provenance,...rest}=d;return rest;};
assert.deepEqual(visual(seed),visual(saved),'Seed must preserve saved effect, not reset to older design');
let captured=null;const calls=[];
// Simulate an absent asset without deleting the real library. Native inspection and application remain real.
const server=http.createServer(async(req,res)=>{try{let body='';for await(const part of req)body+=part;calls.push([req.method,req.url]);let value;
 if(req.method==='GET'&&req.url===prefix+'/dynamic-assets')value={...before,assets:before.assets.filter(a=>a.id!==id)};
 else if(req.method==='POST'&&req.url===prefix+'/dynamic-assets'){
  captured=JSON.parse(body);assert.equal(captured.baseRevision,0);assert.deepEqual(visual(captured.definition),visual(saved));value={definition:saved};
 }else{
  assert.ok(req.method==='GET'||[prefix+'/dynamic-assets/inspect',prefix+'/dynamic-assets/application'].includes(req.url),'Unexpected mutation');
  const r=await fetch(upstream+req.url,{method:req.method,headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},...(body?{body}:{})});assert.ok(r.ok);value=await r.json();
 }
 res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(value));
}catch(e){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
 await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/templates/author-style-expansion.mjs'],{env:{...process.env,PILOT_STYLE:'echo',PILOT_OUTPUT:root,WORKBENCH_URL:'http://127.0.0.1:'+server.address().port},stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(log)));});
 assert.ok(captured);assert.deepEqual(await read('/dynamic-assets'),before);
 await fs.writeFile(root+'/verification.json',JSON.stringify({passed:true,nativeInspection:true,missingAssetSimulated:true,saveIntercepted:true,visualDefinitionEqualsSavedRevision:saved.revision,libraryUnchanged:true,calls},null,2));
 console.log('PASS missing-asset branch, native inspection and exact saved effect; simulated save, real library unchanged');
}finally{await new Promise(r=>server.close(r));}
