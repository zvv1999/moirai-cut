"use client";

import type { EllipseArc } from "./types";

/** Edits the geometry declaration; Rust validates executable combinations. */
export function EllipseArcControls({ value, eligible, onChange, disabled = false }: {
	value?: EllipseArc;
	eligible: boolean;
	onChange: (value: EllipseArc | undefined) => void;
	disabled?: boolean;
}) {
	return <fieldset disabled={disabled}><legend>椭圆弧线</legend>
		<label><input type="checkbox" aria-label="设置椭圆弧线" checked={!!value} disabled={!eligible && !value} onChange={event => onChange(event.target.checked ? { startDegrees: 0, sweepDegrees: 325, cap: "round" } : undefined)}/>设置开口和端点</label>
		{!eligible && <p>弧线需要椭圆图层启用描边，且线宽大于 0。已有弧线设置可以清除。</p>}
		{value && <>
			{([ ["startDegrees", "起始角度", -360, 360], ["sweepDegrees", "顺时针扫过角度", .01, 360] ] as const).map(([field, label, min, max]) => <label key={field}>{label}<input aria-label={label} type="number" disabled={!eligible} value={value[field]} min={min} max={max} step={1} onChange={event => { if (Number.isFinite(event.target.valueAsNumber)) onChange({ ...value, [field]: event.target.valueAsNumber }); }}/></label>)}
			<label>端点<select aria-label="弧线端点" value={value.cap} disabled={!eligible} onChange={event => onChange({ ...value, cap: event.target.value as EllipseArc["cap"] })}><option value="round">圆头</option><option value="butt">平头</option></select></label>
		</>}
		<p className="tw-style-guidance">弧线只改变路径形状，颜色和粗细沿用当前描边。在“动效”中添加“描边显现”，可让笔画沿路径画出；可继续叠加旋转、透明度和文字尺寸跟随。</p>
	</fieldset>;
}

/** Shape geometry has no dependency on an optional named color/text style. */
export function ShapeGeometryControls({element,strokeWidth,disabled,onOutline,onArc}: {
 element: {features:{representation:string;outline?:boolean};ellipseArc?:EllipseArc};
 strokeWidth?:number;
 disabled?:boolean;
 onOutline:(enabled:boolean)=>void;
 onArc:(value:EllipseArc|undefined)=>void;
}) {
 return <>
  {["rectangle","ellipse","star","line"].includes(element.features.representation) && <label><input type="checkbox" aria-label="图形仅描边" checked={!!element.features.outline} disabled={disabled} onChange={event=>onOutline(event.target.checked)}/>仅绘制描边</label>}
  {(element.features.representation==="ellipse"||element.ellipseArc) && <EllipseArcControls value={element.ellipseArc} eligible={element.features.representation==="ellipse"&&!!element.features.outline&&(strokeWidth??2)>0} disabled={disabled} onChange={onArc}/>}
 </>;
}
