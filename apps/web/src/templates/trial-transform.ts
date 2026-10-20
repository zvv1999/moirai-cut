/** UI transport only; Rust owns ranges, geometry and execution. */
export type TrialTransform = {scale:number;centerX:number;centerY:number;rotationDegrees?:number};
export const trialTransformFields = ["scale","centerX","centerY","rotationDegrees"] as const;
export function writeTrialTransform(query:URLSearchParams,transform?:TrialTransform) {
 for(const key of trialTransformFields) {
  const value=transform?.[key];
  if(value===undefined)query.delete(key);else query.set(key,String(value));
 }
}
export function readTrialTransform(query:URLSearchParams):TrialTransform|undefined {
 if(!query.has("scale")&&!query.has("rotationDegrees"))return;
 const angle=query.get("rotationDegrees");
 return {scale:Number(query.get("scale")??1),centerX:Number(query.get("centerX")??.5),centerY:Number(query.get("centerY")??.75),...(angle===null?{}:{rotationDegrees:Number(angle)})};
}
