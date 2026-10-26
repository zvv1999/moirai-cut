import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import {
	cancelProjectExport,
	finishProjectExport,
	installProjectDraft,
	listProjectExports,
	projectExportArchive,
	prepareProjectExport,
	uploadProjectExportPart,
} from "@/server/project-interchange";
import {
	PROJECT_EXPORT_TARGETS,
	type ProjectExportTarget,
} from "@/export/project-interchange";

export const runtime = "nodejs";
type Context = { params: Promise<{ projectId: string }> };
const failed = (error: unknown) =>
	NextResponse.json(
		{ error: error instanceof Error ? error.message : String(error) },
		{ status: 400 },
	);

export async function POST(request: Request, { params }: Context) {
	try {
		const { projectId } = await params;
		const raw = await request.text();
		if (raw.length > 32 * 1024 * 1024)
			throw new Error("Export request too large");
		const body = JSON.parse(raw);
		if (!body || typeof body !== "object") throw new Error("Invalid request");
		if (
			body.action === "prepare" &&
			typeof body.target === "string" &&
			Object.hasOwn(PROJECT_EXPORT_TARGETS, body.target)
		) {
			return NextResponse.json({
				data: await prepareProjectExport({
					projectId,
					target: body.target as ProjectExportTarget,
					project: body.project,
					signal: request.signal,
				}),
			});
		}
		if (body.action === "finish" && typeof body.id === "string")
			return NextResponse.json({
				data: await finishProjectExport({
					projectId,
					id: body.id,
					signal: request.signal,
				}),
			});
		if (body.action === "install" && typeof body.id === "string")
			return NextResponse.json({
				data: await installProjectDraft({ projectId, id: body.id }),
			});
		throw new Error("Unknown export action or format");
	} catch (error) {
		return failed(error);
	}
}

export async function GET(request: Request, { params }: Context) {
	try {
		const { projectId } = await params;
		const query = new URL(request.url).searchParams;
		if (query.get("download") === "1") {
			const archive = await projectExportArchive(
				projectId,
				query.get("id") ?? "",
			);
			return new Response(
				Readable.toWeb(
					createReadStream(archive.filePath),
				) as unknown as ReadableStream<Uint8Array>,
				{
					headers: {
						"content-type": "application/zip",
						"content-length": String(archive.size),
						"content-disposition": `attachment; filename="${archive.name}"`,
					},
				},
			);
		}
		return NextResponse.json({
			data: await listProjectExports(projectId),
		});
	} catch (error) {
		return failed(error);
	}
}

export async function PUT(request: Request, { params }: Context) {
	try {
		const { projectId } = await params;
		const query = new URL(request.url).searchParams;
		const declared = Number(request.headers.get("content-length") ?? 0);
		if (declared > 256 * 1024 * 1024) throw new Error("Render part too large");
		if (!query.has("frame")) throw new Error("Missing frame number");
		await uploadProjectExportPart({
			projectId,
			id: query.get("id") ?? "",
			bakeId: query.get("bake") ?? "",
			frame: Number(query.get("frame")),
			bytes: new Uint8Array(await request.arrayBuffer()),
		});
		return NextResponse.json({ ok: true });
	} catch (error) {
		return failed(error);
	}
}

export async function DELETE(request: Request, { params }: Context) {
	try {
		const { projectId } = await params;
		await cancelProjectExport(
			projectId,
			new URL(request.url).searchParams.get("id") ?? "",
		);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return failed(error);
	}
}
