"use client";
import { useEffect, useRef, useState } from "react";
import { AudioLines, Check, LocateFixed, RefreshCw, Save, Scissors, Search, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Library, Sound, SoundAssessment, TemplateInput } from "./types";

type Request = <T>(path: string, body?: unknown) => Promise<T>;
type SoundMatch = { sound: Sound; score: number; audioMatch?: { bestWindow: { start: number; end: number }; windowCount: number } | null };
const statuses: Record<string, string> = {
	queued: "排队中",
	running: "分离中",
	succeeded: "已完成",
	failed: "失败",
	review: "待试听",
	approved: "已确认",
	rejected: "已排除",
};
function SoundRow({
	sound,
	busy,
	onReview,
	assessment,
	parentSoundName,
	match,
}: {
	sound: Sound;
	busy: boolean;
	onReview: (sound: Sound, status: string, kind: string, name: string, description: string, tags: string[]) => void;
	assessment?: SoundAssessment;
	parentSoundName?: string;
	match?: SoundMatch;
}) {
	const [kind, setKind] = useState(sound.kind);
	const [name, setName] = useState(sound.name);
	const [description, setDescription] = useState(sound.description);
	const [tags, setTags] = useState(sound.tags.join(", "));
	const audioRef = useRef<HTMLAudioElement>(null);
	const review = (status: string) => onReview(sound, status, kind, name, description, tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean));
	return (
		<article className="tw-sound-row">
			<div>
				<input
					aria-label={`${sound.id} 名称`}
					value={name}
					onChange={(e) => setName(e.target.value)}
				/>
				<label>声音说明<textarea value={description} onChange={(e) => setDescription(e.target.value)} /></label>
				<label>标签<input value={tags} onChange={(e) => setTags(e.target.value)} /></label>
				<small>
					{statuses[sound.status]} · {sound.sourceId} ·{" "}
					{sound.startSeconds.toFixed(2)} - {sound.endSeconds.toFixed(2)} 秒
				</small>
				{sound.derivation && <small>截取自 {parentSoundName ?? "源声音"} · {sound.derivation.startSeconds.toFixed(2)} - {sound.derivation.endSeconds.toFixed(2)} 秒</small>}
				{match?.audioMatch && <small>声音内匹配区间 {match.audioMatch.bestWindow.start.toFixed(2)} - {match.audioMatch.bestWindow.end.toFixed(2)} 秒</small>}
				{assessment && <div className="tw-sound-evidence">
					<small>模型标签（分数）</small>
					<p>{assessment.topLabels.slice(0, 3).map((item) => `${item.label} ${item.score.toFixed(2)}`).join(" · ")}</p>
					<small>{[
						assessment.warnings.includes("possible_voice_content") && "人声迹象",
						assessment.warnings.includes("possible_music_content") && "音乐迹象",
						assessment.warnings.includes("short_sound_padded_for_model") && "短音频",
					].filter(Boolean).join(" · ") || "待试听判定"}</small>
				</div>}
			</div>
			<div className="tw-sound-controls">
				{/* Raw audition material has no verified transcript; its provenance is adjacent. */}
				{/* eslint-disable-next-line jsx-a11y/media-has-caption */}
				<audio
					ref={audioRef}
					controls
					preload="none"
					src={`/api/footage/templates/sounds/${sound.id}/audio`}
				/>
				<div className="tw-row">
					{match?.audioMatch && <Button variant="ghost" size="icon" title="定位匹配片段" aria-label={`定位 ${sound.name} 的匹配片段`} onClick={() => { if (audioRef.current && match.audioMatch) audioRef.current.currentTime = match.audioMatch.bestWindow.start; }}><LocateFixed /></Button>}
					<Button variant="ghost" size="icon" aria-label={`保存 ${sound.name}`} title="保存声音信息" disabled={busy} onClick={() => review(sound.status)}><Save /></Button>
					<select
						aria-label={`${sound.id} 用途`}
						value={kind}
						onChange={(e) => setKind(e.target.value)}
					>
						<option value="stem">分离声部</option>
						<option value="candidate">瞬态候选</option>
						<option value="sound_effect">音效</option>
						<option value="background_music">背景音乐</option>
					</select>
					<Button
						variant="ghost"
						size="icon"
						aria-label={`确认 ${sound.name}`}
						title="确认入库"
						disabled={
							busy || !["sound_effect", "background_music"].includes(kind)
						}
						onClick={() => review("approved")}
					>
						<Check />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label={`排除 ${sound.name}`}
						title="排除"
						disabled={busy}
						onClick={() => review("rejected")}
					>
						<X />
					</Button>
				</div>
			</div>
		</article>
	);
}
export function SoundLibrary({
	library,
	api,
	refresh,
	run,
	busy,
}: {
	library: Library;
	api: Request;
	refresh: () => Promise<Library>;
	run: (task: () => Promise<void>) => Promise<void>;
	busy: boolean;
}) {
	const [filter, setFilter] = useState("review");
	const [query, setQuery] = useState("");
	const [matchBy, setMatchBy] = useState("metadata");
	const [searchKind, setSearchKind] = useState("sound_effect");
	const [includeReview, setIncludeReview] = useState(false);
	const [maxDuration, setMaxDuration] = useState(3);
	const [matches, setMatches] = useState<{ candidates: SoundMatch[] } | null>(null);
	useEffect(() => { setMatches(null); }, [library.sounds, query, searchKind, includeReview, maxDuration, matchBy]);
	const [inputs, setInputs] = useState<TemplateInput[]>([]);
	const [inputId, setInputId] = useState("");
	const [soundId, setSoundId] = useState("");
	const [clipName, setClipName] = useState("");
	const [clipDescription, setClipDescription] = useState("");
	const [start, setStart] = useState(0);
	const [end, setEnd] = useState(0);
	const [inputError, setInputError] = useState("");
	const fileRef = useRef<HTMLInputElement>(null);
	const selectedInput = inputs.find((i) => i.id === inputId);
	const selectedSound = library.sounds.find((s) => s.id === soundId);
	const selectedDuration = selectedSound ? selectedSound.endSeconds - selectedSound.startSeconds : selectedInput?.durationSeconds;
	useEffect(() => {
		let live = true;
		void api<{ inputs: TemplateInput[] }>("/inputs").then((result) => {
			if (live) setInputs(result.inputs);
		}).catch((error) => { if (live) setInputError(String(error)); });
		return () => { live = false; };
	}, [api]);
	function selectInput(input: TemplateInput | undefined) {
		setSoundId("");
		setInputId(input?.id ?? ""); setStart(0); setEnd(Math.min(input?.durationSeconds ?? 0, 600));
		setClipName(input?.name ?? ""); setClipDescription("");
	}
	const jobs = library.audioJobs ?? [];
	const assessmentJobs = library.soundAssessmentJobs ?? [];
	const analyzing = assessmentJobs.some((j) => ["queued", "running"].includes(j.status));
	const active = analyzing || jobs.some((j) => ["queued", "running"].includes(j.status));
	useEffect(() => {
		if (!active) return;
		const timer = setInterval(() => {
			void refresh().catch(() => {});
		}, 3000);
		return () => clearInterval(timer);
	}, [active, refresh]);
	return (
		<section className="tw-sounds">
			<div className="tw-section-title">
				<h2>声音素材 · {library.sounds.length}</h2>
				<Button variant="outline" disabled={busy || analyzing || !library.sounds.length} onClick={() => void run(async () => {
					await api("/sounds/analyze", {}); await refresh();
				})}><AudioLines />{analyzing ? "分析中" : "分析声音"}</Button>
				<Button
					variant="ghost"
					size="icon"
					aria-label="刷新音效库"
					title="刷新音效库"
					disabled={busy}
					onClick={() =>
						void run(async () => {
							await refresh();
						})
					}
				>
					<RefreshCw />
				</Button>
			</div>
			{assessmentJobs.filter((j) => j.status === "failed").map((j) => <p key={j.id} role="status">{j.error}</p>)}
			<fieldset disabled={busy} className="tw-apply-fields">
				<fieldset className="tw-sound-match-mode"><legend>匹配依据</legend>{[["metadata", "说明与标签"], ["audio", "声音内容"]].map(([value, label]) => <label className="tw-check" key={value}><input type="radio" name="sound-match-mode" value={value} checked={matchBy === value} onChange={() => setMatchBy(value)} />{label}</label>)}</fieldset>
				<label>{matchBy === "audio" ? "声音描述（英文）" : "句子或声音需求"}<input value={query} maxLength={600} onChange={(e) => setQuery(e.target.value)} /></label>
				<label>声音用途<select value={searchKind} onChange={(e) => setSearchKind(e.target.value)}><option value="sound_effect">音效</option><option value="background_music">背景音乐</option></select></label>
				<label>最长时长（秒）<input type="number" min="0.02" max="600" step="0.01" value={maxDuration} onChange={(e) => setMaxDuration(Number(e.target.value))} /></label>
				<label className="tw-check"><input type="checkbox" checked={includeReview} onChange={(e) => setIncludeReview(e.target.checked)} />包含待试听</label>
				<Button disabled={!query.trim()} onClick={() => void run(async () => {
					setMatches(await api("/sounds/search", { query, matchBy, kind: searchKind, includeReview, maxDurationSeconds: maxDuration, limit: 10 }));
				})}><Search />匹配声音</Button>
				{matches && <Button variant="ghost" size="icon" title="清除匹配" aria-label="清除匹配" onClick={() => setMatches(null)}><X /></Button>}
			</fieldset>
			{matches && <p role="status">匹配到 {matches.candidates.length} 个声音{!includeReview && matches.candidates.length === 0 ? " · 当前条件下暂无已确认素材" : ""}</p>}
			<fieldset disabled={busy} className="tw-apply-fields">
				<label>声音来源<select value={soundId ? `sound:${soundId}` : inputId} onChange={(e) => {
					if (e.target.value.startsWith("sound:")) {
						const sound = library.sounds.find((s) => `sound:${s.id}` === e.target.value);
						setInputId(""); setSoundId(sound?.id ?? ""); setStart(0); setEnd(Math.min(sound ? sound.endSeconds - sound.startSeconds : 0, 600));
						setClipName(sound ? `${sound.name} · 截取` : ""); setClipDescription(sound?.description ?? "");
					} else selectInput(inputs.find((i) => i.id === e.target.value));
				}}>
					<option value="">选择声音来源</option><optgroup label="已导入素材">{inputs.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</optgroup>
					<optgroup label="声部与声音库">{library.sounds.map((s) => <option key={s.id} value={`sound:${s.id}`}>{s.name}</option>)}</optgroup>
				</select></label>
				<Button variant="outline" onClick={() => fileRef.current?.click()}><Upload />导入声音</Button>
				<input ref={fileRef} hidden type="file" accept="audio/*,video/*" onChange={(e) => {
					const file = e.target.files?.[0]; e.target.value = "";
					if (file) void run(async () => {
						const imported = await api<TemplateInput>(`/inputs?filename=${encodeURIComponent(file.name)}`, file);
						setInputs((items) => [imported, ...items.filter((i) => i.id !== imported.id)]);
						selectInput(imported);
					});
				}} />
				{selectedDuration !== undefined && <>
					<label>声音名称<input value={clipName} onChange={(e) => setClipName(e.target.value)} /></label>
					<label>声音说明<input value={clipDescription} onChange={(e) => setClipDescription(e.target.value)} /></label>
					<label>截取开始（秒）<input type="number" min="0" max={selectedDuration} step="0.01" value={start} onChange={(e) => setStart(Number(e.target.value))} /></label>
					<label>截取结束（秒）<input type="number" min="0" max={selectedDuration} step="0.01" value={end} onChange={(e) => setEnd(Number(e.target.value))} /></label>
					{/* Source audio is audition material and may not contain speech. */}
					{/* eslint-disable-next-line jsx-a11y/media-has-caption */}
					<audio controls preload="none" src={soundId ? `/api/footage/templates/sounds/${soundId}/audio` : `/api/footage/templates/inputs/${inputId}/media/original`} />
					<Button disabled={!clipName.trim()} onClick={() => void run(async () => {
						await api("/sounds/clip", { ...(soundId ? { soundId } : { inputId }), startSeconds: start, endSeconds: end, name: clipName, description: clipDescription });
						setFilter("all"); await refresh();
					})}><Scissors />截取入库</Button>
				</>}
			</fieldset>
			{inputError && <p role="alert">{inputError}</p>}
			{library.references
				.filter((r) => r.audio.status === "needs_separation")
				.map((r) => {
					const job = jobs.find((j) => j.targetId === r.id);
					return (
						<div key={r.id} className="tw-audio-source">
							<span>{r.name}</span>
							<small>{job ? statuses[job.status] : "待分离"}</small>
							<Button
								variant="ghost"
								size="icon"
								title="本地分离"
								aria-label={`分离 ${r.name}`}
								disabled={
									busy ||
									(!!job &&
										["queued", "running", "succeeded"].includes(job.status))
								}
								onClick={() =>
									void run(async () => {
										await api(`/references/${r.id}/separate`, {});
										await refresh();
									})
								}
							>
								<Scissors />
							</Button>
							{job?.error && <p role="status">{job.error}</p>}
						</div>
					);
				})}
			{!matches && <label>
				状态
				<select value={filter} onChange={(e) => setFilter(e.target.value)}>
					<option value="review">待试听</option>
					<option value="approved">已确认</option>
					<option value="rejected">已排除</option>
					<option value="all">全部</option>
				</select>
			</label>}
			{(matches ? matches.candidates.map((c) => c.sound) : library.sounds.filter((s) => filter === "all" || s.status === filter))
				.map((s) => (
					<SoundRow
						key={`${s.id}-${s.revision}`}
						sound={s}
						busy={busy}
						match={matches?.candidates.find((candidate) => candidate.sound.id === s.id)}
						assessment={library.soundAssessments?.find((a) => a.soundId === s.id)}
						parentSoundName={library.sounds.find((parent) => parent.id === s.derivation?.parentSoundId)?.name}
						onReview={(sound, status, kind, name, description, tags) =>
							void run(async () => {
								await api(`/sounds/${sound.id}/review`, {
									baseRevision: sound.revision,
									status,
									kind,
									name,
									description,
									tags,
								});
								await refresh();
							})
						}
					/>
				))}
			{!library.sounds.length && <p>暂无声音条目</p>}
		</section>
	);
}
