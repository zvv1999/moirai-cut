import {expect,test} from "bun:test";
import {BaseNode} from "../nodes/base-node";
import {TextNode} from "../nodes/text-node";
import {GroupNode} from "../nodes/group-node";
import {basisVector,groupBasis,groupPoint,multiplyBasis,transformBasis} from "../attachment-basis";
import {applyTextAttachments,type TextAttachmentBinding} from "../text-attachments";
const transform={position:{x:0,y:0},scaleX:1,scaleY:1,rotate:0};
function node(id:string,width:number) {
	const n=new TextNode({} as TextNode["params"]);
	n.source={elementId:id,trackId:"track",groupPath:[],sceneTimeOffset:0};
	n.resolved={transform:structuredClone(transform),opacity:0.4,measuredText:{visualRect:{left:-width/2,top:-10,width,height:20}}} as TextNode["resolved"];
	return n;
}
function link(child:TextNode,parent:TextNode):TextAttachmentBinding {
	return {child:child.source!,parent:parent.source!,referenceBox:{left:-50,top:-10,width:100,height:20},anchor:[1,0.5]};
}
test("reverse-ordered chain applies inherited displacement exactly once and preserves independent state",()=>{
	const root=new BaseNode(),a=node("a",60),b=node("b",80),c=node("c",20);
	b.resolved!.transform.position.x=120;c.resolved!.transform.position.x=240;
	c.resolved!.transform.rotate=12;c.resolved!.transform.scaleX=2;
	root.add(c).add(b).add(a);
	applyTextAttachments(root,[link(c,b),link(b,a)]);
	expect(b.resolved!.transform.position.x).toBe(100);
	expect(c.resolved!.transform.position.x).toBe(210);
	expect(c.resolved!.opacity).toBe(0.4);
	expect(c.resolved!.transform.rotate).toBe(12);
	expect(c.resolved!.transform.scaleX).toBe(2);
	expect(a.resolved!.transform.position.x).toBe(0);
});
test("invalid later relation and cycles leave all resolved positions unchanged",()=>{
	for(const kind of ["missing","cycle"]) {
		const root=new BaseNode(),a=node("a",60),b=node("b",80),c=node("c",20);
		root.add(a).add(b).add(c);
		const bad=kind==="cycle"?link(a,b):{...link(c,a),parent:{...a.source!,elementId:"missing"}};
		expect(()=>applyTextAttachments(root,[link(b,a),bad])).toThrow();
		for(const n of [a,b,c])expect(n.resolved!.transform.position).toEqual({x:0,y:0});
	}
});
test("inactive children are skipped and duplicate exact instances fail explicitly",()=>{
	const root=new BaseNode(),a=node("a",60),b=node("b",80);
	root.add(a).add(b);b.resolved=null;
	applyTextAttachments(root,[link(b,a)]);
	expect(a.resolved!.transform.position.x).toBe(0);
	root.add(node("a",90));
	expect(()=>applyTextAttachments(root,[link(b,a)])).toThrow("Ambiguous");
});
test("same authored element in another scope cannot satisfy an exact parent reference",()=>{
	const root=new BaseNode(),a=node("a",60),b=node("b",80),other=node("a",200);
	other.source!.groupPath=["another-instance"];
	root.add(other).add(a).add(b);
	applyTextAttachments(root,[link(b,a)]);
	expect(b.resolved!.transform.position.x).toBe(-20);
});

test("native text-local reference is consumed without guessing a centered box for legacy text",()=>{
	const root=new BaseNode(),a=node("a",60),b=node("b",80);
	root.add(a).add(b);
	const binding={...link(b,a),referenceBox:undefined};
	expect(()=>applyTextAttachments(root,[binding])).toThrow("native text layout reference");
	expect(b.resolved!.transform.position.x).toBe(0);
	a.source!.textLayoutBox={left:-14,top:-10,width:100,height:20};
	applyTextAttachments(root,[binding]);
	expect(b.resolved!.transform.position.x).toBe(-56);
});

test("cross-group translation moves the compiled baseline as well as the measured edge",()=>{
	const root=new BaseNode(),a=node("a",60),b=node("b",80);
	const parentGroup=new GroupNode({} as GroupNode["params"]),childGroup=new GroupNode({} as GroupNode["params"]);
	parentGroup.resolved={transform:{...structuredClone(transform),position:{x:80,y:20}}} as GroupNode["resolved"];
	childGroup.resolved={transform:{...structuredClone(transform),position:{x:-30,y:10}}} as GroupNode["resolved"];
	a.source!.groupPath=["parent-group"];b.source!.groupPath=["child-group"];
	b.resolved!.transform.position={x:60,y:0};
	root.add(parentGroup.add(a)).add(childGroup.add(b));
	applyTextAttachments(root,[link(b,a)]);
	// Parent visible right=80+30. Child local x=150, scene x=150-30=120:
	// authored 10px anchor gap survives two independently translated containers.
	expect(b.resolved!.transform.position).toEqual({x:150,y:10});
	expect(b.resolved!.transform.position.x-30-(80+30)).toBe(10);
	expect(a.resolved!.transform.position).toEqual({x:0,y:0});
});

test("different rotated nonuniform groups preserve the full child axes including shear",()=>{
	const root=new BaseNode(),a=node("a",60),b=node("b",80);
	const parentGroup=new GroupNode({} as GroupNode["params"]),childGroup=new GroupNode({} as GroupNode["params"]);
	const p={position:{x:80,y:20},rotate:30,scaleX:1.3,scaleY:0.8};
	const c={position:{x:-30,y:10},rotate:-25,scaleX:0.9,scaleY:1.2};
	parentGroup.resolved={transform:p} as GroupNode["resolved"];
	childGroup.resolved={transform:c} as GroupNode["resolved"];
	a.source!.groupPath=["p"];b.source!.groupPath=["c"];
	b.resolved!.transform.position={x:60,y:0};
	root.add(parentGroup.add(a)).add(childGroup.add(b));
	applyTextAttachments(root,[link(b,a)]);
	const actual=b.resolved!.transform;
	const scenePosition=groupPoint(actual.position,[c]);
	const expectedPosition=groupPoint({x:40,y:0},[p]);
	expect(scenePosition.x).toBeCloseTo(expectedPosition.x,8);
	expect(scenePosition.y).toBeCloseTo(expectedPosition.y,8);
	const sceneBasis=multiplyBasis(groupBasis([c]),transformBasis(actual));
	for(const point of [{x:1,y:0},{x:0,y:1}]) {
		const result=basisVector(sceneBasis,point),expected=basisVector(groupBasis([p]),point);
		expect(result.x).toBeCloseTo(expected.x,8);expect(result.y).toBeCloseTo(expected.y,8);
	}
	const basis=actual.basis!;
	// Nonorthogonal local axes are necessary; decomposing into rotation/scale
	// alone would erase this dot product and change the icon's final shape.
	expect(Math.abs(basis[0]*basis[2]+basis[1]*basis[3])).toBeGreaterThan(0.1);
});

test("shared zero-scale group cancels before inversion",()=>{
	const root=new BaseNode(),a=node("a",60),b=node("b",80);
	const group=new GroupNode({} as GroupNode["params"]);
	group.resolved={transform:{...transform,scaleX:0,scaleY:0}} as GroupNode["resolved"];
	a.source!.groupPath=["group"];b.source!.groupPath=["group"];
	b.resolved!.transform.position.x=60;
	root.add(group.add(a).add(b));
	applyTextAttachments(root,[link(b,a)]);
	expect(b.resolved!.transform.position.x).toBe(40);
	expect(b.resolved!.transform.basis).toBeUndefined();
});

test("cross-group dependency chains inherit the corrected parent axes exactly once",()=>{
	const root=new BaseNode(),a=node("a",60),b=node("b",80),c=node("c",20);
	const ga=new GroupNode({} as GroupNode["params"]),gb=new GroupNode({} as GroupNode["params"]);
	ga.resolved={transform:{position:{x:80,y:20},rotate:30,scaleX:1.3,scaleY:0.8}} as GroupNode["resolved"];
	gb.resolved={transform:{position:{x:-30,y:10},rotate:-25,scaleX:0.9,scaleY:1.2}} as GroupNode["resolved"];
	a.source!.groupPath=["a-group"];b.source!.groupPath=["b-group"];
	b.resolved!.transform.position.x=120;c.resolved!.transform.position.x=240;c.resolved!.transform.scaleX=2;
	root.add(c).add(gb.add(b)).add(ga.add(a));
	applyTextAttachments(root,[link(c,b),link(b,a)]);
	const result=c.resolved!.transform;
	expect(result.position.x).toBeCloseTo(80+210*1.3*Math.cos(Math.PI/6),8);
	expect(result.position.y).toBeCloseTo(20+210*1.3*0.5,8);
	expect(result.basis![0]).toBeCloseTo(2*1.3*Math.cos(Math.PI/6),8);
	expect(result.basis![1]).toBeCloseTo(2*1.3*0.5,8);
	expect(c.resolved!.opacity).toBe(0.4);
});
