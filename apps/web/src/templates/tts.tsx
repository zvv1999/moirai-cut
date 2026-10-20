"use client";
import { useEffect, useState } from "react";
import { AudioLines } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TemplateInput } from "./types";

interface Voice { id: string; name: string; locale: string }
export function TemplateSpeech({ api, disabled, onGenerated, onBusyChange }: {
	api: <T>(path: string, body?: unknown) => Promise<T>;
	disabled: boolean;
	onGenerated: (input: TemplateInput) => Promise<void>;
	onBusyChange: (busy: boolean) => void;
}) {
	const [voices, setVoices] = useState<Voice[]>([]);
	const [voiceId, setVoiceId] = useState("");
	const [name, setName] = useState("口播配音");
	const [text, setText] = useState("");
	const [rate, setRate] = useState(180);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	useEffect(() => {
		let live = true;
		void api<{ available: boolean; voices: Voice[]; reason?: string }>("/tts/voices").then((result) => {
			if (!live) return;
			setVoices(result.voices);
			setVoiceId((result.voices.find((v) => v.id.endsWith(".Tingting")) ?? result.voices.find((v) => v.locale === "zh_CN") ?? result.voices[0])?.id ?? "");
			if (!result.available) setError(result.reason ?? "当前没有可用音色");
		}).catch((error) => { if (live) setError(String(error)); });
		return () => { live = false; };
	}, [api]);
	return <details className="tw-tts">
		<summary>生成配音</summary>
		<fieldset disabled={disabled || busy || !voices.length} className="tw-apply-fields">
			<label>配音名称<input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></label>
			<label>配音音色<select value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>{voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name} · {voice.locale}</option>)}</select></label>
			<label>配音原文<textarea value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} /></label>
			<label>语速（词/分钟）<input type="number" min="80" max="350" step="10" value={rate} onChange={(e) => setRate(Number(e.target.value))} /></label>
			<Button disabled={!text.trim() || !name.trim() || !voiceId} onClick={() => {
				setBusy(true); onBusyChange(true); setError("");
				void api<{ synthesis: { input: TemplateInput } }>("/tts/generate", { name, text, voiceId, speakingRate: rate })
					.then((result) => onGenerated(result.synthesis.input))
					.catch((error) => setError(String(error)))
					.finally(() => { setBusy(false); onBusyChange(false); });
			}}><AudioLines />{busy ? "生成中" : "生成并转写"}</Button>
		</fieldset>
		{error && <p role="alert">{error}</p>}
	</details>;
}
