"use client";
import {useEffect,useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import {TemplateSpeech} from "./tts";
import type {InputDetail,TemplateInput} from "./types";
export function ProductionSpeech({api,disabled,onReady,onBusyChange}:{api:<T>(path:string,body?:unknown)=>Promise<T>;disabled:boolean;onReady:(input:TemplateInput,detail:InputDetail,eventsOnly?:boolean)=>Promise<void>;onBusyChange:(busy:boolean)=>void}) {
 const [generating,setGenerating]=useState(false),[checking,setChecking]=useState(false),[uploading,setUploading]=useState(false);
 const [eventsOnly,setEventsOnly]=useState(false);
 const fileRef=useRef<HTMLInputElement>(null);
 const [pending,setPending]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const [transcriptionFailed,setTranscriptionFailed]=useState(false);
 const ready=useRef(onReady);ready.current=onReady;
 const receiptKey=useRef("");
 function remember(inputId:string|null){
  try{if(inputId)sessionStorage.setItem(receiptKey.current,inputId);else sessionStorage.removeItem(receiptKey.current);}catch{/* The native input remains available if browser storage is disabled. */}
  setPending(inputId);
 }
 useEffect(()=>{
  receiptKey.current=`moirai.style.pending-speech.v1:${window.location.pathname}`;
  try{const id=sessionStorage.getItem(receiptKey.current);if(id&&/^input-[a-zA-Z0-9_-]+$/.test(id))setPending(id);}catch{/* Keep generation usable without session storage. */}
 },[]);
 useEffect(()=>{onBusyChange(generating||checking||uploading);return()=>onBusyChange(false);},[generating,checking,uploading,onBusyChange]);
 useEffect(()=>{
  if(!pending)return;
  let cancelled=false;let timer:ReturnType<typeof setTimeout>;
  setChecking(true);setError("");setTranscriptionFailed(false);setNotice("正在等待声音的词级转写…");
  async function poll(){
   try {
    const detail=await api<InputDetail>(`/inputs/${pending}`);
    if(cancelled)return;
    if(detail.job&&["queued","running"].includes(detail.job.status)){timer=setTimeout(()=>void poll(),2000);return;}
    if(detail.job?.status==="failed"){setTranscriptionFailed(true);throw Error(detail.job.error??"配音转写失败");}
    if(!detail.transcript?.words.length){setTranscriptionFailed(true);throw Error("尚无可用词级转写；可重新转写这份声音。");}
    await ready.current(detail.input,detail);
    if(cancelled)return;
    remember(null);setChecking(false);setNotice("声音已加入当前试映。请检查转写，并标注要强调的重点词。");
   }catch(e){if(!cancelled){setChecking(false);setNotice("");setError(e instanceof Error?e.message:"读取声音失败");}}
  }
  void poll();return()=>{cancelled=true;clearTimeout(timer);};
 },[api,pending,attempt]);
 async function importMedia(file:File){
  setUploading(true);setError("");setNotice("正在导入声音素材…");
  let inputId:string|undefined;
  try{
   const input=await api<TemplateInput>(`/inputs?filename=${encodeURIComponent(file.name)}`,file);inputId=input.id;
   const detail=await api<InputDetail>(`/inputs/${input.id}`);
   if(eventsOnly){await ready.current(input,detail,true);setNotice("素材已加入当前试映，无需转写。请添加声音或画面事件。");return;}
   if(!detail.transcript?.words.length&&!detail.job?.status.match(/^(queued|running)$/))await api(`/inputs/${input.id}/transcribe`,{});
   remember(input.id);
  }catch(e){setNotice("");setError(e instanceof Error?e.message:"导入失败");if(inputId)remember(inputId);}
  finally{setUploading(false);}
 }
 return <div className="tp-speech-input">
  <label>导入用途<select aria-label="导入用途" value={eventsOnly?"events":"speech"} disabled={disabled||uploading||checking||!!pending} onChange={e=>setEventsOnly(e.target.value==="events")}><option value="speech">口播与字幕 · 需要词级转写</option><option value="events">声音与画面事件 · 无需转写</option></select></label>
  <Button variant="outline" disabled={disabled||uploading||checking||!!pending} onClick={()=>fileRef.current?.click()}>{uploading?"正在导入…":"导入音频或视频"}</Button>
  <input ref={fileRef} type="file" hidden accept="audio/*,video/*" aria-label="导入试映音频或视频" onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value="";if(file)void importMedia(file);}} />
  <TemplateSpeech api={api} disabled={disabled||uploading||checking||!!pending} onBusyChange={setGenerating} onGenerated={async input=>{setError("");setNotice("");remember(input.id);}}/>
  {notice&&<p role="status">{notice}</p>}
  {error&&<p role="alert">{error}</p>}
  {pending&&!checking&&error&&<Button variant="outline" disabled={disabled} onClick={()=>setAttempt(value=>value+1)}>继续检查这份声音</Button>}
  {pending&&!checking&&transcriptionFailed&&<Button variant="outline" disabled={disabled} onClick={()=>{
   setChecking(true);setError("");
   void api(`/inputs/${pending}/transcribe`,{}).then(()=>setAttempt(value=>value+1)).catch(e=>{setChecking(false);setError(e instanceof Error?e.message:"重试转写失败");});
  }}>重新转写这份声音</Button>}
  {pending&&!checking&&error&&<Button variant="outline" disabled={disabled} onClick={()=>{setChecking(true);setError("");void api<InputDetail>(`/inputs/${pending}`).then(async detail=>{await ready.current(detail.input,detail,true);remember(null);setNotice("已按事件模式加入当前试映，请添加声音或画面事件。");}).catch(e=>setError(e instanceof Error?e.message:"无法读取素材")).finally(()=>setChecking(false));}}>直接按事件使用</Button>}
  {pending&&!checking&&error&&<Button variant="ghost" disabled={disabled} onClick={()=>{remember(null);setError("");setTranscriptionFailed(false);setNotice("声音已保留在输入素材库，可稍后选择。现在可以导入或生成另一份声音。");}}>稍后处理，保留声音</Button>}
 </div>;
}
