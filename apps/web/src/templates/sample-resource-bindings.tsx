"use client";
import {Button} from "@/components/ui/button";
import {ResourceBindingControls} from "./resource-binding-controls";
import type {VisualAsset} from "./asset-picker";
import type {Template,Sound} from "./types";
import {setTrialBinding,type TrialResourceBindingMap,type TrialDesignBindingMaps} from "./trial-resource-bindings";

/** Shared choices and per-design overrides stay distinct; Rust resolves precedence. */
export function SampleResourceBindings({templates,shared,designs,assets,sounds,onSharedChange,onDesignChange}:{
	templates:Template[];shared:TrialResourceBindingMap;designs:TrialDesignBindingMaps;assets:VisualAsset[];sounds:Sound[];
	onSharedChange:(value:TrialResourceBindingMap)=>void;onDesignChange:(value:TrialDesignBindingMaps)=>void;
}){
	const slots=Array.from(new Map(templates.flatMap(template=>template.resourceSlots.map(slot=>[slot.id,slot] as const))).values());
	return <>
		<p>共用设置用于这份素材的所有设计；每个设计还能单独覆盖。恢复为共用设置时，保留共用的替换或禁用选择。</p>
		<div aria-label="共用素材设置">{slots.map(slot=><ResourceBindingControls key={slot.id} label={`所有设计 · ${slot.description||slot.id}`} slot={slot} assets={assets} sounds={sounds} value={shared[slot.id]} fallback={templates.flatMap(template=>template.resourceBindings).find(binding=>binding.slotId===slot.id)} onChange={value=>onSharedChange(setTrialBinding(shared,slot.id,value))}/>)}</div>
		{Object.keys(shared).filter(id=>!slots.some(slot=>slot.id===id)).map(id=><p key={id}>共用设置中的素材槽 {id} 不在当前设计中。<Button variant="outline" onClick={()=>onSharedChange(setTrialBinding(shared,id,undefined))}>移除无对应槽的共用设置 {id}</Button></p>)}
		<details><summary>按设计单独设置</summary>
			{templates.map(template=><fieldset key={template.id}><legend>{template.name}</legend>{template.resourceSlots.map(slot=><ResourceBindingControls key={slot.id} label={`${template.name} · ${slot.description||slot.id}`} slot={slot} assets={assets} sounds={sounds} value={designs[template.id]?.[slot.id]} fallback={shared[slot.id]??template.resourceBindings.find(binding=>binding.slotId===slot.id)} defaultLabel="沿用共用设置" defaultDescription="使用上方共用设置；未设置共用值时，沿用模板默认。" onChange={value=>onDesignChange({...designs,[template.id]:setTrialBinding(designs[template.id],slot.id,value)})}/>)}</fieldset>)}
			{Object.entries(designs).flatMap(([designId,bindings])=>Object.keys(bindings).filter(slotId=>!templates.some(template=>template.id===designId&&template.resourceSlots.some(slot=>slot.id===slotId))).map(slotId=><p key={`${designId}:${slotId}`}>设计 {designId} 的素材槽 {slotId} 已无对应项。<Button variant="outline" onClick={()=>{const next={...designs};next[designId]=setTrialBinding(next[designId],slotId,undefined);if(!Object.keys(next[designId]).length)delete next[designId];onDesignChange(next);}}>移除无对应的设计设置 {slotId}</Button></p>))}
		</details>
	</>;
}
