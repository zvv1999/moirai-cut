export interface Recipe {
	rotation: number;
	flipHorizontal?: boolean;
	flipVertical?: boolean;
	pushIn?: boolean;
	pushInEndPercent?: number;
	cropMode: string;
	cropX: number;
	cropY: number;
	colorMode: string;
	brightness: number;
	contrast: number;
	saturation: number;
	exposure?: number;
	temperature?: number;
	tint?: number;
	highlights?: number;
	shadows?: number;
	whites?: number;
	blacks?: number;
	vibrance?: number;
}
export interface FootageSource {
	hasShot?: boolean;
	previewReady?: boolean;
	directUpload?: boolean;
	nasSync?: string;
	id: string;
	name: string;
	product: string;
	batch: string;
	width: number;
	height: number;
	durationTicks: number;
	status: string;
	nasRelativePath: string | null;
	error: string | null;
}
export interface Role {
	role: string;
	confidence: number;
	reason: string;
}
export interface Shot {
	analysisSuggestion?: import("./analysis-review").AnalysisSuggestion | null;
	tagEvidence?: import("./tag-evidence-view").TagEvidence[];
	analyzedTags?: string[];
	labelsNeedReview?: boolean;
	productRecognitionStatus?: string;
	publishedRelease?: { id: string; revision: number } | null;
	labelsConfirmed?: boolean;
	productTags?: string[];
	productMatches?: {
		productId: string;
		alias: string;
		confidence: number;
		evidence: string;
	}[];
	directUpload?: boolean;
	nasSync?: string;
	id: string;
	sourceId: string;
	revision: number;
	name: string;
	startTicks: number;
	endTicks: number;
	description: string;
	details?: ShotDetails;
	keepOriginalAudio?: boolean;
	isFeatured?: boolean;
	hasHoliday?: boolean;
	holidayTags?: string[];
	tags: string[];
	roles: Role[];
	unsupportedClaims: string[];
	evidence: string;
	recipe: Recipe;
	status: string;
	error: string | null;
	qualityIssues: string[];
	hasOutput: boolean;
	modelId: string;
	inputMode: string;
}
export interface Job {
	id: string;
	kind: string;
	targetId: string;
	revision: number;
	status: string;
	attempt: number;
	error: string | null;
	updatedAt: number;
}
export interface ReferenceProduct {
	id: string;
	revision: number;
	alias: string;
	appearance?: string;
	images: { id: string; url: string }[];
}
export interface StorageLocation {
	mode: "nas" | "folder";
	nasRoot: string;
	folderRoot: string;
	revision: number;
	folderOnline: boolean;
	status: string;
	error: string | null;
}
export interface LibraryState {
	libraryId?: string;
	tagSettings?: TagSettings;
	storage?: StorageLocation;
	products?: ReferenceProduct[];
	sources: FootageSource[];
	shots: Shot[];
	jobs: Job[];
	counts: {
		pendingConfirm?: number;
		processing?: number;
		sources: number;
		draft: number;
		review: number;
		published: number;
		tagReview?: number;
	};
	settings: { modelId: string; inputMode: string };
	runtime: {
		computeLocation?: "local";
		worker?: { workerId: string; stage: string; jobId?: string | null };
		syncToNas: boolean;
		localRoot: string;
		nasOnline: boolean;
		nasError: string | null;
		nasRoot: string;
		endpoint: string | null;
		endpointError: string | null;
	};
}

export interface TagSettings {
	revision: number;
	groups: [string[], string[], string[], string[]];
	holidays?: string[];
	explanations?: Record<string, string>;
}

export interface ShotDetails {
	subject: string;
	action: string;
	scene: string;
	composition: string;
	camera: string;
	mood: string;
}

export const ROLE_LABELS: Record<string, string> = {
	hook: "抓注意力",
	pain_point: "痛点",
	product_demo: "产品演示",
	selling_point: "卖点",
	proof: "证据",
	comparison: "对比",
	result: "效果",
	usage_scene: "使用场景",
	cta: "行动引导",
	transition: "过渡",
};
export const STATUS_LABELS: Record<string, string> = {
	superseded: "存储位置已更换",
	recognizing: "商品识别中",
	tagging: "打标中",
	pending_confirm: "待确认打标",
	tag_review: "待确认打标",
	queued: "排队中",
	archiving: "原片归档中",
	analyzing: "分析中",
	draft: "待确认打标",
	rendering: "加工并入库中",
	review: "待确认打标",
	publishing: "本地入库中",
	published: "本地已入库",
	rejected: "已淘汰",
	failed: "失败",
	running: "处理中",
	succeeded: "已完成",
	cancelled: "已取消",
};
export interface FootageLineage {
	schemaVersion: "moirai.lineage.v1";
	releaseId: string;
	shotId: string;
	shotRevision: number;
	sourceId: string;
	sourceSha256: string;
	sourceName: string;
	product: string;
	batch: string;
	sourceStartTicks: number;
	sourceEndTicks: number;
	ticksPerSecond: number;
	analysisRunId: string;
	modelId: string;
	inputMode: string;
	recipe: Recipe;
	outputSha256: string;
	publishedPath: string;
	description: string;
	tags: string[];
	roles: Role[];
	unsupportedClaims: string[];
	evidence: string;
}
