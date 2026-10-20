"use client";

import type { TextSizeBinding } from "./types";

/** Edits native parameters only. No text measurement or geometry in the UI. */
export function SizeBindingControls({ label, value, eligible, onChange }: {
	label: string;
	value?: TextSizeBinding;
	eligible: boolean;
	onChange: (value: TextSizeBinding | undefined) => void;
}) {
	return <fieldset className="tw-size-binding">
		<legend>尺寸跟随文字</legend>
		<p>按文字实际宽高调整图形，可分别开启宽度和高度。文字背景已有的内边距也会计入。</p>
		{!eligible && <p role="status">请选择跟随文字边界的矩形、椭圆或线条。已有设置可关闭后再更换参照。</p>}
		{([['width', '宽度', '左右'], ['height', '高度', '上下']] as const).map(([axis, name, sides]) => {
			const setting = value?.[axis];
			return <div key={axis} className="tw-fields">
				<label><input type="checkbox" aria-label={`${label}跟随文字${name}`} checked={!!setting}
					disabled={!eligible && !setting} onChange={event => {
						const next = { ...value };
						if (event.target.checked) next[axis] = { factor: 1, padding: 0 };
						else delete next[axis];
						onChange(next.width || next.height ? next : undefined);
					}}/>跟随文字{name}</label>
				{setting && <>
					<label>{name}倍数<input aria-label={`${label}${name}倍数`} type="number" min={0.01} max={20} step={0.05}
						value={setting.factor} disabled={!eligible} onChange={event => {
							if (Number.isFinite(event.target.valueAsNumber)) onChange({ ...value, [axis]: { ...setting, factor: event.target.valueAsNumber } });
						}}/></label>
					<label>{sides}各留白（画面比例）<input aria-label={`${label}${name}每侧留白`} type="number" min={0} max={1} step={0.001}
						value={setting.padding} disabled={!eligible} onChange={event => {
							if (Number.isFinite(event.target.valueAsNumber)) onChange({ ...value, [axis]: { ...setting, padding: event.target.valueAsNumber } });
						}}/></label>
				</>}
			</div>;
		})}
		<small>图形尺寸 = 文字框尺寸 × 倍数 + 两侧留白。未开启的轴保持原尺寸，图形自身缩放动效继续叠加。</small>
	</fieldset>;
}
