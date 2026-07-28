"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import {
	buildAgentQcSummary,
	buildChangeReview,
	compileSemanticEdit,
	type AgentChangeReview,
	type AgentQcSummary,
	type SemanticEditPlan,
} from "@/agent/workflow";
import type { RenderFramesResult } from "@/agent/agent-manager";
import {
	buildExportPreflight,
	createExportDraftFromPreset,
	detectExportCapabilities,
	validateExportDraft,
} from "@/export/workflow";
import { runProjectHealthCheck } from "@/project/project-health";
import { TICKS_PER_SECOND } from "@/wasm";

type PlanDecision = "included" | "excluded";
type ReviewDecision = "pending" | "accepted" | "rejected" | "reverted";

interface QcRun {
	summary: AgentQcSummary;
	render: RenderFramesResult;
	ranAt: string;
}

function canvasSizeOf(value: unknown): { width: number; height: number } {
	if (
		value &&
		typeof value === "object" &&
		"width" in value &&
		"height" in value &&
		typeof value.width === "number" &&
		typeof value.height === "number"
	) {
		return { width: value.width, height: value.height };
	}
	return { width: 1920, height: 1080 };
}

function statusClass(status: "pass" | "warning" | "fail"): string {
	if (status === "pass") {
		return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
	}
	if (status === "warning") {
		return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
	}
	return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
}

function formatRange(
	range: { startSeconds: number; endSeconds: number } | null,
) {
	if (!range) return "Project scope";
	return `${range.startSeconds.toFixed(2)}s–${range.endSeconds.toFixed(2)}s`;
}

function contactSheet(render: RenderFramesResult): string | null {
	const tiled = render.frames.find(
		(frame) => !("error" in frame) && typeof frame.jpegBase64 === "string",
	);
	return tiled && !("error" in tiled) && tiled.jpegBase64
		? `data:image/jpeg;base64,${tiled.jpegBase64}`
		: null;
}

function primitive(value: unknown): number | string | boolean | undefined {
	return typeof value === "number" ||
		typeof value === "string" ||
		typeof value === "boolean"
		? value
		: undefined;
}

export function AgentWorkbench() {
	const editor = useEditor();
	const selectedElements = useEditor((instance) =>
		instance.selection.getSelectedElements(),
	);
	const [request, setRequest] = useState("tighten this section");
	const [plan, setPlan] = useState<SemanticEditPlan | null>(null);
	const [planDecision, setPlanDecision] = useState<
		Record<string, PlanDecision>
	>({});
	const [review, setReview] = useState<AgentChangeReview | null>(null);
	const [reviewDecision, setReviewDecision] = useState<
		Record<string, ReviewDecision>
	>({});
	const [executing, setExecuting] = useState(false);
	const [qcRunning, setQcRunning] = useState(false);
	const [qc, setQc] = useState<QcRun | null>(null);
	const semanticState = editor.agent.getState();
	const semanticElementCount = semanticState.tracks.reduce(
		(total, track) => total + track.elementCount,
		0,
	);
	const semanticTextCount = semanticState.tracks.reduce(
		(total, track) =>
			total +
			track.elements.filter((element) => element.type === "text").length,
		0,
	);
	const semanticKeyframeCount = semanticState.tracks.reduce(
		(total, track) =>
			total +
			track.elements.reduce(
				(elementTotal, element) =>
					elementTotal +
					Object.values(element.animations ?? {}).reduce(
						(channelTotal, keys) => channelTotal + keys.length,
						0,
					),
				0,
			),
		0,
	);

	const selectedLabel =
		selectedElements.length === 0
			? "No clips selected"
			: `${selectedElements.length} clip${selectedElements.length === 1 ? "" : "s"} selected`;

	const preview = (nextRequest = request) => {
		const next = compileSemanticEdit({
			request: nextRequest,
			context: {
				state: editor.agent.getState(),
				selectedElements,
			},
		});
		setRequest(nextRequest);
		setPlan(next);
		setPlanDecision(
			Object.fromEntries(next.groups.map((group) => [group.id, "included"])),
		);
		setReview(null);
		setReviewDecision({});
		if (!next.valid) {
			toast.error("Plan needs attention", { description: next.errors[0] });
		}
	};

	const executePlan = async () => {
		if (!plan?.valid) return;
		const groups = plan.groups.filter(
			(group) => planDecision[group.id] !== "excluded",
		);
		if (groups.length === 0) {
			toast.error("Every change group is excluded");
			return;
		}
		const appliedPlan = { ...plan, groups };
		const before = editor.agent.getState();
		setExecuting(true);
		try {
			const result = editor.agent.applyPlan({
				operations: groups.map((group) => group.operation),
				baseRevision: plan.baseRevision,
				idempotencyKey: `${plan.id}:${groups.map((group) => group.id).join(",")}`,
				...(plan.projectId ? { expectedProjectId: plan.projectId } : {}),
			});
			const after = editor.agent.getState();
			const nextReview = buildChangeReview({
				plan: appliedPlan,
				before,
				after,
			});
			setPlan(appliedPlan);
			setReview(nextReview);
			setReviewDecision(
				Object.fromEntries(
					nextReview.groups.map((group) => [group.groupId, "pending"]),
				),
			);
			if (!result.applied || !nextReview.complete) {
				toast.warning("Plan completed with review findings", {
					description: result.noEffect
						? "The command had no effect."
						: "At least one declared property did not change.",
				});
			} else {
				toast.success(`Applied ${groups.length} reviewed change group(s)`, {
					description: `Revision ${result.revision} · one shared undo entry`,
				});
			}
		} catch (error) {
			toast.error("Plan was not applied", {
				description:
					error instanceof Error
						? error.message
						: "The project changed; preview again.",
			});
		} finally {
			setExecuting(false);
		}
	};

	const acceptGroup = (groupId: string) => {
		setReviewDecision((current) => ({
			...current,
			[groupId]: "accepted",
		}));
	};

	const reverseGroup = ({
		groupId,
		decision,
	}: {
		groupId: string;
		decision: "rejected" | "reverted";
	}) => {
		const activePlan = plan;
		const group = activePlan?.groups.find(
			(candidate) => candidate.id === groupId,
		);
		if (!activePlan || !group) return;
		try {
			const result = editor.agent.applyOperation({
				operation: group.inverseOperation,
				baseRevision: editor.agent.revision,
				idempotencyKey: `${activePlan.id}:${groupId}:${decision}`,
				...(activePlan.projectId
					? { expectedProjectId: activePlan.projectId }
					: {}),
			});
			if (!result.applied) {
				toast.error("The inverse operation had no effect");
				return;
			}
			setReviewDecision((current) => ({
				...current,
				[groupId]: decision,
			}));
			toast.success(
				decision === "rejected"
					? "Group rejected and reversed"
					: "Group reverted",
				{ description: `Revision ${result.revision} · undo remains available` },
			);
		} catch (error) {
			toast.error("Could not reverse this group", {
				description:
					error instanceof Error ? error.message : "Preview the project again.",
			});
		}
	};

	const runQc = async () => {
		const state = editor.agent.getState();
		const canvasSize = canvasSizeOf(state.settings.canvasSize);
		const tracks = state.tracks.map((track) => ({
			id: track.id,
			name: track.name ?? `${track.type} track`,
			type: track.type,
			...(track.type === "main" || track.id === state.tracks[0]?.id
				? { role: "main" as const }
				: {}),
			...(track.muted === undefined ? {} : { muted: track.muted }),
			...(track.hidden === undefined ? {} : { hidden: track.hidden }),
			elements: track.elements.map((element) => ({
				id: element.id,
				name: element.name,
				type: element.type,
				startTime: (element.startTimeSeconds ?? 0) * TICKS_PER_SECOND,
				duration: (element.durationSeconds ?? 0) * TICKS_PER_SECOND,
				trimStart: (element.trimStartSeconds ?? 0) * TICKS_PER_SECOND,
				...(element.mediaId ? { mediaId: element.mediaId } : {}),
				params: { ...(element.params ?? {}) },
			})),
		}));
		const health = runProjectHealthCheck({
			project: { canvasSize, tracks },
			media: state.media.map((asset) => ({
				id: asset.id,
				...(asset.durationSeconds === null
					? {}
					: { durationSeconds: asset.durationSeconds }),
			})),
		});
		const durationSeconds = Math.max(
			0,
			...state.tracks.flatMap((track) =>
				track.elements.map((element) => element.endTimeSeconds ?? 0),
			),
		);
		const frameDuration = state.fps ? 1 / state.fps.decimal : 1 / 30;
		const sampleTimes = [
			0,
			durationSeconds / 2,
			Math.max(0, durationSeconds - frameDuration),
		].filter(
			(value, index, values) =>
				Number.isFinite(value) &&
				values.findIndex((candidate) => Math.abs(candidate - value) < 0.001) ===
					index,
		);
		setQcRunning(true);
		try {
			const render = await editor.agent.renderFrames({
				atSeconds: sampleTimes,
				tile: true,
				maxDim: 320,
			});
			const audio = {
				checkedElements: state.tracks.reduce(
					(total, track) =>
						total +
						track.elements.filter(
							(element) => element.type === "audio" || element.type === "video",
						).length,
					0,
				),
				hotElements: state.tracks.flatMap((track) =>
					track.elements.flatMap((element) => {
						const gainDb = primitive(element.params?.volume);
						return (element.type === "audio" || element.type === "video") &&
							typeof gainDb === "number" &&
							gainDb > 0
							? [{ trackId: track.id, elementId: element.id, gainDb }]
							: [];
					}),
				),
				mutedTracksWithContent: state.tracks.flatMap((track) =>
					track.muted && track.elementCount > 0
						? [{ trackId: track.id, elementCount: track.elementCount }]
						: [],
				),
			};
			const draft = createExportDraftFromPreset({
				presetId: "source",
				source: {
					width: canvasSize.width,
					height: canvasSize.height,
					fps: state.fps
						? {
								numerator: state.fps.numerator,
								denominator: state.fps.denominator,
							}
						: { numerator: 30, denominator: 1 },
				},
			});
			const capabilities = await detectExportCapabilities({ draft });
			const encodingIssues = validateExportDraft({
				draft,
				capabilities,
				timelineDurationSeconds: durationSeconds,
			});
			const failedTimes = new Map(
				render.frames.flatMap((frame) =>
					"error" in frame ? [[frame.atSeconds, frame.error] as const] : [],
				),
			);
			const exportVerification = buildExportPreflight({
				health,
				renderSamples: sampleTimes.map((atSeconds) => ({
					atSeconds,
					success: !failedTimes.has(atSeconds),
					...(failedTimes.has(atSeconds)
						? { error: failedTimes.get(atSeconds) }
						: {}),
				})),
				encodingIssues,
			});
			setQc({
				summary: buildAgentQcSummary({
					revision: state.revision,
					health,
					render,
					audio,
					exportVerification,
				}),
				render,
				ranAt: new Date().toISOString(),
			});
		} catch (error) {
			toast.error("Agent preflight failed", {
				description:
					error instanceof Error ? error.message : "Could not render evidence.",
			});
		} finally {
			setQcRunning(false);
		}
	};

	const sheet = useMemo(() => (qc ? contactSheet(qc.render) : null), [qc]);

	return (
		<section
			className="border-primary/20 bg-primary/[0.035] mb-3 rounded-lg border p-2.5"
			aria-label="Agent editing studio"
		>
			<div className="mb-2 flex items-start justify-between gap-3">
				<div>
					<div className="text-xs font-semibold">Agent Studio</div>
					<div className="text-[10px] opacity-55">
						Plan → review → shared commands → visual proof
					</div>
				</div>
				<div className="border-primary/20 bg-background rounded-full border px-2 py-0.5 font-mono text-[9px]">
					rev {editor.agent.revision} · {selectedLabel}
				</div>
			</div>

			<div className="flex gap-1">
				<input
					aria-label="Describe an agent edit"
					className="border-input bg-background min-w-0 flex-1 rounded-md border px-2 py-1.5 text-xs"
					value={request}
					onChange={(event) => setRequest(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") preview();
					}}
					placeholder="e.g. tighten this section"
				/>
				<button
					type="button"
					className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-[11px] font-medium"
					onClick={() => preview()}
				>
					Preview plan
				</button>
			</div>
			<div className="mt-1.5 flex flex-wrap gap-1">
				{[
					"tighten this section",
					"unify captions",
					"rename selected clips to Hero",
				].map((preset) => (
					<button
						key={preset}
						type="button"
						className="border-border bg-background rounded border px-1.5 py-0.5 text-[9px] opacity-70 hover:opacity-100"
						onClick={() => preview(preset)}
					>
						{preset}
					</button>
				))}
			</div>
			<div className="border-border bg-background/60 mt-2 rounded-md border px-2 py-1.5">
				<div className="flex items-center justify-between gap-2">
					<span className="text-[9px] font-semibold tracking-wide uppercase opacity-50">
						Semantic address space
					</span>
					<span className="font-mono text-[8px] opacity-45">
						CAS · idempotent · no-effect verified
					</span>
				</div>
				<div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[8px] opacity-70">
					<span>{semanticState.media.length} media</span>
					<span>{semanticState.tracks.length} tracks</span>
					<span>{semanticElementCount} clips</span>
					<span>{semanticTextCount} text</span>
					<span>{semanticKeyframeCount} keyframes</span>
					<span>{semanticState.bookmarks.length} markers</span>
					<span>
						{qc
							? `${qc.summary.correctionPass.length} addressable issues`
							: "issues after QC"}
					</span>
				</div>
				<div className="mt-1 text-[8px] opacity-45">
					Every applied plan becomes one shared undo entry; rejected groups use
					the same command gate.
				</div>
			</div>

			{plan ? (
				<div className="border-border bg-background/70 mt-2 rounded-md border p-2">
					<div className="flex items-center justify-between gap-2">
						<div>
							<div className="text-[11px] font-semibold">{plan.title}</div>
							<div className="font-mono text-[9px] opacity-50">
								base rev {plan.baseRevision} · {plan.groups.length} groups ·{" "}
								{plan.groups.reduce(
									(total, group) => total + group.targets.length,
									0,
								)}{" "}
								targets
							</div>
						</div>
						<span
							className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
								plan.valid
									? "bg-emerald-500/10 text-emerald-600"
									: "bg-red-500/10 text-red-600"
							}`}
						>
							{plan.valid ? "VALIDATED" : "BLOCKED"}
						</span>
					</div>
					<p className="mt-1.5 text-[10px] leading-relaxed">
						{plan.valid ? plan.expectedOutput : plan.errors[0]}
					</p>
					{plan.assumptions.length > 0 ? (
						<div className="mt-1.5">
							<div className="text-[9px] font-semibold tracking-wide uppercase opacity-45">
								Assumptions
							</div>
							<ul className="mt-0.5 space-y-0.5 text-[9px] opacity-70">
								{plan.assumptions.map((assumption) => (
									<li key={assumption}>• {assumption}</li>
								))}
							</ul>
						</div>
					) : null}
					{plan.groups.length > 0 ? (
						<ol className="mt-2 space-y-1.5">
							{plan.groups.map((group, index) => {
								const decision = planDecision[group.id] ?? "included";
								return (
									<li
										key={group.id}
										className={`border-border rounded border p-1.5 ${
											decision === "excluded" ? "opacity-45" : ""
										}`}
									>
										<div className="flex items-start gap-2">
											<span className="bg-foreground text-background flex size-4 shrink-0 items-center justify-center rounded-full font-mono text-[8px]">
												{index + 1}
											</span>
											<div className="min-w-0 flex-1">
												<div className="flex items-center justify-between gap-2">
													<strong className="truncate text-[10px]">
														{group.label}
													</strong>
													<button
														type="button"
														className="text-[9px] underline-offset-2 hover:underline"
														onClick={() =>
															setPlanDecision((current) => ({
																...current,
																[group.id]:
																	decision === "included"
																		? "excluded"
																		: "included",
															}))
														}
													>
														{decision === "included" ? "Exclude" : "Include"}
													</button>
												</div>
												<div className="mt-0.5 font-mono text-[8px] opacity-55">
													{group.operation.type} ·{" "}
													{formatRange(group.affectedRange)} ·{" "}
													{group.properties.join(", ")}
												</div>
												<div className="mt-0.5 text-[9px] opacity-70">
													{group.targets
														.map((target) => target.name)
														.join(", ")}
												</div>
												<div className="text-[9px] opacity-55">
													{group.expectedEffect}
												</div>
											</div>
										</div>
									</li>
								);
							})}
						</ol>
					) : null}
					{plan.valid && !review ? (
						<button
							type="button"
							aria-label="Apply reviewed agent plan"
							className="bg-foreground text-background mt-2 w-full rounded-md px-3 py-1.5 text-[10px] font-semibold disabled:opacity-40"
							disabled={
								executing ||
								plan.groups.every(
									(group) => planDecision[group.id] === "excluded",
								)
							}
							onClick={() => void executePlan()}
						>
							{executing
								? "Applying through shared command history…"
								: "Apply reviewed plan"}
						</button>
					) : null}
				</div>
			) : null}

			{review ? (
				<div
					className="border-border bg-background/70 mt-2 rounded-md border p-2"
					aria-label="Agent change review"
				>
					<div className="flex items-center justify-between">
						<div>
							<div className="text-[11px] font-semibold">Change review</div>
							<div className="font-mono text-[9px] opacity-50">
								rev {review.fromRevision} → {review.toRevision} · every declared
								property checked
							</div>
						</div>
						<span
							className={`rounded-full px-2 py-0.5 text-[9px] ${
								review.complete
									? "bg-emerald-500/10 text-emerald-600"
									: "bg-amber-500/10 text-amber-600"
							}`}
						>
							{review.complete ? "VERIFIED" : "CHECK"}
						</span>
					</div>
					<ul className="mt-2 space-y-1.5">
						{review.groups.map((group) => {
							const decision = reviewDecision[group.groupId] ?? "pending";
							const settled = decision !== "pending";
							return (
								<li
									key={group.groupId}
									className="border-border rounded border p-1.5"
								>
									<div className="flex items-center justify-between gap-2">
										<strong className="truncate text-[10px]">
											{group.label}
										</strong>
										<span className="font-mono text-[8px] uppercase opacity-55">
											{decision === "pending" ? group.effect : decision}
										</span>
									</div>
									<ul className="mt-1 space-y-0.5 text-[9px]">
										{group.changes.map((change) => (
											<li
												key={`${change.elementId}:${change.property}`}
												className="bg-muted/50 rounded px-1 py-0.5"
											>
												<span className="font-medium">{change.name}</span> ·{" "}
												<span className="font-mono">{change.property}</span> ·{" "}
												{String(change.before)} → {String(change.after)}
											</li>
										))}
										{group.changes.length === 0 ? (
											<li className="text-amber-600">
												No declared property change was observed.
											</li>
										) : null}
									</ul>
									<div className="mt-1 flex gap-1">
										<button
											type="button"
											disabled={settled}
											className="border-border flex-1 rounded border px-1 py-0.5 text-[9px] disabled:opacity-35"
											onClick={() => acceptGroup(group.groupId)}
										>
											Accept
										</button>
										<button
											type="button"
											disabled={settled}
											className="border-red-500/20 text-red-600 flex-1 rounded border px-1 py-0.5 text-[9px] disabled:opacity-35"
											onClick={() =>
												reverseGroup({
													groupId: group.groupId,
													decision: "rejected",
												})
											}
										>
											Reject + reverse
										</button>
										<button
											type="button"
											disabled={settled}
											className="border-border flex-1 rounded border px-1 py-0.5 text-[9px] disabled:opacity-35"
											onClick={() =>
												reverseGroup({
													groupId: group.groupId,
													decision: "reverted",
												})
											}
										>
											Revert
										</button>
									</div>
								</li>
							);
						})}
					</ul>
				</div>
			) : null}

			<div className="border-border bg-background/70 mt-2 rounded-md border p-2">
				<div className="flex items-start justify-between gap-2">
					<div>
						<div className="text-[11px] font-semibold">
							Agent preflight & visual QC
						</div>
						<div className="text-[9px] opacity-55">
							Structure · export-rendered frames · audio · encoder
						</div>
					</div>
					<button
						type="button"
						className="border-primary/30 text-primary rounded border px-2 py-1 text-[9px] font-medium disabled:opacity-40"
						disabled={qcRunning}
						onClick={() => void runQc()}
					>
						{qcRunning ? "Rendering evidence…" : "Run QC"}
					</button>
				</div>
				{qc ? (
					<>
						<div className="mt-2 grid grid-cols-2 gap-1">
							{qc.summary.checks.map((check) => (
								<div
									key={check.id}
									className={`rounded border p-1.5 ${statusClass(check.status)}`}
								>
									<div className="flex items-center justify-between gap-1">
										<strong className="text-[9px]">{check.label}</strong>
										<span className="font-mono text-[8px] uppercase">
											{check.status}
										</span>
									</div>
									<div className="mt-0.5 text-[8px] leading-snug opacity-75">
										{check.summary}
									</div>
								</div>
							))}
						</div>
						{sheet ? (
							<div className="mt-2 overflow-hidden rounded border border-black/20 bg-black">
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img
									src={sheet}
									alt={`Export renderer contact sheet for revision ${qc.summary.revision}`}
									className="block h-auto w-full"
								/>
							</div>
						) : null}
						<div className="mt-1 flex items-center justify-between font-mono text-[8px] opacity-50">
							<span>evidence rev {qc.summary.revision}</span>
							<span>{new Date(qc.ranAt).toLocaleTimeString()}</span>
						</div>
						{qc.summary.correctionPass.length > 0 ? (
							<div className="mt-2">
								<div className="text-[9px] font-semibold tracking-wide uppercase opacity-50">
									Addressable correction pass
								</div>
								<ul className="mt-1 max-h-28 space-y-0.5 overflow-y-auto text-[9px]">
									{qc.summary.correctionPass.slice(0, 20).map((item) => (
										<li
											key={item.id}
											className="bg-muted/50 rounded px-1.5 py-1"
										>
											<span className="font-mono uppercase opacity-50">
												{item.source}
											</span>{" "}
											{item.message}
											{item.atSeconds === undefined
												? ""
												: ` · ${item.atSeconds.toFixed(2)}s`}
											{item.elementId ? ` · ${item.elementId}` : ""}
										</li>
									))}
								</ul>
							</div>
						) : (
							<p className="mt-2 text-[9px] text-emerald-600">
								No correction pass required.
							</p>
						)}
					</>
				) : (
					<p className="mt-2 text-[9px] leading-relaxed opacity-55">
						Renders the opening, midpoint, and last frame through the exporter,
						then binds every finding to this revision.
					</p>
				)}
			</div>
		</section>
	);
}
