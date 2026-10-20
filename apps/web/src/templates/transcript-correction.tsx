"use client";
import { useState } from "react";
import { Save, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Transcript } from "./types";

export function TranscriptCorrection({ inputId, transcript, edits, onEdit, onSaved, onBusyChange }: {
	inputId: string;
	transcript: Transcript;
	edits: Record<number, string>;
	onEdit: (edits: Record<number, string>) => void;
	onSaved: (transcript: Transcript) => void;
	onBusyChange: (busy: boolean) => void;
}) {
	const [open, setOpen] = useState(false);
	const [message, setMessage] = useState("");
	const [failed, setFailed] = useState(false);
	const changed = Object.entries(edits);
	async function save() {
		if (!changed.length) return;
		onBusyChange(true); setMessage(""); setFailed(false);
		try {
			const response = await fetch(`/api/footage/templates/inputs/${encodeURIComponent(inputId)}/correct`, {
				method: "POST", headers: { "content-type": "application/json", "x-requested-with": "moirai-footage" },
				body: JSON.stringify({ baseRevision: transcript.revision, edits: changed.map(([index, text]) => ({ index: Number(index), text, reason: "用户在模板生产页校正识别文字，保留实测词时间" })) }),
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error === "revision_conflict" ? "原文已被更新。请重新选择这份素材后再校正。" : result.error ?? "原文保存失败");
			onSaved(result); onEdit({}); setMessage("原文已保存");
		} catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "原文保存失败"); }
		finally { onBusyChange(false); }
	}
	return <details className="tp-transcript-correction" onToggle={(event) => setOpen(event.currentTarget.open)}>
		<summary>校正原文 · v{transcript.revision}{changed.length ? ` · ${changed.length} 处未保存` : ""}</summary>
		{open && <>
			<div className="tp-transcript-words">
				{transcript.words.map((word, index) => <label key={index}>
					<span>{word.start.toFixed(2)}–{word.end.toFixed(2)} 秒</span>
					<input aria-label={`原文第${index + 1}词`} value={edits[index] ?? word.text} maxLength={500}
						onChange={(event) => {
							const next = { ...edits };
							if (event.target.value === word.text) delete next[index]; else next[index] = event.target.value;
							onEdit(next); setMessage("");
						}} />
				</label>)}
			</div>
			<div className="tp-transcript-actions">
				<Button title="保存原文校正" aria-label="保存原文校正" size="icon" disabled={!changed.length || changed.some(([, text]) => !text.trim())} onClick={() => void save()}><Save /></Button>
				<Button title="撤销未保存校正" aria-label="撤销未保存校正" variant="outline" size="icon" disabled={!changed.length} onClick={() => { onEdit({}); setMessage(""); }}><Undo2 /></Button>
				{changed.length > 0 && <span>{changed.length} 处未保存</span>}
			</div>
			{message && <p role={failed ? "alert" : "status"}>{message}</p>}
		</>}
	</details>;
}
