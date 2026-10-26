import type { TProject } from "@/project/types";
import type { MediaAsset } from "@/media/types";
import type { SceneTracks, TimelineTrack } from "@/timeline";
import { CanvasRenderer } from "@/services/renderer/canvas-renderer";
import { buildScene } from "@/services/renderer/scene-builder";
import { extractTimelineAudio } from "@/media/mediabunny";
import { TICKS_PER_SECOND } from "@/wasm";
import type {
	InterchangeBake,
	InterchangePlan,
	ProjectExportResult,
	ProjectExportTarget,
} from "@/export/project-interchange";

async function responseData<T>(response: Response): Promise<T> {
	const payload = await response.json();
	if (!response.ok || payload.error)
		throw new Error(
			typeof payload.error === "string" ? payload.error : "工程导出失败",
		);
	return payload.data;
}

/** Platform adapter: obey the Rust plan using the same renderer as the editor. */
export function tracksForInterchangeBake(
	tracks: SceneTracks,
	bake: InterchangeBake,
): SceneTracks {
	if (bake.kind === "scene" || bake.kind === "mix") return tracks;
	const isolate = <T extends TimelineTrack>(track: T): T => ({
		...track,
		hidden: false,
		muted: false,
		solo: false,
		elements:
			track.id === bake.trackId
				? track.elements
						.filter((e) => e.id === bake.elementId)
						.map((e) => ({
							...e,
							hidden: false,
							isSourceAudioEnabled: true,
							params: { ...e.params, muted: false },
						}))
				: [],
	});
	return {
		main: isolate(tracks.main),
		overlay: tracks.overlay.map(isolate),
		audio: tracks.audio.map(isolate),
	};
}

export async function exportInterchangeProject({
	project,
	mediaAssets,
	target,
	signal,
	update,
}: {
	project: TProject;
	mediaAssets: MediaAsset[];
	target: ProjectExportTarget;
	signal: AbortSignal;
	update: (state: { progress?: number; step?: string }) => void;
}): Promise<ProjectExportResult> {
	const endpoint = `/api/project-interchange/${encodeURIComponent(project.metadata.id)}`;
	const post = <T>(body: unknown) =>
		fetch(endpoint, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
			signal,
		}).then(responseData<T>);
	let plan: InterchangePlan | undefined;
	try {
		update({ progress: 0.02, step: "检查时间线并复制原素材" });
		plan = await post<InterchangePlan>({ action: "prepare", project, target });
		const scene = project.scenes.find((s) => s.id === project.currentSceneId);
		if (!scene) throw new Error("当前场景不存在");
		// Scene building skips missing browser assets. Refuse that silent omission before baking.
		const checkAssets = (value: unknown): void => {
			if (Array.isArray(value)) {
				value.forEach(checkAssets);
				return;
			}
			if (!value || typeof value !== "object") return;
			const object = value as Record<string, unknown>;
			if (typeof object.mediaId === "string") {
				const asset = mediaAssets.find((a) => a.id === object.mediaId);
				if (!asset?.file?.size || !asset.url)
					throw new Error(`素材尚未加载，无法渲染：${object.mediaId}`);
			}
			Object.values(object).forEach(checkAssets);
		};
		if (plan.bakes.length > 0) checkAssets(scene.tracks);
		const fps = { numerator: plan.numerator, denominator: plan.denominator };
		const ticksPerFrame =
			(TICKS_PER_SECOND * plan.denominator) / plan.numerator;
		const renderer = new CanvasRenderer({
			width: plan.width,
			height: plan.height,
			fps,
		});
		const canvas = document.createElement("canvas");
		canvas.width = plan.width;
		canvas.height = plan.height;
		const total = plan.bakes.reduce(
			(sum, b) =>
				sum + (["video", "scene"].includes(b.kind) ? b.end - b.start : 1),
			0,
		);
		let completed = 0;
		await document.fonts.ready;
		for (const bake of plan.bakes) {
			signal.throwIfAborted();
			const tracks = tracksForInterchangeBake(scene.tracks, bake);
			const upload = async (blob: Blob, frame: number) => {
				const query = new URLSearchParams({
					id: plan!.id,
					bake: bake.id,
					frame: String(frame),
				});
				await responseData(
					await fetch(`${endpoint}?${query}`, {
						method: "PUT",
						body: blob,
						signal,
					}),
				);
				completed++;
				update({
					progress: 0.1 + (0.7 * completed) / Math.max(1, total),
					step: `渲染兼容素材 ${plan!.bakes.indexOf(bake) + 1}/${plan!.bakes.length} · ${completed}/${total}`,
				});
			};
			if (bake.kind === "audio" || bake.kind === "mix") {
				await upload(
					await extractTimelineAudio({
						tracks,
						mediaAssets,
						totalDuration: Math.ceil(bake.end * ticksPerFrame),
					}),
					0,
				);
				continue;
			}
			const node = buildScene({
				tracks,
				mediaAssets,
				canvasSize: project.settings.canvasSize,
				duration: Math.ceil(plan.duration * ticksPerFrame),
				background: ["scene", "background"].includes(bake.kind)
					? project.settings.background
					: { type: "color", color: "transparent" },
			});
			const element = [
				scene.tracks.main,
				...scene.tracks.overlay,
				...scene.tracks.audio,
			]
				.find((t) => t.id === bake.trackId)
				?.elements.find((e) => e.id === bake.elementId);
			const count = ["still", "background"].includes(bake.kind)
				? 1
				: bake.end - bake.start;
			for (let frame = 0; frame < count; frame++) {
				signal.throwIfAborted();
				canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
				await renderer.renderToCanvas({
					node,
					time: element
						? Math.max(
								element.startTime,
								Math.min(
									element.startTime + element.duration - 1,
									Math.round((bake.start + frame) * ticksPerFrame),
								),
							)
						: Math.round((bake.start + frame) * ticksPerFrame),
					targetCanvas: canvas,
				});
				const png = await new Promise<Blob>((resolve, reject) =>
					canvas.toBlob(
						(blob) =>
							blob ? resolve(blob) : reject(new Error("透明帧渲染失败")),
						"image/png",
					),
				);
				await upload(png, frame);
			}
		}
		update({ progress: 0.82, step: "编码兼容素材、写入工程并打包" });
		const result = await post<ProjectExportResult>({
			action: "finish",
			id: plan.id,
		});
		update({ progress: 1, step: "工程导出完成" });
		return result;
	} catch (error) {
		if (plan)
			await fetch(`${endpoint}?id=${encodeURIComponent(plan.id)}`, {
				method: "DELETE",
			}).catch(() => {});
		throw error;
	}
}
