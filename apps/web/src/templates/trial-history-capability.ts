import type {ApplicationSnapshot} from "./application-history";
import type {PlacementProtection} from "./placement-advisor";
import type {EffectPreviewSample,TrialContentSnapshot,TrialSavedSample} from "./production-create";

const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==="object"&&!Array.isArray(value);

/** Whether the current trial controls can reproduce a native history record.
 * This is a UI capability boundary, not a replacement for native validation. */
export function trialRestoreIssue(saved:ApplicationSnapshot,assetId:string,revision:number):string|undefined{
	const application=saved.application;
	if(application.assetId!==assetId||application.assetRevision!==revision)return "此记录属于其他样式版本。请使用相应版本的试映页面或让 Agent 恢复。";
	return undefined;
}

/** Native uiState is opaque. Read only recognized navigation hints and never
 * use them to replace authoritative nonempty annotation arrays. */
export function trialHistoryUiHints(value:unknown){
	const automaticCaptionInputIds=new Set<string>();
	if(!object(value)||value.kind!=="moirai-effect-trial-v1")return {automaticCaptionInputIds};
	const content=object(value.content)&&value.content.version===1?value.content:undefined;
	if(Array.isArray(content?.entries))for(const entry of content.entries){
		if(object(entry)&&typeof entry.inputId==="string"&&entry.captionSpans===null)automaticCaptionInputIds.add(entry.inputId);
	}
	return {automaticCaptionInputIds,
		liveInputId:typeof content?.liveInputId==="string"?content.liveInputId:undefined,
		protectionPadding:typeof value.protectionPadding==="number"&&Number.isFinite(value.protectionPadding)&&value.protectionPadding>=0&&value.protectionPadding<=.25?value.protectionPadding:undefined};
}

export function trialContentFromHistory(saved:ApplicationSnapshot):TrialContentSnapshot{
	const hints=trialHistoryUiHints(saved.uiState);
	const protection=trialPlacementFromHistory(saved);
	const protectedInput=protection.binding==="bound"?String(saved.protectionContext!.sample.inputId):undefined;
	return {version:1,liveInputId:protectedInput??hints.liveInputId??String(saved.samples[0]?.inputId??""),entries:saved.samples.map(entry=>{
		const spans=entry.captionSpans as EffectPreviewSample["captionSpans"];
		return {inputId:String(entry.inputId),title:String(entry.title),translations:entry.translations as string[]|undefined,designResourceBindings:entry.designResourceBindings as Record<string,EffectPreviewSample["resourceBindings"]>|undefined,events:entry.events as EffectPreviewSample["events"],soundEvents:entry.soundEvents as EffectPreviewSample["soundEvents"],transcriptRevision:entry.transcriptRevision==null?null:Number(entry.transcriptRevision),semanticUnits:entry.semanticUnits as EffectPreviewSample["semanticUnits"],
			captionSpans:Array.isArray(spans)&&spans.length===0&&hints.automaticCaptionInputIds.has(String(entry.inputId))?null:spans,
			captionPolicy:entry.captionPolicy as EffectPreviewSample["captionPolicy"],layoutPhrases:entry.layoutPhrases as EffectPreviewSample["layoutPhrases"],focalPoint:entry.focalPoint as EffectPreviewSample["focalPoint"],resourceBindings:entry.resourceBindings as EffectPreviewSample["resourceBindings"]};
	})};
}

/** Typed native rule fields are authoritative; opaque padding is a legacy hint only. */
export function trialPlacementFromHistory(saved:ApplicationSnapshot):PlacementProtection&{binding:"none"|"bound"|"unbound";scope?:string} {
 const context=saved.protectionContext;
 const scope=context?trialProtectionScope(context):undefined;
 const bound=scope!==undefined&&saved.samples.some(sample=>trialProtectionScope({sample,application:saved.application,extras:saved.extras})===scope);
 return {
  regions:bound?saved.protectedRegions:[],
  binding:!saved.protectedRegions.length?"none":bound?"bound":"unbound",
  ...(bound?{scope}:{}),
  padding:saved.placementPadding??trialHistoryUiHints(saved.uiState).protectionPadding??.02,
  policy:saved.placementPolicy??{safeInset:0,requireFullCoverage:false},
 };
}

/** Protection marks belong to the reviewed content/time window, not just a media
 * file. Normalize preview/history defaults and key order so restoring the same
 * content keeps marks while edits to its event window invalidate them. */
export function trialProtectionScope({sample,application,extras}:{sample?:EffectPreviewSample|TrialSavedSample|Record<string,unknown>;application:Record<string,unknown>;extras:unknown[]}):string {
 const content=sample?{...sample,
  events:sample.events??[],soundEvents:sample.soundEvents??[],translations:sample.translations??[],
  semanticUnits:sample.semanticUnits??[],captionSpans:sample.captionSpans??[],layoutPhrases:sample.layoutPhrases??[],
  resourceBindings:sample.resourceBindings??[],designResourceBindings:sample.designResourceBindings??{},
  focalPoint:sample.focalPoint??null,captionPolicy:sample.captionPolicy??null,
 }:null;
 // Moving the primary overlay does not change the protected background unless
 // attached extra overlays can follow it. Content, framing and extras stay pinned.
 const hasAttachedExtras=extras.some(extra=>object(extra)&&Array.isArray(extra.attachments)&&extra.attachments.length>0);
 const context={assetId:application.assetId,assetRevision:application.assetRevision,
  canvas:application.canvas,placement:application.placement,
  inputs:application.inputs??{},minDisplaySeconds:application.minDisplaySeconds??null,
  intents:application.intents??null,captionWidth:application.captionWidth??null,textWidths:application.textWidths??{},
  videoRegion:application.videoRegion??null,blurredBackground:application.blurredBackground??null,
  ...(hasAttachedExtras?{transform:application.transform??null}:{}),
 };
 const normalizedExtras=extras.map(extra=>object(extra)?{...extra,
  inputs:extra.inputs??{},minDisplaySeconds:extra.minDisplaySeconds??null,
  placement:extra.placement??null,transform:extra.transform??null,
  captionWidth:extra.captionWidth??null,textWidths:extra.textWidths??{},attachments:extra.attachments??[],intents:extra.intents??null,
 }:extra);
 return JSON.stringify({sample:content,application:context,extras:normalizedExtras},(_key,value:unknown)=>object(value)?Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,value[key]])):value);
}
