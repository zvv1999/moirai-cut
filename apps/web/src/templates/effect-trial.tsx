"use client";
import Link from "next/link";
import {useEffect,useRef,useState} from "react";
import {ArrowLeft,RefreshCw} from "lucide-react";
import {Button} from "@/components/ui/button";
import {DraftPreview} from "./draft-preview";
import {EffectPreview} from "./effect-preview";
import {PlacementAdvisor,type PlacementProtection,type PlacementPolicy} from "./placement-advisor";
import type {EffectPreviewSample,TrialContentController} from "./production-create";
import {ApplicationHistory,type ApplicationHistoryRecord,type ApplicationRestore,type ApplicationSnapshot} from "./application-history";
import type {Template} from "./types";
import {MinDisplayRule} from "./min-display-rule";
import {SizeBindingControls} from "./size-binding-controls";
import {ApplicationTextInputs} from "./application-text-inputs";
import {trialTextValues} from "./trial-text-values";
import {writeTrialBackground} from "./trial-background";
import "./workbench.css";
import {rememberTrialApplication} from "./trial-session";
import {intentChoices} from "./intent-labels";
import {trialRestoreIssue,trialPlacementFromHistory,trialContentFromHistory,trialProtectionScope} from "./trial-history-capability";

import {trialCanvases as canvases,trialPlacements as placements,trialLayoutFromNative,writeTrialLayout,trialExtraPlacement,trialExtraLayoutFromNative,type TrialCanvas,type TrialRegion,type TrialLayout,type TrialFormat,type TrialPlacementChoice,type TrialExtraLayout} from "./trial-layout";

import {writeTrialTransform,type TrialTransform} from "./trial-transform";
function PositionPicker({value,onChange,label}:{value:TrialTransform;onChange:(value:TrialTransform)=>void;label:string}) {
	return <div className="tw-trial-position">
		<span>快速摆放</span>
		<div className="tw-trial-position-grid" role="group" aria-label={label}>
			{([['左上',.25,.25],['上方',.5,.25],['右上',.75,.25],['左侧',.25,.5],['居中',.5,.5],['右侧',.75,.5],['左下',.25,.75],['下方',.5,.75],['右下',.75,.75]] as const).map(([name,centerX,centerY])=><Button key={name} variant="outline" aria-pressed={Math.abs(value.centerX-centerX)<1e-6&&Math.abs(value.centerY-centerY)<1e-6} onClick={()=>onChange({...value,centerX,centerY})}>{name}</Button>)}
		</div>
		<small>移动样式中心，保持当前大小与旋转；可继续微调以适合画面。</small>
	</div>;
}
function IntentPicker({value,onChange,label}:{value?:string[];onChange:(value:string[]|undefined)=>void;label:string}) {
 const selected=value===undefined?'authored':value.length===0?'any':value.length===1?value[0]:'custom';
 return <label>出现语义<select aria-label={label} value={selected} onChange={event=>onChange(event.target.value==='authored'?undefined:event.target.value==='any'?[]:[event.target.value])}>
 <option value="authored">沿用样式规则</option><option value="any">所有语义</option>
 {selected==='custom'&&<option value="custom" disabled>自定义多种语义</option>}
 {intentChoices.map(([id,name])=><option key={id} value={id}>{name}</option>)}
 </select><small>统一设置本次应用的出现语义，原样式不变。</small></label>;
}
function TextWidths({label,elements,value,onChange}:{label:string;elements:Template["elements"];value:Record<string,number>;onChange:(next:Record<string,number>)=>void}) {
 const texts=elements.filter(element=>element.features.representation==="text");
 if(!texts.length)return null;
 return <details className="tw-text-widths"><summary>{label}文字行宽</summary><p>单独调整文字排版宽度，保留字号、位置中心和动效。指定后优先于字幕行宽；关闭可恢复原排版。</p>{texts.map(element=><div key={element.id}>
 <label><input type="checkbox" aria-label={`${label}${element.id}独立行宽`} checked={value[element.id]!==undefined} onChange={event=>{const next={...value};if(event.target.checked)next[element.id]=Math.max(.1,Math.min(1,element.region.width));else delete next[element.id];onChange(next);}}/>{element.description}</label>
 {value[element.id]!==undefined&&<label>占画面宽度<input aria-label={`${label}${element.id}行宽`} type="number" min={0.1} max={1} step={0.01} value={value[element.id]} onChange={event=>{if(Number.isFinite(event.target.valueAsNumber))onChange({...value,[element.id]:event.target.valueAsNumber});}}/></label>}
 </div>)}</details>;
}
type TrialAttachment = NonNullable<Template["composition"]>["spatialRelations"][number] & {referenceBounds:"text_box"};
type ExtraStyle = {minDisplaySeconds?:number;inputs?:Record<string,string>;intents?:string[];assetId:string;assetRevision:number;instanceId:string;placement:TrialExtraLayout["placement"];region?:TrialRegion;transform?:TrialTransform;captionWidth?:number;textWidths?:Record<string,number>;attachments?:TrialAttachment[]};
type StyleChoice = {id:string;revision:number;name:string;purposes?:string[]};
const purposeLabels:Record<string,string>={keyword:"重点词",decorative_text:"花字",caption:"动态字幕",decoration:"装饰素材"};
export function EffectTrial({initialBlurredBackground,assetId,revision,initialLayout,initialTransform,initialCaptionWidth,initialVideoRegion}:{assetId:string;revision:number;initialLayout:TrialLayout;initialTransform?:TrialTransform;initialCaptionWidth?:number;initialVideoRegion?:{x:number;y:number;width:number;height:number};initialBlurredBackground?:boolean}) {
	const [choices,setChoices]=useState<StyleChoice[]>([]);
	const [extras,setExtras]=useState<ExtraStyle[]>([]);
	const [intents,setIntents]=useState<string[]|undefined>();
    const [inputs,setInputs]=useState<Record<string,string>>({});
    const [minDisplaySeconds,setMinDisplaySeconds]=useState<number>();
	const [notice,setNotice]=useState("");
	const [chosen,setChosen]=useState("");
	const [choicePurpose,setChoicePurpose]=useState("all");
	const [choiceQuery,setChoiceQuery]=useState("");
	const filteredChoices=choices.filter(style=>(choicePurpose==="all"||style.purposes?.includes(choicePurpose))&&style.name.toLowerCase().includes(choiceQuery.trim().toLowerCase()));
	const [catalogReady,setCatalogReady]=useState(false);
	const [catalogError,setCatalogError]=useState("");
	useEffect(()=>{
		const controller=new AbortController();
		void (async()=>{try{
			const response=await fetch('/api/footage/templates/dynamic-assets',{signal:controller.signal});
			if(!response.ok)throw Error('无法读取可叠加样式，请刷新页面重试。');
			const data=await response.json() as {assets:StyleChoice[];library:{assetId:string;archived:boolean}[]};
			const raw=new URL(window.location.href).searchParams.get('styles');
			const restored:unknown=raw?JSON.parse(raw):[];
			if(!Array.isArray(restored)||restored.some(value=>!value||typeof value.assetId!=='string'||!Number.isSafeInteger(value.assetRevision)||value.assetRevision<1||typeof value.instanceId!=='string'||!['full','lower','upper','custom','original'].includes(value.placement)))throw Error('组合链接中的样式参数无效，请返回样式库重新试映。');
			if(controller.signal.aborted)return;
			for(const extra of restored){trialTextValues(extra.inputs);if(extra.minDisplaySeconds!==undefined&&(typeof extra.minDisplaySeconds!=='number'||!Number.isFinite(extra.minDisplaySeconds)))throw Error('叠加样式的最短显示参数无效，请重新设置。');}
            const rawMinimum=new URL(window.location.href).searchParams.get('minDisplaySeconds');
            if(rawMinimum!==null&&(!rawMinimum.trim()||!Number.isFinite(Number(rawMinimum))))throw Error('最短显示参数无效，请重新设置。');
            setMinDisplaySeconds(rawMinimum===null?undefined:Number(rawMinimum));
            const rawInputs=new URL(window.location.href).searchParams.get('inputs');
            setInputs(trialTextValues(rawInputs===null?undefined:JSON.parse(rawInputs)));
			setChoices(data.assets.filter(style=>!data.library?.some(entry=>entry.assetId===style.id&&entry.archived)));
			const rawIntents=new URL(window.location.href).searchParams.get('intents');
			const restoredIntents:unknown=rawIntents?JSON.parse(rawIntents):undefined;
			if(restoredIntents!==undefined&&(!Array.isArray(restoredIntents)||restoredIntents.some(value=>typeof value!=='string')))throw Error('出现语义参数无效，请重新选择。');
			const rawWidths=new URL(window.location.href).searchParams.get('textWidths');
            const restoredWidths:unknown=rawWidths?JSON.parse(rawWidths):{};
            if(!restoredWidths||Array.isArray(restoredWidths)||typeof restoredWidths!=='object'||Object.values(restoredWidths).some(width=>typeof width!=='number'||!Number.isFinite(width)))throw Error('文字行宽参数无效，请重新设置。');
            setTextWidths(restoredWidths as Record<string,number>);
            setIntents(restoredIntents as string[]|undefined);setExtras(restored as ExtraStyle[]);setCatalogReady(true);
		}catch(error){if(!controller.signal.aborted)setCatalogError(error instanceof Error?error.message:'无法读取样式');}})();
		return ()=>controller.abort();
	},[]);
	function changeExtras(next:ExtraStyle[]){
		setExtras(next);
		const url=new URL(window.location.href);
		if(next.length)url.searchParams.set('styles',JSON.stringify(next));else url.searchParams.delete('styles');
		window.history.replaceState(window.history.state,'',url);
	}
    const contentSection = useRef<HTMLDivElement>(null);
    const visualSection = useRef<HTMLDivElement>(null);
    const combinationSection = useRef<HTMLFieldSetElement>(null);
    function jumpToTrialSection(target: HTMLElement | null) {
        target?.focus({preventScroll:true});
        target?.scrollIntoView({block:"start"});
    }
	const [layout,setLayout]=useState(initialLayout);
    const {format,canvas,placementChoice,placement}=layout;
    function changeLayout(next:TrialLayout){
        setLayout(next);const url=new URL(window.location.href);writeTrialLayout(url.searchParams,next);window.history.replaceState(window.history.state,"",url);
    }
	const [independent,setIndependent]=useState(!!initialTransform);
	const [transform,setTransform]=useState<TrialTransform>(initialTransform??{scale:1,centerX:0.5,centerY:0.5});
	const [captionWidth,setCaptionWidth]=useState(initialCaptionWidth);
    const [textWidths,setTextWidths]=useState<Record<string,number>>({});
    const [primaryTextLayers,setPrimaryTextLayers]=useState<Template["elements"]>([]);
	const [videoRegion,setVideoRegion]=useState(initialVideoRegion);
    const [blurredBackground,setBlurredBackground]=useState(initialBlurredBackground);
    function changeBlurredBackground(enabled:boolean){
        setBlurredBackground(enabled);const url=new URL(window.location.href);
        writeTrialBackground(url.searchParams,enabled);
        window.history.replaceState(window.history.state,"",url);
    }
	function changeVideoRegion(next:typeof videoRegion){
		setVideoRegion(next);
		const url=new URL(window.location.href);
		for(const [key,param] of [["x","videoX"],["y","videoY"],["width","videoWidth"],["height","videoHeight"]] as const){
			if(next)url.searchParams.set(param,String(next[key]));else url.searchParams.delete(param);
		}
		window.history.replaceState(window.history.state,"",url);
	}
	function changeTransform(next:TrialTransform,enabled=independent) {
		setTransform(next);setIndependent(enabled);
		const url=new URL(window.location.href);
		writeTrialTransform(url.searchParams,enabled?next:undefined);
		window.history.replaceState(window.history.state,"",url);
	}
	function remember(key:string,value:string) {
		const url=new URL(window.location.href);url.searchParams.set(key,value);
		window.history.replaceState(window.history.state,"",url);
	}
	const [template,setTemplate]=useState<Template>();
	const [primaryHasCaption,setPrimaryHasCaption]=useState(false);
	const [error,setError]=useState("");
	const [attempt,setAttempt]=useState(0);
	const [pending,setPending]=useState(false);
	const [historyBusy,setHistoryBusy]=useState(false);
	const [historyContext,setHistoryContext]=useState("");
	const contentController=useRef<TrialContentController|null>(null);
	useEffect(()=>{
		const url=new URL(window.location.href);
		const context=url.searchParams.get("applicationContext")||`trial-${crypto.randomUUID()}`;
		url.searchParams.set("applicationContext",context);window.history.replaceState(window.history.state,"",url);
		setHistoryContext(context);
	},[]);
	const [ready,setReady]=useState(false);
	const [sample,setSample]=useState<EffectPreviewSample>();
	const nativeExtras=extras.map(extra=>({assetId:extra.assetId,assetRevision:extra.assetRevision,instanceId:extra.instanceId,inputs:extra.inputs,minDisplaySeconds:extra.minDisplaySeconds,placement:trialExtraPlacement(extra),transform:extra.transform,captionWidth:extra.captionWidth,textWidths:extra.textWidths,attachments:extra.attachments,intents:extra.intents}));
	const protectionKey=trialProtectionScope({sample,application:{assetId,assetRevision:revision,canvas,placement,inputs,minDisplaySeconds,...(independent?{transform}:{}),captionWidth,textWidths,videoRegion,blurredBackground,intents},extras:nativeExtras});
	const [savedProtection,setSavedProtection]=useState<{scope:string;value:PlacementProtection}>();
	const [protectionNotice,setProtectionNotice]=useState("");
	const [placementPadding,setPlacementPadding]=useState(.02);
    const [placementPolicy,setPlacementPolicy]=useState<PlacementPolicy>({safeInset:0,requireFullCoverage:false});
    const protection:PlacementProtection={regions:savedProtection?.scope===protectionKey?savedProtection.value.regions:[],padding:placementPadding,policy:placementPolicy};
    const [combinationName,setCombinationName]=useState("");
    const [savingCombination,setSavingCombination]=useState(false);
    const [savedCombination,setSavedCombination]=useState<{id:string;name:string;key:string}>();
    const captureRef=useRef<{key:string;definition:Record<string,unknown>&{id:string};idempotencyKey:string}|null>(null);
    const combinationKey=JSON.stringify({template,name:combinationName.trim()});
    const linkKey=JSON.stringify({assetId,revision,canvas,placement,inputs,minDisplaySeconds,independent,transform,captionWidth,textWidths,videoRegion,blurredBackground,intents,extras});
    function captureApplication():ApplicationSnapshot{
        if(!ready||!contentController.current)throw Error("请等待试映内容准备好。");
        const content=contentController.current.snapshot();
        const snapshot:ApplicationSnapshot={
            application:{assetId,assetRevision:revision,canvas,placement,inputs,minDisplaySeconds,...(independent?{transform}:{}),captionWidth,textWidths,videoRegion,blurredBackground,intents},
            extras:nativeExtras,
            samples:content.entries.map(entry=>({...entry,captionSpans:entry.captionSpans??[]})),
            protectedRegions:protection.regions,
            placementPolicy,placementPadding,
            uiState:{kind:"moirai-effect-trial-v1",query:new URL(window.location.href).searchParams.toString(),content},
        };
        if(protection.regions.length){
            const reviewedSample=snapshot.samples.find(entry=>entry.inputId===content.liveInputId);
            if(!reviewedSample||trialProtectionScope({sample:reviewedSample,application:snapshot.application,extras:snapshot.extras})!==protectionKey)throw Error("保护框对应的预览内容已变化，请等待当前素材预览就绪后重新圈选。");
            snapshot.protectionContext={sample:reviewedSample,application:snapshot.application,extras:snapshot.extras};
        }
        return snapshot;
    }
    function restoreIssue(record:ApplicationHistoryRecord):string|undefined{
        return trialRestoreIssue(record.submission,assetId,revision);
    }
    async function restoreApplication(result:ApplicationRestore){
        const unsupported=restoreIssue(result.record);if(unsupported)throw Error(unsupported);
        const saved=result.record.submission;
        const application=saved.application as {assetId:string;assetRevision:number;canvas:TrialCanvas;placement:TrialRegion;minDisplaySeconds?:number;transform?:TrialTransform;captionWidth?:number;textWidths?:Record<string,number>;videoRegion?:typeof videoRegion;blurredBackground?:boolean;intents?:string[];inputs?:Record<string,string>};
        const nextLayout=trialLayoutFromNative(application.canvas,application.placement);
        const nextExtras=saved.extras.map(raw=>{
            const extra=raw as Omit<ExtraStyle,"placement">&{placement?:TrialRegion|null;inputs?:Record<string,string>};
            return {assetId:extra.assetId,assetRevision:extra.assetRevision,instanceId:extra.instanceId,inputs:extra.inputs??{},minDisplaySeconds:extra.minDisplaySeconds??undefined,...trialExtraLayoutFromNative(extra.placement),transform:extra.transform??undefined,captionWidth:extra.captionWidth??undefined,textWidths:extra.textWidths??{},attachments:extra.attachments??[],intents:extra.intents??undefined};
        });
        const restoredProtection=trialPlacementFromHistory(saved);
        const content=trialContentFromHistory(saved);
        if(!contentController.current)throw Error("试映内容尚未就绪，请稍后恢复。");
        const commitContent=await contentController.current.prepareRestore(content,result.template);
        const url=new URL(window.location.href);
        for(const name of ["format","placement","scale","centerX","centerY","rotationDegrees","captionWidth","textWidths","videoX","videoY","videoWidth","videoHeight","blurredBackground","intents","inputs","minDisplaySeconds","styles"])url.searchParams.delete(name);
        writeTrialLayout(url.searchParams,nextLayout);
        if(application.minDisplaySeconds!=null)url.searchParams.set("minDisplaySeconds",String(application.minDisplaySeconds));
        if(Object.keys(application.inputs??{}).length)url.searchParams.set("inputs",JSON.stringify(application.inputs));
        writeTrialTransform(url.searchParams,application.transform);
        if(application.captionWidth!=null)url.searchParams.set("captionWidth",String(application.captionWidth));
        if(application.textWidths)url.searchParams.set("textWidths",JSON.stringify(application.textWidths));
        if(application.videoRegion)for(const [key,param] of [["x","videoX"],["y","videoY"],["width","videoWidth"],["height","videoHeight"]] as const)url.searchParams.set(param,String(application.videoRegion[key]));
        writeTrialBackground(url.searchParams,application.blurredBackground??undefined);
        if(application.intents!=null)url.searchParams.set("intents",JSON.stringify(application.intents));
        if(nextExtras.length)url.searchParams.set("styles",JSON.stringify(nextExtras));
        window.history.replaceState(window.history.state,"",url);
        setLayout(nextLayout);setMinDisplaySeconds(application.minDisplaySeconds??undefined);setInputs(application.inputs??{});setIndependent(!!application.transform);setTransform(application.transform??{scale:1,centerX:.5,centerY:.5});setCaptionWidth(application.captionWidth??undefined);setTextWidths(application.textWidths??{});setVideoRegion(application.videoRegion??undefined);setBlurredBackground(application.blurredBackground??undefined);setIntents(application.intents??undefined);setExtras(nextExtras);
        setSavedProtection(restoredProtection.binding==="bound"&&restoredProtection.scope?{scope:restoredProtection.scope,value:restoredProtection}:undefined);
        setProtectionNotice(restoredProtection.binding==="unbound"?"历史保护框未绑定到可确认的素材与构图，已保留在原历史记录中；当前素材需要重新圈选。":"");
        setPlacementPadding(restoredProtection.padding);setPlacementPolicy(restoredProtection.policy??{safeInset:0,requireFullCoverage:false});
        commitContent();
    }
    const [sharedLink,setSharedLink]=useState<{key:string;url:string;copied:boolean}>();
    async function copyTrialLink(){
        if(!ready||pending||savingCombination||historyBusy)return;
        const url=new URL(window.location.href);
        url.searchParams.set("revision",String(revision));
        const value=url.toString(),key=linkKey;
        try{await navigator.clipboard.writeText(value);setSharedLink({key,url:value,copied:true});}
        catch{setSharedLink({key,url:value,copied:false});}
    }

    async function saveCombination(){
        if(!template||!ready||pending||savingCombination||historyBusy||!combinationName.trim())return;
        setSavingCombination(true);setError("");
        const key=combinationKey;
        const post=async(path:string,body:unknown)=>{
            const response=await fetch('/api/footage/templates/dynamic-assets'+path,{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify(body)});
            const text=await response.text();let result;try{result=JSON.parse(text);}catch{throw Error(text||'保存组合失败');}
            if(!response.ok)throw Error(result.error??'保存组合失败');return result;
        };
        try{
            if(captureRef.current?.key!==key){
                const result=await post('/capture',{template,name:combinationName.trim()});
                captureRef.current={key,definition:result.definition,idempotencyKey:'capture-'+crypto.randomUUID()};
            }
            const captured=captureRef.current!;
            const result=await post('',{definition:captured.definition,baseRevision:0,idempotencyKey:captured.idempotencyKey});
            setSavedCombination({id:result.definition.id,name:result.definition.name,key});
        }catch(error){setError(error instanceof Error?error.message:'保存组合失败');}
        finally{setSavingCombination(false);}
    }

	useEffect(()=>{
		const controller=new AbortController();
		setReady(false);setError("");
		if(!catalogReady)return ()=>controller.abort();
		if(!Number.isSafeInteger(revision)||revision<1) {setError("缺少有效的效果版本，请从效果工作台重新进入。");return;}
        const applicationQuery = new URL(window.location.href).searchParams;
		void (async()=>{
			try {
				const response=await fetch("/api/footage/templates/dynamic-assets/application",{
					method:"POST",headers:{"content-type":"application/json","x-requested-with":"moirai-footage"},
					body:JSON.stringify({assetId,assetRevision:revision,canvas,placement,inputs,minDisplaySeconds,...(independent?{transform}:{}),captionWidth,textWidths,videoRegion,blurredBackground,intents}),signal:controller.signal,
				});
				const result=await response.json();
				if(!response.ok) throw new Error(result.error??"无法准备效果试映");
				let composed=result.template as Template;
				const primaryTexts=composed.elements.filter(element=>element.features.representation==='text');
                const hasCaption=composed.elements.some(element=>element.binding==='sentence'&&element.features.representation==='text');
				for(const extra of extras){
					const inserted=await fetch('/api/footage/templates/dynamic-assets/insert',{
						method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},
						body:JSON.stringify({template:composed,assetId:extra.assetId,assetRevision:extra.assetRevision,instanceId:extra.instanceId,inputs:extra.inputs,minDisplaySeconds:extra.minDisplaySeconds,placement:trialExtraPlacement(extra),transform:extra.transform,captionWidth:extra.captionWidth,textWidths:extra.textWidths,attachments:extra.attachments,intents:extra.intents}),signal:controller.signal,
					});
					const insertion=await inserted.json();
					if(!inserted.ok)throw Error(insertion.error??'无法叠加样式');
					composed=insertion.template;
				}
				if(!controller.signal.aborted){setTemplate(composed);setPrimaryHasCaption(hasCaption);setPrimaryTextLayers(primaryTexts);setReady(true);if(!rememberTrialApplication(assetId,applicationQuery))setNotice("无法暂存试映布局；返回编辑前可复制试映方案链接。");}
			} catch(error) {if(!controller.signal.aborted)setError(error instanceof Error?error.message:"无法准备效果试映");}
		})();
		return ()=>controller.abort();
	},[assetId,revision,canvas,placement,inputs,minDisplaySeconds,attempt,independent,transform,captionWidth,textWidths,videoRegion,blurredBackground,extras,catalogReady,intents]);
	useEffect(()=>{
		if(!pending&&!savingCombination&&!historyBusy)return;
		const guard=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
		window.addEventListener("beforeunload",guard);
		return ()=>window.removeEventListener("beforeunload",guard);
	},[pending,savingCombination,historyBusy]);
	return <div className="template-workbench" onClickCapture={event=>{
		if((pending||savingCombination||historyBusy)&&event.target instanceof Element&&event.target.closest("a[href]")&&!event.metaKey&&!event.ctrlKey){event.preventDefault();setError("请先完成当前内容编辑或等待提交完成。");}
	}}>
		<header className="tw-header"><Link href={`/templates?effect=${encodeURIComponent(assetId)}`} aria-label="返回效果工作台" title="返回效果工作台"><ArrowLeft size={18}/></Link><h1>本次应用 · 效果试映</h1><span>{template?.name} · v{revision}</span></header>
		<main className="tw-effect-workbench">
            <nav className="tw-trial-steps" aria-label="试映操作导航">
                <Button variant="outline" disabled={!ready} onClick={()=>jumpToTrialSection(contentSection.current)}>1 选素材与内容</Button>
                <Button variant="outline" disabled={!ready} onClick={()=>jumpToTrialSection(visualSection.current)}>2 看效果与布局</Button>
                <Button variant="outline" disabled={!catalogReady} onClick={()=>jumpToTrialSection(combinationSection.current)}>3 叠加与复用</Button>
            </nav>
            <div className="tw-trial-reuse-link">
                <Button variant="outline" disabled={!ready||pending||savingCombination||historyBusy} onClick={()=>void copyTrialLink()}>复制试映方案链接</Button>
                <p className="tw-style-guidance">保留样式版本、画幅、位置、行宽与叠加组合。声音和内容标注需在「与 AI 交换试映内容」中单独导入。</p>
                {sharedLink?.key===linkKey&&<>
                    <p role="status">{sharedLink.copied?"试映方案链接已复制。":"无法自动复制，请选择下方链接手动复制。"}</p>
                    {!sharedLink.copied&&<textarea aria-label="试映方案链接" readOnly rows={3} value={sharedLink.url} onFocus={event=>event.currentTarget.select()}/>}
                </>}
            </div>
			<p className="tw-style-guidance">先选择声音或视频，查看样式如何跟随实际文案出现；再调整位置、画幅或叠加其他样式。这里的调整用于本次应用，原样式保持不变。</p>
			{historyContext&&<ApplicationHistory assetId={assetId} contextId={historyContext} disabled={!ready||pending||savingCombination||historyBusy} capture={captureApplication} onRestore={restoreApplication} restoreIssue={restoreIssue} onBusyChange={setHistoryBusy}/>}
			<div ref={visualSection} tabIndex={-1} role="region" aria-label="效果与布局" className="tw-trial-layout tw-trial-step-target">
				<div className="tw-trial-visual" aria-busy={!ready} style={{opacity:ready?1:0.4,pointerEvents:ready?undefined:"none"}}>{template&&<EffectPreview template={template} sample={sample} active={ready}/>}</div>
			<fieldset disabled={pending||savingCombination||historyBusy} className="tw-dynamic-meta">
				<IntentPicker label="主样式出现语义" value={intents} onChange={next=>{setIntents(next);const url=new URL(window.location.href);if(next===undefined)url.searchParams.delete('intents');else url.searchParams.set('intents',JSON.stringify(next));window.history.replaceState(window.history.state,'',url);}}/>
				<label>输出画幅 <select aria-label="试映画幅" value={format} onChange={event=>{const format=event.target.value as TrialFormat;changeLayout({...layout,format,canvas:format==='custom'?canvas:{...canvases[format]}});}}><option value="landscape">横屏 16:9</option><option value="portrait">竖屏 9:16</option><option value="square">方屏 1:1</option><option value="custom">自定画布与帧率</option></select></label>
                <ApplicationTextInputs assetId={assetId} revision={revision} label="主样式" value={inputs} onChange={next=>{setInputs(next);const url=new URL(window.location.href);if(Object.keys(next).length)url.searchParams.set("inputs",JSON.stringify(next));else url.searchParams.delete("inputs");window.history.replaceState(window.history.state,"",url);}}/>
                <MinDisplayRule label="主样式" value={minDisplaySeconds} inherited="沿用各图层与样式的显示规则。" onChange={next=>{setMinDisplaySeconds(next);const url=new URL(window.location.href);if(next===undefined)url.searchParams.delete("minDisplaySeconds");else url.searchParams.set("minDisplaySeconds",String(next));window.history.replaceState(window.history.state,"",url);}}/>
                {format==='custom'&&<div className="tw-trial-transform">{([['width','画布宽度'],['height','画布高度'],['fps','画布帧率']] as const).map(([key,label])=><label key={key}>{label}<input aria-label={label} type="number" step={1} value={canvas[key]} onChange={event=>{if(Number.isFinite(event.target.valueAsNumber))changeLayout({...layout,canvas:{...canvas,[key]:event.target.valueAsNumber}});}}/></label>)}</div>}
				<label>效果区域 <select aria-label="试映效果区域" value={placementChoice} onChange={event=>{const placementChoice=event.target.value as TrialPlacementChoice;changeLayout({...layout,placementChoice,placement:placementChoice==='custom'?placement:{...placements[placementChoice]}});}}><option value="full">完整画布</option><option value="lower">下半画面</option><option value="upper">上半画面</option><option value="custom">自定区域</option></select></label>
                {placementChoice==='custom'&&<div className="tw-trial-transform">{([['x','左侧'],['y','顶部'],['width','宽度'],['height','高度']] as const).map(([key,label])=><label key={key}>{label}（画布比例）<input aria-label={`主样式区域${label}`} type="number" step={.01} value={placement[key]} onChange={event=>{if(Number.isFinite(event.target.valueAsNumber))changeLayout({...layout,placement:{...placement,[key]:event.target.valueAsNumber}});}}/></label>)}</div>}
				<label><input type="checkbox" checked={independent} onChange={event=>changeTransform(transform,event.target.checked)}/> 独立位置、大小与旋转</label>
                {!independent&&placementChoice!=="full"&&<p className="tw-trial-fit-guidance">当前区域会把整个样式等比缩小，文字和装饰也会变小。只想移动位置时，可保持完整画布适配后的字号，再单独摆放。<Button variant="outline" onClick={()=>{changeLayout({...layout,placementChoice:"full",placement:{...placements.full}});changeTransform({...transform,scale:1},true);}}>保持字号，独立摆放</Button></p>}
				{primaryHasCaption&&<>
					<label><input type="checkbox" checked={captionWidth!==undefined} onChange={event=>{const next=event.target.checked?0.85:undefined;setCaptionWidth(next);const url=new URL(window.location.href);if(next===undefined)url.searchParams.delete("captionWidth");else url.searchParams.set("captionWidth",String(next));window.history.replaceState(window.history.state,"",url);}}/> 独立字幕行宽</label>
					{captionWidth!==undefined&&<label>字幕行宽 <output>{Math.round(captionWidth*100)}%</output><input aria-label="字幕行宽" type="range" min={0.1} max={1} step={0.01} value={captionWidth} onChange={event=>{setCaptionWidth(Number(event.target.value));remember("captionWidth",event.target.value);}}/></label>}
				</>}
				<TextWidths label="主样式" elements={primaryTextLayers} value={textWidths} onChange={next=>{setTextWidths(next);const url=new URL(window.location.href);if(Object.keys(next).length)url.searchParams.set("textWidths",JSON.stringify(next));else url.searchParams.delete("textWidths");window.history.replaceState(window.history.state,"",url);}}/>
                {independent&&<p className="tw-style-guidance">先适配所选效果区域，再调整位置、大小与旋转；旋转围绕样式中心，正值顺时针，原有动效一起旋转。</p>}
                {independent&&<PositionPicker label="主样式快速摆放" value={transform} onChange={changeTransform}/>}
				{independent&&<div className="tw-trial-transform">{([
					["scale","效果大小",0.1,4,0.01],
					["centerX","水平中心",0,1,0.01],
					["centerY","垂直中心",0,1,0.01],
				] as const).map(([key,label,min,max,step])=><label key={key}>{label} <output>{Math.round(transform[key]*100)}%</output><input aria-label={label} type="range" min={min} max={max} step={step} value={transform[key]} onChange={event=>changeTransform({...transform,[key]:Number(event.target.value)})}/></label>)}</div>}
                {independent&&<label>旋转角度（°）<input aria-label="旋转角度" type="number" min={-180} max={180} step={1} value={transform.rotationDegrees??0} onChange={event=>{if(Number.isFinite(event.target.valueAsNumber))changeTransform({...transform,rotationDegrees:event.target.valueAsNumber});}}/></label>}
                {protectionNotice&&<p role="status">{protectionNotice}</p>}
                {independent&&<PlacementAdvisor
                    key={protectionKey}
                    application={{assetId,assetRevision:revision,canvas,placement,inputs,minDisplaySeconds,transform,captionWidth,textWidths,videoRegion,blurredBackground,intents}}
                    disabled={!ready||pending||savingCombination||historyBusy}
                    getSnapshot={()=>visualSection.current?.querySelector('canvas')?.toDataURL()}
                    onApply={changeTransform}
                    protection={protection} onProtectionChange={value=>{setSavedProtection({scope:protectionKey,value});if(value.regions.length)setProtectionNotice("");setPlacementPadding(value.padding);if(value.policy)setPlacementPolicy(value.policy);}}
                />}
			</fieldset>
			</div>
			{notice&&<p role="status">{notice}</p>}
			{catalogError&&<p role="alert">{catalogError}</p>}
			{error&&<p role="alert">{error} <Button variant="ghost" size="icon" aria-label="重新准备试映" title="重新准备试映" disabled={pending||savingCombination||historyBusy} onClick={()=>setAttempt(value=>value+1)}><RefreshCw/></Button></p>}
			{!ready&&!error&&!catalogError&&<p role="status">正在准备效果…</p>}
			{template&&<div ref={contentSection} tabIndex={-1} role="region" aria-label="试映素材与内容" className="tw-trial-step-target" hidden={!ready}><DraftPreview template={template} resumeContent active={ready} contentController={contentController} externalBusy={historyBusy} onPendingChange={setPending} onSampleChange={setSample}/></div>}
			<fieldset disabled={pending||savingCombination||historyBusy} className="tw-dynamic-meta tw-trial-composition" aria-label="原视频区域">
				<legend>原视频区域</legend>
				<p>为字幕留出独立空间。原视频{blurredBackground?"按完整比例放入":"裁切填满"}指定区域；字幕的位置、字号与时机不变，可在上方单独调整。{!blurredBackground&&"如果人物被裁切，可在素材内容中的“原视频构图”调整焦点。"}纯音频输入不受影响。</p>
                <label className="tw-trial-source-option"><input type="checkbox" checked={blurredBackground??false} onChange={event=>changeBlurredBackground(event.target.checked)}/> 用原片模糊铺底</label>
                {blurredBackground&&<p className="tw-style-guidance">背景填满留白，前景保持完整比例。选择真实视频后可预览；字幕和花字样式不受影响。</p>}
				<label className="tw-trial-source-option"><input type="checkbox" checked={!!videoRegion} onChange={event=>changeVideoRegion(event.target.checked?{x:0,y:0,width:1,height:0.8}:undefined)}/> 自定原视频区域</label>
				{videoRegion&&<div className="tw-trial-transform">{([["x","左侧"],["y","顶部"],["width","宽度"],["height","高度"]] as const).map(([key,label])=><label key={key}>{label}（画布比例）<input aria-label={`原视频${label}`} type="number" min={key==="width"||key==="height"?0.01:0} max={1} step={0.01} value={videoRegion[key]} onChange={event=>changeVideoRegion({...videoRegion,[key]:event.target.valueAsNumber})}/></label>)}</div>}
			</fieldset>
			<fieldset ref={combinationSection} tabIndex={-1} disabled={pending||savingCombination||historyBusy||!catalogReady} className="tw-dynamic-meta tw-trial-composition tw-trial-step-target" aria-label="叠加样式">
				<legend>叠加样式</legend>
				<p>字幕、重点词和装饰可以一起试映。分别选择区域，再用声音检查出现时机和遮挡。</p>
				<div className="tw-row">
					<label>用途<select aria-label="叠加样式用途" value={choicePurpose} onChange={event=>{setChoicePurpose(event.target.value);setChosen("");}}><option value="all">全部用途</option>{Object.entries(purposeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
					<label>名称<input type="search" aria-label="搜索叠加样式" placeholder="搜索样式名称" value={choiceQuery} onChange={event=>{setChoiceQuery(event.target.value);setChosen("");}}/></label>
				</div>
				{catalogReady&&!filteredChoices.length&&<p role="status">没有匹配的叠加样式，请调整用途或搜索词。</p>}
				<div className="tw-row"><select aria-label="选择叠加样式" value={chosen} onChange={event=>setChosen(event.target.value)}><option value="">选择一个样式</option>{filteredChoices.map(style=><option key={style.id} value={style.id}>{style.name} · v{style.revision}</option>)}</select><Button disabled={!chosen} onClick={()=>{
					const style=choices.find(style=>style.id===chosen);if(!style)return;
					changeExtras([...extras,{assetId:style.id,assetRevision:style.revision,instanceId:`trial-${crypto.randomUUID().replaceAll("-", "")}`,placement:'lower'}]);setChosen('');
				}}>叠加到试映</Button></div>
				{extras.map((extra,index)=><div className="tw-trial-extra" key={extra.instanceId}>
					<span>{choices.find(style=>style.id===extra.assetId)?.name??extra.assetId} · v{extra.assetRevision}</span>
					<IntentPicker label={`叠加样式${index+1}出现语义`} value={extra.intents} onChange={intents=>changeExtras(extras.map((style,i)=>i===index?{...style,intents}:style))}/>
                    <ApplicationTextInputs assetId={extra.assetId} revision={extra.assetRevision} label={`叠加样式${index+1}`} value={extra.inputs??{}} onChange={inputs=>changeExtras(extras.map((style,i)=>i===index?{...style,inputs}:style))}/>
                    <MinDisplayRule label={`叠加样式${index+1}`} value={extra.minDisplaySeconds} inherited="沿用此样式的图层与显示规则，不改变其他样式。" onChange={minDisplaySeconds=>changeExtras(extras.map((style,i)=>i===index?{...style,minDisplaySeconds}:style))}/>
					<select aria-label={`叠加样式${index+1}区域`} value={extra.placement==='original'?'original':extra.region?'custom':extra.placement} onChange={event=>changeExtras(extras.map((style,i)=>i===index?(event.target.value==='original'?{...style,placement:'original',region:undefined,transform:undefined,captionWidth:undefined,textWidths:{}}:event.target.value==='custom'?{...style,placement:'custom',region:{...(trialExtraPlacement(style)??placements.full)}}:{...style,region:undefined,placement:event.target.value as TrialPlacementChoice}):style))}><option value="full">完整画布</option><option value="lower">下半画面</option><option value="upper">上半画面</option><option value="custom">自定区域</option><option value="original">原始画布 · 不适配</option></select>

					<Button variant="ghost" onClick={()=>{
                        const prefix=extra.instanceId+'--';
                        const affected=extras.some(style=>style.attachments?.some(link=>link.relativeTo.startsWith(prefix)));
                        changeExtras(extras.filter((_,i)=>i!==index).map(style=>({...style,attachments:style.attachments?.filter(link=>!link.relativeTo.startsWith(prefix))})));
                        setNotice(affected?'已移除样式，并解除其他样式对它的依附。':'');
                    }} aria-label={`移除叠加样式${index+1}`}>移除</Button>
                    {extra.placement==='original'&&<p className="tw-style-guidance">保留样式原始坐标与行宽，要求输出宽高和帧率与该样式一致。选择此项会取消独立位置、缩放及行宽；如需调整，请选择一个效果区域。</p>}
					{extra.region&&<div className="tw-trial-transform"><small>区域比例：0–1</small>{([['x','左侧'],['y','顶部'],['width','宽度'],['height','高度']] as const).map(([key,label])=><label key={key}>{label}<input aria-label={`叠加样式${index+1}${label}`} type="number" min={key==='width'||key==='height'?0.01:0} max={1} step={0.01} value={extra.region![key]} onChange={event=>changeExtras(extras.map((style,i)=>i===index?{...style,region:{...extra.region!,[key]:event.target.valueAsNumber}}:style))}/></label>)}</div>}
					<fieldset disabled={extra.placement==='original'} className="tw-trial-extra-sizing"><label><input type="checkbox" aria-label={`叠加样式${index+1}独立位置、大小与旋转`} checked={!!extra.transform} onChange={event=>changeExtras(extras.map((style,i)=>i===index?{...style,transform:event.target.checked?{scale:0.65,centerX:0.5,centerY:0.5}:undefined}:style))}/> 独立位置、大小与旋转</label>
					{extra.transform&&<PositionPicker label={`叠加样式${index+1}快速摆放`} value={extra.transform} onChange={transform=>changeExtras(extras.map((style,i)=>i===index?{...style,transform}:style))}/>}
					{extra.transform&&<div className="tw-trial-transform">{([['scale','大小',0.1,4],['centerX','水平中心',0,1],['centerY','垂直中心',0,1]] as const).map(([key,label,min,max])=><label key={key}>{label}<input aria-label={`叠加样式${index+1}${label}`} type="number" min={min} max={max} step={0.01} value={extra.transform![key]} onChange={event=>changeExtras(extras.map((style,i)=>i===index?{...style,transform:{...extra.transform!,[key]:event.target.valueAsNumber}}:style))}/></label>)}</div>}
                    {extra.transform&&<label>旋转角度（°）<input aria-label={`叠加样式${index+1}旋转角度`} type="number" min={-180} max={180} step={1} value={extra.transform.rotationDegrees??0} onChange={event=>{if(Number.isFinite(event.target.valueAsNumber))changeExtras(extras.map((style,i)=>i===index?{...style,transform:{...extra.transform!,rotationDegrees:event.target.valueAsNumber}}:style));}}/></label>}
					{template?.elements.some(element=>element.id.startsWith(extra.instanceId+'--')&&element.binding==='sentence'&&element.features.representation==='text')&&<>
						<label><input type="checkbox" aria-label={`叠加样式${index+1}独立字幕行宽`} checked={extra.captionWidth!==undefined} onChange={event=>changeExtras(extras.map((style,i)=>i===index?{...style,captionWidth:event.target.checked?0.85:undefined}:style))}/> 独立字幕行宽</label>
						{extra.captionWidth!==undefined&&<label>字幕行宽<input aria-label={`叠加样式${index+1}字幕行宽`} type="number" min={0.1} max={1} step={0.01} value={extra.captionWidth} onChange={event=>changeExtras(extras.map((style,i)=>i===index?{...style,captionWidth:event.target.valueAsNumber}:style))}/></label>}
					</>}
                    <TextWidths label={`叠加样式${index+1}`} elements={(template?.elements??[]).filter(element=>element.id.startsWith(extra.instanceId+'--')).map(element=>({...element,id:element.id.slice(extra.instanceId.length+2)}))} value={extra.textWidths??{}} onChange={textWidths=>changeExtras(extras.map((style,i)=>i===index?{...style,textWidths}:style))}/>
                    </fieldset>
                    <details><summary>跟随文字边界</summary>
                        <p>每个图层可跟随主样式或前面已叠加样式的文字。取消后恢复原样式的布局。</p>
                        {template?.elements.filter(element=>element.id.startsWith(extra.instanceId+'--')).map(element=>{
                            const relation=extra.attachments?.find(link=>link.elementId===element.id);
                            const targets=template.elements.filter(target=>target.features.representation==='text'&&!extras.slice(index).some(style=>target.id.startsWith(style.instanceId+'--')));
                            const update=(next:TrialAttachment|undefined)=>changeExtras(extras.map((style,i)=>i===index?{...style,attachments:[...(style.attachments??[]).filter(link=>link.elementId!==element.id),...(next?[next]:[])]}:style));
                            return <div key={element.id}>
                                <label>{element.description||element.id.slice(extra.instanceId.length+2)} 跟随
                                    <select aria-label={`${element.id}跟随文字`} value={relation?.relativeTo??''} onChange={event=>update(event.target.value?{elementId:element.id,placement:'right',gap:0.02,offsetX:0,offsetY:0,referenceBounds:'text_box',followMotion:true,...relation,relativeTo:event.target.value}:undefined)}>
                                        <option value="">原样式布局</option>{targets.map(target=><option key={target.id} value={target.id}>{target.description||target.id.replace(/^trial-[a-f0-9]+--/,'')}</option>)}
                                    </select>
                                </label>
                                {relation&&<div className="tw-trial-transform">
                                    <label>方向<select aria-label={`${element.id}依附方向`} value={relation.placement} onChange={event=>update({...relation,placement:event.target.value})}>{[['right','右侧'],['left','左侧'],['above','上方'],['below','下方'],['overlay','重叠']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
                                    {([['gap','间距',0],['offsetX','水平偏移',-1],['offsetY','垂直偏移',-1]] as const).map(([key,label,min])=><label key={key}>{label}<input aria-label={`${element.id}${label}`} type="number" min={min} max={1} step={0.001} value={relation[key]} onChange={event=>update({...relation,[key]:event.target.valueAsNumber})}/></label>)}
                                </div>}
                                {relation&&<SizeBindingControls label={element.id} value={relation.sizeBinding} eligible={["rectangle","ellipse","star","line"].includes(element.features.representation)&&relation.followMotion===true} onChange={sizeBinding=>update({...relation,sizeBinding})}/>}
                            </div>;
                        })}
                    </details>
				</div>)}
			</fieldset>
            {extras.length>0&&<fieldset className="tw-dynamic-meta" disabled={pending||savingCombination||historyBusy||!ready}>
                <legend>复用这个组合</legend>
                <p>保存当前组合的独立副本，原样式后续修改不会自动同步。下一次仍由新的声音决定出现时机。</p>
                <label>组合名称<input aria-label="组合样式名称" maxLength={100} value={combinationName} onChange={event=>setCombinationName(event.target.value)}/></label>
                <Button disabled={!combinationName.trim()||savedCombination?.key===combinationKey} onClick={()=>void saveCombination()}>{savingCombination?'正在保存组合…':'保存组合为新样式'}</Button>
                {savedCombination&&<p role="status">已保存“{savedCombination.name}”。<Link href={`/templates?effect=${encodeURIComponent(savedCombination.id)}`}>打开组合样式继续编辑</Link>{savedCombination.key!==combinationKey&&' 当前试映已有新的改动。'}</p>}
            </fieldset>}
		</main>
	</div>;
}
