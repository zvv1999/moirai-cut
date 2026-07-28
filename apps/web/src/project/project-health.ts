import { TICKS_PER_SECOND } from "@/wasm";

export type ProjectHealthSeverity = "error" | "warning" | "note";

export interface ProjectHealthFinding {
	id: string;
	code:
		| "no_visual_content"
		| "sliver_clip"
		| "missing_media"
		| "trim_past_source"
		| "track_overlap"
		| "main_track_gap"
		| "dead_span"
		| "muted_with_content"
		| "hidden_with_content"
		| "audio_headroom"
		| "caption_line_length"
		| "caption_unsafe_placement";
	severity: ProjectHealthSeverity;
	message: string;
	trackId?: string;
	elementId?: string;
	atSeconds?: number;
	endSeconds?: number;
}

interface HealthElement {
	id: string;
	name: string;
	type: string;
	startTime: number;
	duration: number;
	trimStart: number;
	mediaId?: string;
	retime?: { rate?: number };
	params: Record<string, unknown>;
}

interface HealthTrack {
	id: string;
	name: string;
	type: string;
	role?: "main";
	muted?: boolean;
	hidden?: boolean;
	elements: HealthElement[];
}

interface ProjectHealthInput {
	project: {
		canvasSize: { width: number; height: number };
		tracks: HealthTrack[];
	};
	media: Array<{ id: string; durationSeconds?: number }>;
	minClipSeconds?: number;
}

export interface ProjectHealthResult {
	findings: ProjectHealthFinding[];
	counts: Record<ProjectHealthSeverity, number>;
	exportReady: boolean;
	timelineSeconds: number;
}

const seconds = (ticks: number) =>
	Math.round((ticks / TICKS_PER_SECOND) * 1_000) / 1_000;

export function runProjectHealthCheck({
	project,
	media,
	minClipSeconds = 0.5,
}: ProjectHealthInput): ProjectHealthResult {
	const findings: ProjectHealthFinding[] = [];
	const mediaById = new Map(media.map((asset) => [asset.id, asset]));
	const covered: Array<[number, number]> = [];
	const frameTolerance = TICKS_PER_SECOND / 30;
	const minClipTicks = minClipSeconds * TICKS_PER_SECOND;
	let timelineEnd = 0;
	let visualElementCount = 0;

	const add = ({
		code,
		severity,
		message,
		trackId,
		elementId,
		atSeconds,
		endSeconds,
	}: Omit<ProjectHealthFinding, "id">) => {
		findings.push({
			id: `${code}:${trackId ?? "project"}:${elementId ?? atSeconds ?? "all"}`,
			code,
			severity,
			message,
			trackId,
			elementId,
			atSeconds,
			endSeconds,
		});
	};

	for (const track of project.tracks) {
		const elements = [...track.elements].sort(
			(left, right) => left.startTime - right.startTime,
		);
		if (track.hidden && elements.length > 0) {
			add({
				code: "hidden_with_content",
				severity: "note",
				message: `${track.name} is hidden but contains ${elements.length} clip(s).`,
				trackId: track.id,
			});
		}
		if (track.muted && elements.length > 0) {
			add({
				code: "muted_with_content",
				severity: "note",
				message: `${track.name} is muted but contains ${elements.length} clip(s).`,
				trackId: track.id,
			});
		}

		for (const element of elements) {
			const end = element.startTime + element.duration;
			timelineEnd = Math.max(timelineEnd, end);
			covered.push([element.startTime, end]);
			if (element.type !== "audio") visualElementCount += 1;

			if (element.duration < minClipTicks) {
				add({
					code: "sliver_clip",
					severity: "warning",
					message: `${element.name} is ${seconds(element.duration)}s and may read as a flash frame.`,
					trackId: track.id,
					elementId: element.id,
					atSeconds: seconds(element.startTime),
				});
			}

			if (element.mediaId) {
				const asset = mediaById.get(element.mediaId);
				if (!asset) {
					add({
						code: "missing_media",
						severity: "error",
						message: `${element.name} references media that is not in the library.`,
						trackId: track.id,
						elementId: element.id,
						atSeconds: seconds(element.startTime),
					});
				} else if (
					element.type !== "image" &&
					typeof asset.durationSeconds === "number" &&
					asset.durationSeconds > 0
				) {
					const rate = element.retime?.rate ?? 1;
					const consumedEnd =
						element.trimStart + element.duration * Math.max(0, rate);
					if (
						consumedEnd >
						asset.durationSeconds * TICKS_PER_SECOND + frameTolerance
					) {
						add({
							code: "trim_past_source",
							severity: "error",
							message: `${element.name} extends past its source and may freeze or render black.`,
							trackId: track.id,
							elementId: element.id,
							atSeconds: seconds(element.startTime),
						});
					}
				}
			}

			if (
				(element.type === "audio" || element.type === "video") &&
				typeof element.params.volume === "number" &&
				element.params.volume > 0
			) {
				add({
					code: "audio_headroom",
					severity: "warning",
					message: `${element.name} has +${element.params.volume.toFixed(1)} dB gain and should be checked for clipping.`,
					trackId: track.id,
					elementId: element.id,
					atSeconds: seconds(element.startTime),
				});
			}

			if (
				element.type === "text" &&
				(element.params["caption.enabled"] === true ||
					/^Caption(?:\s|$)/i.test(element.name))
			) {
				const content =
					typeof element.params["caption.primaryText"] === "string"
						? element.params["caption.primaryText"]
						: typeof element.params.content === "string"
							? element.params.content
							: "";
				const longestLine = Math.max(
					0,
					...content.split("\n").map((line) => line.length),
				);
				if (longestLine > 42) {
					add({
						code: "caption_line_length",
						severity: "warning",
						message: `${element.name} has ${longestLine} characters on one line.`,
						trackId: track.id,
						elementId: element.id,
						atSeconds: seconds(element.startTime),
					});
				}
				const positionY = element.params["transform.positionY"];
				if (
					typeof positionY === "number" &&
					Math.abs(positionY) > project.canvasSize.height * 0.42
				) {
					add({
						code: "caption_unsafe_placement",
						severity: "warning",
						message: `${element.name} is outside the title-safe vertical area.`,
						trackId: track.id,
						elementId: element.id,
						atSeconds: seconds(element.startTime),
					});
				}
			}
		}

		for (let index = 1; index < elements.length; index += 1) {
			const previous = elements[index - 1];
			const current = elements[index];
			const previousEnd = previous.startTime + previous.duration;
			if (current.startTime < previousEnd - frameTolerance) {
				add({
					code: "track_overlap",
					severity: "error",
					message: `${previous.name} overlaps ${current.name} on ${track.name}.`,
					trackId: track.id,
					elementId: current.id,
					atSeconds: seconds(current.startTime),
				});
			}
		}

		if (track.role === "main") {
			for (let index = 1; index < elements.length; index += 1) {
				const previousEnd =
					elements[index - 1].startTime + elements[index - 1].duration;
				const gap = elements[index].startTime - previousEnd;
				if (gap > frameTolerance) {
					add({
						code: "main_track_gap",
						severity: "warning",
						message: `${seconds(gap)}s hole on the main track will export as black.`,
						trackId: track.id,
						atSeconds: seconds(previousEnd),
						endSeconds: seconds(elements[index].startTime),
					});
				}
			}
		}
	}

	covered.sort((left, right) => left[0] - right[0]);
	let cursor = 0;
	for (const [start, end] of covered) {
		if (start - cursor > frameTolerance && cursor < timelineEnd) {
			add({
				code: "dead_span",
				severity: "warning",
				message: `Nothing exists from ${seconds(cursor)}s to ${seconds(start)}s.`,
				atSeconds: seconds(cursor),
				endSeconds: seconds(start),
			});
		}
		cursor = Math.max(cursor, end);
	}

	if (visualElementCount === 0) {
		add({
			code: "no_visual_content",
			severity: "error",
			message: "The project has no visual content to export.",
			atSeconds: 0,
		});
	}

	const rank: Record<ProjectHealthSeverity, number> = {
		error: 0,
		warning: 1,
		note: 2,
	};
	findings.sort(
		(left, right) =>
			rank[left.severity] - rank[right.severity] ||
			(left.atSeconds ?? 0) - (right.atSeconds ?? 0),
	);
	const counts = {
		error: findings.filter((finding) => finding.severity === "error").length,
		warning: findings.filter((finding) => finding.severity === "warning")
			.length,
		note: findings.filter((finding) => finding.severity === "note").length,
	};
	return {
		findings,
		counts,
		exportReady: counts.error === 0,
		timelineSeconds: seconds(timelineEnd),
	};
}
