"use client";
export interface FocalPoint {x:number;y:number}
export function FocusFields({
	label,
	value,
	onChange,
}: {
	label: string;
	value?: FocalPoint;
	onChange: (value?: FocalPoint) => void;
}) {
	return (
		<div className="tw-focus">
			<label className="tw-focus-toggle">
				<input
					type="checkbox"
					aria-label={`${label} 自定义焦点`}
					checked={!!value}
					onChange={(e) =>
						onChange(e.target.checked ? { x: 0.5, y: 0.5 } : undefined)
					}
				/>
				自定义焦点
			</label>
			{value &&
				(["x", "y"] as const).map((axis) => (
					<label key={axis}>
						{axis === "x" ? "水平焦点" : "垂直焦点"}
						<input
							aria-label={`${label} 焦点 ${axis}`}
							type="number"
							min="0"
							max="1"
							step="0.05"
							value={value[axis]}
							onChange={(e) =>
								onChange({ ...value, [axis]: Number(e.target.value) })
							}
						/>
					</label>
				))}
		</div>
	);
}
