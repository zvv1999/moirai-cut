"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { Eye, Play, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {ProductionSpeech} from "./production-speech";
import type { Template, TemplateInput, InputDetail, Plan, Sound } from "./types";
import { type VisualAsset } from "./asset-picker";
import {SampleResourceBindings} from "./sample-resource-bindings";
import {trialBindingMap,trialDesignBindingMaps,trialDesignBindingLists,moveTrialDesignBindings,type TrialResourceBindingMap} from "./trial-resource-bindings";
import {trialContentForTemplate, trialContentWithNativeSegments, type TrialContentValidation} from "./trial-content-snapshot";
import {FocusFields, type FocalPoint} from "./focus-fields";
import { SampleContent } from "./sample-content";
import { TranscriptCorrection } from "./transcript-correction";
import {SampleEvents,type SampleTimeEvent,type SampleSoundEvent} from "./sample-events";
import {TranslationContent} from "./translation-content";
import { CaptionContent, type CaptionSpan } from "./caption-content";
import { ProductionContentCheck, type ContentReviewGroup } from "./production-content-check";

import { LayoutPhraseContent, type LayoutPhrase } from "./layout-phrase-content";

export type EffectPreviewSample = {events?:SampleTimeEvent[];soundEvents?:SampleSoundEvent[];translations?:string[];designResourceBindings?:Record<string,Template["resourceBindings"]>;layoutPhrases?:LayoutPhrase[];captionPolicy?:Template["segmentation"];focalPoint?:FocalPoint;inputId:string;title:string;transcriptRevision:number|null;semanticUnits:Plan["semanticUnits"];captionSpans:CaptionSpan[];resourceBindings:Template["resourceBindings"]};
export type TrialSavedSample = Omit<EffectPreviewSample,"resourceBindings"|"captionSpans"> & {captionSpans:CaptionSpan[]|null;resourceBindings?:Template["resourceBindings"]};
export type TrialContentSnapshot = {version:1;sourceTemplateId?:string;entries:TrialSavedSample[];liveInputId:string};
export type TrialContentController = {
	snapshot:()=>TrialContentSnapshot;
	prepareRestore:(snapshot:TrialContentSnapshot, template:Template)=>Promise<()=>void>;
};

async function api<T>(path: string, body?: unknown): Promise<T> {
	const media = body instanceof Blob;
	const response = await fetch(`/api/footage/templates${path}`, {
		method: body === undefined ? "GET" : "POST",
		headers: {
			"content-type": media ? body.type || "application/octet-stream" : "application/json",
			"x-requested-with": "moirai-footage",
		},
		body: media ? body : body === undefined ? undefined : JSON.stringify(body),
	});
	const result = await response.json();
	if (!response.ok) throw new Error(result.error ?? "请求失败");
	return result;
}

export function ProductionCreate({
	onCreated,
	onContentIdentityChange,
	draft,
	onPendingChange,
	onSampleChange,
	resumeContent = false,
	contentController,
	externalBusy = false,
}: {
	onCreated: (batch: { id: string; name: string }, identity: string) => void;
	onContentIdentityChange?: (identity: string) => void;
	draft?: Template;
	resumeContent?: boolean;
	onPendingChange?: (pending: boolean) => void;
	onSampleChange?: (sample:EffectPreviewSample|undefined)=>void;
	contentController?: RefObject<TrialContentController|null>;
	externalBusy?: boolean;
}) {
	const [savedTemplates, setTemplates] = useState<Template[]>([]);
	const templates = draft ? [draft] : savedTemplates;
	const [inputs, setInputs] = useState<TemplateInput[]>([]);
	const [catalogLoading, setCatalogLoading] = useState(true);
	const [catalogError, setCatalogError] = useState("");
	const [assets, setAssets] = useState<VisualAsset[]>([]);
	const [sounds,setSounds] = useState<Sound[]>([]);
	const [previews, setPreviews] = useState<
		Record<
			string,
			{ mediaUrl: string; captionsUrl: string; width: number; height: number }
		>
	>({});
	const [previewId, setPreviewId] = useState("");
	const [bindings, setBindings] = useState<
		Record<string, Record<string, TrialResourceBindingMap>>
	>({});
	const [sharedBindings,setSharedBindings]=useState<Record<string,TrialResourceBindingMap>>({});
	const initialSelection = useRef(!!draft);
	const [savedSelection, setSelected] = useState<string[]>(draft ? [draft.id] : []);
	const selected = draft ? [draft.id] : savedSelection;
	const [savedSingleTemplateId, setSingleTemplateId] = useState(draft?.id ?? "");
	const singleTemplateId = draft?.id ?? savedSingleTemplateId;
	const [samples, setSamples] = useState<
		Record<string, { transcriptRevision:number|null;events?:SampleTimeEvent[];soundEvents?:SampleSoundEvent[]; translations?:string[]; layoutPhrases?:LayoutPhrase[]; captionPolicy?:Template["segmentation"];focalPoint?:FocalPoint; title: string; detail: InputDetail; semanticUnits: Plan["semanticUnits"]; captionSpans: CaptionSpan[] | null }>
	>({});
	const [liveInputId,setLiveInputId]=useState("");
	useEffect(()=>{
		const first=samples[liveInputId] ? [liveInputId,samples[liveInputId]] as const : Object.entries(samples)[0];
		onSampleChange?.(first ? {events:first[1].events,soundEvents:first[1].soundEvents,translations:first[1].translations,focalPoint:first[1].focalPoint,inputId:first[0],title:first[1].title,transcriptRevision:first[1].transcriptRevision,semanticUnits:first[1].semanticUnits,captionSpans:first[1].captionSpans??[],captionPolicy:first[1].captionPolicy,layoutPhrases:first[1].layoutPhrases,resourceBindings:Object.values(sharedBindings[first[0]]??{}),designResourceBindings:trialDesignBindingLists(bindings[first[0]])} : undefined);
	},[samples,liveInputId,onSampleChange,bindings,sharedBindings,draft]);
	const previousDraftId=useRef(draft?.id);
	useEffect(()=>{
		const oldId=previousDraftId.current;previousDraftId.current=draft?.id;
		if(!oldId||!draft||oldId===draft.id)return;
		setBindings(current=>Object.fromEntries(Object.entries(current).map(([inputId,designs])=>[inputId,moveTrialDesignBindings(designs,oldId,draft.id)])));
	},[draft]);
	const [query, setQuery] = useState("");
	const [inputQuery, setInputQuery] = useState("");
	const [name, setName] = useState(draft ? `${draft.name} · 草稿预览` : "模板试产");
	const [submitting, setBusy] = useState(false);
	const [speechBusy,setSpeechBusy]=useState(false);
	const [restoring,setRestoring]=useState(false);
	const [savedContentMessage,setSavedContentMessage]=useState("");
	const busy=submitting||speechBusy||restoring||externalBusy;
	const [editingContent, setEditingContent] = useState(false);
	const [correctionDrafts, setCorrectionDrafts] = useState<Record<string, Record<number, string>>>({});
	const hasCorrections = Object.keys(samples).some((id) => Object.keys(correctionDrafts[id] ?? {}).length > 0);
	const hasIncompleteBindings=Object.keys(samples).some(inputId=>Object.values(sharedBindings[inputId]??{}).some(binding=>binding.enabled!==false&&!binding.assetId.trim())||selected.some(templateId=>Object.values(bindings[inputId]?.[templateId]??{}).some(binding=>binding.enabled!==false&&!binding.assetId.trim())));
	useEffect(() => {
		onPendingChange?.(hasCorrections || hasIncompleteBindings || editingContent || busy);
		return () => onPendingChange?.(false);
	}, [hasCorrections, hasIncompleteBindings, editingContent, busy, onPendingChange]);
	const [loadingInput, setLoadingInput] = useState("");
	const [error, setError] = useState("");
	const [contentCheck, setContentCheck] = useState<{ payload: string; groups: ContentReviewGroup[] } | null>(null);
	const [contentFocus, setContentFocus] = useState<{inputId: string; semanticIndex: number; requestId: number}>();
	const contentCheckRef = useRef<HTMLDivElement>(null);
	const submittingRef = useRef(false);
	const receipt = useRef<{ payload: string; key: string } | null>(null);
	type SavedSample = TrialSavedSample;
	const contentFileRef = useRef<HTMLInputElement>(null);
	function contentKey(){return `moirai.style.trial-content.v1:${window.location.pathname}`;}
	function snapshotContent():TrialContentSnapshot{
		if(!draft)throw new Error("请先选择样式。");
		if(hasIncompleteBindings)throw new Error("请选择替换素材，或改为沿用默认／本次禁用，再保存应用。");
		const entries:SavedSample[]=Object.entries(samples).map(([inputId,sample])=>({
				inputId,title:sample.title,events:sample.events??[],soundEvents:sample.soundEvents??[],translations:sample.translations??[],focalPoint:sample.focalPoint,transcriptRevision:sample.transcriptRevision,
				semanticUnits:sample.semanticUnits,captionSpans:sample.captionSpans,captionPolicy:sample.captionPolicy,layoutPhrases:sample.layoutPhrases,
				resourceBindings:Object.values(sharedBindings[inputId]??{}),designResourceBindings:trialDesignBindingLists(bindings[inputId]),
			}));
				return {version:1,sourceTemplateId:draft.id,entries,liveInputId};
	}
	// Preparing a restore never mutates the current draft. The caller commits only
	// after the native history endpoint has preserved the complete current state.
	if(contentController)contentController.current={
		snapshot(){
			if(editingContent||hasCorrections||hasIncompleteBindings||loadingInput||submitting||speechBusy||restoring)throw new Error("请先完成或取消当前内容编辑，再保存或恢复应用记录。");
			return snapshotContent();
		},
		async prepareRestore(snapshot,template){
			if(editingContent||hasCorrections||hasIncompleteBindings||loadingInput||submitting||speechBusy||restoring)throw new Error("当前内容仍在编辑，未替换任何内容。");
			const validated = snapshot.entries.length ? await api<TrialContentValidation>("/samples/validate",{template,samples:snapshot.entries.map(entry=>({...entry,captionSpans:entry.captionSpans??[]}))}) : {samples: []};
			const content = trialContentWithNativeSegments(snapshot, validated);
			const restored:typeof samples={},restoredBindings:typeof bindings={},restoredShared:typeof sharedBindings={};
			for(const entry of content.entries){
				const detail=await api<InputDetail>(`/inputs/${encodeURIComponent(entry.inputId)}`);
				if(entry.transcriptRevision!=null&&(!detail.transcript||detail.transcript.revision!==entry.transcriptRevision))throw new Error(`${entry.title} 的转写已变化，当前内容未被替换。`);
				restored[entry.inputId]={transcriptRevision:entry.transcriptRevision??null,events:entry.events??[],soundEvents:entry.soundEvents??[],title:entry.title,translations:entry.translations??[],detail,semanticUnits:entry.semanticUnits,captionSpans:entry.captionSpans,captionPolicy:entry.captionPolicy,layoutPhrases:entry.layoutPhrases,focalPoint:entry.focalPoint};
				restoredShared[entry.inputId]=trialBindingMap(entry.resourceBindings);
                restoredBindings[entry.inputId]=trialDesignBindingMaps(entry.designResourceBindings);
			}
			return ()=>{
				setSamples(restored);setBindings(restoredBindings);setSharedBindings(restoredShared);setCorrectionDrafts({});setContentCheck(null);
				setLiveInputId(restored[snapshot.liveInputId]?snapshot.liveInputId:Object.keys(restored)[0]??"");
				setInputs(current=>[...Object.values(restored).map(sample=>sample.detail.input),...current.filter(input=>!restored[input.id])]);
				setSavedContentMessage("已从应用记录恢复素材和内容标注；恢复前的配置与内容已保留在应用历史。");
			};
		},
	};
	function saveContent(){
		setError("");
		try{
			sessionStorage.setItem(contentKey(),JSON.stringify(snapshotContent()));
			setSavedContentMessage("已保存试映内容；本标签页刷新后可恢复。样式和位置仍由当前页面配置决定。");
		}catch{setError("浏览器未能保存试映内容，请保留当前页面后重试。");}
	}
	function exportContent(){
		setError("");
		try {
			const url=URL.createObjectURL(new Blob([JSON.stringify(snapshotContent(),null,2)],{type:"application/json"}));
			const link=document.createElement("a");link.href=url;link.download="moirai-trial-content.json";link.click();
			setTimeout(()=>URL.revokeObjectURL(url),1000);
			setSavedContentMessage("已导出试映内容文件；包含声音引用与标注，不包含媒体文件或样式。");
		}catch{setError("无法导出试映内容，请重试。");}
	}
	async function restoreContent(file?: File, automatic = false){
		if(!draft)return;
		setRestoring(true);setError("");setSavedContentMessage("");
		try{
				let saved:TrialContentSnapshot|null;
			if(file&&file.size>5*1024*1024)throw new Error("试映内容文件不能超过 5 MB。");
			try{saved=JSON.parse(file?await file.text():sessionStorage.getItem(contentKey()+(automatic?":automatic":""))??"null");}
			catch{throw new Error("无法读取试映内容 JSON；当前内容未被替换。");}
			if(!saved)throw new Error("本标签页尚未保存试映内容。");
			if(saved.version!==1||!Array.isArray(saved.entries)||!saved.entries.length||saved.entries.length>8)throw new Error("保存的试映内容格式无效，请重新选择素材。");
			const contentFields = new Set(["inputId","title","transcriptRevision","semanticUnits","captionSpans","captionPolicy","layoutPhrases","resourceBindings","designResourceBindings","translations","events","soundEvents","focalPoint"]);
			for(const entry of saved.entries){
				if(!entry||typeof entry!=="object")throw new Error("试映内容条目格式无效。");
				const unsupported=Object.keys(entry).find(key=>!contentFields.has(key));
					if(unsupported)throw new Error(`试映内容包含不支持的字段：${unsupported}。当前内容未被替换。`);
				}
				saved=trialContentForTemplate(saved,draft.id);
			const restored:typeof samples={},restoredBindings:typeof bindings={},restoredShared:typeof sharedBindings={};
			const validated = await api<TrialContentValidation>("/samples/validate",{template:draft,samples:saved.entries.map(entry=>({...entry,captionSpans:entry?.captionSpans??[]}))});
			saved = trialContentWithNativeSegments(saved, validated);
			for(const entry of saved.entries){
				if(!entry||typeof entry!=="object")throw new Error("试映内容条目格式无效。");
				if(!/^input-[a-zA-Z0-9_-]+$/.test(entry.inputId)||!Array.isArray(entry.semanticUnits))throw new Error("保存的试映内容格式无效。");
				const detail=await api<InputDetail>(`/inputs/${entry.inputId}`);
				if(entry.transcriptRevision!=null&&(!detail.transcript||detail.transcript.revision!==entry.transcriptRevision))throw new Error(`${entry.title} 的转写已变化，请重新选择素材并标注重点；当前内容未被替换。`);
				restored[entry.inputId]={transcriptRevision:entry.transcriptRevision??null,events:entry.events??[],soundEvents:entry.soundEvents??[],title:entry.title,translations:entry.translations??[],detail,semanticUnits:entry.semanticUnits,captionSpans:entry.captionSpans,captionPolicy:entry.captionPolicy,layoutPhrases:entry.layoutPhrases,focalPoint:entry.focalPoint};
				restoredShared[entry.inputId]=trialBindingMap(entry.resourceBindings);
                restoredBindings[entry.inputId]=trialDesignBindingMaps(entry.designResourceBindings);
			}
			setSamples(restored);setBindings(restoredBindings);setSharedBindings(restoredShared);setCorrectionDrafts({});setContentCheck(null);
			setLiveInputId(restored[saved.liveInputId]?saved.liveInputId:Object.keys(restored)[0]);
			setInputs(current=>[...Object.values(restored).map(s=>s.detail.input),...current.filter(i=>!restored[i.id])]);
			setSavedContentMessage(file?(resumeContent?"已导入素材引用、内容标注和分段，并核对当前转写版本。已完成内容将自动暂存，可继续编辑。":"已导入素材引用、内容标注和分段，并核对当前转写版本。可继续编辑；保存后才能在本标签页刷新恢复。"):automatic?"已自动恢复上次试映内容，并核对当前转写版本。":"已恢复素材、内容标注和素材绑定，并核对当前转写版本。");
		}catch(e){setError(e instanceof Error?e.message:String(e));}
		finally{setRestoring(false);}
	}
    const resumeStarted = useRef(false);
    const resumedContentExists = useRef(false);
    const [resumeReady,setResumeReady] = useState(false);
    useEffect(()=>{
        if(!resumeContent||!draft||resumeStarted.current)return;
        resumeStarted.current=true;
        try {
            if(sessionStorage.getItem(contentKey()+":automatic")) {
                void restoreContent(undefined,true).finally(()=>setResumeReady(true));
            } else setResumeReady(true);
        } catch { setError("无法读取自动暂存的试映内容；仍可手动选择素材。");setResumeReady(true); }
    },[resumeContent,draft]);
    useEffect(()=>{
        if(!resumeContent||!resumeReady||!draft||busy||editingContent||hasCorrections||hasIncompleteBindings||loadingInput)return;
        try {
            const key=contentKey()+":automatic";
            if(Object.keys(samples).length){
                sessionStorage.setItem(key,JSON.stringify(snapshotContent()));
                resumedContentExists.current=true;
            } else if(resumedContentExists.current){
                sessionStorage.removeItem(key);
                resumedContentExists.current=false;
            }
        } catch { setError("自动暂存失败；离开前请导出试映内容 JSON，避免丢失选择和标注。"); }
    },[resumeContent,resumeReady,samples,bindings,sharedBindings,liveInputId,draft,busy,editingContent,hasCorrections,hasIncompleteBindings,loadingInput]);
	async function refresh() {
		setCatalogLoading(true);
		setCatalogError("");
		setError("");
		try {
			const [library, source, visuals, rendered] = await Promise.all([
				api<{ templates: Template[];sounds?:Sound[] }>(""),
				api<{ inputs: TemplateInput[] }>("/inputs"),
				api<{ assets: VisualAsset[] }>("/assets"),
				api<{ previews: typeof previews }>("/previews"),
			]);
			setTemplates(draft ? [draft] : library.templates);
			setInputs(source.inputs);
			setAssets(visuals.assets);
			setSounds(library.sounds??[]);
			setPreviews(draft ? {} : rendered.previews);
			if (!initialSelection.current) {
				initialSelection.current = true;
				const available = draft ? [draft] : library.templates;
				const requested = draft?.id ?? new URLSearchParams(window.location.search).get("template");
				setSingleTemplateId(requested ?? "");
				if (requested && available.some((t) => t.id === requested)) {
					setSelected([requested]);
					setPreviewId(requested);
					setName(`${available.find((t) => t.id === requested)!.name} · ${draft ? "草稿预览" : "成片"}`);
				} else if (requested) {
					setError("找不到所选模板，请返回模板库重新选择。");
				}
			}
		} catch (e) {
			setCatalogError(e instanceof Error ? e.message : String(e));
		} finally {
			setCatalogLoading(false);
		}
	}
	useEffect(() => {
		void refresh();
	}, []);
	async function addInput(input:TemplateInput,provided?:InputDetail,eventsOnly=false){
			const detail = provided ?? await api<InputDetail>(`/inputs/${input.id}`);
            if(eventsOnly||!detail.transcript?.words.length){
                setSamples(current=>({...current,[input.id]:{title:input.name,detail,transcriptRevision:null,semanticUnits:[],captionSpans:[],events:[],soundEvents:[]}}));return;
            }
			const template = templates.find((t) => selected.includes(t.id));
			if (!template) throw new Error("请先选择模板。");
			const plan = await api<Plan>("/plan", {
				template, words: detail.transcript.words, durationSeconds: input.durationSeconds,
				title: input.name, translations: [], semanticUnits: [], captionSpans: [],
			});
			setSamples((current) => ({
				...current,
				[input.id]: { title: input.name, detail, transcriptRevision:detail.transcript!.revision,semanticUnits: plan.semanticUnits, captionSpans: null },
			}));
	}
    async function changeTimingSource(inputId:string,useTranscript:boolean){
        if(!useTranscript){setCorrectionDrafts(current=>{const next={...current};delete next[inputId];return next;});setContentCheck(null);setSamples(current=>({...current,[inputId]:{...current[inputId],transcriptRevision:null,semanticUnits:[],captionSpans:[],captionPolicy:undefined,layoutPhrases:[],translations:[]}}));return;}
        setEditingContent(true);setError("");
        try{
            const detail=await api<InputDetail>(`/inputs/${encodeURIComponent(inputId)}`);
            if(!detail.transcript?.words.length)throw Error("当前素材还没有词级转写，可先使用声音与画面事件。");
            const template=templates.find(template=>selected.includes(template.id));if(!template)throw Error("请先选择模板。");
            const sample=samples[inputId],plan=await api<Plan>("/plan",{template,words:detail.transcript.words,durationSeconds:detail.input.durationSeconds,title:sample.title,semanticUnits:[],captionSpans:[],translations:[],events:sample.events??[],soundEvents:sample.soundEvents??[]});
            setSamples(current=>({...current,[inputId]:{...current[inputId],detail,transcriptRevision:detail.transcript!.revision,semanticUnits:plan.semanticUnits,captionSpans:null}}));
        }catch(e){setError(e instanceof Error?e.message:"无法接入当前转写");}finally{setEditingContent(false);}
    }
	async function toggleInput(input: TemplateInput) {
		if (samples[input.id]) {
			setCorrectionDrafts((current) => { const next = { ...current }; delete next[input.id]; return next; });
			setSamples((current) => {
				const next = { ...current };
				delete next[input.id];
				return next;
			});
			return;
		}
		setLoadingInput(input.id);
		setError("");
		try {
			await addInput(input);
		} catch (e) {
			setError(String(e));
		} finally {
			setLoadingInput("");
		}
	}
	const submission = {
				previewOnly: true,
				name: name.trim(),
				brief: "工作台选择模板与实测转写输入，自动生成独立可编辑样例。",
				designs: templates.filter(template => selected.includes(template.id)).map(template => ({template, baseRevision: template.revision})),
				samples: Object.entries(samples).map(([inputId, sample]) => ({
					inputId,
					title: sample.title,
                    translations:sample.translations??[],events:sample.events??[],soundEvents:sample.soundEvents??[],
					focalPoint: sample.focalPoint,
					transcriptRevision: sample.transcriptRevision,
					semanticUnits: sample.semanticUnits,
					captionSpans: sample.captionSpans ?? [], captionPolicy: sample.captionPolicy, layoutPhrases: sample.layoutPhrases,
                    resourceBindings:Object.values(sharedBindings[inputId]??{}),
                    designResourceBindings:Object.fromEntries(Object.entries(trialDesignBindingLists(bindings[inputId])).filter(([id])=>selected.includes(id))),
				})),
			};
	const submissionIdentity = JSON.stringify(submission);
	useEffect(() => { onContentIdentityChange?.(submissionIdentity); }, [submissionIdentity, onContentIdentityChange]);
	const currentContentCheck = contentCheck?.payload === submissionIdentity ? contentCheck : null;
	useEffect(() => {
		if (currentContentCheck) contentCheckRef.current?.scrollIntoView({block: "center", behavior: "smooth"});
	}, [currentContentCheck]);
	function reviewContent(inputId: string, semanticIndex: number) {
		setLiveInputId(inputId);
		setContentFocus(current => ({inputId, semanticIndex, requestId: (current?.requestId ?? 0) + 1}));
	}
	async function submit(allowMissingKeywords = false) {
		if (submittingRef.current || busy || editingContent || loadingInput || !selected.length || !Object.keys(samples).length || !name.trim()) return;
		if (submission.designs.length !== selected.length) { setError("所选模板已变化，请刷新并重新选择。"); return; }
		if (hasCorrections) { setError("请先保存或撤销原文校正。"); return; }
		if (hasIncompleteBindings) {setError("请选择替换素材，或改为沿用默认／本次禁用。");return;}
		submittingRef.current = true;
		setBusy(true);
		setError("");
		try {
			const payload = submission;
			const serialized = JSON.stringify(payload);
			const groups: ContentReviewGroup[] = [];
			for (const design of payload.designs) {
				const validated = await api<{samples: {inputId: string; plan: Plan}[]}>("/samples/validate", {
					template: design.template,
					samples: payload.samples.map(entry => ({...entry, designResourceBindings: Object.fromEntries(Object.entries(entry.designResourceBindings).filter(([id]) => id === design.template.id))})),
				});
				for (const result of validated.samples) {
					const issues = (result.plan.contentIssues ?? []).filter(issue => issue.code === "missing_keyword");
					if (result.plan.warnings.some(warning => warning.startsWith("content_missing_keyword:")) && !result.plan.contentIssues) throw Error("素材服务版本需要更新，请重启素材服务后重试；当前内容已保留。");
					if (issues.length) groups.push({templateId: design.template.id, templateName: design.template.name, inputId: result.inputId, inputTitle: payload.samples.find(entry => entry.inputId === result.inputId)!.title, issues});
				}
			}
			if (groups.length && !(allowMissingKeywords && contentCheck?.payload === serialized)) {
				setContentCheck({payload: serialized, groups});
				return;
			}
			setContentCheck(null);
			if (receipt.current?.payload !== serialized)
				receipt.current = {
					payload: serialized,
					key: `workbench-${crypto.randomUUID()}`,
				};
			const batch = await api<{ id: string; name: string }>(
				"/production/author",
				{ ...payload, idempotencyKey: receipt.current.key },
			);
			onCreated(batch, serialized);
		} catch (e) {
			setError(String(e));
		} finally {
			submittingRef.current = false;
			setBusy(false);
		}
	}
	const slots = templates
		.filter((template) => selected.includes(template.id))
		.flatMap((template) => template.resourceSlots.map((slot) => ({ ...slot, templateId: template.id, templateName: template.name,defaultBinding:template.resourceBindings.find(binding=>binding.slotId===slot.id) })));
	return (
		<section className="tp-create" aria-label={singleTemplateId ? "选择素材与内容" : "新建生产批次"}>
			<div className="tp-toolbar">
				<h2>{singleTemplateId ? "选择素材与内容" : "新建生产批次"}</h2>
				<Button
					variant="ghost"
					size="icon"
					title="刷新模板和素材"
					aria-label="刷新模板和素材"
					disabled={busy || catalogLoading}
					onClick={() => void refresh()}
				>
					<RefreshCw />
				</Button>
			</div>
			{!draft&&<label>
				{singleTemplateId ? "任务名称" : "批次名称"}
				<input
					value={name}
					disabled={busy}
					onChange={(e) => setName(e.target.value)}
				/>
			</label>}

			<div className={`tp-create-columns${draft ? " tp-trial-inputs" : ""}`}>
				{!draft&&<fieldset disabled={busy || editingContent}>
					<legend>{singleTemplateId ? "当前模板" : `模板 · 已选 ${selected.length}`}</legend>
					{singleTemplateId && !draft && <Link href={`/templates/compositions?template=${encodeURIComponent(singleTemplateId)}`}>返回编辑模板</Link>}
					<label className="tp-search" hidden={!!singleTemplateId}>
						<Search size={16} />
						<input
							aria-label="搜索生产模板"
							placeholder="搜索名称或标签"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
					</label>
					<div className="tp-selection-list">
						{templates
							.filter((t) => !singleTemplateId || t.id === singleTemplateId)
							.filter((t) =>
								`${t.name} ${t.tags.join(" ")}`
									.toLowerCase()
									.includes(query.toLowerCase()),
							)
							.map((t) => (
								<div key={t.id}>
									<label className="tp-choice">
										<input
											type="checkbox"
											disabled={!!singleTemplateId}
											checked={selected.includes(t.id)}
											onChange={(e) =>
												setSelected((current) =>
													e.target.checked
														? [...current, t.id]
														: current.filter((id) => id !== t.id),
												)
											}
										/>
										<span>
											{t.name}
											<small>
												{t.canvas.width} × {t.canvas.height}
											</small>
										</span>
									</label>
									{previews[t.id] ? (
										<Button
											variant="link"
											onClick={() => setPreviewId(t.id)}
											aria-label={`预览 ${t.name}`}
										>
											<Play />
											已生成样例
										</Button>
									) : !draft ? (
										<small>当前版本暂无成片</small>
									) : null}
								</div>
							))}
					</div>
					{previews[previewId] && (
						<figure className="tp-template-preview">
							<video
								key={previews[previewId].mediaUrl}
								src={previews[previewId].mediaUrl}
								controls
								playsInline
								preload="metadata"
								style={{
									aspectRatio: `${previews[previewId].width} / ${previews[previewId].height}`,
								}}
							>
								<track
									kind="captions"
									src={previews[previewId].captionsUrl}
									srcLang="zh"
									label="字幕"
								/>
							</video>
							<figcaption>
								{templates.find((template) => template.id === previewId)?.name}
							</figcaption>
						</figure>
					)}
				</fieldset>}
                <ProductionSpeech api={api} disabled={externalBusy||submitting||restoring||editingContent||hasCorrections||hasIncompleteBindings||!!loadingInput||!selected.length||Object.keys(samples).length>=8} onBusyChange={setSpeechBusy} onReady={async(input,detail,eventsOnly)=>{
                    if(!samples[input.id])await addInput(input,detail,eventsOnly);
                    setInputs(current=>[input,...current.filter(item=>item.id!==input.id)]);
                    setLiveInputId(input.id);
                }}/>
				<fieldset disabled={busy || editingContent || !!loadingInput}>
					<legend>输入素材 · 已选 {Object.keys(samples).length} / 8</legend>
					{catalogLoading && <p role="status">正在读取素材列表…</p>}
					{catalogError && <p role="alert">素材列表读取失败：{catalogError}。可点击上方刷新重试。</p>}
					{!catalogLoading && !catalogError && !inputs.length && <p>还没有声音或视频输入。可点击“导入音频或视频”，或展开“生成配音”；准备完成后会自动加入当前试映。</p>}
					<label className="tp-search"><Search size={16}/><input aria-label="搜索输入素材" placeholder="按名称搜索素材" value={inputQuery} onChange={event => setInputQuery(event.target.value)}/></label>
					{inputQuery && !inputs.some(input => input.name.toLowerCase().includes(inputQuery.toLowerCase())) && <p role="status">没有匹配的素材，换个名称试试。</p>}
					<div className="tp-selection-list">
						{inputs.filter(input => !!samples[input.id] || input.name.toLowerCase().includes(inputQuery.toLowerCase())).map((input) => (
							<div key={input.id}>
								<label className="tp-choice">
									<input
										type="checkbox"
										checked={!!samples[input.id]}
										disabled={
											!samples[input.id] && Object.keys(samples).length >= 8
										}
										onChange={() => void toggleInput(input)}
									/>
									<span>
										{input.name}
										<small>
											{input.durationSeconds.toFixed(1)} 秒 ·{" "}
											{input.mediaKind === "video" ? "视频" : "音频"}
										</small>
									</span>
								</label>
								{samples[input.id]&&onSampleChange&&<Button variant="ghost" size="icon" aria-label={`预览 ${input.name}`} title={`预览 ${input.name}`} aria-pressed={input.id===(samples[liveInputId]?liveInputId:Object.keys(samples)[0])} onClick={()=>setLiveInputId(input.id)}><Eye/></Button>}
								{samples[input.id] && (
									<label className="tp-sample-title">
										成片标题
										<input
											value={samples[input.id].title}
											onChange={(e) =>
												setSamples((current) => ({
													...current,
													[input.id]: {
														...current[input.id],
														title: e.target.value,
													},
												}))
											}
										/>
									</label>
								)}
							</div>
						))}
					</div>
				</fieldset>
			</div>
			{draft&&<div>
				<p>{resumeContent?"已完成的素材选择与内容标注会在本标签页自动暂存，返回或刷新后校验恢复。下方可另存手动快照；手动恢复会替换当前素材与标注。":"试映内容可保存在本标签页，刷新后手动恢复；恢复会替换当前素材与标注。"}</p>
				<Button variant="outline" disabled={busy||editingContent||hasCorrections||hasIncompleteBindings||!!loadingInput||!Object.keys(samples).length} onClick={saveContent}>保存试映内容</Button>{" "}
				<Button variant="outline" disabled={busy||editingContent||hasCorrections||hasIncompleteBindings||!!loadingInput} onClick={()=>void restoreContent()}>{restoring?"正在恢复…":"恢复试映内容"}</Button>
				<details>
					<summary>与 AI 交换试映内容</summary>
					<p>导出后可让 AI 调整重点和字幕分段，再导入继续编辑。文件只引用当前素材库中的声音；导入会替换当前选中的声音与标注，不改变样式。</p>
					<div className="flex flex-wrap gap-2">
						<Button variant="outline" disabled={busy||editingContent||hasCorrections||hasIncompleteBindings||!!loadingInput||!Object.keys(samples).length} onClick={exportContent}>导出试映内容 JSON</Button>
						<Button variant="outline" disabled={busy||editingContent||hasCorrections||hasIncompleteBindings||!!loadingInput} onClick={()=>contentFileRef.current?.click()}>导入试映内容 JSON</Button>
					</div>
					<input ref={contentFileRef} hidden type="file" accept=".json,application/json" aria-label="导入试映内容文件" onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value="";if(file)void restoreContent(file);}} />
				</details>
				{savedContentMessage&&<p role="status">{savedContentMessage}</p>}
			</div>}
			{Object.entries(samples).map(([inputId, sample]) => (
				<fieldset key={inputId} disabled={busy || editingContent} className="tp-content-review">
					<legend>{sample.title} · 内容</legend>
                    {sample.detail.input.mediaKind==='video'&&<details><summary>原视频构图</summary><p>焦点属于这份视频素材，用于不同画幅的裁切，不会改变字幕或花字样式。</p><FocusFields label={sample.title} value={sample.focalPoint} onChange={focalPoint=>setSamples(current=>({...current,[inputId]:{...current[inputId],focalPoint}}))}/></details>}
                    <label>时间依据<select aria-label={`${sample.title}时间依据`} value={sample.transcriptRevision===null?'events':'transcript'} onChange={e=>void changeTimingSource(inputId,e.target.value==='transcript')}><option value="transcript">词级转写与内容标注</option><option value="events">仅声音与画面事件</option></select></label>
                    <small>切换为仅事件时，清除这份应用的文字重点、字幕分段、译文和同排标注；原声音文件及已标注事件保留。</small>
                    <SampleEvents inputId={inputId} duration={sample.detail.input.durationSeconds} events={sample.events??[]} soundEvents={sample.soundEvents??[]} onChange={(events,soundEvents)=>setSamples(current=>({...current,[inputId]:{...current[inputId],events,soundEvents}}))}/>
                    {sample.transcriptRevision===null&&!sample.events?.length&&!sample.soundEvents?.length&&<p role="status">仅事件模式需要至少一个声音或画面事件，填写后即可预览和保存。</p>}
                    {sample.transcriptRevision!==null&&sample.detail.transcript&&<>
					{!!sample.translations?.length&&<p role="status">逐句译文已固定原文和字幕分段。若要调整，请先清除译文；重点词与同排样式仍可编辑。</p>}
                    <fieldset disabled={!!sample.translations?.length} className="tp-translation-source">
					<TranscriptCorrection inputId={inputId} transcript={sample.detail.transcript!}
						edits={correctionDrafts[inputId] ?? {}}
						onEdit={(edits) => setCorrectionDrafts((current) => ({ ...current, [inputId]: edits }))}
						onBusyChange={setEditingContent}
						onSaved={(transcript) => setSamples((current) => ({ ...current, [inputId]: { ...current[inputId], layoutPhrases: [],transcriptRevision:transcript.revision, detail: { ...current[inputId].detail, transcript } } }))} />
					</fieldset>
                    <SampleContent words={sample.detail.transcript!.words}
                        focusRequest={contentFocus?.inputId === inputId ? contentFocus : undefined}
						audioUrl={`/api/footage/templates/inputs/${encodeURIComponent(inputId)}/media/audio`}
						onBusyChange={setEditingContent}
						units={sample.semanticUnits}
						onChange={(semanticUnits) => setSamples((current) => ({ ...current, [inputId]: { ...current[inputId], semanticUnits } }))} />
					<LayoutPhraseContent words={sample.detail.transcript!.words} phrases={sample.layoutPhrases??[]}
						template={templates.find(template=>selected.includes(template.id))} units={sample.semanticUnits}
						spans={sample.captionSpans} policy={sample.captionPolicy} duration={sample.detail.input.durationSeconds} title={sample.title}
						onBusyChange={setEditingContent} onChange={layoutPhrases=>setSamples(current=>({...current,[inputId]:{...current[inputId],layoutPhrases}}))}/>
					<fieldset disabled={!!sample.translations?.length} className="tp-translation-source"><CaptionContent layoutPhrases={sample.layoutPhrases} words={sample.detail.transcript!.words} spans={sample.captionSpans} policy={sample.captionPolicy}
						template={templates.find((template) => selected.includes(template.id))}
						units={sample.semanticUnits} duration={sample.detail.input.durationSeconds} title={sample.title}
						onBusyChange={setEditingContent}
						onChange={(captionSpans, captionPolicy) => setSamples((current) => ({ ...current, [inputId]: { ...current[inputId], captionSpans, captionPolicy } }))} /></fieldset>
                    <TranslationContent words={sample.detail.transcript!.words} spans={sample.captionSpans} policy={sample.captionPolicy} template={templates.find(template=>selected.includes(template.id))} units={sample.semanticUnits} layoutPhrases={sample.layoutPhrases} duration={sample.detail.input.durationSeconds} title={sample.title} value={sample.translations??[]} onChange={(translations,spans)=>setSamples(current=>({...current,[inputId]:{...current[inputId],translations,...(spans?{captionSpans:spans}:{})}}))}/>
                    </>}
				</fieldset>
			))}
			{(slots.length > 0 || Object.values(sharedBindings).some(value=>Object.keys(value).length) || Object.values(bindings).some(value=>Object.keys(value).length)) &&
				Object.entries(samples).map(([inputId, sample]) => (
					<fieldset
						key={inputId}
						disabled={busy}
						className="tp-resource-bindings"
					>
						<legend>{sample.title} · 替换素材</legend>
                        <SampleResourceBindings templates={templates.filter(template=>selected.includes(template.id))} assets={assets} sounds={sounds} shared={sharedBindings[inputId]??{}} designs={bindings[inputId]??{}} onSharedChange={value=>setSharedBindings(current=>({...current,[inputId]:value}))} onDesignChange={value=>setBindings(current=>({...current,[inputId]:value}))}/>
					</fieldset>
				))}
			{error && <p role="alert">{error}</p>}
			{currentContentCheck && <div ref={contentCheckRef}><ProductionContentCheck groups={currentContentCheck.groups}
				disabled={busy || editingContent || hasCorrections || hasIncompleteBindings || !!loadingInput}
				onReview={reviewContent} onContinue={() => void submit(true)}/></div>}
			{hasCorrections && <p role="status">原文校正尚未保存</p>}
			{hasIncompleteBindings&&<p role="status">替换素材尚未选择；请选择素材或切换为沿用默认／本次禁用。</p>}
			{draft&&<details>
				<summary>成片导出设置</summary>
			<label>
				{singleTemplateId ? "任务名称" : "批次名称"}
				<input
					value={name}
					disabled={busy}
					onChange={(e) => setName(e.target.value)}
				/>
			</label>
			</details>}
			{!currentContentCheck && <Button
				disabled={
					busy ||
					editingContent ||
					hasCorrections ||
					hasIncompleteBindings ||
					!!loadingInput ||
					!name.trim() ||
					!selected.length ||
					!Object.keys(samples).length
				}
				onClick={() => void submit()}
			>
				<Play />
				{busy
					? "正在准备工程"
					: `${draft ? "生成草稿预览" : singleTemplateId ? "生成视频" : "开始生产"} · ${selected.length * Object.keys(samples).length} 个成片`}
			</Button>}
		</section>
	);
}
