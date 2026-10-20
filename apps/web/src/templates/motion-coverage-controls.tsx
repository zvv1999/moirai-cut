"use client";

import type { MotionTiming } from "./types";

/** Authoring inputs only; Rust validates and computes output frame coverage. */
export function MotionCoverageControls({ timing, onChange, label = "动效", disabled = false }: {
	timing: MotionTiming;
	onChange: (timing: MotionTiming) => void;
	label?: string;
	disabled?: boolean;
}) {
	return <fieldset disabled={disabled} aria-label={`${label}退场检查`}>
		<legend>退场检查</legend>
		<label><input type="checkbox" aria-label={`${label}要求退场采样`} checked={!!timing.coverage} onChange={event => {
			if (event.target.checked) onChange({ ...timing, coverage: { minExitFrames: timing.exitSeconds > 0 ? 1 : 0, minPostFrames: 1 } });
			else {
				const { coverage: _coverage, ...rest } = timing;
				onChange(rest);
			}
		}} />检查退场及结束后的画面帧</label>
		{timing.coverage ? <>
			{([
				["minExitFrames", "退场区间至少帧数"],
				["minPostFrames", "结束后至少帧数"],
			] as const).map(([key, title]) => <label key={key}>{title}<input aria-label={`${label}${title}`} type="number" min={0} max={120} step={1} value={timing.coverage![key]} onChange={event => {
				const value = event.target.valueAsNumber;
				if (Number.isInteger(value) && value >= 0 && value <= 120) onChange({ ...timing, coverage: { ...timing.coverage!, [key]: value } });
			}} /></label>)}
			<p className="tw-style-guidance">两项不能同时为 0。要求退场帧时，退场秒数须大于 0。试映会检查时间是否足够，结束后仍可显示其它元素。</p>
		</> : <p className="tw-style-guidance">允许在显示区间结束时直接切出；需要完整退场时再开启检查。</p>}
	</fieldset>;
}
