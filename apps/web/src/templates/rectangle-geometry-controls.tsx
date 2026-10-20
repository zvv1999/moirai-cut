"use client";

import type { RectangleGeometry } from "./types";

/** Presentation controls only; Rust validates the complete edited definition. */
export function RectangleGeometryControls({ value, eligible, onChange, disabled = false }: {
	value?: RectangleGeometry;
	eligible: boolean;
	onChange: (value: RectangleGeometry | undefined) => void;
	disabled?: boolean;
}) {
	return <fieldset disabled={disabled}>
		<legend>矩形圆角</legend>
		{!eligible && <p>圆角参数只用于矩形图层；已有参数可以清除。</p>}
		<label>圆角半径（短边百分比）<input
			aria-label="矩形圆角半径百分比"
			type="number"
			min={0}
			max={50}
			step={0.5}
			disabled={!eligible}
			value={value?.cornerRadius ?? 0}
			onChange={event => {
				if (Number.isFinite(event.target.valueAsNumber)) {
					onChange({ cornerRadius: event.target.valueAsNumber });
				}
			}}
		/></label>
		{value && <button type="button" aria-label="清除矩形圆角" onClick={() => onChange(undefined)}>清除圆角参数</button>}
		<p className="tw-style-guidance">半径占实际矩形短边的 0–50%。0% 为直角，50% 为胶囊形；正方形在 50% 时为圆形。清除后恢复直角，颜色、描边和动效分别编辑。</p>
	</fieldset>;
}
