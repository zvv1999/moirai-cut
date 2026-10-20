"use client";

import { useState } from "react";
import { hasKeyframesForPath } from "@/animation";
import { Button } from "@/components/ui/button";
import { TextSelectionArea } from "@/components/ui/text-selection-area";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import { readLayoutPhrases } from "@/text/layout-phrases";
import type { TextElement } from "@/timeline";

export function TextLayoutPhraseEditor({element,trackId}:{element:TextElement;trackId:string}) {
 const {renderElement,previewUpdates,commit}=useElementPreview({trackId,elementId:element.id,fallback:element});
 const [selection,setSelection]=useState({content:"",start:0,end:0});
 const content=String(renderElement.params.content??"");
 const raw=renderElement.params["text.layoutPhrases"];
 const current=readLayoutPhrases(raw,content);
 const stale=typeof raw==="string"&&raw.length>0&&!current;
 const animated=hasKeyframesForPath({animations:renderElement.animations,propertyPath:"content"});
 const bilingual=renderElement.params["caption.enabled"]===true&&!!renderElement.params["caption.primaryText"]&&!!renderElement.params["caption.secondaryText"];
 const bounded=Number(renderElement.params["text.maxWidth"])>0&&Number(renderElement.params["text.maxLines"])>1;
 const selected=selection.content===content&&selection.end>selection.start;
 const proposed=selected?JSON.stringify({content,ranges:[...(current?.ranges??[]),{start:selection.start,end:selection.end}].sort((a,b)=>a.start-b.start)}):"";
 const valid=selected&&!!readLayoutPhrases(proposed,content);
 function update(value:string){
  previewUpdates({params:{...renderElement.params,"text.layoutPhrases":value}});commit();
 }
 return <section className="border-t p-4 space-y-3" aria-label="字幕同排短语">
  <h3 className="text-sm font-medium">短语尽量同排</h3>
  <p className="text-xs text-muted-foreground">在下方选中文字后添加。只影响当前字幕换行，过长时仍可换行；不会改变逐词高亮和声音时间。</p>
  <TextSelectionArea aria-label="选择同排短语文字" value={content} onSelectionChange={setSelection}/>
  <div className="flex flex-wrap gap-2">
   <Button size="sm" disabled={!valid||animated||!!bilingual} onClick={()=>update(proposed)}>添加同排短语</Button>
   <Button size="sm" variant="outline" disabled={!raw} onClick={()=>update("")}>清除同排短语</Button>
  </div>
  {selected&&!valid&&<p role="status" className="text-xs">选区与已有短语重叠，或切开了完整字符。请重新选择。</p>}
  {!bounded&&!bilingual&&<p className="text-xs text-muted-foreground">需在排版中设置最大宽度和至少两行，才能应用同排提示。</p>}
  {bilingual&&<p role="status" className="text-xs">双语字幕使用独立排版，暂不支持此同排设置。</p>}
  {animated&&<p role="status" className="text-xs">文字内容由关键帧控制，暂不支持新增静态同排范围。</p>}
  {stale&&<p role="status" className="text-xs">原有同排范围已失效，当前按普通换行。可重新选择文字添加，或清除旧设置。</p>}
  {current?.ranges.map((range,index)=><div key={`${range.start}-${range.end}`} className="flex items-center justify-between gap-2">
   <span className="min-w-0 break-words text-sm">{content.slice(range.start,range.end)}</span>
   <Button size="sm" variant="ghost" aria-label={`移除第${index+1}个同排短语`} onClick={()=>update(JSON.stringify({content,ranges:current.ranges.filter((_,i)=>i!==index)}))}>移除</Button>
  </div>)}
  {!stale&&!current?.ranges.length&&<p className="text-xs text-muted-foreground">未设置同排短语</p>}
 </section>;
}
