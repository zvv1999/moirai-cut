import type { MediaTime } from "@/wasm";

export type KeyframePlayheadPosition = "before" | "inside" | "after";

export function getAdjacentKeyframeTimes({
	times,
	localTime,
	position,
}: {
	times: MediaTime[];
	localTime: MediaTime;
	position: KeyframePlayheadPosition;
}): {
	previous: MediaTime | null;
	next: MediaTime | null;
	count: number;
} {
	const orderedTimes = [...new Set(times)].sort((left, right) => left - right);
	const previous =
		[...orderedTimes]
			.reverse()
			.find((time) =>
				position === "after" ? time <= localTime : time < localTime,
			) ?? null;
	const next =
		orderedTimes.find((time) =>
			position === "before" ? time >= localTime : time > localTime,
		) ?? null;

	return {
		previous,
		next,
		count: orderedTimes.length,
	};
}
