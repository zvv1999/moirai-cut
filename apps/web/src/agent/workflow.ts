import type {
	ElementSummary,
	ProjectStateSummary,
	RenderFramesResult,
} from "./agent-manager";
import type { ElementRefInput, Operation } from "./operations";
import type {
	ProjectHealthResult,
	ProjectHealthSeverity,
} from "@/project/project-health";
import type { ExportPreflightResult } from "@/export/workflow";

export interface SemanticEditContext {
	state: ProjectStateSummary;
	selectedElements: ElementRefInput[];
}

export interface AgentAffectedRange {
	startSeconds: number;
	endSeconds: number;
}

export interface AgentPlanTarget {
	trackId: string;
	elementId: string;
	name: string;
}

export interface AgentPlanGroup {
	id: string;
	label: string;
	operation: Operation;
	inverseOperation: Operation;
	targets: AgentPlanTarget[];
	properties: string[];
	affectedRange: AgentAffectedRange | null;
	expectedEffect: string;
}

export interface SemanticEditPlan {
	id: string;
	request: string;
	title: string;
	baseRevision: number;
	projectId: string | null;
	createdAt: string;
	valid: boolean;
	assumptions: string[];
	errors: string[];
	expectedOutput: string;
	groups: AgentPlanGroup[];
}

const CAPTION_STYLE_KEYS = [
	"fontFamily",
	"fontSize",
	"fontWeight",
	"fontStyle",
	"color",
	"backgroundColor",
	"textAlign",
	"lineHeight",
	"letterSpacing",
	"strokeColor",
	"strokeWidth",
	"shadowColor",
	"shadowBlur",
	"transform.positionX",
	"transform.positionY",
] as const;

function planShell({
	request,
	context,
	title,
}: {
	request: string;
	context: SemanticEditContext;
	title: string;
}): Omit<
	SemanticEditPlan,
	"valid" | "assumptions" | "errors" | "expectedOutput" | "groups"
> {
	return {
		id: `plan-${context.state.revision}-${slug(title)}`,
		request,
		title,
		baseRevision: context.state.revision,
		projectId: context.state.projectId,
		createdAt: new Date().toISOString(),
	};
}

function failedPlan({
	request,
	context,
	title,
	error,
}: {
	request: string;
	context: SemanticEditContext;
	title: string;
	error: string;
}): SemanticEditPlan {
	return {
		...planShell({ request, context, title }),
		valid: false,
		assumptions: [],
		errors: [error],
		expectedOutput: "No mutation will run.",
		groups: [],
	};
}

function elementIndex(state: ProjectStateSummary) {
	const byRef = new Map<
		string,
		{ trackId: string; trackType: string; element: ElementSummary }
	>();
	for (const track of state.tracks) {
		for (const element of track.elements) {
			byRef.set(`${track.id}:${element.id}`, {
				trackId: track.id,
				trackType: track.type,
				element,
			});
		}
	}
	return byRef;
}

function finite(value: number | null): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function slug(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 32) || "edit"
	);
}

function targetOf({
	trackId,
	element,
}: {
	trackId: string;
	element: ElementSummary;
}): AgentPlanTarget {
	return { trackId, elementId: element.id, name: element.name };
}

function compileTighten({
	request,
	context,
}: {
	request: string;
	context: SemanticEditContext;
}): SemanticEditPlan {
	const title = "Tighten selected section";
	if (context.selectedElements.length < 2) {
		return failedPlan({
			request,
			context,
			title,
			error:
				"Tighten needs at least two selected timeline clips. Select the intended section and preview again.",
		});
	}
	const indexed = elementIndex(context.state);
	const selectedIds = new Set(
		context.selectedElements.map((ref) => `${ref.trackId}:${ref.elementId}`),
	);
	const selected = context.selectedElements.map((ref) => {
		const resolved = indexed.get(`${ref.trackId}:${ref.elementId}`);
		if (!resolved) {
			throw new Error(
				`Selected element ${ref.elementId} is no longer on track ${ref.trackId}.`,
			);
		}
		return resolved;
	});
	const byTrack = new Map<string, typeof selected>();
	for (const item of selected) {
		const entries = byTrack.get(item.trackId) ?? [];
		entries.push(item);
		byTrack.set(item.trackId, entries);
	}

	const groups: AgentPlanGroup[] = [];
	let totalGap = 0;
	for (const [trackId, entries] of byTrack) {
		entries.sort(
			(left, right) =>
				(left.element.startTimeSeconds ?? 0) -
					(right.element.startTimeSeconds ?? 0) ||
				left.element.id.localeCompare(right.element.id),
		);
		if (entries.length < 2) continue;
		let cursor =
			(entries[0].element.startTimeSeconds ?? 0) +
			(entries[0].element.durationSeconds ?? 0);
		const moves: Extract<Operation, { type: "element.move" }>["moves"] = [];
		const inverseMoves: Extract<Operation, { type: "element.move" }>["moves"] =
			[];
		const targets: AgentPlanTarget[] = [];
		let rangeStart = Number.POSITIVE_INFINITY;
		let rangeEnd = 0;
		let trackGap = 0;
		for (const entry of entries.slice(1)) {
			const start = entry.element.startTimeSeconds;
			const duration = entry.element.durationSeconds;
			if (!finite(start) || !finite(duration)) continue;
			const gap = start - cursor;
			if (gap > 1 / 120_000) {
				const blocking = context.state.tracks
					.find((track) => track.id === trackId)
					?.elements.find((element) => {
						if (selectedIds.has(`${trackId}:${element.id}`)) return false;
						const otherStart = element.startTimeSeconds;
						const otherEnd = element.endTimeSeconds;
						return (
							finite(otherStart) &&
							finite(otherEnd) &&
							cursor < otherEnd &&
							cursor + duration > otherStart
						);
					});
				if (blocking) {
					throw new Error(
						`Closing this gap would overlap unselected clip ${blocking.name}. Select the whole intended section or leave this gap unchanged.`,
					);
				}
				moves.push({
					trackId,
					elementId: entry.element.id,
					startTimeSeconds: cursor,
				});
				inverseMoves.push({
					trackId,
					elementId: entry.element.id,
					startTimeSeconds: start,
				});
				targets.push(targetOf({ trackId, element: entry.element }));
				rangeStart = Math.min(rangeStart, cursor);
				rangeEnd = Math.max(rangeEnd, start + duration);
				trackGap += gap;
			}
			// Preserve selected clip order. A clip that already overlaps does not
			// get pushed: "tighten" removes whitespace, never invents an overwrite.
			cursor = Math.max(cursor, start) + duration;
		}
		if (moves.length === 0) continue;
		totalGap += trackGap;
		groups.push({
			id: `tighten-${slug(trackId)}`,
			label: `Close ${trackGap.toFixed(2)}s gap on ${
				context.state.tracks.find((track) => track.id === trackId)?.name ??
				trackId
			}`,
			operation: { type: "element.move", moves },
			inverseOperation: { type: "element.move", moves: inverseMoves },
			targets,
			properties: ["startTimeSeconds"],
			affectedRange: {
				startSeconds: rangeStart,
				endSeconds: rangeEnd,
			},
			expectedEffect: `Move ${moves.length} clip(s) earlier without trimming or reordering them.`,
		});
	}
	if (groups.length === 0) {
		return failedPlan({
			request,
			context,
			title,
			error:
				"The selected clips contain no removable gap on the same track; the plan would have no effect.",
		});
	}
	return {
		...planShell({ request, context, title }),
		valid: true,
		assumptions: [
			"Preserve clip order and remove only gaps inside each selected track.",
			"Do not trim, overlap, ripple-delete, or move unselected clips.",
		],
		errors: [],
		expectedOutput: `Remove ${totalGap.toFixed(2)}s of selected-track whitespace across ${groups.length} change group(s).`,
		groups,
	};
}

function isCaption(element: ElementSummary): boolean {
	return (
		element.type === "text" &&
		(element.params?.["caption.enabled"] === true ||
			/^caption(?:\s|$)/i.test(element.name))
	);
}

function compileUnifyCaptions({
	request,
	context,
}: {
	request: string;
	context: SemanticEditContext;
}): SemanticEditPlan {
	const title = "Unify caption styling";
	const captions = context.state.tracks
		.flatMap((track) =>
			track.elements
				.filter(isCaption)
				.map((element) => ({ trackId: track.id, element })),
		)
		.sort(
			(left, right) =>
				(left.element.startTimeSeconds ?? 0) -
					(right.element.startTimeSeconds ?? 0) ||
				left.element.id.localeCompare(right.element.id),
		);
	if (captions.length < 2) {
		return failedPlan({
			request,
			context,
			title,
			error:
				"Unify captions needs at least two caption elements. Caption text is never used as style evidence.",
		});
	}
	const canonical = captions[0];
	const style: Record<string, number | string | boolean> = {};
	for (const key of CAPTION_STYLE_KEYS) {
		const value = canonical.element.params?.[key];
		if (
			typeof value === "number" ||
			typeof value === "string" ||
			typeof value === "boolean"
		) {
			style[key] = value;
		}
	}
	if (Object.keys(style).length === 0) {
		return failedPlan({
			request,
			context,
			title,
			error:
				"The first caption has no addressable visual style. Set its typography first, then preview again.",
		});
	}

	const groups: AgentPlanGroup[] = [];
	for (const candidate of captions.slice(1)) {
		const changedStyle = Object.fromEntries(
			Object.entries(style).filter(([key, value]) => {
				const previous = candidate.element.params?.[key];
				// A group-level inverse must restore the exact previous object.
				// setParams cannot express key deletion, so a style key absent
				// from the target is not silently introduced here.
				return (
					(typeof previous === "number" ||
						typeof previous === "string" ||
						typeof previous === "boolean") &&
					previous !== value
				);
			}),
		) as Record<string, number | string | boolean>;
		if (Object.keys(changedStyle).length === 0) continue;
		const previousStyle = Object.fromEntries(
			Object.keys(changedStyle).flatMap((key) => {
				const value = candidate.element.params?.[key];
				return typeof value === "number" ||
					typeof value === "string" ||
					typeof value === "boolean"
					? [[key, value]]
					: [];
			}),
		) as Record<string, number | string | boolean>;
		const start = candidate.element.startTimeSeconds;
		const end = candidate.element.endTimeSeconds;
		groups.push({
			id: `caption-style-${slug(candidate.element.id)}`,
			label: `Match ${candidate.element.name} to ${canonical.element.name}`,
			operation: {
				type: "element.setParams",
				trackId: candidate.trackId,
				elementId: candidate.element.id,
				params: changedStyle,
			},
			inverseOperation: {
				type: "element.setParams",
				trackId: candidate.trackId,
				elementId: candidate.element.id,
				params: previousStyle,
			},
			targets: [
				targetOf({
					trackId: candidate.trackId,
					element: candidate.element,
				}),
			],
			properties: Object.keys(changedStyle),
			affectedRange:
				finite(start) && finite(end)
					? { startSeconds: start, endSeconds: end }
					: null,
			expectedEffect: `Copy ${Object.keys(changedStyle).join(", ")}; preserve caption wording and timing.`,
		});
	}
	if (groups.length === 0) {
		return failedPlan({
			request,
			context,
			title,
			error: "All captions already match the first caption's visual style.",
		});
	}
	return {
		...planShell({ request, context, title }),
		valid: true,
		assumptions: [
			`${canonical.element.name} is the approved style reference because it is the first caption on the timeline.`,
			"Preserve caption wording, timing, track placement, and language metadata.",
			"Change only style keys already present on each target so every group has an exact inverse.",
		],
		errors: [],
		expectedOutput: `Match ${groups.length} caption(s) to ${canonical.element.name} without changing their text.`,
		groups,
	};
}

function compileRename({
	request,
	context,
	name,
}: {
	request: string;
	context: SemanticEditContext;
	name: string;
}): SemanticEditPlan {
	const title = "Rename selected clips";
	const indexed = elementIndex(context.state);
	const targets = context.selectedElements.flatMap((ref) => {
		const match = indexed.get(`${ref.trackId}:${ref.elementId}`);
		return match ? [match] : [];
	});
	if (targets.length === 0) {
		return failedPlan({
			request,
			context,
			title,
			error: "Rename needs at least one selected timeline clip.",
		});
	}
	const groups = targets
		.filter((target) => target.element.name !== name)
		.map((target) => ({
			id: `rename-${slug(target.element.id)}`,
			label: `Rename ${target.element.name}`,
			operation: {
				type: "element.rename",
				elements: [
					{
						trackId: target.trackId,
						elementId: target.element.id,
						name,
					},
				],
			} satisfies Operation,
			inverseOperation: {
				type: "element.rename",
				elements: [
					{
						trackId: target.trackId,
						elementId: target.element.id,
						name: target.element.name,
					},
				],
			} satisfies Operation,
			targets: [
				targetOf({
					trackId: target.trackId,
					element: target.element,
				}),
			],
			properties: ["name"],
			affectedRange:
				finite(target.element.startTimeSeconds) &&
				finite(target.element.endTimeSeconds)
					? {
							startSeconds: target.element.startTimeSeconds,
							endSeconds: target.element.endTimeSeconds,
						}
					: null,
			expectedEffect: `Rename the clip to “${name}”; preserve media, timing, effects, and animation.`,
		}));
	if (groups.length === 0) {
		return failedPlan({
			request,
			context,
			title,
			error: `Every selected clip is already named “${name}”.`,
		});
	}
	return {
		...planShell({ request, context, title }),
		valid: true,
		assumptions: [
			"Apply the requested name literally to every selected clip.",
			"Do not rename source media or tracks.",
		],
		errors: [],
		expectedOutput: `Rename ${groups.length} selected clip(s) to “${name}”.`,
		groups,
	};
}

/**
 * Deterministic semantic compiler.
 *
 * It intentionally supports a small, explicit vocabulary. An unrecognised or
 * underspecified request fails closed instead of handing prose to a state
 * mutator. Every successful plan is complete enough to display and reverse
 * before the first command runs.
 */
export function compileSemanticEdit({
	request,
	context,
}: {
	request: string;
	context: SemanticEditContext;
}): SemanticEditPlan {
	const normalized = request.trim();
	if (
		/\b(tighten|close (?:the )?gaps?)\b/i.test(normalized) ||
		/(收紧|压紧|消除空隙)/.test(normalized)
	) {
		try {
			return compileTighten({ request: normalized, context });
		} catch (error) {
			return failedPlan({
				request: normalized,
				context,
				title: "Tighten selected section",
				error: error instanceof Error ? error.message : "Selection is stale.",
			});
		}
	}
	if (
		/\b(?:unify|match|standardize)\b.*\bcaptions?\b/i.test(normalized) ||
		/(统一|匹配|规范).*(字幕)/.test(normalized)
	) {
		return compileUnifyCaptions({ request: normalized, context });
	}
	const rename = normalized.match(
		/^(?:rename|name) (?:the )?(?:selected clips?|selection) (?:to|as)\s+["“]?(.+?)["”]?$/i,
	);
	if (rename?.[1]?.trim()) {
		return compileRename({
			request: normalized,
			context,
			name: rename[1].trim(),
		});
	}
	return failedPlan({
		request: normalized,
		context,
		title: "Unsupported semantic request",
		error:
			"Supported requests: “tighten this section” (select 2+ clips), “unify captions”, or “rename selected clips to …”. No edit was made.",
	});
}

export interface AgentPropertyChange {
	trackId: string;
	elementId: string;
	name: string;
	property: string;
	before: unknown;
	after: unknown;
}

export interface AgentReviewGroup {
	groupId: string;
	label: string;
	effect: "changed" | "partial" | "no-effect" | "missing";
	changes: AgentPropertyChange[];
	missingTargets: AgentPlanTarget[];
}

export interface AgentChangeReview {
	planId: string;
	fromRevision: number;
	toRevision: number;
	complete: boolean;
	groups: AgentReviewGroup[];
}

function findElement({
	state,
	target,
}: {
	state: ProjectStateSummary;
	target: AgentPlanTarget;
}): ElementSummary | null {
	return (
		state.tracks
			.find((track) => track.id === target.trackId)
			?.elements.find((element) => element.id === target.elementId) ?? null
	);
}

function propertyValue({
	element,
	property,
}: {
	element: ElementSummary;
	property: string;
}): unknown {
	if (property === "name") return element.name;
	if (property === "startTimeSeconds") return element.startTimeSeconds;
	if (property === "durationSeconds") return element.durationSeconds;
	return element.params?.[property];
}

/** Compare the plan's declared addresses/properties against the real post-state. */
export function buildChangeReview({
	plan,
	before,
	after,
}: {
	plan: SemanticEditPlan;
	before: ProjectStateSummary;
	after: ProjectStateSummary;
}): AgentChangeReview {
	const groups = plan.groups.map((group): AgentReviewGroup => {
		const changes: AgentPropertyChange[] = [];
		const missingTargets: AgentPlanTarget[] = [];
		let expected = 0;
		for (const target of group.targets) {
			const beforeElement = findElement({ state: before, target });
			const afterElement = findElement({ state: after, target });
			if (!beforeElement || !afterElement) {
				missingTargets.push(target);
				continue;
			}
			for (const property of group.properties) {
				expected += 1;
				const previous = propertyValue({ element: beforeElement, property });
				const next = propertyValue({ element: afterElement, property });
				if (!Object.is(previous, next)) {
					changes.push({
						trackId: target.trackId,
						elementId: target.elementId,
						name: target.name,
						property,
						before: previous,
						after: next,
					});
				}
			}
		}
		const effect =
			missingTargets.length > 0
				? "missing"
				: changes.length === 0
					? "no-effect"
					: changes.length < expected
						? "partial"
						: "changed";
		return {
			groupId: group.id,
			label: group.label,
			effect,
			changes,
			missingTargets,
		};
	});
	return {
		planId: plan.id,
		fromRevision: before.revision,
		toRevision: after.revision,
		complete:
			groups.length > 0 && groups.every((group) => group.effect === "changed"),
		groups,
	};
}

export interface AgentAudioQc {
	checkedElements: number;
	hotElements: Array<{
		trackId: string;
		elementId: string;
		gainDb: number;
	}>;
	mutedTracksWithContent: Array<{ trackId: string; elementCount: number }>;
}

export interface AgentQcCheck {
	id: "structural" | "visual" | "audio" | "export";
	label: string;
	status: "pass" | "warning" | "fail";
	summary: string;
	evidenceCount: number;
}

export interface AgentCorrectionItem {
	id: string;
	source: AgentQcCheck["id"];
	severity: ProjectHealthSeverity;
	message: string;
	trackId?: string;
	elementId?: string;
	atSeconds?: number;
}

export interface AgentQcSummary {
	revision: number;
	ready: boolean;
	checks: AgentQcCheck[];
	correctionPass: AgentCorrectionItem[];
}

function qcStatus({
	errors,
	warnings,
}: {
	errors: number;
	warnings: number;
}): AgentQcCheck["status"] {
	return errors > 0 ? "fail" : warnings > 0 ? "warning" : "pass";
}

/**
 * Merge independently produced evidence. This function does not claim to
 * "look" at a frame: it records exact renderer failures and exposes the contact
 * sheet to the human/agent reviewer in the UI.
 */
export function buildAgentQcSummary({
	revision,
	health,
	render,
	audio,
	exportVerification,
}: {
	revision: number;
	health: ProjectHealthResult;
	render: RenderFramesResult;
	audio: AgentAudioQc;
	exportVerification: ExportPreflightResult;
}): AgentQcSummary {
	const renderFailures = render.frames.filter(
		(
			frame,
		): frame is Extract<(typeof render.frames)[number], { error: string }> =>
			"error" in frame,
	);
	const successfulRenderSamples = render.frames.reduce(
		(total, frame) =>
			total + ("error" in frame ? 0 : (frame.tile?.cells.length ?? 1)),
		0,
	);
	const renderSampleCount = successfulRenderSamples + renderFailures.length;
	const renderRevisionError = render.revision !== revision || !render.stable;
	const exportErrors = exportVerification.findings.filter(
		(finding) => finding.severity === "error",
	);
	const exportWarnings = exportVerification.findings.filter(
		(finding) => finding.severity === "warning",
	);
	const audioWarnings =
		audio.hotElements.length + audio.mutedTracksWithContent.length;
	const checks: AgentQcCheck[] = [
		{
			id: "structural",
			label: "Structural lint",
			status: qcStatus({
				errors: health.counts.error,
				warnings: health.counts.warning,
			}),
			summary: `${health.counts.error} errors · ${health.counts.warning} warnings · ${health.counts.note} notes`,
			evidenceCount: health.findings.length,
		},
		{
			id: "visual",
			label: "Representative frames",
			status:
				renderFailures.length > 0 || renderRevisionError ? "fail" : "pass",
			summary: renderRevisionError
				? `Evidence revision mismatch: expected ${revision}, rendered ${render.revision}${render.stable ? "" : " during an edit"}`
				: `${successfulRenderSamples}/${renderSampleCount} samples rendered from revision ${render.revision}`,
			evidenceCount: renderSampleCount,
		},
		{
			id: "audio",
			label: "Audio checks",
			status: audioWarnings > 0 ? "warning" : "pass",
			summary: `${audio.checkedElements} audio-bearing clips · ${audio.hotElements.length} above 0 dB · ${audio.mutedTracksWithContent.length} muted tracks with content`,
			evidenceCount: audio.checkedElements,
		},
		{
			id: "export",
			label: "Export verification",
			status: qcStatus({
				errors: exportErrors.length,
				warnings: exportWarnings.length,
			}),
			summary: `${exportVerification.checkedSamples} render samples · ${exportErrors.length} blocking · ${exportWarnings.length} warnings`,
			evidenceCount: exportVerification.findings.length,
		},
	];
	const correctionPass: AgentCorrectionItem[] = [
		...health.findings.map((finding) => ({
			id: `structural:${finding.id}`,
			source: "structural" as const,
			severity: finding.severity,
			message: finding.message,
			...(finding.trackId ? { trackId: finding.trackId } : {}),
			...(finding.elementId ? { elementId: finding.elementId } : {}),
			...(finding.atSeconds === undefined
				? {}
				: { atSeconds: finding.atSeconds }),
		})),
		...renderFailures.map((frame) => ({
			id: `visual:${frame.atSeconds}`,
			source: "visual" as const,
			severity: "error" as const,
			message: frame.error,
			atSeconds: frame.atSeconds,
		})),
		...(renderRevisionError
			? [
					{
						id: "visual:revision",
						source: "visual" as const,
						severity: "error" as const,
						message: "Re-render after the timeline stops changing.",
					},
				]
			: []),
		...audio.hotElements.map((element) => ({
			id: `audio:${element.elementId}`,
			source: "audio" as const,
			severity: "warning" as const,
			message: `Gain is +${element.gainDb.toFixed(1)} dB; inspect peaks and clipping.`,
			trackId: element.trackId,
			elementId: element.elementId,
		})),
		...audio.mutedTracksWithContent.map((track) => ({
			id: `audio:muted:${track.trackId}`,
			source: "audio" as const,
			severity: "note" as const,
			message: `Muted track contains ${track.elementCount} clip(s).`,
			trackId: track.trackId,
		})),
		...exportVerification.findings
			.filter((finding) => finding.source === "encoding")
			.map((finding) => ({
				id: `export:${finding.id}`,
				source: "export" as const,
				severity: finding.severity,
				message: finding.message,
				...(finding.trackId ? { trackId: finding.trackId } : {}),
				...(finding.elementId ? { elementId: finding.elementId } : {}),
				...(finding.atSeconds === undefined
					? {}
					: { atSeconds: finding.atSeconds }),
			})),
	];
	return {
		revision,
		ready: checks.every((check) => check.status !== "fail"),
		checks,
		correctionPass,
	};
}
