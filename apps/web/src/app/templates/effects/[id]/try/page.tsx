import { EffectTrial } from "@/templates/effect-trial";
import {readTrialTransform} from "@/templates/trial-transform";
import {readTrialLayout} from "@/templates/trial-layout";
import {readTrialBackground} from "@/templates/trial-background";

export default async function EffectTrialPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
    const {id}=await params,raw=await searchParams;
    const query=new URLSearchParams();for(const [key,value] of Object.entries(raw))if(typeof value==='string')query.set(key,value);
    const get=(key:string)=>query.get(key)??undefined;
    const revision=get('revision'),captionWidth=get('captionWidth'),videoX=get('videoX'),videoY=get('videoY'),videoWidth=get('videoWidth'),videoHeight=get('videoHeight');
    return <EffectTrial initialBlurredBackground={readTrialBackground(query)} assetId={id} revision={Number(revision)} initialLayout={readTrialLayout(query)} initialVideoRegion={videoHeight===undefined?undefined:{x:Number(videoX??0),y:Number(videoY??0),width:Number(videoWidth??1),height:Number(videoHeight)}} initialCaptionWidth={captionWidth===undefined?undefined:Number(captionWidth)} initialTransform={readTrialTransform(query)} />;
}
