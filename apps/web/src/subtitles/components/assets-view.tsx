import { useMemo, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { extractTimelineAudio } from "@/media/mediabunny";
import { useEditor } from "@/editor/use-editor";
import { TRANSCRIPTION_DIAGNOSTICS_SCOPE } from "@/transcription/diagnostics";
import { DEFAULT_TRANSCRIPTION_SAMPLE_RATE } from "@/transcription/audio";
import { TRANSCRIPTION_LANGUAGES } from "@/transcription/supported-languages";
import type {
	CaptionChunk,
	TranscriptionLanguage,
	TranscriptionProgress,
	TranscriptionSegment,
} from "@/transcription/types";
import { transcriptionService } from "@/services/transcription/service";
import { decodeAudioToFloat32 } from "@/media/audio";
import { buildCaptionChunks } from "@/transcription/caption";
import { insertCaptionChunksAsTextTrack } from "@/subtitles/insert";
import { parseSubtitleFile } from "@/subtitles/parse";
import { Spinner } from "@/components/ui/spinner";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { AlertCircleIcon, CloudUploadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DiagnosticSeverity } from "@/diagnostics/types";
import {
	applyCaptionBulkEdit,
	applyCaptionSpellingFixes,
	buildCaptionElementPatch,
	buildCaptionStyleParamPatch,
	collectCaptionCues,
	createCaptionWordTimings,
	reviewCaptionSpelling,
	type EditableCaptionCue,
} from "@/subtitles/caption-model";
import { auditCaptionCues } from "@/subtitles/caption-quality";
import {
	createCaptionStyle,
	duplicateCaptionStyle,
	updateCaptionStyle,
} from "@/subtitles/styles";
import type { CaptionStyle } from "@/subtitles/styles";
import { serializeSubtitles } from "@/subtitles/interchange";
import type { SubtitleCue, SubtitleStyleOverrides } from "@/subtitles/types";
import { downloadBlob } from "@/utils/browser";
import {
	findTrackInSceneTracks,
	type ElementRef,
	type SceneTracks,
} from "@/timeline";
import { mediaTimeToSeconds } from "@/wasm";
import { backgroundJobs } from "@/project/background-jobs";

const DIAGNOSTIC_BUTTON_VARIANT: Record<
	DiagnosticSeverity,
	"caution" | "destructive-foreground"
> = {
	caution: "caution",
	error: "destructive-foreground",
};

type TranscriptionScope = "timeline" | "selection";

type ProcessingState =
	| {
			status: "idle";
			error: string | null;
			warnings: string[];
			canRetry: boolean;
	  }
	| { status: "processing"; step: string; progress: number };

type ProcessingAction =
	| { type: "start"; step: string }
	| { type: "update_step"; step: string; progress?: number }
	| { type: "succeed"; warnings: string[] }
	| { type: "fail"; error: string; canRetry?: boolean };

const IDLE_STATE: ProcessingState = {
	status: "idle",
	error: null,
	warnings: [],
	canRetry: false,
};

function processingReducer(
	state: ProcessingState,
	action: ProcessingAction,
): ProcessingState {
	switch (action.type) {
		case "start":
			return { status: "processing", step: action.step, progress: 0 };
		case "update_step":
			if (state.status !== "processing") return state;
			return {
				status: "processing",
				step: action.step,
				progress: action.progress ?? state.progress,
			};
		case "succeed":
			return {
				status: "idle",
				error: null,
				warnings: action.warnings,
				canRetry: false,
			};
		case "fail":
			return {
				status: "idle",
				error: action.error,
				warnings: [],
				canRetry: action.canRetry ?? true,
			};
	}
}

function getSelectionRange({
	tracks,
	selection,
}: {
	tracks: SceneTracks;
	selection: ElementRef[];
}): { start: number; end: number } | null {
	const ranges = selection.flatMap((reference) => {
		const track = findTrackInSceneTracks({
			tracks,
			trackId: reference.trackId,
		});
		const element = track?.elements.find(
			(candidate) => candidate.id === reference.elementId,
		);
		if (!element) return [];
		const start = mediaTimeToSeconds({ time: element.startTime });
		return [
			{
				start,
				end: start + mediaTimeToSeconds({ time: element.duration }),
			},
		];
	});
	if (ranges.length === 0) return null;
	return {
		start: Math.min(...ranges.map((range) => range.start)),
		end: Math.max(...ranges.map((range) => range.end)),
	};
}

function offsetSegments({
	segments,
	offset,
}: {
	segments: TranscriptionSegment[];
	offset: number;
}): TranscriptionSegment[] {
	if (offset === 0) return segments;
	return segments.map((segment) => ({
		...segment,
		start: segment.start + offset,
		end: segment.end + offset,
		words: segment.words?.map((word) => ({
			...word,
			start: word.start + offset,
			end: word.end + offset,
		})),
	}));
}

function getCaptionExportCues({
	cues,
	styles,
}: {
	cues: EditableCaptionCue[];
	styles: CaptionStyle[];
}): SubtitleCue[] {
	return cues.map((cue) => ({
		text: cue.primaryText,
		secondaryText: cue.secondaryText || undefined,
		speaker: cue.speaker || undefined,
		wordTimings: cue.wordTimings,
		startTime: cue.startTime,
		duration: cue.duration,
		styleId: cue.styleId ?? undefined,
		styleDetached: cue.styleDetached,
		style:
			cue.style ??
			styles.find((candidate) => candidate.id === cue.styleId)?.style,
	}));
}

function CaptionCueCard({
	cue,
	selected,
	onSelectedChange,
	onUpdate,
}: {
	cue: EditableCaptionCue;
	selected: boolean;
	onSelectedChange: (selected: boolean) => void;
	onUpdate: (updates: Partial<EditableCaptionCue>) => void;
}) {
	const primaryRef = useRef<HTMLTextAreaElement>(null);
	const secondaryRef = useRef<HTMLTextAreaElement>(null);
	const speakerRef = useRef<HTMLInputElement>(null);
	const startRef = useRef<HTMLInputElement>(null);
	const durationRef = useRef<HTMLInputElement>(null);
	const secondaryColorRef = useRef<HTMLInputElement>(null);
	const secondaryFontSizeRef = useRef<HTMLInputElement>(null);

	const handleSave = () => {
		const startTime = Number(startRef.current?.value ?? cue.startTime);
		const duration = Number(durationRef.current?.value ?? cue.duration);
		onUpdate({
			primaryText: primaryRef.current?.value ?? cue.primaryText,
			secondaryText: secondaryRef.current?.value ?? cue.secondaryText,
			speaker: speakerRef.current?.value ?? cue.speaker,
			startTime: Number.isFinite(startTime)
				? Math.max(0, startTime)
				: cue.startTime,
			duration: Number.isFinite(duration)
				? Math.max(0.05, duration)
				: cue.duration,
			secondaryStyle: {
				...(cue.secondaryStyle ?? {}),
				color:
					secondaryColorRef.current?.value ||
					cue.secondaryStyle?.color ||
					"#ffd27d",
				fontSize: Math.max(
					1,
					Number(secondaryFontSizeRef.current?.value) ||
						cue.secondaryStyle?.fontSize ||
						3.5,
				),
			},
		});
	};

	return (
		<article className="rounded-lg border border-border/80 bg-background/55 p-2.5 shadow-xs">
			<div className="mb-2 flex items-center gap-2">
				<input
					type="checkbox"
					aria-label={`Select ${cue.name}`}
					checked={selected}
					onChange={(event) => onSelectedChange(event.target.checked)}
					className="size-3.5 accent-primary"
				/>
				<span className="min-w-0 flex-1 truncate text-[11px] font-semibold">
					{cue.name}
				</span>
				<span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] text-primary">
					{cue.startTime.toFixed(2)}s
				</span>
			</div>
			<div className="space-y-1.5">
				<Textarea
					ref={primaryRef}
					key={`${cue.id}:primary:${cue.primaryText}`}
					aria-label={`${cue.name} primary text`}
					defaultValue={cue.primaryText}
					className="min-h-12 bg-muted/30 px-2 py-1.5 text-xs"
				/>
				<Textarea
					ref={secondaryRef}
					key={`${cue.id}:secondary:${cue.secondaryText}`}
					aria-label={`${cue.name} secondary text`}
					defaultValue={cue.secondaryText}
					placeholder="Secondary language"
					className="min-h-10 bg-muted/20 px-2 py-1.5 text-[11px]"
				/>
				<div className="grid grid-cols-2 gap-1.5">
					<Input
						ref={speakerRef}
						key={`${cue.id}:speaker:${cue.speaker}`}
						aria-label={`${cue.name} speaker`}
						defaultValue={cue.speaker}
						placeholder="Speaker"
						size="xs"
						className="col-span-2"
					/>
					<Input
						ref={startRef}
						key={`${cue.id}:start:${cue.startTime}`}
						aria-label={`${cue.name} start`}
						type="number"
						min={0}
						step={0.01}
						defaultValue={cue.startTime.toFixed(2)}
						size="xs"
					/>
					<Input
						ref={durationRef}
						key={`${cue.id}:duration:${cue.duration}`}
						aria-label={`${cue.name} duration`}
						type="number"
						min={0.05}
						step={0.01}
						defaultValue={cue.duration.toFixed(2)}
						size="xs"
					/>
				</div>
				<div className="grid grid-cols-2 gap-1.5">
					<Input
						ref={secondaryColorRef}
						aria-label={`${cue.name} secondary text color`}
						defaultValue={cue.secondaryStyle?.color ?? "#ffd27d"}
						placeholder="#ffd27d"
						size="xs"
					/>
					<Input
						ref={secondaryFontSizeRef}
						aria-label={`${cue.name} secondary text font size`}
						type="number"
						min={1}
						step={0.1}
						defaultValue={cue.secondaryStyle?.fontSize ?? 3.5}
						size="xs"
					/>
				</div>
				<Button
					size="sm"
					variant="outline"
					className="w-full text-[10px]"
					onClick={handleSave}
				>
					Save cue
				</Button>
				{cue.wordTimings.length === 0 ? (
					<Button
						size="sm"
						variant="ghost"
						className="w-full text-[10px]"
						onClick={() =>
							onUpdate({
								wordTimings: createCaptionWordTimings({
									text: cue.primaryText,
									startTime: cue.startTime,
									duration: cue.duration,
								}),
							})
						}
					>
						Create editable word timing
					</Button>
				) : (
					<details className="rounded-md border border-border/60 bg-muted/20 p-1.5">
						<summary className="cursor-pointer text-[10px] font-medium">
							{cue.wordTimings.length} editable word timings
						</summary>
						<div className="mt-1.5 space-y-1">
							{cue.wordTimings.map((timing, index) => (
								<div
									key={`${cue.id}:${index}:${timing.word}`}
									className="grid grid-cols-[1fr_48px_48px] items-center gap-1"
								>
									<span className="truncate text-[9px]">{timing.word}</span>
									<Input
										aria-label={`${cue.name} ${timing.word} word start`}
										type="number"
										step={0.01}
										size="xs"
										defaultValue={timing.start.toFixed(2)}
										className="px-1 text-[9px]"
										onBlur={(event) => {
											const value = Number(event.currentTarget.value);
											if (!Number.isFinite(value)) return;
											const next = cue.wordTimings.map((word, wordIndex) =>
												wordIndex === index
													? { ...word, start: Math.max(0, value) }
													: word,
											);
											onUpdate({ wordTimings: next });
										}}
									/>
									<Input
										aria-label={`${cue.name} ${timing.word} word end`}
										type="number"
										step={0.01}
										size="xs"
										defaultValue={timing.end.toFixed(2)}
										className="px-1 text-[9px]"
										onBlur={(event) => {
											const value = Number(event.currentTarget.value);
											if (!Number.isFinite(value)) return;
											const next = cue.wordTimings.map((word, wordIndex) =>
												wordIndex === index
													? {
															...word,
															end: Math.max(word.start + 0.01, value),
														}
													: word,
											);
											onUpdate({ wordTimings: next });
										}}
									/>
								</div>
							))}
						</div>
					</details>
				)}
			</div>
		</article>
	);
}

export function Captions() {
	const [selectedLanguage, setSelectedLanguage] =
		useState<TranscriptionLanguage>("auto");
	const [transcriptionScope, setTranscriptionScope] =
		useState<TranscriptionScope>("timeline");
	const [processing, dispatch] = useReducer(processingReducer, IDLE_STATE);
	const [selectedCueIds, setSelectedCueIds] = useState<Set<string> | null>(
		null,
	);
	const [search, setSearch] = useState("");
	const [replace, setReplace] = useState("");
	const [timingOffset, setTimingOffset] = useState("0");
	const [selectedStyleId, setSelectedStyleId] = useState("");
	const [styleName, setStyleName] = useState("Documentary");
	const [styleColor, setStyleColor] = useState("#ffffff");
	const [styleFontSize, setStyleFontSize] = useState("5");
	const [pasteFormat, setPasteFormat] = useState<"srt" | "vtt" | "ass">("vtt");
	const [pastedSubtitles, setPastedSubtitles] = useState("");
	const containerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const operationTokenRef = useRef(0);
	const backgroundJobIdRef = useRef<string | null>(null);
	const editor = useEditor();
	const tracks = useEditor(
		(currentEditor) => currentEditor.scenes.getActiveScene().tracks,
	);
	const selectedElements = useEditor((currentEditor) =>
		currentEditor.selection.getSelectedElements(),
	);
	const settings = useEditor(
		(currentEditor) => currentEditor.project.getActive().settings,
	);
	const cues = useMemo(() => collectCaptionCues({ tracks }), [tracks]);
	const captionStyles = useMemo(
		() => settings.captionStyles ?? [],
		[settings.captionStyles],
	);
	const activeSelectedCueIds = useMemo(
		() => selectedCueIds ?? new Set(cues.map((cue) => cue.id)),
		[cues, selectedCueIds],
	);
	const timelineDurationSeconds = mediaTimeToSeconds({
		time: editor.timeline.getTotalDuration(),
	});
	const qualityIssues = useMemo(
		() =>
			auditCaptionCues({
				cues,
				timelineDurationSeconds,
				canvasHeight: settings.canvasSize.height,
			}),
		[cues, settings.canvasSize.height, timelineDurationSeconds],
	);
	const spellingIssues = useMemo(() => reviewCaptionSpelling({ cues }), [cues]);

	const isProcessing = processing.status === "processing";
	const activeDiagnostics = useEditor((currentEditor) =>
		currentEditor.diagnostics.getActive({
			scope: TRANSCRIPTION_DIAGNOSTICS_SCOPE,
		}),
	);

	const handleProgress = (progress: TranscriptionProgress) => {
		const value = Math.max(0, Math.min(100, progress.progress));
		if (progress.status === "loading-model") {
			dispatch({
				type: "update_step",
				step: `Loading speech model ${Math.round(value)}%`,
				progress: value,
			});
		} else if (progress.status === "transcribing") {
			dispatch({
				type: "update_step",
				step: "Transcribing speech…",
				progress: value,
			});
		}
	};

	const insertCaptions = ({
		captions,
	}: {
		captions: CaptionChunk[];
	}): boolean => {
		const trackId = insertCaptionChunksAsTextTrack({ editor, captions });
		return trackId !== null;
	};

	const handleGenerateTranscript = async () => {
		const operationToken = operationTokenRef.current + 1;
		operationTokenRef.current = operationToken;
		dispatch({ type: "start", step: "Extracting timeline audio…" });
		const handle = backgroundJobs.start({
			kind: "transcription",
			label:
				transcriptionScope === "selection"
					? "Transcribe selection"
					: "Transcribe timeline",
			run: async ({ signal, update }) => {
				const cancelTranscription = () => transcriptionService.cancel();
				signal.addEventListener("abort", cancelTranscription, { once: true });
				try {
					const selectedRange =
						transcriptionScope === "selection"
							? getSelectionRange({ tracks, selection: selectedElements })
							: null;
					if (transcriptionScope === "selection" && !selectedRange) {
						throw new Error("Select one or more timeline clips first");
					}
					update({ progress: 0.01, step: "Extracting timeline audio" });
					const audioBlob = await extractTimelineAudio({
						tracks,
						mediaAssets: editor.media.getAssets(),
						totalDuration: editor.timeline.getTotalDuration(),
						onProgress: (progress) => {
							const normalized = Math.max(0, Math.min(20, progress * 0.2));
							dispatch({
								type: "update_step",
								step: "Mixing audible timeline audio…",
								progress: normalized,
							});
							update({
								progress: normalized / 100,
								step: "Mixing audible timeline audio",
							});
						},
					});
					if (signal.aborted || operationTokenRef.current !== operationToken) {
						return;
					}

					dispatch({
						type: "update_step",
						step: "Preparing speech samples…",
						progress: 22,
					});
					update({ progress: 0.22, step: "Preparing speech samples" });
					const decoded = await decodeAudioToFloat32({
						audioBlob,
						sampleRate: DEFAULT_TRANSCRIPTION_SAMPLE_RATE,
					});
					if (signal.aborted || operationTokenRef.current !== operationToken) {
						return;
					}

					const rangeStart = selectedRange?.start ?? 0;
					const rangeEnd =
						selectedRange?.end ?? decoded.samples.length / decoded.sampleRate;
					const startSample = Math.max(
						0,
						Math.floor(rangeStart * decoded.sampleRate),
					);
					const endSample = Math.min(
						decoded.samples.length,
						Math.ceil(rangeEnd * decoded.sampleRate),
					);
					const samples = selectedRange
						? decoded.samples.slice(startSample, endSample)
						: decoded.samples;
					if (samples.length === 0) {
						throw new Error("The selected range contains no audio samples");
					}

					const result = await transcriptionService.transcribe({
						audioData: samples,
						language:
							selectedLanguage === "auto" ? undefined : selectedLanguage,
						onProgress: (progress) => {
							handleProgress(progress);
							const value = Math.max(0, Math.min(100, progress.progress));
							update({
								progress: value / 100,
								step:
									progress.status === "loading-model"
										? "Loading speech model"
										: "Transcribing speech",
							});
						},
					});
					if (signal.aborted || operationTokenRef.current !== operationToken) {
						return;
					}

					dispatch({
						type: "update_step",
						step: "Building editable caption cues…",
						progress: 96,
					});
					update({ progress: 0.96, step: "Building editable caption cues" });
					const captionChunks = buildCaptionChunks({
						segments: offsetSegments({
							segments: result.segments,
							offset: rangeStart,
						}),
					});
					if (!insertCaptions({ captions: captionChunks })) {
						throw new Error("No captions were generated");
					}
					dispatch({ type: "succeed", warnings: [] });
					toast.success(
						`Generated ${captionChunks.length} editable caption cues`,
					);
				} catch (error) {
					if (signal.aborted || operationTokenRef.current !== operationToken) {
						return;
					}
					console.error("Transcription failed:", error);
					dispatch({
						type: "fail",
						error:
							error instanceof Error
								? error.message
								: "An unexpected error occurred",
					});
					throw error;
				} finally {
					signal.removeEventListener("abort", cancelTranscription);
				}
			},
		});
		backgroundJobIdRef.current = handle.job.jobId;
		await handle.done;
	};

	const handleCancel = () => {
		operationTokenRef.current += 1;
		if (backgroundJobIdRef.current) {
			backgroundJobs.cancel({ jobId: backgroundJobIdRef.current });
		}
		transcriptionService.cancel();
		dispatch({
			type: "fail",
			error: "Transcription cancelled. You can retry with the same settings.",
			canRetry: true,
		});
	};

	const handleImportSource = async ({
		fileName,
		input,
	}: {
		fileName: string;
		input: string;
	}) => {
		dispatch({ type: "start", step: "Reading subtitle file…" });
		try {
			const result = parseSubtitleFile({ fileName, input });
			if (result.captions.length === 0) {
				throw new Error("No valid subtitle cues were found");
			}
			dispatch({
				type: "update_step",
				step: "Importing editable subtitle cues…",
				progress: 80,
			});
			if (!insertCaptions({ captions: result.captions })) {
				throw new Error("No captions were imported");
			}
			const nextWarnings = [...result.warnings];
			if (result.skippedCueCount > 0) {
				nextWarnings.unshift(
					`Imported ${result.captions.length} cues and skipped ${result.skippedCueCount} malformed cues.`,
				);
			}
			dispatch({ type: "succeed", warnings: nextWarnings });
			toast.success(`Imported ${result.captions.length} subtitle cues`);
		} catch (error) {
			console.error("Subtitle import failed:", error);
			dispatch({
				type: "fail",
				error:
					error instanceof Error
						? error.message
						: "An unexpected error occurred",
			});
		}
	};

	const handleImportFile = async ({ file }: { file: File }) => {
		await handleImportSource({
			fileName: file.name,
			input: await file.text(),
		});
	};

	const handleFileChange = async ({
		event,
	}: {
		event: React.ChangeEvent<HTMLInputElement>;
	}) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (file) await handleImportFile({ file });
	};

	const applyCueUpdates = ({
		nextCues,
	}: {
		nextCues: EditableCaptionCue[];
	}) => {
		if (nextCues.length === 0) return;
		editor.timeline.updateElements({
			updates: nextCues.map((cue) => ({
				trackId: cue.trackId,
				elementId: cue.id,
				patch: buildCaptionElementPatch({ cue }),
			})),
		});
	};

	const updateCue = ({
		cue,
		updates,
	}: {
		cue: EditableCaptionCue;
		updates: Partial<EditableCaptionCue>;
	}) => {
		applyCueUpdates({ nextCues: [{ ...cue, ...updates }] });
	};

	const handleBulkApply = () => {
		const offset = Number(timingOffset);
		if (!Number.isFinite(offset)) {
			toast.error("Timing offset must be a number");
			return;
		}
		const result = applyCaptionBulkEdit({
			cues,
			search,
			replace,
			timingOffsetSeconds: offset,
			selectedCueIds: [...activeSelectedCueIds],
		});
		if (result.changedCueCount === 0) {
			toast.info("No selected captions needed changes");
			return;
		}
		applyCueUpdates({
			nextCues: result.cues.filter((cue) => activeSelectedCueIds.has(cue.id)),
		});
		toast.success(`Updated ${result.changedCueCount} caption cues`);
	};

	const handleSpellingFix = () => {
		const result = applyCaptionSpellingFixes({
			cues,
			selectedCueIds: [...activeSelectedCueIds],
		});
		if (result.changedCueCount === 0) {
			toast.info("No repeated words or spacing issues found");
			return;
		}
		applyCueUpdates({
			nextCues: result.cues.filter((cue) => activeSelectedCueIds.has(cue.id)),
		});
		toast.success(`Cleaned ${result.changedCueCount} caption cues`);
	};

	const styleDraft = (): SubtitleStyleOverrides => ({
		color: styleColor,
		fontSize: Math.max(1, Number(styleFontSize) || 5),
		fontWeight: "bold",
		textAlign: "center",
		background: { enabled: true, color: "#00000099" },
	});

	const saveStyles = ({ styles }: { styles: CaptionStyle[] }) => {
		void editor.project.updateSettings({ settings: { captionStyles: styles } });
	};

	const handleCreateStyle = () => {
		const style = createCaptionStyle({
			id: crypto.randomUUID(),
			name: styleName,
			style: styleDraft(),
		});
		saveStyles({ styles: [...captionStyles, style] });
		setSelectedStyleId(style.id);
		toast.success(`Created style “${style.name}”`);
	};

	const handleUpdateStyle = () => {
		const current = captionStyles.find(
			(candidate) => candidate.id === selectedStyleId,
		);
		if (!current) {
			toast.error("Choose a caption style first");
			return;
		}
		const next = updateCaptionStyle({
			style: current,
			updates: { name: styleName, style: styleDraft() },
		});
		saveStyles({
			styles: captionStyles.map((style) =>
				style.id === current.id ? next : style,
			),
		});
		toast.success(`Updated style “${next.name}”`);
	};

	const handleDuplicateStyle = () => {
		const current = captionStyles.find(
			(candidate) => candidate.id === selectedStyleId,
		);
		if (!current) {
			toast.error("Choose a caption style first");
			return;
		}
		const duplicate = duplicateCaptionStyle({
			style: current,
			id: crypto.randomUUID(),
		});
		saveStyles({ styles: [...captionStyles, duplicate] });
		setSelectedStyleId(duplicate.id);
		toast.success(`Duplicated style as “${duplicate.name}”`);
	};

	const handleApplyStyle = () => {
		const style = captionStyles.find(
			(candidate) => candidate.id === selectedStyleId,
		);
		if (!style || activeSelectedCueIds.size === 0) {
			toast.error("Choose a style and at least one caption cue");
			return;
		}
		const params = buildCaptionStyleParamPatch({
			style: style.style,
			styleId: style.id,
		});
		editor.timeline.updateElements({
			updates: cues
				.filter((cue) => activeSelectedCueIds.has(cue.id))
				.map((cue) => ({
					trackId: cue.trackId,
					elementId: cue.id,
					patch: { params },
				})),
		});
		toast.success(
			`Applied “${style.name}” to ${activeSelectedCueIds.size} cues`,
		);
	};

	const handleDetachStyle = () => {
		const selectedCues = cues.filter(
			(cue) => activeSelectedCueIds.has(cue.id) && cue.styleId,
		);
		if (selectedCues.length === 0) {
			toast.info("Selected cues do not reference a reusable style");
			return;
		}
		editor.timeline.updateElements({
			updates: selectedCues.map((cue) => {
				const style =
					cue.style ??
					captionStyles.find((candidate) => candidate.id === cue.styleId)
						?.style ??
					{};
				return {
					trackId: cue.trackId,
					elementId: cue.id,
					patch: {
						params: buildCaptionStyleParamPatch({
							style,
							styleId: null,
							detached: true,
						}),
					},
				};
			}),
		});
		toast.success(`Detached ${selectedCues.length} cues from their style`);
	};

	const handleExport = ({ format }: { format: "srt" | "vtt" | "ass" }) => {
		if (cues.length === 0) {
			toast.error("There are no caption cues to export");
			return;
		}
		const result = serializeSubtitles({
			format,
			captions: getCaptionExportCues({ cues, styles: captionStyles }),
			canvasSize: settings.canvasSize,
		});
		downloadBlob({
			blob: new Blob([result.content], { type: result.mimeType }),
			filename: `opencut-captions.${result.fileExtension}`,
		});
		if (result.warnings.length > 0) {
			toast.warning(result.warnings[0], {
				description: result.warnings.slice(1).join(" "),
			});
		} else {
			toast.success(`Exported ${format.toUpperCase()} captions`);
		}
	};

	const error = processing.status === "idle" ? processing.error : null;
	const warnings = processing.status === "idle" ? processing.warnings : [];
	const canRetry = processing.status === "idle" ? processing.canRetry : false;
	const allSelected =
		cues.length > 0 && activeSelectedCueIds.size === cues.length;

	return (
		<PanelView
			title="Captions"
			contentClassName="px-0 flex flex-col h-full overflow-hidden"
			actions={
				<TooltipProvider>
					<div className="flex items-center gap-1.5">
						{!isProcessing &&
							activeDiagnostics.map((diagnostic) => (
								<Tooltip key={diagnostic.id}>
									<TooltipTrigger asChild>
										<Button
											variant={DIAGNOSTIC_BUTTON_VARIANT[diagnostic.severity]}
											size="icon"
											aria-label={diagnostic.message}
										>
											<HugeiconsIcon icon={AlertCircleIcon} size={16} />
										</Button>
									</TooltipTrigger>
									<TooltipContent>{diagnostic.message}</TooltipContent>
								</Tooltip>
							))}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => fileInputRef.current?.click()}
							disabled={isProcessing}
							className="items-center justify-center gap-1.5"
						>
							<HugeiconsIcon icon={CloudUploadIcon} />
							Import
						</Button>
					</div>
				</TooltipProvider>
			}
			ref={containerRef}
		>
			<input
				ref={fileInputRef}
				type="file"
				accept=".srt,.vtt,.ass"
				className="hidden"
				onChange={(event) => void handleFileChange({ event })}
			/>
			<div className="flex-1 overflow-y-auto">
				<div className="border-b bg-gradient-to-b from-primary/8 to-transparent px-4 pb-4 pt-3">
					<div className="mb-3 flex items-center justify-between">
						<div>
							<p className="text-xs font-semibold">
								Speech to editable captions
							</p>
							<p className="text-[10px] text-muted-foreground">
								Word timing · speakers · retry-safe
							</p>
						</div>
						<span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-600">
							Local AI
						</span>
					</div>
					<div className="grid grid-cols-1 gap-2">
						<Select
							value={selectedLanguage}
							onValueChange={(value) => {
								if (value === "auto") {
									setSelectedLanguage("auto");
									return;
								}
								const language = TRANSCRIPTION_LANGUAGES.find(
									(candidate) => candidate.code === value,
								);
								if (language) setSelectedLanguage(language.code);
							}}
						>
							<SelectTrigger
								aria-label="Transcription language"
								className="h-8"
							>
								<SelectValue placeholder="Language" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="auto">Auto detect</SelectItem>
								{TRANSCRIPTION_LANGUAGES.map((language) => (
									<SelectItem key={language.code} value={language.code}>
										{language.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Select
							value={transcriptionScope}
							onValueChange={(value) => {
								if (value === "timeline" || value === "selection") {
									setTranscriptionScope(value);
								}
							}}
						>
							<SelectTrigger aria-label="Transcription scope" className="h-8">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="timeline">Full timeline</SelectItem>
								<SelectItem value="selection">Selected clips</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="mt-2 flex gap-2">
						<Button
							type="button"
							size="sm"
							className="min-w-0 flex-1"
							onClick={() => void handleGenerateTranscript()}
							disabled={isProcessing || activeDiagnostics.length > 0}
						>
							{isProcessing && <Spinner className="mr-1" />}
							{isProcessing ? processing.step : "Generate transcript"}
						</Button>
						{isProcessing && (
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={handleCancel}
							>
								Cancel
							</Button>
						)}
						{canRetry && (
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => void handleGenerateTranscript()}
							>
								Retry
							</Button>
						)}
					</div>
					{isProcessing && (
						<div
							className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
							role="progressbar"
							aria-label="Transcription progress"
							aria-valuenow={processing.progress}
						>
							<div
								className="h-full rounded-full bg-primary transition-[width]"
								style={{ width: `${processing.progress}%` }}
							/>
						</div>
					)}
					{error && (
						<p className="mt-2 rounded-md border border-destructive/20 bg-destructive/8 p-2 text-[11px] text-destructive">
							{error}
						</p>
					)}
					{warnings.map((warning) => (
						<p
							key={warning}
							className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/8 p-2 text-[10px] text-amber-700"
						>
							{warning}
						</p>
					))}
				</div>

				<Section collapsible defaultOpen sectionKey="caption-bulk">
					<SectionHeader
						trailing={
							<span className="text-[10px] text-muted-foreground">
								{activeSelectedCueIds.size}/{cues.length} selected
							</span>
						}
					>
						<SectionTitle>Bulk text & timing</SectionTitle>
					</SectionHeader>
					<SectionContent className="space-y-2">
						<div className="grid grid-cols-1 gap-2">
							<Input
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder="Find text"
								aria-label="Find caption text"
								size="xs"
							/>
							<Input
								value={replace}
								onChange={(event) => setReplace(event.target.value)}
								placeholder="Replace with"
								aria-label="Replace caption text"
								size="xs"
							/>
						</div>
						<div className="grid grid-cols-1 gap-2">
							<Input
								value={timingOffset}
								onChange={(event) => setTimingOffset(event.target.value)}
								type="number"
								step={0.1}
								aria-label="Timing offset seconds"
								size="xs"
							/>
							<Button size="sm" variant="outline" onClick={handleBulkApply}>
								Apply changes
							</Button>
						</div>
						<div className="flex gap-2">
							<Button
								size="sm"
								variant="ghost"
								className="flex-1"
								onClick={() =>
									setSelectedCueIds(allSelected ? new Set() : null)
								}
							>
								{allSelected ? "Clear selection" : "Select all"}
							</Button>
							<Button
								size="sm"
								variant="ghost"
								className="flex-1"
								onClick={handleSpellingFix}
							>
								Fix spelling ({spellingIssues.length})
							</Button>
						</div>
					</SectionContent>
				</Section>

				<Section collapsible defaultOpen sectionKey="caption-styles">
					<SectionHeader
						trailing={
							<span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px]">
								{captionStyles.length} styles
							</span>
						}
					>
						<SectionTitle>Global styles</SectionTitle>
					</SectionHeader>
					<SectionContent className="space-y-2">
						<Select
							value={selectedStyleId || "none"}
							onValueChange={(value) => {
								const nextId = value === "none" ? "" : value;
								setSelectedStyleId(nextId);
								const style = captionStyles.find(
									(candidate) => candidate.id === nextId,
								);
								if (!style) return;
								setStyleName(style.name);
								setStyleColor(style.style.color ?? "#ffffff");
								setStyleFontSize(String(style.style.fontSize ?? 5));
							}}
						>
							<SelectTrigger aria-label="Caption style" className="h-8">
								<SelectValue placeholder="Choose style" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">No style selected</SelectItem>
								{captionStyles.map((style) => (
									<SelectItem key={style.id} value={style.id}>
										{style.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<div className="grid grid-cols-2 gap-2">
							<Input
								value={styleName}
								onChange={(event) => setStyleName(event.target.value)}
								aria-label="Caption style name"
								size="xs"
								className="col-span-2"
							/>
							<Input
								value={styleColor}
								onChange={(event) => setStyleColor(event.target.value)}
								type="color"
								aria-label="Caption style color"
								size="xs"
								className="px-1"
							/>
							<Input
								value={styleFontSize}
								onChange={(event) => setStyleFontSize(event.target.value)}
								type="number"
								min={1}
								step={0.1}
								aria-label="Caption style font size"
								size="xs"
							/>
						</div>
						<div className="grid grid-cols-2 gap-1.5">
							<Button size="sm" variant="outline" onClick={handleCreateStyle}>
								New
							</Button>
							<Button size="sm" variant="outline" onClick={handleUpdateStyle}>
								Update
							</Button>
							<Button
								size="sm"
								variant="outline"
								className="col-span-2"
								onClick={handleDuplicateStyle}
							>
								Duplicate
							</Button>
							<Button size="sm" onClick={handleApplyStyle}>
								Apply
							</Button>
							<Button size="sm" variant="ghost" onClick={handleDetachStyle}>
								Detach selected
							</Button>
						</div>
					</SectionContent>
				</Section>

				<Section collapsible defaultOpen sectionKey="caption-quality">
					<SectionHeader
						trailing={
							<span
								className={
									qualityIssues.length > 0
										? "rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold text-amber-700"
										: "rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-semibold text-emerald-700"
								}
							>
								{qualityIssues.length > 0
									? `${qualityIssues.length} issues`
									: "All clear"}
							</span>
						}
					>
						<SectionTitle>Quality checks</SectionTitle>
					</SectionHeader>
					<SectionContent>
						{qualityIssues.length === 0 ? (
							<p className="text-[11px] text-muted-foreground">
								No overlaps, unsafe placement, reading-speed, gap, line, or
								boundary issues.
							</p>
						) : (
							<ul className="space-y-1.5">
								{qualityIssues.slice(0, 8).map((issue) => (
									<li
										key={issue.id}
										className="flex gap-2 rounded-md bg-amber-500/8 px-2 py-1.5 text-[10px]"
									>
										<span className="font-semibold text-amber-700">
											{issue.kind}
										</span>
										<span className="text-muted-foreground">
											{issue.message}
										</span>
									</li>
								))}
							</ul>
						)}
					</SectionContent>
				</Section>

				<Section collapsible defaultOpen sectionKey="caption-cues">
					<SectionHeader
						trailing={
							<span className="font-mono text-[10px] text-muted-foreground">
								{cues.length} cues
							</span>
						}
					>
						<SectionTitle>Editable cue list</SectionTitle>
					</SectionHeader>
					<SectionContent className="space-y-2">
						{cues.length === 0 ? (
							<div className="rounded-lg border border-dashed p-5 text-center">
								<p className="text-xs font-medium">No caption cues yet</p>
								<p className="mt-1 text-[10px] text-muted-foreground">
									Generate speech captions or import SRT, VTT, or ASS.
								</p>
							</div>
						) : (
							cues.map((cue) => (
								<CaptionCueCard
									key={cue.id}
									cue={cue}
									selected={activeSelectedCueIds.has(cue.id)}
									onSelectedChange={(selected) => {
										setSelectedCueIds((current) => {
											const next = new Set(current ?? activeSelectedCueIds);
											if (selected) next.add(cue.id);
											else next.delete(cue.id);
											return next;
										});
									}}
									onUpdate={(updates) => updateCue({ cue, updates })}
								/>
							))
						)}
					</SectionContent>
				</Section>

				<Section showBottomBorder={false}>
					<SectionHeader>
						<SectionTitle>Caption interchange</SectionTitle>
					</SectionHeader>
					<SectionContent>
						<div className="mb-3 space-y-2 rounded-lg border border-dashed p-2.5">
							<div className="flex items-center gap-2">
								<Select
									value={pasteFormat}
									onValueChange={(value) => {
										if (value === "srt" || value === "vtt" || value === "ass") {
											setPasteFormat(value);
										}
									}}
								>
									<SelectTrigger
										aria-label="Pasted subtitle format"
										className="h-7 w-24"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="srt">SRT</SelectItem>
										<SelectItem value="vtt">VTT</SelectItem>
										<SelectItem value="ass">ASS</SelectItem>
									</SelectContent>
								</Select>
								<p className="text-[10px] text-muted-foreground">
									Paste subtitle source
								</p>
							</div>
							<Textarea
								value={pastedSubtitles}
								onChange={(event) =>
									setPastedSubtitles(event.currentTarget.value)
								}
								aria-label="Pasted subtitle source"
								placeholder="Paste SRT, VTT, or ASS text…"
								className="min-h-20 font-mono text-[10px]"
							/>
							<Button
								size="sm"
								variant="outline"
								className="w-full"
								disabled={!pastedSubtitles.trim() || isProcessing}
								onClick={() =>
									void handleImportSource({
										fileName: `pasted.${pasteFormat}`,
										input: pastedSubtitles,
									})
								}
							>
								Import pasted {pasteFormat.toUpperCase()}
							</Button>
						</div>
						<SectionFields>
							<SectionField label="Export timeline captions">
								<div className="grid grid-cols-3 gap-2">
									{(["srt", "vtt", "ass"] as const).map((format) => (
										<Button
											key={format}
											size="sm"
											variant="outline"
											onClick={() => handleExport({ format })}
										>
											{format.toUpperCase()}
										</Button>
									))}
								</div>
							</SectionField>
						</SectionFields>
						<p className="mt-2 text-[9px] leading-relaxed text-muted-foreground">
							Exports warn before flattening speaker, bilingual, or reusable
							style metadata that a target format cannot preserve.
						</p>
					</SectionContent>
				</Section>
			</div>
		</PanelView>
	);
}
