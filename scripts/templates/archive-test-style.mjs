import assert from 'node:assert/strict';

// Call only for IDs created by the current successful verification run.
// Failures remain visible so their editable state can be inspected.
export async function archiveTestStyle(base, id) {
 const url=base+'/api/footage/templates/dynamic-assets';
 const response=await fetch(url);assert.ok(response.ok);
 const before=await response.json();
 const definition=before.assets.find(asset=>asset.id===id);assert.ok(definition);
 const entry=before.library.find(entry=>entry.assetId===id);
 const result=await fetch(url+'/archive',{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify({assetId:id,assetRevision:definition.revision,baseRevision:entry?.revision??0,archived:true})});
 assert.ok(result.ok,await result.text());
 const after=await(await fetch(url)).json();
 assert.deepEqual(after.assets.find(asset=>asset.id===id),definition);
 assert.equal(after.library.find(entry=>entry.assetId===id)?.archived,true);
}
