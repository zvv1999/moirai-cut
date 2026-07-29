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
	if (!range) return "工程范围";
	return `${range.startSeconds.toFixed(2)} 秒–${range.endSeconds.toFixed(2)} 秒`;
}

const AGENT_REQUEST_PRESETS = [
	{ label: "收紧这段剪辑", request: "tighten this section" },
	{ label: "统一字幕样式", request: "unify captions" },
	{
		label: "将所选素材重命名为主角",
		request: "rename selected clips to Hero",
	},
] as const;

function compileRequestText(request: string): string {
	return (
		AGENT_REQUEST_PRESETS.find((preset) => preset.label === request)?.request ??
		request
	);
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
	const [request, setRequest] = useState("收紧这段剪辑");
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
			? "未选择素材"
			: `已选 ${selectedElements.length} 个素材`;

	const preview = (nextRequest = request) => {
		const next = compileSemanticEdit({
			request: compileRequestText(nextRequest),
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
			toast.error("计划需要处理", { description: next.errors[0] });
		}
	};

	const executePlan = async () => {
		if (!plan?.valid) return;
		const groups = plan.groups.filter(
			(group) => planDecision[group.id] !== "excluded",
		);
		if (groups.length === 0) {
			toast.error("所有改动组都已排除");
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
				toast.warning("计划已完成，但复核发现问题", {
					description: result.noEffect
						? "命令未产生效果。"
						: "至少有一个声明的属性没有发生变化。",
				});
			} else {
				toast.success(`已应用 ${groups.length} 个复核通过的改动组`, {
					description: `版本 ${result.revision} · 共用一个撤销记录`,
				});
			}
		} catch (error) {
			toast.error("计划未应用", {
				description:
					error instanceof Error
						? error.message
						: "工程已发生变化，请重新预览。",
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
				toast.error("反向操作未产生效果");
				return;
			}
			setReviewDecision((current) => ({
				...current,
				[groupId]: decision,
			}));
			toast.success(
				decision === "rejected"
					? "改动组已拒绝并撤回"
					: "改动组已还原",
				{ description: `版本 ${result.revision} · 仍可撤销` },
			);
		} catch (error) {
			toast.error("无法撤回此改动组", {
				description:
					error instanceof Error ? error.message : "请重新预览工程。",
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
			toast.error("智能体预检失败", {
				description:
					error instanceof Error ? error.message : "无法渲染验证材料。",
			});
		} finally {
			setQcRunning(false);
		}
	};

	const sheet = useMemo(() => (qc ? contactSheet(qc.render) : null), [qc]);

	return (
		<section
			className="border-primary/20 bg-primary/[0.035] mb-3 rounded-lg border p-2.5"
			aria-label="智能剪辑工作台"
		>
			<div className="mb-2 flex items-start justify-between gap-3">
				<div>
					<div className="text-xs font-semibold">智能剪辑</div>
					<div className="text-[10px] opacity-55">
						计划 → 复核 → 共享命令 → 画面验证
					</div>
				</div>
				<div className="border-primary/20 bg-background rounded-full border px-2 py-0.5 font-mono text-[9px]">
					版本 {editor.agent.revision} · {selectedLabel}
				</div>
			</div>

			<div className="flex gap-1">
				<input
					aria-label="描述智能剪辑需求"
					className="border-input bg-background min-w-0 flex-1 rounded-md border px-2 py-1.5 text-xs"
					value={request}
					onChange={(event) => setRequest(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") preview();
					}}
					placeholder="例如：收紧这段剪辑"
				/>
				<button
					type="button"
					className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-[11px] font-medium"
					onClick={() => preview()}
				>
					预览计划
				</button>
			</div>
			<div className="mt-1.5 flex flex-wrap gap-1">
				{AGENT_REQUEST_PRESETS.map((preset) => (
					<button
						key={preset.request}
						type="button"
						className="border-border bg-background rounded border px-1.5 py-0.5 text-[9px] opacity-70 hover:opacity-100"
						onClick={() => preview(preset.label)}
					>
						{preset.label}
					</button>
				))}
			</div>
			<div className="border-border bg-background/60 mt-2 rounded-md border px-2 py-1.5">
				<div className="flex items-center justify-between gap-2">
					<span className="text-[9px] font-semibold tracking-wide uppercase opacity-50">
						语义寻址空间
					</span>
					<span className="font-mono text-[8px] opacity-45">
						CAS · 幂等 · 无效果验证
					</span>
				</div>
				<div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[8px] opacity-70">
					<span>{semanticState.media.length} 个媒体</span>
					<span>{semanticState.tracks.length} 条轨道</span>
					<span>{semanticElementCount} 个素材</span>
					<span>{semanticTextCount} 个文本</span>
					<span>{semanticKeyframeCount} 个关键帧</span>
					<span>{semanticState.bookmarks.length} 个标记</span>
					<span>
						{qc
							? `${qc.summary.correctionPass.length} 个可寻址问题`
							: "质检后显示问题"}
					</span>
				</div>
				<div className="mt-1 text-[8px] opacity-45">
					每个已应用计划都会成为一条共享撤销记录；被拒绝的改动组使用同一命令入口。
				</div>
			</div>

			{plan ? (
				<div className="border-border bg-background/70 mt-2 rounded-md border p-2">
					<div className="flex items-center justify-between gap-2">
						<div>
							<div className="text-[11px] font-semibold">{plan.title}</div>
							<div className="font-mono text-[9px] opacity-50">
								基础版本 {plan.baseRevision} · {plan.groups.length} 个改动组 ·{" "}
								{plan.groups.reduce(
									(total, group) => total + group.targets.length,
									0,
								)}{" "}
								个目标
							</div>
						</div>
						<span
							className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
								plan.valid
									? "bg-emerald-500/10 text-emerald-600"
									: "bg-red-500/10 text-red-600"
							}`}
						>
							{plan.valid ? "已验证" : "已阻止"}
						</span>
					</div>
					<p className="mt-1.5 text-[10px] leading-relaxed">
						{plan.valid ? plan.expectedOutput : plan.errors[0]}
					</p>
					{plan.assumptions.length > 0 ? (
						<div className="mt-1.5">
							<div className="text-[9px] font-semibold tracking-wide uppercase opacity-45">
								假设
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
														{decision === "included" ? "排除" : "纳入"}
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
							aria-label="应用已复核的智能体计划"
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
								? "正在通过共享命令历史应用…"
								: "应用已复核计划"}
						</button>
					) : null}
				</div>
			) : null}

			{review ? (
				<div
					className="border-border bg-background/70 mt-2 rounded-md border p-2"
					aria-label="智能体改动复核"
				>
					<div className="flex items-center justify-between">
						<div>
							<div className="text-[11px] font-semibold">改动复核</div>
							<div className="font-mono text-[9px] opacity-50">
								版本 {review.fromRevision} → {review.toRevision} · 已检查所有声明属性
							</div>
						</div>
						<span
							className={`rounded-full px-2 py-0.5 text-[9px] ${
								review.complete
									? "bg-emerald-500/10 text-emerald-600"
									: "bg-amber-500/10 text-amber-600"
							}`}
						>
							{review.complete ? "已验证" : "请检查"}
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
												未观察到声明的属性改动。
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
											接受
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
											拒绝并撤回
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
											还原
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
							智能体预检与画面质检
						</div>
						<div className="text-[9px] opacity-55">
							结构 · 导出渲染帧 · 音频 · 编码器
						</div>
					</div>
					<button
						type="button"
						className="border-primary/30 text-primary rounded border px-2 py-1 text-[9px] font-medium disabled:opacity-40"
						disabled={qcRunning}
						onClick={() => void runQc()}
					>
						{qcRunning ? "正在渲染验证材料…" : "运行质检"}
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
									alt={`版本 ${qc.summary.revision} 的导出渲染器联系表`}
									className="block h-auto w-full"
								/>
							</div>
						) : null}
						<div className="mt-1 flex items-center justify-between font-mono text-[8px] opacity-50">
							<span>验证版本 {qc.summary.revision}</span>
							<span>{new Date(qc.ranAt).toLocaleTimeString()}</span>
						</div>
						{qc.summary.correctionPass.length > 0 ? (
							<div className="mt-2">
								<div className="text-[9px] font-semibold tracking-wide uppercase opacity-50">
									可寻址修正列表
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
												: ` · ${item.atSeconds.toFixed(2)} 秒`}
											{item.elementId ? ` · ${item.elementId}` : ""}
										</li>
									))}
								</ul>
							</div>
						) : (
							<p className="mt-2 text-[9px] text-emerald-600">
								无需执行修正。
							</p>
						)}
					</>
				) : (
					<p className="mt-2 text-[9px] leading-relaxed opacity-55">
						通过导出渲染器生成开头、中点和末帧，并将每条发现绑定到当前版本。
					</p>
				)}
			</div>
		</section>
	);
}
