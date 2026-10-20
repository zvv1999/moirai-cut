import type {Transform} from "@/rendering";
import type {AnyBaseNode,RenderNodeSource} from "./nodes/base-node";
import {GroupNode} from "./nodes/group-node";
import {TextNode} from "./nodes/text-node";
import {GraphicNode} from "./nodes/graphic-node";
import type {TimelineTextAttachment} from "@/timeline/types";
import type {ParamValues} from "@/params";
import {textAttachmentCorrection} from "./text-attachment-geometry";
import {type Basis,basisVector,groupBasis,groupPoint,identityBasis,inverseBasis,multiplyBasis,transformBasis} from "./attachment-basis";

type Identity=Pick<RenderNodeSource,"elementId"|"trackId"|"groupPath">;
/** Internal current-pose binding; native compilation must pair exact instances. */
export type TextAttachmentBinding={
	child:Identity;parent:Identity;
	referenceBox?:{left:number;top:number;width:number;height:number};
	anchor:readonly [number,number];
	sizeBinding?:TimelineTextAttachment["sizeBinding"];
};
const key=(source:Identity)=>JSON.stringify([source.groupPath,source.trackId,source.elementId]);

export function collectTextAttachments(root:AnyBaseNode):TextAttachmentBinding[] {
	const bindings:TextAttachmentBinding[]=[];
	function visit(node:AnyBaseNode) {
		if(node.textAttachment) {
			if(!node.source)throw new Error("Text attachment has no authored child identity");
			bindings.push({child:node.source,...node.textAttachment});
		}
		node.children.forEach(visit);
	}
	visit(root);
	return bindings;
}

/** Run once after independent frame resolution. Validate/compute all, then commit. */
export function applyTextAttachments(root:AnyBaseNode,bindings:readonly TextAttachmentBinding[]) {
	if(!bindings.length)return;
	type Entry={node:AnyBaseNode;groups:Transform[];active:boolean};
	const nodes=new Map<string,Entry>();
	function visit(node:AnyBaseNode,groups:Transform[],active:boolean) {
		if(node.source) {
			const id=key(node.source);
			if(nodes.has(id))throw new Error("Ambiguous render instance for text attachment");
			nodes.set(id,{node,groups,active});
		}
		if(node instanceof GroupNode) {
			active=active&&!!node.resolved;
			if(node.resolved)groups=[...groups,node.resolved.transform];
		}
		node.children.forEach(child=>visit(child,groups,active));
	}
	visit(root,[],true);
	const links=new Map<string,TextAttachmentBinding>();
	for(const binding of bindings) {
		const id=key(binding.child);
		if(links.has(id))throw new Error("Multiple text attachments for one child");
		links.set(id,binding);
	}
	const pending=new Map<string,{state:{transform:Transform};transform:Transform;linearCorrection:Basis;rectangleGeometry?:{state:{resolvedParams:ParamValues};aspectRatio:number}}>();
	const visiting=new Set<string>(),done=new Set<string>();
	function resolve(id:string) {
		if(done.has(id))return;
		if(visiting.has(id))throw new Error("Cyclic text attachment");
		visiting.add(id);
		const binding=links.get(id)!;
		const child=nodes.get(id);
		if(!child)throw new Error("Missing text attachment child instance");
		if(!child.active||!child.node.resolved){visiting.delete(id);done.add(id);return;}
		const parentId=key(binding.parent),parent=nodes.get(parentId);
		if(!parent?.active||!(parent.node instanceof TextNode)||!parent.node.resolved)throw new Error("Text attachment requires an active text parent instance");
		if(child.node instanceof GroupNode||typeof child.node.resolved!=="object"||!("transform" in child.node.resolved))throw new Error("Text attachment child must be an individual visual layer");
		if(links.has(parentId))resolve(parentId);
		const referenceBox=binding.referenceBox??parent.node.source?.textLayoutBox;
		if(!referenceBox)throw new Error("Text attachment requires a native text layout reference");
		const state=child.node.resolved as {transform:Transform};
		const originalParent=parent.node.resolved.transform;
		const inherited=pending.get(parentId);
		const parentTransform=inherited?.transform??originalParent;
		const inheritedBasis=inherited?.linearCorrection??identityBasis();
		const delta=textAttachmentCorrection({measuredBox:parent.node.resolved.measuredText.visualRect,referenceBox,anchor:binding.anchor,parentBasis:parentTransform,parentGroups:[],childGroups:[]});
		const offset=basisVector(inheritedBasis,{x:state.transform.position.x-originalParent.position.x,y:state.transform.position.y-originalParent.position.y});
		const point={x:parentTransform.position.x+offset.x+delta.x,y:parentTransform.position.y+offset.y+delta.y};
		let childBasis=transformBasis(state.transform);
		let rectangleGeometry:{state:{resolvedParams:ParamValues};aspectRatio:number}|undefined;
		if(binding.sizeBinding) {
			if(!(child.node instanceof GraphicNode)||!["rectangle","ellipse"].includes(child.node.params.definitionId))throw new Error("Text size binding requires a supported native graphic child");
			const size=binding.sizeBinding,box=parent.node.resolved.measuredText.visualRect;
			if(!size.width&&!size.height)throw new Error("Text size binding requires at least one axis");
			if(![...size.baselineSizePx,size.sourceSizePx].every(v=>Number.isFinite(v)&&v>0)||!size.childAnchor.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw new Error("Invalid text size binding geometry");
			const ratios=[1,1];
			for(const [index,axis,measured] of [[0,size.width,box.width],[1,size.height,box.height]] as const) {
				if(!axis)continue;
				if(!Number.isFinite(axis.factor)||axis.factor<=0||axis.factor>20||!Number.isFinite(axis.paddingPx)||axis.paddingPx<0)throw new Error("Invalid text size binding axis");
				ratios[index]=(measured*axis.factor+2*axis.paddingPx)/size.baselineSizePx[index];
			}
			childBasis=multiplyBasis(childBasis,[ratios[0],0,0,ratios[1]]);
			// A measured size changes the design box, unlike independent scale
			// animation. Redraw its corners for the new aspect before deformation.
			const graphicState=child.node.resolved;
			const aspect=graphicState.resolvedParams?.rectangleAspectRatio;
			if(child.node.params.definitionId==="rectangle"&&aspect!==undefined) {
				if(typeof aspect!=="number"||!Number.isFinite(aspect)||aspect<=0)throw new Error("Invalid rectangle design aspect ratio");
				const resizedAspect=aspect*ratios[0]/ratios[1];
				if(!Number.isFinite(resizedAspect)||resizedAspect<=0)throw new Error("Invalid resized rectangle design aspect ratio");
				rectangleGeometry={state:graphicState,aspectRatio:resizedAspect};
			}
			// Native placement subtracts the authored child half-extent along the
			// parent's axes. Replace it with the resized/animated child anchor so
			// independent rotation and scaling cannot move the authored edge gap.
			const anchor={x:size.childAnchor[0]-0.5,y:size.childAnchor[1]-0.5};
			const authored=basisVector(transformBasis(parentTransform),{x:anchor.x*size.baselineSizePx[0],y:anchor.y*size.baselineSizePx[1]});
			const resized=basisVector(multiplyBasis(inheritedBasis,childBasis),{x:anchor.x*size.sourceSizePx,y:anchor.y*size.sourceSizePx});
			point.x+=authored.x-resized.x;point.y+=authored.y-resized.y;
		}
		// Shared outer surfaces cancel before inversion. In particular a shared
		// zero-scale entrance must not require inverting an invisible surface.
		let common=0;
		while(common<parent.groups.length&&common<child.groups.length&&parent.groups[common]===child.groups[common])common++;
		const parentGroups=parent.groups.slice(common),childGroups=child.groups.slice(common);
		const position=groupPoint(groupPoint(point,parentGroups),childGroups,true);
		const linearCorrection=multiplyBasis(multiplyBasis(inverseBasis(groupBasis(childGroups)),groupBasis(parentGroups)),inheritedBasis);
		const basis=multiplyBasis(linearCorrection,childBasis);
		const unchanged=!binding.sizeBinding&&linearCorrection.every((v,i)=>Math.abs(v-identityBasis()[i])<1e-12);
		if(!Number.isFinite(position.x)||!Number.isFinite(position.y))throw new Error("Nonfinite text attachment result");
		pending.set(id,{state,transform:{...state.transform,position,...(!unchanged?{basis}:{})},linearCorrection,rectangleGeometry});
		visiting.delete(id);done.add(id);
	}
	for(const id of links.keys())resolve(id);
	for(const result of pending.values()) {
		result.state.transform=result.transform;
		if(result.rectangleGeometry) {
			const geometry=result.rectangleGeometry;
			geometry.state.resolvedParams={...geometry.state.resolvedParams,rectangleAspectRatio:geometry.aspectRatio};
		}
	}
}
