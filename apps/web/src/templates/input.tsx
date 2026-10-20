"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileAudio, Upload, Check, RefreshCw, X, AudioLines } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TemplateSpeech } from "./tts";
import type {
	TimedWord,
	TemplateInput,
	Transcript,
	InputDetail,
} from "./types";
const EMPTY_WORDS: TimedWord[] = [];

export function TemplateInputPanel({
	api,
	onUse,
	onDirtyChange,
	onInputChange,
	initialInputId,
}: {
	api: <T>(path: string, body?: unknown) => Promise<T>;
	onUse: (input: TemplateInput, transcript: Transcript, quietGapSeconds?: number[]) => void;
	onDirtyChange: (dirty: boolean) => void;
	onInputChange?: () => void;
	initialInputId?: string;
}) {
	const [inputs, setInputs] = useState<TemplateInput[]>([]);
	const [selected, setSelected] = useState(initialInputId ?? "");
	useEffect(() => { onInputChange?.(); }, [selected, onInputChange]);
	const [detail, setDetail] = useState<InputDetail | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [corrections, setCorrections] = useState<Record<number, string>>({});
	const dirty = Object.keys(corrections).length > 0;
	useEffect(() => {
		onDirtyChange(dirty);
		return () => onDirtyChange(false);
	}, [dirty, onDirtyChange]);
	const fileRef = useRef<HTMLInputElement>(null);
	const refresh = useCallback(async () => {
		const data = await api<{ inputs: TemplateInput[] }>("/inputs");
		setInputs(data.inputs);
		return data.inputs;
	}, [api]);
	useEffect(() => {
		let live = true;
		void refresh()
			.then((items) => {
				if (live && items[0]) setSelected((current) => current || items[0].id);
			})
			.catch((e) => {
				if (live) setError(e.message);
			});
		return () => {
			live = false;
		};
	}, [refresh]);
	const load = useCallback(
		async (id: string) => {
			const data = await api<InputDetail>(`/inputs/${id}`);
			setDetail(data);
			return data;
		},
		[api],
	);
	useEffect(() => {
		if (!selected) return;
		let live = true;
		let timer: ReturnType<typeof setTimeout>;
		setDetail(null);
		setCorrections({});
		const poll = async () => {
			try {
				const data = await api<InputDetail>(`/inputs/${selected}`);
				if (!live) return;
				setDetail(data);
				if (data.job && ["queued", "running"].includes(data.job.status))
					timer = setTimeout(() => void poll(), 2000);
			} catch (e) {
				if (live) setError(e instanceof Error ? e.message : "读取失败");
			}
		};
		void poll();
		return () => {
			live = false;
			clearTimeout(timer);
		};
	}, [selected, api]);
	const run = async (task: () => Promise<void>) => {
		setBusy(true);
		setError("");
		try {
			await task();
		} catch (e) {
			setError(e instanceof Error ? e.message : "操作失败");
		} finally {
			setBusy(false);
		}
	};
	const transcribe = async (id: string) => {
		await api(`/inputs/${id}/transcribe`, {});
		setSelected("");
		setDetail(null);
		await refresh();
		setSelected(id);
	};
	const transcript = detail?.transcript;
	const active =
		detail?.job && ["queued", "running"].includes(detail.job.status);
	const vtt = useMemoVtt(transcript?.words ?? EMPTY_WORDS);
	return (
		<section className="tw-input-panel">
			<div className="tw-section-title">
				<h2>输入视频 / TTS 音频</h2>
				<div className="tw-row">
					<Button
						variant="ghost"
						size="icon"
						title="刷新输入"
						aria-label="刷新输入"
						disabled={busy || dirty}
						onClick={() =>
							void run(async () => {
								await refresh();
								if (selected) await load(selected);
							})
						}
					>
						<RefreshCw />
					</Button>
					<Button
						disabled={busy || dirty}
						onClick={() => fileRef.current?.click()}
					>
						<Upload />
						导入并转写
					</Button>
				</div>
			</div>
			<input
				hidden
				ref={fileRef}
				type="file"
				accept="video/*,audio/*"
				onChange={(e) => {
					const file = e.target.files?.[0];
					e.target.value = "";
					if (file)
						void run(async () => {
							const input = await api<TemplateInput>(
								`/inputs?filename=${encodeURIComponent(file.name)}`,
								file,
							);
							await transcribe(input.id);
						});
				}}
			/>
			<label>
				输入素材
				<select
					disabled={dirty || busy || !inputs.length}
					value={selected}
					onChange={(e) => setSelected(e.target.value)}
				>
					<option value="">选择素材</option>
					{inputs.map((i) => (
						<option key={i.id} value={i.id}>
							{i.name}
						</option>
					))}
				</select>
			</label>
			{busy && <p role="status">正在处理请求…</p>}
			<TemplateSpeech api={api} disabled={busy || dirty || !!active} onBusyChange={setBusy} onGenerated={async (input) => {
				setSelected(""); setDetail(null); await refresh(); setSelected(input.id);
			}} />
			{error && <p role="alert">{error}</p>}
			{detail && (
				<>
					{detail.syntheses?.map((record) => <details key={record.id}><summary>配音原文 · {record.voice.name} · {record.request.speakingRate} 词/分钟</summary><p>{record.request.text}</p></details>)}
					<div className="tw-input-meta">
						<span>{detail.input.durationSeconds.toFixed(2)} 秒</span>
						<span>{transcript?.language ?? "语言待识别"}</span>
						<span>
							{(
								{
									queued: "排队中",
									running: "转写中",
									succeeded: "转写完成",
									failed: "转写失败",
								} as Record<string, string>
							)[detail.job?.status ?? ""] ?? "待转写"}
						</span>
					</div>
					{detail.job?.error && <p role="alert">{detail.job.error}</p>}
					{transcript ? (
						<div className="tw-input-preview">
							{detail.input.mediaKind === "video" ? (
								<video
									controls
									playsInline
									preload="metadata"
									src={`/api/footage/templates/inputs/${selected}/media/preview`}
								>
									<track
										kind="captions"
										src={vtt}
										srcLang={transcript.language}
										label="识别字幕"
										default
									/>
								</video>
							) : (
								<audio
									controls
									preload="metadata"
									src={`/api/footage/templates/inputs/${selected}/media/audio`}
								>
									<track
										kind="captions"
										src={vtt}
										srcLang={transcript.language}
										label="识别字幕"
									/>
								</audio>
							)}
							<div>
								<p>{transcript.text || "未检测到语音"}</p>
								<p>
									{transcript.words.length} 个对齐单元 ·{" "}
									{transcript.warnings.length} 条检查提示
								</p>
								<Button
									disabled={busy || !transcript.words.length || dirty}
									onClick={() => onUse(detail.input, transcript)}
								>
									<Check />
									应用转写
								</Button>
								<Button
									disabled={busy || dirty || !transcript.words.length}
									onClick={() => void run(async () => {
										await api(`/inputs/${selected}/prosody`, { transcriptRevision: transcript.revision });
										await load(selected);
									})}
								>
									<AudioLines />测量口播节奏
								</Button>
								{detail.prosody && detail.prosody.transcriptRevision === transcript.revision && (
									<details>
										<summary>响度、音高与停顿</summary>
										{detail.prosody.warnings.map((warning) => <p key={warning}>{warning}</p>)}
										<Button disabled={busy || dirty} onClick={() => {
											if (detail.prosody) onUse(detail.input, { ...transcript, words: detail.prosody.candidateWords }, detail.prosody.quietGapSeconds);
										}}><Check />应用声学节奏候选</Button>
										<div className="tw-word-review">
											<table className="tw-prosody-table">
												<thead><tr><th>文字</th><th>RMS dBFS</th><th>相对 dB</th><th>音高 Hz</th><th>起伏 半音</th><th>首尾 半音</th><th>有效帧</th><th>词后间隔 s</th><th>连续低能量 s</th><th>重音候选</th></tr></thead>
												<tbody>{detail.prosody.measurements.map((m) => (
													<tr key={m.wordIndex}><td>{transcript.words[m.wordIndex]?.text}</td><td>{m.rmsDbfs.toFixed(1)}</td><td>{m.relativeDb.toFixed(1)}</td><td>{m.pitch?.medianHz?.toFixed(0) ?? "-"}</td><td>{m.pitch?.rangeSemitones?.toFixed(1) ?? "-"}</td><td>{m.pitch?.changeSemitones?.toFixed(1) ?? "-"}</td><td>{m.pitch ? `${m.pitch.pitchedFrames}/${m.pitch.analyzedFrames}` : "-"}</td><td>{m.gapAfterSeconds.toFixed(2)}</td><td>{detail.prosody?.quietGapSeconds[m.wordIndex]?.toFixed(2) ?? "-"}</td><td>{m.prominence.toFixed(2)}</td></tr>
												))}</tbody>
											</table>
										</div>
									</details>
								)}
								<details>
									<summary>词级核对</summary>
									<div className="tw-word-review">
										<table>
											<thead>
												<tr>
													<th>时间</th>
													<th>文字</th>
												</tr>
											</thead>
											<tbody>
												{transcript.words.map((w, i) => (
													<tr key={i}>
														<td>
															{w.start.toFixed(2)} - {w.end.toFixed(2)}
														</td>
														<td>
															<input
																aria-label={`转写词 ${i}`}
																value={corrections[i] ?? w.text}
																onChange={(e) =>
																	setCorrections({
																		...corrections,
																		[i]: e.target.value,
																	})
																}
															/>
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
									<Button
										disabled={busy || !Object.keys(corrections).length}
										onClick={() =>
											void run(async () => {
												await api(`/inputs/${selected}/correct`, {
													baseRevision: transcript.revision,
													edits: Object.entries(corrections).map(
														([index, text]) => ({
															index: Number(index),
															text,
															reason: "工作台文字校正",
														}),
													),
												});
												setCorrections({});
												await load(selected);
											})
										}
									>
										<Check />
										保存校正
									</Button>
									<Button
										variant="ghost"
										size="icon"
										aria-label="放弃校正"
										title="放弃校正"
										disabled={busy || !dirty}
										onClick={() => setCorrections({})}
									>
										<X />
									</Button>
								</details>
								{!!transcript.warnings.length && (
									<details>
										<summary>检查提示</summary>
										<ul>
											{transcript.warnings.map((w, i) => (
												<li key={i}>{w}</li>
											))}
										</ul>
									</details>
								)}
							</div>
						</div>
					) : (
						<Button
							disabled={busy || !!active}
							onClick={() => void run(() => transcribe(selected))}
						>
							<FileAudio />
							开始转写
						</Button>
					)}
				</>
			)}
		</section>
	);
}

// WebVTT is a playback projection of measured timings, not a segmentation rule.
function useMemoVtt(words: TimedWord[]) {
	const [url, setUrl] = useState("");
	useEffect(() => {
		const time = (n: number) => {
			const ms = Math.round(n * 1000);
			return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
		};
		const text =
			"WEBVTT\n\n" +
			words
				.map(
					(w) =>
						`${time(w.start)} --> ${time(w.end)}\n${w.text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(/\r?\n/g, " ")}\n`,
				)
				.join("\n");
		const next = URL.createObjectURL(new Blob([text], { type: "text/vtt" }));
		setUrl(next);
		return () => URL.revokeObjectURL(next);
	}, [words]);
	return url;
}
