"use client";

/** An optional authored value. Native Rust resolves precedence and event duration. */
export function MinDisplayRule({label,value,onChange,inherited}:{label:string;value?:number;onChange:(value:number|undefined)=>void;inherited:string}) {
	return <div className="tw-min-display-rule">
		<label><input type="checkbox" aria-label={`${label}独立最短显示`} checked={value!==undefined} onChange={event=>onChange(event.target.checked?0.65:undefined)}/>独立最短显示</label>
		{value!==undefined ? <label>最短显示（秒）<input aria-label={`${label}最短显示秒数`} type="number" min={0.1} max={3} step={0.05} value={value} onChange={event=>{if(Number.isFinite(event.target.valueAsNumber))onChange(event.target.valueAsNumber);}}/></label> : <small>{inherited}</small>}
		<small>用于延长短关键词或字幕的阅读时间，仍受后续事件、视频结尾、结束规则和显示时长上限约束；不会改变声音或事件的时间。</small>
	</div>;
}
