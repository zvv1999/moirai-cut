"use client";
import type { StarGeometry } from "./types";

/** Edits only star geometry; native validation owns executable combinations. */
export function StarGeometryControls({value,eligible,onChange,disabled=false}:{value?:StarGeometry;eligible:boolean;onChange:(value:StarGeometry|undefined)=>void;disabled?:boolean}) {
 const current=value??{points:5,depth:45};
 return <fieldset disabled={disabled}><legend>星形几何</legend>
  {!eligible&&<p>星形参数只用于星形图层；请清除旧参数后再切换表现类型。</p>}
  <label>角数<input aria-label="星形角数" type="number" min={3} max={12} step={1} disabled={!eligible} value={current.points} onChange={event=>{const v=event.target.valueAsNumber;if(Number.isInteger(v))onChange({...current,points:v});}}/></label>
  <label>内半径百分比<input aria-label="星形内半径百分比" type="number" min={1} max={99} step={1} disabled={!eligible} value={current.depth} onChange={event=>{const v=event.target.valueAsNumber;if(Number.isFinite(v))onChange({...current,depth:v});}}/></label>
  {value&&<button type="button" onClick={()=>onChange(undefined)}>清除星形参数</button>}
  <p>内半径越小，星角越尖。省略参数时使用五角星、45%内半径；颜色、描边和动效分别编辑。</p>
 </fieldset>;
}

/** Lightweight layout thumbnail; final pixels use the native graphic renderer. */
export function StarGeometryThumbnail({value,fill,stroke,strokeWidth=0}:{value?:StarGeometry;fill:string;stroke:string;strokeWidth?:number}) {
 const shape=value??{points:5,depth:45};
 if(!Number.isInteger(shape.points)||shape.points<3||shape.points>12||!Number.isFinite(shape.depth)||shape.depth<1||shape.depth>99)return <span>星形参数待修复</span>;
 const outer=Math.max(1,50-strokeWidth/2);
 const points=Array.from({length:shape.points*2},(_,i)=>{const radius=i%2?outer*shape.depth/100:outer;const angle=-Math.PI/2+i*Math.PI/shape.points;return `${50+Math.cos(angle)*radius},${50+Math.sin(angle)*radius}`;}).join(' ');
 return <svg aria-label="星形布局示意" viewBox="0 0 100 100" preserveAspectRatio="none" style={{width:"100%",height:"100%",position:"absolute",inset:0}}><polygon points={points} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round"/></svg>;
}
