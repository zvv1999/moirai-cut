"use client";

import type { ReadingReplica } from "./types";

type TextLayer = {
	id: string;
	description: string;
	features: { representation: string; role?: string | null };
};

/** Authoring only. Native validation and production diagnostics verify the relationship. */
export function ReadingReplicaControls({ element, elements, relations, onChange, disabled = false }: {
	element: TextLayer;
	elements: TextLayer[];
	relations: ReadingReplica[];
	onChange: (primaryId: string | null) => void;
	disabled?: boolean;
}) {
	if (element.features.representation !== "text") return null;
	const relation = relations.find(entry => entry.elementId === element.id);
	const decorative = element.features.role === "decoration";
	const choices = elements.filter(entry => entry.id !== element.id && entry.features.representation === "text" && entry.features.role !== "decoration");
	const existing = relation && !choices.some(entry => entry.id === relation.primaryId);
	return <fieldset disabled={disabled}>
		<legend>{element.description || element.id} · 文字阅读关系</legend>
		<label>主读文字<select aria-label={`${element.description}的主读文字`} value={relation?.primaryId ?? ""} disabled={!decorative && !relation} onChange={event => onChange(event.target.value || null)}>
			<option value="">独立阅读</option>
			{existing && <option value={relation.primaryId} disabled>需修复的关联：{relation.primaryId}</option>}
			{choices.map(entry => <option key={entry.id} value={entry.id} disabled={!decorative}>{entry.description}</option>)}
		</select></label>
		{!decorative && <p>要作为同文装饰副本，请先把当前图层的语义角色设为“装饰”。已有关系可清除。</p>}
		<p className="tw-style-guidance">适用于描边、彩色重影等同内容文字层。只指定由哪层承担阅读，不改变文字、位置或动效。成片中内容来源一致且主字读得清楚，才能免去副本的独立停留要求；仍需检查遮挡与视觉干扰。</p>
	</fieldset>;
}
