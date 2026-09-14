"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { Loader2, Save, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { libraryHeaders } from "./library-session";
import { Button } from "@/components/ui/button";
import {
	TagInput,
	tagInputValue,
	readTagInput,
	type TagInputValue,
} from "./tag-input";
import type { TagSettings as Settings } from "./types";

const CATEGORIES = [
	{ label: "抓注意力", placeholder: "冲突、反差、结果前置" },
	{ label: "建立需求", placeholder: "场景、痛点、带入" },
	{ label: "展示商品", placeholder: "卖点、证据、对比" },
	{ label: "行动引导", placeholder: "进直播间、领权益、立即下单" },
];

export type TagSettingsDraft = {
	baseRevision: number;
	groups: TagInputValue[];
	holidays: TagInputValue;
	explanations: Record<string, string>;
};

export function TagSettings({
	settings,
	disabled,
	onRefresh,
	draftState,
}: {
	settings?: Settings;
	disabled: boolean;
	onRefresh: () => Promise<void>;
	draftState?: [
		TagSettingsDraft | null,
		Dispatch<SetStateAction<TagSettingsDraft | null>>,
	];
}) {
	const localDraftState = useState<TagSettingsDraft | null>(null);
	const [draft, setDraft] = draftState ?? localDraftState;
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const values =
		draft?.groups ?? (settings?.groups ?? [[], [], [], []]).map(tagInputValue);
	const holidays = draft?.holidays ?? tagInputValue(settings?.holidays ?? []);
	const explanations = draft?.explanations ?? settings?.explanations ?? {};
	const changed =
		!!draft &&
		(JSON.stringify(values.map(readTagInput)) !==
			JSON.stringify(settings?.groups) ||
			JSON.stringify(readTagInput(holidays)) !==
				JSON.stringify(settings?.holidays ?? []) ||
			JSON.stringify(explanations) !==
				JSON.stringify(settings?.explanations ?? {}));
	const unavailable = disabled || busy || !settings;
	const editExplanation = (tag: string, value: string) => {
		setDraft({
			baseRevision: draft?.baseRevision ?? settings!.revision,
			groups: values,
			holidays,
			explanations: { ...explanations, [tag]: value },
		});
		setError("");
	};
	const save = async () => {
		if (!draft) return;
		setBusy(true);
		setError("");
		try {
			const response = await fetch("/api/footage/tag-settings", {
				method: "POST",
				headers: {
					...libraryHeaders(),
					"content-type": "application/json",
					"x-requested-with": "moirai-footage",
				},
				body: JSON.stringify({
					baseRevision: draft.baseRevision,
					groups: draft.groups.map((group) => readTagInput(group).join("\n")),
					holidays: readTagInput(holidays).join("\n"),
					explanations: draft.explanations,
				}),
			});
			const value = await response.json();
			if (!response.ok)
				throw new Error(
					value.error === "revision_conflict"
						? "标签设定已在其他页面更新，请撤销修改后重新编辑"
						: (value.error ?? "标签保存失败"),
				);
			await onRefresh();
			setDraft(null);
			toast.success("标签设定已保存");
		} catch (e) {
			setError(e instanceof Error ? e.message : "标签保存失败");
		} finally {
			setBusy(false);
		}
	};
	return (
		<section className="footage-tag-settings" aria-label="标签设定">
			<div className="footage-products-heading">
				<h2>标签设定 {changed && <span>未保存</span>}</h2>
				<div className="footage-tag-actions">
					<Button
						variant="ghost"
						size="icon"
						title="撤销标签修改"
						aria-label="撤销标签修改"
						disabled={unavailable || !draft}
						onClick={() => {
							setDraft(null);
							setError("");
						}}
					>
						<Undo2 />
					</Button>
					<Button
						variant={changed ? "default" : "outline"}
						disabled={unavailable || !changed}
						onClick={() => void save()}
					>
						{busy ? <Loader2 className="animate-spin" /> : <Save />}
						{busy ? "正在保存" : "保存标签"}
					</Button>
				</div>
			</div>
			<p className="footage-subtle mb-3">
				根据脚本的四个结构，你的片段可能存在哪些类型，将这些类型补充到对应输入框
			</p>
			<div className="footage-tag-grid">
				{CATEGORIES.map(({ label, placeholder }, index) => (
					<div className="footage-tag-group" key={label}>
						<div className="footage-tag-category">
							<span>{label}</span>
							<span>{readTagInput(values[index]).length}</span>
						</div>
						<TagInput
							label={`${label}小类标签`}
							placeholder={placeholder}
							value={values[index]}
							disabled={unavailable}
							onChange={(value) => {
								const groups = [...values];
								groups[index] = value;
								setDraft({
									baseRevision: draft?.baseRevision ?? settings!.revision,
									groups,
									holidays,
									explanations,
								});
								setError("");
							}}
						/>
						<TagExplanations
							category={label}
							tags={readTagInput(values[index])}
							values={explanations}
							disabled={unavailable}
							onChange={editExplanation}
						/>
					</div>
				))}
			</div>
			<div className="footage-holiday-settings">
				<div className="footage-tag-category">
					<span>节日</span>
					<span>{readTagInput(holidays).length}</span>
				</div>
				<TagInput
					label="节日小类标签"
					placeholder="春节、情人节、圣诞节"
					value={holidays}
					disabled={unavailable}
					onChange={(value) => {
						setDraft({
							baseRevision: draft?.baseRevision ?? settings!.revision,
							groups: values,
							holidays: value,
							explanations,
						});
						setError("");
					}}
				/>
				<div className="col-start-2 min-w-0">
					<TagExplanations
						category="节日"
						tags={readTagInput(holidays)}
						values={explanations}
						disabled={unavailable}
						onChange={editExplanation}
					/>
				</div>
			</div>
			{error && (
				<p className="footage-error" role="alert">
					{error}
				</p>
			)}
		</section>
	);
}

function TagExplanations({
	category,
	tags,
	values,
	disabled,
	onChange,
}: {
	category: string;
	tags: string[];
	values: Record<string, string>;
	disabled: boolean;
	onChange: (tag: string, value: string) => void;
}) {
	if (!tags.length) return null;
	return (
		<details className="mt-2" aria-label={`${category}判断说明`}>
			<summary className="footage-subtle cursor-pointer py-1">
				判断说明（可选）
			</summary>
			<div className="flex flex-col gap-3 pt-2">
				{tags.map((tag) => (
					<label key={tag} className="flex min-w-0 flex-col gap-1">
						<span className="break-words text-xs">{tag}</span>
						<textarea
							aria-label={`${category}标签 ${tag} 的判断说明`}
							placeholder="符合哪些画面条件时使用此标签"
							value={values[tag] ?? ""}
							maxLength={300}
							rows={2}
							disabled={disabled}
							onChange={(event) => onChange(tag, event.target.value)}
						/>
					</label>
				))}
			</div>
		</details>
	);
}
