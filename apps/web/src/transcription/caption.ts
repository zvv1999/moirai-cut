import type { TranscriptionSegment, CaptionChunk } from "@/transcription/types";
import {
	DEFAULT_WORDS_PER_CAPTION,
	MIN_CAPTION_DURATION_SECONDS,
} from "@/transcription/caption-defaults";

export function buildCaptionChunks({
	segments,
	wordsPerChunk = DEFAULT_WORDS_PER_CAPTION,
	minDuration = MIN_CAPTION_DURATION_SECONDS,
}: {
	segments: TranscriptionSegment[];
	wordsPerChunk?: number;
	minDuration?: number;
}): CaptionChunk[] {
	const captions: CaptionChunk[] = [];
	let globalEndTime = 0;

	for (const segment of segments) {
		const words = segment.text.trim().split(/\s+/);
		if (words.length === 0 || (words.length === 1 && words[0] === "")) continue;

		if (segment.words?.length) {
			for (
				let wordIndex = 0;
				wordIndex < segment.words.length;
				wordIndex += wordsPerChunk
			) {
				const wordTimings = segment.words.slice(
					wordIndex,
					wordIndex + wordsPerChunk,
				);
				if (wordTimings.length === 0) continue;
				const startTime = Math.max(
					wordTimings[0].start,
					globalEndTime,
				);
				const sourceEnd = wordTimings.at(-1)?.end ?? startTime;
				// Word timestamps are already an editorial boundary. Preserve them
				// exactly instead of stretching a short final word and breaking the
				// following cue's timing.
				const duration = Math.max(
					0.05,
					Math.round((sourceEnd - startTime) * 1000) / 1000,
				);
				captions.push({
					text: wordTimings.map((word) => word.word).join(" "),
					startTime,
					duration,
					...(segment.speaker ? { speaker: segment.speaker } : {}),
					wordTimings,
				});
				globalEndTime = startTime + duration;
			}
			continue;
		}

		const segmentDuration = segment.end - segment.start;
		const wordsPerSecond =
			segmentDuration > 0 ? words.length / segmentDuration : words.length;

		const chunks: string[] = [];
		for (let i = 0; i < words.length; i += wordsPerChunk) {
			chunks.push(words.slice(i, i + wordsPerChunk).join(" "));
		}

		let chunkStartTime = segment.start;
		for (const chunk of chunks) {
			const chunkWords = chunk.split(/\s+/).length;
			const chunkDuration = Math.max(minDuration, chunkWords / wordsPerSecond);
			const adjustedStartTime = Math.max(chunkStartTime, globalEndTime);

			captions.push({
				text: chunk,
				startTime: adjustedStartTime,
				duration: chunkDuration,
				...(segment.speaker ? { speaker: segment.speaker } : {}),
			});

			globalEndTime = adjustedStartTime + chunkDuration;
			chunkStartTime += chunkDuration;
		}
	}

	return captions;
}
