import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { createServer as httpServer } from "node:http";

// Synthetic media only. The isolated HOME deliberately has no model credentials.
const root = mkdtempSync(join(tmpdir(), "moirai-edge-qa-"));
const lutHome = process.env.MOIRAI_TEST_LUT_HOME;
if (lutHome) {
	mkdirSync(join(root, ".moirai-cut"), { recursive: true });
	for (const name of ["models", "lut-runtime"]) {
		symlinkSync(join(lutHome, ".moirai-cut", name), join(root, ".moirai-cut", name), process.platform === "win32" ? "junction" : "dir");
	}
}
const binary = resolve(
	process.env.MOIRAI_FOOTAGE_BINARY || "target/debug/moirai-footage",
);
const ffmpeg = process.env.MOIRAI_FFMPEG || "ffmpeg";
const ffprobe = process.env.MOIRAI_FFPROBE || "ffprobe";
async function port() {
	const s = createServer();
	await new Promise((r) => s.listen(0, "127.0.0.1", r));
	const p = s.address().port;
	await new Promise((r) => s.close(r));
	return p;
}
const serverPort = await port(),
	workerPort = await port();
const remote = process.env.MOIRAI_TEAM_URL;
const modelMock = process.argv.includes("--model");
const direct = process.argv.includes("--direct");
let modelServer,
	modelRequests = 0;
if (modelMock) {
	modelServer = httpServer(async (req, res) => {
		try {
			if (req.url === "/v1/models") {
				res.setHeader("content-type", "application/json");
				res.end(JSON.stringify({ data: [{ id: "edge-test-model" }] }));
				return;
			}
			const chunks = [];
			for await (const c of req) chunks.push(c);
			const body = JSON.parse(Buffer.concat(chunks));
			const video = body.messages
				.flatMap((m) => m.content)
				.find((c) => c.type === "video_url");
			if (!video) {
				res.setHeader("content-type", "application/json");
				res.end(
					JSON.stringify({
						choices: [
							{
								message: {
									content: JSON.stringify({
										candidateIndex: 0,
										reason: "Synthetic upright test",
									}),
								},
							},
						],
					}),
				);
				return;
			}
			const input = join(root, `model-input-${modelRequests++}.mp4`);
			writeFileSync(
				input,
				Buffer.from(video.video_url.url.split(",")[1], "base64"),
			);
			const probe = spawnSync(
				ffprobe,
				[
					"-v",
					"error",
					"-select_streams",
					"v:0",
					"-show_entries",
					"stream=width,height",
					"-of",
					"json",
					input,
				],
				{ encoding: "utf8" },
			);
			assert.deepEqual(JSON.parse(probe.stdout).streams[0], {
				width: 720,
				height: 1280,
			});
			const segment = {
				startSeconds: 0,
				endSeconds: 1.5,
				name: "Edge model QA",
				description: "Synthetic test pattern",
				tags: [],
				roles: [],
				unsupportedClaims: [],
				evidence: "Synthetic frames only",
				rotation: 0,
				cropSafe: false,
				cropX: 0.5,
				cropY: 0.5,
			};
			const labels = {
				name: "Edge tagged QA",
				description: "Synthetic test pattern",
				tags: [],
				roles: [],
				unsupportedClaims: [],
				evidence: "Synthetic frames only",
			};
			res.setHeader("content-type", "application/json");
			res.end(
				JSON.stringify({
					choices: [
						{
							message: {
								content: JSON.stringify(direct ? labels : { segment }),
							},
						},
					],
				}),
			);
		} catch (error) {
			res.statusCode = 500;
			res.end(JSON.stringify({ error: error.message }));
		}
	});
	await new Promise((r) => modelServer.listen(0, "127.0.0.1", r));
	mkdirSync(join(root, ".moirai-cut"));
	writeFileSync(
		join(root, ".moirai-cut/footage-endpoint.json"),
		JSON.stringify({
			baseUrl: `http://127.0.0.1:${modelServer.address().port}/v1`,
			apiKey: "synthetic-test-only",
		}),
		{ mode: 0o600 },
	);
}
mkdirSync(join(root, "server"));
mkdirSync(join(root, "worker"));
const token = remote
	? readFileSync(process.env.MOIRAI_TEAM_TOKEN_FILE, "utf8").trim()
	: randomUUID();
writeFileSync(join(root, "server/service-token"), token, { mode: 0o600 });
writeFileSync(
	join(root, "server.json"),
	JSON.stringify({
		dataDir: join(root, "server"),
		nasRoot: "",
		requireSmb: false,
		port: serverPort,
		ffmpeg: "/no-server-ffmpeg",
		ffprobe,
	}),
);
writeFileSync(
	join(root, "worker.json"),
	JSON.stringify({
		serverUrl: remote || `http://127.0.0.1:${serverPort}`,
		serverTokenFile: join(root, "server/service-token"),
		dataDir: join(root, "worker"),
		workerId: randomUUID(),
		port: workerPort,
		ffmpeg,
		ffprobe,
	}),
);
const children = [];
let logs = "";
function start(args, env) {
	const p = spawn(binary, args, {
		env: { ...process.env, HOME: root, ...env },
		stdio: ["ignore", "pipe", "pipe"],
	});
	for (const s of [p.stdout, p.stderr]) s.on("data", (b) => (logs += b));
	children.push(p);
	return p;
}
async function wait(fn) {
	let last;
	for (let i = 0; i < 120; i++) {
		try {
			const v = await fn();
			if (v) return v;
		} catch (e) {
			last = e;
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw Error(`Timed out: ${last || ""}\n${logs}`);
}
let library;
async function api(path, method = "GET", body, edge = true) {
	const key = edge
		? readFileSync(join(root, "worker/service-token"), "utf8").trim()
		: token;
	const url = edge
		? `http://127.0.0.1:${workerPort}`
		: remote || `http://127.0.0.1:${serverPort}`;
	const res = await fetch(url + path, {
		method,
		headers: {
			"x-footage-token": key,
			...(library ? { "x-footage-library": library } : {}),
			...(!Buffer.isBuffer(body) ? { "content-type": "application/json" } : {}),
		},
		body:
			body === undefined
				? undefined
				: Buffer.isBuffer(body)
					? body
					: JSON.stringify(body),
		signal: AbortSignal.timeout(15000),
	});
	const v = await res.json();
	assert.equal(res.status, 200, JSON.stringify(v));
	return v;
}
try {
	if (!remote)
		start([], {
			HOME: join(root, "server"),
			MOIRAI_FOOTAGE_CONFIG: join(root, "server.json"),
			MOIRAI_FOOTAGE_COORDINATOR: "1",
		});
	await wait(() => api("/state", "GET", undefined, false));
	start(["--edge", join(root, "worker.json")], {
		MOIRAI_FOOTAGE_COORDINATOR: "0",
	});
	const state = await wait(() => api("/state"));
	library = state.libraryId;
	assert.equal(state.runtime.computeLocation, "local");
	const media = join(root, "synthetic.mp4");
	const generated = spawnSync(ffmpeg, [
		"-v",
		"error",
		"-f",
		"lavfi",
		"-i",
		"testsrc2=size=1080x1920:rate=12",
		"-t",
		"2",
		"-c:v",
		"libx264",
		"-preset",
		"ultrafast",
		"-pix_fmt",
		"yuv420p",
		media,
	]);
	assert.equal(generated.status, 0, generated.stderr?.toString());
	const imported = await api(
		`/imports?filename=edge-qa.mp4&product=Edge-QA${direct ? "&direct=true" : ""}`,
		"POST",
		readFileSync(media),
	);
	await wait(async () => {
		const s = await api("/state");
		return s.sources.find(
			(x) =>
				x.id === imported.sourceId &&
				x.status ===
					(modelMock ? (direct ? "tag_review" : "review") : "failed") &&
				x.previewReady,
		);
	});
	const archive = (await api("/state")).jobs.find(
		(j) => j.id === imported.jobId,
	);
	assert.equal(archive.status, direct && !modelMock ? "failed" : "succeeded");
	const proxy = join(root, "server/sources", imported.sourceId, "preview.mp4");
	if (!remote) {
		const probe = spawnSync(
			ffprobe,
			[
				"-v",
				"error",
				"-select_streams",
				"v:0",
				"-show_entries",
				"stream=width,height",
				"-of",
				"json",
				proxy,
			],
			{ encoding: "utf8" },
		);
		assert.equal(probe.status, 0, probe.stderr);
		assert.deepEqual(JSON.parse(probe.stdout).streams[0], {
			width: 540,
			height: 960,
		});
	}
	let shot =
		modelMock || direct
			? (await api("/state")).shots.find(
					(s) => s.sourceId === imported.sourceId,
				)
			: await api(`/sources/${imported.sourceId}/manual`, "POST");
	if (!direct && !remote) {
		const range = { startTicks: shot.startTicks, endTicks: shot.endTicks };
		const source = (await api("/state")).sources.find(s => s.id === imported.sourceId);
		const cached = join(root, "worker/objects", source.sha256);
		rmSync(cached, { force: true });
		const plan = await api(`/shots/${shot.id}/preview-plan`, "POST", { ...range, recipe: shot.recipe });
		assert.ok(plan.geometry);
		assert.equal(existsSync(cached), false, "geometry must not download media");
		const exposure = await api(`/shots/${shot.id}/preview-exposure`, "POST", range);
		assert.equal(typeof exposure.brightness, "number");
		assert.equal(existsSync(cached), true, "cold preview downloads the original locally");
		writeFileSync(cached, "corrupt-cache");
		assert.deepEqual(await api(`/shots/${shot.id}/preview-exposure`, "POST", range), exposure,
			"corrupt cached originals must be replaced before computing");
		if (lutHome) {
			const lut = await api(`/shots/${shot.id}/preview-lut`, "POST", range);
			assert.equal(lut.size, 33);
			assert.equal(lut.values.length, 33 ** 3 * 3);
			assert.ok(lut.values.every(Number.isFinite));
			assert.deepEqual(await api(`/shots/${shot.id}/preview-lut`, "POST", range), lut);
		} else {
			await assert.rejects(api(`/shots/${shot.id}/preview-lut`, "POST", range), /本机 AI 调色预览失败/);
		}
		// Invalid ranges are rejected before running media tools or downloading.
		await assert.rejects(api(`/shots/${shot.id}/preview-exposure`, "POST", { startTicks: -1, endTicks: 1 }));
		assert.equal((await api("/state")).shots.find(s => s.id === shot.id).revision, shot.revision,
			"preview must not save draft edits");
		console.log(`Local preview plan, cold-cache exposure, and ${lutHome ? "real LUT and cache reuse" : "local LUT failure"} verified with NAS FFmpeg disabled`);
	}
	await api(`/shots/${shot.id}/confirm`, "POST", {
		baseRevision: shot.revision,
		name: "Edge QA",
		startTicks: shot.startTicks,
		endTicks: shot.endTicks,
		description: "Synthetic edge pipeline verification",
		tags: ["edge-qa"],
		roles: [],
		unsupportedClaims: [],
		recipe: { ...shot.recipe, colorMode: "preserve" },
	});
	shot = await wait(async () => {
		const s = (await api("/state")).shots.find((s) => s.id === shot.id);
		if (s.status === "failed") throw Error(s.error);
		return s.status === "published" && s;
	});
	const release = await wait(async () =>
		(await api("/releases")).releases.find((r) => r.shot.id === shot.id),
	);
	const other = await api(`/releases/${release.id}`, "GET", undefined, false);
	assert.equal(other.footage.sourceId, imported.sourceId);
	assert.deepEqual(other.footage.tags, ["edge-qa"]);
	const jobs = (await api("/state")).jobs;
	if (!direct)
		assert.equal(jobs.find((j) => j.kind === "render").status, "succeeded");
	if (modelMock) assert.ok(modelRequests > 0);
	console.log(
		JSON.stringify({
			passed: true,
			root,
			sourceId: imported.sourceId,
			shotId: shot.id,
			releaseId: release.id,
			workbenchPreview: "540x960",
			serverFfmpeg: remote ? "NAS coordinator" : "disabled",
			archive: direct ? "direct tagging locally" : "local",
			render: direct ? "original preserved" : "local",
			secondClient: "shared release and labels visible",
			model: modelMock
				? "local mock received 720x1280 video"
				: "deliberately unconfigured; manual fallback passed",
		}),
	);
} finally {
	for (const p of children) p.kill("SIGTERM");
	await Promise.all(
		children.map((p) =>
			p.exitCode !== null ? null : new Promise((r) => p.once("exit", r)),
		),
	);
	if (modelServer) await new Promise((r) => modelServer.close(r));
	writeFileSync(join(root, "logs.txt"), logs);
}
