"use client";
import { useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Element, Library, Template } from "./types";
import { CompositionEditor } from "./composition";
import { AssetPicker, type VisualAsset } from "./asset-picker";

export interface FeatureOptions {
	Role: string[];
	Representation: string[];
	MediaUse: string[];
}
export const semanticRoleLabels: Record<string, string> = {
	title: "标题",
	subtitle: "字幕",
	translation: "译文",
	emphasis: "强调",
	callout: "提示",
	speaker_label: "人物身份",
	chapter: "章节",
	list_item: "列表项",
	metric: "指标",
	annotation: "标注",
	decoration: "装饰",
	primary_visual: "主画面",
	supporting_visual: "辅助画面",
	background: "背景",
};
const labels: Record<string, string> = {
	...semanticRoleLabels,
	text: "文字",
	image: "图片",
	video: "视频",
	visual_media: "图片或视频",
	audio: "声音",
	rectangle: "矩形",
	ellipse: "椭圆",
	star: "星形",
	line: "线条",
	arrow: "箭头",
	particles: "粒子",
	subject_contour: "人物轮廓",
	spotlight: "聚光",
	icon: "图标",
	sticker: "贴纸",
	broll: "补充画面",
	source_video: "源视频",
	sound_effect: "音效",
	music: "音乐",
	pauseBoundarySeconds: "停顿阈值（秒）",
	maxPhraseSeconds: "字幕时长上限（秒）",
	maxCharacters: "字幕字数上限",
	maxCharactersPerSecond: "阅读速度上限（字/秒）",
	minDisplaySeconds: "目标最短展示（秒）",
	maxAccentsPerCue: "每屏强调数上限",
	effectCooldownSeconds: "音效最小间隔（秒）",
	musicGainDb: "音乐增益（dB）",
	musicDuckDb: "口播期间音乐衰减（dB）",
	effectGainDb: "音效增益（dB）",
	musicDuckAttackSeconds: "压低时间（秒）",
	musicDuckReleaseSeconds: "恢复时间（秒）",
};
export const ontologyLabel = (value: string | null) =>
	value ? (labels[value] ?? value) : "未指定";

export function FeatureEditor({
	value,
	options,
	onChange,
}: {
	value: Element["features"];
	options: FeatureOptions;
	onChange: (value: Element["features"]) => void;
}) {
	return (
		<>
			{(
				[
					["role", "语义角色", "Role"],
					["representation", "表现类型", "Representation"],
					["mediaUse", "媒体用途", "MediaUse"],
				] as const
			).map(([key, title, schema]) => (
				<label key={key}>
					{title}
					<select
						aria-label={title}
						value={value[key] ?? ""}
						onChange={(e) =>
							onChange({ ...value, [key]: e.target.value || null })
						}
					>
						{key !== "representation" && <option value="">未指定</option>}
						{options[schema].map((v) => (
							<option key={v} value={v}>
								{ontologyLabel(v)}
							</option>
						))}
					</select>
				</label>
			))}
			<label>
				定位
				<select
					aria-label="定位"
					value={value.placement}
					onChange={(e) => onChange({ ...value, placement: e.target.value })}
				>
					<option value="fixed">元素区域</option>
					<option value="caption">布局字幕区域</option>
				</select>
			</label>
			{(
				[
					["outline", "仅描边"],
					["accent", "计入视觉强调预算"],
					["avoidProtectedRegions", "避让保护区域"],
				] as const
			).map(([key, title]) => (
				<label key={key} className="tw-check">
					<input
						type="checkbox"
						checked={value[key]}
						onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
					/>
					{title}
				</label>
			))}
		</>
	);
}

export function ResourceEditor({
	template,
	sounds,
	onChange,
	onAssetsLoaded,
}: {
	template: Template;
	sounds: Library["sounds"];
	onChange: (t: Template) => void;
	onAssetsLoaded?: (assets: VisualAsset[]) => void;
}) {
	const [assets, setAssets] = useState<VisualAsset[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [attempt, setAttempt] = useState(0);
	useEffect(() => {
		const controller = new AbortController();
		setLoading(true);
		setError("");
		void fetch("/api/footage/templates/assets", { signal: controller.signal, cache: "no-store" })
			.then(async (response) => {
				const result = await response.json();
				if (!response.ok) throw new Error(result.error ?? "素材加载失败");
				if (!controller.signal.aborted) {
					setAssets(result.assets);
					onAssetsLoaded?.(result.assets);
				}
			})
			.catch((e) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "素材加载失败"); })
			.finally(() => { if (!controller.signal.aborted) setLoading(false); });
		return () => controller.abort();
	}, [attempt, onAssetsLoaded]);
	return (
		<section>
			<div className="tw-section-title">
				<h2>资源槽与绑定</h2>
				<Button
					size="icon"
					variant="ghost"
					title="添加资源槽"
					aria-label="添加资源槽"
					onClick={() =>
						onChange({
							...template,
							resourceSlots: [
								...template.resourceSlots,
								{
									id: `slot-${crypto.randomUUID()}`,
									representation: "image",
									description: "新资源",
									tags: [],
								},
							],
						})
					}
				>
					<Plus />
				</Button>
			</div>
			{loading && <p role="status">正在加载素材…</p>}
			{error && <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => setAttempt(attempt + 1)}><RefreshCw />重新加载素材</Button></div>}
			{template.resourceSlots.map((slot) => {
				const binding = template.resourceBindings.find(
					(b) => b.slotId === slot.id,
				);
				const bind = (assetId: string) =>
					onChange({
						...template,
						resourceBindings: [
							...template.resourceBindings.filter((b) => b.slotId !== slot.id),
							...(assetId ? [{ slotId: slot.id, assetId, enabled: binding?.enabled !== false }] : []),
						],
					});
				const used =
					template.elements.some((e) => e.resourceId === slot.id) ||
					template.layouts.some((l) => l.secondary?.resourceId === slot.id);
				return (
					<fieldset key={slot.id} className="tw-resource-slot">
						<legend>{slot.description || "未命名素材"}</legend>
						{binding && (
							<label className="tw-check">
								<input
									type="checkbox"
									checked={binding.enabled !== false}
									onChange={(e) =>
										onChange({
											...template,
											resourceBindings: template.resourceBindings.map((b) =>
												b.slotId === slot.id
													? { ...b, enabled: e.target.checked }
													: b,
											),
										})
									}
								/>
								启用绑定
							</label>
						)}
						<div className="tw-row">
							<label>
								需求名称
								<input
									value={slot.description}
									onChange={(e) =>
										onChange({
											...template,
											resourceSlots: template.resourceSlots.map((r) =>
												r.id === slot.id
													? { ...r, description: e.target.value }
													: r,
											),
										})
									}
								/>
							</label>
							<label>
								媒体类型
								<select
									value={slot.representation}
									onChange={(e) =>
										onChange({
											...template,
											resourceSlots: template.resourceSlots.map((r) =>
												r.id === slot.id
													? { ...r, representation: e.target.value }
													: r,
											),
										})
									}
								>
									{[
										...new Set([
											slot.representation,
											"image",
											"video",
											"visual_media",
											"audio",
										]),
									].map((v) => (
										<option key={v} value={v}>
											{ontologyLabel(v)}
										</option>
									))}
								</select>
							</label>
							<Button
								size="icon"
								variant="ghost"
								disabled={used}
								title="删除未引用资源槽"
								aria-label={`删除资源槽 ${slot.id}`}
								onClick={() =>
									onChange({
										...template,
										resourceSlots: template.resourceSlots.filter(
											(r) => r.id !== slot.id,
										),
										resourceBindings: template.resourceBindings.filter(
											(b) => b.slotId !== slot.id,
										),
									})
								}
							>
								<Trash2 />
							</Button>
						</div>
						{slot.representation === "audio" ? (
							<label>
								声音资产
								<select
									aria-label={`${slot.id} 资源`}
									value={binding?.assetId ?? ""}
									onChange={(e) => bind(e.target.value)}
								>
									<option value="">未绑定</option>
									{binding &&
										!sounds.some(
											(s) =>
												s.id === binding.assetId && s.status === "approved",
										) && (
											<option value={binding.assetId}>
												{binding.assetId}（待复核）
											</option>
										)}
									{sounds
										.filter((s) => s.status === "approved")
										.map((s) => (
											<option key={s.id} value={s.id}>
												{s.name}
											</option>
										))}
								</select>
							</label>
						) : ["image", "video", "visual_media"].includes(slot.representation) ? (
							<AssetPicker
								label={`${slot.description || slot.id}素材`}
								assets={assets.filter((asset) => slot.representation === "visual_media" || asset.kind === slot.representation)}
								value={binding?.assetId ?? ""}
								onChange={bind}
								emptyLabel="未绑定"
								disabled={loading || !!error}
							/>
						) : (
							<label>
								工程媒体 ID
								<input
									aria-label={`${slot.id} 资产 ID`}
									value={binding?.assetId ?? ""}
									onChange={(e) => bind(e.target.value)}
								/>
							</label>
						)}
					</fieldset>
				);
			})}
		</section>
	);
}

export function PolicyEditor({
	template,
	onChange,
}: {
	template: Template;
	onChange: (t: Template) => void;
}) {
	return (
		<div className="tw-ontology-policies">
			{(
				[
					["segmentation", "字幕分段"],
					["visualRhythm", "视觉节奏"],
					["audioPlacement", "声音编排"],
					["mix", "混音"],
				] as const
			).map(([key, title]) => (
				<section key={key}>
					<h3>{title}</h3>
					{key === "visualRhythm" && <p>利用词后的空隙，让短关键词多停留一会儿，不改变声音触发点。遇到下一个关键词、图层时长上限或片尾时提前结束；显式结束规则优先，因此实际停留可能短于目标。此设置作用于当前组合，字幕仍受下一段边界限制。</p>}
					{key === "segmentation" && <label><input type="checkbox" checked={template.segmentation.preserveLayoutPhrases??false} onChange={e=>onChange({...template,segmentation:{...template.segmentation,preserveLayoutPhrases:e.target.checked}})}/>自动分段保留已标注短语</label>}
                    <div className="tw-rules">
						{Object.entries(template[key]).filter(([,value])=>typeof value === "number").map(([name, value]) => (
							<label key={name}>
								{ontologyLabel(name)}
								<input
									type="number"
									step={
										name.includes("Characters") || name.includes("Accents")
											? "1"
											: "0.01"
									}
									value={value as number}
									onChange={(e) =>
										onChange({
											...template,
											[key]: {
												...template[key],
												[name]: Number(e.target.value),
											},
										})
									}
								/>
							</label>
						))}
					</div>
				</section>
			))}
		</div>
	);
}

export function TemplateOntology({
	template,
	onChange,
	options,
	sounds,
}: {
	template: Template;
	onChange: (t: Template) => void;
	options: FeatureOptions;
	sounds: Library["sounds"];
}) {
	return (
		<section className="tw-ontology" aria-label="模板本体">
			<h2>元素定义</h2>
			{template.elements.map((element) => (
				<details key={element.id}>
					<summary>
						{element.id} · {ontologyLabel(element.features.role)} ·{" "}
						{ontologyLabel(element.features.representation)}
					</summary>
					<div className="tw-fields">
						<FeatureEditor
							value={element.features}
							options={options}
							onChange={(features) =>
								onChange({
									...template,
									elements: template.elements.map((e) =>
										e.id === element.id ? { ...e, features } : e,
									),
								})
							}
						/>
						<label>
							资源槽
							<select
								value={element.resourceId ?? ""}
								onChange={(event) =>
									onChange({
										...template,
										elements: template.elements.map((e) =>
											e.id === element.id
												? { ...e, resourceId: event.target.value || null }
												: e,
										),
									})
								}
							>
								<option value="">无</option>
								{template.resourceSlots.map((s) => (
									<option key={s.id} value={s.id}>
										{s.description || s.id}
									</option>
								))}
							</select>
						</label>
					</div>
				</details>
			))}
			<ResourceEditor template={template} sounds={sounds} onChange={onChange} />
			<PolicyEditor template={template} onChange={onChange} />
			<CompositionEditor template={template} onChange={onChange} />
		</section>
	);
}
