import {expect,test} from "bun:test";
import type {TrialContentSnapshot} from "./production-create";
import {trialContentForTemplate} from "./trial-content-snapshot";

const binding={slotId:"artwork",assetId:"visual-a",enabled:false};
function snapshot():TrialContentSnapshot{return {
	version:1,sourceTemplateId:"effect-trial-before",liveInputId:"input-a",
	entries:[{inputId:"input-a",title:"保留声音与标注",transcriptRevision:2,semanticUnits:[],captionSpans:null,
		resourceBindings:[{...binding,enabled:true}],designResourceBindings:{"effect-trial-before":[binding]},
		translations:["Translated line"],events:[{id:"beat",kind:"beat",start:1,end:1,strength:1,confidence:1,sourceId:"input-a",evidence:"manual annotation"}],soundEvents:[]}],
};}
test("content returning to a new projection carries per-design replacements and explicit disabling",()=>{
	const saved=snapshot(),before=JSON.stringify(saved);
	const restored=trialContentForTemplate(JSON.parse(before),"effect-trial-after");
	expect(restored).toEqual({...saved,sourceTemplateId:"effect-trial-after",entries:[{...saved.entries[0],designResourceBindings:{"effect-trial-after":[binding]}}]});
	expect(JSON.stringify(saved)).toBe(before);
	expect(trialContentForTemplate(restored,"effect-trial-after")).toBe(restored);
});
test("legacy content and unrelated design bindings are never guessed or removed",()=>{
	const legacy=snapshot();delete legacy.sourceTemplateId;
	expect(trialContentForTemplate(legacy,"effect-trial-after")).toBe(legacy);
	const saved=snapshot();saved.entries[0].designResourceBindings!.other=[{...binding,assetId:"visual-other"}];
	expect(trialContentForTemplate(saved,"effect-trial-after").entries[0].designResourceBindings).toEqual({"effect-trial-after":[binding],other:[{...binding,assetId:"visual-other"}]});
});
test("conflicting target bindings fail atomically instead of discarding either set",()=>{
	const saved=snapshot();saved.entries[0].designResourceBindings!["effect-trial-after"]=[{...binding,enabled:true}];
	const before=JSON.stringify(saved);
	expect(()=>trialContentForTemplate(saved,"effect-trial-after")).toThrow("无法自动合并");
	expect(JSON.stringify(saved)).toBe(before);
});
test("identity adaptation leaves duplicate slots intact for native validation",()=>{
	const saved=snapshot();saved.entries[0].designResourceBindings!["effect-trial-before"].push({...binding,enabled:true});
	expect(trialContentForTemplate(saved,"effect-trial-after").entries[0].designResourceBindings!["effect-trial-after"]).toEqual([binding,{...binding,enabled:true}]);
});
test("invalid source metadata fails without changing the snapshot",()=>{
	for(const sourceTemplateId of ["",32,null]){
		const saved={...snapshot(),sourceTemplateId} as TrialContentSnapshot;
		const before=JSON.stringify(saved);
		expect(()=>trialContentForTemplate(saved,"effect-trial-after")).toThrow("来源样式标识无效");
		expect(JSON.stringify(saved)).toBe(before);
	}
});
