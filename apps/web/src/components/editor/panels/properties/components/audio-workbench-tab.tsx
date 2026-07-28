"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	analyzeAudioBuffer,
	buildNormalizationPatch,
	type AudioAnalysisResult,
} from "@/audio/analysis";
import {
	advanceVoiceOverState,
	buildVoiceOverFilename,
	chooseVoiceOverMimeType,
	createVoiceOverState,
	type VoiceOverEvent,
} from "@/audio/voice-over";
import { BatchCommand } from "@/commands";
import { AddMediaAssetCommand } from "@/commands/media";
import { InsertElementCommand } from "@/commands/timeline";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useEditor } from "@/editor/use-editor";
import {
	createAudioContext,
	decodeMediaAssetAudio,
} from "@/media/audio";
import { processMediaAssets } from "@/media/processing";
import { buildWaveformSourceKey } from "@/media/waveform-summary";
import { waveformCache } from "@/services/waveform-cache/service";
import {
	findSeparatedAudioCompanion,
	isSourceAudioSeparated,
	planSourceAudioRecovery,
} from "@/timeline/audio-separation";
import { buildElementFromMedia, hasMediaId } from "@/timeline/element-utils";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import type { AudioElement, VideoElement } from "@/timeline";
import {
	mediaTimeFromSeconds,
	type MediaTime,
	ZERO_MEDIA_TIME,
} from "@/wasm";
import { cn } from "@/utils/ui";
import { ElementParamsTab } from "./element-params-tab";

const AUDIO_PARAM_KEYS = [
	"volume",
	"audioFadeIn",
	"audioFadeOut",
	"muted",
] as const;

type AudioWorkbenchElement = AudioElement | VideoElement;

function formatDb(value: number): string {
	if (!Number.isFinite(value)) return "—";
	return `${value >= 0 ? "+" : ""}${value.toFixed(1)} dB`;
}

function formatLufs(value: number): string {
	if (!Number.isFinite(value)) return "—";
	return `${value.toFixed(1)} LUFS`;
}

function Metric({
	label,
	value,
	tone = "default",
}: {
	label: string;
	value: string;
	tone?: "default" | "warning" | "good";
}) {
	return (
		<div className="bg-muted/35 rounded-md border px-2.5 py-2">
			<div className="text-muted-foreground text-[10px] uppercase tracking-wide">
				{label}
			</div>
			<div
				className={cn(
					"mt-1 text-sm font-semibold tabular-nums",
					tone === "warning" && "text-orange-500",
					tone === "good" && "text-emerald-500",
				)}
			>
				{value}
			</div>
		</div>
	);
}

function LabeledSwitch({
	label,
	description,
	checked,
	onCheckedChange,
}: {
	label: string;
	description: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
}) {
	return (
		<div className="flex items-center gap-3 rounded-md border px-3 py-2.5">
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium">{label}</div>
				<div className="text-muted-foreground mt-0.5 text-xs leading-4">
					{description}
				</div>
			</div>
			<Switch
				aria-label={label}
				checked={checked}
				onCheckedChange={onCheckedChange}
			/>
		</div>
	);
}

export function AudioWorkbenchTab({
	element,
	trackId,
}: {
	element: AudioWorkbenchElement;
	trackId: string;
}) {
	const editor = useEditor();
	useEditor((instance) => instance.media.getAssets());
	useEditor((instance) => instance.scenes.getActiveSceneOrNull());
	const { renderElement } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});
	const audioElement = renderElement as AudioWorkbenchElement;
	const [analysis, setAnalysis] = useState<AudioAnalysisResult | null>(null);
	const [analysisStatus, setAnalysisStatus] = useState<
		"idle" | "loading" | "error"
	>("idle");
	const [analysisError, setAnalysisError] = useState<string | null>(null);
	const [targetLufs, setTargetLufs] = useState(-14);
	const [cacheStats, setCacheStats] = useState(() =>
		waveformCache.getStats(),
	);

	const commitParams = useCallback(
		(nextParams: AudioWorkbenchElement["params"]) => {
			editor.timeline.updateElements({
				updates: [
					{
						trackId,
						elementId: audioElement.id,
						patch: { params: nextParams },
					},
				],
			});
		},
		[audioElement.id, editor, trackId],
	);

	const updateParam = useCallback(
		(key: string, value: number | boolean) => {
			commitParams({ ...audioElement.params, [key]: value });
		},
		[audioElement.params, commitParams],
	);

	const mediaAsset = hasMediaId(audioElement)
		? editor.media
				.getAssets()
				.find((asset) => asset.id === audioElement.mediaId)
		: undefined;

	const runAnalysis = useCallback(async () => {
		setAnalysisStatus("loading");
		setAnalysisError(null);
		try {
			let buffer: AudioBuffer | null = null;
			if (mediaAsset) {
				buffer = await decodeMediaAssetAudio({ asset: mediaAsset });
			} else if (
				audioElement.type === "audio" &&
				audioElement.sourceType === "library"
			) {
				const response = await fetch(audioElement.sourceUrl);
				if (!response.ok) throw new Error("Could not fetch the audio source");
				const context = createAudioContext();
				try {
					buffer = await context.decodeAudioData(
						(await response.arrayBuffer()).slice(0),
					);
				} finally {
					void context.close();
				}
			}
			if (!buffer) throw new Error("No decodable audio is available");
			setAnalysis(
				analyzeAudioBuffer({
					audioBuffer: buffer,
					targetLufs,
				}),
			);
			setCacheStats(waveformCache.getStats());
			setAnalysisStatus("idle");
		} catch (error) {
			setAnalysisStatus("error");
			setAnalysisError(
				error instanceof Error ? error.message : "Audio analysis failed",
			);
		}
	}, [audioElement, mediaAsset, targetLufs]);

	const normalize = useCallback(() => {
		if (!analysis) return;
		editor.timeline.updateElements({
			updates: [
				{
					trackId,
					elementId: audioElement.id,
					patch: buildNormalizationPatch({
						element: audioElement,
						analysis,
					}),
				},
			],
		});
	}, [analysis, audioElement, editor, trackId]);

	const sceneTracks = editor.scenes.getActiveScene().tracks;
	const separatedCompanion =
		audioElement.type === "video"
			? findSeparatedAudioCompanion({
					tracks: sceneTracks,
					sourceElement: audioElement,
				})
			: null;
	const sourceSeparated =
		audioElement.type === "video" &&
		isSourceAudioSeparated({ element: audioElement });
	const recoveryPlan =
		audioElement.type === "video" && separatedCompanion
			? planSourceAudioRecovery({
					sourceElement: audioElement,
					companion: separatedCompanion.element,
				})
			: null;

	return (
		<div className="pb-6">
			<ElementParamsTab
				element={audioElement}
				trackId={trackId}
				paramKeys={AUDIO_PARAM_KEYS}
				sectionKey="audio-level"
			/>

			<Section
				collapsible
				sectionKey={`${audioElement.id}:audio-analysis`}
				showTopBorder
			>
				<SectionHeader>
					<SectionTitle>Audio analysis</SectionTitle>
				</SectionHeader>
				<SectionContent className="pt-0">
					<SectionFields>
						<div className="grid grid-cols-2 gap-2">
							<Metric
								label="Integrated"
								value={analysis ? formatLufs(analysis.integratedLufs) : "Not run"}
							/>
							<Metric
								label="Peak"
								value={analysis ? formatDb(analysis.peakDbfs) : "Not run"}
								tone={analysis?.clippingDetected ? "warning" : "default"}
							/>
							<Metric
								label="Clipped samples"
								value={analysis ? String(analysis.clippedSampleCount) : "—"}
								tone={analysis?.clippingDetected ? "warning" : "good"}
							/>
							<Metric
								label="Suggested gain"
								value={
									analysis
										? formatDb(analysis.normalizationGainDb)
										: "—"
								}
							/>
						</div>
						<SectionField
							label="Target loudness"
							afterLabel={
								<span className="text-muted-foreground text-xs">
									{targetLufs} LUFS
								</span>
							}
						>
							<Slider
								aria-label="Target loudness"
								min={-24}
								max={-9}
								step={1}
								value={[targetLufs]}
								onValueChange={([value]) => setTargetLufs(value)}
							/>
						</SectionField>
						{analysis?.clippingDetected ? (
							<div
								role="alert"
								className="border-orange-500/40 bg-orange-500/10 rounded-md border px-3 py-2 text-xs leading-5 text-orange-600 dark:text-orange-300"
							>
								Source clipping detected. Normalization is non-destructive, but
								cannot reconstruct already flattened peaks.
							</div>
						) : null}
						{analysisError ? (
							<div className="text-destructive text-xs">{analysisError}</div>
						) : null}
						<div className="grid grid-cols-2 gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => void runAnalysis()}
								disabled={analysisStatus === "loading"}
							>
								{analysisStatus === "loading" ? "Analysing…" : "Analyse clip"}
							</Button>
							<Button
								size="sm"
								onClick={normalize}
								disabled={!analysis || analysisStatus === "loading"}
							>
								Normalize safely
							</Button>
						</div>
						<p className="text-muted-foreground text-[11px] leading-4">
							Estimated locally from decoded PCM. The source file is never
							rewritten; Normalize creates one undoable volume change.
						</p>
					</SectionFields>
				</SectionContent>
			</Section>

			{audioElement.type === "video" ? (
				<Section
					collapsible
					sectionKey={`${audioElement.id}:source-audio`}
					showTopBorder
				>
					<SectionHeader>
						<SectionTitle>Source audio</SectionTitle>
					</SectionHeader>
					<SectionContent className="pt-0">
						<SectionFields>
							<div className="flex items-center justify-between rounded-md border px-3 py-2.5">
								<div>
									<div className="text-sm font-medium">
										{sourceSeparated ? "Separated" : "Attached to video"}
									</div>
									<div className="text-muted-foreground mt-0.5 text-xs">
										{sourceSeparated
											? separatedCompanion
												? "Generated companion found"
												: "No generated companion found"
											: "Video and source audio share timing"}
									</div>
								</div>
								<span
									className={cn(
										"rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
										sourceSeparated
											? "bg-sky-500/15 text-sky-500"
											: "bg-emerald-500/15 text-emerald-500",
									)}
								>
									{sourceSeparated ? "Separate" : "Linked"}
								</span>
							</div>
							{recoveryPlan && !recoveryPlan.ok ? (
								<div className="border-orange-500/40 bg-orange-500/10 rounded-md border px-3 py-2 text-xs leading-5 text-orange-600 dark:text-orange-300">
									{recoveryPlan.reason}. This prevents drift or silent loss of
									edits.
								</div>
							) : null}
							<Button
								variant="outline"
								size="sm"
								disabled={recoveryPlan?.ok === false}
								onClick={() =>
									editor.timeline.toggleSourceAudioSeparation({
										trackId,
										elementId: audioElement.id,
									})
								}
							>
								{sourceSeparated
									? "Recover and remove companion"
									: "Separate source audio"}
							</Button>
						</SectionFields>
					</SectionContent>
				</Section>
			) : null}

			<Section
				collapsible
				sectionKey={`${audioElement.id}:audio-processing`}
				showTopBorder
			>
				<SectionHeader>
					<SectionTitle>Processing chain</SectionTitle>
				</SectionHeader>
				<SectionContent className="pt-0">
					<SectionFields>
						<LabeledSwitch
							label="Noise reduction"
							description="Low-cut and gentle noise gate for room rumble."
							checked={audioElement.params.audioNoiseReduction === true}
							onCheckedChange={(checked) =>
								updateParam("audioNoiseReduction", checked)
							}
						/>
						<LabeledSwitch
							label="Voice enhancement"
							description="Adds vocal presence and controlled dynamics."
							checked={audioElement.params.audioVoiceEnhance === true}
							onCheckedChange={(checked) =>
								updateParam("audioVoiceEnhance", checked)
							}
						/>
						<SectionField
							label="Channel balance"
							afterLabel={
								<span className="text-muted-foreground text-xs tabular-nums">
									{Number(
										audioElement.params.audioChannelBalance ?? 0,
									).toFixed(2)}
								</span>
							}
						>
							<Slider
								aria-label="Channel balance"
								min={-1}
								max={1}
								step={0.01}
								value={[
									Number(audioElement.params.audioChannelBalance ?? 0),
								]}
								onValueCommit={([value]) =>
									updateParam("audioChannelBalance", value)
								}
							/>
						</SectionField>
						<SectionField label="Processing gain">
							<Input
								aria-label="Processing gain"
								type="number"
								size="sm"
								min={-24}
								max={24}
								step={0.5}
								value={Number(
									audioElement.params.audioProcessingGainDb ?? 0,
								)}
								onChange={(event) =>
									updateParam(
										"audioProcessingGainDb",
										Math.max(-24, Math.min(24, Number(event.target.value))),
									)
								}
							/>
						</SectionField>
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								commitParams({
									...audioElement.params,
									audioNoiseReduction: false,
									audioVoiceEnhance: false,
									audioChannelBalance: 0,
									audioProcessingGainDb: 0,
								})
							}
						>
							Reset processing
						</Button>
						<p className="text-muted-foreground text-[11px] leading-4">
							Preview and export use the same non-destructive chain. Every
							change is undoable.
						</p>
					</SectionFields>
				</SectionContent>
			</Section>

			<Section
				collapsible
				sectionKey={`${audioElement.id}:waveform-cache`}
				showTopBorder
			>
				<SectionHeader>
					<SectionTitle>Waveform performance</SectionTitle>
				</SectionHeader>
				<SectionContent className="pt-0">
					<div className="grid grid-cols-2 gap-2">
						<Metric label="Cached sources" value={String(cacheStats.entries)} />
						<Metric
							label="Cache reuse"
							value={`${cacheStats.hits} hits`}
							tone={cacheStats.hits > 0 ? "good" : "default"}
						/>
						<Metric label="Builds" value={String(cacheStats.misses)} />
						<Metric
							label="Errors"
							value={String(cacheStats.errors)}
							tone={cacheStats.errors > 0 ? "warning" : "good"}
						/>
						<Button
							className="col-span-2"
							variant="outline"
							size="sm"
							onClick={() => {
								const sourceKey = mediaAsset
									? buildWaveformSourceKey({
											kind: "media",
											id: mediaAsset.id,
										})
									: buildWaveformSourceKey({
											kind: "library",
											id:
												audioElement.type === "audio" &&
												audioElement.sourceType === "library"
													? audioElement.sourceUrl
													: audioElement.id,
										});
								waveformCache.clearSource({ sourceKey });
								setCacheStats(waveformCache.getStats());
							}}
						>
							Rebuild selected waveform
						</Button>
					</div>
					<p className="text-muted-foreground mt-3 text-[11px] leading-4">
						Long clips reuse one source summary and draw only the visible
						timeline range.
					</p>
				</SectionContent>
			</Section>

			<VoiceOverRecorder />
		</div>
	);
}

function VoiceOverRecorder() {
	const editor = useEditor();
	const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
	const [deviceId, setDeviceId] = useState("default");
	const [countInSeconds, setCountInSeconds] = useState(3);
	const [state, setState] = useState(() =>
		createVoiceOverState({ countInSeconds: 3 }),
	);
	const stateRef = useRef(state);
	const streamRef = useRef<MediaStream | null>(null);
	const recorderRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const intervalRef = useRef<number | null>(null);
	const animationRef = useRef<number | null>(null);
	const startedAtRef = useRef(0);
	const placementTimeRef = useRef<MediaTime>(ZERO_MEDIA_TIME);
	const meterCleanupRef = useRef<() => void>(() => {});

	useEffect(() => {
		stateRef.current = state;
	}, [state]);

	const dispatch = useCallback((event: VoiceOverEvent) => {
		setState((current) => advanceVoiceOverState({ state: current, event }));
	}, []);

	const refreshDevices = useCallback(async () => {
		if (!navigator.mediaDevices?.enumerateDevices) return;
		const nextDevices = (await navigator.mediaDevices.enumerateDevices()).filter(
			(device) => device.kind === "audioinput",
		);
		setDevices(nextDevices);
		if (
			nextDevices.length > 0 &&
			!nextDevices.some((device) => device.deviceId === deviceId)
		) {
			setDeviceId(nextDevices[0].deviceId);
		}
	}, [deviceId]);

	useEffect(() => {
		const initialRefresh = window.setTimeout(() => {
			void refreshDevices();
		}, 0);
		navigator.mediaDevices?.addEventListener("devicechange", refreshDevices);
		return () => {
			window.clearTimeout(initialRefresh);
			navigator.mediaDevices?.removeEventListener(
				"devicechange",
				refreshDevices,
			);
		};
	}, [refreshDevices]);

	const stopMeter = useCallback(() => {
		meterCleanupRef.current();
		meterCleanupRef.current = () => {};
		if (animationRef.current !== null) {
			cancelAnimationFrame(animationRef.current);
			animationRef.current = null;
		}
	}, []);

	const stopStream = useCallback(() => {
		stopMeter();
		for (const track of streamRef.current?.getTracks() ?? []) track.stop();
		streamRef.current = null;
	}, [stopMeter]);

	useEffect(
		() => () => {
			if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
			if (recorderRef.current?.state === "recording") {
				recorderRef.current.stop();
			}
			stopStream();
		},
		[stopStream],
	);

	const placeTake = useCallback(
		async ({ blob, mimeType }: { blob: Blob; mimeType: string }) => {
			const activeProject = editor.project.getActive();
			if (!activeProject) throw new Error("No active project");
			const takeNumber =
				editor.media
					.getAssets()
					.filter((asset) => asset.name.startsWith("Voice-over Take")).length +
				1;
			const file = new File(
				[blob],
				buildVoiceOverFilename({ takeNumber, mimeType }),
				{ type: mimeType || blob.type || "audio/webm" },
			);
			const processed = await processMediaAssets({ files: [file] });
			const asset = processed[0];
			if (!asset) throw new Error("The recorded take could not be decoded");

			const addMedia = new AddMediaAssetCommand({
				projectId: activeProject.metadata.id,
				asset,
			});
			const duration = mediaTimeFromSeconds({
				seconds: Math.max(
					0.05,
					asset.duration ?? stateRef.current.elapsedSeconds,
				),
			});
			const element = buildElementFromMedia({
				mediaId: addMedia.getAssetId(),
				mediaType: "audio",
				name: asset.name,
				duration,
				startTime: placementTimeRef.current,
			});
			const insert = new InsertElementCommand({
				element,
				placement: { mode: "auto", trackType: "audio" },
			});
			editor.command.execute({
				command: new BatchCommand([addMedia, insert]),
			});
		},
		[editor],
	);

	const beginRecording = useCallback(
		(stream: MediaStream) => {
			const mimeType = chooseVoiceOverMimeType({
				supported: (candidate) => MediaRecorder.isTypeSupported(candidate),
			});
			const recorder = new MediaRecorder(
				stream,
				mimeType ? { mimeType } : undefined,
			);
			recorderRef.current = recorder;
			chunksRef.current = [];
			startedAtRef.current = performance.now();
			recorder.addEventListener("dataavailable", (event) => {
				if (event.data.size > 0) chunksRef.current.push(event.data);
			});
			recorder.addEventListener("stop", () => {
				const elapsedSeconds = Math.max(
					0.05,
					(performance.now() - startedAtRef.current) / 1_000,
				);
				dispatch({ type: "elapsed", value: elapsedSeconds });
				const blob = new Blob(chunksRef.current, {
					type: recorder.mimeType || mimeType || "audio/webm",
				});
				void placeTake({ blob, mimeType: blob.type })
					.then(() => dispatch({ type: "ready" }))
					.catch((error) =>
						dispatch({
							type: "error",
							message:
								error instanceof Error
									? error.message
									: "Could not place the recording",
						}),
					)
					.finally(stopStream);
			});
			recorder.start(250);
		},
		[dispatch, placeTake, stopStream],
	);

	const startMeter = useCallback(
		(stream: MediaStream) => {
			const context = createAudioContext();
			const source = context.createMediaStreamSource(stream);
			const analyser = context.createAnalyser();
			analyser.fftSize = 256;
			source.connect(analyser);
			const samples = new Uint8Array(analyser.frequencyBinCount);
			const tick = () => {
				analyser.getByteTimeDomainData(samples);
				let sumSquares = 0;
				for (const value of samples) {
					const centered = (value - 128) / 128;
					sumSquares += centered * centered;
				}
				dispatch({
					type: "level",
					value: Math.min(1, Math.sqrt(sumSquares / samples.length) * 4),
				});
				if (stateRef.current.phase === "recording") {
					dispatch({
						type: "elapsed",
						value: (performance.now() - startedAtRef.current) / 1_000,
					});
				}
				animationRef.current = requestAnimationFrame(tick);
			};
			tick();
			meterCleanupRef.current = () => {
				if (animationRef.current !== null) {
					cancelAnimationFrame(animationRef.current);
					animationRef.current = null;
				}
				source.disconnect();
				analyser.disconnect();
				void context.close();
			};
		},
		[dispatch],
	);

	const arm = useCallback(async () => {
		try {
			if (!navigator.mediaDevices?.getUserMedia) {
				throw new Error("Audio recording is unavailable in this browser");
			}
			const stream = await navigator.mediaDevices.getUserMedia({
				audio:
					deviceId === "default"
						? true
						: { deviceId: { exact: deviceId } },
			});
			streamRef.current = stream;
			placementTimeRef.current = editor.playback.getCurrentTime();
			startMeter(stream);
			await refreshDevices();
			const armed = createVoiceOverState({ countInSeconds });
			setState(advanceVoiceOverState({ state: armed, event: { type: "arm" } }));
			if (countInSeconds === 0) {
				beginRecording(stream);
				return;
			}
			let remaining = countInSeconds;
			intervalRef.current = window.setInterval(() => {
				remaining -= 1;
				dispatch({ type: "tick" });
				if (remaining <= 0) {
					if (intervalRef.current !== null) {
						window.clearInterval(intervalRef.current);
						intervalRef.current = null;
					}
					beginRecording(stream);
				}
			}, 1_000);
		} catch (error) {
			dispatch({
				type: "error",
				message:
					error instanceof Error
						? error.message
						: "Microphone permission failed",
			});
			stopStream();
		}
	}, [
		beginRecording,
		countInSeconds,
		deviceId,
		dispatch,
		editor,
		refreshDevices,
		startMeter,
		stopStream,
	]);

	const stop = useCallback(() => {
		if (intervalRef.current !== null) {
			window.clearInterval(intervalRef.current);
			intervalRef.current = null;
		}
		if (recorderRef.current?.state === "recording") {
			dispatch({ type: "stop" });
			recorderRef.current.stop();
		} else {
			dispatch({ type: "ready" });
			stopStream();
		}
	}, [dispatch, stopStream]);

	const busy =
		state.phase === "counting" ||
		state.phase === "recording" ||
		state.phase === "processing";

	return (
		<Section
			collapsible
			sectionKey="audio:voice-over"
			showTopBorder
			showBottomBorder={false}
		>
			<SectionHeader>
				<SectionTitle>Voice-over recording</SectionTitle>
			</SectionHeader>
			<SectionContent className="pt-0">
				<SectionFields>
					<SectionField label="Input">
						<select
							aria-label="Voice-over input"
							className="bg-input border-border h-8 w-full rounded-md border px-2 text-sm"
							value={deviceId}
							disabled={busy}
							onChange={(event) => setDeviceId(event.target.value)}
						>
							{devices.length === 0 ? (
								<option value="default">Default microphone</option>
							) : (
								devices.map((device, index) => (
									<option key={device.deviceId} value={device.deviceId}>
										{device.label || `Microphone ${index + 1}`}
									</option>
								))
							)}
						</select>
					</SectionField>
					<SectionField label="Count in">
						<div className="grid grid-cols-3 gap-2">
							{[0, 3, 5].map((seconds) => (
								<Button
									key={seconds}
									variant={
										countInSeconds === seconds ? "secondary" : "outline"
									}
									size="sm"
									disabled={busy}
									onClick={() => {
										setCountInSeconds(seconds);
										setState(createVoiceOverState({ countInSeconds: seconds }));
									}}
								>
									{seconds === 0 ? "None" : `${seconds}s`}
								</Button>
							))}
						</div>
					</SectionField>
					<div className="bg-muted/35 rounded-md border p-3">
						<div className="flex items-center justify-between">
							<div className="text-sm font-medium">
								{state.phase === "ready"
									? "Ready to record"
									: state.phase === "counting"
										? `Recording in ${state.countInRemaining}…`
										: state.phase === "recording"
											? "Recording"
											: state.phase === "processing"
												? "Placing take…"
												: "Microphone error"}
							</div>
							<div className="font-mono text-xs tabular-nums">
								{state.elapsedSeconds.toFixed(1)}s
							</div>
						</div>
						<div className="bg-background mt-3 h-2 overflow-hidden rounded-full border">
							<div
								aria-label="Input level"
								className={cn(
									"h-full origin-left transition-transform",
									state.level > 0.9 ? "bg-orange-500" : "bg-emerald-500",
								)}
								style={{ transform: `scaleX(${Math.max(0.01, state.level)})` }}
							/>
						</div>
					</div>
					{state.error ? (
						<div role="alert" className="text-destructive text-xs">
							{state.error}
						</div>
					) : null}
					{busy ? (
						<Button
							variant="destructive"
							size="sm"
							onClick={stop}
							disabled={state.phase === "processing"}
						>
							{state.phase === "processing" ? "Processing…" : "Stop and place"}
						</Button>
					) : (
						<Button size="sm" onClick={() => void arm()}>
							Record at playhead
						</Button>
					)}
					<p className="text-muted-foreground text-[11px] leading-4">
						The level meter monitors input without speaker echo. Stopping creates
						one named take and places it on an audio track; Undo removes both.
					</p>
				</SectionFields>
			</SectionContent>
		</Section>
	);
}
