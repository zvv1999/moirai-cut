import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { buildNewProjectDocument } from "./document.mjs";
import { readProject, writeProject } from "./project-file.mjs";

async function request(base, route, init) {
	const response = await fetch(base + route, init);
	if (!response.ok)
		throw new Error(
			`Template preparation ${response.status}: ${(await response.text()).slice(0, 700)}`,
		);
	return response;
}
async function native(base, route, body) {
	return (
		await request(base, `/api/footage/templates${route}`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-requested-with": "moirai-footage",
			},
			body: JSON.stringify(body),
		})
	).json();
}
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function ensureProject(base, document) {
	const projectId = document.metadata.id;
	let current;
	try {
		current = await readProject({ projectId, base });
	} catch (error) {
		if (error.code !== "not_found") throw error;
	}
	if (!current) {
		try {
			await writeProject({ projectId, document, baseRevision: 0, base });
		} catch (error) {
			if (error.code !== "revision_conflict") throw error;
		}
		current = await readProject({ projectId, base });
	}
	if (!isDeepStrictEqual(current, document)) {
		throw new Error(
			`Prepared project changed: ${projectId}. Use a new authoring key; existing edits were preserved.`,
		);
	}
}

async function copyInput(base, projectId, source) {
	const { metadata, sha256, mediaPath } = source;
	const collection = `/api/media/${encodeURIComponent(projectId)}`;
	const route = `${collection}/${encodeURIComponent(metadata.id)}`;
	const { assets } = await (await request(base, collection)).json();
	const existing = assets?.[metadata.id];
	if (existing) {
		// A byte upload interrupted before PATCH leaves precisely this transport stub.
		const stub =
			Object.keys(existing).every((key) => ["ext", "mimeType"].includes(key)) &&
			existing.ext === metadata.ext &&
			existing.mimeType === metadata.mimeType;
		if (
			!stub &&
			!Object.keys(metadata).every((key) =>
				isDeepStrictEqual(existing[key], metadata[key]),
			)
		) {
			throw new Error(
				`Prepared media metadata changed: ${projectId}/${metadata.id}`,
			);
		}
		const bytes = await (await request(base, route)).arrayBuffer();
		if (hash(Buffer.from(bytes)) !== sha256)
			throw new Error(`Prepared media is corrupt: ${projectId}/${metadata.id}`);
		if (!stub) return;
	} else {
		const bytes = Buffer.from(
			await (await request(base, mediaPath)).arrayBuffer(),
		);
		if (hash(bytes) !== sha256)
			throw new Error(`Input hash mismatch: ${source.inputId}`);
		await request(base, `${route}?ext=${encodeURIComponent(metadata.ext)}`, {
			method: "PUT",
			headers: { "content-type": metadata.mimeType },
			body: bytes,
		});
	}
	await request(base, route, {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ action: "merge", value: metadata }),
	});
}

// Rust authors and pins every document/input. This adapter only serializes the
// platform's empty project and materializes native snapshots through CAS/HTTP.
export async function produceTemplates({
	request: input,
	base = process.env.OPENCUT_BASE_URL ?? "http://127.0.0.1:3000",
}) {
	const draft = await native(base, "/production/prepare", {
		request: input,
		documentPrototype: buildNewProjectDocument({
			name: "Template Production / prototype",
		}),
	});
	if (draft.batch)
		return { ...draft.batch, preparationId: draft.id, deduplicated: true };
	let projects = 0;
	for (const item of draft.manifest.items) {
		for (const fixture of item.fixtures) {
			await ensureProject(base, fixture.document);
			for (const source of draft.assets) {
				if (fixture.media[source.metadata.id])
					await copyInput(base, fixture.document.metadata.id, source);
			}
			projects++;
		}
	}
	const batch = await native(base, "/production", draft.manifest);
	return {
		...batch,
		preparationId: draft.id,
		preparedProjects: projects,
		sampleWarnings: draft.warnings,
	};
}
