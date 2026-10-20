"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {EffectPreview} from "./effect-preview";

// UI-only cache and render queue. Native preview owns timing and graph compilation.
const cache=new Map<string,string>();
let running=0;
const waiting:Array<()=>void>=[];
function acquire(start:()=>void){
 let cancelled=false,released=false,started=false;
 const release=()=>{if(released)return;released=true;if(started){running--;waiting.shift()?.();}};
 const run=()=>{if(cancelled){waiting.shift()?.();return;}started=true;running++;start();};
 if(running<2)run();else waiting.push(run);
 return {release,cancel:()=>{cancelled=true;release();}};
}
function thumbnailImage(source:HTMLCanvasElement){
 const ctx=source.getContext("2d");if(!ctx)throw Error("无法读取缩略图");
 const {data}=ctx.getImageData(0,0,source.width,source.height);
 // The shared renderer can clear transparent scenes to black; trim that matte
 // as well as transparent pixels so small authored marks remain recognizable.
 let left=source.width,top=source.height,right=-1,bottom=-1;
 for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)if(data[(y*source.width+x)*4+3]>16 && data[(y*source.width+x)*4]+data[(y*source.width+x)*4+1]+data[(y*source.width+x)*4+2]>36){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<left)throw Error("当前样例没有可见内容");
 const width=right-left+1,height=bottom-top+1;
 const canvas=document.createElement("canvas");canvas.width=192;canvas.height=112;
 const target=canvas.getContext("2d")!;target.fillStyle="#172126";target.fillRect(0,0,192,112);
 const scale=Math.min(168/width,88/height);target.drawImage(source,left,top,width,height,(192-width*scale)/2,(112-height*scale)/2,width*scale,height*scale);
 return canvas.toDataURL("image/png");
}
export function StyleThumbnail({definition}:{definition:{id:string;revision:number}}){
 const key=definition.id+':'+definition.revision;
 const ref=useRef<HTMLSpanElement>(null),slot=useRef<ReturnType<typeof acquire>|null>(null);
 const [visible,setVisible]=useState(false),[render,setRender]=useState(false),[url,setUrl]=useState(()=>cache.get(key)),[error,setError]=useState("");
 useEffect(()=>{const target=ref.current;if(!target)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:"80px"});observer.observe(target);return()=>observer.disconnect();},[]);
 useEffect(()=>{if(!visible||url||error)return;const ticket=acquire(()=>setRender(true));slot.current=ticket;return()=>{ticket.cancel();slot.current=null;};},[visible,url,error]);
 const fail=useCallback((message:string)=>{setError(message);setRender(false);slot.current?.release();},[]);
 const ready=useCallback((canvas:HTMLCanvasElement)=>{try{const image=thumbnailImage(canvas);cache.set(key,image);while(cache.size>80)cache.delete(cache.keys().next().value!);setUrl(image);setRender(false);slot.current?.release();}catch(error){fail(error instanceof Error?error.message:'无法生成缩略图');}},[key,fail]);
 return <span ref={ref} className="tw-style-thumbnail" aria-hidden="true" data-thumbnail-state={url?'ready':error?'error':'pending'}>
  {url?<img src={url} alt=""/>:<span title={error||undefined}>{error?'点开查看':'预览…'}</span>}
  {render&&!url&&!error&&<EffectPreview definition={definition} thumbnail onThumbnail={ready} onThumbnailError={fail}/>}
 </span>;
}
