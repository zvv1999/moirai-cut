"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {intentChoices} from "./intent-labels";
import {ReviewSeriesDetails, ReviewSeriesSummary, type ReviewSeriesRecord} from "./style-review-series";
import {ReviewTextEvidence} from "./production-text-evidence";
import {writeTrialTransform,type TrialTransform} from "./trial-transform";
import {trialLayoutFromNative,writeTrialLayout} from "./trial-layout";
import {trialTextValues} from "./trial-text-values";
import {writeTrialBackground} from "./trial-background";
type Criterion={score:number;rationale:string};
export type ReviewRecord={id:string;current:boolean;evidenceCurrent:boolean;total:number;meetsInternalThreshold:boolean;listened:boolean;aestheticQualityVerified?:boolean;submission:{application:{assetId:string;assetRevision:number;canvas:{width:number;height:number;fps:number};transform?:TrialTransform;placement:{x:number;y:number;width:number;height:number};captionWidth?:number;textWidths?:Record<string,number>;videoRegion?:{x:number;y:number;width:number;height:number};blurredBackground?:boolean;minDisplaySeconds?:number;inputs?:Record<string,unknown>;intents?:string[]};review:{batchId:string;item:number;evidence:{fixture:number;sha256:string}[];composition:Criterion;motion:Criterion;assets:Criterion;adaptation:Criterion;editability:Criterion;reviewer:string;inspection:string;limitations:string;blockingFindings:string[];listened?:boolean;aestheticQualityVerified?:boolean}}};
export function trialLink(application:ReviewRecord["submission"]["application"]):string|undefined {
 const {canvas,placement,transform}=application;
 // Share the trial page's layout adapter: custom canvases and partial regions
 // are editable there too. Never silently discard unsupported text values.
 try {trialTextValues(application.inputs);}catch{return;}
 const params=new URLSearchParams({revision:String(application.assetRevision)});
 writeTrialLayout(params,trialLayoutFromNative(canvas,placement));
 writeTrialTransform(params,transform);
 if(Object.keys(application.inputs??{}).length)params.set("inputs",JSON.stringify(application.inputs));
 writeTrialBackground(params,application.blurredBackground);
 if(application.videoRegion)for(const [key,param] of [["x","videoX"],["y","videoY"],["width","videoWidth"],["height","videoHeight"]] as const)params.set(param,String(application.videoRegion[key]));
 if(application.captionWidth!==undefined)params.set("captionWidth",String(application.captionWidth));
 if(application.textWidths&&Object.keys(application.textWidths).length)params.set("textWidths",JSON.stringify(application.textWidths));
 if(application.minDisplaySeconds!==undefined)params.set("minDisplaySeconds",String(application.minDisplaySeconds));
 if(application.intents!==undefined)params.set("intents",JSON.stringify(application.intents));
 return `/templates/effects/${encodeURIComponent(application.assetId)}/try?${params}`;
}
function ReviewVideo({src,label}:{src:string;label:string}) {
 const ref=useRef<HTMLVideoElement>(null);
 useEffect(()=>{const video=ref.current;if(video&&video.getAttribute("src")!==src)video.setAttribute("src",src);return()=>{if(video){video.pause();video.removeAttribute("src");video.load();}};},[src]);
 return <video ref={ref} aria-label={label} controls playsInline preload="none" style={{width:"100%"}} src={src} onPlay={event=>{
  const current=event.currentTarget;
  current.closest(".tw-style-reviews")?.querySelectorAll("video").forEach(video=>{if(video!==current)video.pause();});
 }}/>;
}
function ReviewDetails({record,historical=false}:{record:ReviewRecord;historical?:boolean}) {
 const [showVideos,setShowVideos]=useState(false);
 const {application,review}=record.submission;
 const href=!historical?trialLink(application):undefined;
 return <section aria-label={`v${application.assetRevision} 应用评审`}>
  <strong>v{application.assetRevision} · {application.canvas.width} × {application.canvas.height} · {historical?"历史内部评分":"内部评分"} {record.total}/100 · {record.meetsInternalThreshold?"达到内部阈值":"需完善"}</strong>
  <p>{application.blurredBackground&&"原片模糊铺底；"}评审布局：{application.transform?`大小 ${Number((application.transform.scale*100).toFixed(2))}%，水平中心 ${Number((application.transform.centerX*100).toFixed(2))}%，垂直中心 ${Number((application.transform.centerY*100).toFixed(2))}%`:`区域左侧 ${Number((application.placement.x*100).toFixed(2))}%，顶部 ${Number((application.placement.y*100).toFixed(2))}%，宽 ${Number((application.placement.width*100).toFixed(2))}%，高 ${Number((application.placement.height*100).toFixed(2))}%`}{application.transform?.rotationDegrees!==undefined&&`；旋转 ${application.transform.rotationDegrees}°`}{application.captionWidth!==undefined&&`；字幕行宽 ${Number((application.captionWidth*100).toFixed(2))}%`}{application.textWidths&&Object.keys(application.textWidths).length>0&&`；图层行宽 ${Object.entries(application.textWidths).map(([id,width])=>`${id}: ${Number((width*100).toFixed(2))}%`).join("、")}`}{application.videoRegion&&`；原视频区域：左 ${application.videoRegion.x*100}%，上 ${application.videoRegion.y*100}%，宽 ${application.videoRegion.width*100}%，高 ${application.videoRegion.height*100}%`}</p>
  {application.intents!==undefined&&<p>出现语义：{application.intents.length?application.intents.map(intent=>intentChoices.find(([id])=>id===intent)?.[1]??intent).join("、"):"所有语义"}</p>}
  {href&&<p><Link href={href}>用这个布局试自己的声音</Link><small> · 保留评审版本、画布、布局、文字变量与语义筛选，素材和重点词需重新选择。</small></p>}
  {historical&&<p>此记录不代表当前版本。样式版本或关联证据已发生变化。</p>}
  <p>评审：{review.reviewer} · {record.listened?"已记录试听":"未试听"}</p>
  <details><summary>分项依据</summary>{([["composition","构图",25],["motion","动效",25],["assets","素材",20],["adaptation","适配",20],["editability","编辑性",10]] as const).map(([key,label,max])=><p key={key}><strong>{label} {review[key].score}/{max}</strong> · {review[key].rationale}</p>)}</details>
  <p>检查范围：{review.inspection}</p><p>适用限制：{review.limitations}</p>
  {review.blockingFindings.length>0&&<ul>{review.blockingFindings.map((finding,i)=><li key={i}>{finding}</li>)}</ul>}
  {record.evidenceCurrent?<details onToggle={event=>{if(event.target===event.currentTarget)setShowVideos(event.currentTarget.open);}}><summary>查看评审成片 · {review.evidence.length} 份</summary>
   {showVideos&&review.evidence.map(evidence=><figure key={evidence.fixture}><figcaption>样例 {evidence.fixture+1} · 评审版本 v{application.assetRevision}</figcaption><ReviewVideo label={`评审样例 ${evidence.fixture+1}`} src={`/api/footage/templates/production/${encodeURIComponent(review.batchId)}/items/${review.item}/previews/${evidence.fixture}`}/></figure>)}
   {showVideos&&<ReviewTextEvidence batchId={review.batchId} item={review.item} fixtures={review.evidence}/>}
  </details>:<p>关联成片证据已变化，不能用当前视频代表这份评审。</p>}
 </section>;
}
export type StyleReviewState={records:ReviewRecord[]|null;error:string;series:ReviewSeriesRecord[]|null;seriesError:string};
export function useStyleReviewRecords(api:<T>(path:string,body?:unknown)=>Promise<T>,versionKey:string):StyleReviewState {
 const [state,setState]=useState<StyleReviewState>({records:null,error:"",series:null,seriesError:""});
 useEffect(()=>{
  let cancelled=false;setState({records:null,error:"",series:null,seriesError:""});
  if(versionKey)void Promise.allSettled([
   api<{reviews:ReviewRecord[]}>("/dynamic-assets/reviews"),
   api<{reviews:ReviewSeriesRecord[]}>("/dynamic-assets/review-series"),
  ]).then(([single,series])=>{if(!cancelled)setState({
   records:single.status==="fulfilled"?single.value.reviews:null,
   error:single.status==="rejected"?(single.reason instanceof Error?single.reason.message:"无法读取样式评审"):"",
   series:series.status==="fulfilled"?series.value.reviews:null,
   seriesError:series.status==="rejected"?(series.reason instanceof Error?series.reason.message:"无法读取跨输入评审"):"",
  });});
  return()=>{cancelled=true;};
 },[api,versionKey]);
 return state;
}
function SingleReviewSummary({state,assetId,revision}:{state:StyleReviewState;assetId:string;revision:number}) {
 if(state.error)return <span className="tw-style-review-summary">评审读取失败</span>;
 if(state.records===null)return <span className="tw-style-review-summary">评审读取中…</span>;
 const records=state.records.filter(r=>r.submission.application.assetId===assetId);
 const current=records.filter(r=>r.current&&r.evidenceCurrent&&r.submission.application.assetRevision===revision);
 if(!current.length)return <span className="tw-style-review-summary">{records.length?"当前版本暂无单应用评审 · 有历史记录":"单应用待评审"}</span>;
 if(current.length===1){const record=current[0];return <span className="tw-style-review-summary" data-qualified={record.meetsInternalThreshold}>内部评分 {record.total}/100 · {record.meetsInternalThreshold?"内部达标":"需完善"}{record.aestheticQualityVerified===true?" · 审美已验收":" · 待最终审美验收"}</span>;}
 const qualified=current.filter(r=>r.meetsInternalThreshold).length;
 return <span className="tw-style-review-summary">{current.length} 份应用评审 · {qualified} 个应用达标</span>;
}
export function StyleReviewSummary({state,assetId,revision}:{state:StyleReviewState;assetId:string;revision:number}) {
 return <><SingleReviewSummary state={state} assetId={assetId} revision={revision}/><ReviewSeriesSummary records={state.series} error={state.seriesError} assetId={assetId} revision={revision}/></>;
}
export function StyleReviews({state,assetId,revision,changed}:{state:StyleReviewState;assetId:string;revision:number;changed:boolean}) {
 const [expanded,setExpanded]=useState(false),[historyExpanded,setHistoryExpanded]=useState(false);
 const {error}=state;
 const records=state.records?.filter(r=>r.submission.application.assetId===assetId)??null;
 const isCurrent=(record:ReviewRecord)=>record.current&&record.evidenceCurrent&&record.submission.application.assetRevision===revision;
 const current=records?.filter(isCurrent)??[],historical=records?.filter(record=>!isCurrent(record))??[];
 const seriesCount=state.series?.filter(record=>record.current&&record.evidenceCurrent&&record.submission.cases[0]?.application.assetId===assetId&&record.submission.cases[0]?.application.assetRevision===revision).length??0;
 return <details className="tw-style-reviews" onToggle={event=>{if(event.target!==event.currentTarget)return;setExpanded(event.currentTarget.open);if(!event.currentTarget.open)setHistoryExpanded(false);}}><summary>应用验收 · {error?"单应用读取失败":records===null?"读取中":current.length?`${current.length} 份单应用记录`:"单应用待评审"}{seriesCount>0&&` · ${seriesCount} 份跨输入记录`}</summary>
  {expanded&&<>
  <p>评分只覆盖记录中的应用方案与成片，不代表任意文案、画幅或组合都能达到相同质量。</p>
  {changed&&<p>当前有未保存修改。评审仅对应其标注的已保存版本，不适用于当前草稿。</p>}
  {error&&<p role="alert">{error}</p>}
  {records!==null&&current.length===0&&seriesCount===0&&<p>当前版本尚无有效评审。导出成功与预览可见不等于审美通过。</p>}
  <ReviewSeriesDetails records={state.series} error={state.seriesError} assetId={assetId} revision={revision} renderCase={(record,historical)=><ReviewDetails record={record} historical={historical}/>}/>
  {current.map(record=><ReviewDetails key={record.id} record={record}/>)}
  {historical.length>0&&<details className="tw-style-review-history" onToggle={event=>{if(event.target===event.currentTarget)setHistoryExpanded(event.currentTarget.open);}}><summary>历史评审 · {historical.length} 份</summary>{historyExpanded&&historical.map(record=><ReviewDetails key={record.id} record={record} historical/>)}</details>}
  </>}
 </details>;
}
