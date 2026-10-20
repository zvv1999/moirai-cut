"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Plan, Template, TimedWord } from "./types";
import type { CaptionSpan } from "./caption-content";
export type LayoutPhrase = { wordSpan: CaptionSpan };
export function LayoutPhraseContent({ words, phrases, template, units, spans, policy, duration, title, onChange, onBusyChange }: {
 words: TimedWord[]; phrases: LayoutPhrase[]; template?: Template; units: Plan["semanticUnits"];
 spans: CaptionSpan[] | null; policy?: Template["segmentation"]; duration: number; title: string;
 onChange: (phrases: LayoutPhrase[]) => void; onBusyChange: (busy: boolean) => void;
}) {
 const [start,setStart]=useState(""); const [end,setEnd]=useState(""); const [error,setError]=useState("");
 const [warnings,setWarnings]=useState<string[]>([]);
 const request=template ? JSON.stringify({template,words,durationSeconds:duration,title,translations:[],semanticUnits:units,captionSpans:spans??[],captionPolicy:policy,layoutPhrases:phrases}) : null;
 useEffect(()=>{
  setError("");setWarnings([]);
  if(!request||!phrases.length)return;
  const controller=new AbortController();
  void fetch("/api/footage/templates/plan",{method:"POST",headers:{"content-type":"application/json","x-requested-with":"moirai-footage"},body:request,signal:controller.signal})
   .then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error??"短语排版校验失败");if(!controller.signal.aborted)setWarnings(data.warnings.filter((w:string)=>w.startsWith("layout_phrase_crosses_caption:")));})
   .catch(cause=>{if(!controller.signal.aborted)setError(String(cause));});
  return()=>controller.abort();
 },[request,phrases.length]);
 async function update(next:LayoutPhrase[]){
  if(!request)return;
  onBusyChange(true);setError("");
  try {
   const response=await fetch("/api/footage/templates/plan",{method:"POST",headers:{"content-type":"application/json","x-requested-with":"moirai-footage"},body:JSON.stringify({...JSON.parse(request),layoutPhrases:next})});
   const data=await response.json();if(!response.ok)throw Error(data.error??"短语范围无效，请检查是否重叠");
   onChange(next);setStart("");setEnd("");
  }catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
  finally{onBusyChange(false);}
 }
 return <details className="tp-sample-content">
  <summary>短语排版 · {phrases.length ? `${phrases.length} 组尽量同排` : "普通换行"}</summary>
  <p>选一组不宜拆开的相邻词，优先放在同一行。优先标注专名、数字单位和完整词语；把整段修饰语绑成一组可能导致长短行悬殊。过长时允许换行；默认不改变字幕时机。开启“自动分段保留已标注短语”后，重新生成分段会同时参考这些词组；重点词样式不变。可随试映内容保存；校正转写后需重新选择。</p>
  <div className="tp-content-actions">
   <label>起始词<select aria-label="同排短语起始词" value={start} onChange={e=>setStart(e.target.value)}><option value="">选择起始词</option>{words.map((w,i)=><option key={i} value={i}>{i+1}. {w.text} · {w.start.toFixed(2)}秒</option>)}</select></label>
   <label>结束词<select aria-label="同排短语结束词" value={end} onChange={e=>setEnd(e.target.value)}><option value="">选择结束词</option>{words.map((w,i)=><option key={i} value={i+1}>{i+1}. {w.text} · {w.end.toFixed(2)}秒</option>)}</select></label>
   <Button variant="outline" disabled={!template||start===""||end===""} onClick={()=>void update([...phrases,{wordSpan:{startWord:Number(start),endWord:Number(end)}}].sort((a,b)=>a.wordSpan.startWord-b.wordSpan.startWord))}>设为尽量同排</Button>
  </div>
  {phrases.map((p,i)=><div className="tp-content-actions" key={`${p.wordSpan.startWord}-${p.wordSpan.endWord}`}><span>{words.slice(p.wordSpan.startWord,p.wordSpan.endWord).map(w=>w.text).join(" · ")}</span><Button variant="ghost" aria-label={`取消第${i+1}组同排短语`} onClick={()=>void update(phrases.filter((_,n)=>n!==i))}>取消同排</Button></div>)}
  {warnings.map(w=><p role="status" key={w}>第 {Number(w.split(":")[1])+1} 组跨越字幕显示段，当前会忽略同排提示。可缩短词组，或调整字幕分段。</p>)}
  {error&&<p role="alert">{error}</p>}
 </details>;
}
