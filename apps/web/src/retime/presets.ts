import type { RetimeConfig } from "@/timeline";
import { clampRetimeRate, DEFAULT_RETIME_RATE } from "@/retime/rate";
import { roundMediaTime } from "@/wasm";

export function buildConstantRetime({
	rate,
	maintainPitch = false,
}: {
	rate: number;
	maintainPitch?: boolean;
}): RetimeConfig {
	return { rate: clampRetimeRate({ rate }), maintainPitch };
}

export function buildSpeedCurveRetime({
	points,
	maintainPitch = false,
}: {
	points: Array<{ time: number; rate: number }>;
	maintainPitch?: boolean;
}): RetimeConfig {
	const normalized = points
		.map((point) => ({
			time: roundMediaTime({ time: Math.max(0, point.time) }),
			rate: clampRetimeRate({ rate: point.rate }),
		}))
		.sort((a, b) => a.time - b.time);
	if (normalized.length === 0 || normalized[0]?.time !== 0) {
		normalized.unshift({
			time: roundMediaTime({ time: 0 }),
			rate: DEFAULT_RETIME_RATE,
		});
	}
	return {
		rate: normalized[0]?.rate ?? DEFAULT_RETIME_RATE,
		maintainPitch,
		curve: { points: normalized },
	};
}
