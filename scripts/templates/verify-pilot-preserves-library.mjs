import fs from 'node:fs/promises';import assert from 'node:assert/strict';import http from 'node:http';import {spawn} from 'node:child_process';
const expansion=process.env.AUTHOR_SET==='expansion';
const editorial=process.env.AUTHOR_SET==='editorial',warm=process.env.AUTHOR_SET==='warm';
const keys=expansion?['note','echo','serif']:warm?['measured-sparkle']:editorial?['quotation','signal']:['caption','offset','marker'];
const prefix=expansion?'style-study-20260924-':(editorial||warm)?'style-study-20260928-':'style-pilot-20260923-';
const upstream='http://127.0.0.1:3000',root='/Users/zhengwei/Downloads/'+(expansion?'expansion':warm?'warm':editorial?'editorial':'pilot')+'-preserve-library-20260929',calls=[];
await fs.mkdir(root,{recursive:true});const before=await(await fetch(upstream+'/api/footage/templates/dynamic-assets')).json();
for(const key of keys)assert.ok(before.assets.some(a=>a.id===prefix+key));
const server=http.createServer(async(req,res)=>{try{let body='';for await(const part of req)body+=part;calls.push({method:req.method,path:req.url,...(body?{body:JSON.parse(body)}:{})});
 if(req.method!=='GET'&&!['/api/footage/templates/dynamic-assets/application',...(warm?['/api/footage/templates/dynamic-assets/insert']:[])].includes(req.url)){res.writeHead(409,{'content-type':'application/json'});res.end(JSON.stringify({error:'Verification rejects all asset mutations'}));return;}
 const r=await fetch(upstream+req.url,{method:req.method,headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},...(body?{body}:{})});res.writeHead(r.status,{'content-type':'application/json'});res.end(await r.text());
}catch(e){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{for(const pass of ['first','repeat']){const output=root+'/'+pass;await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[expansion?'scripts/templates/author-style-expansion.mjs':warm?'scripts/templates/author-measured-sparkle-pilot.mjs':editorial?'scripts/templates/author-editorial-styles.mjs':'scripts/templates/author-style-pilot.mjs'],{env:{...process.env,PILOT_STYLE:'',WORKBENCH_URL:'http://127.0.0.1:'+server.address().port,PILOT_OUTPUT:output},stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(log)));});
 const effects=warm?[JSON.parse(await fs.readFile(output+'/effect.json'))].map(a=>({id:a.id,revision:a.revision,name:a.name})):JSON.parse(await fs.readFile(output+'/effects.json'));await fs.writeFile(output+'/verified-effects.json',JSON.stringify(effects));assert.equal(effects.length,keys.length);for(const e of effects){const a=before.assets.find(a=>a.id===e.id);assert.deepEqual(e,{id:a.id,revision:a.revision,name:a.name});}
}
assert.deepEqual(await(await fetch(upstream+'/api/footage/templates/dynamic-assets')).json(),before);
assert.equal(calls.filter(c=>c.method==='POST').length,(warm?2:keys.length)*2);assert.ok(calls.filter(c=>c.method==='POST').every(c=>(c.path.endsWith('/application')||(warm&&c.path.endsWith('/insert')))));
const first=JSON.parse(await fs.readFile(root+'/first/designs.json')),repeat=JSON.parse(await fs.readFile(root+'/repeat/designs.json'));assert.deepEqual(first,repeat);
await fs.writeFile(root+'/verification.json',JSON.stringify({passed:true,libraryUnchanged:true,twoRunsIdentical:true,savedVersions:JSON.parse(await fs.readFile(root+'/first/verified-effects.json')),calls},null,2));console.log('PASS two real-service runs; only native projections; exact saved versions and entire library unchanged');
}finally{await new Promise(resolve=>server.close(resolve));}
