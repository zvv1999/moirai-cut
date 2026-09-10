export interface Recipe {
	rotation: number;
	cropMode: string;
	cropX: number;
	cropY: number;
	colorMode: string;
	brightness: number;
	contrast: number;
	saturation: number;
}
export interface FootageSource {
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
	nasSync?: string;
	id: string;
	sourceId: string;
	revision: number;
	name: string;
	startTicks: number;
	endTicks: number;
	description: string;
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
export interface LibraryState {
	sources: FootageSource[];
	shots: Shot[];
	jobs: Job[];
	counts: { sources: number; draft: number; review: number; published: number };
	settings: { modelId: string; inputMode: string };
	runtime: {
		syncToNas: boolean;
		localRoot: string;
		nasOnline: boolean;
		nasError: string | null;
		nasRoot: string;
		endpoint: string | null;
		endpointError: string | null;
	};
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
	queued: "排队中",
	archiving: "原片归档中",
	analyzing: "分析中",
	draft: "粗剪待审",
	rendering: "加工中",
	review: "待确认",
	publishing: "本地入库中",
	published: "本地已入库",
	rejected: "已淘汰",
	failed: "失败",
	running: "处理中",
	succeeded: "已完成",
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
