import fs from 'node:fs/promises';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root='/Users/zhengwei/Downloads/source-audio-alignment-20260929';await fs.mkdir(root,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage();await page.route('**/__audio_probe__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Local audio decoder probe</title>'}));
 await page.route('**/__mediabunny_probe__.mjs',r=>r.fulfill({contentType:'text/javascript',path:'apps/web/node_modules/mediabunny/dist/bundles/mediabunny.mjs'}));await page.goto('http://127.0.0.1:3000/__audio_probe__');
 const result=await page.evaluate(async()=>{
  const {Input,BlobSource,ALL_FORMATS,AudioBufferSink}=await import('/__mediabunny_probe__.mjs');
  const response=await fetch('/api/footage/templates/inputs/input-78c44ead8594fa3c15d54b6c539702f4/media/original');if(!response.ok)throw Error(String(response.status));const blob=await response.blob();const input=new Input({source:new BlobSource(blob),formats:ALL_FORMATS});const track=await input.getPrimaryAudioTrack();const sink=new AudioBufferSink(track);const chunks=[],meta=[];
  for await(const chunk of sink.buffers(0)){chunks.push(chunk.buffer.getChannelData(0));meta.push({timestamp:chunk.timestamp,length:chunk.buffer.length,rate:chunk.buffer.sampleRate});if(meta.at(-1).timestamp>6)break;}
  const joined=new Float32Array(chunks.reduce((s,c)=>s+c.length,0));let at=0;for(const c of chunks){joined.set(c,at);at+=c.length;}
  const context=new AudioContext({sampleRate:44100});const decoded=await context.decodeAudioData(await blob.arrayBuffer());const native=decoded.getChannelData(0).slice(0,joined.length);
  function encode(a){const bytes=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(binary);}
  await context.close();input.dispose();return {meta,mediabunny:encode(joined),decodeAudioData:encode(native)};
 });
 for(const name of ['mediabunny','decodeAudioData']){await fs.writeFile(root+'/'+name+'.f32',Buffer.from(result[name],'base64'));delete result[name];}
 await fs.writeFile(root+'/decoder-metadata.json',JSON.stringify(result,null,2));console.log(JSON.stringify({root,firstChunks:result.meta.slice(0,3),last:result.meta.at(-1)}));
}finally{await browser.close();}
