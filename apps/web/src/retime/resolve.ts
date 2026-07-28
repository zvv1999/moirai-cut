import type { RetimeConfig } from "@/timeline";
import { clampRetimeRate } from "@/retime/rate";

function getSafeRate({ rate }: { rate: number }): number {
	return clampRetimeRate({ rate });
}

function integrateSpeedCurve({
	clipTime,
	retime,
}: {
	clipTime: number;
	retime: RetimeConfig;
}): number {
	const points = retime.curve?.points;
	if (!points || points.length === 0) {
		return clipTime * getSafeRate({ rate: retime.rate });
	}
	const ordered = [...points].sort((a, b) => a.time - b.time);
	let sourceTime = 0;
	let cursor = 0;
	let currentRate = getSafeRate({ rate: ordered[0]?.rate ?? retime.rate });

	for (let index = 1; index < ordered.length; index++) {
		const point = ordered[index];
		if (!point || clipTime <= cursor) break;
		const segmentEnd = Math.min(clipTime, point.time);
		const duration = Math.max(0, segmentEnd - cursor);
		const nextRate = getSafeRate({ rate: point.rate });
		const fullDuration = Math.max(1, point.time - cursor);
		const endRate =
			currentRate + (nextRate - currentRate) * (duration / fullDuration);
		sourceTime += duration * ((currentRate + endRate) / 2);
		cursor = segmentEnd;
		currentRate = endRate;
		if (clipTime <= point.time) return sourceTime;
		currentRate = nextRate;
		cursor = point.time;
	}
	if (clipTime > cursor) {
		sourceTime += (clipTime - cursor) * currentRate;
	}
	return sourceTime;
}

export function getSourceTimeAtClipTime({
	clipTime,
	retime,
	sourceSpan,
}: {
	clipTime: number;
	retime?: RetimeConfig;
	sourceSpan?: number;
}): number {
	if (!retime) return clipTime;
	if (retime.freezeFrameAt !== undefined) {
		return Math.max(0, retime.freezeFrameAt);
	}
	const forward = integrateSpeedCurve({ clipTime, retime });
	if (retime.reverse && sourceSpan !== undefined) {
		return Math.max(0, sourceSpan - forward);
	}
	return forward;
}

export function getClipTimeAtSourceTime({
	sourceTime,
	retime,
}: {
	sourceTime: number;
	retime?: RetimeConfig;
}): number {
	return sourceTime / getSafeRate({ rate: retime?.rate ?? 1 });
}

export function getEffectiveRateAt({
	retime,
}: {
	clipTime?: number;
	retime?: RetimeConfig;
}): number {
	return getSafeRate({ rate: retime?.rate ?? 1 });
}

export function getTimelineDurationForSourceSpan({
	sourceSpan,
	retime,
}: {
	sourceSpan: number;
	retime?: RetimeConfig;
}): number {
	if (sourceSpan <= 0) {
		return 0;
	}
	if (retime?.curve?.points.length) {
		const minimumRate = Math.min(
			...retime.curve.points.map((point) => getSafeRate({ rate: point.rate })),
		);
		let low = 0;
		let high = sourceSpan / Math.max(0.01, minimumRate);
		for (let iteration = 0; iteration < 48; iteration++) {
			const midpoint = (low + high) / 2;
			if (integrateSpeedCurve({ clipTime: midpoint, retime }) < sourceSpan) {
				low = midpoint;
			} else {
				high = midpoint;
			}
		}
		return (low + high) / 2;
	}
	return sourceSpan / getSafeRate({ rate: retime?.rate ?? 1 });
}

export function getRetimeBoundaryStatus({
	duration,
	sourceSpan,
	retime,
}: {
	duration: number;
	sourceSpan: number;
	retime?: RetimeConfig;
}): {
	usedSourceSpan: number;
	availableSourceSpan: number;
	remainingSourceSpan: number;
	overrun: boolean;
} {
	const usedSourceSpan =
		retime?.freezeFrameAt !== undefined
			? 0
			: integrateSpeedCurve({
					clipTime: Math.max(0, duration),
					retime: retime ?? { rate: 1 },
				});
	const availableSourceSpan = Math.max(0, sourceSpan);
	const remainingSourceSpan = availableSourceSpan - usedSourceSpan;
	return {
		usedSourceSpan,
		availableSourceSpan,
		remainingSourceSpan,
		overrun: remainingSourceSpan < 0,
	};
}
