"use client";

import { measuredBoxCorners } from "@/services/renderer/text-measurements";
import type { FrameSelectionMeasurement } from "@/services/renderer/frame-selection";
import type { EditingRegion, LayoutEditing } from "./effect-layout-overlay";
import { useEffect, useRef, useState } from "react";
import { MeasuredScaleHandles } from "./measured-scale-handles";

/** Select resolved leaf bounds; authored-region handles still own move and resize. */
export function MeasuredLayerSelection({ measurements, canvas, regions, editing, snapshot }: {
	measurements: FrameSelectionMeasurement[];
	canvas: { width: number; height: number };
	regions: EditingRegion[];
	editing: LayoutEditing;
	snapshot: string;
}) {
	const pointer=useRef<{id:string;pointerId:number;x:number;y:number;scaleX:number;scaleY:number;basis:[number,number,number,number];snapshot:string}|null>(null);
	const [offset,setOffset]=useState<{id:string;x:number;y:number}|null>(null);
	useEffect(()=>{
		const cancel=(event:KeyboardEvent)=>{if(event.key==="Escape"){pointer.current=null;setOffset(null);}};
		window.addEventListener("keydown",cancel);
		return ()=>window.removeEventListener("keydown",cancel);
	},[]);
	return <svg className="tw-measured-selection" aria-label="当前元素测量边界" viewBox={`0 0 ${canvas.width} ${canvas.height}`}>
		{measurements.map(item => {
			const id = item.source.templateElementId;
			const region = regions.find(region => region.id === id && region.kind !== "group");
			if (!id || !region) return null;
			const corners = measuredBoxCorners(item, canvas);
			if (corners.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
			const area = Math.abs(corners.reduce((sum, point, index) => {
				const next = corners[(index + 1) % corners.length];
				return sum + point.x * next.y - next.x * point.y;
			}, 0)) / 2;
			if (area < 1) return null;
			return <polygon key={JSON.stringify([item.source.groupPath, item.source.trackId, item.source.elementId])}
				data-measured-layer-id={id} role="button" tabIndex={editing.busy ? -1 : 0}
				aria-label={`选中${region.name}实际${item.kind === "text" ? "文字" : "素材"}区域`} aria-pressed={editing.selectedId === id} aria-disabled={editing.busy}
				points={corners.map(point => `${point.x},${point.y}`).join(" ")}
				vectorEffect="non-scaling-stroke"
				style={{touchAction:"none",cursor:item.movementBasis&&editing.onMoveInFrame?"move":"pointer"}}
				transform={offset?.id===id?`translate(${offset.x} ${offset.y})`:undefined}
				onPointerDown={event=>{
					if(event.button!==0||editing.busy)return;
					event.preventDefault();event.currentTarget.focus();editing.onSelect(id);
					if(!item.movementBasis||!editing.onMoveInFrame)return;
					const rect=event.currentTarget.ownerSVGElement!.getBoundingClientRect();
					pointer.current={id,pointerId:event.pointerId,x:event.clientX,y:event.clientY,scaleX:canvas.width/rect.width,scaleY:canvas.height/rect.height,basis:item.movementBasis,snapshot};
					event.currentTarget.setPointerCapture(event.pointerId);
				}}
				onPointerMove={event=>{const p=pointer.current;if(p&&p.pointerId===event.pointerId)setOffset({id:p.id,x:(event.clientX-p.x)*p.scaleX,y:(event.clientY-p.y)*p.scaleY});}}
				onPointerUp={event=>{
					const p=pointer.current;pointer.current=null;setOffset(null);
					if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
					if(!p||p.pointerId!==event.pointerId||editing.busy)return;
					const dx=event.clientX-p.x,dy=event.clientY-p.y;
					if(Math.abs(dx)+Math.abs(dy)>2)editing.onMoveInFrame?.(p.id,dx*p.scaleX,dy*p.scaleY,p.basis,p.snapshot);
				}}
				onPointerCancel={()=>{pointer.current=null;setOffset(null);}}
				onClick={() => { if (!editing.busy) editing.onSelect(id); }}
				onKeyDown={event => {
					const arrows:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
					if(arrows[event.key] && item.movementBasis && editing.onMoveInFrame && !editing.busy){event.preventDefault();const [x,y]=arrows[event.key],step=event.shiftKey?10:1;editing.onMoveInFrame(id,x*step,y*step,item.movementBasis,snapshot);return;}
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						if (!editing.busy) editing.onSelect(id);
					}
				}} />;
		})}
		{measurements.filter(item=>item.source.templateElementId===editing.selectedId).map(item=><MeasuredScaleHandles key={JSON.stringify([item.source.groupPath,item.source.trackId,item.source.elementId])} item={item} canvas={canvas} editing={editing} snapshot={snapshot}/>)}
	</svg>;
}
