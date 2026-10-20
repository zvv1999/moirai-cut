"use client";
import {Button} from "@/components/ui/button";
import {intentChoices} from "./intent-labels";

export type SampleSoundEvent={id:string;kind:string;start:number;end:number;strength:number;confidence:number;sourceId:string;evidence:string};
export type SampleTimeEvent=SampleSoundEvent&{intent?:string|null;text?:string|null;captionIndex?:number|null;semanticIndex?:number|null};
const soundKinds=[['speech','人声'],['beat','节拍'],['onset','声音起点'],['pause','停顿'],['energy_peak','能量峰值'],['section','声音段落']] as const;
const timeKinds=[['video','视频'],['semantic','语义'],['caption','字幕'],['keyword','重点词'],['shot','镜头'],...soundKinds] as const;

/** All event scheduling and validation stays native; this edits the full wire fields. */
export function SampleEvents({inputId,duration,events,soundEvents,onChange}:{inputId:string;duration:number;events:SampleTimeEvent[];soundEvents:SampleSoundEvent[];onChange:(events:SampleTimeEvent[],soundEvents:SampleSoundEvent[])=>void}){
	function add(sound:boolean){
		const event={id:`event-${crypto.randomUUID()}`,kind:sound?'beat':'keyword',start:0,end:Math.min(1,duration),strength:1,confidence:1,sourceId:inputId,evidence:'用户在工作台标注'};
		if(sound)onChange(events,[...soundEvents,event]);else onChange([...events,{...event,intent:null,text:null,captionIndex:null,semanticIndex:null}],soundEvents);
	}
	return <details className="tp-sample-content tp-sample-events"><summary>声音与画面事件 · {events.length+soundEvents.length} 个</summary>
		<p>为节拍、停顿、镜头或重点出现标注时间。事件可独立于字幕驱动样式；实际采用哪些事件，由样式的出现规则决定。</p>
		<div className="tp-content-actions"><Button variant="outline" onClick={()=>add(false)}>添加画面或内容事件</Button><Button variant="outline" onClick={()=>add(true)}>添加声音事件</Button></div>
		{([false,true] as const).map(sound=>(sound?soundEvents:events).map((event,index)=>{
			const label=`${sound?'声音':'画面内容'}事件${index+1}`;
			const update=(value:SampleTimeEvent)=>sound?onChange(events,soundEvents.map((item,i)=>i===index?value:item)):onChange(events.map((item,i)=>i===index?value:item),soundEvents);
			const timed=event as SampleTimeEvent;
			return <fieldset key={`${sound}:${index}`}><legend>{label}</legend>
				<label>事件类型<select aria-label={`${label}类型`} value={event.kind} onChange={e=>update({...event,kind:e.target.value})}>{(sound?soundKinds:timeKinds).map(([kind,name])=><option key={kind} value={kind}>{name}</option>)}</select></label>
				<div className="tw-trial-transform">{([['start','开始秒数'],['end','结束秒数']] as const).map(([key,name])=><label key={key}>{name}<input aria-label={`${label}${name}`} type="number" step={.01} value={event[key]} onChange={e=>{if(Number.isFinite(e.target.valueAsNumber))update({...event,[key]:e.target.valueAsNumber});}}/></label>)}</div>
				{!sound&&<>
					<label>事件文案<textarea aria-label={`${label}文案`} rows={2} value={timed.text??''} onChange={e=>update({...timed,text:e.target.value})}/></label>
					<label>表达语义<select aria-label={`${label}语义`} value={timed.intent??''} onChange={e=>update({...timed,intent:e.target.value||null})}><option value="">不指定</option>{intentChoices.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
					<details><summary>关联已转写内容</summary><p>有词级转写时可关联字幕或语义段。仅事件模式可留空，使用上面的事件文案。</p>{([['captionIndex','字幕序号'],['semanticIndex','语义段序号']] as const).map(([key,name])=><label key={key}>{name}（从 1 开始）<input aria-label={`${label}${name}`} type="number" step={1} value={timed[key]==null?'':timed[key]!+1} onChange={e=>{if(e.target.value==='')update({...timed,[key]:null});else if(Number.isFinite(e.target.valueAsNumber))update({...timed,[key]:e.target.valueAsNumber-1});}}/></label>)}</details>
				</>}
				<details><summary>来源与强度</summary>
					{([['id','事件标识'],['sourceId','来源标识'],['evidence','标注依据']] as const).map(([key,name])=><label key={key}>{name}<input aria-label={`${label}${name}`} value={event[key]} onChange={e=>update({...event,[key]:e.target.value})}/></label>)}
					{([['strength','强度'],['confidence','可信度']] as const).map(([key,name])=><label key={key}>{name}<input aria-label={`${label}${name}`} type="number" step={.01} value={event[key]} onChange={e=>{if(Number.isFinite(e.target.valueAsNumber))update({...event,[key]:e.target.valueAsNumber});}}/></label>)}
				</details>
				<Button variant="outline" aria-label={`移除${label}`} onClick={()=>sound?onChange(events,soundEvents.filter((_,i)=>i!==index)):onChange(events.filter((_,i)=>i!==index),soundEvents)}>移除此事件</Button>
			</fieldset>;
		}))}
	</details>;
}
