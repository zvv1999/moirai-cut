import { expect, test } from "bun:test";
import { createCanvas } from "@napi-rs/canvas";
import { fitTextRegion } from "./fit-region";
import { measureTextLayout, type TextLayoutParams } from "./primitives";
import type { TextCanvasContext } from "./layout";

const ctx = createCanvas(800, 800).getContext(
	"2d",
) as unknown as TextCanvasContext;
const text: TextLayoutParams = {
	content: "honors program",
	fontSize: 3,
	fontFamily: "Arial",
	fontWeight: "bold",
	fontStyle: "normal",
	textAlign: "center",
	lineHeight: 1.2,
};
test("sidebar keywords wrap at the authored font size before shrinking", () => {
	const result = fitTextRegion({
		text,
		ctx,
		canvasHeight: 900,
		maxWidth: 145,
		maxHeight: 180,
		maxLines: 3,
	});
	expect(result.fontSize).toBe(text.fontSize);
	expect(result.content).toBe("honors\nprogram");
});
test("unbreakable text fits the region and keeps its complete content", () => {
	const source = { ...text, content: "Supercalifragilisticexpialidocious" };
	const result = fitTextRegion({
		text: source,
		ctx,
		canvasHeight: 900,
		maxWidth: 120,
		maxHeight: 50,
		maxLines: 2,
	});
	const measured = measureTextLayout({ text: result, ctx, canvasHeight: 900 });
	expect(result.content).toBe(source.content);
	expect(result.fontSize).toBeLessThan(source.fontSize);
	expect(measured.block.maxWidth).toBeLessThanOrEqual(120);
	expect(measured.block.height).toBeLessThanOrEqual(50);
});
test("Chinese wrapping preserves content and obeys the line and height budgets", () => {
	const source = { ...text, content: "科学研究能够改变劳动者的生活" };
	const result = fitTextRegion({
		text: source,
		ctx,
		canvasHeight: 900,
		maxWidth: 130,
		maxHeight: 100,
		maxLines: 3,
	});
	const measured = measureTextLayout({ text: result, ctx, canvasHeight: 900 });
	expect(result.content.replaceAll("\n", "")).toBe(source.content);
	expect(measured.lines.length).toBeLessThanOrEqual(3);
	expect(measured.block.maxWidth).toBeLessThanOrEqual(130);
	expect(measured.block.height).toBeLessThanOrEqual(100);
});

test("caption wrapping balances trailing lines independently of alignment", () => {
 const source = { ...text, content: "one two three four five" };
 const width = (content: string) => measureTextLayout({text:{...source,content},ctx,canvasHeight:900}).block.maxWidth;
 const maxWidth = width("one two three four") + 1;
 const greedySpread = width("one two three four") - width("five");
 const outputs = [];
 for (const textAlign of ["left", "center", "right"] as const) {
  const result = fitTextRegion({text:{...source,textAlign},ctx,canvasHeight:900,maxWidth,maxHeight:180,maxLines:2});
  const lines=result.content.split("\n"), widths=lines.map(width);
  expect(result.textAlign).toBe(textAlign);
  expect(result.fontSize).toBe(source.fontSize);
  expect(lines).toHaveLength(2);
  expect(lines.join(" ")).toBe(source.content);
  expect(Math.max(...widths)-Math.min(...widths)).toBeLessThan(greedySpread);
  expect(Math.max(...widths)).toBeLessThanOrEqual(maxWidth);
  outputs.push(result.content);
 }
 expect(new Set(outputs).size).toBe(1);
});

test("balancing preserves explicit paragraph breaks and single lines", () => {
	const source = { ...text, content: "one two\nthree\n\nfour five" };
	const result = fitTextRegion({
		text: source,
		ctx,
		canvasHeight: 900,
		maxWidth: 260,
		maxHeight: 300,
		maxLines: 4,
	});
	expect(result.content).toBe(source.content);
	expect(result.fontSize).toBe(source.fontSize);
});

test("punctuation at a full line moves with its word instead of shrinking the paragraph", () => {
	const source = { ...text, content: "one two, three" };
	const width = (content: string) => measureTextLayout({ text: { ...source, content }, ctx, canvasHeight: 900 }).block.maxWidth;
	const maxWidth = (width("one two") + width("one two,")) / 2;
	const result = fitTextRegion({ text: source, ctx, canvasHeight: 900, maxWidth, maxHeight: 180, maxLines: 3 });
	expect(result.fontSize).toBe(source.fontSize);
	expect(result.content.replaceAll("\n", " ")).toBe(source.content);
	expect(result.content.split("\n").every(line => !line.startsWith(","))).toBe(true);
	expect(measureTextLayout({ text: result, ctx, canvasHeight: 900 }).block.maxWidth).toBeLessThanOrEqual(maxWidth);
});

test("opening Chinese punctuation stays with following text at wrap boundaries", () => {
	for (const content of ["今天（重要任务）", "今天“重要任务”", "今天《重要任务》", "今天【重要任务】", "今天（“重要任务”）"]) {
		const source = { ...text, content, textAlign: "left" as const };
		const maxWidth = measureTextLayout({ text: { ...source, content: "今天（" }, ctx, canvasHeight: 900 }).block.maxWidth + 1;
		const result = fitTextRegion({ text: source, ctx, canvasHeight: 900, maxWidth, maxHeight: 300, maxLines: 5 });
		expect(result.content.replaceAll("\n", "")).toBe(content);
		expect(result.content.split("\n").every(line => !/[（“《【]$/u.test(line))).toBe(true);
		expect(result.content.split("\n").every(line => !/^[）”》】]/u.test(line))).toBe(true);
		expect(measureTextLayout({ text: result, ctx, canvasHeight: 900 }).block.maxWidth).toBeLessThanOrEqual(maxWidth);
	}
});

test("balanced multiline text preserves paragraphs, word order and fitted dimensions", () => {
 const source:TextLayoutParams={...text,content:"one longer word and three small words then finish\nnext paragraph",textAlign:"center"};
 const result=fitTextRegion({text:source,ctx,canvasHeight:900,maxWidth:170,maxHeight:250,maxLines:6});
 const measured=measureTextLayout({text:result,ctx,canvasHeight:900});
 expect(result.content.replace(/\s+/g," ")).toBe(source.content.replace(/\s+/g," "));
 expect(result.content).toContain("finish\nnext");
 expect(measured.lines.length).toBeLessThanOrEqual(6);
 expect(measured.block.maxWidth).toBeLessThanOrEqual(170);
 expect(measured.block.height).toBeLessThanOrEqual(250);
 expect(measured.lines.every(line=>line.trim().length>0)).toBe(true);
});
