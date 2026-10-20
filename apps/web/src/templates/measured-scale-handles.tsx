"use client";

import {useEffect,useRef,useState} from "react";
import {measuredBoxCorners} from "@/services/renderer/text-measurements";
import type {FrameSelectionMeasurement} from "@/services/renderer/frame-selection";
import type {FrameScaleChange,LayoutEditing} from "./effect-layout-overlay";
import {groupBasis,multiplyBasis,transformBasis} from "@/services/renderer/attachment-basis";

export function MeasuredScaleHandles({item,canvas,editing,snapshot}:{item:FrameSelectionMeasurement;canvas:{width:number;height:number};editing:LayoutEditing;snapshot:string}) {
	const host=useRef<SVGGElement>(null);
	const [handleRadius,setHandleRadius]=useState(6);
	useEffect(()=>{
		const svg=host.current?.ownerSVGElement;if(!svg)return;
		const update=()=>{const width=svg.getBoundingClientRect().width;if(width>0)setHandleRadius(6*canvas.width/width);};
		update();const observer=new ResizeObserver(update);observer.observe(svg);
		return ()=>observer.disconnect();
	},[canvas.width]);
	const gesture=useRef<{pointerId:number;x:number;y:number;scaleX:number;scaleY:number;diagonal:[number,number];pivotToOrigin:[number,number];basis:FrameScaleChange["basis"];pivot:{x:number;y:number};snapshot:string;axis?:"x"|"y";visualBasis:FrameScaleChange["basis"]}|null>(null);
	const [guide,setGuide]=useState<{a:{x:number;y:number};b:{x:number;y:number}}|null>(null);
	useEffect(()=>{const cancel=(event:KeyboardEvent)=>{if(event.key==="Escape"){gesture.current=null;setGuide(null);}};window.addEventListener("keydown",cancel);return ()=>window.removeEventListener("keydown",cancel);},[]);
	const id=item.source.templateElementId;
	if(!id || !item.movementBasis || !editing.onScaleInFrame)return null;
	const corners=measuredBoxCorners(item,canvas);
	const origin=measuredBoxCorners({...item,box:{left:0,top:0,width:0,height:0}},canvas)[0];
	if(corners.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
	const visualBasis=multiplyBasis(groupBasis(item.groups.map(group=>group.transform)),transformBasis(item.transform));
	const midpoint=(a:{x:number;y:number},b:{x:number;y:number})=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
	const handles:{point:{x:number;y:number};pivot:{x:number;y:number};label:string;axis?:"x"|"y"}[]=corners.map((point,index)=>({point,pivot:corners[(index+2)%4],label:`等比缩放${["左上","右上","右下","左下"][index]}角`}));
	for(let index=0;index<4;index++)handles.push({point:midpoint(corners[index],corners[(index+1)%4]),pivot:midpoint(corners[(index+2)%4],corners[(index+3)%4]),label:`${index%2===0?"纵向":"横向"}缩放${["上","右","下","左"][index]}边`,axis:index%2===0?"y":"x"});
	return <g ref={host} className="tw-measured-scale">
		{guide&&<line x1={guide.a.x} y1={guide.a.y} x2={guide.b.x} y2={guide.b.y} stroke="#f59e0b" strokeDasharray="4 3" vectorEffect="non-scaling-stroke"/>}
		{handles.map(({point,pivot,label,axis},index)=>{
			const diagonal:[number,number]=[point.x-pivot.x,point.y-pivot.y];
			if(Math.hypot(...diagonal)<1)return null;
			return <circle key={index} cx={point.x} cy={point.y} r={handleRadius} vectorEffect="non-scaling-stroke" role="button" tabIndex={editing.busy?-1:0} aria-disabled={editing.busy}
				aria-label={label} data-scale-layer-id={id} data-scale-corner={index<4?index:undefined} data-scale-edge={index>=4?index-4:undefined}
				onPointerDown={event=>{
					if(event.button!==0||editing.busy)return;
					event.preventDefault();event.stopPropagation();event.currentTarget.focus();
					const rect=event.currentTarget.ownerSVGElement!.getBoundingClientRect();
					gesture.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY,scaleX:canvas.width/rect.width,scaleY:canvas.height/rect.height,diagonal,pivotToOrigin:[origin.x-pivot.x,origin.y-pivot.y],basis:item.movementBasis!,pivot,snapshot,axis,visualBasis};
					event.currentTarget.setPointerCapture(event.pointerId);
				}}
				onPointerMove={event=>{const p=gesture.current;if(p?.pointerId===event.pointerId)setGuide({a:p.pivot,b:{x:p.pivot.x+p.diagonal[0]+(event.clientX-p.x)*p.scaleX,y:p.pivot.y+p.diagonal[1]+(event.clientY-p.y)*p.scaleY}});}}
				onPointerUp={event=>{
					const p=gesture.current;gesture.current=null;setGuide(null);
					if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
					if(!p||p.pointerId!==event.pointerId||editing.busy)return;
					const dx=event.clientX-p.x,dy=event.clientY-p.y;
					if(Math.abs(dx)+Math.abs(dy)>2)editing.onScaleInFrame?.(id,{delta:[dx*p.scaleX,dy*p.scaleY],diagonal:p.diagonal,pivotToOrigin:p.pivotToOrigin,basis:p.basis,axis:p.axis,visualBasis:p.visualBasis},p.snapshot);
				}}
				onPointerCancel={()=>{gesture.current=null;setGuide(null);}}
				onKeyDown={event=>{
					if(editing.busy||!["ArrowRight","ArrowUp","ArrowLeft","ArrowDown"].includes(event.key))return;
					event.preventDefault();const factor=(event.shiftKey?0.1:0.01)*(["ArrowRight","ArrowUp"].includes(event.key)?1:-1);
					editing.onScaleInFrame?.(id,{delta:[diagonal[0]*factor,diagonal[1]*factor],diagonal,pivotToOrigin:[origin.x-pivot.x,origin.y-pivot.y],basis:item.movementBasis!,axis,visualBasis},snapshot);
				}}/>;
		})}
	</g>;
}
