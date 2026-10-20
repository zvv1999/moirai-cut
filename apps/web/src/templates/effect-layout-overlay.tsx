"use client";

import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent, type CSSProperties } from "react";

type Corner="top_left"|"top_right"|"bottom_left"|"bottom_right";
export type FrameScaleChange={delta:[number,number];diagonal:[number,number];pivotToOrigin:[number,number];basis:[number,number,number,number];axis?:"x"|"y";visualBasis?:[number,number,number,number]};
export type FramePose={sceneTime:number;localTime:number;position:[number,number];basis:[number,number,number,number]};

export type EditingRegion = {id:string;name:string;region:{x:number;y:number;width:number;height:number};z:number;kind?:"element"|"group"};
export type LayoutEditing = {
  selectedId:string;
  busy:boolean;
  canDetach?:boolean;
  onDetachInFrame?:(id:string,attached:FramePose,independent:FramePose,snapshot:string)=>Promise<void>;
  onSelect:(id:string)=>void;
  onMove:(id:string,deltaX:number,deltaY:number)=>void;
  onMoveInFrame?:(id:string,deltaX:number,deltaY:number,basis:[number,number,number,number],snapshot:string)=>void;
  onScaleInFrame?:(id:string,change:FrameScaleChange,snapshot:string)=>void;
  onResize:(id:string,corner:Corner,deltaX:number,deltaY:number)=>void;
};

export function EffectLayoutOverlay({regions,canvas,editing}:{regions:EditingRegion[];canvas:{width:number;height:number};editing:LayoutEditing}) {
  const host=useRef<HTMLDivElement>(null);
  const pointer=useRef<{id:string;pointerId:number;x:number;y:number;width:number;height:number;corner?:Corner}|null>(null);
  const [offset,setOffset]=useState<{id:string;x:number;y:number;corner?:Corner}|null>(null);
  useEffect(()=>{
    const cancel=(event:globalThis.KeyboardEvent)=>{if(event.key==="Escape"){pointer.current=null;setOffset(null);}};
    window.addEventListener("keydown",cancel);
    return ()=>window.removeEventListener("keydown",cancel);
  },[]);
  const selected=regions.find(region=>region.id===editing.selectedId);
  function style({id,region}:EditingRegion):CSSProperties {
    const base={left:`${region.x*100}%`,top:`${region.y*100}%`,width:`${region.width*100}%`,height:`${region.height*100}%`};
    if(offset?.id!==id)return base;
    if(!offset.corner)return {...base,transform:`translate(${offset.x}px,${offset.y}px)`};
    const left=offset.corner.endsWith("left"),top=offset.corner.startsWith("top");
    return {left:`calc(${base.left} + ${left?offset.x:0}px)`,top:`calc(${base.top} + ${top?offset.y:0}px)`,width:`max(1px, calc(${base.width} + ${(left?-1:1)*offset.x}px))`,height:`max(1px, calc(${base.height} + ${(top?-1:1)*offset.y}px))`};
  }
  function down(event:PointerEvent<HTMLButtonElement>,id:string,corner?:Corner){
    if(event.button!==0||editing.busy)return;
    event.preventDefault();event.currentTarget.focus();editing.onSelect(id);
    const bounds=host.current!.getBoundingClientRect();
    pointer.current={id,corner,pointerId:event.pointerId,x:event.clientX,y:event.clientY,width:bounds.width,height:bounds.height};
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event:PointerEvent<HTMLButtonElement>){const start=pointer.current;if(start?.pointerId===event.pointerId)setOffset({id:start.id,corner:start.corner,x:event.clientX-start.x,y:event.clientY-start.y});}
  function up(event:PointerEvent<HTMLButtonElement>){
    const start=pointer.current;pointer.current=null;setOffset(null);
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    if(!start||start.pointerId!==event.pointerId)return;
    const dx=event.clientX-start.x,dy=event.clientY-start.y;
    if(Math.abs(dx)+Math.abs(dy)>2){
      if(start.corner)editing.onResize(start.id,start.corner,dx/start.width,dy/start.height);
      else editing.onMove(start.id,dx/start.width,dy/start.height);
    }
  }
  function key(event:KeyboardEvent<HTMLButtonElement>,id:string,corner?:Corner){
    if(event.key==="Enter"||event.key===" "){event.preventDefault();editing.onSelect(id);return;}
    const direction:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    const delta=direction[event.key];if(!delta)return;
    event.preventDefault();editing.onSelect(id);
    const step=event.shiftKey?10:1;
    if(corner)editing.onResize(id,corner,delta[0]*step/canvas.width,delta[1]*step/canvas.height);
    else editing.onMove(id,delta[0]*step/canvas.width,delta[1]*step/canvas.height);
  }
  return <div ref={host} className="tw-layout-overlay" role="group" aria-label="图层布局区域">
    {regions.filter(region=>region.kind!=="group"||region.id===editing.selectedId).map(({id,name,region,z,kind})=><button key={id} data-layer-id={id} type="button" title={`${name}布局区域`} aria-label={`${name}布局区域`} aria-pressed={editing.selectedId===id} disabled={editing.busy}
      style={{...style({id,name,region,z}),zIndex:kind==="group"?2147483646:z}}
      onPointerDown={event=>down(event,id)} onPointerMove={move} onPointerUp={up}
      onPointerCancel={()=>{pointer.current=null;setOffset(null);}}
      onKeyDown={event=>key(event,id)} />)}
    {selected&&<div className="tw-layout-handles" style={style(selected)}>
      {([['top_left','左上'],['top_right','右上'],['bottom_left','左下'],['bottom_right','右下']] as const).map(([corner,label])=><button key={corner} className={`tw-layout-handle ${corner}`} aria-label={`调整${label}角`} title={`调整${label}角`} disabled={editing.busy} onPointerDown={event=>down(event,selected.id,corner)} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{pointer.current=null;setOffset(null);}} onKeyDown={event=>key(event,selected.id,corner)}/>)}
    </div>}
  </div>;
}
