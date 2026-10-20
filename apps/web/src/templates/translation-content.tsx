"use client";
import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import type {Plan,Template,TimedWord} from "./types";
import type {CaptionSpan} from "./caption-content";

/** Native planning supplies caption text, timing and word spans; the UI only edits translations. */
export function TranslationContent({words,spans,policy,template,units,layoutPhrases=[],duration,title,value,onChange}:{
	words:TimedWord[];spans:CaptionSpan[]|null;policy?:Template["segmentation"];template?:Template;
	units:Plan["semanticUnits"];layoutPhrases?:{wordSpan:CaptionSpan}[];duration:number;title:string;value:string[];
	onChange:(translations:string[],spans?:CaptionSpan[])=>void;
}){
	const body=template?JSON.stringify({template,words,durationSeconds:duration,title,semanticUnits:units,captionSpans:spans??[],captionPolicy:policy,layoutPhrases,translations:[]}):"";
	const [result,setResult]=useState<{key:string;captions:Plan["captions"];error?:string}>();
	useEffect(()=>{
		if(!body)return;const controller=new AbortController();
		void(async()=>{try{
			const response=await fetch('/api/footage/templates/plan',{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body,signal:controller.signal});
			const data=await response.json();if(!response.ok)throw Error(data.error??'无法读取译文对应的字幕');
			if(!controller.signal.aborted)setResult({key:body,captions:data.captions});
		}catch(e){if(!controller.signal.aborted)setResult({key:body,captions:[],error:e instanceof Error?e.message:'无法读取字幕'});}})();
		return()=>controller.abort();
	},[body]);
	const current=result?.key===body?result:undefined;
	return <details className="tp-sample-content tp-translations"><summary>逐句译文 · {value.length?`${value.length} 句`:"未添加"}</summary>
		<p>按当前字幕逐句填写译文；每句保留原声音的时间和词范围。启用时固定当前分段，避免译文错配。样式需包含译文图层才能显示。</p>
		{!current&&<p role="status">正在读取字幕分段…</p>}
		{current?.error&&<p role="alert">{current.error}</p>}
		{!value.length&&<Button variant="outline" disabled={!current?.captions.length||!!current.error} onClick={()=>{if(current)onChange(current.captions.map(()=>""),current.captions.map(cue=>cue.wordSpan));}}>添加逐句译文</Button>}
		{!!value.length&&<>
			{value.map((translation,index)=>{const cue=current?.captions[index];return <label key={index}>
				<span>第 {index+1} 句{cue?` · ${cue.start.toFixed(2)}–${cue.end.toFixed(2)} 秒 · 第 ${cue.wordSpan.startWord+1}–${cue.wordSpan.endWord} 词`:""}</span>
				{cue&&<p>{cue.text}</p>}
				<textarea aria-label={`第${index+1}句译文`} rows={2} value={translation} onChange={event=>onChange(value.map((item,i)=>i===index?event.target.value:item))}/>
			</label>;})}
			<Button variant="outline" onClick={()=>onChange([])}>清除译文并解锁分段</Button>
		</>}
	</details>;
}
