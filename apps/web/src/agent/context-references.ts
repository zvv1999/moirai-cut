import type { ProjectStateSummary } from "./agent-manager";
import type { ElementRefInput } from "./operations";

const CONTEXT_SCHEME = "opencut:";
const CONTEXT_HOST = "project";
const PATH_TIME_PRECISION = 3;

export interface AgentElementContextReference {
	kind: "element";
	uri: string;
	label: string;
	projectId: string;
	sceneId: string;
	trackId: string;
	trackName: string;
	elementId: string;
	elementType: string;
	startSeconds: number;
	endSeconds: number;
}

export interface AgentRangeContextReference {
	kind: "range";
	uri: string;
	label: string;
	projectId: string;
	sceneId: string;
	startSeconds: number;
	endSeconds: number;
	elements: ElementRefInput[];
}

export type AgentContextReference =
	| AgentElementContextReference
	| AgentRangeContextReference;

export type ParsedAgentContextReference =
	| {
			kind: "element";
			projectId: string;
			sceneId: string;
			trackId: string;
			elementId: string;
	  }
	| {
			kind: "range";
			projectId: string;
			sceneId: string;
			startSeconds: number;
			endSeconds: number;
	  };

export interface AgentContextSnapshot {
	revision: number;
	projectId: string;
	sceneId: string;
	playheadSeconds: number;
	source: "pinned" | "live-selection" | "empty";
	references: AgentContextReference[];
	liveSelection: AgentElementContextReference[];
	promptContext: string;
}

export interface AgentContextRevealTarget {
	kind: AgentContextReference["kind"];
	seekSeconds: number;
	selectedElements: ElementRefInput[];
}

export class InvalidAgentContextReferenceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InvalidAgentContextReferenceError";
	}
}

function requiredAddress(state: ProjectStateSummary): {
	projectId: string;
	sceneId: string;
} {
	if (!state.projectId || !state.sceneId) {
		throw new InvalidAgentContextReferenceError("当前没有可寻址的工程或场景。");
	}
	return { projectId: state.projectId, sceneId: state.sceneId };
}

function segment(value: string): string {
	return encodeURIComponent(value);
}

function finiteTime({ name, value }: { name: string; value: number }): number {
	if (!Number.isFinite(value) || value < 0) {
		throw new InvalidAgentContextReferenceError(
			`${name} 必须是非负的有限秒数。`,
		);
	}
	return value;
}

function elementUri({
	projectId,
	sceneId,
	trackId,
	elementId,
}: {
	projectId: string;
	sceneId: string;
	trackId: string;
	elementId: string;
}): string {
	return [
		"opencut://project",
		segment(projectId),
		"scene",
		segment(sceneId),
		"track",
		segment(trackId),
		"element",
		segment(elementId),
	].join("/");
}

function rangeUri({
	projectId,
	sceneId,
	startSeconds,
	endSeconds,
}: {
	projectId: string;
	sceneId: string;
	startSeconds: number;
	endSeconds: number;
}): string {
	return [
		"opencut://project",
		segment(projectId),
		"scene",
		segment(sceneId),
		"timeline/range",
	]
		.join("/")
		.concat(
			`?start=${startSeconds.toFixed(PATH_TIME_PRECISION)}&end=${endSeconds.toFixed(PATH_TIME_PRECISION)}`,
		);
}

function findElement({
	state,
	trackId,
	elementId,
}: {
	state: ProjectStateSummary;
	trackId: string;
	elementId: string;
}) {
	const track = state.tracks.find((candidate) => candidate.id === trackId);
	const element = track?.elements.find(
		(candidate) => candidate.id === elementId,
	);
	return track && element ? { track, element } : null;
}

function intersectingElements({
	state,
	startSeconds,
	endSeconds,
}: {
	state: ProjectStateSummary;
	startSeconds: number;
	endSeconds: number;
}): ElementRefInput[] {
	return state.tracks.flatMap((track) =>
		track.elements.flatMap((element) => {
			const elementStart = element.startTimeSeconds;
			const elementEnd = element.endTimeSeconds;
			if (
				elementStart === null ||
				elementEnd === null ||
				elementStart >= endSeconds ||
				elementEnd <= startSeconds
			) {
				return [];
			}
			return [{ trackId: track.id, elementId: element.id }];
		}),
	);
}

export function buildElementContextReferences({
	state,
	selectedElements,
}: {
	state: ProjectStateSummary;
	selectedElements: ElementRefInput[];
}): AgentElementContextReference[] {
	const { projectId, sceneId } = requiredAddress(state);
	const seen = new Set<string>();
	const references: AgentElementContextReference[] = [];

	for (const selected of selectedElements) {
		const key = `${selected.trackId}\0${selected.elementId}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const found = findElement({ state, ...selected });
		if (!found) continue;
		const startSeconds = found.element.startTimeSeconds;
		const endSeconds = found.element.endTimeSeconds;
		if (startSeconds === null || endSeconds === null) continue;
		references.push({
			kind: "element",
			uri: elementUri({ projectId, sceneId, ...selected }),
			label: found.element.name,
			projectId,
			sceneId,
			trackId: selected.trackId,
			trackName: found.track.name ?? found.track.type,
			elementId: selected.elementId,
			elementType: found.element.type,
			startSeconds,
			endSeconds,
		});
	}
	return references;
}

export function buildTimelineRangeReference({
	state,
	startSeconds,
	endSeconds,
}: {
	state: ProjectStateSummary;
	startSeconds: number;
	endSeconds: number;
}): AgentRangeContextReference {
	const { projectId, sceneId } = requiredAddress(state);
	const start = finiteTime({ name: "开始时间", value: startSeconds });
	const end = finiteTime({ name: "结束时间", value: endSeconds });
	if (end <= start) {
		throw new InvalidAgentContextReferenceError("结束时间必须晚于开始时间。");
	}
	return {
		kind: "range",
		uri: rangeUri({
			projectId,
			sceneId,
			startSeconds: start,
			endSeconds: end,
		}),
		label: `${start.toFixed(2)}–${end.toFixed(2)} 秒`,
		projectId,
		sceneId,
		startSeconds: start,
		endSeconds: end,
		elements: intersectingElements({
			state,
			startSeconds: start,
			endSeconds: end,
		}),
	};
}

function xml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

export function serializeAgentContext({
	state,
	references,
	playheadSeconds,
}: {
	state: ProjectStateSummary;
	references: AgentContextReference[];
	playheadSeconds: number;
}): string {
	const { projectId, sceneId } = requiredAddress(state);
	const lines = [
		`<opencut-context project="${xml(projectId)}" scene="${xml(sceneId)}" revision="${state.revision}" playhead="${playheadSeconds.toFixed(3)}s">`,
	];
	for (const reference of references) {
		if (reference.kind === "element") {
			lines.push(
				`  <element path="${xml(reference.uri)}" label="${xml(reference.label)}" type="${xml(reference.elementType)}" time="${reference.startSeconds.toFixed(3)}-${reference.endSeconds.toFixed(3)}s"><![CDATA[${reference.uri}]]></element>`,
			);
			continue;
		}
		lines.push(
			`  <range path="${xml(reference.uri)}" time="${reference.startSeconds.toFixed(3)}-${reference.endSeconds.toFixed(3)}s" elements="${reference.elements.length}"><![CDATA[${reference.uri}]]></range>`,
		);
	}
	lines.push("</opencut-context>");
	return lines.join("\n");
}

export function buildAgentContextSnapshot({
	state,
	pinnedReferences,
	selectedElements,
	playheadSeconds,
}: {
	state: ProjectStateSummary;
	pinnedReferences: AgentContextReference[];
	selectedElements: ElementRefInput[];
	playheadSeconds: number;
}): AgentContextSnapshot {
	const { projectId, sceneId } = requiredAddress(state);
	const validPinned = pinnedReferences.filter(
		(reference) =>
			reference.projectId === projectId && reference.sceneId === sceneId,
	);
	const liveSelection = buildElementContextReferences({
		state,
		selectedElements,
	});
	const references = validPinned.length > 0 ? validPinned : liveSelection;
	const source =
		validPinned.length > 0
			? "pinned"
			: liveSelection.length > 0
				? "live-selection"
				: "empty";
	return {
		revision: state.revision,
		projectId,
		sceneId,
		playheadSeconds,
		source,
		references,
		liveSelection,
		promptContext: serializeAgentContext({
			state,
			references,
			playheadSeconds,
		}),
	};
}

function decodedSegments(url: URL): string[] {
	try {
		return url.pathname
			.split("/")
			.filter(Boolean)
			.map((value) => decodeURIComponent(value));
	} catch {
		throw new InvalidAgentContextReferenceError("Codex Path 包含无效转义。");
	}
}

export function parseAgentContextUri(uri: string): ParsedAgentContextReference {
	let url: URL;
	try {
		url = new URL(uri);
	} catch {
		throw new InvalidAgentContextReferenceError("Codex Path 不是有效 URI。");
	}
	if (url.protocol !== CONTEXT_SCHEME || url.hostname !== CONTEXT_HOST) {
		throw new InvalidAgentContextReferenceError(
			"Codex Path 必须使用 opencut://project。",
		);
	}
	const parts = decodedSegments(url);
	const projectId = parts[0];
	const sceneId = parts[2];
	if (parts[1] !== "scene" || !projectId || !sceneId) {
		throw new InvalidAgentContextReferenceError("Codex Path 缺少工程或场景。");
	}
	if (
		parts.length === 7 &&
		parts[3] === "track" &&
		parts[5] === "element" &&
		parts[4] &&
		parts[6]
	) {
		return {
			kind: "element",
			projectId,
			sceneId,
			trackId: parts[4],
			elementId: parts[6],
		};
	}
	if (parts.length === 5 && parts[3] === "timeline" && parts[4] === "range") {
		const startValue = url.searchParams.get("start");
		const endValue = url.searchParams.get("end");
		if (startValue === null || endValue === null) {
			throw new InvalidAgentContextReferenceError(
				"Codex Path 缺少时间范围。",
			);
		}
		const startSeconds = Number(startValue);
		const endSeconds = Number(endValue);
		finiteTime({ name: "开始时间", value: startSeconds });
		finiteTime({ name: "结束时间", value: endSeconds });
		if (endSeconds <= startSeconds) {
			throw new InvalidAgentContextReferenceError(
				"Codex Path 的时间范围无效。",
			);
		}
		return {
			kind: "range",
			projectId,
			sceneId,
			startSeconds,
			endSeconds,
		};
	}
	throw new InvalidAgentContextReferenceError("Codex Path 类型不受支持。");
}

export function resolveAgentContextTarget({
	state,
	uri,
}: {
	state: ProjectStateSummary;
	uri: string;
}): AgentContextRevealTarget {
	const current = requiredAddress(state);
	const parsed = parseAgentContextUri(uri);
	if (parsed.projectId !== current.projectId) {
		throw new InvalidAgentContextReferenceError(
			"该 Codex Path 指向另一个工程，已拒绝定位。",
		);
	}
	if (parsed.sceneId !== current.sceneId) {
		throw new InvalidAgentContextReferenceError(
			"该 Codex Path 指向另一个场景，请先切换场景。",
		);
	}
	if (parsed.kind === "element") {
		const found = findElement({ state, ...parsed });
		if (!found || found.element.startTimeSeconds === null) {
			throw new InvalidAgentContextReferenceError(
				"该素材已不存在，Codex Path 已失效。",
			);
		}
		return {
			kind: "element",
			seekSeconds: found.element.startTimeSeconds,
			selectedElements: [
				{ trackId: parsed.trackId, elementId: parsed.elementId },
			],
		};
	}
	return {
		kind: "range",
		seekSeconds: parsed.startSeconds,
		selectedElements: intersectingElements({
			state,
			startSeconds: parsed.startSeconds,
			endSeconds: parsed.endSeconds,
		}),
	};
}
