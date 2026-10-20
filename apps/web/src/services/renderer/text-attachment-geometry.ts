import type { Transform } from "@/rendering";
import type { FrameTextMeasurement } from "./text-measurements";
import {basisVector,inverseBasis,transformBasis} from "./attachment-basis";

type Point = {x:number;y:number};
type Box = FrameTextMeasurement["textBox"];

export function sceneDisplacementInGroups(delta:Point,groups:readonly Transform[]):Point {
	for(const group of groups)delta=vector(delta,group,true);
	return delta;
}

/** Translations are deliberately excluded: this maps a displacement, not a point. */
function vector(value:Point,transform:Transform,inverse=false):Point {
	if(transform.basis) return basisVector(inverse ? inverseBasis(transformBasis(transform)) : transformBasis(transform),value);
	const angle=transform.rotate*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
	if(![value.x,value.y,transform.scaleX,transform.scaleY,angle].every(Number.isFinite)) throw new Error("Nonfinite text attachment geometry");
	if(inverse) {
		if(Math.abs(transform.scaleX)<1e-9||Math.abs(transform.scaleY)<1e-9) throw new Error("Text attachment destination has a singular group transform");
		return {x:(value.x*c+value.y*s)/transform.scaleX,y:(-value.x*s+value.y*c)/transform.scaleY};
	}
	return {x:value.x*transform.scaleX*c-value.y*transform.scaleY*s,y:value.x*transform.scaleX*s+value.y*transform.scaleY*c};
}

/**
 * Rendering-only adapter for a native-selected anchor. Both boxes must be in the
 * parent's untransformed text coordinate system, in pixels. The caller selects
 * current or activation-time bases according to the native follow contract.
 * The returned displacement adds to the child's position; it must not be applied
 * to its scale/rotation or multiplied by its independent animation again.
 */
export function textAttachmentCorrection({measuredBox,referenceBox,anchor,parentBasis,parentGroups,childGroups}:{
	measuredBox:Box;referenceBox:Box;anchor:readonly [number,number];
	parentBasis:Transform;parentGroups:readonly Transform[];childGroups:readonly Transform[];
}):Point {
	for(const box of [measuredBox,referenceBox]) {
		if(![box.left,box.top,box.width,box.height].every(Number.isFinite)||box.width<0||box.height<0) throw new Error("Invalid text attachment reference box");
	}
	if(!anchor.every(v=>Number.isFinite(v)&&v>=0&&v<=1)) throw new Error("Invalid text attachment anchor");
	let delta=vector({
		x:measuredBox.left-referenceBox.left+(measuredBox.width-referenceBox.width)*anchor[0],
		y:measuredBox.top-referenceBox.top+(measuredBox.height-referenceBox.height)*anchor[1],
	},parentBasis);
	// Each isolated surface is centered on the same canvas. Go out to scene space,
	// then back into the child's container, retaining nonuniform axes and rotation.
	for(let i=parentGroups.length-1;i>=0;i--)delta=vector(delta,parentGroups[i]);
	delta=sceneDisplacementInGroups(delta,childGroups);
	if(!Number.isFinite(delta.x)||!Number.isFinite(delta.y)) throw new Error("Text attachment displacement overflow");
	return delta;
}
