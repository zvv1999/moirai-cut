import { afterEach, describe, expect, test } from "bun:test";
import {
	mkdtemp,
	mkdir,
	readFile,
	readdir,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	exportProjectFcpxml,
	type InterchangeProcessRunner,
	type InterchangeProcessRequest,
	runInterchangeProcess,
} from "@/server/interchange";
import { withProjectLock } from "@/server/project-lock";

const temporaryRoots: string[] = [];
const originalInterchangeBin = process.env.MOIRAI_INTERCHANGE_BIN;
const originalCargoBin = process.env.MOIRAI_CARGO_BIN;

function restoreEnvironment(): void {
	if (originalInterchangeBin === undefined) {
		delete process.env.MOIRAI_INTERCHANGE_BIN;
	} else {
		process.env.MOIRAI_INTERCHANGE_BIN = originalInterchangeBin;
	}
	if (originalCargoBin === undefined) {
		delete process.env.MOIRAI_CARGO_BIN;
	} else {
		process.env.MOIRAI_CARGO_BIN = originalCargoBin;
	}
}

const processRequest: InterchangeProcessRequest = {
	command: "export-fcpxml",
	project: {},
	mediaIndex: {},
	mediaRoot: "/tmp",
	options: {
		expectedRevision: 0,
		version: "1.10",
		target: "jianying-desktop",
	},
};

async function fixture({ revision = 7 }: { revision?: number } = {}) {
	const projectsRoot = await mkdtemp(path.join(tmpdir(), "moirai-web-xml-"));
	temporaryRoots.push(projectsRoot);
	const projectId = "project-xml";
	const projectDir = path.join(projectsRoot, projectId);
	await mkdir(path.join(projectDir, "media"), { recursive: true });
	const document = {
		metadata: { id: projectId, name: "剪映 Demo", duration: 120_000 },
		revision,
	};
	await writeFile(
		path.join(projectDir, "project.json"),
		JSON.stringify(document),
		"utf8",
	);
	await writeFile(path.join(projectDir, "media", "index.json"), "{}", "utf8");
	return { projectsRoot, projectId, projectDir, document };
}

afterEach(async () => {
	restoreEnvironment();
	await Promise.all(
		temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
	);
});

describe("Rust interchange process resolution", () => {
	test("does not fall through to cached target binaries when the configured binary is invalid", async () => {
		process.env.MOIRAI_INTERCHANGE_BIN = path.join(
			tmpdir(),
			"missing-moirai-interchange",
		);
		delete process.env.MOIRAI_CARGO_BIN;

		await expect(runInterchangeProcess(processRequest)).rejects.toMatchObject({
			code: "interchange_runtime_missing",
			status: 503,
		});
		await expect(runInterchangeProcess(processRequest)).rejects.toThrow(
			"cargo build --release -p interchange --bin moirai-interchange",
		);
	});

	test("reports an actionable error when an explicitly configured Cargo is missing", async () => {
		delete process.env.MOIRAI_INTERCHANGE_BIN;
		process.env.MOIRAI_CARGO_BIN = path.join(tmpdir(), "missing-cargo");

		await expect(runInterchangeProcess(processRequest)).rejects.toMatchObject({
			code: "interchange_runtime_missing",
			status: 503,
		});
		await expect(runInterchangeProcess(processRequest)).rejects.toThrow(
			"MOIRAI_CARGO_BIN does not point to an executable",
		);
	});
});

describe("project FCPXML export service", () => {
	test("writes XML and its report atomically without changing the project revision", async () => {
		const state = await fixture();
		const run: InterchangeProcessRunner = async (request) => ({
			document: '<?xml version="1.0"?><fcpxml version="1.10"/>',
			report: {
				schema: "moirai-cut.interchange-report.v1",
				source: { revision: request.options.expectedRevision },
				issues: [{ code: "unsupported_text", severity: "omitted" }],
			},
		});

		const result = await exportProjectFcpxml({
			projectId: state.projectId,
			baseRevision: 7,
			name: "剪映 / 交接",
			target: "jianying-desktop",
			projectsRoot: state.projectsRoot,
			run,
		});

		expect(result.stable).toBe(true);
		expect(result.name).toBe("剪映-交接-r7.fcpxml");
		expect(result.reportName).toBe("剪映-交接-r7.interchange-report.json");
		expect(await readFile(result.path, "utf8")).toContain("<fcpxml");
		expect(JSON.parse(await readFile(result.reportPath, "utf8"))).toEqual(
			result.report,
		);
		expect(
			JSON.parse(
				await readFile(path.join(state.projectDir, "project.json"), "utf8"),
			).revision,
		).toBe(7);
	});

	test("normalizes display punctuation so generated download URLs stay routable", async () => {
		const state = await fixture();
		const run: InterchangeProcessRunner = async () => ({
			document: '<?xml version="1.0"?><fcpxml version="1.10"/>',
			report: {
				schema: "moirai-cut.interchange-report.v1",
				issues: [],
			},
		});

		const result = await exportProjectFcpxml({
			projectId: state.projectId,
			baseRevision: 7,
			name: "蝉镜 Demo · handoff 🎬",
			target: "jianying-desktop",
			projectsRoot: state.projectsRoot,
			run,
		});

		expect(result.name).toBe("蝉镜-Demo-handoff-r7.fcpxml");
		expect(result.downloadUrl).toEndWith(
			encodeURIComponent("蝉镜-Demo-handoff-r7.fcpxml"),
		);
	});

	test("keeps explicit scene exports distinct at the same project revision", async () => {
		const state = await fixture();
		const run: InterchangeProcessRunner = async (request) => ({
			document: '<?xml version="1.0"?><fcpxml version="1.10"/>',
			report: {
				schema: "moirai-cut.interchange-report.v1",
				source: { sceneId: request.options.sceneId },
				issues: [],
			},
		});

		const first = await exportProjectFcpxml({
			projectId: state.projectId,
			baseRevision: 7,
			name: "handoff",
			sceneId: "scene-a",
			target: "jianying-desktop",
			projectsRoot: state.projectsRoot,
			run,
		});
		const second = await exportProjectFcpxml({
			projectId: state.projectId,
			baseRevision: 7,
			name: "handoff",
			sceneId: "scene-b",
			target: "jianying-desktop",
			projectsRoot: state.projectsRoot,
			run,
		});

		expect(first.name).not.toBe(second.name);
		expect(await readFile(first.path, "utf8")).toContain("<fcpxml");
		expect(await readFile(second.path, "utf8")).toContain("<fcpxml");
	});

	test("rejects malformed reports from an incompatible Rust runtime", async () => {
		const state = await fixture();
		const run = (async () => ({
			document: '<?xml version="1.0"?><fcpxml version="1.10"/>',
			report: {
				schema: "moirai-cut.interchange-report.v1",
			},
		})) as unknown as InterchangeProcessRunner;

		await expect(
			exportProjectFcpxml({
				projectId: state.projectId,
				baseRevision: 7,
				target: "jianying-desktop",
				projectsRoot: state.projectsRoot,
				run,
			}),
		).rejects.toMatchObject({ code: "interchange_process_failed" });
	});

	test("rejects a malformed process result without leaking a TypeError", async () => {
		const state = await fixture();
		const run = (async () => ({
			document: null,
			report: null,
		})) as unknown as InterchangeProcessRunner;

		await expect(
			exportProjectFcpxml({
				projectId: state.projectId,
				baseRevision: 7,
				target: "jianying-desktop",
				projectsRoot: state.projectsRoot,
				run,
			}),
		).rejects.toMatchObject({
			code: "interchange_process_failed",
			status: 502,
		});
	});

	test("treats a byte-identical retry as idempotent", async () => {
		const state = await fixture();
		const run: InterchangeProcessRunner = async () => ({
			document: '<?xml version="1.0"?><fcpxml version="1.10"/>',
			report: {
				schema: "moirai-cut.interchange-report.v1",
				issues: [],
			},
		});
		const request = {
			projectId: state.projectId,
			baseRevision: 7,
			name: "idempotent",
			target: "jianying-desktop" as const,
			projectsRoot: state.projectsRoot,
			run,
		};

		const first = await exportProjectFcpxml(request);
		const second = await exportProjectFcpxml(request);

		expect(second.path).toBe(first.path);
		expect(await readFile(second.path, "utf8")).toBe(
			await readFile(first.path, "utf8"),
		);
	});

	test("never overwrites an immutable artifact pair with different bytes", async () => {
		const state = await fixture();
		const exportWithDocument = (document: string) =>
			exportProjectFcpxml({
				projectId: state.projectId,
				baseRevision: 7,
				name: "immutable",
				target: "jianying-desktop",
				projectsRoot: state.projectsRoot,
				run: async () => ({
					document,
					report: {
						schema: "moirai-cut.interchange-report.v1",
						issues: [],
					},
				}),
			});
		const first = await exportWithDocument(
			'<?xml version="1.0"?><fcpxml version="1.10"><event/></fcpxml>',
		);
		const originalXml = await readFile(first.path, "utf8");
		const originalReport = await readFile(first.reportPath, "utf8");

		await expect(
			exportWithDocument(
				'<?xml version="1.0"?><fcpxml version="1.10"><library/></fcpxml>',
			),
		).rejects.toMatchObject({ code: "artifact_conflict", status: 409 });
		expect(await readFile(first.path, "utf8")).toBe(originalXml);
		expect(await readFile(first.reportPath, "utf8")).toBe(originalReport);
	});

	test("publishes XML and report as one rollback-safe artifact pair", async () => {
		const state = await fixture();
		const exportsDirectory = path.join(state.projectDir, "exports");
		const reportName = "pair-r7.interchange-report.json";
		await mkdir(path.join(exportsDirectory, reportName), { recursive: true });
		const run: InterchangeProcessRunner = async () => ({
			document: '<?xml version="1.0"?><fcpxml version="1.10"/>',
			report: {
				schema: "moirai-cut.interchange-report.v1",
				issues: [],
			},
		});

		await expect(
			exportProjectFcpxml({
				projectId: state.projectId,
				baseRevision: 7,
				name: "pair",
				target: "jianying-desktop",
				projectsRoot: state.projectsRoot,
				run,
			}),
		).rejects.toMatchObject({ code: "artifact_conflict", status: 409 });

		expect((await readdir(exportsDirectory)).sort()).toEqual([reportName]);
	});

	test("distinguishes malformed project JSON from a missing project", async () => {
		const state = await fixture();
		await writeFile(path.join(state.projectDir, "project.json"), "{broken", "utf8");

		await expect(
			exportProjectFcpxml({
				projectId: state.projectId,
				baseRevision: 7,
				target: "jianying-desktop",
				projectsRoot: state.projectsRoot,
				run: async () => {
					throw new Error("must not run");
				},
			}),
		).rejects.toMatchObject({ code: "invalid_project", status: 422 });
	});

	test("waits for the shared project writer lock before publishing", async () => {
		const state = await fixture();
		let releaseLock!: () => void;
		let lockStarted!: () => void;
		const lockStartedPromise = new Promise<void>((resolve) => {
			lockStarted = resolve;
		});
		const releaseLockPromise = new Promise<void>((resolve) => {
			releaseLock = resolve;
		});
		const blocker = withProjectLock(state.projectId, async () => {
			lockStarted();
			await releaseLockPromise;
		});
		await lockStartedPromise;

		let settled = false;
		const exporting = exportProjectFcpxml({
			projectId: state.projectId,
			baseRevision: 7,
			name: "locked",
			target: "jianying-desktop",
			projectsRoot: state.projectsRoot,
			run: async () => ({
				document: '<?xml version="1.0"?><fcpxml version="1.10"/>',
				report: {
					schema: "moirai-cut.interchange-report.v1",
					issues: [],
				},
			}),
		}).then((result) => {
			settled = true;
			return result;
		});
		await new Promise<void>((resolve) => setTimeout(resolve, 10));
		expect(settled).toBe(false);

		releaseLock();
		await Promise.all([blocker, exporting]);
		expect(settled).toBe(true);
	});

	test("refuses a stale base revision before invoking Rust", async () => {
		const state = await fixture({ revision: 8 });
		let invoked = false;
		const run: InterchangeProcessRunner = async () => {
			invoked = true;
			throw new Error("must not run");
		};

		await expect(
			exportProjectFcpxml({
				projectId: state.projectId,
				baseRevision: 7,
				target: "jianying-desktop",
				projectsRoot: state.projectsRoot,
				run,
			}),
		).rejects.toMatchObject({
			code: "revision_conflict",
			status: 409,
			revision: 8,
		});
		expect(invoked).toBe(false);
	});

	test("refuses to publish artifacts if the project changes during generation", async () => {
		const state = await fixture();
		const run: InterchangeProcessRunner = async () => {
			await writeFile(
				path.join(state.projectDir, "project.json"),
				JSON.stringify({ ...state.document, revision: 8 }),
				"utf8",
			);
			return {
				document: '<?xml version="1.0"?><fcpxml version="1.10"/>',
				report: {
					schema: "moirai-cut.interchange-report.v1",
					source: { revision: 7 },
					issues: [],
				},
			};
		};
		await expect(
			exportProjectFcpxml({
				projectId: state.projectId,
				baseRevision: 7,
				target: "jianying-desktop",
				projectsRoot: state.projectsRoot,
				run,
			}),
		).rejects.toMatchObject({
			code: "revision_conflict",
			status: 409,
			revision: 8,
		});
		expect(
			await readdir(path.join(state.projectDir, "exports")).catch(() => []),
		).toEqual([]);
	});
});
