import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import {
	mkdtemp,
	mkdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
	cancelProjectExport,
	finishProjectExport,
	installProjectDraft,
	listProjectExports,
	prepareProjectExport,
	uploadProjectExportPart,
} from "@/server/project-interchange";
import type { ProjectExportTarget } from "@/export/project-interchange";

const exec = promisify(execFile);

async function assertWellFormedXml(filePath: string) {
	if (process.platform === "win32") {
		await exec(
			"powershell.exe",
			[
				"-NoProfile",
				"-NonInteractive",
				"-Command",
				"$ErrorActionPreference = 'Stop'; $doc = New-Object System.Xml.XmlDocument; $doc.XmlResolver = $null; $doc.Load($env:MOIRAI_TEST_XML_PATH)",
			],
			{ env: { ...process.env, MOIRAI_TEST_XML_PATH: filePath } },
		);
		return;
	}
	await exec("xmllint", ["--noout", filePath]);
}

let root: string;
const projectId = "interchange-test";
function project() {
	return {
		metadata: { id: projectId, name: "品牌 & 剪辑" },
		currentSceneId: "main",
		settings: {
			canvasSize: { width: 320, height: 180 },
			fps: { numerator: 30, denominator: 1 },
			background: { type: "color", color: "#000000" },
		},
		scenes: [
			{
				id: "main",
				tracks: {
					main: {
						id: "main-track",
						name: "主轨",
						type: "video",
						hidden: false,
						muted: false,
						elements: [
							{
								id: "v1",
								type: "video",
								name: "商品",
								mediaId: "source",
								duration: 120000,
								startTime: 0,
								trimStart: 60000,
								trimEnd: 60000,
								params: { volume: -6 },
							},
						],
					},
					overlay: [],
					audio: [],
				},
			},
		],
	};
}
beforeAll(async () => {
	root = await mkdtemp(path.join(tmpdir(), "moirai-interchange-test-"));
	const media = path.join(root, projectId, "media");
	await mkdir(media, { recursive: true });
	await exec("ffmpeg", [
		"-v",
		"error",
		"-f",
		"lavfi",
		"-i",
		"testsrc2=size=320x180:rate=30",
		"-f",
		"lavfi",
		"-i",
		"sine=frequency=440:sample_rate=48000",
		"-t",
		"2",
		"-c:v",
		"libx264",
		"-pix_fmt",
		"yuv420p",
		"-c:a",
		"aac",
		path.join(media, "source.mp4"),
	]);
	await writeFile(
		path.join(media, "index.json"),
		JSON.stringify({
			source: { ext: "mp4", name: "商品 & 人物.mp4", type: "video" },
		}),
	);
	await exec("ffmpeg", [
		"-v",
		"error",
		"-f",
		"lavfi",
		"-i",
		"color=c=red@0.5:s=320x180,format=rgba",
		"-frames:v",
		"1",
		path.join(root, "frame.png"),
	]);
}, 60_000);
afterAll(async () => {
	if (root) await rm(root, { recursive: true, force: true });
});

describe("project interchange with real media", () => {
	for (const target of [
		"premiere",
		"fcpxml",
		"jianying",
		"capcut",
	] satisfies ProjectExportTarget[]) {
		test(`${target}: writes references, original media and a valid archive`, async () => {
			const snapshot = project();
			const before = JSON.stringify(snapshot);
			const plan = await prepareProjectExport({
				projectId,
				target,
				project: snapshot,
				projectsRoot: root,
			});
			expect(plan.bakes).toHaveLength(0);
			const result = await finishProjectExport({
				projectId,
				id: plan.id,
				projectsRoot: root,
			});
			expect(JSON.stringify(snapshot)).toBe(before);
			expect((await stat(result.entryPath)).size).toBeGreaterThan(100);
			expect(
				await readFile(path.join(result.folder, "media/source.mp4")),
			).toEqual(await readFile(path.join(root, projectId, "media/source.mp4")));
			await exec("unzip", [
				"-t",
				path.join(root, projectId, "exports", result.archiveName),
			]);
			if (target === "premiere" || target === "fcpxml")
				await assertWellFormedXml(result.entryPath);
			else {
				const drafts = path.join(root, `drafts-${target}`);
				await mkdir(drafts);
				const installed = await installProjectDraft({
					projectId,
					id: plan.id,
					projectsRoot: root,
					draftRoot: drafts,
				});
				expect(path.basename(installed.folder)).toStartWith(
					`Moirai - ${snapshot.metadata.name} - `,
				);
				const info = JSON.parse(
					await readFile(
						path.join(installed.folder, "draft_info.json"),
						"utf8",
					),
				);
				expect(info.materials.videos[0].path.startsWith(installed.folder)).toBe(
					true,
				);
				expect(info.id.toLowerCase()).not.toBe(plan.id);
				await stat(info.materials.videos[0].path);
			}
			// Lost responses/retry do not duplicate or delete a completed export.
			expect(
				await finishProjectExport({
					projectId,
					id: plan.id,
					projectsRoot: root,
				}),
			).toEqual(result);
			await cancelProjectExport(projectId, plan.id, root);
			await stat(result.entryPath);
			expect(
				(await listProjectExports(projectId, root)).some(
					(r) => r.id === result.id,
				),
			).toBe(true);
		}, 60_000);
	}
	test("renders alpha clips, validates duration, and excludes staging frames from ZIP", async () => {
		const snapshot = project();
		Object.assign(snapshot.scenes[0].tracks.main.elements[0].params, {
			"transform.rotate": 30,
		});
		snapshot.scenes[0].tracks.main.elements[0].duration = 8000;
		const plan = await prepareProjectExport({
			projectId,
			target: "premiere",
			project: snapshot,
			projectsRoot: root,
		});
		expect(plan.bakes).toHaveLength(1);
		const bake = plan.bakes[0];
		const png = new Uint8Array(await readFile(path.join(root, "frame.png")));
		await expect(
			finishProjectExport({ projectId, id: plan.id, projectsRoot: root }),
		).rejects.toThrow();
		for (let frame = 0; frame < 2; frame++)
			await uploadProjectExportPart({
				projectId,
				id: plan.id,
				bakeId: bake.id,
				frame,
				bytes: png,
				projectsRoot: root,
			});
		const result = await finishProjectExport({
			projectId,
			id: plan.id,
			projectsRoot: root,
		});
		const source = plan.files.find((file) => file.id === bake.id)!;
		const probe = JSON.parse(
			(
				await exec("ffprobe", [
					"-v",
					"error",
					"-show_streams",
					"-of",
					"json",
					source.path,
				])
			).stdout,
		);
		expect(probe.streams[0].pix_fmt).toContain("yuva");
		await exec("ffmpeg", ["-v", "error", "-i", source.path, "-f", "null", "-"]);
		const archive = (
			await exec("unzip", [
				"-Z1",
				path.join(root, projectId, "exports", result.archiveName),
			])
		).stdout;
		expect(archive).not.toContain("00000000.png");
		expect(archive).not.toContain(".plan.json");
	}, 60_000);
	test("rejects unsafe ids, absent originals and out-of-range render parts", async () => {
		await expect(
			prepareProjectExport({
				projectId: "../escape",
				target: "premiere",
				project: project(),
				projectsRoot: root,
			}),
		).rejects.toThrow();
		const missing = project();
		missing.scenes[0].tracks.main.elements[0].mediaId = "missing";
		await expect(
			prepareProjectExport({
				projectId,
				target: "premiere",
				project: missing,
				projectsRoot: root,
			}),
		).rejects.toThrow("原素材缺失");
		const snapshot = project();
		Object.assign(snapshot.scenes[0].tracks.main.elements[0].params, {
			"transform.rotate": 30,
		});
		const plan = await prepareProjectExport({
			projectId,
			target: "premiere",
			project: snapshot,
			projectsRoot: root,
		});
		await expect(
			uploadProjectExportPart({
				projectId,
				id: plan.id,
				bakeId: "../escape",
				frame: 0,
				bytes: new Uint8Array(),
				projectsRoot: root,
			}),
		).rejects.toThrow();
		await expect(
			uploadProjectExportPart({
				projectId,
				id: plan.id,
				bakeId: plan.bakes[0].id,
				frame: 1000000,
				bytes: new Uint8Array(),
				projectsRoot: root,
			}),
		).rejects.toThrow();
		await cancelProjectExport(projectId, plan.id, root);
		await expect(stat(plan.folder)).rejects.toThrow();
	}, 60_000);
});
