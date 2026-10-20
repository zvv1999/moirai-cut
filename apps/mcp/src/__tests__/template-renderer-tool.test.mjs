import test from 'node:test';
import assert from 'node:assert/strict';
import { callRendererTool } from '../template-renderer-tool.mjs';
const result=(payload,isError=false)=>({isError,content:[{type:'text',text:JSON.stringify(payload)}]});
const loading=result({code:'editor_not_ready',message:'same tab is still loading'},true);
test('waits for the same editor, then permits one export call',async()=>{
 const calls=[],retries=[];let opens=0;
 const client={callTool:async request=>{calls.push(structuredClone(request));return request.name==='open_editor'&&++opens<3?loading:result({ok:true});}};
 const projectId='preview-owned';
 await callRendererTool(client,'open_editor',{projectId},{onReadinessRetry:r=>retries.push(r)});
 await callRendererTool(client,'start_export',{projectId});
 assert.deepEqual(calls.map(c=>c.name),['open_editor','open_editor','open_editor','start_export']);
 assert.ok(calls.every(c=>c.arguments.projectId===projectId));assert.deepEqual(retries.map(r=>r.attempt),[1,2]);
});
test('readiness budget exhausts without starting an export',async()=>{
 const calls=[];const client={callTool:async r=>{calls.push(r.name);return loading;}};
 await assert.rejects(async()=>{await callRendererTool(client,'open_editor',{projectId:'p'});await callRendererTool(client,'start_export',{projectId:'p'});},e=>e.code==='editor_not_ready');
 assert.deepEqual(calls,['open_editor','open_editor','open_editor']);
});
test('never retries other editor failures or an export error',async()=>{
 for(const [name,code] of [['open_editor','project_not_found'],['start_export','editor_not_ready'],['wait_for_sync','editor_not_ready']]){
  let count=0;const client={callTool:async()=>{count++;return result({code},true);}};
  await assert.rejects(callRendererTool(client,name,{projectId:'p'}),e=>e.code===code);assert.equal(count,1);
 }
});
test('transport timeouts and malformed responses are not replayed',async()=>{
 for(const response of [null,{content:[{type:'text',text:'not json'}]}]){
  let count=0;const client={callTool:async()=>{count++;if(!response)throw new Error('transport timeout');return response;}};
  await assert.rejects(callRendererTool(client,'open_editor',{projectId:'p'}),/transport timeout|invalid tool response/);assert.equal(count,1);
 }
});
