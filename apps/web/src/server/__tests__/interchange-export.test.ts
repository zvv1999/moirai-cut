import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	InterchangeServiceError,
	exportProjectFcpxml,
	type InterchangeProcessRunner,
} from "@/server/interchange";

const temporaryRoots: string[] = [];

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
	await Promise.all(
		temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
	);
});

describe("project FCPXML export service", () => {
	test("writes XML and its report atomically without changing the project revision", async () => {
		const state = await fixture();
		const run: InterchangeProcessRunner = async (request) => ({
			document: "<?xml version=\"1.0\"?><fcpxml version=\"1.10\"/>",
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
		expect(result.reportName).toBe(
			"剪映-交接-r7.interchange-report.json",
		);
		expect(await readFile(result.path, "utf8")).toContain("<fcpxml");
		expect(JSON.parse(await readFile(result.reportPath, "utf8"))).toEqual(
			result.report,
		);
		expect(
			JSON.parse(await readFile(path.join(state.projectDir, "project.json"), "utf8"))
				.revision,
		).toBe(7);
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
		).rejects.toMatchObject<Partial<InterchangeServiceError>>({
			code: "revision_conflict",
			status: 409,
			revision: 8,
		});
		expect(invoked).toBe(false);
	});

	test("marks the artifact unstable if the project changes during generation", async () => {
		const state = await fixture();
		const run: InterchangeProcessRunner = async () => {
			await writeFile(
				path.join(state.projectDir, "project.json"),
				JSON.stringify({ ...state.document, revision: 8 }),
				"utf8",
			);
			return {
				document: "<fcpxml version=\"1.10\"/>",
				report: {
					schema: "moirai-cut.interchange-report.v1",
					source: { revision: 7 },
					issues: [],
				},
			};
		};
		const result = await exportProjectFcpxml({
			projectId: state.projectId,
			baseRevision: 7,
			target: "jianying-desktop",
			projectsRoot: state.projectsRoot,
			run,
		});
		expect(result.stable).toBe(false);
		expect(result.currentRevision).toBe(8);
	});
});
