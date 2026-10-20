/** UI state/URL adapters only. Rust owns placement, adaptation and validation. */
export type TrialCanvas = {width:number;height:number;fps:number};
export type TrialRegion = {x:number;y:number;width:number;height:number};
export const trialCanvases = {
	landscape:{width:1280,height:720,fps:30},
	portrait:{width:720,height:1280,fps:30},
	square:{width:720,height:720,fps:30},
};
export const trialPlacements = {
	full:{x:0,y:0,width:1,height:1},
	lower:{x:0,y:.5,width:1,height:.5},
	upper:{x:0,y:0,width:1,height:.5},
};
export type TrialFormat = keyof typeof trialCanvases | "custom";
export type TrialPlacementChoice = keyof typeof trialPlacements | "custom";
export type TrialLayout = {format:TrialFormat;canvas:TrialCanvas;placementChoice:TrialPlacementChoice;placement:TrialRegion};
export type TrialExtraLayout = {placement:TrialPlacementChoice | "original";region?:TrialRegion};
export const trialLayoutFields = ["format","canvasWidth","canvasHeight","canvasFps","placement","regionX","regionY","regionWidth","regionHeight"];

export function trialLayoutFromNative(canvas:TrialCanvas,placement:TrialRegion):TrialLayout {
	const format=(Object.keys(trialCanvases) as (keyof typeof trialCanvases)[]).find(key=>(["width","height","fps"] as const).every(field=>trialCanvases[key][field]===canvas[field]))??"custom";
	const placementChoice=(Object.keys(trialPlacements) as (keyof typeof trialPlacements)[]).find(key=>(["x","y","width","height"] as const).every(field=>trialPlacements[key][field]===placement[field]))??"custom";
	return {format,canvas:{...canvas},placementChoice,placement:{...placement}};
}
export function readTrialLayout(query:URLSearchParams):TrialLayout {
	const format=query.get("format"),choice=query.get("placement");
	const canvas=format==="custom"?{width:Number(query.get("canvasWidth")??1280),height:Number(query.get("canvasHeight")??720),fps:Number(query.get("canvasFps")??30)}:trialCanvases[format as keyof typeof trialCanvases]??trialCanvases.landscape;
	const placement=choice==="custom"?{x:Number(query.get("regionX")??0),y:Number(query.get("regionY")??0),width:Number(query.get("regionWidth")??1),height:Number(query.get("regionHeight")??1)}:trialPlacements[choice as keyof typeof trialPlacements]??trialPlacements.full;
	const result=trialLayoutFromNative(canvas,placement);
	if(format==="custom")result.format="custom";
	if(choice==="custom")result.placementChoice="custom";
	return result;
}
export function writeTrialLayout(query:URLSearchParams,layout:TrialLayout):void {
	for(const field of trialLayoutFields)query.delete(field);
	query.set("format",layout.format);query.set("placement",layout.placementChoice);
	if(layout.format==="custom")for(const [key,param] of [["width","canvasWidth"],["height","canvasHeight"],["fps","canvasFps"]] as const)query.set(param,String(layout.canvas[key]));
	if(layout.placementChoice==="custom")for(const [key,param] of [["x","regionX"],["y","regionY"],["width","regionWidth"],["height","regionHeight"]] as const)query.set(param,String(layout.placement[key]));
}
export function trialExtraPlacement(extra:TrialExtraLayout):TrialRegion|null {
	return extra.placement==="original"?null:extra.region??trialPlacements[extra.placement as keyof typeof trialPlacements]??trialPlacements.full;
}
export function trialExtraLayoutFromNative(placement:TrialRegion|null|undefined):TrialExtraLayout {
	if(placement==null)return {placement:"original"};
	const choice=trialLayoutFromNative(trialCanvases.landscape,placement).placementChoice;
	return {placement:choice,...(choice==="custom"?{region:{...placement}}:{})};
}
