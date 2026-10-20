"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
	Check,
	ExternalLink,
	Film,
	Loader2,
	RefreshCw,
	MessageSquare,
	Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Template } from "./types";

import {FocusFields, type FocalPoint} from "./focus-fields";
interface VisualBinding {
	resourceId: string;
	mediaId: string;
	sourceStartSeconds: number;
	fit: "contain" | "cover";
	focalPoint?: FocalPoint;
}
interface VisualMedia {
	id: string;
	name: string;
	type: string;
}

interface Project {
	revision: number;
	metadata: { id: string; name: string };
	currentSceneId: string;
	scenes: {
		id: string;
		name: string;
		tracks: {
			main: {
				id: string;
				elements: { id: string; name: string; type: string }[];
			};
		};
	}[];
}
interface Compilation {
	document: Project;
	elementCount: number;
	warnings: string[];
	deduplicated: boolean;
}
interface Candidate {
	id: number;
	strategy: string;
	executable: boolean;
	score: number | null;
	metrics?: Record<string, number>;
	issues?: { message: string }[];
	request: Request & { document: Project };
	changes?: string[];
	repairCost?: {
		total: number;
		components: { kind: string; id: string; cost: number }[];
	};
}
interface Calibration {
	active: boolean;
	revision: number;
	renderedComparisons: number;
	distinctInputs: number;
}
interface RepairPolicy {
	shortenElements: Record<string, number>;
	cutTransitions: string[];
}
const metricLabels: Record<string, string> = {
	coverage: "时间覆盖",
	readability: "阅读负担",
	eventAlignment: "事件对齐",
	continuity: "镜头保持",
	variation: "布局变化",
	resourceRelevance: "素材相关性",
};
interface Request {
	input: unknown;
	sceneId: string;
	baseRevision: number;
	idempotencyKey: string;
	startTimeSeconds: number;
	source?: { trackId: string; elementId: string; focalPoint?: FocalPoint };
	media?: unknown;
	visualBindings?: VisualBinding[];
}
async function read<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, init);
	const text = await response.text();
	let result;
	try {
		result = JSON.parse(text);
	} catch {
		throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
	}
	if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
	return result;
}
async function compile(
	request: Request,
	document: Project,
): Promise<Compilation> {
	return read("/api/footage/templates/compile", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-requested-with": "moirai-footage",
		},
		body: JSON.stringify({ ...request, document }),
	});
}

export function TemplateApplyPanel({
	input,
	resources,
}: {
	input: unknown;
	resources: Template["resourceSlots"];
}) {
	const [projects, setProjects] = useState<Project[]>([]);
	const [projectId, setProjectId] = useState("");
	const [sceneId, setSceneId] = useState("");
	const [sourceId, setSourceId] = useState("");
	const [focalPoint, setFocalPoint] = useState<FocalPoint>();
	const [offset, setOffset] = useState(0);
	const [media, setMedia] = useState<Record<string, VisualMedia>>({});
	const [bindings, setBindings] = useState<Record<string, VisualBinding>>({});
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [candidates, setCandidates] = useState<Candidate[]>([]);
	const [resourceCandidates, setResourceCandidates] = useState<VisualBinding[]>(
		[],
	);
	const [truncated, setTruncated] = useState(false);
	const [repair, setRepair] = useState<RepairPolicy>({
		shortenElements: {},
		cutTransitions: [],
	});
	const [evaluationId, setEvaluationId] = useState("");
	const [profileId, setProfileId] = useState("default");
	const [calibration, setCalibration] = useState<Calibration>();
	const [preferred, setPreferred] = useState("");
	const [rejected, setRejected] = useState("");
	const [reason, setReason] = useState("");
	const [preferredPath, setPreferredPath] = useState("");
	const [rejectedPath, setRejectedPath] = useState("");
	const [feedbackKey, setFeedbackKey] = useState("");
	useEffect(() => {
		setFeedbackKey(crypto.randomUUID());
	}, [evaluationId, preferred, rejected, reason, preferredPath, rejectedPath]);
	const [feedback, setFeedback] = useState<{
		id: string;
		revision: number;
		retracted: boolean;
	}>();
	const template = (input as { template: Template }).template;
	useEffect(() => {
		setPreferredPath("");
		setRejectedPath("");
		setReason("");
	}, [preferred, rejected]);
	useEffect(() => {
		setRepair({ shortenElements: {}, cutTransitions: [] });
	}, [input]);
	useEffect(() => {
		setPending(null);
		setCandidates([]);
		setEvaluationId("");
		setPreferred("");
		setRejected("");
		setFeedback(undefined);
		setCalibration(undefined);
	}, [
		input,
		projectId,
		sceneId,
		sourceId,
		offset,
		bindings,
		focalPoint,
		repair,
		profileId,
		resourceCandidates,
	]);
	const [pending, setPending] = useState<{
		request: Request;
		result: Compilation;
		projectId: string;
	} | null>(null);
	const [applied, setApplied] = useState<{
		projectId: string;
		revision: number;
	} | null>(null);
	const project = projects.find((p) => p.metadata.id === projectId);
	const scene = project?.scenes.find((s) => s.id === sceneId);
	const visualSlots = resources.filter((r) =>
		["image", "video", "visual_media"].includes(r.representation),
	);
	useEffect(() => {
		let live = true;
		setMedia({});
		setBindings({});
		setResourceCandidates([]);
		if (projectId)
			void read<{ assets: Record<string, VisualMedia> }>(
				`/api/media/${encodeURIComponent(projectId)}`,
			)
				.then((data) => {
					if (live) setMedia(data.assets);
				})
				.catch((e) => {
					if (live) setError(String(e));
				});
		return () => {
			live = false;
		};
	}, [projectId]);

	async function refresh() {
		setBusy(true);
		setError("");
		setPending(null);
		setEvaluationId("");
		setFeedback(undefined);
		try {
			const { ids } = await read<{ ids: string[] }>("/api/projects");
			const documents = await Promise.all(
				ids.map((id) =>
					read<Project>(`/api/projects/${encodeURIComponent(id)}`),
				),
			);
			setProjects(documents);
		} catch (e) {
			setError(String(e));
		} finally {
			setBusy(false);
		}
	}
	useEffect(() => {
		void refresh();
	}, []);

	async function prepare(evaluate = false) {
		if (!scene) return;
		setBusy(true);
		setError("");
		setApplied(null);
		setPending(null);
		setCandidates([]);
		setEvaluationId("");
		setFeedback(undefined);
		setPreferred("");
		setRejected("");
		setReason("");
		setPreferredPath("");
		setRejectedPath("");
		try {
			const document = await read<Project>(
				`/api/projects/${encodeURIComponent(projectId)}`,
			);
			const media = (
				await read<{ assets: unknown }>(
					`/api/media/${encodeURIComponent(projectId)}`,
				)
			).assets;
			const request: Request = {
				input,
				sceneId,
				baseRevision: document.revision,
				idempotencyKey: crypto.randomUUID(),
				startTimeSeconds: offset,
				media,
				visualBindings: Object.values(bindings).filter((b) => b.mediaId),
				...(sourceId
					? {
							source: {
								trackId: scene.tracks.main.id,
								elementId: sourceId,
								focalPoint,
							},
						}
					: {}),
			};
			if (evaluate) {
				const result = await read<{
					candidates: Candidate[];
					searchTruncated: boolean;
					evaluationId: string;
					calibration: Calibration;
				}>("/api/footage/templates/evaluate", {
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-requested-with": "moirai-footage",
					},
					body: JSON.stringify({
						request: { ...request, document },
						resourceCandidates,
						repair,
						profileId,
					}),
				});
				setCandidates(result.candidates);
				setTruncated(result.searchTruncated);
				setEvaluationId(result.evaluationId);
				setCalibration(result.calibration);
			} else {
				const check = await read<{
					executable: boolean;
					issues: { message: string }[];
				}>("/api/footage/templates/preflight", {
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-requested-with": "moirai-footage",
					},
					body: JSON.stringify({ ...request, document }),
				});
				if (!check.executable) {
					const recovered = await read<{
						repaired: boolean;
						selectedRequest: Request;
						compilation: Compilation;
						candidates: Candidate[];
						searchTruncated: boolean;
					}>("/api/footage/templates/repair", {
						method: "POST",
						headers: {
							"content-type": "application/json",
							"x-requested-with": "moirai-footage",
						},
						body: JSON.stringify({
							request: { ...request, document },
							resourceCandidates,
							repair,
							profileId,
						}),
					});
					setCandidates(recovered.candidates);
					setTruncated(recovered.searchTruncated);
					if (!recovered.repaired)
						throw new Error(check.issues.map((i) => i.message).join("\n"));
					setPending({
						request: recovered.selectedRequest,
						result: recovered.compilation,
						projectId,
					});
					return;
				}
				const result = await compile(request, document);
				setPending({ request, result, projectId });
			}
		} catch (e) {
			setError(String(e));
		} finally {
			setBusy(false);
		}
	}
	async function selectCandidate(candidate: Candidate) {
		setBusy(true);
		setError("");
		setPending(null);
		try {
			const current = await read<Project>(
				`/api/projects/${encodeURIComponent(projectId)}`,
			);
			const result = await compile(candidate.request, current);
			setPending({ request: candidate.request, result, projectId });
		} catch (e) {
			setError(String(e));
		} finally {
			setBusy(false);
		}
	}
	async function apply() {
		if (!pending) return;
		setBusy(true);
		setError("");
		try {
			const url = `/api/projects/${encodeURIComponent(pending.projectId)}`;
			const current = await read<Project>(url);
			const media = (
				await read<{ assets: unknown }>(
					`/api/media/${encodeURIComponent(pending.projectId)}`,
				)
			).assets;
			const request = { ...pending.request, media };
			const result = await compile(request, current);
			if (!result.deduplicated) {
				await read(url, {
					method: "PUT",
					headers: {
						"content-type": "application/json",
						"if-match": String(pending.request.baseRevision),
					},
					body: JSON.stringify(result.document),
				});
			}
			const readback = await read<Project>(url);
			const verified = await compile(request, readback);
			if (!verified.deduplicated) throw new Error("工程回读未找到本次元素");
			setApplied({ projectId: pending.projectId, revision: readback.revision });
			setPending(null);
		} catch (e) {
			setError(String(e));
		} finally {
			setBusy(false);
		}
	}
	async function recordPreference() {
		setBusy(true);
		setError("");
		try {
			const result = await read<{
				feedback: { id: string; revision: number; retracted: boolean };
				profile: Calibration;
			}>("/api/footage/templates/preferences", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-requested-with": "moirai-footage",
				},
				body: JSON.stringify({
					evaluationId,
					preferredId: Number(preferred),
					rejectedId: Number(rejected),
					reason,
					idempotencyKey: feedbackKey,
					renderedPaths:
						preferredPath || rejectedPath
							? { [preferred]: preferredPath, [rejected]: rejectedPath }
							: {},
				}),
			});
			setFeedback(result.feedback);
			setCalibration(result.profile);
		} catch (e) {
			setError(String(e));
		} finally {
			setBusy(false);
		}
	}
	async function retractPreference() {
		if (!feedback) return;
		setBusy(true);
		setError("");
		try {
			const result = await read<{
				feedback: typeof feedback;
				profile: Calibration;
			}>("/api/footage/templates/preferences/retract", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-requested-with": "moirai-footage",
				},
				body: JSON.stringify({
					id: feedback.id,
					baseRevision: feedback.revision,
				}),
			});
			setFeedback(result.feedback);
			setCalibration(result.profile);
			setFeedbackKey(crypto.randomUUID());
		} catch (e) {
			setError(String(e));
		} finally {
			setBusy(false);
		}
	}
	return (
		<section className="tw-apply">
			<div className="tw-row">
				<h3>应用到工程</h3>
				<Button
					size="icon"
					variant="ghost"
					aria-label="刷新工程"
					title="刷新工程"
					disabled={busy}
					onClick={() => void refresh()}
				>
					<RefreshCw />
				</Button>
			</div>
			<fieldset disabled={busy} className="tw-apply-fields">
				<label>
					工程
					<select
						value={projectId}
						onChange={(e) => {
							const selected = projects.find(
								(p) => p.metadata.id === e.target.value,
							);
							setProjectId(e.target.value);
							setSceneId(
								selected?.currentSceneId ?? selected?.scenes[0]?.id ?? "",
							);
							setSourceId("");
							setFocalPoint(undefined);
							setPending(null);
							setApplied(null);
						}}
					>
						<option value="">选择工程</option>
						{projects.map((p) => (
							<option key={p.metadata.id} value={p.metadata.id}>
								{p.metadata.name}
							</option>
						))}
					</select>
				</label>
				<label>
					场景
					<select
						value={sceneId}
						onChange={(e) => {
							setSceneId(e.target.value);
							setSourceId("");
							setFocalPoint(undefined);
							setPending(null);
						}}
					>
						<option value="">选择场景</option>
						{project?.scenes.map((s) => (
							<option key={s.id} value={s.id}>
								{s.name}
							</option>
						))}
					</select>
				</label>
				<label>
					主画面片段
					<select
						value={sourceId}
						onChange={(e) => {
							setSourceId(e.target.value);
							setFocalPoint(undefined);
							setPending(null);
						}}
					>
						<option value="">保留主画面</option>
						{scene?.tracks.main.elements
							.filter((e) => e.type === "video")
							.map((e) => (
								<option key={e.id} value={e.id}>
									{e.name}
								</option>
							))}
					</select>
				</label>
				{sourceId && (
					<FocusFields
						label="主画面"
						value={focalPoint}
						onChange={(value) => {
							setFocalPoint(value);
							setPending(null);
							setApplied(null);
						}}
					/>
				)}
				<label>
					时间线起点（秒）
					<input
						type="number"
						min="0"
						step="0.01"
						value={offset}
						onChange={(e) => {
							setOffset(Number(e.target.value));
							setPending(null);
						}}
					/>
				</label>
			</fieldset>
			<details className="tw-repair">
				<summary>回退范围与偏好</summary>
				<fieldset disabled={busy} className="tw-apply-fields">
					<label>
						偏好档案
						<input
							aria-label="偏好档案"
							value={profileId}
							onChange={(e) => setProfileId(e.target.value)}
						/>
					</label>
					{template.elements
						.filter((e) => e.features.representation !== "audio")
						.map((e) => (
							<div key={e.id}>
								<label className="tw-check">
									<input
										type="checkbox"
										checked={e.id in repair.shortenElements}
										onChange={(event) =>
											setRepair((p) => {
												const shortenElements = { ...p.shortenElements };
												if (event.target.checked)
													shortenElements[e.id] = e.timing.minSeconds;
												else delete shortenElements[e.id];
												return { ...p, shortenElements };
											})
										}
									/>
									{e.id} · 允许缩短
								</label>
								{e.id in repair.shortenElements && (
									<label>
										最短时长（秒）
										<input
											type="number"
											min={e.timing.minSeconds}
											max={e.timing.maxSeconds}
											step="0.05"
											value={repair.shortenElements[e.id]}
											onChange={(event) =>
												setRepair((p) => ({
													...p,
													shortenElements: {
														...p.shortenElements,
														[e.id]: event.target.valueAsNumber,
													},
												}))
											}
										/>
									</label>
								)}
							</div>
						))}
					{[
						...(template.composition?.transitions ?? []),
						...template.transitionRules,
					].map((r) => (
						<label className="tw-check" key={r.id}>
							<input
								type="checkbox"
								checked={repair.cutTransitions.includes(r.id)}
								onChange={(e) =>
									setRepair((p) => ({
										...p,
										cutTransitions: e.target.checked
											? [...p.cutTransitions, r.id]
											: p.cutTransitions.filter((id) => id !== r.id),
									}))
								}
							/>
							{r.id} · 允许改为直接切换
						</label>
					))}
				</fieldset>
			</details>
			{visualSlots.length > 0 && projectId && (
				<fieldset disabled={busy} className="tw-apply-fields">
					<legend>视觉资源</legend>
					{visualSlots.map((slot) => {
						const binding = bindings[slot.id] ?? {
							resourceId: slot.id,
							mediaId: "",
							sourceStartSeconds: 0,
							fit: "contain" as const,
						};
						const update = (value: Partial<VisualBinding>) => {
							setBindings({ ...bindings, [slot.id]: { ...binding, ...value } });
							setPending(null);
							setApplied(null);
						};
						return (
							<div key={slot.id}>
								<details>
									<summary>候选素材</summary>
									{Object.values(media)
										.filter((m) =>
											slot.representation === "visual_media"
												? ["image", "video"].includes(m.type)
												: m.type === slot.representation,
										)
										.map((m) => (
											<label className="tw-check" key={m.id}>
												<input
													type="checkbox"
													checked={resourceCandidates.some(
														(b) =>
															b.resourceId === slot.id && b.mediaId === m.id,
													)}
													onChange={(e) => {
														setResourceCandidates((previous) =>
															e.target.checked
																? [...previous, { ...binding, mediaId: m.id }]
																: previous.filter(
																		(b) =>
																			b.resourceId !== slot.id ||
																			b.mediaId !== m.id,
																	),
														);
														setCandidates([]);
														setPending(null);
													}}
												/>
												{m.name}
											</label>
										))}
								</details>
								<label>
									{slot.description}
									<select
										aria-label={`资源 ${slot.id}`}
										value={binding.mediaId}
										onChange={(e) =>
											update({
												mediaId: e.target.value,
												sourceStartSeconds: 0,
												focalPoint: undefined,
											})
										}
									>
										<option value="">沿用默认绑定</option>
										{Object.values(media)
											.filter((m) =>
												slot.representation === "visual_media"
													? ["image", "video"].includes(m.type)
													: m.type === slot.representation,
											)
											.map((m) => (
												<option key={m.id} value={m.id}>
													{m.name}
												</option>
											))}
									</select>
								</label>
								{binding.mediaId && (
									<>
										<label>
											画面适配
											<select
												aria-label={`适配 ${slot.id}`}
												value={binding.fit}
												onChange={(e) =>
													update({
														fit: e.target.value as VisualBinding["fit"],
													})
												}
											>
												<option value="contain">完整显示</option>
												<option value="cover">裁切填满</option>
											</select>
										</label>
										{binding.fit === "cover" && (
											<FocusFields
												label={slot.id}
												value={binding.focalPoint}
												onChange={(value) => update({ focalPoint: value })}
											/>
										)}
										{media[binding.mediaId]?.type === "video" && (
											<label>
												素材起点（秒）
												<input
													aria-label={`素材起点 ${slot.id}`}
													type="number"
													min="0"
													step="0.01"
													value={binding.sourceStartSeconds}
													onChange={(e) =>
														update({
															sourceStartSeconds: Number(e.target.value),
														})
													}
												/>
											</label>
										)}
									</>
								)}
							</div>
						);
					})}
				</fieldset>
			)}
			<div className="tw-row">
				<Button disabled={busy || !scene} onClick={() => void prepare()}>
					{busy ? <Loader2 className="animate-spin" /> : <Film />}检查编排
				</Button>
				<Button disabled={busy || !scene} onClick={() => void prepare(true)}>
					<Film />
					比较方案
				</Button>
				{pending && (
					<Button disabled={busy} onClick={() => void apply()}>
						<Check />
						写入工程 · {pending.result.elementCount} 个元素
					</Button>
				)}
				{applied && (
					<Link href={`/editor/${applied.projectId}`}>
						<ExternalLink size={16} />
						打开工程 · r{applied.revision}
					</Link>
				)}
			</div>
			{candidates.length > 0 && (
				<div aria-label="候选方案">
					{candidates.map((c) => (
						<div key={c.id} className="tw-row">
							<span>
								{c.strategy} ·{" "}
								{c.executable ? `${c.score?.toFixed(1)} 分` : "不可执行"}
							</span>
							{c.metrics && (
								<details>
									<summary>评分依据</summary>
									{Object.entries(c.metrics).map(([k, v]) => (
										<div key={k}>
											{metricLabels[k] ?? k}: {(v * 100).toFixed(1)}
										</div>
									))}
								</details>
							)}
							{c.issues?.map((i, n) => (
								<p key={n}>{i.message}</p>
							))}
							{(c.changes?.length ?? 0) > 0 && (
								<details>
									<summary>
										调整记录 · 代价 {c.repairCost?.total.toFixed(1) ?? "—"}
									</summary>
									{c.repairCost?.components.map((part) => (
										<div key={`${part.kind}:${part.id}`}>
											{(
												{
													resource: "素材替换",
													shorten: "时长缩短",
													cut: "取消转场",
													layout_policy: "布局策略",
													template: "模板替换",
												} as Record<string, string>
											)[part.kind] ?? part.kind}{" "}
											· {part.id} · {part.cost.toFixed(1)}
										</div>
									))}
									<ul>
										{c.changes?.map((change, i) => (
											<li key={i}>{change}</li>
										))}
									</ul>
								</details>
							)}
							<Button
								disabled={busy || !c.executable}
								onClick={() => void selectCandidate(c)}
							>
								<Check />
								选择
							</Button>
						</div>
					))}
				</div>
			)}
			{evaluationId && candidates.filter((c) => c.executable).length > 1 && (
				<fieldset disabled={busy} className="tw-preference">
					<legend>对比反馈</legend>
					<fieldset
						className="tw-apply-fields"
						disabled={!!feedback && !feedback.retracted}
					>
						<label>
							更喜欢
							<select
								aria-label="更喜欢"
								value={preferred}
								onChange={(e) => setPreferred(e.target.value)}
							>
								<option value="">选择方案</option>
								{candidates
									.filter((c) => c.executable)
									.map((c) => (
										<option key={c.id} value={c.id}>
											{c.id} · {c.strategy}
										</option>
									))}
							</select>
						</label>
						<label>
							相比于
							<select
								aria-label="相比于"
								value={rejected}
								onChange={(e) => setRejected(e.target.value)}
							>
								<option value="">选择方案</option>
								{candidates
									.filter((c) => c.executable && String(c.id) !== preferred)
									.map((c) => (
										<option key={c.id} value={c.id}>
											{c.id} · {c.strategy}
										</option>
									))}
							</select>
						</label>
						<label>
							比较理由
							<input
								aria-label="比较理由"
								value={reason}
								onChange={(e) => setReason(e.target.value)}
							/>
						</label>
						<label>
							更喜欢方案的成片/帧文件
							<input
								aria-label="偏好方案证据"
								value={preferredPath}
								onChange={(e) => setPreferredPath(e.target.value)}
							/>
						</label>
						<label>
							对照方案的成片/帧文件
							<input
								aria-label="对照方案证据"
								value={rejectedPath}
								onChange={(e) => setRejectedPath(e.target.value)}
							/>
						</label>
					</fieldset>
					<div className="tw-row">
						<Button
							disabled={
								busy ||
								preferred === "" ||
								rejected === "" ||
								preferred === rejected ||
								!reason.trim() ||
								(!!feedback && !feedback.retracted)
							}
							onClick={() => void recordPreference()}
						>
							<MessageSquare />
							记录偏好
						</Button>
						{feedback && !feedback.retracted && (
							<Button disabled={busy} onClick={() => void retractPreference()}>
								<Undo2 />
								撤销偏好
							</Button>
						)}
					</div>
				</fieldset>
			)}
			{calibration && (
				<p role="status">
					{calibration.active ? "偏好校准已启用" : "基础评分"} · r
					{calibration.revision} · 有效成片对比{" "}
					{calibration.renderedComparisons} 条 / {calibration.distinctInputs}{" "}
					个输入
				</p>
			)}
			{pending && pending.result.warnings.length > 0 && (
				<ul>
					{pending.result.warnings.map((warning) => (
						<li key={warning}>{warning}</li>
					))}
				</ul>
			)}
			{error && <p role="alert">{error}</p>}
			{candidates.length > 0 && truncated && (
				<p role="status">已达到本次候选数量上限</p>
			)}
		</section>
	);
}
