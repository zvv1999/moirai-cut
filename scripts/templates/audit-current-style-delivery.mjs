import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const base=process.env.OPENCUT_BASE_URL??'http://127.0.0.1:3000';
const output=process.env.AUDIT_OUTPUT??'/Users/zhengwei/Downloads/style-delivery-audit-2026-09-28.json';
async function get(path){const r=await fetch(base+'/api/footage/templates'+path);assert.ok(r.ok,`${path}: ${r.status}`);return r.json();}
const [catalog,previews,library,styleReviews]=await Promise.all([get(''),get('/previews'),get('/dynamic-assets'),get('/dynamic-assets/reviews')]);
const batches=new Map(),records=[];
for(const [id,quality] of Object.entries(catalog.quality)){
 if(quality.status!=='qualified')continue;
 const template=catalog.templates.find(template=>template.id===id);assert.ok(template);
 const preview=previews.previews[id];assert.ok(preview?.qualityReview);
 const {review,total,meetsInternalThreshold}=preview.qualityReview;
 assert.equal(template.revision,quality.revision);assert.equal(review.templateRevision,template.revision);
 assert.equal(review.templateId,id);assert.equal(total,quality.score);assert.ok(total>=90&&meetsInternalThreshold);
 assert.deepEqual(review.blockingFindings,[]);
 if(!batches.has(review.batchId))batches.set(review.batchId,await get('/production/'+encodeURIComponent(review.batchId)));
 const item=batches.get(review.batchId).items.find(item=>item.index===review.item);
 assert.equal(item.templateId,id);assert.equal(item.templateRevision,template.revision);assert.equal(item.status,'published');
 assert.equal(item.previews.length,review.evidence.length);assert.ok(item.previews.length>=3);
 const files=[];
 for(const evidence of review.evidence){
  const file=item.previews.find(file=>file.fixture===evidence.fixture);assert.ok(file);
  assert.equal(file.sha256,evidence.sha256);assert.ok(file.decodeVerified&&file.audioQuality.validated);
  const bytes=await fs.readFile(file.path),hash=createHash('sha256').update(bytes).digest('hex');assert.equal(hash,evidence.sha256);
  files.push({fixture:file.fixture,path:file.path,sha256:hash,bytes:bytes.length});
 }
 assert.equal(new Set(files.map(file=>file.sha256)).size,files.length);
 records.push({id,name:template.name,revision:template.revision,score:total,batchId:review.batchId,listened:review.listened,inspection:review.inspection,limitations:review.limitations,files});
}
const archived=new Set(library.library.filter(entry=>entry.archived).map(entry=>entry.assetId));
const styles=library.assets.filter(asset=>!archived.has(asset.id)).map(asset=>({id:asset.id,name:asset.name,revision:asset.revision,purposes:asset.purposes??[],reviewStatus:'not_established_by_template_reviews'}));
const currentStyles=styleReviews.reviews.filter(record=>record.current&&record.evidenceCurrent&&styles.some(style=>style.id===record.submission.application.assetId));
for(const style of styles){
 style.currentApplicationReviews=[];
 for(const record of currentStyles.filter(record=>record.submission.application.assetId===style.id)){
  const {application,review}=record.submission;assert.equal(application.assetRevision,style.revision);
  if(!batches.has(review.batchId))batches.set(review.batchId,await get('/production/'+encodeURIComponent(review.batchId)));
  const item=batches.get(review.batchId).items.find(item=>item.index===review.item);assert.ok(item);
  assert.equal(item.previews.length,review.evidence.length);
  const files=[];
  for(const evidence of review.evidence){
   const file=item.previews.find(file=>file.fixture===evidence.fixture);assert.ok(file);
   assert.equal(file.sha256,evidence.sha256);
   const hash=createHash('sha256').update(await fs.readFile(file.path)).digest('hex');assert.equal(hash,evidence.sha256);
   files.push({fixture:file.fixture,path:file.path,sha256:hash});
  }
  style.currentApplicationReviews.push({id:record.id,score:record.total,meetsInternalThreshold:record.meetsInternalThreshold,listened:record.listened,application,inspection:review.inspection,limitations:review.limitations,files});
 }
 style.reviewStatus=style.currentApplicationReviews.length?'current_application_evidence_verified':'no_current_application_review';
}
const styleReviewAudit={totalHistoricalRecords:styleReviews.reviews.length,currentEvidenceRecords:currentStyles.length,reviewedActiveStyles:styles.filter(style=>style.currentApplicationReviews.length).length,qualifiedApplications:currentStyles.filter(record=>record.meetsInternalThreshold).length,perceptuallyListenedApplications:currentStyles.filter(record=>record.listened).length,unreviewedActiveStyleEntries:styles.filter(style=>!style.currentApplicationReviews.length).length,verifiedStylePreviewCount:styles.reduce((sum,style)=>sum+style.currentApplicationReviews.reduce((n,review)=>n+review.files.length,0),0)};
const report={observedAt:new Date().toISOString(),scope:'Read-only current-version and disk-hash recheck; no new visual scoring or perceptual listening.',reviewedTemplateCount:records.length,verifiedPreviewCount:records.reduce((sum,record)=>sum+record.files.length,0),templates:records,activeStyleEntryCount:styles.length,archivedStyleEntryCount:archived.size,styles};
report.styleReviewAudit=styleReviewAudit;
await fs.writeFile(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({output,reviewedTemplates:report.reviewedTemplateCount,verifiedPreviews:report.verifiedPreviewCount,activeStyleEntries:styles.length,archivedStyleEntries:archived.size}));
