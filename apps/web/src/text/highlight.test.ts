import { expect, test } from "bun:test";
import { createCanvas } from "@napi-rs/canvas";
import { highlightLineRanges, readTextHighlight } from "./highlight";
import { measureTextLayout, drawMeasuredTextLayout, type TextLayoutParams } from "./primitives";
import { fitTextRegion } from "./fit-region";
import type { ElementAnimations } from "@/animation/types";
import type { TextCanvasContext } from "./layout";

test("keyword stroke produces independent pale outline pixels", () => {
	const canvas = createCanvas(500, 200);
	const ctx = canvas.getContext("2d") as unknown as TextCanvasContext;
	const params = {content:"TEST WORD", "text.highlightEnabled":true, "text.highlightColor":"#ff0000", "text.highlightStrokeEnabled":true, "text.highlightStrokeColor":"#ffffff", "text.highlightStrokeWidth":3, "text.highlightRange":JSON.stringify({content:"TEST WORD",start:5,end:9})};
	const layout = measureTextLayout({ctx,canvasHeight:900,text:{content:params.content,fontSize:5,fontFamily:"Arial",fontWeight:"bold",fontStyle:"normal",textAlign:"left",highlight:readTextHighlight(params)}});
	ctx.translate(20,100);
	drawMeasuredTextLayout({ctx,layout,textColor:"#00ffff"});
	const pixels=canvas.getContext("2d").getImageData(0,0,500,200).data;
	let pale=0,red=0,cyan=0;
	for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<128)continue;if(pixels[i]>220&&pixels[i+1]>220&&pixels[i+2]>220)pale++;if(pixels[i]>220&&pixels[i+1]<30)red++;if(pixels[i]<30&&pixels[i+1]>220&&pixels[i+2]>220)cyan++;}
	expect(pale).toBeGreaterThan(100);expect(red).toBeGreaterThan(100);expect(cyan).toBeGreaterThan(100);
});

test("keyword spans follow wrapping, repeated words and UTF-16", () => {
	expect(
		highlightLineRanges(["go", "go now"], {
			content: "go go now",
			start: 3,
			end: 5,
			color: "#ff0000",
		}),
	).toEqual([null, { start: 0, end: 2 }]);
	expect(
		highlightLineRanges(["看🌟", "重点内容"], {
			content: "看🌟重点内容",
			start: 1,
			end: 5,
			color: "#ff0000",
		}),
	).toEqual([
		{ start: 1, end: 3 },
		{ start: 0, end: 2 },
	]);
	expect(
		highlightLineRanges(["go now"], {
			content: "go go now",
			start: 3,
			end: 5,
			color: "#ff0000",
		}),
	).toEqual([null]);
});

test("edited content and malformed metadata cannot highlight the wrong text", () => {
	const params = {
		content: "go go",
		"text.highlightEnabled": true,
		"text.highlightColor": "#ff0000",
		"text.highlightRange": JSON.stringify({
			content: "go go",
			start: 3,
			end: 5,
		}),
	};
	expect(readTextHighlight(params)?.start).toBe(3);
	expect(readTextHighlight({ ...params, content: "go now" })).toBeUndefined();
	for (const range of [
		"null",
		"bad JSON",
		'{"content":"go go","start":-1,"end":2}',
		'{"content":"go go","start":0,"end":99}',
	])
		expect(
			readTextHighlight({ ...params, "text.highlightRange": range }),
		).toBeUndefined();
});

test("measured wrapping retains the keyword span across line boundaries", () => {
	const ctx = createCanvas(600, 300).getContext(
		"2d",
	) as unknown as TextCanvasContext;
	const text: TextLayoutParams = {
		content: "go go now and continue",
		fontSize: 4,
		fontFamily: "Arial",
		fontWeight: "bold",
		fontStyle: "normal",
		textAlign: "center",
		highlight: {
			content: "go go now and continue",
			start: 3,
			end: 13,
			color: "#ff0000",
		},
	};
	const fitted = fitTextRegion({
		text,
		canvasHeight: 900,
		ctx,
		maxWidth: 140,
		maxHeight: 280,
		maxLines: 5,
	});
	const layout = measureTextLayout({ text: fitted, canvasHeight: 900, ctx });
	const ranges = highlightLineRanges(layout.lines, layout.highlight);
	const selected = layout.lines
		.map((line, i) =>
			ranges[i] ? line.slice(ranges[i]!.start, ranges[i]!.end) : "",
		)
		.join("");
	expect(layout.lines.length).toBeGreaterThan(1);
	expect(selected.replaceAll(" ", "")).toBe("gonowand");
	expect(layout.highlight).toEqual(text.highlight);
});

test("word-follow coloring samples discrete keys on seek and clears in gaps", () => {
	const range = (start: number, end: number) =>
		JSON.stringify({ content: "go go", start, end });
	const params = {
		content: "go go",
		"text.highlightEnabled": true,
		"text.highlightColor": "#ff0000",
		"text.highlightRange": "",
	};
	const animations = {
		"text.highlightRange": {
			keys: [
				{ id: "a", time: 0, value: "" },
				{ id: "b", time: 12000, value: range(0, 2) },
				{ id: "c", time: 24000, value: "" },
				{ id: "d", time: 36000, value: range(3, 5) },
				{ id: "e", time: 48000, value: "" },
			],
		},
	} as unknown as ElementAnimations;
	expect(readTextHighlight(params, animations, 36000)?.start).toBe(3);
	expect(readTextHighlight(params, animations, 12000)?.start).toBe(0);
	expect(readTextHighlight(params, animations, 23999)?.start).toBe(0);
	expect(readTextHighlight(params, animations, 24000)).toBeUndefined();
	expect(readTextHighlight(params, animations, 0)).toBeUndefined();
	expect(readTextHighlight(params, animations, 48000)).toBeUndefined();
	expect(
		readTextHighlight({ ...params, content: "go now" }, animations, 36000),
	).toBeUndefined();
});

test("Chinese keyword highlight follows text when opening punctuation moves to the next line", () => {
	const ctx = createCanvas(600, 300).getContext("2d") as unknown as TextCanvasContext;
	const content = "今天（重要任务）";
	const text: TextLayoutParams = { content, fontSize: 4, fontFamily: "Arial", fontWeight: "bold", fontStyle: "normal", textAlign: "left", highlight: {content, start: 3, end: 7, color: "#ffff00"} };
	const maxWidth = measureTextLayout({text: {...text, content: "今天（"}, ctx, canvasHeight: 900}).block.maxWidth + 1;
	const fitted = fitTextRegion({text, ctx, canvasHeight: 900, maxWidth, maxHeight: 300, maxLines: 5});
	const layout = measureTextLayout({text: fitted, ctx, canvasHeight: 900});
	const ranges = highlightLineRanges(layout.lines, layout.highlight);
	expect(layout.lines.length).toBeGreaterThan(1);
	expect(layout.lines[0]).toBe("今天");
	expect(layout.lines.map((line, i) => ranges[i] ? line.slice(ranges[i]!.start, ranges[i]!.end) : "").join("")).toBe("重要任务");
	expect(layout.highlight).toEqual(text.highlight);
});
