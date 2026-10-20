"use client";

import {useEffect,useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import type {Template} from "./types";
import type {PlacementPolicy} from "./placement-advisor";

export type ApplicationSnapshot = {
	application:Record<string,unknown>&{assetId:string;assetRevision:number};
	extras:Record<string,unknown>[];
	samples:Record<string,unknown>[];
	protectedRegions:{id:string;region:{x:number;y:number;width:number;height:number}}[];
	protectionContext?:Pick<ApplicationSnapshot,"application"|"extras">&{sample:Record<string,unknown>};
	placementPolicy?:PlacementPolicy;
	placementPadding?:number;
	uiState?:Record<string,unknown>;
};
type Submission = ApplicationSnapshot & {idempotencyKey:string;contextId:string;reason:string;parentId?:string;evidence:{kind:string;reference:string;notes:string}[]};
export type ApplicationHistoryRecord = {id:string;createdAt:number;submission:Submission;changes:{path:string;before:unknown;after:unknown}[]};
type Entry = {record:ApplicationHistoryRecord;status:{restorable:boolean;assetsCurrent:boolean;inputsCurrent:boolean;projectionCurrent:boolean;issues:string[];contentScope:string;protectionScope?:"none"|"bound"|"unbound";qualityVerified:false;sourceFilesVerified:false}};
export type ApplicationRestore = Entry & {backup:Entry;template:Template;parentIdForNextSave:string};
const root="/api/footage/templates/dynamic-assets/application-history";
async function request<T>(path:string,body?:unknown):Promise<T>{
	const response=await fetch(root+path,{method:body===undefined?"GET":"POST",cache:"no-store",headers:{"content-type":"application/json","x-requested-with":"moirai-footage"},body:body===undefined?undefined:JSON.stringify(body)});
	const data=await response.json();
	if(!response.ok)throw Error(data.error??"无法读取应用历史");
	return data as T;
}

export function ApplicationHistory({assetId,contextId,disabled,capture,onRestore,onBusyChange,restoreIssue}:{
	assetId:string;contextId:string;disabled:boolean;capture:()=>ApplicationSnapshot;
	onRestore:(result:ApplicationRestore)=>Promise<void>;onBusyChange:(busy:boolean)=>void;
	restoreIssue:(record:ApplicationHistoryRecord)=>string|undefined;
}){
	const [records,setRecords]=useState<Entry[]>([]),[head,setHead]=useState<string>();
	const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
	const [reason,setReason]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
	const [evidenceReference,setEvidenceReference]=useState(""),[evidenceNotes,setEvidenceNotes]=useState("");
	const [selected,setSelected]=useState<string>();
	const retry=useRef<{key:string;idempotencyKey:string}|undefined>(undefined);
	const mounted=useRef(true);
	useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
	async function refresh(signal?:AbortSignal){
		setLoading(true);setError("");
		try{
			const result=await request<{records:Entry[];heads:{contextId:string;recordId:string}[]}>(`?assetId=${encodeURIComponent(assetId)}&contextId=${encodeURIComponent(contextId)}`);
			if(signal?.aborted||!mounted.current)return;
			setRecords(result.records);setHead(result.heads.find(item=>item.contextId===contextId)?.recordId);setLoaded(true);
		}catch(e){if(!signal?.aborted&&mounted.current)setError(e instanceof Error?e.message:"无法读取应用历史");}
		finally{if(!signal?.aborted&&mounted.current)setLoading(false);}
	}
	useEffect(()=>{
		if(!contextId)return;
		const controller=new AbortController();setLoaded(false);setRecords([]);setHead(undefined);setSelected(undefined);
		void refresh(controller.signal);
		return ()=>controller.abort();
	},[assetId,contextId]);
	function submission(note:string):Submission{
		const snapshot=capture();
		const body={...snapshot,contextId,reason:note,parentId:head,evidence:evidenceReference.trim()&&evidenceNotes.trim()?[{kind:"review",reference:evidenceReference.trim(),notes:evidenceNotes.trim()}]:[]};
		const key=JSON.stringify(body);
		if(retry.current?.key!==key)retry.current={key,idempotencyKey:`application-${crypto.randomUUID()}`};
		return {...body,idempotencyKey:retry.current.idempotencyKey};
	}
	function lock(value:boolean){setBusy(value);onBusyChange(value);}
	async function save(){
		if(disabled||busy||!loaded||!reason.trim())return;
		setError("");setNotice("");
		try{
			const body=submission(reason.trim());lock(true);
			const result=await request<Entry>("",body);
			setHead(result.record.id);setRecords(current=>[result,...current.filter(item=>item.record.id!==result.record.id)]);setSelected(result.record.id);
			retry.current=undefined;
			setNotice("已保存本次应用的配置、内容与调整说明。模板库版本没有变化。");
		}catch(e){const message=e instanceof Error?e.message:"保存应用记录失败";setError(message.includes("application history head conflict")?"此应用已被另一个页面或 Agent 更新。当前编辑仍保留，请刷新应用历史、核对差异后再保存。":message);}
		finally{lock(false);}
	}
	async function restore(id:string){
		if(disabled||busy||!loaded)return;
		setError("");setNotice("");
		try{
			const target=records.find(item=>item.record.id===id);if(!target)throw Error("请重新选择应用记录。");
			const unsupported=restoreIssue(target.record);if(unsupported)throw Error(unsupported);
			const current=submission(`恢复应用记录 ${id} 前保留当前配置与内容${reason.trim()?`：${reason.trim()}`:""}`);lock(true);
			const result=await request<ApplicationRestore>(`/${encodeURIComponent(id)}/restore`,{current});
			// A restored record is historical: the newly preserved draft is the head.
			setHead(result.parentIdForNextSave);setRecords(items=>[result.backup,...items.filter(item=>item.record.id!==result.backup.record.id)]);
			retry.current=undefined;
			await onRestore(result);
			setSelected(result.record.id);
			setNotice("已恢复这次应用。恢复前的配置和内容已另存，可从历史中找回；模板库版本没有变化。");
		}catch(e){setError(`${e instanceof Error?e.message:"恢复失败"} 当前未完成的编辑不会被丢弃；如记录已被其他人更新，请刷新历史后检查。`);}
		finally{lock(false);}
	}
	const detail=records.find(item=>item.record.id===selected);
	const unsupported=detail?restoreIssue(detail.record):undefined;
	return <section className="tw-application-history" aria-label="本次应用历史">
		<details><summary>本次应用与历史</summary>
		<p>保存这份素材的布局、避让规则、保护区、关键词、字幕分段和调整理由。恢复时先保留当前配置与内容，再切换到所选记录。</p>
		<fieldset disabled={disabled||busy||loading||!loaded}>
			<label>调整说明<textarea aria-label="应用调整说明" rows={2} maxLength={4000} value={reason} onChange={event=>setReason(event.target.value)} placeholder="例如：人物在右侧，把花字放到左上；长词改为两行。"/></label>
			<details><summary>附上检查证据</summary><p>记录预览或测量文件的位置及实际检查结果；保存证据不会自动给模板评分。</p><label>证据位置<input aria-label="应用证据位置" value={evidenceReference} onChange={event=>setEvidenceReference(event.target.value)}/></label><label>检查结果<textarea aria-label="应用证据说明" value={evidenceNotes} onChange={event=>setEvidenceNotes(event.target.value)}/></label></details>
			<Button disabled={!reason.trim()||Boolean(evidenceReference.trim())!==Boolean(evidenceNotes.trim())} onClick={()=>void save()}>{busy?"正在处理…":"保存本次应用记录"}</Button>
		</fieldset>
		{disabled&&!busy&&<p role="status">内容正在编辑或预览尚未准备好。请先完成或取消当前编辑，再保存或恢复历史。</p>}
		<Button variant="outline" disabled={busy||loading} onClick={()=>void refresh()}>{loading?"正在读取历史…":"刷新应用历史"}</Button>
		{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
		{loaded&&!records.length&&<p>还没有记录。先保存一版，后续可以对比并恢复。</p>}
		{records.length>0&&<div className="tw-application-history-list">
			<label>历史记录<select aria-label="选择应用历史" value={selected??""} onChange={event=>setSelected(event.target.value)}><option value="">选择一条记录</option>{records.map(({record})=><option key={record.id} value={record.id}>{new Date(record.createdAt*1000).toLocaleString("zh-CN",{hour12:false})} · {record.submission.reason}</option>)}</select></label>
			{detail&&<article>
				<p>{detail.record.submission.reason}</p><p>模板 v{detail.record.submission.application.assetRevision} · {detail.record.submission.samples.length?`${detail.record.submission.samples.length} 份素材`:"仅布局配置，未选择素材"}{detail.record.id===head?" · 最新记录":""}</p>
				<p>应用记录保留参数和检查来源；成片效果仍需实际预览验收。</p>
				{detail.record.submission.protectedRegions.length>0&&!detail.record.submission.protectionContext&&<p role="status">这条历史的保护框未记录所属素材，仍作为历史数据保留；恢复时不会套到当前素材，请重新圈选。</p>}
				{!detail.status.restorable&&<p role="status">样式、输入或执行结果已变化，此记录保留供查看，暂不能恢复。{detail.status.issues.join("；")}</p>}
				{unsupported&&<p role="status">{unsupported}</p>}
				{detail.record.changes.length>0&&<details><summary>本次调整了什么（{detail.record.changes.length} 项）</summary><ul>{detail.record.changes.map((change,index)=><li key={index}><code>{change.path}</code><pre>{JSON.stringify({原值:change.before,调整后:change.after},null,2)}</pre></li>)}</ul></details>}
				{detail.record.submission.evidence.length>0&&<ul>{detail.record.submission.evidence.map((item,index)=><li key={index}>{item.notes}<br/><code>{item.reference}</code></li>)}</ul>}
				<details><summary>记录详情与完整参数（供 AI 使用）</summary><pre>{JSON.stringify(detail,null,2)}</pre></details>
				<Button variant="outline" disabled={disabled||busy||loading||!detail.status.restorable||!!unsupported} onClick={()=>void restore(detail.record.id)}>保留当前内容并恢复此记录</Button>
			</article>}
		</div>}
		</details>
	</section>;
}
