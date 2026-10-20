"use client";
import {AssetPicker,type VisualAsset} from "./asset-picker";
import type {Sound,Template} from "./types";
import {trialBindingChoice,type TrialResourceBinding} from "./trial-resource-bindings";

export function ResourceBindingControls({label,slot,value,fallback,assets,sounds,onChange,defaultLabel="沿用模板默认",defaultDescription}:{
	label:string;slot:Template["resourceSlots"][number];value?:TrialResourceBinding;fallback?:TrialResourceBinding;
	assets:VisualAsset[];sounds:Sound[];onChange:(value:TrialResourceBinding|undefined)=>void;
	defaultLabel?:string;defaultDescription?:string;
}){
	const mode=value===undefined?"default":value.enabled===false?"disabled":"replace";
	const visual=["image","video","visual_media"].includes(slot.representation);
	return <div className="tp-binding-control">
		<label>{label}<select aria-label={`${label}使用方式`} value={mode} onChange={event=>onChange(trialBindingChoice(slot.id,event.target.value as typeof mode,value,fallback))}>
			<option value="default">{defaultLabel}</option><option value="replace">替换素材</option><option value="disabled">本次禁用</option>
		</select></label>
		{mode==="default"&&<small>{defaultDescription??(fallback?.enabled===false?"模板默认已禁用该素材。":"使用模板默认素材与替代规则。")}</small>}
		{mode==="disabled"&&<small>本次不使用这个素材槽，也不回退到默认素材。必需素材是否可禁用，由预览和生产检查。</small>}
		{mode==="replace"&&visual&&<AssetPicker label={`${label}替换素材`} emptyLabel="请选择替换素材" assets={assets.filter(asset=>slot.representation==="visual_media"||asset.kind===slot.representation)} value={value?.assetId??""} onChange={assetId=>onChange({slotId:slot.id,assetId,enabled:true})}/>}
		{mode==="replace"&&slot.representation==="audio"&&<label>替换声音<select aria-label={`${label}替换声音`} value={value?.assetId??""} onChange={event=>onChange({slotId:slot.id,assetId:event.target.value,enabled:true})}>
			<option value="">请选择声音素材</option>{value?.assetId&&!sounds.some(sound=>sound.id===value.assetId)&&<option value={value.assetId}>当前声音未在库中找到</option>}{sounds.map(sound=><option key={sound.id} value={sound.id}>{sound.name}</option>)}
		</select></label>}
		{mode==="replace"&&!visual&&slot.representation!=="audio"&&<label>素材引用<input aria-label={`${label}素材引用`} value={value?.assetId??""} onChange={event=>onChange({slotId:slot.id,assetId:event.target.value,enabled:true})}/></label>}
		{mode==="replace"&&!value?.assetId&&<small role="status">请选择替换素材后再保存或生成成片。</small>}
	</div>;
}
