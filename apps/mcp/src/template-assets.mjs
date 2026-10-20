import { createHash } from "node:crypto";

async function request(base, route, init) {
	const response = await fetch(base + route, init);
	if (!response.ok)
		throw new Error(
			`Template asset transport ${response.status}: ${(await response.text()).slice(0, 500)}`,
		);
	return response;
}

// Rust selects assets and owns their immutable metadata; this only copies verified
// bytes into the editor's project media store before compilation.
export async function materializeTemplateAssets({
	projectId,
	template,
	bindings = [],
	visualBindings = [],
	base,
}) {
	if (
		![
			...(template?.resourceBindings ?? []),
			...bindings,
			...visualBindings,
		].some((b) => (b.assetId ?? b.mediaId ?? "").startsWith("visual-"))
	)
		return {};
	if (
		typeof projectId !== "string" ||
		!/^[A-Za-z0-9_-]{1,128}$/.test(projectId)
	)
		throw new Error("Valid target project required");
	const project = await (
		await request(base, `/api/projects/${encodeURIComponent(projectId)}`)
	).json();
	if (project?.metadata?.id !== projectId)
		throw new Error("Target project does not exist");
	const response = await request(
		base,
		"/api/footage/templates/assets/resolve",
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-requested-with": "moirai-footage",
			},
			body: JSON.stringify({ template, bindings, visualBindings }),
		},
	);
	const { assets } = await response.json();
	const index = await (
		await request(base, `/api/media/${encodeURIComponent(projectId)}`)
	).json();
	const materialized = {};
	for (const { asset, metadata, mediaPath } of assets) {
		const route = `/api/media/${encodeURIComponent(projectId)}/${encodeURIComponent(asset.id)}`;
		const existing = index.assets?.[asset.id];
		if (existing) {
			// PUT may finish before its metadata PATCH. Recover only the exact
			// upload stub, after checking the project bytes against Rust's digest.
			const uploadStub =
				Object.keys(existing).every((key) => ["ext", "mimeType"].includes(key)) &&
				existing.ext === metadata.ext &&
				existing.mimeType === metadata.mimeType;
			if (!uploadStub && existing.templateAsset?.sha256 !== asset.sha256)
				throw new Error(`Shared asset ID collision: ${asset.id}`);
			for (const key of [
				"type",
				"ext",
				"width",
				"height",
				"duration",
				"size",
				"mimeType",
				"hasAudio",
				"tags",
			]) {
				if (!uploadStub && JSON.stringify(existing[key]) !== JSON.stringify(metadata[key]))
					throw new Error(`Shared asset metadata changed: ${asset.id}/${key}`);
			}
			const current = await fetch(base + route);
			if (
				current.ok &&
				createHash("sha256")
					.update(Buffer.from(await current.arrayBuffer()))
					.digest("hex") === asset.sha256
			) {
				if (uploadStub)
					await request(base, route, {
						method: "PATCH",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							action: "merge", value: metadata,
							expectedUpload: { ext: metadata.ext, mimeType: metadata.mimeType, sha256: asset.sha256 },
						}),
					});
				materialized[asset.id] = metadata;
				continue;
			}
			throw new Error(
				`Project copy of shared asset is missing or corrupt: ${asset.id}`,
			);
		}
		const bytes = Buffer.from(
			await (await request(base, mediaPath)).arrayBuffer(),
		);
		if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256)
			throw new Error(`Shared asset hash mismatch: ${asset.id}`);
		await request(base, route + `?ext=${encodeURIComponent(metadata.ext)}`, {
			method: "PUT",
			headers: { "content-type": metadata.mimeType },
			body: bytes,
		});
		await request(base, route, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ action: "merge", value: metadata }),
		});
		materialized[asset.id] = metadata;
	}
	return materialized;
}

export async function prepareProductionAssets(requestBody, base) {
	const request = structuredClone(requestBody);
	for (const item of request.items ?? [])
		for (const fixture of item.fixtures ?? []) {
			const assets = await materializeTemplateAssets({
				projectId: fixture.document?.metadata?.id,
				template: item.template,
				bindings: fixture.input?.resourceBindings,
				visualBindings: fixture.visualBindings,
				base,
			});
			if (Object.keys(assets).length)
				fixture.media = { ...fixture.media, ...assets };
		}
	return request;
}
