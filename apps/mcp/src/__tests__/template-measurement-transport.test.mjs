import {test} from "node:test";
import assert from "node:assert/strict";
import {productionMeasurementAttachment,productionCompilationDocument} from "../template-measurement-transport.mjs";
test("versioned native fixtures forward the actual export attachment",()=>{
 const evidence={status:"sampled",outputSha256:"a".repeat(64)};
 assert.deepEqual(productionMeasurementAttachment({textMeasurementContractVersion:1},{textMeasurements:evidence}),{textMeasurements:evidence});
});
test("legacy resumed fixtures remain unmeasured even if the new renderer reports facts",()=>{
 assert.deepEqual(productionMeasurementAttachment({},{textMeasurements:{status:"sampled"}}),{});
 assert.deepEqual(productionMeasurementAttachment({textMeasurementContractVersion:1},{}),{});
});

test("new fixtures preserve native identities while legacy first application retains compilation behavior",()=>{
 const frozen={id:"frozen"},fresh={id:"fresh"};
 assert.equal(productionCompilationDocument({textMeasurementContractVersion:1,compilation:{document:frozen}},{document:fresh}),frozen);
 assert.equal(productionCompilationDocument({compilation:{document:frozen}},{document:fresh}),fresh);
});

test("geometry coverage marker survives transport without upgrading legacy evidence",()=>{
 const fixture={textMeasurementContractVersion:1};
 const current={version:1,geometryCoverage:"constant_record_pose_v1",records:[]};
 assert.equal(productionMeasurementAttachment(fixture,{textMeasurements:current}).textMeasurements,current);
 const legacy={version:1,records:[]};
 assert.equal(productionMeasurementAttachment(fixture,{textMeasurements:legacy}).textMeasurements.geometryCoverage,undefined);
});
