"use client";

import { Plus, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Element, MotionTiming } from "./types";
import { MotionCoverageControls } from "./motion-coverage-controls";

const labels: Record<string, string> = {
	opacity: "透明度", background_opacity: "底板不透明度", scale: "缩放", scale_x: "横向缩放", scale_y: "纵向缩放",
	x: "水平位移", y: "垂直位移", rotation: "旋转", reveal: "文字揭示", stroke_reveal: "描边显现",
};
const easings = { linear: "匀速", ease_in: "缓入", ease_out: "缓出", ease_in_out: "缓入缓出", overshoot: "回弹" };

export function strokeRevealKeys(timing?: MotionTiming | null): Element["motions"][number]["keys"] {
    const end=timing?.enterEnd;
    const at=typeof end === "number" && Number.isFinite(end) && end > 0 && end < 1 ? end : .2;
    return [{time:0,value:0,easing:"ease_out"},{time:at,value:1,easing:"linear"},{time:1,value:1,easing:"linear"}];
}

export function ElementMotion({ motions, representation, onChange, busy, onEntrance, allowReveal = true, allowStrokeReveal = false, motionTiming, onTimingChange, onEnvelope, compact = false }: {
	motions: Element["motions"];
	representation: string;
	onChange: (motions: Element["motions"]) => void;
	busy?: boolean;
	compact?: boolean;
	allowReveal?: boolean;
	allowStrokeReveal?: boolean;
	motionTiming?: MotionTiming | null;
	onTimingChange?: (timing: MotionTiming | null) => void;
	onEnvelope?: (entrance: string, enterSeconds: number, exitSeconds: number) => void;
	onEntrance: (entrance: string, durationFraction: number) => void;
}) {
	const [entrance, setEntrance] = useState("pop");
	const [durationPercent, setDurationPercent] = useState(20);
	function update(track: number, key: number, patch: Partial<Element["motions"][number]["keys"][number]>) {
		onChange(motions.map((motion, i) => i === track ? {
			...motion, keys: motion.keys.map((frame, j) => j === key ? { ...frame, ...patch } : frame),
		} : motion));
	}
	return <section className="tw-motion-panel" aria-label="元素动效">
		<h2>{compact ? "动效" : "动效关键帧"}</h2>
		<p className="tw-style-guidance">配置元素出现后的动作。实际出现时刻由应用规则与 TTS／原声对齐结果决定。</p>
		{representation !== "audio" && <fieldset disabled={busy}>
			<legend>{motionTiming ? "入退场动效" : "入场动效"}</legend>
			{onTimingChange && <label>时间模式<select aria-label="动效时间模式" value={motionTiming ? "phases" : "relative"} onChange={(event) => onTimingChange(event.target.value === "relative" ? null : {enterEnd:0.2,exitStart:0.8,enterSeconds:0.2,exitSeconds:0.15})}>
				<option value="relative">随片段时长缩放</option><option value="phases">固定入退场 · 动态停留</option>
			</select></label>}
			{onTimingChange && <p className="tw-style-guidance">{motionTiming ? "入场和退场保持指定秒数，中间停留跟随内容时长；内容过短时会压缩入退场。" : "动作按元素的实际显示时长等比伸缩；显示越久，动作越慢。"}</p>}
			{motionTiming && onTimingChange && <>
				<label>入场秒数<input aria-label="入场秒数" type="number" min={0} max={30} step={0.01} value={motionTiming.enterSeconds} onChange={(event) => onTimingChange({...motionTiming,enterSeconds:event.target.valueAsNumber})} /></label>
				<label>退场秒数<input aria-label="退场秒数" type="number" min={0} max={30} step={0.01} value={motionTiming.exitSeconds} onChange={(event) => onTimingChange({...motionTiming,exitSeconds:event.target.valueAsNumber})} /></label>
				<details><summary>阶段边界</summary>
					<label>入场结束 %<input aria-label="入场结束进度" type="number" min={0} max={motionTiming.exitStart*100} step={1} value={motionTiming.enterEnd*100} onChange={(event) => onTimingChange({...motionTiming,enterEnd:event.target.valueAsNumber/100})} /></label>
					<label>退场开始 %<input aria-label="退场开始进度" type="number" min={motionTiming.enterEnd*100} max={100} step={1} value={motionTiming.exitStart*100} onChange={(event) => onTimingChange({...motionTiming,exitStart:event.target.valueAsNumber/100})} /></label>
				</details>
				<MotionCoverageControls timing={motionTiming} onChange={onTimingChange} disabled={busy} />
			</>}
			<label>效果<select aria-label="入场效果" value={entrance} onChange={(event) => setEntrance(event.target.value)}><option value="fade">淡入</option><option value="pop">弹入</option><option value="rise">上浮</option></select></label>
			{motionTiming && onEnvelope ? <Button variant="outline" onClick={() => onEnvelope(entrance,motionTiming.enterSeconds,motionTiming.exitSeconds)}><Sparkles />应用入退场动效</Button> : <>
				<label>入场占比 %<input aria-label="入场占比 %" type="number" min={1} max={100} value={durationPercent} onChange={(event) => setDurationPercent(Number(event.target.value))} /></label>
				<Button variant="outline" disabled={durationPercent < 1 || durationPercent > 100 || !Number.isFinite(durationPercent)} onClick={() => onEntrance(entrance, durationPercent / 100)}><Sparkles />应用入场动效</Button>
			</>}
		</fieldset>}
		{representation === "text" && <p className="tw-style-guidance">底板不透明度只影响文字背景，需先在外观中启用底板；数值 0–1，不改变文字清晰度。</p>}
		{allowStrokeReveal && <p className="tw-style-guidance">描边显现沿椭圆路径从 0 画到 1，独立于透明度。它只影响当前描边，不改变文字或整组内容。</p>}
		<p className="tw-style-guidance" aria-label="当前动画轨道">当前动画：{motions.length ? motions.map(motion => labels[motion.property] ?? motion.property).join("、") : "无"}</p>
		<details className="tw-motion-advanced" open={compact ? undefined : true}><summary>高级关键帧 · {motions.length} 条轨道</summary>
		<p className="tw-style-guidance">动作进度从 0% 到 100%，不绑定成片中的第几秒。固定入退场模式下，阶段边界决定各段关键帧如何映射到入场、停留和退场。</p>
		<fieldset disabled={busy}>
		<label>添加动画轨道<select aria-label="添加动画轨道" value="" onChange={(event) => {
			const property = event.target.value;
			if (!property) return;
			const value = ["opacity", "background_opacity", "scale", "scale_x", "scale_y", "reveal"].includes(property) ? 1 : 0;
			onChange([...motions, { property, keys: property === "stroke_reveal" ? strokeRevealKeys(motionTiming) : [{ time: 0, value, easing: "linear" }, { time: 1, value, easing: "linear" }] }]);
		}}><option value="">选择属性</option>{Object.entries(labels).filter(([property]) => (property !== "stroke_reveal" || allowStrokeReveal) && (property !== "background_opacity" || representation === "text") && (property !== "reveal" || (allowReveal && representation === "text")) && !motions.some((motion) => motion.property === property || (property === "scale" && ["scale_x", "scale_y"].includes(motion.property)) || (["scale_x", "scale_y"].includes(property) && motion.property === "scale"))).map(([property, label]) => <option key={property} value={property}>{label}</option>)}</select></label>
		{motions.length === 0 && <p>无元素动画</p>}
		{motions.map((motion, track) => <fieldset key={motion.property}>
			<legend>{labels[motion.property] ?? motion.property}</legend>
			<Button variant="ghost" size="icon" title="移除动画轨道" aria-label={`移除${labels[motion.property]}动画轨道`} onClick={() => onChange(motions.filter((_, index) => index !== track))}><X /></Button>
			{motion.keys.map((frame, key) => <div className="tw-motion-key" key={key}>
				<label>动作进度 %<input aria-label={`${labels[motion.property]}关键帧${key + 1}时间`} type="number" min={(motion.keys[key - 1]?.time ?? 0) * 100} max={(motion.keys[key + 1]?.time ?? 1) * 100} step="0.1" value={Number((frame.time * 100).toFixed(4))} onChange={(event) => update(track, key, { time: Number(event.target.value) / 100 })} /></label>
				<label>数值<input aria-label={`${labels[motion.property]}关键帧${key + 1}数值`} type="number" min={["background_opacity", "stroke_reveal"].includes(motion.property) ? 0 : undefined} max={["background_opacity", "stroke_reveal"].includes(motion.property) ? 1 : undefined} step="0.01" value={frame.value} onChange={(event) => update(track, key, { value: Number(event.target.value) })} /></label>
				<label>缓动<select aria-label={`${labels[motion.property]}关键帧${key + 1}缓动`} value={frame.easing} onChange={(event) => update(track, key, { easing: event.target.value })}>{Object.entries(easings).map(([value, label]) => <option key={value} value={value} disabled={motion.property === "stroke_reveal" && value === "overshoot"}>{label}</option>)}</select></label>
				<Button variant="ghost" size="icon" title="删除关键帧" aria-label={`删除${labels[motion.property]}关键帧${key + 1}`} disabled={motion.keys.length <= 2} onClick={() => onChange(motions.map((entry, i) => i === track ? { ...entry, keys: entry.keys.filter((_, j) => j !== key) } : entry))}><X /></Button>
				{key < motion.keys.length - 1 && <Button variant="ghost" size="icon" title="在后方插入关键帧" aria-label={`在${labels[motion.property]}关键帧${key + 1}后插入`} disabled={motion.keys.length >= 100 || motion.keys[key + 1].time <= frame.time} onClick={() => onChange(motions.map((entry, i) => i === track ? { ...entry, keys: [...entry.keys.slice(0, key + 1), { ...frame, time: (frame.time + entry.keys[key + 1].time) / 2 }, ...entry.keys.slice(key + 1)] } : entry))}><Plus /></Button>}
			</div>)}
		</fieldset>)}
		</fieldset>
		</details>
	</section>;
}
