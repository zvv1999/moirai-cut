import {expect,test} from "bun:test";
import {createCanvas,Path2D} from "@napi-rs/canvas";
import {starGraphicDefinition} from "../definitions/star";
function draw(params:Record<string,any>={}){
 const canvas=createCanvas(120,120),ctx=canvas.getContext('2d'),old=globalThis.Path2D;globalThis.Path2D=Path2D as any;
 try{starGraphicDefinition.render({ctx:ctx as any,params:{fill:'#fff6a7',stroke:'#493269',strokeWidth:0,...params},width:120,height:120});}finally{globalThis.Path2D=old;}
 return ctx.getImageData(0,0,120,120).data;
}
const alpha=(p:Uint8ClampedArray,x:number,y:number)=>p[(y*120+x)*4+3];
test("native compiled four-point params form sharp tips and empty diagonal corners",()=>{
 const params=JSON.parse(JSON.stringify({points:4,depth:18})),p=draw(params);
 for(const[x,y]of [[60,10],[110,60],[60,110],[10,60],[60,60]])expect(alpha(p,x,y)).toBeGreaterThan(100);
 for(const[x,y]of [[20,20],[100,20],[20,100],[100,100]])expect(alpha(p,x,y)).toBe(0);
 expect(p).toEqual(draw(params));expect(p).not.toEqual(draw({points:4,depth:70}));
});
test("default native star stays five-point 45 and outlined stars have transparent center",()=>{
 expect(draw()).toEqual(draw({points:5,depth:45}));
 const outline=draw({points:4,depth:20,fill:'#00000000',strokeWidth:4});expect(alpha(outline,60,60)).toBe(0);
 expect(outline.some((v,i)=>i%4===3&&v>0)).toBe(true);
});

test("centered outlines keep every painted pixel inside the actual 512px source",()=>{
 const old=globalThis.Path2D;globalThis.Path2D=Path2D as any;
 try{
  // Render onto a larger canvas so clipping cannot conceal an overflowing tip.
  for(const points of [3,4,5,12])for(const depth of [1,18,45,99])for(const strokeWidth of [1,7,8,30,64]){
   const canvas=createCanvas(768,768),ctx=canvas.getContext('2d');ctx.translate(128,128);
   ctx.lineJoin='miter';ctx.lineWidth=3;
   starGraphicDefinition.render({ctx:ctx as any,params:{points,depth,strokeWidth,strokeAlign:'center',fill:'#00000000',stroke:'#ffffff'},width:512,height:512});
   const pixels=ctx.getImageData(0,0,768,768).data;let outside=0,painted=0;
   for(let y=0;y<768;y++)for(let x=0;x<768;x++)if(pixels[(y*768+x)*4+3]>0){painted++;if(x<128||x>=640||y<128||y>=640)outside++;}
   expect(outside,`points=${points}, depth=${depth}, stroke=${strokeWidth}`).toBe(0);
   expect(painted).toBeGreaterThan(0);
   expect(ctx.lineJoin).toBe('miter');expect(ctx.lineWidth).toBe(3);
  }
 }finally{globalThis.Path2D=old;}
});

test("inside and outside alignment keep ink on their respective side of the star edge",()=>{
 const old=globalThis.OffscreenCanvas;
 globalThis.OffscreenCanvas=function(width:number,height:number){return createCanvas(width,height);} as any;
 try{
  const params={points:4,depth:50,fill:'#00000000',stroke:'#ffffff',strokeWidth:4};
  const inside=draw({...params,strokeAlign:'inside'}),outside=draw({...params,strokeAlign:'outside'});
  expect(alpha(inside,60,6)).toBe(255);expect(alpha(outside,60,6)).toBe(0);
  expect(alpha(inside,54,5)).toBe(0);expect(alpha(outside,54,5)).toBe(255);
  expect(alpha(inside,60,60)).toBe(0);expect(alpha(outside,60,60)).toBe(0);
  expect(draw({strokeAlign:'inside'})).toEqual(draw({strokeAlign:'center'}));
  expect(draw({strokeAlign:'outside'})).toEqual(draw({strokeAlign:'center'}));
 }finally{globalThis.OffscreenCanvas=old;}
});
