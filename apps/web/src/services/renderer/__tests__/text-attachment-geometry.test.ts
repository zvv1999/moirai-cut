import {expect,test} from "bun:test";
import {textAttachmentCorrection} from "../text-attachment-geometry";
import {createCanvas} from "@napi-rs/canvas";
import {measureTextElement} from "@/text/measure-element";
import type {TextElement} from "@/timeline";
const identity={position:{x:0,y:0},scaleX:1,scaleY:1,rotate:0};
const referenceBox={left:-50,top:-10,width:100,height:20};
const measuredBox={left:-30,top:-10,width:60,height:20};
const base={measuredBox,referenceBox,anchor:[1,0.5] as const,parentBasis:identity,parentGroups:[],childGroups:[]};

test("measured short and long text retain the same icon gap across alignment and padding",()=>{
	const ctx=createCanvas(1,1).getContext("2d") as unknown as CanvasRenderingContext2D;
	for(const textAlign of ["left","center","right"])for(const content of ["重点","真正打动你的地方","Hi","A longer keyword"])for(const padding of [0,12]) {
		const {visualRect}=measureTextElement({ctx,canvasHeight:900,localTime:0,element:{params:{content,textAlign,fontFamily:"Arial",fontSize:8,fontWeight:"700","background.enabled":true,"background.paddingX":padding,"background.paddingY":4}} as unknown as TextElement});
		const delta=textAttachmentCorrection({...base,measuredBox:visualRect});
		const authoredChildLeft=referenceBox.left+referenceBox.width+9;
		const correctedChildLeft=authoredChildLeft+delta.x;
		expect(correctedChildLeft-(visualRect.left+visualRect.width)).toBeCloseTo(9,8);
		// Independent movement remains additive; no child motion is folded into measurement.
		expect(correctedChildLeft+7-(visualRect.left+visualRect.width)).toBeCloseTo(16,8);
	}
});

test("native anchor determines edge displacement without changing centered placement",()=>{
	for(const [anchor,x] of [[0,20],[0.5,0],[1,-20]]) {
		expect(textAttachmentCorrection({...base,anchor:[anchor,0.5]})).toEqual({x,y:0});
	}
	const taller={...measuredBox,top:-20,height:40};
	expect(textAttachmentCorrection({...base,measuredBox:taller,anchor:[0.5,0]})).toEqual({x:0,y:-10});
	expect(textAttachmentCorrection({...base,measuredBox:taller,anchor:[0.5,1]})).toEqual({x:0,y:10});
});

test("cross-group correction preserves rotation and nonuniform scale without adding translations",()=>{
	const parentBasis={position:{x:100,y:200},scaleX:2,scaleY:3,rotate:90};
	const parentGroup={position:{x:70,y:80},scaleX:1,scaleY:0.5,rotate:90};
	const childGroup={position:{x:900,y:700},scaleX:2,scaleY:4,rotate:90};
	const delta=textAttachmentCorrection({...base,parentBasis,parentGroups:[parentGroup],childGroups:[childGroup]});
	// -20 along text X -> -40 scene Y -> +20 scene X -> -5 child Y.
	expect(delta.x).toBeCloseTo(0,10);expect(delta.y).toBeCloseTo(-5,10);
	const same=textAttachmentCorrection({...base,parentBasis,parentGroups:[parentGroup],childGroups:[parentGroup]});
	expect(same.x).toBeCloseTo(0,10);expect(same.y).toBeCloseTo(-40,10);
});

test("nested common groups cancel, including reflection, regardless of translations",()=>{
	const groups=[{...identity,scaleX:-2,scaleY:3,rotate:35},{...identity,scaleX:0.4,scaleY:2,rotate:-70}];
	const delta=textAttachmentCorrection({...base,parentGroups:groups,childGroups:groups});
	expect(delta.x).toBeCloseTo(-20,10);expect(delta.y).toBeCloseTo(0,10);
});

test("singular or invalid geometry fails explicitly instead of emitting unusable positions",()=>{
	expect(()=>textAttachmentCorrection({...base,childGroups:[{...identity,scaleX:0}]})).toThrow("singular");
	expect(()=>textAttachmentCorrection({...base,anchor:[NaN,0]})).toThrow("anchor");
	expect(()=>textAttachmentCorrection({...base,measuredBox:{...measuredBox,width:-1}})).toThrow("box");
	expect(()=>textAttachmentCorrection({...base,parentBasis:{...identity,rotate:Infinity}})).toThrow("Nonfinite");
});
