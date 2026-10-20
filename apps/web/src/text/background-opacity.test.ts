import {expect,test} from 'bun:test';
import {createCanvas} from '@napi-rs/canvas';
import {drawMeasuredTextBackground,measureTextLayout} from './primitives';
import type {TextCanvasContext} from './layout';
test('background blends independently and restores parent alpha',()=>{
 for(const opacity of [undefined,0,0.5,1]) {
  const canvas=createCanvas(200,100),ctx=canvas.getContext('2d');
  ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,200,100);ctx.translate(100,50);ctx.globalAlpha=0.8;
  const layout=measureTextLayout({ctx:ctx as unknown as TextCanvasContext,canvasHeight:100,text:{content:'TEST',fontSize:15,fontFamily:'Arial',fontWeight:'normal',fontStyle:'normal',textAlign:'center',lineHeight:1.2}});
  drawMeasuredTextBackground({ctx:ctx as unknown as TextCanvasContext,layout,background:{enabled:true,color:'#000000',opacity,paddingX:10,paddingY:10,offsetX:0,offsetY:0,cornerRadius:0},backgroundColor:'#000000'});
  const value=ctx.getImageData(100,50,1,1).data[0];expect(Math.abs(value-255*(1-0.8*(opacity??1)))).toBeLessThanOrEqual(2);
  expect(ctx.globalAlpha).toBeCloseTo(0.8,2);
  ctx.fillStyle='#FF0000';ctx.fillRect(0,0,2,2);
  const pixel=ctx.getImageData(100,50,1,1).data;expect(pixel[0]).toBeGreaterThanOrEqual(203);expect(pixel[1]).toBeLessThanOrEqual(52);
 }
});


test('animated background alpha resolves during seek without reflowing text',async()=>{
 const {measureTextElement}=await import('./measure-element');
 const ctx=createCanvas(400,200).getContext('2d') as unknown as TextCanvasContext;
 const element={params:{content:'Readable text',fontFamily:'Arial',fontSize:10,opacity:1,'background.enabled':true,'background.color':'#000000','background.opacity':.62},animations:{'background.opacity':{keys:[{id:'a',time:0,value:0,segmentToNext:'linear'},{id:'b',time:120000,value:.6,segmentToNext:'linear'}]}}} as unknown as import('@/timeline').TextElement;
 const frames=[0,60000,120000,30000].map(localTime=>measureTextElement({element,canvasHeight:200,localTime,ctx}));
 for(const [i,alpha] of [0,.3,.6,.15].entries()){
  expect(frames[i].resolvedBackground.opacity).toBeCloseTo(alpha);
  expect(frames[i].block).toEqual(frames[0].block);
 }
 expect(element.params.opacity).toBe(1);
});
