import type { Transform } from "@/rendering";
import type { AnyBaseNode, RenderNodeSource } from "./nodes/base-node";
import { GroupNode } from "./nodes/group-node";
import { TextNode } from "./nodes/text-node";
import {basisVector,transformBasis} from "./attachment-basis";

export type TextLayoutMeasurement = {
 fontSizePx: number; fontString: string; lines: string[]; lineCount: number;
 widthPx: number; heightPx: number;
 limits: {maxWidthPx:number;maxHeightPx:number;maxLines:number};
 overflow: {width:boolean;height:boolean;lines:boolean};
 /** Canvas font declarations do not identify the actual fallback font used. */
 fontIdentityVerified: false;
 secondary?: {fontSizePx:number;fontString:string;lines:string[];lineCount:number;widthPx:number;heightPx:number};
};
export type FrameTextMeasurement = {
 layout: TextLayoutMeasurement;
	source: RenderNodeSource;
	sceneTime: number;
	localTime: number;
	/** Untransformed text + enabled background, excluding stroke and shadow. */
	textBox: {left:number;top:number;width:number;height:number};
	transform: Transform;
	/** Outer-to-inner isolated surfaces; not a world-space bounding box. */
	groups: {source?:RenderNodeSource; transform:Transform; childTimeOffset:number}[];
};

/** Project the local text box through the same centered surfaces as the compositor. */
export function textMeasurementCorners(measurement:FrameTextMeasurement,canvas:{width:number;height:number}) {
	return measuredBoxCorners({...measurement,box:measurement.textBox},canvas);
}

export function measuredBoxCorners(measurement:{box:FrameTextMeasurement["textBox"];transform:Transform;groups:FrameTextMeasurement["groups"]},canvas:{width:number;height:number}) {
	const {left,top,width,height}=measurement.box;
	const apply=(point:{x:number;y:number},transform:Transform)=>{
		const vector=basisVector(transformBasis(transform),point);
		return {x:transform.position.x+vector.x,y:transform.position.y+vector.y};
	};
	return [[left,top],[left+width,top],[left+width,top+height],[left,top+height]].map(([x,y])=>{
		let point=apply({x,y},measurement.transform);
		for(let i=measurement.groups.length-1;i>=0;i--)point=apply(point,measurement.groups[i].transform);
		return {x:point.x+canvas.width/2,y:point.y+canvas.height/2};
	});
}

/** Read only after resolution. Copy values so a later frame cannot mutate this one. */
export function collectFrameTextMeasurements(root:AnyBaseNode,sceneTime:number):FrameTextMeasurement[] {
	const measurements:FrameTextMeasurement[]=[];
	function visit(node:AnyBaseNode,time:number,groups:FrameTextMeasurement["groups"]) {
		if(node instanceof GroupNode) {
			if(!node.resolved) return;
			const next=[...groups,{source:node.source,transform:node.resolved.transform,childTimeOffset:node.childTimeOffset}];
			node.children.forEach(child=>visit(child,time-node.childTimeOffset,next));
			return;
		}
		if(node instanceof TextNode && node.source && node.resolved) {
			const measured=node.resolved.measuredText;
            const limit=(name:string)=>{const v=node.params.params[name];return typeof v==="number"&&Number.isFinite(v)&&v>0?v:0;};
            const limits={maxWidthPx:limit("text.maxWidth"),maxHeightPx:limit("text.maxHeight"),maxLines:limit("text.maxLines")};
            const layout:TextLayoutMeasurement={fontSizePx:measured.scaledFontSize,fontString:measured.fontString,lines:measured.lines,lineCount:measured.lines.length,widthPx:measured.block.maxWidth,heightPx:measured.block.height,limits,overflow:{width:limits.maxWidthPx>0&&measured.block.maxWidth>limits.maxWidthPx+0.01,height:limits.maxHeightPx>0&&measured.block.height>limits.maxHeightPx+0.01,lines:limits.maxLines>0&&measured.lines.length>limits.maxLines},fontIdentityVerified:false};
            if(measured.bilingual){const secondary=measured.bilingual.secondary;layout.secondary={fontSizePx:secondary.scaledFontSize,fontString:secondary.fontString,lines:secondary.lines,lineCount:secondary.lines.length,widthPx:secondary.block.maxWidth,heightPx:secondary.block.height};}
            measurements.push(structuredClone({layout,source:node.source,sceneTime,localTime:time-node.params.startTime,textBox:node.resolved.measuredText.visualRect,transform:node.resolved.transform,groups}));
		}
		node.children.forEach(child=>visit(child,time,groups));
	}
	visit(root,sceneTime,[]);
	return measurements;
}
