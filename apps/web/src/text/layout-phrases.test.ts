import { expect, test } from "bun:test";
import { createCanvas } from "@napi-rs/canvas";
import { readLayoutPhrases } from "./layout-phrases";
import { fitTextRegion } from "./fit-region";
import { measureTextLayout, type TextLayoutParams } from "./primitives";
import type { TextCanvasContext } from "./layout";
const ctx = createCanvas(600,400).getContext("2d") as unknown as TextCanvasContext;
const text: TextLayoutParams = {content:"今天最重要", fontSize:4, fontFamily:"Arial", fontWeight:"bold", fontStyle:"normal", textAlign:"left"};
const width = (content:string) => measureTextLayout({text:{...text,content},ctx,canvasHeight:900}).block.maxWidth;
const options = {ctx,canvasHeight:900,maxWidth:width("今天最")+.1,maxHeight:300,maxLines:4};

test("static phrase keeps Chinese group together without changing text or font size",()=>{
 const ordinary = fitTextRegion({...options,text});
 const grouped = fitTextRegion({...options,text:{...text,layoutPhrases:{content:text.content,ranges:[{start:2,end:5}]}}});
 expect(ordinary.content.replaceAll("\n", "")).toBe(text.content);
 expect(grouped.content).toBe("今天\n最重要");
 expect(grouped.fontSize).toBe(text.fontSize);
});
test("oversize phrases fall back and explicit paragraphs take precedence",()=>{
 const all = {content:text.content,ranges:[{start:0,end:5}]};
 expect(fitTextRegion({...options,text:{...text,layoutPhrases:all}})).toEqual({...fitTextRegion({...options,text}),layoutPhrases:all});
 const content="今天最\r\n重要";
 const result=fitTextRegion({...options,text:{...text,content,layoutPhrases:{content,ranges:[{start:2,end:7}]}}});
 expect(result.content).toBe("今天最\n重要");
});
test("metadata rejects stale text, overlaps, invalid offsets and bisected emoji",()=>{
 const valid=JSON.stringify({content:text.content,ranges:[{start:2,end:5}]});
 expect(readLayoutPhrases(valid,text.content)?.ranges).toHaveLength(1);
 expect(readLayoutPhrases(valid,"已经改字")).toBeUndefined();
 for(const ranges of [[{start:-1,end:2}],[{start:2,end:2}],[{start:0,end:99}],[{start:0,end:3},{start:2,end:4}],[{start:.5,end:2}]]) expect(readLayoutPhrases(JSON.stringify({content:text.content,ranges}),text.content)).toBeUndefined();
 expect(readLayoutPhrases(JSON.stringify({content:"看🌟",ranges:[{start:1,end:2}]}),"看🌟")).toBeUndefined();
 expect(readLayoutPhrases("null",text.content)).toBeUndefined();
});

test("moving word highlights cannot change static phrase line breaks",()=>{
 const layoutPhrases={content:text.content,ranges:[{start:2,end:5}]};
 for(let start=0;start<text.content.length;start++) {
  const result=fitTextRegion({...options,text:{...text,layoutPhrases,highlight:{content:text.content,start,end:start+1,color:"#ffff00"}}});
  expect(result.content).toBe("今天\n最重要");
 }
});

test("all alignments balance only at legal phrase boundaries",()=>{
 for (const textAlign of ["left", "center", "right"] as const) {
 const content="先选出今天最重要的一件事，";
 const source:TextLayoutParams={...text,content,textAlign,layoutPhrases:{content,ranges:[{start:5,end:8}]}};
 const maxWidth=width("先选出今天最重要")+.1;
 const result=fitTextRegion({...options,maxWidth,maxLines:2,text:source});
 expect(result.fontSize).toBe(source.fontSize);
 expect(result.content).toBe("先选出今天\n最重要的一件事，");
 expect(result.content.replaceAll("\n","")).toBe(content);
 }
});

test("punctuation overflow only releases the affected phrase",()=>{
 const content="important task, one two three four";
 const layoutPhrases={content,ranges:[{start:0,end:14},{start:20,end:29}]};
 const maxWidth=width("important task")+.1;
 const result=fitTextRegion({...options,maxWidth,maxLines:8,maxHeight:600,text:{...text,content,layoutPhrases}});
 expect(width("important task,")).toBeGreaterThan(maxWidth);
 expect(result.fontSize).toBe(text.fontSize);
 expect(result.content).toContain("two three");
 expect(result.content.replace(/\s+/g," ")).toBe(content);
 expect(measureTextLayout({text:result,ctx,canvasHeight:900}).block.maxWidth).toBeLessThanOrEqual(maxWidth);
});

test("Chinese phrase hints survive another phrase's closing punctuation overflow",()=>{
 const content="重要工作安排，今天最重要的是交付结果";
 const source:TextLayoutParams={...text,fontFamily:"PingFang SC",content,layoutPhrases:{content,ranges:[{start:0,end:6},{start:9,end:12}]}};
 const maxWidth=measureTextLayout({text:{...source,content:"重要工作安排"},ctx,canvasHeight:900}).block.maxWidth+.1;
 const result=fitTextRegion({...options,maxWidth,maxLines:4,text:source});
 expect(result.fontSize).toBe(source.fontSize);
 expect(result.content).toContain("最重要");
 expect(result.content.replaceAll("\n","")).toBe(content);
 expect(result.content.split("\n").every(line=>!/^，/.test(line))).toBe(true);
 expect(measureTextLayout({text:result,ctx,canvasHeight:900}).block.maxWidth).toBeLessThanOrEqual(maxWidth);
});
