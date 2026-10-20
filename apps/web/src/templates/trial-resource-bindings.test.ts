import {expect,test} from "bun:test";
import {setTrialBinding,trialBindingChoice,trialBindingMap,trialBindingsForSlots,trialDesignBindingMaps,trialDesignBindingLists,moveTrialDesignBindings} from "./trial-resource-bindings";

test("session and history round trips keep disabled and enabled binding objects",()=>{
	const original=[{slotId:"badge",assetId:"visual-original",enabled:false},{slotId:"photo",assetId:"visual-replacement",enabled:true},{slotId:"sound",assetId:"sound-default"}];
	const restored=trialBindingMap(JSON.parse(JSON.stringify(original)));
	expect(trialBindingsForSlots(restored,[{id:"badge"},{id:"photo"},{id:"sound"}])).toEqual(original);
	expect(trialBindingsForSlots(restored,[{id:"badge"}])).toEqual([original[0]]);
});
test("switching default, replacement and disabled keeps the intended native semantics",()=>{
	const fallback={slotId:"badge",assetId:"visual-original",enabled:true};
	const disabled=trialBindingChoice("badge","disabled",undefined,fallback)!;
	expect(disabled).toEqual({...fallback,enabled:false});
	const replacement=trialBindingChoice("badge","replace",disabled,fallback)!;
	expect(replacement).toEqual(fallback);
	const current=trialBindingMap([disabled]);
	expect(setTrialBinding(current,"badge",trialBindingChoice("badge","default",disabled,fallback))).toEqual({});
	expect(current.badge.enabled).toBe(false);
});
test("an empty optional slot can be disabled without inventing a media asset",()=>{
	expect(trialBindingChoice("optional","disabled")).toEqual({slotId:"optional",assetId:"unavailable",enabled:false});
	expect(trialBindingChoice("optional","replace",{slotId:"optional",assetId:"unavailable",enabled:false})).toEqual({slotId:"optional",assetId:"",enabled:true});
	expect(trialBindingChoice("optional","replace",undefined,{slotId:"optional",assetId:"unavailable",enabled:false})).toEqual({slotId:"optional",assetId:"",enabled:true});
});

test("per-design binding snapshots remain distinct and move with a projected draft ID without retaining unknown old design",()=>{
 const shared=[{slotId:"artwork",assetId:"shared",enabled:true}];
 const overrides={before:[{slotId:"artwork",assetId:"replacement",enabled:false}],empty:[]};
 const maps=trialDesignBindingMaps(overrides);
 expect(trialDesignBindingLists(maps)).toEqual(overrides);
 const moved=moveTrialDesignBindings(maps,"before","after");
 expect(trialDesignBindingLists(moved)).toEqual({after:overrides.before,empty:[]});
 expect(shared).toEqual([{slotId:"artwork",assetId:"shared",enabled:true}]);
 expect(trialDesignBindingLists(moveTrialDesignBindings({...maps,after:{keep:{slotId:"keep",assetId:"restored"}}},"before","after")).after).toEqual([{slotId:"keep",assetId:"restored"}]);
});
