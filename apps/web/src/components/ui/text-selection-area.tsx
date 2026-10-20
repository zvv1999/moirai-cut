"use client";

import type { ComponentProps } from "react";
import { Textarea } from "./textarea";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export type TextSelection = { content: string; start: number; end: number };

/** Read-only text selection with caret navigation on browsers that disable it. */
export function TextSelectionArea({ value, onSelectionChange, ...props }: Omit<ComponentProps<typeof Textarea>, "value" | "onSelect" | "onKeyDown" | "readOnly"> & {
 value: string;
 onSelectionChange: (selection: TextSelection) => void;
}) {
 const notify = (input: HTMLTextAreaElement) => onSelectionChange({content:value,start:input.selectionStart,end:input.selectionEnd});
 return <Textarea {...props} value={value} readOnly onSelect={event=>notify(event.currentTarget)} onKeyDown={event=>{
  if (event.altKey || event.ctrlKey || event.metaKey || !["ArrowLeft","ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  const input=event.currentTarget;
  const {selectionStart:start,selectionEnd:end}=input;
  const backwards=input.selectionDirection==="backward";
  const anchor=backwards?end:start,focus=backwards?start:end;
  const boundaries=[...graphemes.segment(value)].map(segment=>segment.index).concat(value.length);
  const right=event.key==="ArrowRight";
  const next=!event.shiftKey&&start!==end ? (right?end:start)
   : right ? boundaries.find(offset=>offset>focus)??value.length
   : boundaries.findLast(offset=>offset<focus)??0;
  if(event.shiftKey)input.setSelectionRange(Math.min(anchor,next),Math.max(anchor,next),next<anchor?"backward":"forward");
  else input.setSelectionRange(next,next);
  notify(input);
 }}/>
}
