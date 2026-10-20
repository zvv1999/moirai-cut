import {expect,test} from "bun:test";
import {createCanvas} from "@napi-rs/canvas";
import type {SceneTracks} from "@/timeline";
import {mediaTimeFromSeconds} from "@/wasm";
import {buildScene} from "../scene-builder";
import {resolveRenderTree} from "../resolve";
import type {CanvasRenderer} from "../canvas-renderer";
import {TextNode} from "../nodes/text-node";

test("persisted instance binding reaches ordinary preview/export frame resolution without drift",async()=>{
	const previous=globalThis.OffscreenCanvas;
	globalThis.OffscreenCanvas=class {constructor(width:number,height:number){return createCanvas(width,height);}} as unknown as typeof OffscreenCanvas;
	try {
		const time=mediaTimeFromSeconds({seconds:0.5});
		const common={type:"text",startTime:0,duration:240000,trimStart:0,trimEnd:0,name:"text"};
		const parent={...common,id:"parent",params:{content:"A longer keyword",fontFamily:"Arial",fontSize:8,fontWeight:"700",textAlign:"center","template.textLayoutLeft":-100,"template.textLayoutTop":-30,"template.textLayoutWidth":200,"template.textLayoutHeight":60}};
		const child={...common,id:"child",params:{content:"!",fontFamily:"Arial",fontSize:8,"transform.positionX":110},textAttachment:{parent:{elementId:"parent",trackId:"text-track",groupPath:[]},anchor:[1,0.5]}};
		const tracks={main:{id:"main",type:"video",elements:[]},overlay:[{id:"text-track",type:"text",elements:[child,parent]}],audio:[]} as unknown as SceneTracks;
		const original=JSON.stringify(tracks);
		for(const isPreview of [true,false]) {
			const root=buildScene({tracks,canvasSize:{width:900,height:900},duration:mediaTimeFromSeconds({seconds:2}),background:{type:"color",color:"transparent"},mediaAssets:[],isPreview});
			const parentNode=root.children.find(node=>node.source?.elementId==="parent") as TextNode;
			const childNode=root.children.find(node=>node.source?.elementId==="child") as TextNode;
			const renderer={width:900,height:900} as CanvasRenderer;
			for(const seconds of [0.5,0.75,0.5]) {
				await resolveRenderTree({node:root,renderer,time:mediaTimeFromSeconds({seconds})});
				const measured=parentNode.resolved!.measuredText.visualRect;
				expect(childNode.resolved!.transform.position.x-(measured.left+measured.width)).toBeCloseTo(10,8);
			}
			// The native measured-follow path bakes the absolute initial parent pose.
			// At 90 degrees / scaleX 2, authored child X=110 becomes child Y=220.
			const posed=structuredClone(tracks);
			Object.assign(posed.overlay[0].elements.find(e=>e.id==="parent")!.params,{"transform.rotate":90,"transform.scaleX":2,"transform.scaleY":3});
			Object.assign(posed.overlay[0].elements.find(e=>e.id==="child")!.params,{"transform.positionX":0,"transform.positionY":220,"transform.rotate":90,"transform.scaleX":2,"transform.scaleY":3});
			const posedRoot=buildScene({tracks:posed,canvasSize:{width:900,height:900},duration:mediaTimeFromSeconds({seconds:2}),background:{type:"color",color:"transparent"},mediaAssets:[],isPreview});
			await resolveRenderTree({node:posedRoot,renderer,time});
			const posedParent=posedRoot.children.find(node=>node.source?.elementId==="parent") as TextNode;
			const posedChild=posedRoot.children.find(node=>node.source?.elementId==="child") as TextNode;
			const box=posedParent.resolved!.measuredText.visualRect;
			expect(posedChild.resolved!.transform.position.y/2-(box.left+box.width)).toBeCloseTo(10,8);
			expect(posedChild.resolved!.transform.position.x).toBeCloseTo(0,8);
			childNode.textAttachment!.parent.elementId="missing";
			await expect(resolveRenderTree({node:root,renderer,time})).rejects.toThrow("active text parent instance");
		}
		expect(JSON.stringify(tracks)).toBe(original);
	}finally{globalThis.OffscreenCanvas=previous;}
});

test("size-bound graphic uses exact secondary text after fit/wrap in preview and export without cumulative resize",async()=>{
 const previous=globalThis.OffscreenCanvas;
 globalThis.OffscreenCanvas=class {constructor(width:number,height:number){return createCanvas(width,height);}} as unknown as typeof OffscreenCanvas;
 try {
  const common={startTime:0,duration:240000,trimStart:0,trimEnd:0};
  for(const content of ["Hi","A longer phrase wrapping into multiple lines"]) {
   const tracks={main:{id:"main",type:"video",elements:[]},audio:[],overlay:[
    {id:"text-track",type:"text",elements:[
     {...common,id:"primary",type:"text",name:"Primary",params:{content:"Unrelated headline with another width",fontFamily:"Arial",fontSize:8}},
     {...common,id:"secondary",type:"text",name:"Secondary",params:{content,fontFamily:"Arial",fontSize:8,fontWeight:"700",textAlign:"left","text.maxWidth":220,"text.maxHeight":190,"text.maxLines":3,"background.enabled":true,"background.paddingX":3,"background.paddingY":2,"template.textLayoutLeft":-14,"template.textLayoutTop":-95,"template.textLayoutWidth":248,"template.textLayoutHeight":190}}]},
    {id:"shape-track",type:"graphic",elements:[{...common,id:"ring",type:"graphic",definitionId:"ellipse",name:"Ring",params:{"transform.positionX":110,"transform.positionY":0,"transform.scaleX":0.1,"transform.scaleY":0.05},textAttachment:{parent:{elementId:"secondary",trackId:"text-track",groupPath:[]},anchor:[0.5,0.5],sizeBinding:{width:{factor:1.1,paddingPx:10},height:{factor:1.2,paddingPx:5},baselineSizePx:[90,45],sourceSizePx:900,childAnchor:[0.5,0.5]}}}]}]} as unknown as SceneTracks;
   const original=JSON.stringify(tracks),results:string[]=[];
   for(const isPreview of [true,false]) {
    const root=buildScene({tracks,canvasSize:{width:900,height:900},duration:mediaTimeFromSeconds({seconds:2}),background:{type:"color",color:"transparent"},mediaAssets:[],isPreview});
    const parent=root.children.find(node=>node.source?.elementId==="secondary") as TextNode;
    const child=root.children.find(node=>node.source?.elementId==="ring")!;
    for(const seconds of [.5,.75,.5]) {
     await resolveRenderTree({node:root,renderer:{width:900,height:900} as CanvasRenderer,time:mediaTimeFromSeconds({seconds})});
     const measured=parent.resolved!.measuredText;
     const transform=(child.resolved as {transform:{basis:number[];position:{x:number;y:number}}}).transform;
     expect(transform.basis[0]*900).toBeCloseTo(measured.visualRect.width*1.1+20,8);
     expect(transform.basis[3]*900).toBeCloseTo(measured.visualRect.height*1.2+10,8);
     expect(transform.position.x).toBeCloseTo(measured.visualRect.left+measured.visualRect.width/2,8);
     if(content.length>10)expect(measured.lines.length).toBeGreaterThan(1);
     results.push(JSON.stringify(transform));
    }
   }
   expect(new Set(results).size).toBe(1);expect(JSON.stringify(tracks)).toBe(original);
  }
 }finally{globalThis.OffscreenCanvas=previous;}
});
