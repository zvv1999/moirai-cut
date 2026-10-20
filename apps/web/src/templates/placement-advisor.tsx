"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { TrialTransform as Transform } from "./trial-transform";

type Rect = { x: number; y: number; width: number; height: number };
type Region = { id: string; region: Rect };
export type PlacementPolicy = { safeInset: number; requireFullCoverage: boolean };
export type PlacementProtection = { regions: Region[]; padding: number; policy?: PlacementPolicy };
export type PlacementAdvice = {
 selectedId: string | null;
 application: { transform?: Transform } | null;
 candidates: { id: string; eligible: boolean; reason: string; bounds?: Rect; blockers?: string[] }[];
 decision?: "propose" | "skip" | "needs_evidence";
 search?: { method: string; complete: boolean; evaluatedCenters: number };
 geometryCheck?: { status: string; placementCertified: boolean; translationEquivariant?: boolean };
 measuredGeometryCheck?: { status: string; placementCertified: boolean; elementIds: string[] };
};
const defaultPolicy: PlacementPolicy = { safeInset: 0, requireFullCoverage: false };
const names: Record<string, string> = { current: "当前位置", upper_left: "左上", upper_right: "右上", lower_left: "左下", lower_right: "右下", top: "上方", bottom: "下方" };
export function placementCandidateName(id: string) { return names[id] ?? (/^auto-\d+$/.test(id) ? `自动候选 ${id.slice(5)}` : id); }

/** Input controls only. The native service validates and applies the rule. */
export function PlacementPolicyControls({ policy, onChange }: { policy: PlacementPolicy; onChange: (policy: PlacementPolicy) => void }) {
 return <>
  <label>画面安全边距（%）<input aria-label="画面安全边距" type="number" min={0} max={25} step={1} value={policy.safeInset * 100} onChange={event => { if (Number.isFinite(event.target.valueAsNumber)) onChange({ ...policy, safeInset: event.target.valueAsNumber / 100 }); }} /></label>
  <label><input aria-label="要求完整避让证据" type="checkbox" checked={policy.requireFullCoverage} onChange={event => onChange({ ...policy, requireFullCoverage: event.target.checked })} /> 要求完整避让证据后再给出方案</label>
  <small>包括入场、停留、退场的完整范围，以及保护内容在整段中的移动范围。当前面板生成待预览方案；启用后还需采集全程证据，可由 AI 提交，圈出单帧不代表已完成检查。</small>
 </>;
}

/** Present native decisions without turning a geometric proposal into an approval. */
export function PlacementAdviceResult({ advice, policy, regions, disabled, onApply }: { advice: PlacementAdvice; policy: PlacementPolicy; regions: Region[]; disabled: boolean; onApply: (transform: Transform) => void }) {
 const legacyStrict = policy.requireFullCoverage && advice.decision === undefined;
 const needsEvidence = advice.decision === "needs_evidence" || legacyStrict;
 const proposed = !needsEvidence && advice.decision !== "skip" && !!advice.selectedId && !!advice.application;
 const incompleteSearch = advice.search?.complete === false;
 return <div role="status">
  <p>{needsEvidence ? "尚缺完整避让证据，暂不生成应用位置。请补充整段动效范围和保护内容的覆盖证据。" : proposed ? `待预览方案：${placementCandidateName(advice.selectedId!)}` : incompleteSearch ? "当前搜索尚未找到可用位置。请交给 AI 继续检查，或跳过本次叠加。" : "没有满足当前保护区和安全边距的位置。请跳过本次叠加，或换一种画面构图后重新评估。"}</p>
  {legacyStrict && <p>当前服务未返回完整避让证据状态，请更新服务后重新检查。</p>}
  {advice.geometryCheck?.translationEquivariant === false && <p>这组动效的位置变化还会影响实际运动范围，需要重新测量候选位置。</p>}
  {advice.geometryCheck?.status === "partial_envelope" && <p>现有动效范围证据不完整；候选位置仍需检查实际成片。</p>}
  {advice.measuredGeometryCheck?.status === "requires_render_measurement" && <p>图形尺寸随文字变化，还需测量实际图形边界。</p>}
  {advice.search && <p>已比较 {advice.search.evaluatedCenters} 个位置，保持字号、大小和动效。</p>}
  <ul>{advice.candidates.map(candidate => <li key={candidate.id}>{placementCandidateName(candidate.id)}：{candidate.eligible ? "几何候选，待预览验证" : candidate.reason === "protected_region" ? `与 ${candidate.blockers?.map(id => { const index = regions.findIndex(region => region.id === id); return index >= 0 ? `保护区 ${index + 1}` : id; }).join("、")} 相交` : candidate.reason === "candidate_requires_render_measurement" ? "此位置需要重新测量动效范围" : candidate.reason === "evidence_incomplete" ? "全程避让证据不完整" : candidate.reason === "reading_quality" ? "未满足阅读要求" : "不满足画面边界或当前应用约束"}</li>)}</ul>
  {proposed && (advice.application?.transform ? <Button disabled={disabled} onClick={() => onApply(advice.application!.transform!)}>应用待预览方案</Button> : <p>当前应用已在候选位置，请继续检查实际成片。</p>)}
  <small>位置建议不代表通过验收，仍需检查实际成片。</small>
 </div>;
}

/** UI supplies content geometry; Rust owns candidate generation and selection. */
export function PlacementAdvisor({ application, disabled, getSnapshot, onApply, protection, onProtectionChange }: { application: Record<string, unknown> & { canvas: { width: number; height: number } }; disabled: boolean; getSnapshot: () => string | undefined; onApply: (transform: Transform) => void; protection?: PlacementProtection; onProtectionChange?: (value: PlacementProtection) => void }) {
 const [localRegions, setLocalRegions] = useState<Region[]>([]), [localPadding, setLocalPadding] = useState(.02), [localPolicy, setLocalPolicy] = useState(defaultPolicy);
 const regions = protection?.regions ?? localRegions, padding = protection?.padding ?? localPadding, policy = protection?.policy ?? localPolicy;
 const setRegions = (next: Region[]) => { setLocalRegions(next); onProtectionChange?.({ regions: next, padding, policy }); };
 const setPadding = (next: number) => { setLocalPadding(next); onProtectionChange?.({ regions, padding: next, policy }); };
 const setPolicy = (next: PlacementPolicy) => { setLocalPolicy(next); onProtectionChange?.({ regions, padding, policy: next }); };
 const [snapshot, setSnapshot] = useState<string>(), [error, setError] = useState(""), [busy, setBusy] = useState(false), [applied, setApplied] = useState(false);
 const [result, setResult] = useState<{ key: string; value: PlacementAdvice }>();
 const [drag, setDrag] = useState<{ x: number; y: number; endX: number; endY: number }>();
 const start = useRef<{ x: number; y: number } | undefined>(undefined), request = useRef<AbortController | undefined>(undefined);
 const key = JSON.stringify({ application, regions, padding, policy }); const currentKey = useRef(key); currentKey.current = key;
 useEffect(() => { request.current?.abort(); setBusy(false); setError(""); setApplied(false); }, [key]);
 useEffect(() => () => request.current?.abort(), []);
 const advice = result?.key === key ? result.value : undefined;
 const selected = advice?.candidates.find(candidate => candidate.id === advice.selectedId);
 const point = (event: React.PointerEvent<SVGSVGElement>) => { const box = event.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) }; };
 function add(region: Rect) { if (regions.length >= 64) return; setRegions([...regions, { id: `region-${crypto.randomUUID()}`, region }]); }
 async function suggest() {
  const controller = new AbortController(); request.current?.abort(); request.current = controller; setBusy(true); setError(""); setApplied(false);
  const captured = key;
  try {
   const response = await fetch('/api/footage/templates/dynamic-assets/placement-advice', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'moirai-footage' }, body: JSON.stringify({ application, protectedRegions: regions, padding, policy }), signal: controller.signal });
   const data = await response.json();
   if (!response.ok) throw Error(typeof data.error === "string" && /unknown field.*policy/.test(data.error) ? "当前素材库服务尚不支持避让规则，请更新服务后重试。" : data.error ?? '无法计算位置建议');
   if (currentKey.current === captured) setResult({ key: captured, value: data });
  } catch (failure) { if (!controller.signal.aborted && currentKey.current === captured) setError(failure instanceof Error ? failure.message : '无法计算位置建议'); }
  finally { if (request.current === controller) setBusy(false); }
 }
 const drawing = drag ? { x: Math.min(drag.x, drag.endX), y: Math.min(drag.y, drag.endY), width: Math.abs(drag.endX - drag.x), height: Math.abs(drag.endY - drag.y) } : undefined;
 return <details className="tw-placement-advisor"><summary>避开画面里的重要内容</summary>
  <p>圈出人物、字幕或标识的保护范围，系统根据同一避让规则寻找移动距离较小的位置，保持字号、大小与动效。其他叠加素材也应圈入保护区。</p>
  <fieldset disabled={disabled || busy}>
   <Button variant="outline" onClick={() => { try { const image = getSnapshot(); if (!image) throw Error('请等待预览画面显示'); setSnapshot(image); setError(""); } catch (failure) { setError(failure instanceof Error ? failure.message : '无法读取预览画面'); } }}>取当前预览画面</Button>
   <div className="tw-placement-board" style={{ aspectRatio: `${application.canvas.width} / ${application.canvas.height}` }}>
    {snapshot && <img src={snapshot} alt="用于圈选保护区的预览帧" draggable={false} />}
    <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-label="拖动圈选保护区" onPointerDown={event => { if (disabled || busy) return; const p = point(event); start.current = p; setDrag({ ...p, endX: p.x, endY: p.y }); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (!start.current) return; const p = point(event); setDrag({ ...start.current, endX: p.x, endY: p.y }); }} onPointerCancel={() => { start.current = undefined; setDrag(undefined); }} onPointerUp={event => { if (!start.current) return; const p = point(event), a = start.current; start.current = undefined; setDrag(undefined); const region = { x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), width: Math.abs(a.x - p.x), height: Math.abs(a.y - p.y) }; if (region.width > .005 && region.height > .005) add(region); }}>
     {regions.map(region => <rect key={region.id} {...region.region} fill="#e46a6a44" stroke="#ff9797" strokeWidth=".004" />)}
     {drawing && <rect {...drawing} fill="#e46a6a44" stroke="#ff9797" strokeWidth=".004" />}
     {selected?.bounds && <rect {...selected.bounds} fill="#eeb65333" stroke="#eeb653" strokeDasharray=".015 .01" strokeWidth=".004" />}
    </svg>
   </div>
   <small>红框为保护区，黄虚线框为待验证方案。请考虑整段中的移动范围；更换素材、构图、画幅或叠加样式后需重新圈选。</small>
   <Button variant="outline" disabled={regions.length >= 64} onClick={() => add({ x: .1, y: .1, width: .2, height: .2 })}>添加保护框</Button>
   {regions.map((region, index) => <div className="tw-placement-region" key={region.id}><span>保护区 {index + 1}</span>{(['x', 'y', 'width', 'height'] as const).map((field, fieldIndex) => <label key={field}>{['左', '上', '宽', '高'][fieldIndex]}（%）<input aria-label={`保护区${index + 1}${field}`} type="number" min={0} max={100} step={1} value={Math.round(region.region[field] * 10000) / 100} onChange={event => { const value = event.target.valueAsNumber; if (Number.isFinite(value)) setRegions(regions.map(item => item.id === region.id ? { ...item, region: { ...item.region, [field]: value / 100 } } : item)); }} /></label>)}<Button variant="ghost" aria-label={`移除保护区${index + 1}`} onClick={() => setRegions(regions.filter(item => item.id !== region.id))}>移除</Button></div>)}
   <label>保护区额外留白（%）<input aria-label="避让留白" type="number" min={0} max={25} step={1} value={padding * 100} onChange={event => { if (Number.isFinite(event.target.valueAsNumber)) setPadding(event.target.valueAsNumber / 100); }} /></label>
   <PlacementPolicyControls policy={policy} onChange={setPolicy} />
   <Button onClick={() => void suggest()}>{busy ? '正在寻找…' : '按规则寻找位置'}</Button>
  </fieldset>
  {error && <p role="alert">{error}</p>}
  {advice && <PlacementAdviceResult advice={advice} policy={policy} regions={regions} disabled={disabled || busy} onApply={transform => { onApply(transform); setApplied(true); }} />}
  {applied && <p role="status">已应用待预览方案，请检查整段动效与画面内容。</p>}
  <small>当前面板不自动识别人脸，也未采集完整动效边界。单帧圈选和静态位置建议不代表整段安全；阅读效果和实际成片仍需检查。</small>
 </details>;
}
