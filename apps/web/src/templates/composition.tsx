"use client";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Composition, Template } from "./types";
import { SizeBindingControls } from "./size-binding-controls";
import { MotionCoverageControls } from "./motion-coverage-controls";
import { ReadingReplicaControls } from "./reading-replica-controls";

const empty: Composition = {
	groups: [],
	treatments: [],
	applications: [],
	transitionEffects: [],
	transitions: [],
	spatialRelations: [],
	scheduling: [],
	resourceRequirements: [],
};
function Add({
	label,
	onClick,
	disabled = false,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
}) {
	return (
		<Button
			size="icon"
			variant="ghost"
			title={label}
			aria-label={label}
			onClick={onClick}
			disabled={disabled}
		>
			<Plus />
		</Button>
	);
}
function Remove({ label, onClick }: { label: string; onClick: () => void }) {
	return (
		<Button
			size="icon"
			variant="ghost"
			title={label}
			aria-label={label}
			onClick={onClick}
		>
			<Trash2 />
		</Button>
	);
}
function Numeric({
	label,
	value,
	onChange,
	min = 0,
	max = 3600,
	step = 0.1,
}: {
	label: string;
	value: number;
	onChange: (v: number) => void;
	min?: number;
	max?: number;
	step?: number;
}) {
	return (
		<label>
			{label}
			<input
				type="number"
				aria-label={label}
				value={value}
				min={min}
				max={max}
				step={step}
				onChange={(e) => onChange(e.target.valueAsNumber)}
			/>
		</label>
	);
}
function Choice({
	label,
	value,
	onChange,
	options,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	options: { id: string; name?: string }[];
}) {
	return (
		<label>
			{label}
			<select
				aria-label={label}
				value={value}
				onChange={(e) => onChange(e.target.value)}
			>
				{options.map((o) => (
					<option key={o.id} value={o.id}>
						{o.name ?? o.id}
					</option>
				))}
			</select>
		</label>
	);
}
export function CompositionEditor({
	template,
	onChange,
}: {
	template: Template;
	onChange: (t: Template) => void;
}) {
	const c = { ...empty, ...template.composition };
	const set = (value: Partial<Composition>) =>
		onChange({ ...template, composition: { ...c, ...value } });
	const visuals = template.elements.filter(
		(e) => e.features.representation !== "audio",
	);
	const visualSlots = template.resourceSlots.filter((s) =>
		["image", "video", "visual_media"].includes(s.representation),
	);
	return (
		<section className="tw-composition" aria-label="正交能力与关系">
			<details><summary>主读文字与装饰副本</summary>
				{template.elements.filter(element => element.features.representation === "text").map(element => <ReadingReplicaControls key={element.id} element={element} elements={template.elements} relations={c.readingReplicas ?? []} onChange={primaryId => set({ readingReplicas: [...(c.readingReplicas ?? []).filter(entry => entry.elementId !== element.id), ...(primaryId ? [{ elementId: element.id, primaryId }] : [])] })}/>)}
			</details>
			<div className="tw-section-title"><h2>元素生命周期</h2><Add label="添加生命周期" disabled={!visuals.length} onClick={()=>set({lifecycles:[...(c.lifecycles??[]),{elementId:visuals[0].id,startEventId:"auto-video",endEventId:"auto-video"}]})} /></div>
			{(c.lifecycles??[]).map((r,i)=><div className="tw-fields" key={i}>
				<Choice label="元素" value={r.elementId} options={visuals} onChange={elementId=>set({lifecycles:c.lifecycles!.map((v,j)=>j===i?{...v,elementId}:v)})} />
				{(["startEventId","endEventId"] as const).map(key=><label key={key}>{key === "startEventId"?"开始事件":"结束事件"}<input value={r[key]} onChange={e=>set({lifecycles:c.lifecycles!.map((v,j)=>j===i?{...v,[key]:e.target.value}:v)})} /></label>)}
				<Remove label="删除生命周期" onClick={()=>set({lifecycles:c.lifecycles!.filter((_,j)=>j!==i)})} />
			</div>)}
			<div className="tw-section-title"><h2>出现联动</h2><Add label="添加出现联动" disabled={visuals.length<2} onClick={()=>set({stateRelations:[...(c.stateRelations??[]),{sourceElementId:visuals[0].id,targetElementId:visuals[1].id,opacity:0.35,durationSeconds:0.2}]})} /></div>
			{(c.stateRelations??[]).map((r,i)=>{const change=(v:Partial<typeof r>)=>set({stateRelations:c.stateRelations!.map((s,j)=>j===i?{...s,...v}:s)});return <div className="tw-fields" key={i}>
				<Choice label="出现元素" value={r.sourceElementId} options={visuals} onChange={sourceElementId=>change({sourceElementId})} />
				<Choice label="变暗元素" value={r.targetElementId} options={visuals} onChange={targetElementId=>change({targetElementId})} />
				<Numeric label="目标透明度" value={r.opacity} max={1} step={0.05} onChange={opacity=>change({opacity})} />
				<Numeric label="变化时长" value={r.durationSeconds} min={0.001} max={10} step={0.01} onChange={durationSeconds=>change({durationSeconds})} />
				<Remove label="删除联动" onClick={()=>set({stateRelations:c.stateRelations!.filter((_,j)=>j!==i)})} />
			</div>})}
			<div className="tw-section-title"><h2>累积列表</h2><Add label="添加累积列表" disabled={!visuals.length} onClick={()=>set({accumulatingLists:[...(c.accumulatingLists??[]),{items:[],endEventId:"auto-video"}]})} /></div>
			{(c.accumulatingLists??[]).map((list,i)=>{const change=(v:Partial<typeof list>)=>set({accumulatingLists:c.accumulatingLists!.map((s,j)=>j===i?{...s,...v}:s)});return <div key={i}>
				<label>共同结束事件<input value={list.endEventId} onChange={e=>change({endEventId:e.target.value})} /></label>
				<Add label="添加列表项" disabled={!visuals.length} onClick={()=>change({items:[...list.items,{elementId:visuals[0].id,startEventId:"auto-video"}]})} />
				<Remove label="删除累积列表" onClick={()=>set({accumulatingLists:c.accumulatingLists!.filter((_,j)=>j!==i)})} />
				{list.items.map((item,k)=><div className="tw-fields" key={k}><Choice label="列表文字" value={item.elementId} options={visuals.filter(e=>e.features.representation==="text")} onChange={elementId=>change({items:list.items.map((s,j)=>j===k?{...s,elementId}:s)})} /><label>出现事件<input value={item.startEventId} onChange={e=>change({items:list.items.map((s,j)=>j===k?{...s,startEventId:e.target.value}:s)})} /></label><Remove label="删除列表项" onClick={()=>change({items:list.items.filter((_,j)=>j!==k)})} /></div>)}
			</div>})}
			<div className="tw-section-title">
				<h2>可复用处理</h2>
				<Add
					label="添加处理"
					onClick={() =>
						set({
							treatments: [
								...c.treatments,
								{
									id: `treatment-${crypto.randomUUID()}`,
									operation: { kind: "blur", intensity: 10 },
								},
							],
						})
					}
				/>
			</div>
			{c.treatments.map((t, i) => {
				const update = (operation: typeof t.operation) =>
					set({
						treatments: c.treatments.map((v, n) =>
							n === i ? { ...v, operation } : v,
						),
					});
				return (
					<fieldset key={t.id}>
						<legend>{t.id}</legend>
						<div className="tw-fields">
							<Choice
								label="处理类型"
								value={t.operation.kind}
								options={[
									{ id: "blur", name: "模糊" },
									{ id: "color_grade", name: "调色" },
									{ id: "motion", name: "动效" },
									{ id: "text_highlight", name: "文字着色" },
									{ id: "canvas_clip", name: "固定画布裁切" },
								]}
								onChange={(kind) =>
									update(
										kind === "canvas_clip" ? {kind, region:{x:0,y:0,width:1,height:1}} : kind === "text_highlight"
											? { kind, color: "#FFD64F", mode: "keyword" }
											: kind === "blur"
											? { kind, intensity: 10 }
											: kind === "color_grade"
												? {
														kind,
														exposure: 0,
														contrast: 0,
														saturation: 0,
														temperature: 0,
													}
												: {
														kind: "motion",
														channels: [
															{
																property: "opacity",
																keys: [
																	{ time: 0, value: 0, easing: "linear" },
																	{ time: 1, value: 1, easing: "linear" },
																],
															},
														],
													},
									)
								}
							/>
							{t.operation.kind === "text_highlight" && (
								<>
									<label>着色颜色
										<input type="color" aria-label="着色颜色" value={t.operation.color}
											onChange={(e) => {
												if (t.operation.kind === "text_highlight") update({ ...t.operation, color: e.target.value });
											}} />
									</label>
									<label><input type="checkbox" checked={!!t.operation.stroke} onChange={e => {if(t.operation.kind === "text_highlight") update({...t.operation,stroke:e.target.checked?{color:"#fff2d4",width:3}:undefined});}} />独立描边</label>
									{t.operation.stroke && <><label>描边颜色<input type="color" value={t.operation.stroke.color} onChange={e=>{if(t.operation.kind==="text_highlight"&&t.operation.stroke) update({...t.operation,stroke:{...t.operation.stroke,color:e.target.value}});}} /></label><Numeric label="描边宽度" value={t.operation.stroke.width} max={30} onChange={width=>{if(t.operation.kind==="text_highlight"&&t.operation.stroke)update({...t.operation,stroke:{...t.operation.stroke,width}});}} /></>}
									<ToggleGroup type="single" variant="outline" size="sm" aria-label="着色模式"
										value={t.operation.mode ?? "keyword"}
										onValueChange={(mode) => {
											if (t.operation.kind === "text_highlight" && (mode === "keyword" || mode === "active_word"))
												update({ ...t.operation, mode });
										}}>
										<ToggleGroupItem value="keyword" aria-label="关键词强调">关键词强调</ToggleGroupItem>
										<ToggleGroupItem value="active_word" aria-label="逐词跟读">逐词跟读</ToggleGroupItem>
									</ToggleGroup>
								</>
							)}
							{t.operation.kind === "canvas_clip" && (["x","y","width","height"] as const).map(key=><Numeric key={key} label={`裁切 ${key}`} value={t.operation.kind === "canvas_clip" ? t.operation.region[key] : 0} max={1} step={0.01} onChange={value=>{if(t.operation.kind === "canvas_clip")update({...t.operation,region:{...t.operation.region,[key]:value}});}} />)}
							{t.operation.kind === "blur" && (
								<Numeric
									label="模糊强度"
									value={t.operation.intensity}
									max={100}
									onChange={(intensity) => update({ kind: "blur", intensity })}
								/>
							)}
							{t.operation.kind === "color_grade" &&
								(
									[
										["exposure", "曝光", -3, 3],
										["contrast", "对比度", -100, 100],
										["saturation", "饱和度", -100, 200],
										["temperature", "色温", -100, 100],
									] as const
								).map(([key, label, min, max]) => {
									const op = t.operation as Extract<
										typeof t.operation,
										{ kind: "color_grade" }
									>;
									return (
										<Numeric
											key={key}
											label={label}
											value={op[key]}
											min={min}
											max={max}
											onChange={(value) => update({ ...op, [key]: value })}
										/>
									);
								})}
							{t.operation.kind === "motion" && <>
                                <label className="tw-check"><input type="checkbox" checked={t.operation.motionTiming != null} disabled={t.operation.repeatSeconds != null} onChange={event=>{if(t.operation.kind==="motion")update({...t.operation,motionTiming:event.target.checked?{enterEnd:0.2,exitStart:0.8,enterSeconds:0.2,exitSeconds:0.15}:undefined});}} />固定入退场秒数</label>
                                {t.operation.motionTiming && ([['enterSeconds','入场时长（秒）',30],['exitSeconds','退场时长（秒）',30],['enterEnd','入场关键帧边界',1],['exitStart','退场关键帧边界',1]] as const).map(([key,label,max])=><Numeric key={key} label={label} value={t.operation.kind==="motion"?t.operation.motionTiming?.[key]??0:0} min={0} max={max} step={0.01} onChange={value=>{if(t.operation.kind==="motion"&&t.operation.motionTiming)update({...t.operation,motionTiming:{...t.operation.motionTiming,[key]:value}});}} />)}
								<label className="tw-check"><input type="checkbox" checked={t.operation.repeatSeconds != null} disabled={t.operation.motionTiming != null} onChange={(event) => { if (t.operation.kind === "motion") update({ ...t.operation, repeatSeconds: event.target.checked ? 1.2 : undefined }); }} />循环播放</label>
								{t.operation.motionTiming && <MotionCoverageControls label={`效果 ${t.id}`} timing={t.operation.motionTiming} onChange={motionTiming => { if (t.operation.kind === "motion") update({ ...t.operation, motionTiming }); }} />}
								{t.operation.repeatSeconds != null && <Numeric label="循环周期（秒）" value={t.operation.repeatSeconds} min={0.2} max={60} step={0.1} onChange={(value) => { if (t.operation.kind === "motion") update({ ...t.operation, repeatSeconds: value }); }} />}
							</>}
							{t.operation.kind === "motion" &&
								t.operation.channels.map((channel, n) => (
									<fieldset key={n}>
										<legend>通道 {n + 1}</legend>
										<Choice
											label="动效属性"
											value={channel.property}
											options={[
												{ id: "opacity", name: "透明度倍率" },
												{ id: "scale", name: "缩放倍率" },
												{ id: "x", name: "水平偏移" },
												{ id: "y", name: "垂直偏移" },
												{ id: "rotation", name: "旋转偏移" },
												{ id: "stroke_reveal", name: "描边显现（仅描边椭圆元素）" },
											]}
											onChange={(property) => {
												if (t.operation.kind === "motion")
													update({
														...t.operation,
														channels: t.operation.channels.map((m, j) =>
															j === n ? { ...m, property } : m,
														),
													});
											}}
										/>
										{channel.property === "stroke_reveal" && <p>取值 0–1，与当前描边显现进度相乘。只能应用到有线宽的描边椭圆元素；分组和布局不能执行这项处理。</p>}
										{channel.keys.map((key, k) => (
											<div className="tw-fields" key={k}>
												{(
													[
														["time", "时间比例"],
														["value", "数值"],
													] as const
												).map(([field, label]) => (
													<Numeric
														key={field}
														label={label}
														value={key[field]}
														min={field === "time" || channel.property === "stroke_reveal" ? 0 : -10000}
														max={field === "time" || channel.property === "stroke_reveal" ? 1 : 10000}
														step={0.01}
														onChange={(value) => {
															if (t.operation.kind === "motion")
																update({
																	...t.operation,
																	channels: t.operation.channels.map((m, j) =>
																		j === n
																			? {
																					...m,
																					keys: m.keys.map((v, q) =>
																						q === k
																							? { ...v, [field]: value }
																							: v,
																					),
																				}
																			: m,
																	),
																});
														}}
													/>
												))}
											</div>
										))}
									</fieldset>
								))}
							<Remove
								label={`删除处理 ${t.id}`}
								onClick={() =>
									set({
										treatments: c.treatments.filter((_, n) => n !== i),
										applications: c.applications.filter(
											(a) => a.treatmentId !== t.id,
										),
									})
								}
							/>
						</div>
					</fieldset>
				);
			})}
			<div className="tw-section-title">
				<h3>处理应用</h3>
				<Add
					label="添加处理应用"
					disabled={!c.treatments.length || !visuals.length}
					onClick={() =>
						set({
							applications: [
								...c.applications,
								{
									treatmentId: c.treatments[0].id,
									target: { kind: "element", id: visuals[0].id },
									enabled: true,
								},
							],
						})
					}
				/>
			</div>
			{c.applications.map((a, i) => {
				const update = (patch: Partial<typeof a>) =>
					set({
						applications: c.applications.map((v, n) =>
							n === i ? { ...v, ...patch } : v,
						),
					});
				const targets =
					a.target.kind === "element"
						? visuals
						: a.target.kind === "group"
							? c.groups
							: template.layouts;
				return (
					<div className="tw-fields" key={i}>
						<Choice
							label="处理"
							value={a.treatmentId}
							options={c.treatments}
							onChange={(treatmentId) => update({ treatmentId })}
						/>
						<Choice
							label="目标类型"
							value={a.target.kind}
							options={[
								{ id: "element", name: "元素" },
								...(c.groups.length ? [{ id: "group", name: "元素组" }] : []),
								{ id: "layout", name: "布局画面" },
							]}
							onChange={(v) => {
								const kind = v as typeof a.target.kind;
								update({
									target: {
										kind,
										id: (kind === "element"
											? visuals
											: kind === "group"
												? c.groups
												: template.layouts)[0].id,
									},
								});
							}}
						/>
						<Choice
							label="目标"
							value={a.target.id}
							options={targets}
							onChange={(id) => update({ target: { ...a.target, id } })}
						/>
						<label className="tw-check">
							<input
								type="checkbox"
								checked={a.enabled}
								onChange={(e) => update({ enabled: e.target.checked })}
							/>
							启用
						</label>
						<Remove
							label="删除处理应用"
							onClick={() =>
								set({ applications: c.applications.filter((_, n) => n !== i) })
							}
						/>
					</div>
				);
			})}
			<div className="tw-section-title">
				<h3>元素组</h3>
				<Add
					label="添加元素组"
					disabled={!visuals.length}
					onClick={() =>
						set({
							groups: [
								...c.groups,
								{
									id: `group-${crypto.randomUUID()}`,
									elementIds: [visuals[0].id],
								},
							],
						})
					}
				/>
			</div>
			{c.groups.map((g, i) => (
				<fieldset key={g.id}>
					<legend>{g.id}</legend>
					<label className="tw-check">
						<input
							type="checkbox"
							checked={g.composite ?? false}
							onChange={(e) =>
								set({
									groups: c.groups.map((v, n) =>
										n === i ? { ...v, composite: e.target.checked } : v,
									),
								})
							}
						/>
						整体合成
					</label>
                    {g.composite && <label className="tw-check"><input type="checkbox" checked={g.separateInstances ?? false} onChange={e=>set({groups:c.groups.map((v,n)=>n===i?{...v,separateInstances:e.target.checked}:v)})} />每个独立显示区间重新播放组动效</label>}
					<label className="tw-check">
						<input
							type="checkbox"
							checked={c.arrangements?.some((a) => a.groupId === g.id) ?? false}
							onChange={(e) =>
								set({
									arrangements: e.target.checked
										? [
												...(c.arrangements ?? []),
												{
													groupId: g.id,
													region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
													columns: 1,
													gap: 0.02,
												},
											]
										: (c.arrangements ?? []).filter((a) => a.groupId !== g.id),
								})
							}
						/>
						网格排列
					</label>
					{c.arrangements
						?.filter((a) => a.groupId === g.id)
						.map((a) => (
							<div className="tw-fields" key={a.groupId}>
								<Numeric
									label="列数"
									value={a.columns}
									min={1}
									max={g.elementIds.length}
									step={1}
									onChange={(columns) =>
										set({
											arrangements: c.arrangements!.map((v) =>
												v === a ? { ...v, columns } : v,
											),
										})
									}
								/>
								<Numeric
									label="网格间距"
									value={a.gap}
									max={1}
									step={0.01}
									onChange={(gap) =>
										set({
											arrangements: c.arrangements!.map((v) =>
												v === a ? { ...v, gap } : v,
											),
										})
									}
								/>
								{(["x", "y", "width", "height"] as const).map((key) => (
									<Numeric
										key={key}
										label={`排列区域 ${key}`}
										value={a.region[key]}
										max={1}
										step={0.01}
										onChange={(value) =>
											set({
												arrangements: c.arrangements!.map((v) =>
													v === a
														? { ...v, region: { ...v.region, [key]: value } }
														: v,
												),
											})
										}
									/>
								))}
							</div>
						))}
					{visuals.map((e) => (
						<label className="tw-check" key={e.id}>
							<input
								type="checkbox"
								checked={g.elementIds.includes(e.id)}
								onChange={(event) =>
									set({
										groups: c.groups.map((v, n) =>
											n === i
												? {
														...v,
														elementIds: event.target.checked
															? [...v.elementIds, e.id]
															: v.elementIds.filter((id) => id !== e.id),
													}
												: v,
										),
									})
								}
							/>
							{e.id}
						</label>
					))}
					<Remove
						label={`删除组 ${g.id}`}
						onClick={() =>
							set({
								groups: c.groups.filter((_, n) => n !== i),
								arrangements: c.arrangements?.filter((a) => a.groupId !== g.id),
								transitions: c.transitions.filter(
									(t) => t.fromElementId !== g.id && t.toElementId !== g.id,
								),
								applications: c.applications.filter(
									(a) => a.target.kind !== "group" || a.target.id !== g.id,
								),
							})
						}
					/>
				</fieldset>
			))}
			<div className="tw-section-title">
				<h2>转场定义</h2>
				<Add
					label="添加转场定义"
					onClick={() =>
						set({
							transitionEffects: [
								...c.transitionEffects,
								{
									id: `dissolve-${crypto.randomUUID()}`,
									effect: "dissolve",
									durationSeconds: 0.2,
									outgoingFade: true,
								},
							],
						})
					}
				/>
			</div>
			{c.transitionEffects.map((e, i) => (
				<fieldset key={e.id}>
					<legend>{e.id}</legend>
					<div className="tw-fields">
						<span>交叉溶解</span>
						<label className="tw-check">
							<input
								type="checkbox"
								checked={e.outgoingFade ?? false}
								onChange={(event) =>
									set({
										transitionEffects: c.transitionEffects.map((v, n) =>
											n === i
												? { ...v, outgoingFade: event.target.checked }
												: v,
										),
									})
								}
							/>
							前元素淡出
						</label>
						<Numeric
							label="转场时长（秒）"
							value={e.durationSeconds}
							min={0.001}
							max={2}
							step={0.01}
							onChange={(durationSeconds) =>
								set({
									transitionEffects: c.transitionEffects.map((v, n) =>
										n === i ? { ...v, durationSeconds } : v,
									),
								})
							}
						/>
						<Remove
							label={`删除转场 ${e.id}`}
							onClick={() =>
								set({
									transitionEffects: c.transitionEffects.filter(
										(_, n) => n !== i,
									),
									transitions: c.transitions.filter((r) => r.effectId !== e.id),
								})
							}
						/>
					</div>
				</fieldset>
			))}
			<div className="tw-section-title">
				<h3>元素衔接</h3>
				<Add
					label="添加元素衔接"
					disabled={!visuals.length || !c.transitionEffects.length}
					onClick={() =>
						set({
							transitions: [
								...c.transitions,
								{
									id: `relation-${crypto.randomUUID()}`,
									fromElementId: visuals[0].id,
									toElementId: visuals[0].id,
									effectId: c.transitionEffects[0].id,
								},
							],
						})
					}
				/>
			</div>
			{c.transitions.map((r, i) => {
				const update = (p: Partial<typeof r>) =>
					set({
						transitions: c.transitions.map((v, n) =>
							n === i ? { ...v, ...p } : v,
						),
					});
				return (
					<div key={r.id} className="tw-fields">
						<Choice
							label="前元素"
							value={r.fromElementId}
							options={[...visuals, ...c.groups.filter((g) => g.composite)]}
							onChange={(fromElementId) => update({ fromElementId })}
						/>
						<Choice
							label="后元素"
							value={r.toElementId}
							options={[...visuals, ...c.groups.filter((g) => g.composite)]}
							onChange={(toElementId) => update({ toElementId })}
						/>
						<Choice
							label="转场"
							value={r.effectId}
							options={c.transitionEffects}
							onChange={(effectId) => update({ effectId })}
						/>
						<Remove
							label="删除元素衔接"
							onClick={() =>
								set({ transitions: c.transitions.filter((_, n) => n !== i) })
							}
						/>
					</div>
				);
			})}
			<div className="tw-section-title">
				<h2>相对定位</h2>
				<Add
					label="添加相对定位"
					disabled={visuals.length < 2}
					onClick={() =>
						set({
							spatialRelations: [
								...c.spatialRelations,
								{
									elementId: visuals[1].id,
									relativeTo: visuals[0].id,
									placement: "below",
									gap: 0.01,
									offsetX: 0,
									offsetY: 0,
								},
							],
						})
					}
				/>
			</div>
			{c.spatialRelations.map((r, i) => {
				const update = (p: Partial<typeof r>) =>
					set({
						spatialRelations: c.spatialRelations.map((v, n) =>
							n === i ? { ...v, ...p } : v,
						),
					});
				return (
					<fieldset key={i}>
						<div className="tw-fields">
							<Choice
								label="定位元素"
								value={r.elementId}
								options={visuals}
								onChange={(elementId) => update({ elementId })}
							/>
							<Choice
								label="参照元素"
								value={r.relativeTo}
								options={visuals.filter((e) => e.id !== r.elementId)}
								onChange={(relativeTo) => update({ relativeTo })}
							/>
							<label className="tw-check">
								<input
									type="checkbox"
									checked={r.followMotion ?? false}
									disabled={r.referenceBounds === "text_box"}
									onChange={(e) => update({ followMotion: e.target.checked })}
								/>
								跟随运动
							</label>
                            <label>参照边界<select aria-label={`关系${i+1}参照边界`} value={r.referenceBounds??"layout"} disabled={!!r.sizeBinding} onChange={event=>update(event.target.value==="text_box"?{referenceBounds:"text_box",followMotion:true}:{referenceBounds:"layout"})}>
                                <option value="layout">布局区域</option><option value="text_box" disabled={visuals.find(v=>v.id===r.relativeTo)?.features.representation!=="text"}>文字实际边界</option>
                            </select>{r.sizeBinding&&<small>关闭尺寸跟随后可更换参照边界。</small>}</label>
                            <SizeBindingControls label={`关系${i+1}`} value={r.sizeBinding} eligible={r.referenceBounds==="text_box"&&r.followMotion===true&&visuals.find(v=>v.id===r.relativeTo)?.features.representation==="text"&&["rectangle","ellipse","star","line"].includes(visuals.find(v=>v.id===r.elementId)?.features.representation??"")} onChange={sizeBinding=>update({sizeBinding})}/>

							<Choice
								label="相对位置"
								value={r.placement}
								options={[
									{ id: "overlay", name: "居中重叠" },
									{ id: "above", name: "上方" },
									{ id: "below", name: "下方" },
									{ id: "left", name: "左侧" },
									{ id: "right", name: "右侧" },
								]}
								onChange={(placement) => update({ placement })}
							/>
							{(
								[
									["gap", "间距"],
									["offsetX", "水平偏移"],
									["offsetY", "垂直偏移"],
								] as const
							).map(([key, label]) => (
								<Numeric
									key={key}
									label={label}
									value={r[key]}
									min={key === "gap" ? 0 : -1}
									max={1}
									step={0.01}
									onChange={(value) => update({ [key]: value })}
								/>
							))}
							<Remove
								label="删除相对定位"
								onClick={() =>
									set({
										spatialRelations: c.spatialRelations.filter(
											(_, n) => n !== i,
										),
									})
								}
							/>
						</div>
					</fieldset>
				);
			})}
			<div className="tw-section-title">
				<h2>声音事件编排</h2>
				<Add
					label="添加声音编排规则"
					disabled={!template.elements.length}
					onClick={() =>
						set({
							scheduling: [
								...c.scheduling,
								{
									elementId: template.elements[0].id,
									eventKind: "beat",
									minConfidence: 0.5,
									minStrength: 0,
									cooldownSeconds: 0.5,
									maxOccurrences: 20,
									strengthWeight: 1,
									confidenceWeight: 1,
									repetitionPenalty: 0.1,
								},
							],
						})
					}
				/>
			</div>
			{c.scheduling.map((r, i) => {
				const update = (p: Partial<typeof r>) =>
					set({
						scheduling: c.scheduling.map((v, n) =>
							n === i ? { ...v, ...p } : v,
						),
					});
				return (
					<fieldset key={i}>
						<div className="tw-fields">
							<Choice
								label="触发元素"
								value={r.elementId}
								options={template.elements}
								onChange={(elementId) => update({ elementId })}
							/>
							<Choice
								label="时间事件"
								value={r.eventKind}
								options={[
									{ id: "video", name: "全片" },
									{ id: "semantic", name: "语义段落" },
									{ id: "caption", name: "字幕" },
									{ id: "keyword", name: "关键词" },
									{ id: "shot", name: "镜头" },
									{ id: "speech", name: "语音" },
									{ id: "beat", name: "节拍" },
									{ id: "onset", name: "起音" },
									{ id: "pause", name: "停顿" },
									{ id: "energy_peak", name: "能量峰" },
									{ id: "section", name: "乐段" },
								]}
								onChange={(eventKind) => update({ eventKind })}
							/>
							{(
								[
									["minConfidence", "置信度下限", 1],
									["minStrength", "强度下限", 1],
									["cooldownSeconds", "冷却（秒）", 3600],
									["maxOccurrences", "次数上限", 10000],
									["strengthWeight", "强度权重", 100],
									["confidenceWeight", "置信度权重", 100],
									["repetitionPenalty", "重复惩罚", 100],
								] as const
							).map(([key, label, max]) => (
								<Numeric
									key={key}
									label={label}
									value={r[key]}
									max={max}
									step={key === "maxOccurrences" ? 1 : 0.1}
									onChange={(value) => update({ [key]: value })}
								/>
							))}
							<Remove
								label="删除声音编排规则"
								onClick={() =>
									set({ scheduling: c.scheduling.filter((_, n) => n !== i) })
								}
							/>
						</div>
					</fieldset>
				);
			})}
			<h3>布局选择</h3>
			<label className="tw-check">
				<input
					type="checkbox"
					checked={!!c.layoutPolicy}
					onChange={(e) =>
						set({
							layoutPolicy: e.target.checked
								? {
										intentMatchWeight: 1,
										repetitionPenalty: 0.2,
										minHoldSeconds: 2,
										baseScores: {},
									}
								: undefined,
						})
					}
				/>
				评分选择
			</label>
			{c.layoutPolicy && (
				<div className="tw-fields">
					<Choice
						label="布局时间来源"
						value={c.layoutPolicy.eventKind ?? "speech_semantics"}
						options={[
							{ id: "speech_semantics", name: "口播语义" },
							{ id: "caption", name: "字幕" },
							{ id: "shot", name: "镜头" },
							{ id: "video", name: "全片" },
							{ id: "beat", name: "节拍" },
							{ id: "onset", name: "起音" },
							{ id: "pause", name: "停顿" },
							{ id: "energy_peak", name: "能量峰" },
							{ id: "section", name: "乐段" },
						]}
						onChange={(eventKind) =>
							set({
								layoutPolicy: {
									...c.layoutPolicy!,
									eventKind:
										eventKind === "speech_semantics" ? undefined : eventKind,
								},
							})
						}
					/>
					{(
						[
							["intentMatchWeight", "意图匹配权重"],
							["repetitionPenalty", "布局重复惩罚"],
							["minHoldSeconds", "最短保持（秒）"],
						] as const
					).map(([key, label]) => (
						<Numeric
							key={key}
							label={label}
							value={c.layoutPolicy![key]}
							onChange={(value) =>
								set({ layoutPolicy: { ...c.layoutPolicy!, [key]: value } })
							}
						/>
					))}
					{template.layouts.map((l) => (
						<Numeric
							key={l.id}
							label={`${l.id} 基础分`}
							value={c.layoutPolicy!.baseScores[l.id] ?? 0}
							min={-100}
							max={100}
							onChange={(value) =>
								set({
									layoutPolicy: {
										...c.layoutPolicy!,
										baseScores: {
											...c.layoutPolicy!.baseScores,
											[l.id]: value,
										},
									},
								})
							}
						/>
					))}
				</div>
			)}
			<div className="tw-section-title">
				<h2>资源约束</h2>
				<Add
					label="添加资源约束"
					disabled={!visualSlots.length}
					onClick={() =>
						set({
							resourceRequirements: [
								...c.resourceRequirements,
								{
									slotId: visualSlots[0].id,
									required: true,
									minDurationSeconds: 0,
									minWidth: 0,
									minHeight: 0,
									minAspectRatio: 0.1,
									maxAspectRatio: 10,
									allowCrop: true,
									requiredTags: [],
									fallbackSlotIds: [],
								},
							],
						})
					}
				/>
			</div>
			{c.resourceRequirements.map((r, i) => {
				const update = (p: Partial<typeof r>) =>
					set({
						resourceRequirements: c.resourceRequirements.map((v, n) =>
							n === i ? { ...v, ...p } : v,
						),
					});
				return (
					<fieldset key={i}>
						<div className="tw-fields">
							<Choice
								label="约束资源槽"
								value={r.slotId}
								options={visualSlots}
								onChange={(slotId) => update({ slotId })}
							/>
							{(
								[
									["required", "必需资源"],
									["allowCrop", "允许裁切"],
								] as const
							).map(([key, label]) => (
								<label className="tw-check" key={key}>
									<input
										type="checkbox"
										checked={r[key]}
										onChange={(e) => update({ [key]: e.target.checked })}
									/>
									{label}
								</label>
							))}
							{(
								[
									["minDurationSeconds", "最短素材（秒）", 3600],
									["minWidth", "最小宽度", 32768],
									["minHeight", "最小高度", 32768],
									["minAspectRatio", "最小宽高比", 100],
									["maxAspectRatio", "最大宽高比", 100],
								] as const
							).map(([key, label, max]) => (
								<Numeric
									key={key}
									label={label}
									value={r[key]}
									max={max}
									step={key === "minWidth" || key === "minHeight" ? 1 : 0.1}
									onChange={(value) => update({ [key]: value })}
								/>
							))}
							<label>
								必需标签
								<input
									value={r.requiredTags.join(",")}
									onChange={(e) =>
										update({
											requiredTags: e.target.value
												.split(",")
												.map((s) => s.trim())
												.filter(Boolean),
										})
									}
								/>
							</label>
							<label>
								备用资源槽
								<input
									value={r.fallbackSlotIds.join(",")}
									onChange={(e) =>
										update({
											fallbackSlotIds: e.target.value
												.split(",")
												.map((s) => s.trim())
												.filter(Boolean),
										})
									}
								/>
							</label>
							<Remove
								label="删除资源约束"
								onClick={() =>
									set({
										resourceRequirements: c.resourceRequirements.filter(
											(_, n) => n !== i,
										),
									})
								}
							/>
						</div>
					</fieldset>
				);
			})}
		</section>
	);
}
