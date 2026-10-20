"use client";
import {useEffect,useState} from "react";

type InputField={id:string;label:string;default:string;maxCharacters:number;layerIds:string[]};

/** Edit instance values only. Native Definition.inputs owns defaults and constraints. */
export function ApplicationTextInputs({assetId,revision,value,onChange,label}:{assetId:string;revision:number;value:Record<string,string>;onChange:(next:Record<string,string>)=>void;label:string}){
	const [fields,setFields]=useState<InputField[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
	useEffect(()=>{
		const controller=new AbortController();setLoading(true);setFields([]);setError("");
		void(async()=>{try{
			const response=await fetch(`/api/footage/templates/dynamic-assets/${encodeURIComponent(assetId)}`,{signal:controller.signal});
			const result=await response.json();if(!response.ok)throw Error(result.error??"无法读取样式文字参数");
			if(result.definition.revision!==revision)throw Error("样式版本已更新，请重新进入对应版本后编辑文字参数。");
			if(!controller.signal.aborted)setFields(result.definition.inputs);
		}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"无法读取样式文字参数");}
		finally{if(!controller.signal.aborted)setLoading(false);}})();
		return ()=>controller.abort();
	},[assetId,revision]);
	if(loading)return <small>正在读取{label}文字参数…</small>;
	if(error)return <p role="alert">{error}</p>;
	if(!fields.length)return null;
	return <details className="tw-application-text-inputs"><summary>{label}文字内容</summary>
		<p>修改本次应用的文字参数。字幕或关键词由声音标注生成时，以实际声音内容为准；关闭自定义可沿用样式默认值。</p>
		{fields.map(field=>{
			const overridden=Object.hasOwn(value,field.id);
			return <div key={field.id}>
				<label><input type="checkbox" aria-label={`${label}${field.label}自定义`} checked={overridden} onChange={event=>{const next={...value};if(event.target.checked)next[field.id]=field.default;else delete next[field.id];onChange(next);}}/>{field.label}</label>
				<textarea rows={2} aria-label={`${label}${field.label}文字`} disabled={!overridden} value={value[field.id]??field.default} onChange={event=>onChange({...value,[field.id]:event.target.value})}/>
				<small>最多 {field.maxCharacters} 字；{overridden?"本次应用自定义":"沿用样式默认"}。</small>
			</div>;
		})}
	</details>;
}
