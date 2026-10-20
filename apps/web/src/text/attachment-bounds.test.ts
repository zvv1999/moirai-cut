import { expect, test } from "bun:test";
import { createCanvas } from "@napi-rs/canvas";
import type { TextElement } from "@/timeline";
import { measureTextElement } from "./measure-element";

const ctx=createCanvas(1,1).getContext("2d") as unknown as CanvasRenderingContext2D;
function measure(params: Record<string,string|number|boolean>) {
	return measureTextElement({ctx,canvasHeight:900,localTime:0,element:{params:{content:"Sample",fontSize:8,fontFamily:"Arial",fontWeight:"700",textAlign:"center",lineHeight:1.2,"background.enabled":false,...params}} as unknown as TextElement});
}

test("attachment candidate bounds follow final text width and alignment",()=>{
	for(const textAlign of ["left","center","right"]) {
		const short=measure({content:"Hi",textAlign});
		const long=measure({content:"Long keyword",textAlign});
		expect(long.visualRect.width).toBeGreaterThan(short.visualRect.width);
		for(const result of [short,long]) {
			expect(result.visualRect.width).toBeCloseTo(result.block.maxWidth,6);
			const ratio=textAlign==="left"?0:textAlign==="center"?-0.5:-1;
			expect(result.visualRect.left).toBeCloseTo(result.visualRect.width*ratio,6);
		}
	}
});

test("attachment candidate bounds include scaled padding and shifted background union",()=>{
	const base=measure({});
	const padded=measure({"background.enabled":true,"background.color":"#ffffff","background.paddingX":3,"background.paddingY":2,"background.offsetX":0,"background.offsetY":0});
	const px=3*padded.fontSizeRatio,py=2*padded.fontSizeRatio;
	expect(padded.visualRect.width).toBeCloseTo(base.visualRect.width+px*2,6);
	expect(padded.visualRect.height).toBeCloseTo(base.visualRect.height+py*2,6);
	const shifted=measure({"background.enabled":true,"background.color":"#ffffff","background.paddingX":0,"background.paddingY":0,"background.offsetX":25,"background.offsetY":-12});
	expect(shifted.visualRect.left).toBeCloseTo(base.visualRect.left,6);
	expect(shifted.visualRect.width).toBeCloseTo(base.visualRect.width+25,6);
	expect(shifted.visualRect.top).toBeCloseTo(base.visualRect.top-12,6);
	expect(shifted.visualRect.height).toBeCloseTo(base.visualRect.height+12,6);
});

test("fitted multiline measurement owns attachment bounds rather than authored limits",()=>{
	const result=measure({content:"A long phrase that wraps across several lines","text.maxWidth":220,"text.maxHeight":190,"text.maxLines":3});
	expect(result.lines.length).toBeGreaterThan(1);
	expect(result.lines.length).toBeLessThanOrEqual(3);
	expect(result.visualRect.width).toBeLessThanOrEqual(220.001);
	expect(result.visualRect.height).toBeLessThanOrEqual(190.001);
	expect(result.visualRect.height).toBeCloseTo(result.block.height,6);
});

test("shadow and stroke overhang do not displace text-box attachment",()=>{
	const plain=measure({});
	const decorated=measure({"geometry.shadow.enabled":true,"geometry.shadow.blur":60,"geometry.shadow.offsetX":30,"geometry.shadow.offsetY":40,"geometry.stroke.width":20});
	expect(decorated.visualRect).toEqual(plain.visualRect);
});
