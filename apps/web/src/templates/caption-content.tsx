"use client";
import { useEffect, useState } from "react";
import { Combine, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Plan, Template, TimedWord } from "./types";
import { formatPlanWarnings } from "./plan-warning";

export type CaptionSpan = Plan["captions"][number]["wordSpan"];

export function CaptionContent({ words, spans, policy, template, units, layoutPhrases = [], duration, title, onChange, onBusyChange }: {
	words: TimedWord[];
	spans: CaptionSpan[] | null;
	policy?: Template["segmentation"];
	template: Template | undefined;
	units: Plan["semanticUnits"];
	layoutPhrases?: {wordSpan: CaptionSpan}[];
	duration: number;
	title: string;
	onChange: (spans: CaptionSpan[] | null, policy?: Template["segmentation"]) => void;
	onBusyChange: (busy: boolean) => void;
}) {
	const [splitAt, setSplitAt] = useState<Record<number, string>>({});
	const [error, setError] = useState("");
	const [settings,setSettings]=useState<Partial<Template["segmentation"]>>({});
	const [notice,setNotice]=useState("");
	useEffect(()=>{setSettings({});},[policy]);
	const segmentation=template?{...(policy??template.segmentation),...settings}:undefined;
	const textRequest=spans&&template?JSON.stringify({template,words,durationSeconds:duration,title,translations:[],semanticUnits:units,layoutPhrases,captionSpans:spans,captionPolicy:policy}):null;
	const [display,setDisplay]=useState<{request:string;captions:Plan["captions"];error?:string}>();
	useEffect(()=>{
		if(!textRequest)return;
		const controller=new AbortController();
		void (async()=>{
			try{
				const response=await fetch("/api/footage/templates/plan",{method:"POST",headers:{"content-type":"application/json","x-requested-with":"moirai-footage"},body:textRequest,signal:controller.signal});
				const result=await response.json();
				if(!response.ok)throw Error(result.error??"无法读取字幕正文");
				if(!controller.signal.aborted)setDisplay({request:textRequest,captions:(result as Plan).captions});
			}catch(cause){if(!controller.signal.aborted)setDisplay({request:textRequest,captions:[],error:cause instanceof Error?cause.message:"无法读取字幕正文"});}
		})();
		return()=>controller.abort();
	},[textRequest]);
	async function request(path: string, body: unknown, nextPolicy = policy) {
		onBusyChange(true);
		setError("");
		setNotice("");
		try {
			const response = await fetch(`/api/footage/templates/${path}`, {
				method: "POST", headers: { "content-type": "application/json", "x-requested-with": "moirai-footage" },
				body: JSON.stringify(path === "captions/edit" ? { ...body as object, semanticUnits: units } : body),
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error ?? "字幕分段修改失败");
			onChange(path === "plan" ? (result as Plan).captions.map((caption) => caption.wordSpan) : result.captionSpans, nextPolicy);
			setSplitAt({});
			if(path === "plan")setNotice("已生成分段。只替换当前声音的字幕范围，逐词时间和库内样式不变。保存试映内容可同时保留分段范围和规则，预览与生产采用同一套规则。");
		} catch (cause) { setError(cause instanceof Error ? cause.message : "字幕分段修改失败"); }
		finally { onBusyChange(false); }
	}
	return <details className="tp-sample-content">
		<summary>字幕分段 · {spans ? `${spans.length} 句` : "按模板自动"}</summary>
		<label>分段方式
			<select aria-label="字幕分段方式" value={spans ? "custom" : "auto"} disabled={!template}
				onChange={(event) => {
					if (event.target.value === "auto") { onChange(null, undefined); setSettings({}); setSplitAt({}); setError(""); setNotice(""); }
					else void request("plan", { template, words, durationSeconds: duration, title, translations: [], semanticUnits: units, layoutPhrases, captionSpans: [] });
				}}>
				<option value="auto">按模板自动分段</option>
				<option value="custom">自定义分段</option>
			</select>
		</label>
		<p>{spans
			? "当前使用指定的分段范围，字数和时长规则不会自动重新拆句。需要调整句长时，展开下方“重新生成分段”并应用；逐词时间仍来自当前声音。"
			: "根据当前声音的词级时间和分段规则自动生成字幕；换一段声音会重新计算，不绑定固定时间轴。"}</p>
		{template&&segmentation&&<details>
			<summary>重新生成分段</summary>
			<p>长句遮挡画面时可减少每句字数，切换过快时可增加字数或时长上限。设置属于当前声音的内容配置；点击后替换手动拆合结果，不修改库内样式。字数上限不会拆开一个已对齐的词，实际换行还取决于字体和显示区域。</p>
			<div className="tw-trial-transform">{([
				["maxCharacters","每句字数上限",2,60,1],
				["maxPhraseSeconds","每句时长上限（秒）",0.5,10,0.1],
				["pauseBoundarySeconds","停顿分句阈值（秒）",0.05,2,0.01],
			] as const).map(([key,label,min,max,step])=><label key={key}>{label}<input aria-label={label} type="number" min={min} max={max} step={step} value={segmentation[key]} onChange={event=>setSettings(current=>({...current,[key]:event.target.valueAsNumber}))}/></label>)}</div>
			<label><input aria-label="自动分段保留已标注短语" type="checkbox" checked={segmentation.preserveLayoutPhrases??false} onChange={event=>setSettings(current=>({...current,preserveLayoutPhrases:event.target.checked}))}/>自动分段保留已标注短语</label>
            <small>只影响重新生成的分段。仍保留停顿、说话人变化和字数/时长上限；过长短语会回退并提示，手动拆分不受影响。</small>
            <Button variant="outline" onClick={()=>void request("plan",{template,captionPolicy:segmentation,words,durationSeconds:duration,title,translations:[],semanticUnits:units,layoutPhrases,captionSpans:[]},segmentation)}>按设置重新分段</Button>
		</details>}
		{error && <p role="alert">{error}</p>}
		{notice&&<p role="status">{notice}</p>}
		{display?.request===textRequest&&display.error&&<p role="alert">字幕正文读取失败：{display.error}。当前分段范围仍保留。</p>}
		{spans?.map((span, index) => {
			const segment = words.slice(span.startWord, span.endWord);
			const caption = display?.request === textRequest ? display.captions[index] : undefined;
			return <fieldset key={index}>
				<legend>第 {index + 1} 句 · {segment[0].start.toFixed(2)}–{segment.at(-1)!.end.toFixed(2)} 秒 · 持续 {(segment.at(-1)!.end - segment[0].start).toFixed(2)} 秒</legend>
				<p aria-label={`第${index+1}句字幕正文`}>{display?.request===textRequest?display.captions[index]?.text??"正文暂不可用":"正在读取字幕文字…"}</p>
				{caption && formatPlanWarnings(caption.warnings.map((warning) => `${caption.id}:${warning}`)).map((warning) => <p key={warning} aria-label={`第${index + 1}句分段提示`}>{warning}</p>)}
				<div className="tp-content-actions">
					<label>拆分位置
						<select aria-label={`第${index + 1}句拆分位置`} value={splitAt[index] ?? ""} onChange={(event) => setSplitAt({ ...splitAt, [index]: event.target.value })}>
							<option value="">选择词尾</option>
							{segment.slice(0, -1).map((word, offset) => <option key={offset} value={span.startWord + offset + 1}>{word.text} · {word.end.toFixed(2)} 秒之后</option>)}
						</select>
					</label>
					<Button variant="outline" size="icon" title="拆分字幕" aria-label={`拆分第${index + 1}句`} disabled={!splitAt[index]} onClick={() => void request("captions/edit", { wordCount: words.length, captionSpans: spans, action: { kind: "split", index, at: Number(splitAt[index]) } })}><Scissors /></Button>
					<Button variant="outline" size="icon" title="与下一句合并" aria-label={`合并第${index + 1}句与下一句`} disabled={index === spans.length - 1} onClick={() => void request("captions/edit", { wordCount: words.length, captionSpans: spans, action: { kind: "merge", index } })}><Combine /></Button>
				</div>
			</fieldset>;
		})}
	</details>;
}
