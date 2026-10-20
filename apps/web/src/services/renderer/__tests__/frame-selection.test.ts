import {expect,test} from "bun:test";
import {BaseNode} from "../nodes/base-node";
import {GraphicNode} from "../nodes/graphic-node";
import {GroupNode} from "../nodes/group-node";
import {ImageNode} from "../nodes/image-node";
import {TextNode} from "../nodes/text-node";
import {collectFrameSelectionMeasurements} from "../frame-selection";
import {measuredBoxCorners} from "../text-measurements";

const transform={position:{x:10,y:20},scaleX:1,scaleY:1,rotate:0};
function graphic(id:string) {
	const node=new GraphicNode({definitionId:"rectangle"} as GraphicNode["params"]);
	node.source={elementId:id,trackId:"t",groupPath:[],sceneTimeOffset:0};
	node.resolved={transform:structuredClone(transform),opacity:1,localTime:5} as GraphicNode["resolved"];
	return node;
}
test("selection preserves compositor order, group clocks and corrected affine geometry",()=>{
	const root=new BaseNode(),first=graphic("first"),child=graphic("child");
	const group=new GroupNode({definitionId:"rectangle"} as GroupNode["params"]);
	group.resolved={transform:structuredClone(transform),opacity:1} as GroupNode["resolved"];
	group.childTimeOffset=20;
	child.resolved!.transform={position:{x:0,y:0},scaleX:1,scaleY:1,rotate:0,basis:[0.1,0.05,0.02,0.2]};
	root.add(first).add(group);group.add(child);
	const measures=collectFrameSelectionMeasurements(root,100,{width:200,height:100});
	expect(measures.map(m=>m.source.elementId)).toEqual(["first","child"]);
	expect(measures[1].groups[0].childTimeOffset).toBe(20);
	expect(measures[1].box).toEqual({left:-50,top:-50,width:100,height:100});
	const corners=measuredBoxCorners(measures[1],{width:200,height:100});
	expect(corners[0]).toEqual({x:104,y:57.5});
	child.resolved!.transform.position.x=999;
	expect(measures[1].transform.position.x).toBe(0);
});
test("containment retains media aspect ratio and hidden groups suppress descendants",()=>{
	const image=new ImageNode({} as ImageNode["params"]);
	image.source={elementId:"image",trackId:"t",groupPath:[],sceneTimeOffset:0};
	image.resolved={transform,opacity:1,localTime:0,sourceWidth:400,sourceHeight:100} as ImageNode["resolved"];
	const [measurement]=collectFrameSelectionMeasurements(image,0,{width:200,height:100});
	expect(measurement.box).toEqual({left:-100,top:-25,width:200,height:50});
	const group=new GroupNode({definitionId:"rectangle"} as GroupNode["params"]);
	group.add(image);
	expect(collectFrameSelectionMeasurements(group,0,{width:200,height:100})).toEqual([]);
	group.resolved={transform,opacity:0} as GroupNode["resolved"];
	expect(collectFrameSelectionMeasurements(group,0,{width:200,height:100})).toEqual([]);
});

test("transparent parent remains a movement reference without becoming selectable",()=>{
	const root=new BaseNode(),parent=new TextNode({startTime:0} as TextNode["params"]),child=graphic("child");
	parent.source={elementId:"parent",trackId:"t",groupPath:["transparent-group"],sceneTimeOffset:0};
	parent.resolved={transform:{...transform,scaleX:2,scaleY:3,rotate:90},opacity:0} as TextNode["resolved"];
	const group=new GroupNode({definitionId:"rectangle"} as GroupNode["params"]);
	group.resolved={transform:{...transform,scaleX:0.5,scaleY:2},opacity:0} as GroupNode["resolved"];
	group.add(parent);root.add(group).add(child);
	child.textAttachment={parent:parent.source,anchor:[1,0.5]};
	const measurements=collectFrameSelectionMeasurements(root,0,{width:200,height:100});
	expect(measurements.map(item=>item.source.elementId)).toEqual(["child"]);
	const basis=measurements[0].movementBasis!;
	for(const [index,value] of [0,4,-1.5,0].entries())expect(basis[index]).toBeCloseTo(value,10);
	parent.resolved!.transform.scaleX=5;
	expect(basis[1]).toBeCloseTo(4,10);
	group.resolved=null;
	expect(collectFrameSelectionMeasurements(root,0,{width:200,height:100})[0].movementBasis).toBeUndefined();
});
