import {expect,test} from "bun:test";
import {BaseNode} from "../nodes/base-node";
import {GraphicNode} from "../nodes/graphic-node";
import {TextNode} from "../nodes/text-node";
import {GroupNode} from "../nodes/group-node";
import {applyTextAttachments,type TextAttachmentBinding} from "../text-attachments";
import {basisVector,groupBasis,groupPoint,multiplyBasis,transformBasis} from "../attachment-basis";
import {collectFrameSelectionMeasurements} from "../frame-selection";
import {measuredBoxCorners} from "../text-measurements";
const pose={position:{x:0,y:0},scaleX:1,scaleY:1,rotate:0};
function fixture() {
 const parent=new TextNode({startTime:0} as TextNode["params"]);
 parent.source={elementId:"secondary",trackId:"text",groupPath:[],sceneTimeOffset:0,textLayoutBox:{left:-100,top:-25,width:200,height:50}};
 parent.resolved={transform:structuredClone(pose),opacity:1,measuredText:{visualRect:{left:-60,top:-15,width:120,height:30}}} as TextNode["resolved"];
 const child=new GraphicNode({definitionId:"ellipse"} as GraphicNode["params"]);
 child.source={elementId:"ring",trackId:"graphic",groupPath:[],sceneTimeOffset:0};
 child.resolved={transform:{...structuredClone(pose),scaleX:0.5,scaleY:0.2},opacity:0.7,localTime:0} as GraphicNode["resolved"];
 const binding:TextAttachmentBinding={child:child.source,parent:parent.source,anchor:[0.5,0.5],sizeBinding:{width:{factor:1.2,paddingPx:8},height:{factor:1,paddingPx:6},baselineSizePx:[50,20],sourceSizePx:100,childAnchor:[0.5,0.5]}};
 child.textAttachment={parent:binding.parent,anchor:binding.anchor,sizeBinding:binding.sizeBinding};
 return {root:new BaseNode().add(parent).add(child),parent,child,binding};
}
test("measured size includes each padding exactly once, preserves animation and updates selection bounds",()=>{
 const {root,parent,child,binding}=fixture();
 // Parent visualRect already includes its background. No additional parent padding here.
 child.resolved!.transform.scaleX*=1.5;
 child.resolved!.transform.scaleY*=0.5;
 child.resolved!.transform.rotate=25;
 applyTextAttachments(root,[binding]);
 const basis=transformBasis(child.resolved!.transform);
 expect(Math.hypot(basis[0],basis[1])*100).toBeCloseTo((120*1.2+16)*1.5,8);
 expect(Math.hypot(basis[2],basis[3])*100).toBeCloseTo((30+12)*0.5,8);
 expect(child.resolved!.opacity).toBe(0.7);
 expect(parent.resolved!.transform.basis).toBeUndefined();
 const measurement=collectFrameSelectionMeasurements(root,0,{width:100,height:100}).find(m=>m.source.elementId==="ring")!;
 const corners=measuredBoxCorners(measurement,{width:100,height:100});
 expect(Math.hypot(corners[1].x-corners[0].x,corners[1].y-corners[0].y)).toBeCloseTo(240,8);
 expect(Math.hypot(corners[3].x-corners[0].x,corners[3].y-corners[0].y)).toBeCloseTo(21,8);
});
test("one-axis size binding leaves independent thickness unchanged",()=>{
 const {root,child,binding}=fixture();
 delete binding.sizeBinding!.height;
 applyTextAttachments(root,[binding]);
 const basis=transformBasis(child.resolved!.transform);
 expect(basis).toEqual([1.6,0,0,0.2]);
});
test("edge placement retains the gap after resizing and independent child rotation/scale",()=>{
 for(const angle of [0,35,90]) {
  const {root,parent,child,binding}=fixture();
  parent.resolved!.transform={...structuredClone(pose),rotate:30,scaleX:1.3,scaleY:0.8};
  const parentBasis=transformBasis(parent.resolved!.transform);
  // Native right placement is reference edge 100 + gap 12 + authored half-width 25.
  child.resolved!.transform.position=basisVector(parentBasis,{x:137,y:0});
  child.resolved!.transform.rotate=30+angle;
  child.resolved!.transform.scaleX=0.5*1.3*1.4;
  child.resolved!.transform.scaleY=0.2*0.8*0.75;
  binding.anchor=[1,0.5];binding.sizeBinding!.childAnchor=[0,0.5];
  applyTextAttachments(root,[binding]);
  const state=child.resolved!.transform;
  const edge=basisVector(transformBasis(state),{x:-50,y:0});
  const expected=basisVector(parentBasis,{x:60+12,y:0});
  expect(state.position.x+edge.x).toBeCloseTo(expected.x,8);
  expect(state.position.y+edge.y).toBeCloseTo(expected.y,8);
 }
});
test("different rotated groups project resized geometry without losing shear; shared zero groups cancel",()=>{
 for(const shared of [false,true]) {
  const {root,parent,child,binding}=fixture();root.children=[];
  const pg=new GroupNode({} as GroupNode["params"]),cg=shared?pg:new GroupNode({} as GroupNode["params"]);
  pg.resolved={transform:{position:{x:30,y:-20},rotate:25,scaleX:shared?0:1.5,scaleY:shared?0:0.7},opacity:1} as GroupNode["resolved"];
  if(!shared)cg.resolved={transform:{position:{x:-10,y:8},rotate:-15,scaleX:0.9,scaleY:1.4},opacity:1} as GroupNode["resolved"];
  parent.source!.groupPath=["pg"];child.source!.groupPath=[shared?"pg":"cg"];
  root.add(pg.add(parent));cg.add(child);if(!shared)root.add(cg);
  applyTextAttachments(root,[binding]);
  const current=child.resolved!.transform;
  if(shared)current.basis!.forEach((value,i)=>expect(value).toBeCloseTo([1.6,0,0,0.42][i],8));
  else {
   const actual=multiplyBasis(groupBasis([cg.resolved!.transform]),transformBasis(current));
   const expected=multiplyBasis(groupBasis([pg.resolved!.transform]),[1.6,0,0,0.42]);
   actual.forEach((value,i)=>expect(value).toBeCloseTo(expected[i],8));
   const actualCenter=groupPoint(current.position,[cg.resolved!.transform]);
   expect(actualCenter.x).toBeCloseTo(30,8);expect(actualCenter.y).toBeCloseTo(-20,8);
  }
 }
});
test("size binding preserves zero-scale entrance and rejects unsupported or malformed binding atomically",()=>{
 const zero=fixture();zero.child.resolved!.transform.scaleX=0;zero.child.resolved!.transform.scaleY=0;
 applyTextAttachments(zero.root,[zero.binding]);expect(zero.child.resolved!.transform.basis).toEqual([0,0,0,0]);
 for(const invalid of ["no-axis","negative-padding","bad-baseline","text-child"]) {
  const {root,parent,child,binding}=fixture();
  if(invalid==="no-axis"){delete binding.sizeBinding!.width;delete binding.sizeBinding!.height;}
  if(invalid==="negative-padding")binding.sizeBinding!.width!.paddingPx=-1;
  if(invalid==="bad-baseline")binding.sizeBinding!.baselineSizePx=[0,20];
  if(invalid==="text-child")binding.child=parent.source!;
  const original=structuredClone(child.resolved!.transform);
  expect(()=>applyTextAttachments(root,[binding])).toThrow();expect(child.resolved!.transform).toEqual(original);
 }
});

test("measured rectangle width and height redraw design corners while independent scale remains deformation",()=>{
 const {root,child,binding}=fixture();
 child.params.definitionId="rectangle";
 child.params.params={cornerRadius:50,rectangleAspectRatio:2.5};
 child.resolved!.resolvedParams={...child.params.params};
 child.resolved!.transform.scaleX*=1.5;
 child.resolved!.transform.scaleY*=0.5;
 applyTextAttachments(root,[binding]);
 expect(child.resolved!.resolvedParams.rectangleAspectRatio).toBeCloseTo(160/42,10);
 expect(child.params.params.rectangleAspectRatio).toBe(2.5);
 const basis=transformBasis(child.resolved!.transform);
 expect(Math.hypot(basis[0],basis[1])*100).toBeCloseTo(240,8);
 expect(Math.hypot(basis[2],basis[3])*100).toBeCloseTo(21,8);
 expect(child.resolved!.resolvedParams.cornerRadius).toBe(50);
});

test("rectangle corner adjustment is transactional with all attachment validation",()=>{
 const {root,parent,child,binding}=fixture();
 child.params.definitionId="rectangle";
 child.resolved!.resolvedParams={cornerRadius:20,rectangleAspectRatio:2.5};
 const second=new GraphicNode({definitionId:"rectangle"} as GraphicNode["params"]);
 second.source={...child.source!,elementId:"bad"};
 second.resolved=structuredClone(child.resolved);
 root.add(second);
 const bad:TextAttachmentBinding={...binding,child:second.source,parent:parent.source!,sizeBinding:{...binding.sizeBinding!,baselineSizePx:[0,20]}};
 const before=structuredClone(child.resolved);
 expect(()=>applyTextAttachments(root,[binding,bad])).toThrow("Invalid text size binding");
 expect(child.resolved).toEqual(before);
});
