import assert from "node:assert/strict";

const origin="http://127.0.0.1:3000/api/footage/templates";
async function api(path,body) {
  const response=await fetch(`${origin}${path}`,body?{method:"POST",headers:{"Content-Type":"application/json","x-requested-with":"moirai-footage"},body:JSON.stringify(body)}:undefined);
  const value=await response.json();
  assert.equal(response.ok,true,JSON.stringify(value));
  return value;
}
const sourceId="style-pilot-20260923-sparkle-follow";
const original=(await api("/dynamic-assets")).assets.find(a=>a.id===sourceId);
assert.ok(original);
const relation=original.spatialRelations[0];
assert.ok(relation);
const preview=definition=>api("/dynamic-assets/preview",{definition,inputs:{},durationSeconds:2});
const before=await preview(original);
const {definition}=await api("/dynamic-assets/layers",{definition:original,operation:{kind:"remove",layerId:relation.relativeTo}});
const after=await preview(definition);
const oldRegion=before.editingRegions.find(r=>r.id===relation.elementId);
const newRegion=after.editingRegions.find(r=>r.id===relation.elementId);
assert.ok(oldRegion&&newRegion);
for(const key of ["x","y","width","height"]) assert.ok(Math.abs(oldRegion.region[key]-newRegion.region[key])<1e-9,key);
assert.equal((definition.spatialRelations??[]).some(r=>r.relativeTo===relation.relativeTo),false);
const reloaded=(await api("/dynamic-assets")).assets.find(a=>a.id===sourceId);
assert.deepEqual(reloaded,original);
console.log(JSON.stringify({sourceId,child:relation.elementId,before:oldRegion.region,after:newRegion.region,sourceUnchanged:true,saved:false}));
