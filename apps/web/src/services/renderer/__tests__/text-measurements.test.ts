import {expect,test} from "bun:test";
import {createCanvas} from "@napi-rs/canvas";
import {measureTextElement} from "@/text/measure-element";
import {BaseNode} from "../nodes/base-node";
import {TextNode} from "../nodes/text-node";
import {GroupNode} from "../nodes/group-node";
import {collectFrameTextMeasurements,textMeasurementCorners} from "../text-measurements";

const transform={position:{x:10,y:20},scaleX:2,scaleY:3,rotate:90};
test("text corners project inner-to-outer around the shared canvas center",()=>{
	const node=text("Hi");
	const [measurement]=collectFrameTextMeasurements(node,100);
	measurement.textBox={left:0,top:0,width:10,height:5};
	measurement.groups=[{transform:{position:{x:5,y:7},scaleX:2,scaleY:1,rotate:90},childTimeOffset:0}];
	const corners=textMeasurementCorners(measurement,{width:200,height:100});
	// (0,0) -> text origin (10,20) -> group (-15,27) -> canvas (85,77).
	expect(corners[0].x).toBeCloseTo(85,8);expect(corners[0].y).toBeCloseTo(77,8);
	// (10,0) -> (10,40) -> (-35,27).
	expect(corners[1].x).toBeCloseTo(65,8);expect(corners[1].y).toBeCloseTo(77,8);
	// (10,5) -> (-5,40) -> (-35,-3).
	expect(corners[2].x).toBeCloseTo(65,8);expect(corners[2].y).toBeCloseTo(47,8);
});
function text(content:string) {
	const node=new TextNode({startTime:7,params:{content,fontFamily:"Arial",fontSize:8,fontWeight:"700",textAlign:"center","background.enabled":true,"background.paddingX":4,"background.paddingY":2}} as unknown as TextNode["params"]);
	node.source={elementId:"text",trackId:"track",groupPath:["outer","inner"],sceneTimeOffset:30};
	node.resolved={transform:structuredClone(transform),opacity:1,textColor:"white",backgroundColor:"black",effectPasses:[],canvasEffects:[],measuredText:measureTextElement({element:node.params,canvasHeight:900,localTime:0,ctx:createCanvas(1,1).getContext("2d") as unknown as CanvasRenderingContext2D})};
	return node;
}
function group(offset:number) {
	const node=new GroupNode({} as GroupNode["params"]);
	node.childTimeOffset=offset;
	node.resolved={transform:structuredClone(transform)} as GroupNode["resolved"];
	return node;
}

test("frame measurements retain actual padded text bounds, nested clocks and transform bases",()=>{
	const root=new BaseNode(),outer=group(20),inner=group(10),short=text("Hi"),long=text("A longer keyword");
	long.source={...long.source!,elementId:"long"};
	root.add(outer);outer.add(inner);inner.add(short).add(long);
	const measurements=collectFrameTextMeasurements(root,100);
	expect(measurements).toHaveLength(2);
	expect(measurements[0].sceneTime).toBe(100);
	expect(measurements[0].localTime).toBe(63);
	expect(measurements[0].groups.map(g=>g.childTimeOffset)).toEqual([20,10]);
	expect(measurements[0].textBox).toEqual(short.resolved!.measuredText.visualRect);
	expect(measurements[1].textBox.width).toBeGreaterThan(measurements[0].textBox.width);
	expect(measurements[0].transform).toEqual(transform);
	expect(measurements[0].groups[0].transform).toEqual(transform);
	short.resolved!.transform.position.x=999;
	short.resolved!.measuredText.visualRect.width=999;
	outer.resolved!.transform.position.x=999;
	short.source!.groupPath=[];
	expect(measurements[0].transform.position.x).toBe(10);
	expect(measurements[0].groups[0].transform.position.x).toBe(10);
	expect(measurements[0].textBox.width).not.toBe(999);
	expect(measurements[0].source.groupPath).toEqual(["outer","inner"]);
});

test("inactive groups hide resolved descendants; inactive and unowned text are excluded",()=>{
	const root=new BaseNode(),inactiveGroup=group(0),inside=text("stale"),inactive=text("inactive"),unowned=text("generated");
	inactiveGroup.resolved=null;inactive.resolved=null;unowned.source=undefined;
	inactiveGroup.add(inside);root.add(inactiveGroup).add(inactive).add(unowned);
	expect(collectFrameTextMeasurements(root,100)).toEqual([]);
});


test("measurement exposes actual fitted typography and explicit line overflow",()=>{
 const node=text("A considerably longer headline\nSecond line\nThird line");
 node.params.params["text.maxWidth"]=65;
 node.params.params["text.maxLines"]=1;
 node.resolved!.measuredText=measureTextElement({element:node.params,canvasHeight:900,localTime:0,ctx:createCanvas(1,1).getContext("2d") as unknown as CanvasRenderingContext2D});
 const [m]=collectFrameTextMeasurements(node,100);
 expect(m.layout.fontSizePx).toBe(node.resolved!.measuredText.scaledFontSize);
 expect(m.layout.fontSizePx).toBeLessThan(8);
 expect(m.layout.lineCount).toBe(3);
 expect(m.layout.overflow).toEqual({width:false,height:false,lines:true});
 expect(m.layout.fontIdentityVerified).toBe(false);
});
