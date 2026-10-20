import { expect, test } from "bun:test";
import { createCanvas, Path2D } from "@napi-rs/canvas";
import { rectangleGraphicDefinition } from "@/graphics/definitions/rectangle";
import { renderTextToContext, type TextNode } from "@/services/renderer/nodes/text-node";
import { measureTextLayout } from "./primitives";
import type { TextCanvasContext } from "./layout";

test("canvas clipping stays fixed while text translates", () => {
	const canvas=createCanvas(400,200);
	const ctx=canvas.getContext("2d");
	const layout=measureTextLayout({ctx:ctx as unknown as TextCanvasContext,canvasHeight:900,text:{content:"MMMMMM",fontSize:6,fontFamily:"Arial",fontWeight:"bold",fontStyle:"normal",textAlign:"left"}});
	for(const x of [-30,40]){
		ctx.clearRect(0,0,400,200);
		const node={params:{canvasCenter:{x:0,y:100},params:{"clip.enabled":true,"clip.x":100,"clip.y":0,"clip.width":100,"clip.height":200}},resolved:{transform:{position:{x,y:0},scaleX:1,scaleY:1,rotate:0},measuredText:layout,textColor:"#ffffff"}} as unknown as TextNode;
		renderTextToContext({node,ctx:ctx as unknown as CanvasRenderingContext2D});
		const data=ctx.getImageData(0,0,400,200).data;
		let inside=0,outside=0;
		for(let y=0;y<200;y++)for(let px=0;px<400;px++)if(data[(y*400+px)*4+3]){if(px>=100&&px<200)inside++;else outside++;}
		expect(inside).toBeGreaterThan(100);expect(outside).toBe(0);
	}
});

test("grid background renders editable spacing and color", () => {
	const original=globalThis.Path2D;
	globalThis.Path2D=Path2D as unknown as typeof globalThis.Path2D;
	try {
		const canvas=createCanvas(128,128),ctx=canvas.getContext("2d");
		rectangleGraphicDefinition.render({ctx:ctx as unknown as CanvasRenderingContext2D,width:128,height:128,params:{fill:"#000000",gridEnabled:true,gridSpacing:32,gridWidth:2,gridColor:"#ffffff"}});
		expect(ctx.getImageData(32,16,1,1).data[0]).toBeGreaterThan(200);
		expect(ctx.getImageData(16,16,1,1).data[0]).toBe(0);
	}finally{globalThis.Path2D=original;}
});

test("rotated text stretches along its own axes, matching graphic transforms", () => {
	const canvas=createCanvas(400,400),ctx=canvas.getContext("2d");
	const layout=measureTextLayout({ctx:ctx as unknown as TextCanvasContext,canvasHeight:900,text:{content:"MMMM",fontSize:3,fontFamily:"Arial",fontWeight:"bold",fontStyle:"normal",textAlign:"center"}});
	function bounds(scaleX:number,scaleY:number,rotate:number) {
		ctx.clearRect(0,0,400,400);
		const node={params:{canvasCenter:{x:200,y:200},params:{}},resolved:{transform:{position:{x:0,y:0},scaleX,scaleY,rotate},measuredText:layout,textColor:"#ffffff"}} as unknown as TextNode;
		renderTextToContext({node,ctx:ctx as unknown as CanvasRenderingContext2D});
		const data=ctx.getImageData(0,0,400,400).data;
		let left=400,top=400,right=-1,bottom=-1;
		for(let y=0;y<400;y++)for(let x=0;x<400;x++)if(data[(y*400+x)*4+3]>127){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
		expect(right).toBeGreaterThan(left);
		expect(bottom).toBeGreaterThan(top);
		return {width:right-left+1,height:bottom-top+1};
	}
	const base=bounds(1,1,90);
	const horizontal=bounds(2,1,90);
	const vertical=bounds(1,2,90);
	expect(Math.abs(horizontal.width-base.width)).toBeLessThanOrEqual(2);
	expect(Math.abs(horizontal.height-base.height*2)).toBeLessThanOrEqual(2);
	expect(Math.abs(vertical.width-base.width*2)).toBeLessThanOrEqual(2);
	expect(Math.abs(vertical.height-base.height)).toBeLessThanOrEqual(2);
	const unrotated=bounds(2,1,0);
	expect(Math.abs(unrotated.width-horizontal.height)).toBeLessThanOrEqual(2);
	expect(Math.abs(unrotated.height-horizontal.width)).toBeLessThanOrEqual(2);
});
