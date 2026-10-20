import { DEFAULT_GRAPHIC_SOURCE_SIZE } from "@/graphics";
import type { AnyBaseNode } from "./nodes/base-node";
import { GroupNode } from "./nodes/group-node";
import { TextNode } from "./nodes/text-node";
import { GraphicNode } from "./nodes/graphic-node";
import { ImageNode } from "./nodes/image-node";
import { VideoNode } from "./nodes/video-node";
import { StickerNode } from "./nodes/sticker-node";
import type { FrameTextMeasurement } from "./text-measurements";
import { containedSourceSize } from "./visual-source-size";
import { groupBasis, multiplyBasis, transformBasis, type Basis } from "./attachment-basis";
import { collectTextAttachments } from "./text-attachments";

export type FrameSelectionMeasurement = Omit<FrameTextMeasurement,"textBox"|"layout"> & {
	kind: "text" | "visual";
	box: FrameTextMeasurement["textBox"];
	/** Pixel layout/relationship offset to scene pixels, not the leaf's own size. */
	movementBasis?: Basis;
};

/** Resolved leaf bounds in compositor order, after attachment correction. */
export function collectFrameSelectionMeasurements(root:AnyBaseNode,sceneTime:number,canvas:{width:number;height:number}):FrameSelectionMeasurement[] {
	const result:FrameSelectionMeasurement[]=[];
	const key=(source:Pick<FrameTextMeasurement["source"],"groupPath"|"trackId"|"elementId">)=>JSON.stringify([source.groupPath,source.trackId,source.elementId]);
	const parentPoses=new Map<string,{groups:FrameTextMeasurement["groups"];transform:FrameTextMeasurement["transform"]}>();
	function visit(node:AnyBaseNode,time:number,groups:FrameTextMeasurement["groups"],visible:boolean) {
		if(node instanceof GroupNode) {
			if(!node.resolved)return;
			const next=[...groups,{source:node.source,transform:node.resolved.transform,childTimeOffset:node.childTimeOffset}];
			node.children.forEach(child=>visit(child,time-node.childTimeOffset,next,visible&&node.resolved!.opacity>0));
			return;
		}
		// A transparent parent can still drive a visible independently opaque child.
		// Index its pose without making that parent selectable.
		if(node instanceof TextNode && node.source && node.resolved)parentPoses.set(key(node.source),{groups,transform:node.resolved.transform});
		if(visible && node instanceof TextNode && node.source && node.resolved && node.resolved.opacity > 0) {
			result.push(structuredClone({kind:"text",source:node.source,sceneTime,localTime:time-node.params.startTime,box:node.resolved.measuredText.visualRect,transform:node.resolved.transform,groups}));
		} else if(visible && (node instanceof GraphicNode || node instanceof ImageNode || node instanceof VideoNode || node instanceof StickerNode) && node.source && node.resolved && node.resolved.opacity > 0) {
			const source=node instanceof GraphicNode ? {width:DEFAULT_GRAPHIC_SOURCE_SIZE,height:DEFAULT_GRAPHIC_SOURCE_SIZE} : {width:node.resolved.sourceWidth,height:node.resolved.sourceHeight};
			if(source.width > 0 && source.height > 0) {
				const size=containedSourceSize(canvas,source);
				result.push(structuredClone({kind:"visual",source:node.source,sceneTime,localTime:node.resolved.localTime,box:{left:-size.width/2,top:-size.height/2,...size},transform:node.resolved.transform,groups}));
			}
		}
		node.children.forEach(child=>visit(child,time,groups,visible));
	}
	visit(root,sceneTime,[],true);
	const bindings=new Map(collectTextAttachments(root).map(binding=>[key(binding.child),binding]));
	for(const item of result) {
		const binding=bindings.get(key(item.source));
		if(binding) {
			const parent=parentPoses.get(key(binding.parent));
			if(parent)item.movementBasis=multiplyBasis(groupBasis(parent.groups.map(group=>group.transform)),transformBasis(parent.transform));
		} else if(!item.source.layoutAttachment) item.movementBasis=groupBasis(item.groups.map(group=>group.transform));
	}
	return result;
}
