import {expect,test} from "bun:test";
import type {ApplicationSnapshot} from "./application-history";
import {trialContentFromHistory,trialHistoryUiHints,trialPlacementFromHistory,trialProtectionScope,trialRestoreIssue} from "./trial-history-capability";

const full={x:0,y:0,width:1,height:1};
const transform={scale:.55,centerX:.5,centerY:.5};
function snapshot():ApplicationSnapshot{return {
	application:{assetId:"style-a",assetRevision:3,canvas:{width:1280,height:720,fps:30},placement:full,transform},extras:[],protectedRegions:[],
	samples:[{inputId:"input-a",title:"已标注的原声",transcriptRevision:1,semanticUnits:[],captionSpans:[{startWord:0,endWord:4}],resourceBindings:[]}],
};}
test("restorable standard application retains independently transformed full placement",()=>{
	const saved=snapshot();saved.extras=[{assetId:"style-b",assetRevision:1,instanceId:"icon",placement:full,transform}];
	expect(trialRestoreIssue(saved,"style-a",3)).toBeUndefined();
});
test("partial placement plus transform can restore for primary and extra layers",()=>{
	for(const placement of [{x:0,y:0,width:1,height:.5},{x:0,y:.5,width:1,height:.5},{x:.1,y:.1,width:.5,height:.5}]){
		const primary=snapshot();primary.application.placement=placement;expect(trialRestoreIssue(primary,"style-a",3)).toBeUndefined();
		const extra=snapshot();extra.extras=[{assetId:"style-b",assetRevision:1,instanceId:"icon",placement,transform}];expect(trialRestoreIssue(extra,"style-a",3)).toBeUndefined();
		const untransformed=snapshot();untransformed.extras=[{assetId:"style-b",assetRevision:1,instanceId:"icon",placement}];expect(trialRestoreIssue(untransformed,"style-a",3)).toBeUndefined();
	}
});
test("strict original-canvas extra placement can restore without becoming contain-full",()=>{
	const saved=snapshot();saved.extras=[{assetId:"style-b",assetRevision:1,instanceId:"icon",placement:null}];
	expect(trialRestoreIssue(saved,"style-a",3)).toBeUndefined();
});
test("explicitly disabled binding is restorable and kept in authoritative trial content",()=>{
	const saved=snapshot();saved.samples[0].resourceBindings=[{slotId:"background",assetId:"visual-a",enabled:false}];
	expect(trialRestoreIssue(saved,"style-a",3)).toBeUndefined();
	expect(trialContentFromHistory(saved).entries[0].resourceBindings).toEqual([{slotId:"background",assetId:"visual-a",enabled:false}]);
	saved.samples[0].resourceBindings=[{slotId:"background",assetId:"visual-a",enabled:true}];
	expect(trialRestoreIssue(saved,"style-a",3)).toBeUndefined();
});
test("opaque UI null captions never replace authoritative explicit caption spans",()=>{
	const saved=snapshot();saved.uiState={kind:"moirai-effect-trial-v1",content:{version:1,entries:[{inputId:"input-a",captionSpans:null}],liveInputId:"input-a"}};
	expect(trialContentFromHistory(saved).entries[0].captionSpans).toEqual([{startWord:0,endWord:4}]);
	saved.samples[0].captionSpans=[];
	expect(trialContentFromHistory(saved).entries[0].captionSpans).toBeNull();
});
test("malformed opaque UI data is ignored without losing authoritative content",()=>{
	for(const uiState of [{kind:"moirai-effect-trial-v1"},{kind:"moirai-effect-trial-v1",content:null},{kind:"moirai-effect-trial-v1",content:{version:1,entries:[null,2,{},[]],liveInputId:77},protectionPadding:"invalid"}]){
		const saved=snapshot();saved.uiState=uiState;
		expect(trialContentFromHistory(saved).entries[0].captionSpans).toEqual([{startWord:0,endWord:4}]);
		expect(trialContentFromHistory(saved).liveInputId).toBe("input-a");
		expect(trialHistoryUiHints(uiState).protectionPadding).toBeUndefined();
	}
});

test("custom canvas and text inputs can restore with all current native sample fields",()=>{
 const saved=snapshot();saved.application.canvas={width:1920,height:1080,fps:24};
 expect(trialRestoreIssue(saved,"style-a",3)).toBeUndefined();
 saved.application.inputs={headline:"Custom input"};
 expect(trialRestoreIssue(saved,"style-a",3)).toBeUndefined();
 saved.extras=[{assetId:"style-b",assetRevision:1,instanceId:"extra",placement:full,inputs:{label:"Side note"}}];
 expect(trialRestoreIssue(saved,"style-a",3)).toBeUndefined();
 delete saved.application.inputs;saved.samples[0].soundEvents=[{time:1}];
 expect(trialRestoreIssue(saved,"style-a",3)).toBeUndefined();
});

test("translations and shared/per-design binding arrays restore without flattening or changing word ranges",()=>{
 const saved=snapshot();saved.samples[0].translations=["A translated line."];
 saved.samples[0].resourceBindings=[{slotId:"artwork",assetId:"shared",enabled:true}];
 saved.samples[0].designResourceBindings={draft:[{slotId:"artwork",assetId:"override",enabled:false}]};
 expect(trialRestoreIssue(saved,"style-a",3)).toBeUndefined();
 const content=trialContentFromHistory(saved).entries[0];
 expect(content.translations).toEqual(["A translated line."]);
 expect(content.resourceBindings).toEqual([{slotId:"artwork",assetId:"shared",enabled:true}]);
 expect(content.designResourceBindings).toEqual({draft:[{slotId:"artwork",assetId:"override",enabled:false}]});
 expect(content.captionSpans).toEqual([{startWord:0,endWord:4}]);
 expect(content.transcriptRevision).toBe(1);
});

test("event-only history keeps explicit null transcript and full event evidence and associations",()=>{
 const saved=snapshot();saved.samples[0].transcriptRevision=null;saved.samples[0].semanticUnits=[];saved.samples[0].captionSpans=[];
 const events=[{id:"event-a",kind:"keyword",start:.1,end:1,strength:.8,confidence:.9,sourceId:"input-a",evidence:"manual marker",intent:"emphasis",text:"Event text",captionIndex:null,semanticIndex:null}];
 const sounds=[{id:"beat-a",kind:"beat",start:.3,end:.3,strength:.75,confidence:.8,sourceId:"input-a",evidence:"measured onset"}];
 saved.samples[0].events=events;saved.samples[0].soundEvents=sounds;
 expect(trialRestoreIssue(saved,"style-a",3)).toBeUndefined();const restored=trialContentFromHistory(saved).entries[0];
 expect(restored.transcriptRevision).toBeNull();expect(restored.events).toEqual(events);expect(restored.soundEvents).toEqual(sounds);expect(restored.semanticUnits).toEqual([]);expect(restored.captionSpans).toEqual([]);
});

test("typed placement rules restore but legacy protection has no inferred content binding",()=>{
 const saved=snapshot();saved.uiState={kind:"moirai-effect-trial-v1",protectionPadding:.2};
 saved.protectedRegions=[{id:"speaker",region:{x:.1,y:.2,width:.3,height:.4}}];
 expect(trialPlacementFromHistory(saved)).toEqual({regions:[],binding:"unbound",padding:.2,policy:{safeInset:0,requireFullCoverage:false}});
 saved.placementPadding=0;saved.placementPolicy={safeInset:.04,requireFullCoverage:true};
 expect(trialPlacementFromHistory(saved)).toEqual({regions:[],binding:"unbound",padding:0,policy:{safeInset:.04,requireFullCoverage:true}});
 delete saved.uiState;delete saved.placementPadding;delete saved.placementPolicy;
 expect(trialPlacementFromHistory(saved).padding).toBe(.02);
});

test("typed protection follows its exact sample in multisample history without opaque UI hints",()=>{
 const saved=snapshot();
 saved.samples.push({...structuredClone(saved.samples[0]),inputId:"input-b",title:"Second video"});
 saved.protectedRegions=[{id:"speaker-b",region:{x:.6,y:.1,width:.3,height:.7}}];
 saved.extras=[{assetId:"style-extra",assetRevision:1,instanceId:"icon",placement:full}];
 saved.protectionContext={sample:structuredClone(saved.samples[1]),application:structuredClone(saved.application),extras:structuredClone(saved.extras)};
 saved.uiState={kind:"moirai-effect-trial-v1",content:{version:1,entries:[],liveInputId:"input-a"}};
 const original=structuredClone(saved);
 const placement=trialPlacementFromHistory(saved);
 expect(placement.binding).toBe("bound");expect(placement.regions).toEqual(saved.protectedRegions);
 if(placement.scope===undefined)throw Error("Bound protection must have a scope");
 expect(trialContentFromHistory(saved).liveInputId).toBe("input-b");
 const restored=trialContentFromHistory(saved).entries[1];
 expect(trialProtectionScope({sample:restored,application:saved.application,extras:saved.extras})).toBe(placement.scope);
 delete saved.uiState;
 expect(trialContentFromHistory(saved).liveInputId).toBe("input-b");
 expect(saved.protectedRegions).toEqual(original.protectedRegions);
 delete saved.protectionContext;
 expect(trialPlacementFromHistory(saved).binding).toBe("unbound");expect(trialPlacementFromHistory(saved).regions).toEqual([]);
 expect(saved.protectedRegions).toEqual(original.protectedRegions);
});

test("changed content, canvas, framing or extras cannot reuse bound history protection",()=>{
 const base=snapshot();base.protectedRegions=[{id:"speaker",region:{x:.1,y:.1,width:.2,height:.6}}];
 base.extras=[{assetId:"style-extra",assetRevision:1,instanceId:"icon",placement:full,transform}];
 base.protectionContext={sample:structuredClone(base.samples[0]),application:structuredClone(base.application),extras:structuredClone(base.extras)};
 for(const edit of [
  (s:ApplicationSnapshot)=>{s.samples[0].captionSpans=[{startWord:0,endWord:2}];},
  (s:ApplicationSnapshot)=>{s.samples[0].inputId="input-other";},
  (s:ApplicationSnapshot)=>{s.application.canvas={width:720,height:1280,fps:30};},
  (s:ApplicationSnapshot)=>{s.application.videoRegion={x:0,y:0,width:1,height:.5};},
  (s:ApplicationSnapshot)=>{s.application.inputs={headline:"Changed"};},
  (s:ApplicationSnapshot)=>{s.extras[0].transform={...transform,centerX:.2};},
 ]){
  const changed=structuredClone(base);edit(changed);
  expect(trialPlacementFromHistory(changed).binding).toBe("unbound");
  expect(trialPlacementFromHistory(changed).regions).toEqual([]);
 }
 const moved=structuredClone(base);moved.application.transform={scale:.75,centerX:.1,centerY:.2,rotationDegrees:15};
 expect(trialPlacementFromHistory(moved).binding).toBe("bound");
});

test("native nullable extra defaults roundtrip without invalidating the protected background",()=>{
 const saved=snapshot();saved.protectedRegions=[{id:"face",region:{x:.2,y:.1,width:.3,height:.5}}];
 saved.extras=[{assetId:"extra",assetRevision:1,instanceId:"icon",inputs:{},placement:null,transform:null,captionWidth:null,textWidths:{},attachments:[],intents:null,minDisplaySeconds:null}];
 saved.protectionContext={sample:structuredClone(saved.samples[0]),application:structuredClone(saved.application),extras:structuredClone(saved.extras)};
 const restoredExtra={assetId:"extra",assetRevision:1,instanceId:"icon",placement:null};
 const restoredScope=trialPlacementFromHistory(saved).scope;
 if(restoredScope===undefined)throw Error("Bound protection must have a scope");
 expect(trialProtectionScope({sample:trialContentFromHistory(saved).entries[0],application:saved.application,extras:[restoredExtra]})).toBe(restoredScope);
});

test("primary transform invalidates protection when an extra can follow the primary",()=>{
 const saved=snapshot();saved.protectedRegions=[{id:"face",region:{x:.2,y:.1,width:.3,height:.5}}];
 saved.extras=[{assetId:"extra",assetRevision:1,instanceId:"icon",placement:full,attachments:[{elementId:"icon--shape",relativeTo:"headline",placement:"left",referenceBounds:"text_box",followMotion:true,gap:.02,offsetX:0,offsetY:0}]}];
 saved.protectionContext={sample:structuredClone(saved.samples[0]),application:structuredClone(saved.application),extras:structuredClone(saved.extras)};
 expect(trialPlacementFromHistory(saved).binding).toBe("bound");
 saved.application.transform={...transform,centerX:.2};
 expect(trialPlacementFromHistory(saved).binding).toBe("unbound");
 expect(trialPlacementFromHistory(saved).regions).toEqual([]);
});


test("protection marks invalidate when the reviewed source or event window changes",()=>{
 const saved=snapshot();
 const sample=trialContentFromHistory(saved).entries[0];
 const scope=()=>trialProtectionScope({sample,application:saved.application,extras:saved.extras});
 const initial=scope();
 const altered=structuredClone(sample);altered.inputId="another-source";
 expect(trialProtectionScope({sample:altered,application:saved.application,extras:[]})).not.toBe(initial);
 altered.inputId=sample.inputId;
 altered.semanticUnits=[{startWord:0,endWord:2,intent:"emphasis",keyword:{startWord:0,endWord:1},rationale:"earlier cue"}];
 expect(trialProtectionScope({sample:altered,application:saved.application,extras:[]})).not.toBe(initial);
 altered.semanticUnits=sample.semanticUnits;
 altered.events=[{id:"new-cue",kind:"keyword",start:3,end:4,strength:1,confidence:1,sourceId:"input-a",evidence:"manual",intent:"emphasis",text:"later cue",captionIndex:null,semanticIndex:null}];
 expect(trialProtectionScope({sample:altered,application:saved.application,extras:[]})).not.toBe(initial);
 delete altered.events;altered.layoutPhrases=[{wordSpan:{startWord:0,endWord:2}}];
 expect(trialProtectionScope({sample:altered,application:saved.application,extras:[]})).not.toBe(initial);
 saved.application.minDisplaySeconds=3;expect(scope()).not.toBe(initial);
 delete saved.application.minDisplaySeconds;saved.application.intents=["conclusion"];expect(scope()).not.toBe(initial);
});

test("restoring native content keeps protection scope despite normalized defaults and property order",()=>{
 const saved=snapshot();saved.samples[0].captionSpans=[];
 saved.uiState={kind:"moirai-effect-trial-v1",content:{version:1,entries:[{inputId:"input-a",captionSpans:null}],liveInputId:"input-a"}};
 const restored=trialContentFromHistory(saved).entries[0];
 const live={resourceBindings:[],captionSpans:[],semanticUnits:restored.semanticUnits,inputId:restored.inputId,title:restored.title,transcriptRevision:restored.transcriptRevision,events:[],soundEvents:[],translations:[],designResourceBindings:{}};
 const restoreScope=trialProtectionScope({sample:restored,application:saved.application,extras:[]});
 expect(trialProtectionScope({sample:live,application:{...saved.application,inputs:{},minDisplaySeconds:undefined,intents:undefined,videoRegion:undefined,textWidths:{}},extras:[]})).toBe(restoreScope);
 // Position changes reuse the same source protection, so accepting a position
 // proposal cannot erase the exact marks that prompted it.
 expect(trialProtectionScope({sample:live,application:{...saved.application,transform:{scale:.55,centerX:.25,centerY:.25}},extras:[]})).toBe(restoreScope);
});
