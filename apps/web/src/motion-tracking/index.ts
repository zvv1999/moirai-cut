export interface TrackingFrame {
	time: number;
	width: number;
	height: number;
	luma: Uint8Array;
}

export interface TrackingRegion {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface MotionTrackingSample {
	time: number;
	x: number;
	y: number;
	confidence: number;
}

export interface TrackingFailureRange {
	start: number;
	end: number;
	minimumConfidence: number;
}

export interface MotionTrackingData {
	region: TrackingRegion;
	samples: MotionTrackingSample[];
	confidenceThreshold: number;
	failureRanges: TrackingFailureRange[];
	binding:
		| { type: "none" }
		| { type: "transform" }
		| { type: "mask"; maskId: string };
	quality: "fast" | "balanced" | "precise";
}

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}) {
	return Math.min(max, Math.max(min, value));
}

function rounded(value: number): number {
	return Number(value.toFixed(6));
}

function readTemplate({
	frame,
	left,
	top,
	width,
	height,
}: {
	frame: TrackingFrame;
	left: number;
	top: number;
	width: number;
	height: number;
}): Uint8Array {
	const template = new Uint8Array(width * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			template[y * width + x] =
				frame.luma[(top + y) * frame.width + left + x] ?? 0;
		}
	}
	return template;
}

function templateConfidence({
	frame,
	template,
	left,
	top,
	width,
	height,
}: {
	frame: TrackingFrame;
	template: Uint8Array;
	left: number;
	top: number;
	width: number;
	height: number;
}): number {
	let error = 0;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const expected = template[y * width + x] ?? 0;
			const actual = frame.luma[(top + y) * frame.width + left + x] ?? 0;
			error += Math.abs(expected - actual);
		}
	}
	const normalizedError = error / Math.max(1, width * height * 255);
	return rounded(clamp({ value: 1 - normalizedError * 1.1, min: 0, max: 1 }));
}

export function trackTemplateFrames({
	frames,
	region,
	searchRadius,
}: {
	frames: TrackingFrame[];
	region: TrackingRegion;
	searchRadius: number;
}): MotionTrackingSample[] {
	const first = frames[0];
	if (!first || first.width <= 0 || first.height <= 0) return [];
	if (first.luma.length !== first.width * first.height) {
		throw new Error("Tracking frame luma length does not match its dimensions");
	}

	const width = clamp({
		value: Math.round(region.width * first.width),
		min: 1,
		max: first.width,
	});
	const height = clamp({
		value: Math.round(region.height * first.height),
		min: 1,
		max: first.height,
	});
	let left = clamp({
		value: Math.round(region.x * first.width),
		min: 0,
		max: first.width - width,
	});
	let top = clamp({
		value: Math.round(region.y * first.height),
		min: 0,
		max: first.height - height,
	});
	const template = readTemplate({ frame: first, left, top, width, height });
	const samples: MotionTrackingSample[] = [
		{
			time: first.time,
			x: (left + width / 2) / first.width,
			y: (top + height / 2) / first.height,
			confidence: 1,
		},
	];
	const radius = Math.max(0, Math.round(searchRadius));

	for (const frame of frames.slice(1)) {
		if (
			frame.width !== first.width ||
			frame.height !== first.height ||
			frame.luma.length !== frame.width * frame.height
		) {
			throw new Error("Tracking frames must share valid dimensions");
		}
		let best = { left, top, confidence: -1 };
		for (
			let candidateTop = Math.max(0, top - radius);
			candidateTop <= Math.min(frame.height - height, top + radius);
			candidateTop++
		) {
			for (
				let candidateLeft = Math.max(0, left - radius);
				candidateLeft <= Math.min(frame.width - width, left + radius);
				candidateLeft++
			) {
				const confidence = templateConfidence({
					frame,
					template,
					left: candidateLeft,
					top: candidateTop,
					width,
					height,
				});
				if (confidence > best.confidence) {
					best = { left: candidateLeft, top: candidateTop, confidence };
				}
			}
		}
		left = best.left;
		top = best.top;
		samples.push({
			time: frame.time,
			x: (left + width / 2) / frame.width,
			y: (top + height / 2) / frame.height,
			confidence: best.confidence,
		});
	}
	return samples;
}

export function buildTrackingFailureRanges({
	samples,
	confidenceThreshold,
}: {
	samples: MotionTrackingSample[];
	confidenceThreshold: number;
}): TrackingFailureRange[] {
	const ranges: TrackingFailureRange[] = [];
	let activeRange: TrackingFailureRange | null = null;
	for (const sample of samples) {
		if (sample.confidence >= confidenceThreshold) {
			activeRange = null;
			continue;
		}
		if (activeRange) {
			activeRange.end = sample.time;
			activeRange.minimumConfidence = Math.min(
				activeRange.minimumConfidence,
				sample.confidence,
			);
		} else {
			activeRange = {
				start: sample.time,
				end: sample.time,
				minimumConfidence: sample.confidence,
			};
			ranges.push(activeRange);
		}
	}
	return ranges;
}

export function resolveTrackingOffset({
	samples,
	time,
	confidenceThreshold,
}: {
	samples: MotionTrackingSample[];
	time: number;
	confidenceThreshold: number;
}): { x: number; y: number; confidence: number } | null {
	const first = samples[0];
	if (!first) return null;
	const before =
		[...samples].reverse().find((sample) => sample.time <= time) ?? first;
	const after =
		samples.find((sample) => sample.time >= time) ?? samples.at(-1) ?? first;
	const span = after.time - before.time;
	const amount =
		span <= 0
			? 0
			: clamp({ value: (time - before.time) / span, min: 0, max: 1 });
	const confidence =
		before.confidence + (after.confidence - before.confidence) * amount;
	if (confidence < confidenceThreshold) return null;
	return {
		x: rounded(before.x + (after.x - before.x) * amount - first.x),
		y: rounded(before.y + (after.y - before.y) * amount - first.y),
		confidence: rounded(confidence),
	};
}
