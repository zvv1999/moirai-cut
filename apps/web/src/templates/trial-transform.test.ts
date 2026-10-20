import {expect,test} from "bun:test";
import {readTrialTransform,writeTrialTransform} from "./trial-transform";
import {trialLink} from "./style-reviews";

test("rotation URL transport roundtrips exact transform, defaults and omission",()=>{
 const legacy=new URLSearchParams("scale=.6&centerX=.4&centerY=.7");
 expect(readTrialTransform(legacy)).toEqual({scale:.6,centerX:.4,centerY:.7});
 const query=new URLSearchParams("unrelated=keep");
 const transform={scale:.6,centerX:.3,centerY:.7,rotationDegrees:-90};
 writeTrialTransform(query,transform);expect(readTrialTransform(query)).toEqual(transform);
 writeTrialTransform(query,{scale:1,centerX:.5,centerY:.5});expect(query.has("rotationDegrees")).toBe(false);
 writeTrialTransform(query);expect(readTrialTransform(query)).toBeUndefined();expect(query.toString()).toBe("unrelated=keep");
 expect(readTrialTransform(new URLSearchParams("rotationDegrees=90"))).toEqual({scale:1,centerX:.5,centerY:.75,rotationDegrees:90});
});

test("review retry link carries rotation through shared UI transport",()=>{
 const transform={scale:.65,centerX:.5,centerY:.4,rotationDegrees:90};
 const link=trialLink({assetId:"arrow",assetRevision:3,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform});
 expect(link).toBeDefined();
 expect(readTrialTransform(new URL(link!,"http://localhost").searchParams)).toEqual(transform);
});
