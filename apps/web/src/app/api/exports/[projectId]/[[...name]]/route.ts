import { NextResponse } from "next/server";
import {
	mkdir,
	readdir,
	readFile,
	rename,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Where finished exports land.
 *
 * The encode happens in the browser (WebCodecs), so the bytes start life as a
 * Blob in the page. Handing tens of megabytes back through CDP as base64 would
 * be slow and memory-hungry at both ends; the page uploads here instead, and a
 * Node caller just reads the file. The agent gets a path, not a payload.
 */

const PROJECTS_ROOT =
	process.env.OPENCUT_PROJECTS_DIR ?? path.join(homedir(), "OpenCutProjects");
// Unicode letters allowed — export names carry project titles in any language.
// "." is in the set, so ".." would pass the regex: refuse dot-only names
// explicitly, or the name joins to the parent directory.
const SAFE = /^[\p{L}\p{N}_.-]{1,160}$/u;
const isSafeName = (value: string) => SAFE.test(value) && !/^\.+$/.test(value);

function exportsDir(projectId: string): string {
	if (!isSafeName(projectId))
		throw new Error(`Unsafe project id: ${JSON.stringify(projectId)}`);
	return path.join(PROJECTS_ROOT, projectId, "exports");
}

type Context = { params: Promise<{ projectId: string; name?: string[] }> };

const failed = ({ error, status = 400 }: { error: unknown; status?: number }) =>
	NextResponse.json(
		{ error: error instanceof Error ? error.message : String(error) },
		{ status },
	);

function hasErrorCode({
	error,
	code,
}: {
	error: unknown;
	code: string;
}): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === code
	);
}

export async function GET(_request: Request, { params }: Context) {
	const { projectId, name } = await params;
	try {
		const dir = exportsDir(projectId);
		if (!name || name.length === 0) {
			const entries = await readdir(dir).catch((error) => {
				if (hasErrorCode({ error, code: "ENOENT" })) return [];
				throw error;
			});
			const files = [];
			for (const entry of entries) {
				if (entry.startsWith(".")) continue;
				const info = await stat(path.join(dir, entry));
				files.push({
					name: entry,
					path: path.join(dir, entry),
					sizeBytes: info.size,
				});
			}
			return NextResponse.json({ dir, files });
		}
		const target = name[0];
		if (!isSafeName(target)) {
			return failed({ error: new Error("Unsafe export name") });
		}
		const file = path.join(dir, target);
		const info = await stat(file);
		return new NextResponse(new Uint8Array(await readFile(file)), {
			headers: {
				"content-type": "application/octet-stream",
				"content-length": String(info.size),
			},
		});
	} catch (error) {
		if (hasErrorCode({ error, code: "ENOENT" })) {
			return NextResponse.json({ error: "Not found" }, { status: 404 });
		}
		return failed({ error });
	}
}

export async function PUT(request: Request, { params }: Context) {
	const { projectId, name } = await params;
	try {
		const target = name?.[0];
		if (!target || !isSafeName(target))
			return failed({ error: new Error("PUT requires a safe export name") });
		const dir = exportsDir(projectId);
		await mkdir(dir, { recursive: true });
		// Write-then-rename so a caller polling the directory never sees a
		// half-uploaded file and mistakes it for a finished export.
		const temporary = path.join(dir, `.${randomUUID()}.tmp`);
		await writeFile(temporary, Buffer.from(await request.arrayBuffer()));
		const final = path.join(dir, target);
		await rename(temporary, final);
		const info = await stat(final);
		return NextResponse.json({ ok: true, path: final, sizeBytes: info.size });
	} catch (error) {
		return failed({ error });
	}
}

export async function DELETE(_request: Request, { params }: Context) {
	const { projectId, name } = await params;
	try {
		const target = name?.[0];
		if (name?.length !== 1 || !target || !isSafeName(target)) {
			return failed({ error: new Error("DELETE requires a safe export name") });
		}
		const file = path.join(exportsDir(projectId), target);
		await unlink(file);
		return NextResponse.json({ ok: true, name: target });
	} catch (error) {
		if (hasErrorCode({ error, code: "ENOENT" })) {
			return NextResponse.json({ error: "Not found" }, { status: 404 });
		}
		return failed({ error });
	}
}
