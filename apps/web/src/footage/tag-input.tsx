"use client";

import { useRef } from "react";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type TagInputValue = {
	tags: string[];
	text: string;
	editingIndex: number | null;
};

export function tagInputValue(tags: string[]): TagInputValue {
	return { tags, text: "", editingIndex: null };
}

// Include unfinished input when the enclosing form is saved.
export function readTagInput(value: TagInputValue): string[] {
	const added = value.text
		.split(/[,，、\n\r]/)
		.map((tag) => tag.trim())
		.filter(Boolean);
	const tags = [...value.tags];
	if (added.length) {
		if (value.editingIndex === null) tags.push(...added);
		else tags.splice(value.editingIndex, 1, ...added);
	}
	const seen = new Set<string>();
	return tags.filter((tag) => {
		const key = tag.toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export function TagInput({
	label,
	placeholder = "暂无标签",
	value,
	disabled = false,
	onChange,
}: {
	label: string;
	placeholder?: string;
	value: TagInputValue;
	disabled?: boolean;
	onChange: (value: TagInputValue) => void;
}) {
	const input = useRef<HTMLInputElement>(null);
	const commit = () => {
		onChange(tagInputValue(readTagInput(value)));
		input.current?.focus();
	};
	return (
		<div
			className="footage-tag-input"
			role="group"
			aria-label={label}
			aria-disabled={disabled}
		>
			<div className="footage-tag-chips">
				{value.tags.length === 0 && (
					<span className="footage-tag-placeholder">{placeholder}</span>
				)}
				{value.tags.map((tag, index) => (
					<span
						className={`footage-tag-chip${value.editingIndex === index ? " is-editing" : ""}`}
						key={`${index}-${tag}`}
					>
						<button
							type="button"
							className="footage-tag-name"
							disabled={disabled}
							title={`修改标签：${tag}`}
							aria-label={`修改标签：${tag}`}
							onClick={() => {
								if (value.editingIndex !== index) {
									const tags = readTagInput(value);
									const nextIndex = tags.indexOf(tag);
									onChange({
										tags,
										text: tag,
										editingIndex: nextIndex < 0 ? null : nextIndex,
									});
								}
								input.current?.focus();
							}}
						>
							{tag}
						</button>
						<button
							type="button"
							className="footage-tag-remove"
							disabled={disabled}
							title={`删除标签：${tag}`}
							aria-label={`删除标签：${tag}`}
							onClick={() => {
								const editing = value.editingIndex;
								onChange({
									tags: value.tags.filter((_, i) => i !== index),
									text: editing === index ? "" : value.text,
									editingIndex:
										editing === null || editing === index
											? null
											: editing > index
												? editing - 1
												: editing,
								});
							}}
						>
							<X size={12} />
						</button>
					</span>
				))}
			</div>
			<div className="footage-tag-entry">
				<input
					ref={input}
					aria-label={`${label}输入`}
					placeholder={value.editingIndex === null ? "添加标签" : "修改标签"}
					title="回车添加标签，支持粘贴多个标签"
					value={value.text}
					disabled={disabled}
					onChange={(e) => onChange({ ...value, text: e.target.value })}
					onKeyDown={(e) => {
						if (e.nativeEvent.isComposing || e.keyCode === 229) return;
						if (e.key === "Enter") {
							e.preventDefault();
							commit();
						} else if (e.key === "Escape") {
							e.preventDefault();
							onChange(tagInputValue(value.tags));
						}
					}}
				/>
				<Button
					size="icon"
					variant="ghost"
					disabled={disabled || !value.text.trim()}
					aria-label={
						value.editingIndex === null ? `添加${label}` : `应用${label}修改`
					}
					title={value.editingIndex === null ? "添加标签" : "应用修改"}
					onClick={commit}
				>
					{value.editingIndex === null ? <Plus /> : <Check />}
				</Button>
			</div>
		</div>
	);
}
