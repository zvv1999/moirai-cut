"use client";
import type { Plan, TimedWord } from "./types";
import { useEffect, useRef, useState } from "react";
import { Scissors, Combine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRangeAudition } from "./use-range-audition";

export function SampleContent({ words, units, onChange, onBusyChange, audioUrl, focusRequest }: {
	focusRequest?: { semanticIndex: number; requestId: number };
	audioUrl?: string;
	words: TimedWord[];
	units: Plan["semanticUnits"];
	onChange: (units: Plan["semanticUnits"]) => void;
	onBusyChange: (busy: boolean) => void;
}) {
	const [splitAt, setSplitAt] = useState<Record<number, string>>({});
	const [message, setMessage] = useState("");
	const [anchor, setAnchor] = useState<{ unit: number; word: number } | null>(null);
	const audition=useRangeAudition(audioUrl);
	const section = useRef<HTMLDetailsElement>(null);
	const unitFields = useRef(new Map<number, HTMLFieldSetElement>());
	useEffect(() => {
		if (!focusRequest || !section.current) return;
		section.current.open = true;
		const field = unitFields.current.get(focusRequest.semanticIndex);
		field?.scrollIntoView({ block: "center", behavior: "smooth" });
		field?.querySelector<HTMLButtonElement>(".tp-word-picker button")?.focus({ preventScroll: true });
	}, [focusRequest]);
	useEffect(()=>{audition.stop();},[words,units,audition.stop]);
	async function edit(action: { kind: "split"; index: number; at: number } | { kind: "merge"; index: number }) {
		audition.stop();
		onBusyChange(true);
		setAnchor(null);
		setMessage("");
		try {
			const response = await fetch("/api/footage/templates/content/edit", {
				method: "POST", headers: { "content-type": "application/json", "x-requested-with": "moirai-footage" },
				body: JSON.stringify({ wordCount: words.length, semanticUnits: units, action }),
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error ?? "分段修改失败");
			onChange(result.semanticUnits);
			setSplitAt({});
			setMessage(result.warnings.join(" "));
		} catch (error) { setMessage(error instanceof Error ? error.message : "分段修改失败"); }
		finally { onBusyChange(false); }
	}
	return <details ref={section} className="tp-sample-content" onToggle={event=>{if(event.target===event.currentTarget&&!event.currentTarget.open)audition.stop();}}>
		<summary>内容重点 · {units.length} 段</summary>
		{audioUrl&&<audio ref={audition.audio} src={audioUrl} preload="none" onEnded={audition.stop} onPause={()=>{if(audition.audio.current?.paused)audition.stop();}}/>}
		{audition.error&&<p role="alert">{audition.error}</p>}
		<p>点一个词即可强调，再点同段的另一个词可扩展范围。每段一个重点；需要多个重点时可拆分段落。</p>
		{message && <p role="status">{message}</p>}
		{units.map((unit, index) => {
			const segment = words.slice(unit.startWord, unit.endWord);
			const change = (keyword: typeof unit.keyword) => { setAnchor(null); onChange(units.map((value, i) => i === index ? {
				...value, keyword, rationale: "用户在生产表单指定内容重点",
			} : value)); };
			return <fieldset key={index} ref={node => { if (node) unitFields.current.set(index, node); else unitFields.current.delete(index); }}>
				<legend>第 {index + 1} 段 · {segment[0].start.toFixed(2)}–{segment.at(-1)!.end.toFixed(2)} 秒</legend>
				{audioUrl&&<div className="tp-word-selection-status">
					<Button variant="outline" aria-label={`试听第${index+1}段`} aria-pressed={audition.playingKey===`unit-${index}`} onClick={()=>void audition.play(`unit-${index}`,segment[0].start,segment.at(-1)!.end)}>{audition.playingKey===`unit-${index}`?"停止试听":"试听本段"}</Button>
					{unit.keyword&&<Button variant="outline" aria-label={`试听第${index+1}段重点`} aria-pressed={audition.playingKey===`keyword-${index}`} onClick={()=>void audition.play(`keyword-${index}`,words[unit.keyword!.startWord].start,words[unit.keyword!.endWord-1].end)}>{audition.playingKey===`keyword-${index}`?"停止试听":"试听重点"}</Button>}
				</div>}
				{!unit.keyword && <p role="status">未设置重点</p>}
				<div className="tp-word-picker" role="group" aria-label={`第${index + 1}段文字选重点`} onKeyDown={event=>{if(event.key==="Escape"){setAnchor(null);event.stopPropagation();}}}>{segment.map((word, offset) => {
					const position = unit.startWord + offset;
					const selected = !!unit.keyword && position >= unit.keyword.startWord && position < unit.keyword.endWord;
					return <button type="button" key={position} aria-label={`第${index + 1}段第${offset + 1}词 ${word.text}`} aria-pressed={selected}
						title={`${word.start.toFixed(2)}–${word.end.toFixed(2)} 秒`} onClick={()=>{
							if(anchor?.unit===index){change({startWord:Math.min(anchor.word,position),endWord:Math.max(anchor.word,position)+1});}
							else {change({startWord:position,endWord:position+1});setAnchor({unit:index,word:position});}
						}}>{word.text}</button>;
				})}</div>
				{anchor?.unit===index&&<div className="tp-word-selection-status"><p role="status">已强调所点的词。再点一个词扩展范围，或完成选择。</p><Button variant="outline" onClick={()=>setAnchor(null)}>完成选择</Button></div>}
				{unit.keyword&&<Button variant="ghost" aria-label={`清除第${index + 1}段重点`} onClick={()=>change(null)}>清除重点</Button>}
				<details className="tp-content-advanced">
					<summary>精确范围与段落调整</summary>
				<div className="tp-content-range">
					<label>重点起词
						<select aria-label={`第${index + 1}段重点起词`} value={unit.keyword?.startWord ?? ""}
							onChange={(e) => {
								if (e.target.value === "") return change(null);
								const startWord = Number(e.target.value);
								change({ startWord, endWord: Math.max(startWord + 1, unit.keyword?.endWord ?? startWord + 1) });
							}}>
							<option value="">不强调</option>
							{segment.map((word, offset) => <option key={offset} value={unit.startWord + offset}>{word.text} · {word.start.toFixed(2)} 秒</option>)}
						</select>
					</label>
					<label>重点止词
						<select aria-label={`第${index + 1}段重点止词`} disabled={!unit.keyword} value={unit.keyword?.endWord ?? ""}
							onChange={(e) => unit.keyword && change({ ...unit.keyword, endWord: Number(e.target.value) })}>
							{!unit.keyword && <option value="">不强调</option>}
							{segment.map((word, offset) => ({word, position: unit.startWord + offset})).filter(({position}) => unit.keyword && position >= unit.keyword.startWord).map(({word, position}) => <option key={position} value={position + 1}>{word.text} · {word.end.toFixed(2)} 秒</option>)}
						</select>
					</label>
				</div>
				<div className="tp-content-actions">
					<label>拆分位置
						<select aria-label={`第${index + 1}段拆分位置`} value={splitAt[index] ?? ""} onChange={(event) => setSplitAt({ ...splitAt, [index]: event.target.value })}>
							<option value="">选择词尾</option>
							{segment.slice(0, -1).map((word, offset) => <option key={offset} value={unit.startWord + offset + 1}>{word.text} · {word.end.toFixed(2)} 秒之后</option>)}
						</select>
					</label>
					<Button variant="outline" size="icon" title="拆分语义段" aria-label={`拆分第${index + 1}段`} disabled={!splitAt[index]} onClick={() => void edit({ kind: "split", index, at: Number(splitAt[index]) })}><Scissors /></Button>
					<Button variant="outline" size="icon" title="与下一段合并" aria-label={`合并第${index + 1}段与下一段`} disabled={index === units.length - 1} onClick={() => void edit({ kind: "merge", index })}><Combine /></Button>
				</div>
				</details>
			</fieldset>;
		})}
	</details>;
}
