import {afterEach, expect, test} from "bun:test";
import {rememberTrialApplication, trialHref} from "./trial-session";
const original = Object.getOwnPropertyDescriptor(globalThis,"sessionStorage");
afterEach(()=>{if(original)Object.defineProperty(globalThis,"sessionStorage",original);else Reflect.deleteProperty(globalThis,"sessionStorage");});
test("returning from a newer saved style keeps application settings but never restores the old revision or an arbitrary destination",()=>{
 const entries=new Map<string,string>();Object.defineProperty(globalThis,"sessionStorage",{configurable:true,value:{getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>entries.set(key,value)}});
 expect(rememberTrialApplication("style-a",new URLSearchParams({revision:"3",applicationContext:"trial-session-a",format:"portrait",scale:"1.2",intents:"[]",redirect:"https://example.com",styles:'[{"assetId":"b","assetRevision":4}]'}))).toBe(true);
 const url=new URL(trialHref("style-a",5),"http://localhost");expect(url.pathname).toBe("/templates/effects/style-a/try");expect(url.searchParams.get("revision")).toBe("5");expect(url.searchParams.get("scale")).toBe("1.2");expect(url.searchParams.get("applicationContext")).toBe("trial-session-a");expect(url.searchParams.get("intents")).toBe("[]");expect(url.searchParams.has("redirect")).toBe(false);expect(trialHref("style-b",2)).toBe("/templates/effects/style-b/try?revision=2");
});
test("unavailable browser storage still permits a fresh trial",()=>{
 Object.defineProperty(globalThis,"sessionStorage",{configurable:true,get(){throw new Error("unavailable");}});expect(rememberTrialApplication("a",new URLSearchParams())).toBe(false);expect(trialHref("a",2)).toBe("/templates/effects/a/try?revision=2");
});

test("custom canvas, region and strict extra survive navigation memory",()=>{
 const entries=new Map<string,string>();Object.defineProperty(globalThis,"sessionStorage",{configurable:true,value:{getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>entries.set(key,value)}});
 const values={minDisplaySeconds:"0.1",format:"custom",canvasWidth:"1000",canvasHeight:"800",canvasFps:"48",placement:"custom",regionX:".1",regionY:".05",regionWidth:".8",regionHeight:".9",scale:".8",centerX:".4",centerY:".6",rotationDegrees:"-90",inputs:JSON.stringify({headline:"自定义内容\n第二行"}),styles:'[{"assetId":"b","assetRevision":1,"instanceId":"strict","placement":"full","transform":{"scale":0.5,"centerX":0.7,"centerY":0.3,"rotationDegrees":90},"minDisplaySeconds":0.9,"attachments":[{"elementId":"strict--ring","relativeTo":"headline","placement":"overlay","gap":0,"offsetX":0,"offsetY":0,"referenceBounds":"text_box","followMotion":true,"sizeBinding":{"width":{"factor":1.45,"padding":0.02},"height":{"factor":1.3,"padding":0.01}}}]}]'};
 expect(rememberTrialApplication("a",new URLSearchParams(values))).toBe(true);
 const url=new URL(trialHref("a",2),"http://localhost");
 for(const [key,value] of Object.entries(values))expect(url.searchParams.get(key)).toBe(value);
});
