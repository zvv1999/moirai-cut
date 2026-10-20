"use client";
import { useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Rect, Template } from "./types";

type Layout = Template["layouts"][number];
const modes = {
	full_bleed: "全画面",
	punch_in: "推近",
	circle_inset: "圆形嵌入",
	split: "分屏",
	picture_in_picture: "画中画",
	blurred_fill: "模糊填充",
};
const intents = {
	neutral: "常规",
	hook: "开场",
	question: "提问",
	contrast: "转折",
	list: "列举",
	metric: "数据",
	emphasis: "强调",
	explanation: "解释",
	conclusion: "总结",
	call_to_action: "行动引导",
};
const entrances = {
	cut: "无",
	slide: "滑入",
	zoom: "缩放",
	wipe: "擦入",
	blur: "模糊入场",
	dissolve: "溶解（暂不支持）",
};

function Region({
	name,
	value,
	onChange,
}: {
	name: string;
	value: Rect;
	onChange: (value: Rect) => void;
}) {
	return (
		<fieldset className="tw-layout-region">
			<legend>{name}</legend>
			{(["x", "y", "width", "height"] as const).map((key) => (
				<label key={key}>
					{{ x: "X", y: "Y", width: "宽", height: "高" }[key]}
					<input
						aria-label={`${name} ${key}`}
						type="number"
						min="0"
						max="1"
						step="0.01"
						value={value[key]}
						onChange={(e) =>
							onChange({ ...value, [key]: Number(e.target.value) })
						}
					/>
				</label>
			))}
		</fieldset>
	);
}

export function LayoutEditor({
	template,
	onChange,
}: {
	template: Template;
	onChange: (template: Template) => void;
}) {
	const [selected, setSelected] = useState("");
	const layout =
		template.layouts.find((l) => l.id === selected) ?? template.layouts[0];
	if (!layout) return null;
	const update = (patch: Partial<Layout>) =>
		onChange({
			...template,
			layouts: template.layouts.map((l) =>
				l.id === layout.id ? { ...l, ...patch } : l,
			),
		});
	const entrance = template.layoutEntrances.find(
		(e) => e.layoutId === layout.id,
	);
	const updateEntrance = (
		patch: Partial<Template["layoutEntrances"][number]>,
	) => {
		const next = {
			layoutId: layout.id,
			effect: "cut",
			durationSeconds: 0.3,
			...entrance,
			...patch,
		};
		onChange({
			...template,
			layoutEntrances: [
				...template.layoutEntrances.filter((e) => e.layoutId !== layout.id),
				...(next.effect === "cut" ? [] : [next]),
			],
		});
	};
	const regionStyle = (r: Rect) => ({
		left: `${r.x * 100}%`,
		top: `${r.y * 100}%`,
		width: `${r.width * 100}%`,
		height: `${r.height * 100}%`,
	});
	return (
		<section className="tw-layout-editor">
			<div
				className="tw-layout-preview"
				style={{
					aspectRatio: `${template.canvas.width}/${template.canvas.height}`,
				}}
				aria-label="布局区域示意"
			>
				<div className="tw-layout-main" style={regionStyle(layout.videoRegion)}>
					主画面
				</div>
				{layout.secondary && (
					<div
						className="tw-layout-secondary"
						style={regionStyle(layout.secondary.region)}
					>
						第二画面
					</div>
				)}
				<div
					className="tw-layout-caption"
					style={regionStyle(layout.captionRegion)}
				>
					字幕
				</div>
			</div>
			<div className="tw-layout-controls">
				<div className="tw-row">
					<label>
						布局
						<select
							value={layout.id}
							onChange={(e) => setSelected(e.target.value)}
						>
							{template.layouts.map((l) => (
								<option key={l.id} value={l.id}>
									{l.description || l.id}
								</option>
							))}
						</select>
					</label>
					<Button
						size="icon"
						variant="ghost"
						title="复制布局"
						aria-label="复制布局"
						onClick={() => {
							const copy = {
								...structuredClone(layout),
								id: `layout-${crypto.randomUUID()}`,
								description: `${layout.description} 副本`,
								intents: [],
							};
							onChange({ ...template, layouts: [...template.layouts, copy] });
							setSelected(copy.id);
						}}
					>
						<Copy />
					</Button>
					<Button
						size="icon"
						variant="ghost"
						title="删除布局"
						aria-label="删除布局"
						disabled={template.layouts.length < 2}
						onClick={() => {
							onChange({
								...template,
								layouts: template.layouts.filter((l) => l.id !== layout.id),
								layoutEntrances: template.layoutEntrances.filter(
									(e) => e.layoutId !== layout.id,
								),
								transitionRules: template.transitionRules.filter(
									(r) =>
										r.fromLayoutId !== layout.id && r.toLayoutId !== layout.id,
								),
							});
							setSelected("");
						}}
					>
						<Trash2 />
					</Button>
				</div>
				<label>
					布局名称
					<input
						value={layout.description}
						onChange={(e) => update({ description: e.target.value })}
					/>
				</label>
				<label>
					构图
					<select
						value={layout.mode}
						onChange={(e) =>
							update({
								mode: e.target.value,
								...(!["split", "picture_in_picture"].includes(e.target.value)
									? { secondary: undefined }
									: {}),
							})
						}
					>
						{Object.entries(modes).map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
				</label>
				<Region
					name="主画面区域"
					value={layout.videoRegion}
					onChange={(videoRegion) => update({ videoRegion })}
				/>
				{["split", "picture_in_picture"].includes(layout.mode) && (
					<>
						<div className="tw-row">
							<label>
								第二画面资源
								<select
									value={layout.secondary?.resourceId ?? ""}
									onChange={(e) =>
										update({
											secondary: e.target.value
												? {
														resourceId: e.target.value,
														region: layout.secondary?.region ?? {
															x: 0.55,
															y: 0.1,
															width: 0.4,
															height: 0.45,
														},
													}
												: undefined,
										})
									}
								>
									<option value="">未设置</option>
									{template.resourceSlots
										.filter((r) =>
											["image", "video", "visual_media"].includes(
												r.representation,
											),
										)
										.map((r) => (
											<option key={r.id} value={r.id}>
												{r.description || r.id}
											</option>
										))}
								</select>
							</label>
							<Button
								size="icon"
								variant="ghost"
								aria-label="添加画面资源槽"
								title="添加画面资源槽"
								onClick={() => {
									const id = `broll-${crypto.randomUUID()}`;
									onChange({
										...template,
										resourceSlots: [
											...template.resourceSlots,
											{
												id,
												representation: "visual_media",
												description: "第二画面",
												tags: [],
											},
										],
										layouts: template.layouts.map((l) =>
											l.id === layout.id
												? {
														...l,
														secondary: {
															resourceId: id,
															region: l.secondary?.region ?? {
																x: 0.55,
																y: 0.1,
																width: 0.4,
																height: 0.45,
															},
														},
													}
												: l,
										),
									});
								}}
							>
								<Plus />
							</Button>
						</div>
						{layout.secondary && (
							<Region
								name="第二画面区域"
								value={layout.secondary.region}
								onChange={(region) =>
									update({
										secondary: {
											resourceId: layout.secondary!.resourceId,
											region,
										},
									})
								}
							/>
						)}
					</>
				)}
				<Region
					name="字幕区域"
					value={layout.captionRegion}
					onChange={(captionRegion) => update({ captionRegion })}
				/>
				<div className="tw-row">
					<label>
						入场效果
						<select
							value={entrance?.effect ?? "cut"}
							onChange={(e) => updateEntrance({ effect: e.target.value })}
						>
							{Object.entries(entrances).map(([value, label]) => (
								<option
									key={value}
									value={value}
									disabled={value === "dissolve"}
								>
									{label}
								</option>
							))}
						</select>
					</label>
					<label>
						入场时长（秒）
						<input
							type="number"
							min="0"
							max="2"
							step="0.05"
							disabled={!entrance}
							value={entrance?.durationSeconds ?? 0}
							onChange={(e) =>
								updateEntrance({ durationSeconds: Number(e.target.value) })
							}
						/>
					</label>
				</div>
				<div className="tw-section-title">
					<h3>布局衔接关系</h3>
					<Button
						size="icon"
						variant="ghost"
						title="添加布局衔接"
						aria-label="添加布局衔接"
						disabled={template.layouts.length < 2}
						onClick={() =>
							onChange({
								...template,
								transitionRules: [
									...template.transitionRules,
									{
										id: `transition-${crypto.randomUUID()}`,
										fromLayoutId: layout.id,
										toLayoutId: template.layouts.find(
											(l) => l.id !== layout.id,
										)!.id,
										effect: "cut",
										durationSeconds: 0,
									},
								],
							})
						}
					>
						<Plus />
					</Button>
				</div>
				{template.transitionRules.map((rule) => (
					<div className="tw-row" key={rule.id}>
						{(
							[
								["fromLayoutId", "前布局"],
								["toLayoutId", "后布局"],
							] as const
						).map(([key, title]) => (
							<label key={key}>
								{title}
								<select
									value={rule[key]}
									onChange={(e) =>
										onChange({
											...template,
											transitionRules: template.transitionRules.map((r) =>
												r.id === rule.id ? { ...r, [key]: e.target.value } : r,
											),
										})
									}
								>
									{template.layouts.map((l) => (
										<option key={l.id} value={l.id}>
											{l.description || l.id}
										</option>
									))}
								</select>
							</label>
						))}
						<label>
							衔接
							<select
								value={rule.effect}
								onChange={(e) =>
									onChange({
										...template,
										transitionRules: template.transitionRules.map((r) =>
											r.id === rule.id
												? {
														...r,
														effect: e.target.value,
														durationSeconds:
															e.target.value === "dissolve"
																? r.durationSeconds || 0.2
																: 0,
													}
												: r,
										),
									})
								}
							>
								<option value="cut">直接切换</option>
								<option value="dissolve">交叉溶解</option>
							</select>
						</label>
						<label>
							衔接时长（秒）
							<input
								type="number"
								aria-label="衔接时长（秒）"
								min={0.001}
								max={2}
								step={0.01}
								disabled={rule.effect === "cut"}
								value={rule.durationSeconds}
								onChange={(e) =>
									onChange({
										...template,
										transitionRules: template.transitionRules.map((r) =>
											r.id === rule.id
												? { ...r, durationSeconds: e.target.valueAsNumber }
												: r,
										),
									})
								}
							/>
						</label>
						<Button
							size="icon"
							variant="ghost"
							title="删除衔接"
							aria-label={`删除衔接 ${rule.id}`}
							onClick={() =>
								onChange({
									...template,
									transitionRules: template.transitionRules.filter(
										(r) => r.id !== rule.id,
									),
								})
							}
						>
							<Trash2 />
						</Button>
					</div>
				))}
				<fieldset className="tw-layout-intents">
					<legend>口播意图</legend>
					{Object.entries(intents).map(([value, label]) => (
						<label key={value}>
							<input
								type="checkbox"
								checked={layout.intents.includes(value)}
								onChange={(e) =>
									update({
										intents: e.target.checked
											? [...layout.intents, value]
											: layout.intents.filter((v) => v !== value),
									})
								}
							/>
							{label}
						</label>
					))}
				</fieldset>
			</div>
		</section>
	);
}
