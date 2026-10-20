export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}
export interface Evidence {
	referenceId: string | null;
	status: string;
	description: string;
}
export interface Style {
	grid?: {spacing:number; width:number; color:string};
	id: string;
	description: string;
	fontFamily: string;
	fontSize: number;
	weight: number;
	italic: boolean;
	letterSpacing?: number;
	textAlign?: "left" | "center" | "right";
	fill: string;
	stroke: string;
	strokeWidth: number;
	background: string | null;
	backgroundOpacity?: number | null;
	backgroundCornerRadius?: number | null;
	backgroundPadding?: {x:number;y:number} | null;
	shadow: {
		color: string;
		opacity: number;
		blur: number;
		x: number;
		y: number;
	} | null;
	lineHeight: number;
	maxLines: number;
}
export interface MotionTiming {
	enterEnd: number;
	exitStart: number;
	enterSeconds: number;
	exitSeconds: number;
	coverage?: { minExitFrames: number; minPostFrames: number };
}
export interface ExitSampling {
	basis: "predicted_frame_sampling";
	status: "not_requested" | "passed" | "warning";
	records: {
		elementId: string;
		templateElementId?: string | null;
		templateInstanceId?: string | null;
		groupPath: string[];
		exitStartTicks: number;
		effectiveStartTicks?: number;
		effectiveEndTicks: number;
		lastFrameTicks: number | null;
		exitFrames: number;
		postFrames: number;
		required: { minExitFrames: number; minPostFrames: number };
		findings: string[];
	}[];
}
export type ObservedFrameSampling = {
	basis: "decoded_video_frame_pts";
	outputSha256: string;
} & ({
	status: "passed" | "warning";
	timebase: number;
	framesObserved: number;
	lastFrameTicks: number;
	records: ExitSampling["records"];
	pixelDisappearanceVerified: false;
	listened: false;
} | { status: "not_measured"; reason?: string } | { status: "not_requested" });
/** Native spatial-relation contract; dimensions are resolved by the renderer. */
export interface TextSizeBinding {
	width?: { factor: number; padding: number };
	height?: { factor: number; padding: number };
}
export interface SpatialRelation {
	elementId: string;
	relativeTo: string;
	placement: string;
	gap: number;
	offsetX: number;
	offsetY: number;
	followMotion?: boolean;
	referenceBounds?: "layout" | "text_box";
	sizeBinding?: TextSizeBinding;
}
export interface ReadingReplica {
	elementId: string;
	primaryId: string;
}
export interface EllipseArc {
	startDegrees: number;
	sweepDegrees: number;
	cap: "round" | "butt";
}
export interface StarGeometry {points:number;depth:number}
/** Corner radius as 0–50% of the rendered rectangle's shorter side. */
export interface RectangleGeometry {cornerRadius:number}
export interface Element {
	starGeometry?: StarGeometry;
	rectangleGeometry?: RectangleGeometry;
	ellipseArc?: EllipseArc;
	minDisplaySeconds?: number;
	id: string;
	features: {
		role: string | null;
		representation: string;
		mediaUse: string | null;
		outline: boolean;
		accent: boolean;
		placement: string;
		avoidProtectedRegions: boolean;
	};
	description: string;
	binding: string;
	literal: string | null;
	styleId: string | null;
	resourceId: string | null;
	region: Rect;
	z: number;
	timing: {
        endAnchor?: "event_end" | "cue_end" | "semantic_end" | "video_end";
		anchor: string;
		offsetSeconds: number;
		minSeconds: number;
		maxSeconds: number;
	};
	motions: {
		property: string;
		keys: { time: number; value: number; easing: string }[];
	}[];
	motionTiming?: MotionTiming;
	intents: string[];
	priority: number;
	exclusiveGroup: string | null;
	evidence: Evidence[];
}
export interface Template {
	composition?: Composition;
	schemaVersion: string;
	id: string;
	revision: number;
	name: string;
	description: string;
	tags: string[];
	canvas: { width: number; height: number; fps: number };
	elements: Element[];
	styles: Style[];
	resourceSlots: {
		id: string;
		representation: string;
		description: string;
		tags: string[];
	}[];
	resourceBindings: { slotId: string; assetId: string; enabled?: boolean }[];
	layouts: {
		id: string;
		description: string;
		mode: string;
		videoRegion: Rect;
		secondary?: { resourceId: string; region: Rect } | null;
		captionRegion: Rect;
		safeRegions: Rect[];
		intents: string[];
		evidence: Evidence[];
	}[];
	layoutEntrances: {
		layoutId: string;
		effect: string;
		durationSeconds: number;
	}[];
	transitionRules: {
		id: string;
		fromLayoutId: string;
		toLayoutId: string;
		effect: string;
		durationSeconds: number;
	}[];
	segmentation: {
		pauseBoundarySeconds: number;
		maxPhraseSeconds: number;
		preserveLayoutPhrases?: boolean;
		maxCharacters: number;
		maxCharactersPerSecond: number;
	};
	visualRhythm: { minDisplaySeconds: number; maxAccentsPerCue: number };
	audioPlacement: {
		effectCooldownSeconds: number;
	};
	mix: {
		musicGainDb: number;
		musicDuckDb: number;
		effectGainDb?: number;
		musicDuckAttackSeconds?: number;
		musicDuckReleaseSeconds?: number;
	};
	evidence: Evidence[];
}
export interface Composition {
	readingReplicas?: ReadingReplica[];
	rigidTransforms?: {id:string;elementIds:string[];pivotX:number;pivotY:number;rotationDegrees:number}[];
	accumulatingLists?: { items: {elementId:string; startEventId:string}[]; endEventId:string }[];
	lifecycles?: { elementId: string; startEventId: string; endEventId: string }[];
	stateRelations?: { sourceElementId: string; targetElementId: string; opacity: number; durationSeconds: number }[];
	groups: { id: string; elementIds: string[]; composite?: boolean; separateInstances?: boolean }[];
	arrangements?: {
		groupId: string;
		region: { x: number; y: number; width: number; height: number };
		columns: number;
		gap: number;
	}[];
	treatments: {
		id: string;
		operation:
			| { kind: "text_highlight"; color: string; mode?: "keyword" | "active_word"; stroke?: {color:string; width:number} }
			| { kind: "canvas_clip"; region: Rect }
			| { kind: "blur"; intensity: number }
			| {
					kind: "color_grade";
					exposure: number;
					contrast: number;
					saturation: number;
					temperature: number;
			  }
			| { kind: "motion"; channels: Element["motions"]; motionTiming?: Element["motionTiming"]; repeatSeconds?: number | null };
	}[];
	applications: {
		treatmentId: string;
		target: { kind: "element" | "group" | "layout"; id: string };
		enabled: boolean;
	}[];
	transitionEffects: {
		id: string;
		effect: "dissolve";
		durationSeconds: number;
		outgoingFade?: boolean;
	}[];
	transitions: {
		id: string;
		fromElementId: string;
		toElementId: string;
		effectId: string;
	}[];
	spatialRelations: SpatialRelation[];
	scheduling: {
		elementId: string;
		eventKind: string;
		minConfidence: number;
		minStrength: number;
		cooldownSeconds: number;
		maxOccurrences: number;
		strengthWeight: number;
		confidenceWeight: number;
		repetitionPenalty: number;
	}[];
	resourceRequirements: {
		slotId: string;
		required: boolean;
		minDurationSeconds: number;
		minWidth: number;
		minHeight: number;
		minAspectRatio: number;
		maxAspectRatio: number;
		allowCrop: boolean;
		requiredTags: string[];
		fallbackSlotIds: string[];
	}[];
	layoutPolicy?: {
		eventKind?: string;
		intentMatchWeight: number;
		repetitionPenalty: number;
		minHoldSeconds: number;
		baseScores: Record<string, number>;
	};
}
export interface Reference {
	id: string;
	name: string;
	durationSeconds: number;
	audio: { status: string; peak: number };
	visualAnalysisStatus: string;
}
export interface Sound {
	id: string;
	revision: number;
	kind: string;
	name: string;
	status: string;
	sourceId: string;
	startSeconds: number;
	endSeconds: number;
	description: string;
	tags: string[];
	derivation?: {
		parentSoundId: string;
		parentAudioSha256: string;
		startSeconds: number;
		endSeconds: number;
	};
}
export interface Library {
	templates: Template[];
	quality?: Record<string, {
		revision: number;
		status: "pending" | "qualified" | "needs_revision";
		score: number | null;
		listened?: boolean | null;
		aestheticQualityVerified?: boolean;
	}>;
	references: Reference[];
	sounds: Sound[];
	soundAssessments?: SoundAssessment[];
	soundAssessmentJobs?: {
		id: string;
		targetId: string;
		status: string;
		error: string | null;
	}[];
	audioJobs: {
		id: string;
		targetId: string;
		status: string;
		error: string | null;
	}[];
}
export interface SoundAssessment {
	soundId: string;
	audioSha256: string;
	modelId: string;
	speechScore: number;
	musicScore: number;
	topLabels: { label: string; score: number }[];
	warnings: string[];
}
export interface PlanContentIssue {
	code: "missing_keyword";
	semanticIndex: number;
	startWord: number;
	endWord: number;
	message: string;
}
export interface Plan {
	events: {
		id: string;
		kind: string;
		start: number;
		end: number;
		sourceId: string;
		evidence: string;
	}[];
	scheduleDecisions: {
		eventId: string;
		elementId: string;
		score: number;
		selected: boolean;
		reason: string;
	}[];
	semanticUnits: {
		startWord: number;
		endWord: number;
		intent: string;
		keyword: { startWord: number; endWord: number } | null;
		rationale: string;
	}[];
	words: { text: string; start: number; end: number }[];
	captions: {
		id: string;
		semanticIndex: number;
		wordSpan: { startWord: number; endWord: number };
		text: string;
		start: number;
		end: number;
		warnings: string[];
	}[];
	warnings: string[];
	contentIssues?: PlanContentIssue[];
	elements: unknown[];
	layouts: unknown[];
}
export interface TimedWord {
	text: string;
	start: number;
	end: number;
	speaker?: string | null;
	emphasis?: number;
}
export interface TemplateInput {
	id: string;
	name: string;
	sha256: string;
	durationSeconds: number;
	mediaKind: string;
	width: number | null;
	height: number | null;
	createdAt: number;
}
export interface Transcript {
	text: string;
	revision: number;
	corrections: {
		index: number;
		from: string;
		to: string;
		reason: string;
		revision: number;
	}[];
	inputId: string;
	sourceSha256: string;
	engine: string;
	language: string;
	languageProbability: number;
	words: TimedWord[];
	rawWords: { text: string; start: number; end: number; probability: number }[];
	warnings: string[];
}
export interface InputDetail {
	syntheses?: {
		id: string;
		request: { text: string; speakingRate: number };
		voice: { name: string };
	}[];
	input: TemplateInput;
	transcript: Transcript | null;
	prosody?: {
		transcriptRevision: number;
		candidateWords: TimedWord[];
		quietGapSeconds: number[];
		quietIntervals: { start: number; end: number }[];
		measurements: {
			wordIndex: number;
			rmsDbfs: number;
			peakDbfs: number;
			relativeDb: number;
			gapBeforeSeconds: number;
			gapAfterSeconds: number;
			prominence: number;
			pitch?: {
				analyzedFrames: number;
				pitchedFrames: number;
				pitchedFraction: number;
				medianHz: number | null;
				medianPeriodicity: number | null;
				rangeSemitones: number | null;
				changeSemitones: number | null;
			};
		}[];
		warnings: string[];
	} | null;
	job: { id: string; status: string; error: string | null } | null;
}
