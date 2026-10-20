import {expect,test} from "bun:test";
import {trialLink,type ReviewRecord} from "./style-reviews";
import {readTrialLayout} from "./trial-layout";
import {readTrialTransform} from "./trial-transform";
import {trialTextValues} from "./trial-text-values";
import {readTrialBackground,writeTrialBackground} from "./trial-background";

type Application=ReviewRecord["submission"]["application"];
const baseline:Application={assetId:"caption",assetRevision:4,canvas:{width:1280,height:960,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{centerX:.5,centerY:.875,scale:.95},captionWidth:.94,videoRegion:{x:0,y:0,width:1,height:.75}};

test("the reviewed 4:3 caption application can be reused with its complete canvas and layout",()=>{
 const link=trialLink(baseline);expect(link).toBeDefined();
 const query=new URL(link!,"http://localhost").searchParams;
 const layout=readTrialLayout(query);
 expect(layout.canvas).toEqual(baseline.canvas);
 expect(layout.placement).toEqual(baseline.placement);
 expect(readTrialTransform(query)).toEqual(baseline.transform);
 expect(Number(query.get("captionWidth"))).toBe(.94);
 expect(["videoX","videoY","videoWidth","videoHeight"].map(k=>Number(query.get(k)))).toEqual([0,0,1,.75]);
 expect(query.has("applicationContext")).toBe(false);
});

test("partial region and independent transform survive with custom FPS, text values and explicit settings",()=>{
 const application:Application={...baseline,assetId:"words / 中文",canvas:{width:1000,height:800,fps:48},placement:{x:.1,y:.05,width:.8,height:.9},transform:{scale:.7,centerX:.4,centerY:.6,rotationDegrees:-90},inputs:{headline:"一行\nA & B + 100% / ? #"},textWidths:{headline:.64},minDisplaySeconds:.1,blurredBackground:false,intents:[]};
 const link=trialLink(application);expect(link).toBeDefined();const url=new URL(link!,"http://localhost"),q=url.searchParams;
 expect(url.pathname).toBe("/templates/effects/words%20%2F%20%E4%B8%AD%E6%96%87/try");
 expect(readTrialLayout(q).canvas).toEqual(application.canvas);
 expect(readTrialLayout(q).placement).toEqual(application.placement);
 expect(readTrialTransform(q)).toEqual(application.transform);
 expect(trialTextValues(JSON.parse(q.get("inputs")!))).toEqual(trialTextValues(application.inputs));
 expect(JSON.parse(q.get("textWidths")!)).toEqual(application.textWidths);
 expect(JSON.parse(q.get("intents")!)).toEqual([]);
 expect(q.get("minDisplaySeconds")).toBe("0.1");expect(q.get("blurredBackground")).toBe("false");
});

test("legacy omitted settings stay omitted and unsupported text values are not silently dropped",()=>{
 const app:Application={assetId:"plain",assetRevision:1,canvas:{width:720,height:720,fps:30},placement:{x:0,y:.5,width:1,height:.5}};
 const q=new URL(trialLink(app)!,"http://localhost").searchParams;
 expect(q.get("format")).toBe("square");expect(q.get("placement")).toBe("lower");
 for(const key of ["inputs","scale","rotationDegrees","minDisplaySeconds","intents","blurredBackground","canvasWidth"])expect(q.has(key)).toBe(false);
 expect(trialLink({...app,inputs:{headline:42}})).toBeUndefined();
});

test("explicit false keeps its native application identity through retry and history navigation",()=>{
 for(const blurredBackground of [undefined,false,true]){
  const application={...baseline,blurredBackground};
  const q=new URL(trialLink(application)!,"http://localhost").searchParams;
  const state=readTrialBackground(q);
  expect(state).toBe(blurredBackground);
  // EffectTrial carries the optional value directly in both request and snapshot.
  expect(JSON.parse(JSON.stringify({blurredBackground:state}))).toEqual(JSON.parse(JSON.stringify({blurredBackground})));
  const historyUrl=new URLSearchParams("blurredBackground=true");
  writeTrialBackground(historyUrl,state);
  expect(readTrialBackground(historyUrl)).toBe(blurredBackground);
  expect(historyUrl.has("blurredBackground")).toBe(blurredBackground!==undefined);
 }
});
