"use client";

import { useId, useState } from "react";
import { Check, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";

export function ReanalysisDialog({
	disabled,
	onAnalyze,
}: {
	disabled: boolean;
	onAnalyze: (replace: boolean) => Promise<void>;
}) {
	const modeId = useId();
	const [open, setOpen] = useState(false);
	const [replace, setReplace] = useState(false);
	const [confirmed, setConfirmed] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const run = async () => {
		if (disabled || busy || (replace && !confirmed)) return;
		setBusy(true);
		setError("");
		try {
			await onAnalyze(replace);
			setOpen(false);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "重新分析失败，请重试");
		} finally {
			setBusy(false);
		}
	};
	return (
		<Dialog
			open={open}
			onOpenChange={(value) => {
				if (busy) return;
				setOpen(value);
				if (value) {
					setReplace(false);
					setConfirmed(false);
					setError("");
				}
			}}
		>
			<DialogTrigger asChild>
				<Button
					size="icon"
					variant="ghost"
					disabled={disabled}
					title="重新分析打标"
					aria-label="重新分析打标"
				>
					<RefreshCw />
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>重新分析打标</DialogTitle>
					<DialogDescription>
						使用最新保存的商品、标签和模型配置。
					</DialogDescription>
				</DialogHeader>
				<DialogBody>
					<fieldset disabled={busy || disabled} className="flex flex-col gap-4">
						<legend className="sr-only">分析方式</legend>
						<label
							aria-label="生成更新建议"
							htmlFor={`${modeId}-suggest`}
							className="flex cursor-pointer items-start gap-3 text-sm"
						>
							<input
								id={`${modeId}-suggest`}
								type="radio"
								name="reanalyze-mode"
								checked={!replace}
								onChange={() => {
									setReplace(false);
									setConfirmed(false);
								}}
								className="mt-1 accent-emerald-600"
							/>
							<span className="flex flex-col gap-1">
								<span className="font-medium">生成更新建议</span>
								<span className="text-muted-foreground">
									保留当前人工内容、截取范围和画面参数，分析完成后逐项采纳。
								</span>
							</span>
						</label>
						<label
							aria-label="全部重新生成"
							htmlFor={`${modeId}-replace`}
							className="flex cursor-pointer items-start gap-3 text-sm"
						>
							<input
								id={`${modeId}-replace`}
								type="radio"
								name="reanalyze-mode"
								checked={replace}
								onChange={() => setReplace(true)}
								className="mt-1 accent-emerald-600"
							/>
							<span className="flex flex-col gap-1">
								<span className="font-medium">全部重新生成</span>
								<span className="text-muted-foreground">
									成功后覆盖现有标签和描述；原片重新选取一个片段并分析画面参数，直接上传分镜保留全片。
								</span>
							</span>
						</label>
						{replace && (
							<label className="flex items-start gap-3 border-t pt-4 text-sm">
								<input
									type="checkbox"
									checked={confirmed}
									onChange={(event) => setConfirmed(event.target.checked)}
									className="mt-1 accent-emerald-600"
								/>
								<span>
									确认覆盖当前分析及人工标签、描述，并在完成后重新确认打标。
								</span>
							</label>
						)}
					</fieldset>
					{error && (
						<p role="alert" className="text-destructive text-sm">
							{error}
						</p>
					)}
				</DialogBody>
				<DialogFooter>
					<Button
						variant="outline"
						disabled={busy}
						onClick={() => setOpen(false)}
					>
						取消
					</Button>
					<Button
						disabled={disabled || busy || (replace && !confirmed)}
						onClick={() => void run()}
					>
						{busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
						{replace ? "全部重新生成" : "生成更新建议"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

type AnalysisValues = {
	name: string;
	description: string;
	details?: Partial<
		Record<
			"subject" | "action" | "scene" | "composition" | "camera" | "mood",
			string
		>
	>;
	tags: string[];
	hasHoliday?: boolean;
	holidayTags?: string[];
	unsupportedClaims: string[];
};

export type AnalysisSuggestion = AnalysisValues & {
	baseRevision: number;
	stale: boolean;
	tagEvidence?: unknown;
	evidence?: string;
	productRecognitionStatus?: string;
};

const FIELDS = [
	["name", "分镜名称"],
	["description", "画面描述"],
	["details", "细节描述"],
	["tags", "标签"],
	["holidays", "节日属性与标签"],
	["unsupportedClaims", "无法证明的卖点"],
] as const;

type SuggestionProps = {
	suggestion: AnalysisSuggestion;
	current: AnalysisValues;
	disabled: boolean;
	onApply: (fields: string[]) => Promise<void>;
	onDismiss: () => Promise<void>;
};

export function AnalysisSuggestionPanel(props: SuggestionProps) {
	return <SuggestionFields key={JSON.stringify(props.suggestion)} {...props} />;
}

function SuggestionFields({
	suggestion,
	current,
	disabled,
	onApply,
	onDismiss,
}: SuggestionProps) {
	const [selected, setSelected] = useState<string[]>([]);
	const [busy, setBusy] = useState<"apply" | "dismiss" | null>(null);
	const [error, setError] = useState("");
	const submit = async (action: "apply" | "dismiss") => {
		if (
			busy ||
			disabled ||
			(action === "apply" && (suggestion.stale || !selected.length))
		)
			return;
		setBusy(action);
		setError("");
		try {
			if (action === "apply") await onApply(selected);
			else await onDismiss();
			setSelected([]);
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "更新建议处理失败，请重试",
			);
		} finally {
			setBusy(null);
		}
	};
	return (
		<section aria-label="AI 更新建议" className="footage-analysis-suggestion border-y py-3 text-sm">
			<details open>
				<summary className="cursor-pointer font-medium">AI 更新建议</summary>
				<p className="text-muted-foreground mt-2 text-xs">
					仅替换勾选项，其余人工内容和画面参数保持不变。
				</p>
				{suggestion.stale && (
					<p role="status" className="mt-2 text-amber-500">
						当前分镜已有更新，此建议已过期。请重新分析或忽略。
					</p>
				)}
				<div className="mt-3 divide-y">
					{FIELDS.map(([field, label]) => (
						<section key={field} className="py-3">
							<label className="mb-2 flex items-center gap-2 font-medium">
								<input
									type="checkbox"
									aria-label={`采纳建议：${label}`}
									checked={selected.includes(field)}
									disabled={disabled || !!busy || suggestion.stale}
									onChange={(event) =>
										setSelected(
											event.target.checked
												? [...selected, field]
												: selected.filter((item) => item !== field),
										)
									}
									className="accent-emerald-600"
								/>
								{label}
							</label>
							<div className="grid grid-cols-2 gap-4">
								<div className="min-w-0">
									<p className="text-muted-foreground mb-1 text-xs">当前</p>
									<AnalysisValue field={field} value={current} />
								</div>
								<div className="min-w-0">
									<p className="text-muted-foreground mb-1 text-xs">建议</p>
									<AnalysisValue field={field} value={suggestion} />
								</div>
							</div>
						</section>
					))}
				</div>
				{suggestion.evidence && (
					<details className="border-t py-3">
						<summary className="cursor-pointer">建议依据</summary>
						<p className="mt-2 whitespace-pre-wrap break-words text-xs">
							{suggestion.evidence}
						</p>
					</details>
				)}
			</details>
			{error && (
				<p role="alert" className="text-destructive my-2">
					{error}
				</p>
			)}
			<div className="mt-3 flex flex-wrap justify-end gap-2">
				<Button
					variant="ghost"
					disabled={disabled || !!busy}
					onClick={() => void submit("dismiss")}
				>
					{busy === "dismiss" ? <Loader2 className="animate-spin" /> : <X />}
					忽略建议
				</Button>
				<Button
					disabled={disabled || !!busy || suggestion.stale || !selected.length}
					onClick={() => void submit("apply")}
				>
					{busy === "apply" ? <Loader2 className="animate-spin" /> : <Check />}
					采纳选中项{selected.length > 0 ? `（${selected.length}）` : ""}
				</Button>
			</div>
		</section>
	);
}

function AnalysisValue({
	field,
	value,
}: {
	field: (typeof FIELDS)[number][0];
	value: AnalysisValues;
}) {
	if (field === "details") {
		const labels = {
			subject: "主体",
			action: "动作",
			scene: "场景",
			composition: "构图",
			camera: "镜头",
			mood: "氛围",
		} as const;
		return (
			<dl className="space-y-2 text-xs">
				{Object.entries(labels).map(([key, label]) => (
					<div key={key}>
						<dt className="text-muted-foreground">{label}</dt>
						<dd className="whitespace-pre-wrap break-words">
							{value.details?.[key as keyof typeof labels] || "未填写"}
						</dd>
					</div>
				))}
			</dl>
		);
	}
	if (field === "tags" || field === "holidays") {
		const tags =
			field === "tags"
				? value.tags
				: value.hasHoliday
					? (value.holidayTags ?? [])
					: [];
		return (
			<div className="flex flex-wrap gap-1.5">
				{tags.length ? (
					tags.map((tag) => (
						<span
							key={tag}
							className="max-w-full break-words rounded border px-2 py-0.5 text-xs"
						>
							{tag}
						</span>
					))
				) : (
					<span className="text-muted-foreground text-xs">
						{field === "holidays" && value.hasHoliday
							? "有节日属性，未指定标签"
							: field === "holidays"
								? "无节日属性"
								: "暂无标签"}
					</span>
				)}
			</div>
		);
	}
	const text =
		field === "unsupportedClaims"
			? value.unsupportedClaims.join("\n")
			: value[field];
	return (
		<p className="whitespace-pre-wrap break-words text-xs">
			{text || "未填写"}
		</p>
	);
}
