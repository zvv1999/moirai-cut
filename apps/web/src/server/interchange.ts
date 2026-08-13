import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
	access,
	mkdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withProjectLock } from "@/server/project-lock";

export type InterchangeTarget =
	"final-cut-pro" | "jianying-desktop" | "generic-nle";

export interface InterchangeIssue {
	code: string;
	severity: "info" | "degraded" | "omitted";
	message?: string;
	trackId?: string;
	elementId?: string;
}

export interface InterchangeReport {
	schema: string;
	source?: Record<string, unknown>;
	adapter?: Record<string, unknown>;
	issues: InterchangeIssue[];
	relink?: Record<string, unknown>;
}

export interface InterchangeProcessRequest {
	command: "export-fcpxml";
	project: Record<string, unknown>;
	mediaIndex: Record<string, unknown>;
	mediaRoot: string;
	options: {
		expectedRevision: number;
		sceneId?: string;
		version: "1.10";
		target: InterchangeTarget;
	};
}

export interface InterchangeProcessResult {
	document: string;
	report: InterchangeReport;
}

export type InterchangeProcessRunner = (
	request: InterchangeProcessRequest,
) => Promise<InterchangeProcessResult>;

export interface ProjectFcpxmlExportResult {
	projectId: string;
	revision: number;
	currentRevision: number;
	stable: boolean;
	name: string;
	path: string;
	downloadUrl: string;
	reportName: string;
	reportPath: string;
	reportDownloadUrl: string;
	report: InterchangeReport;
}

export class InterchangeServiceError extends Error {
	readonly code: string;
	readonly status: number;
	readonly revision?: number;

	constructor(
		message: string,
		{
			code = "interchange_failed",
			status = 400,
			revision,
		}: { code?: string; status?: number; revision?: number } = {},
	) {
		super(message);
		this.name = "InterchangeServiceError";
		this.code = code;
		this.status = status;
		this.revision = revision;
	}
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_EXT = /^[A-Za-z0-9]{1,8}$/;
const FALLBACK_NAME = "moirai-cut";
const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	"..",
	"..",
);

function defaultProjectsRoot(): string {
	return (
		process.env.OPENCUT_PROJECTS_DIR?.trim() ||
		path.join(homedir(), "OpenCutProjects")
	);
}

function projectDirectory(projectsRoot: string, projectId: string): string {
	if (!SAFE_ID.test(projectId)) {
		throw new InterchangeServiceError(
			`Unsafe project id: ${JSON.stringify(projectId)}`,
			{ code: "invalid_project_id" },
		);
	}
	return path.join(projectsRoot, projectId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function revisionOf(document: Record<string, unknown>): number {
	return typeof document.revision === "number" &&
		Number.isInteger(document.revision)
		? document.revision
		: 0;
}

function titleOf(document: Record<string, unknown>): string {
	const metadata = isRecord(document.metadata) ? document.metadata : null;
	return typeof metadata?.name === "string" && metadata.name.trim()
		? metadata.name
		: FALLBACK_NAME;
}

function safeExportStem(value: string): string {
	const stem = value
		.normalize("NFC")
		// Keep this in lockstep with the export download route: Unicode letters,
		// numbers, underscore, dot, and dash are the complete routable alphabet.
		.replace(/[^\p{L}\p{N}_.-]+/gu, "-")
		.replace(/-+/g, "-")
		.replace(/^[.-]+|[.-]+$/g, "")
		.slice(0, 110);
	return stem || FALLBACK_NAME;
}

async function readJsonFile(
	file: string,
	{ missing = null }: { missing?: Record<string, unknown> | null } = {},
): Promise<Record<string, unknown>> {
	try {
		const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
		if (!isRecord(parsed)) {
			throw new InterchangeServiceError(`${file} must contain a JSON object`, {
				code: "invalid_project",
			});
		}
		return parsed;
	} catch (error) {
		if (missing !== null && isRecord(error) && error.code === "ENOENT") {
			return missing;
		}
		if (error instanceof InterchangeServiceError) throw error;
		throw new InterchangeServiceError(
			`Cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`,
			{ code: "project_not_found", status: 404 },
		);
	}
}

function validateMediaIndex(index: Record<string, unknown>): void {
	for (const [assetId, raw] of Object.entries(index)) {
		if (!SAFE_ID.test(assetId) || !isRecord(raw)) {
			throw new InterchangeServiceError(
				`Invalid media index entry: ${assetId}`,
				{ code: "invalid_media_index" },
			);
		}
		if (typeof raw.ext !== "string" || !SAFE_EXT.test(raw.ext)) {
			throw new InterchangeServiceError(
				`Media ${assetId} has an unsafe extension`,
				{ code: "invalid_media_index" },
			);
		}
	}
}

async function publishArtifactPair({
	xmlPath,
	xml,
	reportPath,
	report,
}: {
	xmlPath: string;
	xml: string;
	reportPath: string;
	report: string;
}): Promise<void> {
	const xmlTemporary = path.join(path.dirname(xmlPath), `.${randomUUID()}.tmp`);
	const reportTemporary = path.join(
		path.dirname(reportPath),
		`.${randomUUID()}.tmp`,
	);
	let xmlPublished = false;
	let reportPublished = false;
	try {
		await Promise.all([
			writeFile(xmlTemporary, xml, "utf8"),
			writeFile(reportTemporary, report, "utf8"),
		]);
		await rename(xmlTemporary, xmlPath);
		xmlPublished = true;
		await rename(reportTemporary, reportPath);
		reportPublished = true;
	} catch (error) {
		await Promise.allSettled([
			xmlPublished ? rm(xmlPath, { force: true }) : Promise.resolve(),
			reportPublished ? rm(reportPath, { force: true }) : Promise.resolve(),
		]);
		throw error;
	} finally {
		await Promise.allSettled([
			rm(xmlTemporary, { force: true }),
			rm(reportTemporary, { force: true }),
		]);
	}
}

function executableCandidates(): string[] {
	const configured = process.env.MOIRAI_INTERCHANGE_BIN?.trim();
	return configured ? [configured] : [];
}

async function existingBinary(): Promise<string | null> {
	for (const candidate of executableCandidates()) {
		try {
			await access(candidate, constants.X_OK);
			return candidate;
		} catch {
			// Try the next known local build location.
		}
	}
	return null;
}

function cargoNames(): string[] {
	return process.platform === "win32" ? ["cargo.exe", "cargo"] : ["cargo"];
}

function cargoCandidates(): string[] {
	const configured = process.env.MOIRAI_CARGO_BIN?.trim();
	if (configured) return [configured];
	const fromPath = (process.env.PATH ?? "")
		.split(path.delimiter)
		.filter(Boolean)
		.flatMap((directory) =>
			cargoNames().map((name) => path.join(directory, name)),
		);
	return [
		...fromPath,
		...cargoNames().map((name) => path.join(homedir(), ".cargo", "bin", name)),
	];
}

async function existingCargo(): Promise<string | null> {
	for (const candidate of cargoCandidates()) {
		try {
			await access(candidate, constants.X_OK);
			return candidate;
		} catch {
			// Try the next explicit, PATH, or rustup-default cargo location.
		}
	}
	return null;
}

interface ProcessEnvelope {
	ok: boolean;
	data?: InterchangeProcessResult;
	error?: { code?: string; message?: string };
}

async function executeProcess(
	command: string,
	args: string[],
	request: InterchangeProcessRequest,
): Promise<InterchangeProcessResult> {
	return new Promise((resolve, reject) => {
		const child = execFile(
			command,
			args,
			{
				cwd: REPO_ROOT,
				maxBuffer: 64 * 1024 * 1024,
				timeout: 120_000,
			},
			(error, stdout, stderr) => {
				let envelope: ProcessEnvelope | null = null;
				try {
					envelope = JSON.parse(stdout) as ProcessEnvelope;
				} catch {
					// The message below carries bounded stderr for local diagnosis.
				}
				if (!envelope?.ok || !envelope.data) {
					reject(
						new InterchangeServiceError(
							envelope?.error?.message ||
								stderr.trim().slice(0, 2_000) ||
								error?.message ||
								"Rust interchange process failed",
							{ code: envelope?.error?.code ?? "interchange_process_failed" },
						),
					);
					return;
				}
				resolve(envelope.data);
			},
		);
		child.stdin?.end(JSON.stringify(request));
	});
}

export const runInterchangeProcess: InterchangeProcessRunner = async (
	request,
) => {
	const binary = await existingBinary();
	if (binary) return executeProcess(binary, [], request);
	if (process.env.MOIRAI_INTERCHANGE_BIN?.trim()) {
		throw new InterchangeServiceError(
			`MOIRAI_INTERCHANGE_BIN does not point to an executable: ${process.env.MOIRAI_INTERCHANGE_BIN}. Build it with \`cargo build --release -p interchange --bin moirai-interchange\`, then set MOIRAI_INTERCHANGE_BIN to that absolute path.`,
			{ code: "interchange_runtime_missing", status: 503 },
		);
	}

	const manifest = path.join(REPO_ROOT, "Cargo.toml");
	const crateManifest = path.join(
		REPO_ROOT,
		"rust",
		"crates",
		"interchange",
		"Cargo.toml",
	);
	try {
		await Promise.all([access(manifest), access(crateManifest)]);
	} catch {
		throw new InterchangeServiceError(
			"No packaged Rust interchange binary is configured. Build `moirai-interchange` and set MOIRAI_INTERCHANGE_BIN to its absolute path.",
			{ code: "interchange_runtime_missing", status: 503 },
		);
	}
	const cargo = await existingCargo();
	if (!cargo) {
		const configuredCargo = process.env.MOIRAI_CARGO_BIN?.trim();
		throw new InterchangeServiceError(
			configuredCargo
				? `MOIRAI_CARGO_BIN does not point to an executable: ${configuredCargo}. Fix it or install Rust with rustup. Then run \`cargo build --release -p interchange --bin moirai-interchange\`.`
				: "Rust Cargo was not found. Install Rust with rustup, or set MOIRAI_CARGO_BIN. Then run `cargo build --release -p interchange --bin moirai-interchange` and set MOIRAI_INTERCHANGE_BIN to the built executable for packaged use.",
			{ code: "interchange_runtime_missing", status: 503 },
		);
	}
	return executeProcess(
		cargo,
		[
			"run",
			"--quiet",
			"--manifest-path",
			crateManifest,
			"--bin",
			"moirai-interchange",
		],
		request,
	);
};

export async function exportProjectFcpxml({
	projectId,
	baseRevision,
	name,
	sceneId,
	target,
	projectsRoot = defaultProjectsRoot(),
	run = runInterchangeProcess,
}: {
	projectId: string;
	baseRevision: number;
	name?: string;
	sceneId?: string;
	target: InterchangeTarget;
	projectsRoot?: string;
	run?: InterchangeProcessRunner;
}): Promise<ProjectFcpxmlExportResult> {
	if (!Number.isInteger(baseRevision) || baseRevision < 0) {
		throw new InterchangeServiceError(
			"baseRevision must be a non-negative integer",
			{
				code: "interchange_request_invalid",
			},
		);
	}
	return withProjectLock(projectId, () =>
		exportProjectFcpxmlLocked({
			projectId,
			baseRevision,
			name,
			sceneId,
			target,
			projectsRoot,
			run,
		}),
	);
}

async function exportProjectFcpxmlLocked({
	projectId,
	baseRevision,
	name,
	sceneId,
	target,
	projectsRoot,
	run,
}: {
	projectId: string;
	baseRevision: number;
	name?: string;
	sceneId?: string;
	target: InterchangeTarget;
	projectsRoot: string;
	run: InterchangeProcessRunner;
}): Promise<ProjectFcpxmlExportResult> {
	const directory = projectDirectory(projectsRoot, projectId);
	const projectFile = path.join(directory, "project.json");
	const mediaRoot = path.join(directory, "media");
	const [project, mediaIndex] = await Promise.all([
		readJsonFile(projectFile),
		readJsonFile(path.join(mediaRoot, "index.json"), { missing: {} }),
	]);
	const revision = revisionOf(project);
	if (revision !== baseRevision) {
		throw new InterchangeServiceError(
			`Project ${projectId} is at revision ${revision}, not ${baseRevision}. Re-read it before exporting.`,
			{ code: "revision_conflict", status: 409, revision },
		);
	}
	validateMediaIndex(mediaIndex);

	const generated = await run({
		command: "export-fcpxml",
		project,
		mediaIndex,
		mediaRoot,
		options: {
			expectedRevision: revision,
			...(sceneId ? { sceneId } : {}),
			version: "1.10",
			target,
		},
	});
	if (
		!generated.document.startsWith("<?xml") ||
		generated.report.schema !== "moirai-cut.interchange-report.v1"
	) {
		throw new InterchangeServiceError(
			"Rust interchange returned an invalid export envelope",
			{ code: "interchange_process_failed" },
		);
	}

	// Export is a derived artifact of one exact saved revision. The Rust process
	// can take long enough for an autosave or agent edit to land after the first
	// check; re-read immediately before publication so a stale snapshot never
	// appears in exports/ as a successful handoff.
	const currentProject = await readJsonFile(projectFile);
	const currentRevision = revisionOf(currentProject);
	if (currentRevision !== revision) {
		throw new InterchangeServiceError(
			`Project ${projectId} changed from revision ${revision} to ${currentRevision} while FCPXML was being generated. Re-read it and export again.`,
			{
				code: "revision_conflict",
				status: 409,
				revision: currentRevision,
			},
		);
	}

	const exportsDirectory = path.join(directory, "exports");
	await mkdir(exportsDirectory, { recursive: true });
	const stem = `${safeExportStem(name?.trim() || titleOf(project))}-r${revision}`;
	const xmlName = `${stem}.fcpxml`;
	const reportName = `${stem}.interchange-report.json`;
	const xmlPath = path.join(exportsDirectory, xmlName);
	const reportPath = path.join(exportsDirectory, reportName);
	await publishArtifactPair({
		xmlPath,
		xml: generated.document,
		reportPath,
		report: `${JSON.stringify(generated.report, null, 2)}\n`,
	});

	return {
		projectId,
		revision,
		currentRevision,
		stable: true,
		name: xmlName,
		path: xmlPath,
		downloadUrl: `/api/exports/${encodeURIComponent(projectId)}/${encodeURIComponent(xmlName)}`,
		reportName,
		reportPath,
		reportDownloadUrl: `/api/exports/${encodeURIComponent(projectId)}/${encodeURIComponent(reportName)}`,
		report: generated.report,
	};
}
