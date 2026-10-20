import type {Template} from "./types";

export type TrialResourceBinding=Template["resourceBindings"][number];
export type TrialResourceBindingMap=Record<string,TrialResourceBinding>;
export type TrialDesignBindingMaps=Record<string,TrialResourceBindingMap>;

export function trialDesignBindingMaps(value:Record<string,TrialResourceBinding[]>={}):TrialDesignBindingMaps{
	return Object.fromEntries(Object.entries(value).map(([id,bindings])=>[id,trialBindingMap(bindings)]));
}
export function trialDesignBindingLists(value:TrialDesignBindingMaps={}):Record<string,TrialResourceBinding[]>{
	return Object.fromEntries(Object.entries(value).map(([id,bindings])=>[id,Object.values(bindings).map(binding=>({...binding}))]));
}
/** A projected draft gets a new ID after an application change. Keep its instance
 * overrides separate from shared bindings and move only that draft's key. */
export function moveTrialDesignBindings<T>(value:Record<string,T>,previousId:string,nextId:string):Record<string,T>{
	if(previousId===nextId||!Object.hasOwn(value,previousId))return value;
	const next={...value,[nextId]:value[nextId]??value[previousId]};delete next[previousId];return next;
}

// Browser form storage keeps the complete native binding, including explicit
// disabling. Omitting an override means "use the template default".
export function trialBindingMap(bindings:Template["resourceBindings"]=[]):TrialResourceBindingMap{
	return Object.fromEntries(bindings.map(binding=>[binding.slotId,{...binding}]));
}
export function trialBindingsForSlots(bindings:TrialResourceBindingMap={},slots:Pick<Template["resourceSlots"][number],"id">[]):Template["resourceBindings"]{
	return Object.values(bindings).filter(binding=>slots.some(slot=>slot.id===binding.slotId)).map(binding=>({...binding}));
}
export function setTrialBinding(bindings:TrialResourceBindingMap={},slotId:string,value:TrialResourceBinding|undefined):TrialResourceBindingMap{
	const next={...bindings};
	if(value)next[slotId]={...value,slotId};else delete next[slotId];
	return next;
}

export function trialBindingChoice(slotId:string,mode:"default"|"replace"|"disabled",current?:TrialResourceBinding,fallback?:TrialResourceBinding):TrialResourceBinding|undefined{
	if(mode==="default")return undefined;
	const assetId=[current?.assetId,fallback?.assetId].find(value=>value&&value!=="unavailable")??"";
	// Rust uses this same placeholder when an optional resource is unavailable;
	// disabled bindings are never resolved to media. Required-slot rules stay native.
	return {slotId,assetId:assetId||(mode==="disabled"?"unavailable":""),enabled:mode!=="disabled"};
}
