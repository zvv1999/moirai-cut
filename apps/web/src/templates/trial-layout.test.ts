import {expect,test} from "bun:test";
import {readTrialLayout,writeTrialLayout,trialLayoutFromNative,trialExtraPlacement,trialExtraLayoutFromNative} from "./trial-layout";

test("custom canvas FPS and primary region survive URL restore without changing independent transform",()=>{
 const canvas={width:1000,height:800,fps:48},placement={x:.1,y:.05,width:.8,height:.9};
 const query=new URLSearchParams({revision:"3",scale:".8",centerX:".4",centerY:".6",canvasWidth:"999"});
 writeTrialLayout(query,trialLayoutFromNative(canvas,placement));
 expect(readTrialLayout(query)).toEqual({canvas,placement,format:"custom",placementChoice:"custom"});
 expect(query.get("scale")).toBe(".8");expect(query.get("centerX")).toBe(".4");expect(query.get("centerY")).toBe(".6");
 expect(query.get("revision")).toBe("3");
});
test("native preset regions stay exact with extra transforms and strict null stays distinct from full",()=>{
 for(const placement of [{x:0,y:0,width:1,height:.5},{x:0,y:.5,width:1,height:.5},{x:.12,y:.08,width:.7,height:.6},null]){
  const state={...trialExtraLayoutFromNative(placement),transform:placement?{scale:.6,centerX:.4,centerY:.3}:undefined};
  expect(trialExtraPlacement(state)).toEqual(placement);
  expect(trialExtraPlacement(JSON.parse(JSON.stringify(state)))).toEqual(placement);
 }
 expect(trialExtraPlacement(trialExtraLayoutFromNative(undefined))).toBeNull();
 expect(trialExtraPlacement({placement:"full"})).toEqual({x:0,y:0,width:1,height:1});
});
test("preset changes clear stale custom coordinates while custom controls can retain preset values",()=>{
 const query=new URLSearchParams("format=custom&canvasWidth=999&canvasHeight=777&canvasFps=24&placement=custom&regionX=.2&regionY=.1&regionWidth=.4&regionHeight=.3");
 writeTrialLayout(query,trialLayoutFromNative({width:720,height:1280,fps:30},{x:0,y:.5,width:1,height:.5}));
 expect(query.toString()).toBe("format=portrait&placement=lower");
 const chosen=readTrialLayout(new URLSearchParams("format=custom&canvasWidth=720&canvasHeight=720&canvasFps=30&placement=custom&regionX=0&regionY=0&regionWidth=1&regionHeight=1"));
 expect(chosen.format).toBe("custom");expect(chosen.placementChoice).toBe("custom");
});
